import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { expirePendingOrder } from "../../features/commerce/services/order-service";
import { prisma } from "../../lib/db/prisma";
import {
  COMMERCE_ORDERS_FULFILLMENT_STAGE3C_FIXTURE as FIXTURE,
  seedCommerceOrdersFulfillmentStage3cFixture,
} from "./commerce-orders-fulfillment-stage3c-seed-core";
import {
  assertCommerceOrdersFulfillmentStage3cSmokeSafety,
} from "./commerce-orders-fulfillment-stage3c-smoke-safety";

type Session = { cookie: string; personId: string; userId: string };
type ApiResult = { body: Record<string, unknown>; response: Response; text: string };

const baseUrl = process.env.COMMERCE_STAGING_BASE_URL?.replace(/\/$/, "") ?? "";
const authBaseUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const oidcToken = process.env.VERCEL_OIDC_TOKEN ?? "";
const runId = randomUUID().replaceAll("-", "").slice(0, 16);
const userIds: string[] = [];
const personIds: string[] = [];
let phase = "safety";
let baselineFingerprint = "";
const evidence = {
  audit: 0,
  checks: new Set<string>(),
  history: 0,
  movements: 0,
  notifications: 0,
};

async function main() {
  const database = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assertCommerceOrdersFulfillmentStage3cSmokeSafety({
    authBaseUrl,
    baseUrl,
    confirmation: process.env.COMMERCE_ORDERS_FULFILLMENT_STAGE3C_SMOKE_CONFIRM,
    database: database[0]?.database ?? "",
    vercelEnvironment: process.env.VERCEL_ENV,
  });
  assert.ok(bypass || oidcToken, "Vercel preview protection authentication is required.");

  phase = "fixture-baseline";
  baselineFingerprint = (await resetFixture()).fingerprint;

  phase = "authenticated-identities";
  const sessions = {
    customerA: await signUp("customer-a", 1),
    customerB: await signUp("customer-b", 2),
    foreignOwner: await signUp("foreign-owner", 3),
    manager: await signUp("manager", 4),
    managerRead: await signUp("manager-read", 5),
    owner: await signUp("owner", 6),
    receptionist: await signUp("receptionist", 7),
    staffDenied: await signUp("staff-denied", 8),
    staffManage: await signUp("staff-manage", 9),
    staffView: await signUp("staff-view", 10),
  };
  assert.equal(new Set(Object.values(sessions).map((session) => session.userId)).size, 10);

  phase = "role-memberships";
  const membership = {
    foreignOwner: await link(sessions.foreignOwner, FIXTURE.organizations.foreign[0], "Stage3C Foreign Owner"),
    manager: await link(sessions.manager, FIXTURE.organizations.primary[0], "Stage3C Order Manager"),
    managerRead: await link(sessions.managerRead, FIXTURE.organizations.primary[0], "Stage3C Read Manager"),
    owner: await link(sessions.owner, FIXTURE.organizations.primary[0], "Stage3C Owner"),
    ownerSuspended: await link(sessions.owner, FIXTURE.organizations.suspended[0], "Stage3C Suspended Owner"),
    receptionist: await link(sessions.receptionist, FIXTURE.organizations.primary[0], "Stage3C Receptionist"),
    staffDenied: await link(sessions.staffDenied, FIXTURE.organizations.primary[0], "Stage3C Denied Staff"),
    staffManage: await link(sessions.staffManage, FIXTURE.organizations.primary[0], "Stage3C Order Staff"),
    staffView: await link(sessions.staffView, FIXTURE.organizations.primary[0], "Stage3C View Staff"),
  };
  const cookies = {
    foreignOwner: activeCookie(sessions.foreignOwner.cookie, FIXTURE.organizations.foreign[0]),
    manager: activeCookie(sessions.manager.cookie, FIXTURE.organizations.primary[0]),
    managerRead: activeCookie(sessions.managerRead.cookie, FIXTURE.organizations.primary[0]),
    owner: activeCookie(sessions.owner.cookie, FIXTURE.organizations.primary[0]),
    ownerSuspended: activeCookie(sessions.owner.cookie, FIXTURE.organizations.suspended[0]),
    receptionist: activeCookie(sessions.receptionist.cookie, FIXTURE.organizations.primary[0]),
    staffDenied: activeCookie(sessions.staffDenied.cookie, FIXTURE.organizations.primary[0]),
    staffManage: activeCookie(sessions.staffManage.cookie, FIXTURE.organizations.primary[0]),
    staffView: activeCookie(sessions.staffView.cookie, FIXTURE.organizations.primary[0]),
  };

  phase = "html-rsc-role-policy";
  for (const rsc of [false, true]) {
    const owner = await page("/business/commerce/orders", cookies.owner, rsc);
    assert.equal(owner.response.status, 200);
    assert.match(routeText(owner.text), /REZNO-STAGE3C-PENDINGVALID/);
    const staff = await page("/business/commerce/orders", cookies.staffManage, rsc);
    assert.equal(staff.response.status, 200);
    const denied = await page("/business/commerce/orders", cookies.receptionist, rsc);
    assertForbidden(denied);
  }
  assertForbidden(await page("/business/commerce/orders", cookies.staffDenied));
  const listHtml = (await page("/business/commerce/orders", cookies.owner)).text;
  assert.doesNotMatch(listHtml, /\+964750004099|Stage 3C pendingValid instructions|Stage 3C Delivery Street/);
  const ownerDetailHtml = (await page(`/business/commerce/orders/${FIXTURE.order("pendingValid")}`, cookies.owner)).text;
  assert.match(ownerDetailHtml, /name="action"[^>]*value="confirm"|value="confirm"[^>]*name="action"/);
  assert.match(ownerDetailHtml, /name="action"[^>]*value="cancel"|value="cancel"[^>]*name="action"/);
  const staffDetailHtml = (await page(`/business/commerce/orders/${FIXTURE.order("pendingValid")}`, cookies.staffManage)).text;
  assert.match(staffDetailHtml, /value="confirm"/);
  assert.equal(hasAction(staffDetailHtml, "cancel"), false);
  const readDetailHtml = (await page(`/business/commerce/orders/${FIXTURE.order("pendingValid")}`, cookies.managerRead)).text;
  assert.doesNotMatch(readDetailHtml, /name="expectedVersion"|name="idempotencyKey"|name="action"/);
  evidence.checks.add("roles-html-rsc");

  phase = "queue-cursors-and-isolation";
  const firstPage = await api("/api/commerce/merchant/orders?queue=all&limit=2", cookies.owner);
  assert.equal(firstPage.response.status, 200);
  const firstData = collection(firstPage.body);
  assert.equal(firstData.data.length, 2);
  assert.ok(firstData.pageInfo.nextCursor);
  const secondPage = await api(`/api/commerce/merchant/orders?queue=all&limit=2&cursor=${encodeURIComponent(firstData.pageInfo.nextCursor!)}`, cookies.owner);
  assert.equal(secondPage.response.status, 200);
  const secondData = collection(secondPage.body);
  assert.equal(firstData.data.some((item) => secondData.data.some((next) => next.id === item.id)), false);
  assert.equal((await api("/api/commerce/merchant/orders?queue=pending&limit=10&cursor=not-base64", cookies.owner)).response.status, 400);
  const foreign = await api("/api/commerce/merchant/orders?queue=all&limit=50", cookies.foreignOwner);
  assert.equal(collection(foreign.body).data.some((item) => item.id === FIXTURE.order("pendingValid")), false);
  assert.equal(collection(foreign.body).data.some((item) => item.id === FIXTURE.order("foreign")), true);
  const switched = await api("/api/commerce/merchant/orders?queue=all&limit=50", cookies.ownerSuspended);
  assert.equal(collection(switched.body).data.some((item) => item.id === FIXTURE.order("archivedVariant")), true);
  assert.equal(collection(switched.body).data.some((item) => item.id === FIXTURE.order("pendingValid")), false);
  evidence.checks.add("queue-pagination-isolation");

  phase = "dto-pii-and-role-apis";
  const ownerDetail = data(await api(`/api/commerce/merchant/orders/${FIXTURE.order("preparingDelivery")}`, cookies.owner));
  assert.equal(ownerDetail.mode, "management");
  assert.equal((ownerDetail.customer as { phone: string }).phone, "+964750004099");
  const readDetail = data(await api(`/api/commerce/merchant/orders/${FIXTURE.order("preparingDelivery")}`, cookies.managerRead));
  assert.equal(readDetail.mode, "read_only");
  assert.equal("expectedVersion" in readDetail, false);
  assert.equal("allowedActions" in readDetail, false);
  assert.equal((await api("/api/commerce/merchant/orders?queue=all&limit=10", cookies.staffDenied)).response.status, 403);
  assert.equal((await api("/api/commerce/merchant/orders?queue=all&limit=10", cookies.receptionist)).response.status, 403);
  evidence.checks.add("dto-pii-role-apis");

  phase = "confirmation-exact-replay";
  await resetFixture();
  const pendingVersion = await version(FIXTURE.order("pendingValid"));
  const confirmKey = randomUUID();
  const confirmed = await transition(cookies.owner, FIXTURE.order("pendingValid"), "confirm", pendingVersion, confirmKey);
  assert.equal(confirmed.status, "CONFIRMED");
  const preparing = await transition(cookies.owner, FIXTURE.order("pendingValid"), "start_preparing", String(confirmed.updatedAt), randomUUID());
  assert.equal(preparing.fulfillmentStatus, "PREPARING");
  const replay = await transition(cookies.owner, FIXTURE.order("pendingValid"), "confirm", pendingVersion, confirmKey);
  assert.equal(replay.status, "CONFIRMED");
  assert.equal(replay.fulfillmentStatus, "UNFULFILLED");
  assert.equal(replay.updatedAt, confirmed.updatedAt);
  await assertSideEffects(FIXTURE.order("pendingValid"), { audit: 2, history: 3, movements: 2, notifications: 2 });
  evidence.checks.add("confirmation-replay");

  phase = "rejection";
  await resetFixture();
  const rejected = await transition(cookies.manager, FIXTURE.order("pendingValid"), "reject", await version(FIXTURE.order("pendingValid")), randomUUID(), "Unable to fulfill safely");
  assert.deepEqual([rejected.status, rejected.fulfillmentStatus, rejected.paymentStatus], ["REJECTED", "CANCELLED", "VOIDED"]);
  await assertSideEffects(FIXTURE.order("pendingValid"), { audit: 1, history: 2, movements: 2, notifications: 1 });
  evidence.checks.add("rejection");

  phase = "customer-api-cancellation";
  await resetFixture();
  await prisma.order.update({ where: { id: FIXTURE.order("pendingValid") }, data: { customerId: sessions.customerA.personId } });
  const customerVersion = await version(FIXTURE.order("pendingValid"));
  const customerKey = randomUUID();
  const customerPath = `/api/commerce/customer/orders/${FIXTURE.order("pendingValid")}/cancel`;
  const customerPayload = { expectedVersion: customerVersion, reason: "Customer changed plans" };
  const customerFirst = await api(customerPath, sessions.customerA.cookie, { body: customerPayload, idempotencyKey: customerKey, method: "POST" });
  assert.equal(customerFirst.response.status, 200);
  const customerReplay = await api(customerPath, sessions.customerA.cookie, { body: customerPayload, idempotencyKey: customerKey, method: "POST" });
  assert.deepEqual(customerReplay.body, customerFirst.body);
  assert.equal((await api("/api/commerce/customer/orders?limit=20", sessions.customerA.cookie)).response.status, 200);
  assert.equal((await api(`/api/commerce/customer/orders/${FIXTURE.order("pendingValid")}`, sessions.customerA.cookie)).response.status, 200);
  assert.equal((await api(`/api/commerce/customer/orders/${FIXTURE.order("pendingValid")}`, sessions.customerB.cookie)).response.status, 404);
  await assertSideEffects(FIXTURE.order("pendingValid"), { audit: 0, history: 2, movements: 2, notifications: 11 });
  evidence.checks.add("customer-cancel-api-mobile-contract");

  phase = "merchant-cancellation";
  await resetFixture();
  const cancelled = await transition(cookies.owner, FIXTURE.order("pendingValid"), "cancel", await version(FIXTURE.order("pendingValid")), randomUUID(), "Merchant cannot fulfill", false);
  assert.deepEqual([cancelled.status, cancelled.fulfillmentStatus, cancelled.paymentStatus], ["CANCELLED", "CANCELLED", "VOIDED"]);
  await assertSideEffects(FIXTURE.order("pendingValid"), { audit: 1, history: 2, movements: 2, notifications: 1 });
  assert.equal((await transitionRaw(cookies.staffManage, FIXTURE.order("confirmed"), "cancel", await version(FIXTURE.order("confirmed")), randomUUID(), "Staff forbidden", false)).response.status, 403);
  evidence.checks.add("merchant-cancel");

  phase = "suspended-archived-restock";
  await resetFixture();
  const suspendedCancel = await transition(cookies.ownerSuspended, FIXTURE.order("archivedVariant"), "cancel", await version(FIXTURE.order("archivedVariant")), randomUUID(), "Suspended store safe closure", false);
  assert.equal(suspendedCancel.status, "CANCELLED");
  assert.equal(await prisma.stockMovement.count({ where: { orderId: FIXTURE.order("archivedVariant"), type: "RESTOCK" } }), 1);
  evidence.checks.add("suspended-archived-order");

  phase = "pickup-payment-completion";
  await resetFixture();
  let pickup = await transition(cookies.staffManage, FIXTURE.order("confirmed"), "start_preparing", await version(FIXTURE.order("confirmed")), randomUUID());
  pickup = await transition(cookies.staffManage, FIXTURE.order("confirmed"), "ready_for_pickup", String(pickup.updatedAt), randomUUID());
  pickup = await transition(cookies.staffManage, FIXTURE.order("confirmed"), "finalize_pickup", String(pickup.updatedAt), randomUUID());
  assert.deepEqual([pickup.status, pickup.fulfillmentStatus, pickup.paymentStatus], ["COMPLETED", "PICKED_UP", "PAID"]);
  const pickupPayment = await prisma.payment.findUniqueOrThrow({ where: { orderId: FIXTURE.order("confirmed") } });
  assert.deepEqual([pickupPayment.status, pickupPayment.recordedByType, pickupPayment.recordedById], ["PAID", "MERCHANT", sessions.staffManage.personId]);
  assert.equal((await transitionRaw(cookies.owner, FIXTURE.order("confirmed"), "cancel", String(pickup.updatedAt), randomUUID(), "Paid cancellation", false)).response.status, 409);
  evidence.checks.add("pickup-payment-completion");

  phase = "delivery-failure-retry-completion";
  await resetFixture();
  let delivery = await transition(cookies.owner, FIXTURE.order("preparingDelivery"), "out_for_delivery", await version(FIXTURE.order("preparingDelivery")), randomUUID());
  assert.equal((await transitionRaw(cookies.owner, FIXTURE.order("preparingDelivery"), "cancel", String(delivery.updatedAt), randomUUID(), "Unsafe in transit", false)).response.status, 409);
  delivery = await transition(cookies.owner, FIXTURE.order("preparingDelivery"), "delivery_failed", String(delivery.updatedAt), randomUUID(), "Recipient unavailable");
  delivery = await transition(cookies.owner, FIXTURE.order("preparingDelivery"), "retry_delivery", String(delivery.updatedAt), randomUUID());
  delivery = await transition(cookies.owner, FIXTURE.order("preparingDelivery"), "finalize_delivery", String(delivery.updatedAt), randomUUID());
  assert.deepEqual([delivery.status, delivery.fulfillmentStatus, delivery.paymentStatus], ["COMPLETED", "DELIVERED", "PAID"]);
  evidence.checks.add("delivery-failure-retry-payment");

  phase = "delivery-failed-return-confirmation";
  await resetFixture();
  const failedVersion = await version(FIXTURE.order("deliveryFailed"));
  assert.equal((await transitionRaw(cookies.owner, FIXTURE.order("deliveryFailed"), "cancel", failedVersion, randomUUID(), "Returned from courier", false)).response.status, 400);
  const returned = await transition(cookies.owner, FIXTURE.order("deliveryFailed"), "cancel", failedVersion, randomUUID(), "Returned from courier", true);
  assert.equal(returned.status, "CANCELLED");
  assert.equal(await prisma.stockMovement.count({ where: { orderId: FIXTURE.order("deliveryFailed"), type: "RESTOCK" } }), 1);
  evidence.checks.add("delivery-return-restock");

  phase = "expiration-and-concurrency";
  await resetFixture();
  const overdueVersion = await version(FIXTURE.order("pendingOverdue"));
  const [systemResult, merchantResult] = await Promise.allSettled([
    expirePendingOrder(FIXTURE.order("pendingOverdue")),
    transitionRaw(cookies.owner, FIXTURE.order("pendingOverdue"), "confirm", overdueVersion, randomUUID()),
  ]);
  assert.ok(systemResult.status === "fulfilled" || merchantResult.status === "fulfilled");
  const expired = await prisma.order.findUniqueOrThrow({ where: { id: FIXTURE.order("pendingOverdue") } });
  assert.deepEqual([expired.status, expired.fulfillmentStatus, expired.paymentStatus], ["EXPIRED", "CANCELLED", "VOIDED"]);
  assert.equal(await prisma.orderStatusHistory.count({ where: { orderId: expired.id, newOrderStatus: "EXPIRED" } }), 1);
  assert.equal(await prisma.stockMovement.count({ where: { orderId: expired.id, type: "RELEASE" } }), 1);
  evidence.checks.add("expiration-concurrency");

  phase = "confirmation-cancellation-race";
  await resetFixture();
  const raceVersion = await version(FIXTURE.order("pendingValid"));
  const race = await Promise.all([
    transitionRaw(cookies.owner, FIXTURE.order("pendingValid"), "confirm", raceVersion, randomUUID()),
    transitionRaw(cookies.owner, FIXTURE.order("pendingValid"), "cancel", raceVersion, randomUUID(), "Race cancellation", false),
  ]);
  assert.equal(race.filter((result) => result.response.status === 200).length, 1);
  assert.equal(race.filter((result) => [409, 422].includes(result.response.status)).length, 1);
  const raced = await prisma.order.findUniqueOrThrow({ where: { id: FIXTURE.order("pendingValid") } });
  assert.ok(["CONFIRMED", "CANCELLED"].includes(raced.status));
  evidence.checks.add("confirm-cancel-race");

  phase = "revocation-and-person-fail-closed";
  await resetFixture();
  await prisma.organizationMember.update({ where: { id: membership.manager.id }, data: { status: "INACTIVE" } });
  assert.equal((await api("/api/commerce/merchant/orders?queue=all&limit=10", cookies.manager)).response.status, 403);
  await prisma.organizationMember.update({ where: { id: membership.manager.id }, data: { status: "ACTIVE" } });
  await prisma.person.update({ where: { id: sessions.manager.personId }, data: { deletedAt: new Date() } });
  assert.equal((await api("/api/commerce/merchant/orders?queue=all&limit=10", cookies.manager)).response.status, 401);
  await prisma.person.update({ where: { id: sessions.manager.personId }, data: { deletedAt: null } });
  evidence.checks.add("revocation-deleted-person");

  phase = "final-counts-and-fixture-restore";
  const finalFingerprint = (await resetFixture()).fingerprint;
  assert.equal(finalFingerprint, baselineFingerprint);
  const fixtureOrderIds = fixtureOrderIdsAll();
  evidence.history = await prisma.orderStatusHistory.count({ where: { orderId: { in: fixtureOrderIds } } });
  evidence.movements = await prisma.stockMovement.count({ where: { orderId: { in: fixtureOrderIds } } });
  evidence.audit = await prisma.businessAuditLog.count({ where: { targetId: { in: fixtureOrderIds }, targetType: "Order" } });
  evidence.notifications = await prisma.notification.count({ where: { metadata: { path: ["orderId"], string_contains: "3c" } } });
  assert.equal(evidence.history, 14);
  assert.equal(evidence.movements, 14);
  assert.equal(evidence.audit, 0);
  assert.equal(evidence.notifications, 0);
  evidence.checks.add("cleanup-ready");
}

async function signUp(label: string, suffix: number): Promise<Session> {
  const request = {
    email: `stage3c-${runId}-${label}@rezno.invalid`,
    name: `Stage 3C ${label}`,
    password: `Rz!${randomUUID()}${randomUUID()}`,
  };
  let response: Response | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      body: JSON.stringify(request),
      headers: requestHeaders({
        "content-type": "application/json",
        origin: authBaseUrl,
        "user-agent": `rezno-stage3c-${runId}-${label}`,
      }),
      method: "POST",
      redirect: "manual",
    });
    if (response.status !== 429) break;
    const retryAfter = Math.min(30, Math.max(1, Number(response.headers.get("retry-after") ?? "30")));
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000 + 250));
  }
  assert.ok(response);
  assert.equal(response.status, 200, `Authentication failed for ${label} with status ${response.status}.`);
  const payload = await response.json() as { user: { id: string } };
  const sessionCookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(sessionCookie, `Authentication cookie missing for ${label}.`);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id },
    data: { isOnboarded: true, phone: `+964750005${String(suffix).padStart(3, "0")}`, status: "ACTIVE" },
  });
  userIds.push(payload.user.id);
  personIds.push(person.id);
  return { cookie: sessionCookie.split(";")[0]!, personId: person.id, userId: payload.user.id };
}

async function link(session: Session, organizationId: string, roleName: string) {
  const role = await prisma.role.findFirstOrThrow({ where: { name: roleName, organizationId } });
  return prisma.organizationMember.create({
    data: { organizationId, personId: session.personId, roleId: role.id, status: "ACTIVE" },
  });
}

async function page(path: string, cookie: string, rsc = false) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: requestHeaders({ cookie, ...(rsc ? { accept: "text/x-component", rsc: "1" } : {}) }),
    redirect: "manual",
  });
  const text = await response.text();
  assertNoRaw(text);
  return { response, text };
}

async function api(
  path: string,
  cookie: string,
  options: { body?: unknown; idempotencyKey?: string; method?: string } = {},
): Promise<ApiResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: requestHeaders({
      ...(options.body === undefined ? {} : { "content-type": "application/json", origin: baseUrl }),
      cookie,
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    }),
    method: options.method ?? "GET",
    redirect: "manual",
  });
  const text = await response.text();
  assertNoRaw(text);
  let body: Record<string, unknown> = {};
  if (text) {
    try { body = JSON.parse(text) as Record<string, unknown>; } catch { body = {}; }
  }
  return { body, response, text };
}

async function transition(
  cookie: string,
  orderId: string,
  action: string,
  expectedVersion: string,
  idempotencyKey: string,
  reason?: string,
  returnedStock?: boolean,
) {
  const result = await transitionRaw(cookie, orderId, action, expectedVersion, idempotencyKey, reason, returnedStock);
  assert.equal(result.response.status, 200, `${action} failed with ${result.response.status}: ${safeFailure(result.text)}`);
  return data(result);
}

function transitionRaw(
  cookie: string,
  orderId: string,
  action: string,
  expectedVersion: string,
  idempotencyKey: string,
  reason?: string,
  returnedStock?: boolean,
) {
  return api(`/api/commerce/merchant/orders/${orderId}/transitions`, cookie, {
    body: { action, expectedVersion, ...(reason === undefined ? {} : { reason }), ...(returnedStock === undefined ? {} : { returnedStock }) },
    idempotencyKey,
    method: "POST",
  });
}

async function version(orderId: string) {
  return (await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { updatedAt: true } })).updatedAt.toISOString();
}

async function resetFixture() {
  const result = await seedCommerceOrdersFulfillmentStage3cFixture(prisma);
  if (baselineFingerprint) assert.equal(result.fingerprint, baselineFingerprint);
  return result;
}

async function assertSideEffects(orderId: string, expected: { audit: number; history: number; movements: number; notifications: number }) {
  const [audit, history, movements, notifications] = await Promise.all([
    prisma.businessAuditLog.count({ where: { targetId: orderId, targetType: "Order" } }),
    prisma.orderStatusHistory.count({ where: { orderId } }),
    prisma.stockMovement.count({ where: { orderId } }),
    prisma.notification.count({ where: { metadata: { path: ["orderId"], equals: orderId } } }),
  ]);
  assert.deepEqual({ audit, history, movements, notifications }, expected);
}

function collection(body: Record<string, unknown>) {
  return body as unknown as {
    data: Array<{ id: string }>;
    pageInfo: { hasNextPage: boolean; nextCursor: string | null };
  };
}

function data(result: ApiResult) {
  return result.body.data as Record<string, unknown>;
}

function hasAction(html: string, action: string) {
  return (html.match(/<form\b[\s\S]*?<\/form>/g) ?? []).some((form) => {
    return new RegExp(`name="action"[^>]*value="${action}"|value="${action}"[^>]*name="action"`).test(form);
  });
}

function assertForbidden(result: { response: Response; text: string }) {
  assert.ok([200, 302, 303, 307, 308, 403].includes(result.response.status));
  assert.equal(routeText(result.text).includes("REZNO-STAGE3C-PENDINGVALID"), false);
  assertNoRaw(result.text);
}

function activeCookie(sessionCookie: string, organizationId: string) {
  return `${sessionCookie}; rezno-active-business-id=${organizationId}`;
}

function requestHeaders(initial: Record<string, string>) {
  const headers = new Headers(initial);
  if (bypass) headers.set("x-vercel-protection-bypass", bypass);
  else headers.set("x-vercel-trusted-oidc-idp-token", oidcToken);
  return headers;
}

function routeText(value: string) {
  return value.replaceAll("\\/", "/");
}

function fixtureOrderIdsAll() {
  return [
    "pendingValid", "pendingOverdue", "confirmed", "preparingPickup", "readyPickup",
    "preparingDelivery", "outForDelivery", "deliveryFailed", "completed", "cancelled",
    "rejected", "expired", "archivedVariant", "foreign",
  ].map((name) => FIXTURE.order(name as Parameters<typeof FIXTURE.order>[0]));
}

function assertNoRaw(text: string) {
  assert.doesNotMatch(text, /DATABASE_URL|PrismaClient|PostgreSQL|postgres(?:ql)?:\/\/|Invalid `prisma\.|ep-[a-z0-9-]+\.(?:aws\.)?neon\.tech/i);
}

async function cleanup() {
  if (baselineFingerprint) await resetFixture();
  await prisma.$transaction(async (transaction) => {
    await transaction.notification.deleteMany({ where: { recipientPersonId: { in: personIds } } });
    await transaction.organizationMember.deleteMany({ where: { personId: { in: personIds } } });
    await transaction.account.deleteMany({ where: { userId: { in: userIds } } });
    await transaction.session.deleteMany({ where: { userId: { in: userIds } } });
    await transaction.person.deleteMany({ where: { id: { in: personIds } } });
    await transaction.user.deleteMany({ where: { id: { in: userIds } } });
  }, { timeout: 120_000 });
  const [memberships, people, users] = await Promise.all([
    prisma.organizationMember.count({ where: { personId: { in: personIds } } }),
    prisma.person.count({ where: { id: { in: personIds } } }),
    prisma.user.count({ where: { id: { in: userIds } } }),
  ]);
  assert.deepEqual({ memberships, people, users }, { memberships: 0, people: 0, users: 0 });
}

async function run() {
  let failure: unknown;
  let cleanupFailure: unknown;
  let failedPhase = "";
  try {
    await main();
  } catch (error) {
    failure = error;
    failedPhase = phase;
  }
  try {
    await cleanup();
  } catch (error) {
    cleanupFailure = error;
  }
  await prisma.$disconnect();
  if (failure || cleanupFailure) {
    const messages = [];
    if (failure) messages.push(`phase=${failedPhase} ${failure instanceof Error ? failure.message : "unknown smoke failure"}`);
    if (cleanupFailure) messages.push(`cleanup=${cleanupFailure instanceof Error ? cleanupFailure.message : "unknown cleanup failure"}`);
    console.error(`Stage 3C authenticated staging smoke failed: ${safeFailure(messages.join("; "))}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Stage 3C authenticated staging smoke passed. identities=10 checks=${evidence.checks.size} ` +
    `fixtureHistory=${evidence.history} fixtureMovements=${evidence.movements} fixtureAudits=${evidence.audit} ` +
    `fixtureNotifications=${evidence.notifications} cleanup=verified fingerprint=${baselineFingerprint}`,
  );
}

function safeFailure(message: string) {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]")
    .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
    .slice(0, 600);
}

void run();
