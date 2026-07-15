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
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
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
  const email = `stage2a-${label}-${randomUUID().slice(0, 8)}@rezno.invalid`;
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
    person: await prisma.person.update({
      where: { authUserId: payload.user.id },
      data: { isOnboarded: true, phone: "+9647500000010", status: "ACTIVE" },
    }),
  };
}

function activeCookie(sessionCookie: string, organizationId: string) {
  return `${sessionCookie}; rezno-active-business-id=${organizationId}`;
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  timeout.unref();
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function page(path: string, cookie?: string) {
  try {
    return await fetchWithTimeout(`${baseUrl}${path}`, {
      headers: cookie ? { cookie } : undefined,
      redirect: "manual",
    });
  } catch (error) {
    throw new Error(`GET ${path} failed`, { cause: error });
  }
}

async function submit(
  path: string,
  form: string,
  mutate: (parameters: URLSearchParams) => void,
  cookie = currentCookie,
) {
  const parameters = formParams(form);
  mutate(parameters);
  const multipart = new FormData();
  for (const [key, value] of parameters) multipart.append(key, value);
  let response: Response;
  try {
    response = await fetchWithTimeout(`${baseUrl}${path}`, {
      body: multipart,
      headers: {
        cookie,
        origin: baseUrl!,
        referer: `${baseUrl}${path}`,
      },
      method: "POST",
      redirect: "manual",
    });
  } catch (error) {
    throw new Error(`POST ${path} failed`, { cause: error });
  }
  assert.ok([200, 303].includes(response.status), `Unexpected Server Action status ${response.status}`);
  await response.body?.cancel();
  return response;
}

async function assertForbidden(response: Response) {
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /NEXT_HTTP_ERROR_FALLBACK;403/);
}

let currentCookie = "";

test("Business Operations live pages and progressive Server Actions persist authoritative state", {
  concurrency: false,
  skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live Business Operations tests",
}, async (t) => {
  await resetBusinessOperationsTestData();
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await resetBusinessOperationsTestData();
    await prisma.$disconnect();
  });
  const fixture = await createBusinessOperationsFixture("http");
  const ownerSession = await signUp("owner");
  await prisma.organizationMember.updateMany({
    where: { id: { in: [fixture.owner.membership.id, fixture.ownerB.membership.id] } },
    data: { personId: ownerSession.person.id },
  });
  const ownerCookie = activeCookie(ownerSession.cookie, fixture.organizationA.id);

  await t.test("authentication and role page boundaries fail closed", async () => {
    const unauthenticated = await page("/business/manage/settings");
    assert.equal(unauthenticated.status, 200);
    assert.match(await unauthenticated.text(), /NEXT_REDIRECT[\s\S]*register/);
    assert.equal((await page("/business/manage/settings", ownerCookie)).status, 200);
    assert.equal((await page("/business/manage/audit", ownerCookie)).status, 200);
    const crossTenant = await page(`/business/manage/locations/${fixture.branchB.id}/hours`, ownerCookie);
    const crossTenantBody = await crossTenant.text();
    assert.equal(crossTenant.status, 200);
    assert.match(crossTenantBody, /NEXT_HTTP_ERROR_FALLBACK;404/);
    assert.equal(crossTenantBody.includes(fixture.branchB.name), false);
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.manager.membership.roleId } });
    assert.equal((await page("/business/manage/settings", ownerCookie)).status, 200);
    await assertForbidden(await page("/business/manage/audit", ownerCookie));
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.receptionist.membership.roleId } });
    await assertForbidden(await page("/business/manage/settings", ownerCookie));
    const receptionistLocations = await page("/business/manage/locations", ownerCookie);
    const receptionistLocationsBody = await receptionistLocations.text();
    assert.equal(receptionistLocations.status, 200);
    assert.doesNotMatch(receptionistLocationsBody, /NEXT_HTTP_ERROR_FALLBACK;403/);
    assert.match(receptionistLocationsBody, new RegExp(fixture.activeBranch.name));
    const receptionistBlocks = await page(`/business/manage/locations/${fixture.activeBranch.id}/blocks`, ownerCookie);
    const receptionistBlocksBody = await receptionistBlocks.text();
    assert.equal(receptionistBlocks.status, 200);
    assert.doesNotMatch(receptionistBlocksBody, /NEXT_HTTP_ERROR_FALLBACK;403/);
    assert.ok(forms(receptionistBlocksBody).some((candidate) => candidate.includes('name="startsAt"')));
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.staff.membership.roleId } });
    await assertForbidden(await page("/business/manage/locations", ownerCookie));
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.owner.membership.roleId } });
  });

  await t.test("the real selector switches businesses and stale cross-tab forms cannot mutate the new tenant", async () => {
    const chooserResponse = await page("/select-business?next=/business/manage/settings", ownerSession.cookie);
    assert.equal(chooserResponse.status, 200);
    const chooserHtml = await chooserResponse.text();
    const chooserForm = forms(chooserHtml).find((candidate) => candidate.includes('name="businessId"'));
    assert.ok(chooserForm, "Active-business selector form not rendered");
    const selected = await submit(
      "/select-business?next=/business/manage/settings",
      chooserForm,
      (parameters) => parameters.set("businessId", fixture.organizationB.id),
      ownerSession.cookie,
    );
    assert.equal(selected.status, 303);
    const selectedCookie = selected.headers.getSetCookie()
      .find((value) => value.startsWith("rezno-active-business-id="))
      ?.split(";")[0];
    assert.ok(selectedCookie);
    const organizationBCookie = `${ownerSession.cookie}; ${selectedCookie}`;
    const selectedSettings = await page("/business/manage/settings", organizationBCookie);
    assert.equal(selectedSettings.status, 200);
    assert.match(await selectedSettings.text(), new RegExp(fixture.organizationB.name));

    const staleHtml = await (await page("/business/manage/settings", ownerCookie)).text();
    const staleForm = forms(staleHtml).find((candidate) => candidate.includes('name="bookingEnabled"'));
    assert.ok(staleForm, "Organization A settings form not rendered");
    const beforeA = await prisma.organizationSettings.findUniqueOrThrow({ where: { organizationId: fixture.organizationA.id } });
    const beforeB = await prisma.organizationSettings.findUniqueOrThrow({ where: { organizationId: fixture.organizationB.id } });
    await submit("/business/manage/settings", staleForm, (parameters) => {
      parameters.set("idempotencyKey", randomUUID());
      parameters.set("cancellationWindowHours", "77");
    }, organizationBCookie);
    const afterA = await prisma.organizationSettings.findUniqueOrThrow({ where: { organizationId: fixture.organizationA.id } });
    const afterB = await prisma.organizationSettings.findUniqueOrThrow({ where: { organizationId: fixture.organizationB.id } });
    assert.equal(afterA.updatedAt.getTime(), beforeA.updatedAt.getTime());
    assert.equal(afterB.updatedAt.getTime(), beforeB.updatedAt.getTime());
  });

  await t.test("settings action persists once, replays exactly, rejects unknown fields, and rejects stale versions", async () => {
    currentCookie = ownerCookie;
    const response = await page("/business/manage/settings", ownerCookie);
    const html = await response.text();
    const form = forms(html).find((candidate) => candidate.includes('name="bookingEnabled"'));
    assert.ok(form, "Settings form not rendered");
    const mutate = (parameters: URLSearchParams) => {
      parameters.set("bookingEnabled", "");
      parameters.delete("bookingEnabled");
      parameters.delete("marketplaceVisible");
      parameters.set("cancellationWindowHours", "48");
    };
    await submit("/business/manage/settings", form, mutate);
    let settings = await prisma.organizationSettings.findUniqueOrThrow({ where: { organizationId: fixture.organizationA.id } });
    assert.equal(settings.bookingEnabled, false);
    assert.equal(settings.marketplaceVisible, false);
    assert.equal(settings.cancellationWindowHours, 48);
    await submit("/business/manage/settings", form, mutate);
    assert.equal(await prisma.businessAuditLog.count({ where: { action: "SETTINGS_UPDATE", organizationId: fixture.organizationA.id } }), 1);
    await submit("/business/manage/settings", form, (parameters) => {
      mutate(parameters);
      parameters.set("allowOnlinePayments", "on");
      parameters.set("idempotencyKey", randomUUID());
    });
    settings = await prisma.organizationSettings.findUniqueOrThrow({ where: { organizationId: fixture.organizationA.id } });
    assert.equal(settings.allowOnlinePayments, false);
    await submit("/business/manage/settings", form, (parameters) => {
      parameters.set("bookingEnabled", "on");
      parameters.set("marketplaceVisible", "on");
      parameters.set("cancellationWindowHours", "72");
      parameters.set("idempotencyKey", randomUUID());
    });
    settings = await prisma.organizationSettings.findUniqueOrThrow({ where: { organizationId: fixture.organizationA.id } });
    assert.equal(settings.cancellationWindowHours, 48);
    const marketplace = await fetch(`${baseUrl}/api/mobile/marketplace?query=${encodeURIComponent(fixture.organizationA.name)}`);
    assert.equal(marketplace.status, 200);
    assert.equal(JSON.stringify(await marketplace.json()).includes(fixture.organizationA.id), false);
  });

  await t.test("Branch create, hours, and block actions persist and do not duplicate on retry", async () => {
    currentCookie = ownerCookie;
    const locations = await page("/business/manage/locations", ownerCookie);
    const locationHtml = await locations.text();
    const createForm = forms(locationHtml).find((candidate) => candidate.includes('name="name"') && !candidate.includes('name="expectedVersion"'));
    assert.ok(createForm, "Branch create form not rendered");
    const branchName = "HTTP Operations Branch";
    const branchMutation = (parameters: URLSearchParams) => {
      parameters.set("name", branchName);
      parameters.set("timezone", "UTC");
      parameters.set("phone", "+9647500000000");
      parameters.set("email", "http-branch@example.test");
      for (const field of ["addressLine1", "addressLine2", "city", "country", "latitude", "longitude", "locationLabel", "nearbyLandmark", "locationInstructions"]) parameters.set(field, "");
    };
    await submit("/business/manage/locations", createForm, branchMutation);
    await submit("/business/manage/locations", createForm, branchMutation);
    const branch = await prisma.branch.findFirstOrThrow({ where: { organizationId: fixture.organizationA.id, name: branchName } });
    assert.equal(await prisma.branch.count({ where: { organizationId: fixture.organizationA.id, name: branchName } }), 1);

    const hoursPath = `/business/manage/locations/${branch.id}/hours`;
    const hoursHtml = await (await page(hoursPath, ownerCookie)).text();
    const hoursForm = forms(hoursHtml).find((candidate) => candidate.includes('name="day-0-openTime"'));
    assert.ok(hoursForm, "Hours form not rendered");
    await submit(hoursPath, hoursForm, (parameters) => {
      for (let day = 0; day < 7; day += 1) {
        parameters.set(`day-${day}-isOpen`, "on");
        parameters.set(`day-${day}-openTime`, "08:00");
        parameters.set(`day-${day}-closeTime`, "18:00");
      }
    });
    assert.equal(await prisma.businessHour.count({ where: { branchId: branch.id, isOpen: true, openTime: "08:00", closeTime: "18:00" } }), 7);

    const blocksPath = `/business/manage/locations/${branch.id}/blocks`;
    const blocksHtml = await (await page(blocksPath, ownerCookie)).text();
    const blockForm = forms(blocksHtml).find((candidate) => candidate.includes('name="startsAt"') && !candidate.includes('name="expectedVersion"'));
    assert.ok(blockForm, "Block create form not rendered");
    const date = futureDate(7);
    const blockMutation = (parameters: URLSearchParams) => {
      parameters.set("startsAt", `${date}T10:00`);
      parameters.set("endsAt", `${date}T12:00`);
      parameters.set("reason", "HTTP internal reason");
    };
    await submit(blocksPath, blockForm, blockMutation);
    await submit(blocksPath, blockForm, blockMutation);
    assert.equal(await prisma.blockedTime.count({ where: { branchId: branch.id, memberId: null } }), 1);
    assert.equal(await prisma.businessAuditLog.count({ where: { organizationId: fixture.organizationA.id, targetType: "BlockedTime" } }), 1);
  });
});
