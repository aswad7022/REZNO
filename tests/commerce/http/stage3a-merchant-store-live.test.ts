import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { CommercePermission, StoreStatus, SystemRole } from "@prisma/client";

import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../../features/identity/policies/authorization";
import { prisma } from "../../../lib/db/prisma";

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
    const disabled = /\sdisabled(?:=""|(?=\s|>))/.test(input);
    if (!name || disabled || (input.includes('type="checkbox"') && !input.includes(" checked"))) continue;
    const value = input.includes('type="checkbox"')
      ? attribute(input, "value") || "on"
      : attribute(input, "value");
    parameters.append(name, value);
  }
  for (const textarea of form.match(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g) ?? []) {
    const name = attribute(textarea, "name");
    const disabled = /\sdisabled(?:=""|(?=\s|>))/.test(textarea);
    if (name && !disabled) parameters.append(name, decodeHtml(textarea.replace(/^<textarea\b[^>]*>/, "").replace(/<\/textarea>$/, "")));
  }
  return parameters;
}

function findForm(html: string, expected: Record<string, string>) {
  const match = forms(html).find((form) => {
    const parameters = formParams(form);
    return Object.entries(expected).every(([key, value]) => parameters.get(key) === value);
  });
  assert.ok(match, `Expected form ${JSON.stringify(expected)}`);
  return match;
}

async function submit(
  path: string,
  form: string,
  mutate: (parameters: URLSearchParams) => void,
  cookie: string,
) {
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
  assert.ok([200, 303].includes(response.status), `Unexpected Server Action status ${response.status}`);
  let responseBody = "";
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value?: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true }), 750),
        ),
      ]);
      if (result.done) break;
      responseBody += decoder.decode(result.value, { stream: true });
    }
    await reader.cancel();
  }
  return { body: responseBody, status: response.status };
}

async function signUp(label: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      email: `stage3a-${label}-${randomUUID().slice(0, 8)}@rezno.invalid`,
      name: label,
      password: "password123",
    }),
    headers: {
      "content-type": "application/json",
      origin: baseUrl!,
      "user-agent": `rezno-stage3a-${label}`,
    },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id },
    data: { isOnboarded: true, phone: "+9647500000800", status: "ACTIVE" },
  });
  return { cookie: cookie.split(";")[0]!, person, userId: payload.user.id };
}

function activeCookie(sessionCookie: string, organizationId: string) {
  return `${sessionCookie}; rezno-active-business-id=${organizationId}`;
}

async function page(path: string, cookie?: string, rsc = false, userAgent?: string) {
  return fetch(`${baseUrl}${path}`, {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(rsc ? { accept: "text/x-component", rsc: "1" } : {}),
      ...(userAgent ? { "user-agent": userAgent } : {}),
    },
    redirect: "manual",
  });
}

async function body(path: string, cookie?: string, rsc = false) {
  const response = await page(path, cookie, rsc);
  return { response, text: await response.text() };
}

function assertForbidden(text: string) {
  assert.match(text, /NEXT_HTTP_ERROR_FALLBACK;403/);
  assert.doesNotMatch(text, /PrismaClient|PostgreSQL|Invalid `prisma\./);
}

function routeText(text: string) {
  return text.replaceAll("\\/", "/");
}

async function reset() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.match(rows[0]?.database ?? "", /(?:_test|test_)/);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE');
}

async function organization(label: string) {
  return prisma.organization.create({ data: { name: `Stage 3A ${label}`, slug: `stage3a-${label}-${randomUUID().slice(0, 8)}` } });
}

async function role(
  organizationId: string,
  label: string,
  systemRole: SystemRole,
  commercePermissions: CommercePermission[],
) {
  return prisma.role.create({ data: { commercePermissions, isSystem: true, name: `${label}-${randomUUID().slice(0, 5)}`, organizationId, systemRole } });
}

async function member(organizationId: string, personId: string, roleId: string) {
  return prisma.organizationMember.create({ data: { organizationId, personId, roleId } });
}

async function store(organizationId: string, label: string, status: StoreStatus) {
  const submittedAt = status === "DRAFT" ? null : new Date("2026-07-17T01:00:00.000Z");
  const publishedAt = ["ACTIVE", "SUSPENDED", "ARCHIVED"].includes(status) ? new Date("2026-07-17T02:00:00.000Z") : null;
  return prisma.store.create({
    data: {
      archivedAt: status === "ARCHIVED" ? new Date("2026-07-17T04:00:00.000Z") : null,
      deliveryArea: "Karrada",
      deliveryCity: "Baghdad",
      deliveryEnabled: true,
      deliveryEstimateMinutes: 45,
      deliveryFee: "1000",
      description: `STAGE3A-${label}-STORE-SENTINEL`,
      minimumOrderValue: "0",
      name: `STAGE3A ${label} Store`,
      organizationId,
      pickupArea: "Karrada",
      pickupCity: "Baghdad",
      pickupEnabled: true,
      pickupStreet: "Stage 3A Street",
      preparationEstimateMinutes: 20,
      publishedAt,
      slug: `stage3a-${label}-${randomUUID().slice(0, 8)}`,
      status,
      submittedAt,
      supportPhone: "+9647500000801",
      suspendedAt: status === "SUSPENDED" ? new Date("2026-07-17T03:00:00.000Z") : null,
      suspensionReason: status === "SUSPENDED" ? "Stage 3A suspension" : null,
    },
  });
}

test("Gate 3A production HTML, RSC and Server Actions enforce Merchant Store boundaries", {
  concurrency: false,
  skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live Gate 3A tests",
}, async (t) => {
  await reset();
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await reset();
    await prisma.$disconnect();
  });

  const merchantSession = await signUp("merchant-roles");
  const adminSession = await signUp("admin-reviewer");
  const sessions = {
    owner: merchantSession,
    managerView: merchantSession,
    managerDenied: merchantSession,
    receptionist: merchantSession,
    staffPermitted: merchantSession,
    staffDenied: merchantSession,
    reviewer: adminSession,
    readOnly: adminSession,
    expired: adminSession,
  };
  const organizations = {
    merchant: await organization("merchant"),
    foreign: await organization("foreign"),
    managerView: await organization("manager-view"),
    managerDenied: await organization("manager-denied"),
    receptionist: await organization("receptionist"),
    staffPermitted: await organization("staff-permitted"),
    staffDenied: await organization("staff-denied"),
    pending: await organization("pending"),
    rejected: await organization("rejected"),
    active: await organization("active"),
    suspended: await organization("suspended"),
  };
  const roles = {
    owner: await role(organizations.merchant.id, "owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    foreignOwner: await role(organizations.foreign.id, "foreign-owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    managerView: await role(organizations.managerView.id, "manager-view", "MANAGER", ["STORE_VIEW"]),
    managerDenied: await role(organizations.managerDenied.id, "manager-denied", "MANAGER", []),
    receptionist: await role(organizations.receptionist.id, "receptionist", "RECEPTIONIST", ["STORE_VIEW"]),
    staffPermitted: await role(organizations.staffPermitted.id, "staff-permitted", "STAFF", ["INVENTORY_VIEW"]),
    staffDenied: await role(organizations.staffDenied.id, "staff-denied", "STAFF", []),
    managerGrant: await role(organizations.merchant.id, "manager-grant-target", "MANAGER", []),
  };
  await Promise.all([
    member(organizations.merchant.id, sessions.owner.person.id, roles.owner.id),
    member(organizations.foreign.id, sessions.owner.person.id, roles.foreignOwner.id),
    member(organizations.managerView.id, sessions.managerView.person.id, roles.managerView.id),
    member(organizations.managerDenied.id, sessions.managerDenied.person.id, roles.managerDenied.id),
    member(organizations.receptionist.id, sessions.receptionist.person.id, roles.receptionist.id),
    member(organizations.staffPermitted.id, sessions.staffPermitted.person.id, roles.staffPermitted.id),
    member(organizations.staffDenied.id, sessions.staffDenied.person.id, roles.staffDenied.id),
  ]);
  const stores = {
    foreign: await store(organizations.foreign.id, "foreign", "ACTIVE"),
    managerView: await store(organizations.managerView.id, "manager-view", "ACTIVE"),
    pending: await store(organizations.pending.id, "pending", "PENDING_REVIEW"),
    rejected: await store(organizations.rejected.id, "rejected", "PENDING_REVIEW"),
    active: await store(organizations.active.id, "active", "ACTIVE"),
    suspended: await store(organizations.suspended.id, "suspended", "SUSPENDED"),
  };
  const adminAccess = await prisma.adminAccess.create({
    data: { permissions: ["COMMERCE_STORES_VIEW", "COMMERCE_STORES_REVIEW"], userId: sessions.reviewer.userId },
  });
  const cookies = {
    owner: activeCookie(sessions.owner.cookie, organizations.merchant.id),
    foreignOwner: activeCookie(sessions.owner.cookie, organizations.foreign.id),
    managerView: activeCookie(sessions.managerView.cookie, organizations.managerView.id),
    managerDenied: activeCookie(sessions.managerDenied.cookie, organizations.managerDenied.id),
    receptionist: activeCookie(sessions.receptionist.cookie, organizations.receptionist.id),
    staffPermitted: activeCookie(sessions.staffPermitted.cookie, organizations.staffPermitted.id),
    staffDenied: activeCookie(sessions.staffDenied.cookie, organizations.staffDenied.id),
    reviewer: sessions.reviewer.cookie,
    readOnly: sessions.readOnly.cookie,
    expired: sessions.expired.cookie,
  };

  await t.test("role-scoped HTML and RSC structurally omit forbidden Commerce URLs", async () => {
    for (const rsc of [false, true]) {
      const owner = await body("/business", cookies.owner, rsc);
      assert.equal(owner.response.status, 200);
      if (!rsc) {
        assert.equal(routeText(owner.text).includes("/business/commerce"), true);
        assert.match(routeText(owner.text), /\/business\/commerce\/store/);
        assert.match(routeText(owner.text), /\/business\/commerce\/access/);
      }

      const manager = await body("/business", cookies.managerView, rsc);
      if (!rsc) assert.match(routeText(manager.text), /\/business\/commerce\/store/);
      assert.equal(routeText(manager.text).includes("/business/commerce/access"), false);

      for (const [roleName, cookie] of [
        ["manager", cookies.managerDenied],
        ["receptionist", cookies.receptionist],
        ["staff", cookies.staffDenied],
      ] as const) {
        const denied = await body("/business", cookie, rsc);
        assert.equal(routeText(denied.text).includes("/business/commerce"), false, roleName);
      }
      const staff = await body("/business", cookies.staffPermitted, rsc);
      if (!rsc) assert.equal(routeText(staff.text).includes("/business/commerce"), true);
      assert.equal(routeText(staff.text).includes("/business/commerce/store"), false);
      assert.equal(routeText(staff.text).includes("/business/commerce/access"), false);
    }
    for (const rsc of [false, true]) {
      assertForbidden((await body("/business/commerce", cookies.receptionist, rsc)).text);
      assertForbidden((await body("/business/commerce/access", cookies.managerView, rsc)).text);
      assertForbidden((await body("/business/commerce/store", cookies.staffPermitted, rsc)).text);
    }
  });

  let createForm = "";
  await t.test("Owner hub and Store create form are production-connected", async () => {
    const hub = await body("/business/commerce", cookies.owner);
    assert.equal(hub.response.status, 200);
    assert.match(hub.text, /\/business\/commerce\/store/);
    assert.match(hub.text, /\/business\/commerce\/access/);
    const storePage = await body("/business/commerce/store", cookies.owner);
    createForm = findForm(storePage.text, { mode: "create" });
    assert.match(createForm, /name="idempotencyKey"/);
    assert.match(createForm, /name="contextOrganizationId"/);
  });

  await t.test("forged Organization and lifecycle fields are rejected before Store creation", async () => {
    await submit("/business/commerce/store", createForm, (parameters) => {
      parameters.set("contextOrganizationId", organizations.foreign.id);
      parameters.set("idempotencyKey", randomUUID());
      fillStore(parameters, "Forged Organization");
    }, cookies.owner);
    assert.equal(await prisma.store.count({ where: { organizationId: organizations.merchant.id } }), 0);
    await submit("/business/commerce/store", createForm, (parameters) => {
      parameters.set("status", "ACTIVE");
      parameters.set("idempotencyKey", randomUUID());
      fillStore(parameters, "Forged Status");
    }, cookies.owner);
    assert.equal(await prisma.store.count({ where: { organizationId: organizations.merchant.id } }), 0);
  });

  let merchantStoreId = "";
  await t.test("Owner creates one DRAFT Store and exact action replay is a no-op", async () => {
    const exactSlug = `stage3a-live-merchant-${randomUUID().slice(0, 8)}`;
    const mutate = (parameters: URLSearchParams) => {
      fillStore(parameters, "Live Merchant");
      parameters.set("slug", exactSlug);
    };
    await submit("/business/commerce/store", createForm, mutate, cookies.owner);
    await submit("/business/commerce/store", createForm, mutate, cookies.owner);
    const created = await prisma.store.findUniqueOrThrow({ where: { organizationId: organizations.merchant.id } });
    merchantStoreId = created.id;
    assert.equal(created.status, "DRAFT");
    assert.equal(await prisma.businessOperationMutation.count({ where: { targetId: created.id, action: "commerce.store.create" } }), 1);
    assert.equal(await prisma.businessAuditLog.count({ where: { targetId: created.id, action: "commerce.store.create" } }), 1);
  });

  await t.test("versioned update rejects stale and foreign Store envelopes", async () => {
    const storePage = await body("/business/commerce/store", cookies.owner);
    const updateForm = findForm(storePage.text, { mode: "update", storeId: merchantStoreId });
    assert.equal(formParams(updateForm).get("deliveryFee"), "1000");
    assert.equal(formParams(updateForm).get("minimumOrderValue"), "0");
    const updateResult = await submit("/business/commerce/store", updateForm, (parameters) => {
      parameters.set("description", "Stage 3A live update");
    }, cookies.owner);
    assert.equal(
      (await prisma.store.findUniqueOrThrow({ where: { id: merchantStoreId } })).description,
      "Stage 3A live update",
      updateResult.body,
    );
    await submit("/business/commerce/store", updateForm, (parameters) => {
      parameters.set("description", "Stale overwrite");
      parameters.set("idempotencyKey", randomUUID());
    }, cookies.owner);
    await submit("/business/commerce/store", updateForm, (parameters) => {
      parameters.set("storeId", stores.pending.id);
      parameters.set("idempotencyKey", randomUUID());
    }, cookies.owner);
    assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: merchantStoreId } })).description, "Stage 3A live update");
    assert.match((await prisma.store.findUniqueOrThrow({ where: { id: stores.pending.id } })).description ?? "", /STAGE3A-pending/);
  });

  await t.test("Store submission action rechecks readiness and replays exactly once", async () => {
    const storePage = await body("/business/commerce/store", cookies.owner);
    const submitForm = findForm(storePage.text, { action: "submit", storeId: merchantStoreId });
    await submit("/business/commerce/store", submitForm, () => undefined, cookies.owner);
    await submit("/business/commerce/store", submitForm, () => undefined, cookies.owner);
    assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: merchantStoreId } })).status, "PENDING_REVIEW");
    assert.equal(await prisma.businessOperationMutation.count({ where: { targetId: merchantStoreId, action: "commerce.store.submit" } }), 1);
    assert.equal(await prisma.businessAuditLog.count({ where: { targetId: merchantStoreId, action: "commerce.store.submit" } }), 1);
    assert.equal(await prisma.notification.count({ where: { eventKey: { contains: `${merchantStoreId}:store.submitted:` } } }), 1);
    const managerRead = await body("/business/commerce/store", cookies.managerView, true);
    assert.equal(managerRead.response.status, 200);
    assert.match(managerRead.text, /STAGE3A manager-view Store/);
    assert.equal(managerRead.text.includes('name="mode"'), false);
  });

  await t.test("active-Business switching is exact and stale selection does not fall back", async () => {
    const foreign = await body("/business/commerce/store", cookies.foreignOwner);
    assert.match(foreign.text, new RegExp(stores.foreign.slug));
    assert.equal(foreign.text.includes(merchantStoreId), false);
    const stale = await body("/business/commerce", activeCookie(sessions.owner.cookie, organizations.active.id));
    assert.ok([200, 307].includes(stale.response.status));
    assert.match(`${stale.response.headers.get("location") ?? ""}\n${stale.text}`, /\/select-business\?next=/);
  });

  await t.test("Owner permission action blocks STORE_MANAGE escalation and replays a safe grant", async () => {
    const access = await body("/business/commerce/access", cookies.owner);
    const targetForm = findForm(access.text, { roleId: roles.managerGrant.id });
    await submit("/business/commerce/access", targetForm, (parameters) => {
      parameters.append("permissions", "STORE_MANAGE");
    }, cookies.owner);
    assert.deepEqual((await prisma.role.findUniqueOrThrow({ where: { id: roles.managerGrant.id } })).commercePermissions, []);
    const safe = (parameters: URLSearchParams) => {
      parameters.delete("permissions");
      parameters.append("permissions", "STORE_VIEW");
    };
    await submit("/business/commerce/access", targetForm, safe, cookies.owner);
    await submit("/business/commerce/access", targetForm, safe, cookies.owner);
    assert.deepEqual((await prisma.role.findUniqueOrThrow({ where: { id: roles.managerGrant.id } })).commercePermissions, ["STORE_VIEW"]);
    assert.equal(await prisma.businessOperationMutation.count({ where: { targetId: roles.managerGrant.id } }), 1);
  });

  await t.test("Admin queue/detail and approve replay use real AdminAccess", async () => {
    const queue = await body("/admin/commerce/stores?status=PENDING_REVIEW", cookies.reviewer);
    assert.equal(queue.response.status, 200);
    assert.match(queue.text, new RegExp(merchantStoreId));
    assert.equal(queue.text.includes("customerPhoneSnapshot"), false);
    const detail = await body(`/admin/commerce/stores/${merchantStoreId}`, cookies.reviewer);
    const approveForm = findForm(detail.text, { action: "approve", storeId: merchantStoreId });
    await submit(`/admin/commerce/stores/${merchantStoreId}`, approveForm, () => undefined, cookies.reviewer);
    await submit(`/admin/commerce/stores/${merchantStoreId}`, approveForm, () => undefined, cookies.reviewer);
    assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: merchantStoreId } })).status, "ACTIVE");
    assert.equal(await prisma.adminAuditLog.count({ where: { targetId: merchantStoreId, action: "commerce.store.approve" } }), 1);
  });

  await t.test("Admin reject, suspend and reactivate transitions persist through Server Actions", async () => {
    const rejectedDetail = await body(`/admin/commerce/stores/${stores.rejected.id}`, cookies.reviewer);
    const rejectForm = findForm(rejectedDetail.text, { action: "reject", storeId: stores.rejected.id });
    await submit(`/admin/commerce/stores/${stores.rejected.id}`, rejectForm, (parameters) => parameters.set("reason", "Correct the Store description"), cookies.reviewer);
    assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: stores.rejected.id } })).status, "REJECTED");

    const activeDetail = await body(`/admin/commerce/stores/${stores.active.id}`, cookies.reviewer);
    const suspendForm = findForm(activeDetail.text, { action: "suspend", storeId: stores.active.id });
    await submit(`/admin/commerce/stores/${stores.active.id}`, suspendForm, (parameters) => parameters.set("reason", "Operational review"), cookies.reviewer);
    assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: stores.active.id } })).status, "SUSPENDED");

    const suspendedDetail = await body(`/admin/commerce/stores/${stores.suspended.id}`, cookies.reviewer);
    const reactivateForm = findForm(suspendedDetail.text, { action: "reactivate", storeId: stores.suspended.id });
    await submit(`/admin/commerce/stores/${stores.suspended.id}`, reactivateForm, () => undefined, cookies.reviewer);
    assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: stores.suspended.id } })).status, "ACTIVE");
  });

  await t.test("read-only and expired Admin grants fail closed structurally and transactionally", async () => {
    const reviewerDetail = await body(`/admin/commerce/stores/${stores.pending.id}`, cookies.reviewer);
    const forgedApprove = findForm(reviewerDetail.text, { action: "approve", storeId: stores.pending.id });
    await prisma.adminAccess.update({
      where: { id: adminAccess.id },
      data: { permissions: ["COMMERCE_STORES_VIEW"] },
    });
    const readOnly = await body(`/admin/commerce/stores/${stores.pending.id}`, cookies.readOnly);
    assert.equal(readOnly.response.status, 200);
    assert.equal(forms(readOnly.text).some((form) => formParams(form).has("action")), false);
    await submit(`/admin/commerce/stores/${stores.pending.id}`, forgedApprove, () => undefined, cookies.readOnly);
    assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: stores.pending.id } })).status, "PENDING_REVIEW");
    await prisma.adminAccess.update({
      where: { id: adminAccess.id },
      data: { expiresAt: new Date(0), permissions: ["COMMERCE_STORES_VIEW", "COMMERCE_STORES_REVIEW"] },
    });
    const expired = await body("/admin/commerce", cookies.expired);
    assert.equal(expired.text.includes("إدارة متاجر التجارة"), false);
    assert.doesNotMatch(expired.text, /PrismaClient|PostgreSQL|Invalid `prisma\./);
  });

  await t.test("public and mobile Marketplace visibility follows Store lifecycle atomically", async () => {
    for (const visible of [merchantStoreId, stores.foreign.id, stores.suspended.id]) {
      const current = await prisma.store.findUniqueOrThrow({ where: { id: visible } });
      const response = await page(`/api/commerce/public/stores/${current.slug}`, undefined, false, "REZNO-Expo-Mobile-Gate3A");
      assert.equal(response.status, 200, current.status);
      assert.doesNotMatch(await response.text(), /PrismaClient|PostgreSQL|DATABASE_URL/);
    }
    for (const hidden of [stores.pending.id, stores.rejected.id, stores.active.id]) {
      const current = await prisma.store.findUniqueOrThrow({ where: { id: hidden } });
      const response = await page(`/api/commerce/public/stores/${current.slug}`);
      assert.equal(response.status, 404, current.status);
    }
    const marketplace = await page("/marketplace", undefined, false, "REZNO-Expo-Mobile-Gate3A");
    assert.equal(marketplace.status, 200);
  });
});

function fillStore(parameters: URLSearchParams, label: string) {
  parameters.set("name", `Stage 3A ${label} Store`);
  parameters.set("slug", `stage3a-${label.toLowerCase().replaceAll(" ", "-")}-${randomUUID().slice(0, 8)}`);
  parameters.set("description", "Stage 3A production Server Action Store");
  parameters.set("supportPhone", "+9647500000802");
  parameters.set("deliveryEnabled", "on");
  parameters.set("deliveryCity", "Baghdad");
  parameters.set("deliveryArea", "Karrada");
  parameters.set("deliveryEstimateMinutes", "45");
  parameters.set("deliveryFee", "1000");
  parameters.set("minimumOrderValue", "0");
  parameters.set("preparationEstimateMinutes", "20");
}
