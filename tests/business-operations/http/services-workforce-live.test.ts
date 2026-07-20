import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";
import {
  createBusinessOperationsFixture,
  futureDate,
  resetBusinessOperationsTestData,
} from "../helpers/business-operations-fixture";

const baseUrl = process.env.COMMERCE_HTTP_BASE_URL;

function decodeHtml(value: string) {
  return value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function attribute(element: string, name: string) {
  return decodeHtml(element.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "");
}

function forms(html: string) {
  return html.match(/<form\b[\s\S]*?<\/form>/g) ?? [];
}

function formParams(form: string) {
  const parameters = new URLSearchParams();
  for (const input of form.match(/<input\b[^>]*>/g) ?? []) {
    const name = attribute(input, "name");
    if (!name || (input.includes('type="checkbox"') && !input.includes(" checked"))) continue;
    parameters.append(name, attribute(input, "value"));
  }
  return parameters;
}

async function signUp(label: string) {
  const email = `stage2b-${label}-${randomUUID().slice(0, 8)}@rezno.invalid`;
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email, name: label, password: "password123" }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie);
  return {
    cookie: cookie.split(";")[0]!,
    email,
    person: await prisma.person.update({
      where: { authUserId: payload.user.id },
      data: { isOnboarded: true, phone: "+9647500000020", status: "ACTIVE" },
    }),
  };
}

function activeCookie(sessionCookie: string, organizationId: string) {
  return `${sessionCookie}; rezno-active-business-id=${organizationId}`;
}

async function page(path: string, cookie?: string) {
  return fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : undefined, redirect: "manual" });
}

async function rscPage(path: string, cookie: string) {
  return fetch(`${baseUrl}${path}`, {
    headers: {
      accept: "text/x-component",
      cookie,
      rsc: "1",
    },
    redirect: "manual",
  });
}

async function submit(path: string, form: string, mutate: (parameters: URLSearchParams) => void, cookie: string) {
  const parameters = formParams(form);
  mutate(parameters);
  const body = new FormData();
  for (const [key, value] of parameters) body.append(key, value);
  const response = await fetch(`${baseUrl}${path}`, {
    body,
    headers: { cookie, origin: baseUrl!, referer: `${baseUrl}${path}` },
    method: "POST",
    redirect: "manual",
  });
  assert.ok([200, 303].includes(response.status), `Unexpected action status ${response.status}`);
  await response.body?.cancel();
}

test("Stage 2B live Business Web pages and Server Actions enforce real role and tenant boundaries", {
  concurrency: false,
  skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live Stage 2B tests",
}, async (t) => {
  await resetBusinessOperationsTestData();
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await resetBusinessOperationsTestData();
    await prisma.$disconnect();
  });
  const fixture = await createBusinessOperationsFixture("stage2b-http");
  await prisma.organization.updateMany({
    where: { id: { in: [fixture.organizationA.id, fixture.organizationB.id] } },
    data: { vertical: "BEAUTY" },
  });
  const session = await signUp("owner");
  await prisma.organizationMember.updateMany({
    where: { id: { in: [fixture.owner.membership.id, fixture.ownerB.membership.id] } },
    data: { personId: session.person.id },
  });
  const ownerCookie = activeCookie(session.cookie, fixture.organizationA.id);

  await t.test("Owner creates/replays a Service and forged stale-tenant form cannot mutate", async () => {
    const response = await page("/business/services", ownerCookie);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp(fixture.organizationA.name));
    const form = forms(html).find((candidate) => candidate.includes('name="name"') && candidate.includes('name="categoryId"') && !candidate.includes('name="expectedVersion"'));
    assert.ok(form, "Service create form not rendered");
    const mutate = (parameters: URLSearchParams) => {
      parameters.set("name", "HTTP Operational Service");
      parameters.set("description", "Created through the real Server Action");
      parameters.set("categoryId", fixture.category.id);
      parameters.set("staffSelectionMode", "OPTIONAL");
    };
    await submit("/business/services", form, mutate, ownerCookie);
    await submit("/business/services", form, mutate, ownerCookie);
    assert.equal(await prisma.service.count({ where: { organizationId: fixture.organizationA.id, name: "HTTP Operational Service" } }), 1);
    assert.equal(await prisma.businessAuditLog.count({ where: { action: "SERVICE_CREATE", organizationId: fixture.organizationA.id } }), 1);

    const foreignCookie = activeCookie(session.cookie, fixture.organizationB.id);
    const beforeA = await prisma.service.count({ where: { organizationId: fixture.organizationA.id } });
    const beforeB = await prisma.service.count({ where: { organizationId: fixture.organizationB.id } });
    await submit("/business/services", form, (parameters) => {
      mutate(parameters);
      parameters.set("idempotencyKey", randomUUID());
      parameters.set("name", "Forged stale organization");
    }, foreignCookie);
    assert.equal(await prisma.service.count({ where: { organizationId: fixture.organizationA.id } }), beforeA);
    assert.equal(await prisma.service.count({ where: { organizationId: fixture.organizationB.id } }), beforeB);
  });

  await t.test("Manager can create Service while Receptionist and Staff remain read-only", async () => {
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.manager.membership.roleId } });
    let html = await (await page("/business/services", ownerCookie)).text();
    let form = forms(html).find((candidate) => candidate.includes('name="name"') && !candidate.includes('name="expectedVersion"'));
    assert.ok(form);
    await submit("/business/services", form, (parameters) => {
      parameters.set("name", "Manager HTTP Service");
      parameters.set("description", "Manager");
      parameters.set("categoryId", fixture.category.id);
      parameters.set("staffSelectionMode", "NONE");
    }, ownerCookie);
    assert.equal(await prisma.service.count({ where: { organizationId: fixture.organizationA.id, name: "Manager HTTP Service" } }), 1);
    for (const roleId of [fixture.receptionist.membership.roleId, fixture.staff.membership.roleId]) {
      await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId } });
      html = await (await page("/business/services", ownerCookie)).text();
      form = forms(html).find((candidate) => candidate.includes('name="name"') && !candidate.includes('name="expectedVersion"'));
      assert.equal(form, undefined);
    }
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.owner.membership.roleId } });
  });

  await t.test("production HTML and RSC responses contain only the role-scoped Service catalog DTO", async () => {
    const suffix = randomUUID().slice(0, 8);
    const staffBranchName = `HTTP_STAFF_BRANCH_${suffix}`;
    const unassignedBranchName = `HTTP_UNASSIGNED_BRANCH_${suffix}`;
    const inactiveBranchName = `HTTP_INACTIVE_BRANCH_${suffix}`;
    const deletedBranchName = `HTTP_DELETED_BRANCH_${suffix}`;
    const unavailableBranchName = `HTTP_UNAVAILABLE_BRANCH_${suffix}`;
    const foreignBranchName = `HTTP_FOREIGN_BRANCH_${suffix}`;
    const [staffBranch, unassignedBranch, deletedBranch, unavailableBranch] = await Promise.all([
      prisma.branch.create({ data: { name: staffBranchName, organizationId: fixture.organizationA.id, slug: `http-staff-${suffix}`, status: "ACTIVE" } }),
      prisma.branch.create({ data: { name: unassignedBranchName, organizationId: fixture.organizationA.id, slug: `http-unassigned-${suffix}`, status: "ACTIVE" } }),
      prisma.branch.create({ data: { deletedAt: new Date(), name: deletedBranchName, organizationId: fixture.organizationA.id, slug: `http-deleted-${suffix}`, status: "ACTIVE" } }),
      prisma.branch.create({ data: { name: unavailableBranchName, organizationId: fixture.organizationA.id, slug: `http-unavailable-${suffix}`, status: "ACTIVE" } }),
    ]);
    await prisma.branch.update({ where: { id: fixture.inactiveBranch.id }, data: { name: inactiveBranchName } });
    await prisma.branch.update({ where: { id: fixture.branchB.id }, data: { name: foreignBranchName } });
    const offerings = await Promise.all([
      prisma.branchService.create({ data: { branchId: staffBranch.id, durationMinutes: 51, price: "51001", serviceId: fixture.service.id } }),
      prisma.branchService.create({ data: { branchId: unassignedBranch.id, durationMinutes: 52, price: "52002", serviceId: fixture.service.id } }),
      prisma.branchService.create({ data: { branchId: fixture.inactiveBranch.id, durationMinutes: 53, price: "53003", serviceId: fixture.service.id } }),
      prisma.branchService.create({ data: { branchId: deletedBranch.id, durationMinutes: 54, price: "54004", serviceId: fixture.service.id } }),
      prisma.branchService.create({ data: { branchId: unavailableBranch.id, durationMinutes: 55, isAvailable: false, price: "55005", serviceId: fixture.service.id } }),
      prisma.branchService.create({ data: { branchId: fixture.branchB.id, durationMinutes: 56, price: "56006", serviceId: fixture.service.id } }),
    ]);
    await prisma.branchAssignment.create({ data: { branchId: staffBranch.id, memberId: fixture.owner.membership.id } });
    const [selfAssignment, coworkerAssignment] = await Promise.all([
      prisma.serviceStaffAssignment.create({ data: { memberId: fixture.owner.membership.id, serviceId: fixture.service.id } }),
      prisma.serviceStaffAssignment.create({ data: { memberId: fixture.manager.membership.id, serviceId: fixture.service.id } }),
    ]);

    const ownerHtml = await (await page("/business/services", ownerCookie)).text();
    assert.match(ownerHtml, new RegExp(staffBranchName));
    assert.match(ownerHtml, new RegExp(coworkerAssignment.id));
    assert.match(ownerHtml, /business\/manage\/locations/);

    const assertResponseExcludes = (body: string, excluded: string[]) => {
      for (const sentinel of excluded) assert.equal(body.includes(sentinel), false, `Response leaked ${sentinel}`);
    };
    const managementIdentifiers = [coworkerAssignment.id, selfAssignment.id, fixture.manager.membership.id, ...offerings.map((offering) => offering.id)];
    const receptionistExclusions = [inactiveBranchName, deletedBranchName, unavailableBranchName, foreignBranchName, ...managementIdentifiers];
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.receptionist.membership.roleId } });
    const receptionistHtml = await (await page("/business/services", ownerCookie)).text();
    assert.match(receptionistHtml, new RegExp(staffBranchName));
    assert.match(receptionistHtml, new RegExp(unassignedBranchName));
    assertResponseExcludes(receptionistHtml, receptionistExclusions);
    assert.equal(receptionistHtml.includes("/business/manage/locations/"), false);
    assert.equal(receptionistHtml.includes("/business/team/"), false);
    const receptionistRscResponse = await rscPage("/business/services", ownerCookie);
    assert.equal(receptionistRscResponse.status, 200);
    assert.match(receptionistRscResponse.headers.get("content-type") ?? "", /text\/x-component/);
    const receptionistRsc = await receptionistRscResponse.text();
    assert.match(receptionistRsc, new RegExp(staffBranchName));
    assertResponseExcludes(receptionistRsc, receptionistExclusions);

    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.staff.membership.roleId } });
    const staffHtml = await (await page("/business/services", ownerCookie)).text();
    assert.match(staffHtml, new RegExp(staffBranchName));
    assert.match(staffHtml, new RegExp(`/business/team/${fixture.owner.membership.id}/availability`));
    const staffExclusions = [unassignedBranchName, unassignedBranch.id, "52002", "52,002", inactiveBranchName, deletedBranchName, unavailableBranchName, foreignBranchName, ...managementIdentifiers];
    assertResponseExcludes(staffHtml, staffExclusions);
    assert.equal(staffHtml.includes("/business/services?edit="), false);
    const staffRscResponse = await rscPage("/business/services", ownerCookie);
    assert.equal(staffRscResponse.status, 200);
    assert.match(staffRscResponse.headers.get("content-type") ?? "", /text\/x-component/);
    const staffRsc = await staffRscResponse.text();
    assert.match(staffRsc, new RegExp(staffBranchName));
    assert.match(staffRsc, new RegExp(fixture.owner.membership.id));
    assertResponseExcludes(staffRsc, staffExclusions);
    assert.equal(staffRsc.includes("/business/services?edit="), false);
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.owner.membership.roleId } });
  });

  await t.test("invitation, assignment, schedule, member leave, self-scope, and cross-tenant routes are connected", async () => {
    const teamHtml = await (await page("/business/team", ownerCookie)).text();
    const inviteForm = forms(teamHtml).find((candidate) => candidate.includes('name="email"') && candidate.includes('name="expiresAt"'));
    assert.ok(inviteForm, "Invitation form not rendered");
    const invitedEmail = `stage2b-invited-${randomUUID()}@rezno.invalid`;
    await submit("/business/team", inviteForm, (parameters) => {
      parameters.set("email", invitedEmail);
      parameters.set("systemRole", "STAFF");
      parameters.set("expiresAt", new Date(Date.now() + 7 * 86_400_000).toISOString());
    }, ownerCookie);
    assert.equal(await prisma.organizationInvitation.count({ where: { normalizedEmail: invitedEmail, organizationId: fixture.organizationA.id, status: "PENDING" } }), 1);

    await prisma.branchAssignment.create({ data: { branchId: fixture.activeBranch.id, memberId: fixture.staff.membership.id } });
    await prisma.branchAssignment.create({ data: { branchId: fixture.activeBranch.id, memberId: fixture.owner.membership.id } });
    const availabilityPath = `/business/team/${fixture.staff.membership.id}/availability`;
    const availabilityHtml = await (await page(availabilityPath, ownerCookie)).text();
    const scheduleForm = forms(availabilityHtml).find((candidate) => candidate.includes('name="day-0-openTime"'));
    const blockForm = forms(availabilityHtml).find((candidate) => candidate.includes('name="startsAt"') && !candidate.includes('name="expectedVersion"'));
    assert.ok(scheduleForm);
    assert.ok(blockForm);
    await submit(availabilityPath, scheduleForm, (parameters) => {
      for (let day = 0; day < 7; day += 1) {
        parameters.set(`day-${day}-isOpen`, "on");
        parameters.set(`day-${day}-openTime`, "09:00");
        parameters.set(`day-${day}-closeTime`, "17:00");
      }
    }, ownerCookie);
    assert.equal(await prisma.availability.count({ where: { branchId: fixture.activeBranch.id, memberId: fixture.staff.membership.id } }), 7);
    const date = futureDate(8);
    await submit(availabilityPath, blockForm, (parameters) => {
      parameters.set("branchId", fixture.activeBranch.id);
      parameters.set("startsAt", `${date}T10:00`);
      parameters.set("endsAt", `${date}T11:00`);
      parameters.set("reason", "HTTP private leave");
    }, ownerCookie);
    assert.equal(await prisma.blockedTime.count({ where: { memberId: fixture.staff.membership.id, reason: "HTTP private leave" } }), 1);

    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.staff.membership.roleId } });
    const staffTeam = await (await page("/business/team", ownerCookie)).text();
    assert.match(staffTeam, new RegExp(session.person.firstName));
    assert.equal(staffTeam.includes(fixture.manager.person.firstName), false);
    const staffOwn = await (await page(`/business/team/${fixture.owner.membership.id}/availability`, ownerCookie)).text();
    assert.equal(forms(staffOwn).some((candidate) => candidate.includes('name="day-0-openTime"')), false);
    assert.equal(forms(staffOwn).some((candidate) => candidate.includes('name="startsAt"')), true);
    const forgedOther = await (await page(availabilityPath, ownerCookie)).text();
    assert.match(forgedOther, /NEXT_HTTP_ERROR_FALLBACK;404/);
    const foreign = await (await page(`/business/team/${fixture.ownerB.membership.id}/availability`, ownerCookie)).text();
    assert.match(foreign, /NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
