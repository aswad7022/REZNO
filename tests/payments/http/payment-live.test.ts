import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.PAYMENT_HTTP_BASE_URL;
const marker = `gate5c-http-${randomUUID().slice(0, 8)}`;

async function signUp(label: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email: `${marker}-${label}@rezno.invalid`, name: label, password: "password123" }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id },
    data: { isOnboarded: true, status: "ACTIVE" },
  });
  return { cookie: cookie.split(";", 1)[0]!, person, userId: payload.user.id };
}

async function request(path: string, options: {
  body?: string | Record<string, unknown>;
  contentType?: string;
  cookie?: string;
  key?: string;
  method?: string;
  queryHeaders?: Record<string, string>;
} = {}) {
  const body = typeof options.body === "string"
    ? options.body
    : options.body === undefined ? undefined : JSON.stringify(options.body);
  const response = await fetch(`${baseUrl}${path}`, {
    body,
    headers: {
      ...(body === undefined ? {} : { "content-type": options.contentType ?? "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.key ? { "idempotency-key": options.key } : {}),
      ...options.queryHeaders,
    },
    method: options.method ?? "GET",
    redirect: "manual",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const responseBody = contentType.startsWith("application/json")
    ? await response.json() as Record<string, unknown>
    : { html: await response.text() };
  if (contentType.startsWith("application/json")) {
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  }
  return { body: responseBody, response };
}

test("Gate 5C production routes are strict, scope-safe, truthful, and redacted", {
  concurrency: false,
  skip: baseUrl ? false : "PAYMENT_HTTP_BASE_URL is required",
}, async (t) => {
  const [customer, foreignCustomer, owner] = await Promise.all([
    signUp("customer"),
    signUp("foreign-customer"),
    signUp("owner"),
  ]);
  const manager = customer;
  const receptionist = foreignCustomer;
  const admin = customer;
  const viewAdmin = foreignCustomer;
  const [organization, foreignOrganization] = await Promise.all([
    prisma.organization.create({ data: { name: marker, slug: marker } }),
    prisma.organization.create({ data: { name: `${marker}-foreign`, slug: `${marker}-foreign` } }),
  ]);
  await Promise.all([
    prisma.organizationSettings.create({ data: { allowOnlinePayments: true, organizationId: organization.id } }),
    prisma.organizationSettings.create({ data: { allowOnlinePayments: true, organizationId: foreignOrganization.id } }),
  ]);
  const [ownerMembership, foreignOwnerMembership, managerMembership, receptionistMembership] = await Promise.all([
    membership(owner.person.id, organization.id, "OWNER"),
    membership(owner.person.id, foreignOrganization.id, "OWNER"),
    membership(manager.person.id, organization.id, "MANAGER", ["PAYMENT_VIEW", "PAYMENT_REFUND", "SETTLEMENT_VIEW"]),
    membership(receptionist.person.id, organization.id, "RECEPTIONIST"),
  ]);
  const [adminAccess, viewAdminAccess] = await Promise.all([
    prisma.adminAccess.create({
      data: {
        permissions: ["PAYMENTS_VIEW", "PAYMENTS_REFUND", "PAYMENTS_RECONCILE", "SETTLEMENTS_VIEW", "SETTLEMENTS_MANAGE"],
        userId: admin.userId,
      },
    }),
    prisma.adminAccess.create({ data: { permissions: ["PAYMENTS_VIEW", "SETTLEMENTS_VIEW"], userId: viewAdmin.userId } }),
  ]);
  const store = await prisma.store.create({ data: { name: marker, organizationId: organization.id, slug: marker } });
  const order = await createOrder(customer.person.id, store.id, "12000.000");
  const intent = await prisma.paymentIntent.create({
    data: {
      amount: "12000.000",
      commissionAmount: "0",
      commissionBasisPoints: 0,
      commissionPolicyId: "zero-v1",
      currency: "IQD",
      customerPersonId: customer.person.id,
      expiresAt: order.reservationExpiresAt,
      merchantNetAmount: "0",
      method: "ONLINE_PROVIDER",
      orderId: order.id,
      organizationId: organization.id,
      provider: "NOT_CONFIGURED",
      storeId: store.id,
    },
  });
  await Promise.all([
    prisma.order.update({ where: { id: order.id }, data: { paymentMethod: "ONLINE_PROVIDER" } }),
    prisma.payment.update({ where: { orderId: order.id }, data: { method: "ONLINE_PROVIDER", paymentIntentId: intent.id } }),
  ]);
  const eligibleOrder = await createOrder(customer.person.id, store.id, "15000.000");
  const customerCookie = customer.cookie;
  const foreignCookie = foreignCustomer.cookie;
  const ownerCookie = `${owner.cookie}; rezno-active-business-id=${organization.id}`;
  const managerCookie = `${manager.cookie}; rezno-active-business-id=${organization.id}`;
  const receptionistCookie = `${receptionist.cookie}; rezno-active-business-id=${organization.id}`;

  t.after(async () => {
    const personIds = [customer, foreignCustomer, owner].map((actor) => actor.person.id);
    const userIds = [customer, foreignCustomer, owner].map((actor) => actor.userId);
    await prisma.notificationRecipientState.deleteMany({ where: { personId: { in: personIds } } });
    await prisma.notification.deleteMany({ where: { sourceId: { in: [intent.id] } } });
    await prisma.adminAuditLog.deleteMany({ where: { adminUserId: { in: [admin.userId, viewAdmin.userId] } } });
    await prisma.settlementBatch.deleteMany({ where: { organizationId: organization.id } });
    await prisma.paymentMutation.deleteMany({ where: { organizationId: organization.id } });
    await prisma.paymentProviderEvent.deleteMany({ where: { paymentIntent: { organizationId: organization.id } } });
    await prisma.paymentRefund.deleteMany({ where: { paymentIntent: { organizationId: organization.id } } });
    await prisma.paymentAttempt.deleteMany({ where: { paymentIntent: { organizationId: organization.id } } });
    await prisma.financialPosting.deleteMany({ where: { journal: { paymentIntent: { organizationId: organization.id } } } });
    await prisma.financialJournal.deleteMany({ where: { paymentIntent: { organizationId: organization.id } } });
    await prisma.financialAccount.deleteMany({ where: { organizationId: organization.id } });
    await prisma.payment.deleteMany({ where: { order: { store: { organizationId: organization.id } } } });
    await prisma.paymentIntent.deleteMany({ where: { organizationId: organization.id } });
    await prisma.order.deleteMany({ where: { storeId: store.id } });
    await prisma.store.deleteMany({ where: { id: store.id } });
    await prisma.organizationMember.deleteMany({ where: { organizationId: { in: [organization.id, foreignOrganization.id] } } });
    await prisma.role.deleteMany({ where: { organizationId: { in: [organization.id, foreignOrganization.id] } } });
    await prisma.organizationSettings.deleteMany({ where: { organizationId: { in: [organization.id, foreignOrganization.id] } } });
    await prisma.adminAccess.deleteMany({ where: { id: { in: [adminAccess.id, viewAdminAccess.id] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organization.id, foreignOrganization.id] } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  await t.test("capabilities and provider truth fail closed without disabling offline payments", async () => {
    assert.equal((await request("/api/payments/customer/capabilities")).response.status, 401);
    const capabilities = await request(`/api/payments/customer/capabilities?targetType=ORDER&targetId=${eligibleOrder.id}`, { cookie: customerCookie });
    assert.equal(capabilities.response.status, 200, JSON.stringify(capabilities.body));
    const data = capabilities.body.data as {
      onlinePaymentsAvailable: boolean;
      offlineMethods: string[];
      providerConfigured: boolean;
      kind: string;
    };
    assert.equal(data.kind, "PAYMENT_CAPABILITIES");
    assert.equal(data.providerConfigured, false);
    assert.equal(data.onlinePaymentsAvailable, false);
    assert.deepEqual(data.offlineMethods, ["CASH_ON_DELIVERY", "PAY_AT_PICKUP"]);
    assert.doesNotMatch(JSON.stringify(capabilities.body), sensitivePattern());
    assertError(await request(`/api/payments/customer/capabilities?targetType=ORDER&targetId=${eligibleOrder.id}&targetId=${eligibleOrder.id}`, { cookie: customerCookie }), 400, "VALIDATION_ERROR");
    assertError(await request(`/api/payments/customer/capabilities?targetType=ORDER&targetId=${eligibleOrder.id}`, { cookie: foreignCookie }), 404, "NOT_FOUND");
  });

  await t.test("Customer, return, and Mobile reads are Person-scoped and money stays textual", async () => {
    for (const path of [
      "/api/payments/customer/intents?limit=10",
      `/api/payments/customer/intents/${intent.id}`,
      `/api/payments/return/${intent.id}`,
      "/api/mobile/payments/intents?limit=10",
      `/api/mobile/payments/intents/${intent.id}`,
      `/api/mobile/payments/capabilities?targetType=ORDER&targetId=${order.id}`,
    ]) {
      const result = await request(path, { cookie: customerCookie });
      assert.equal(result.response.status, 200, `${path}:${JSON.stringify(result.body)}`);
      assert.doesNotMatch(JSON.stringify(result.body), sensitivePattern());
    }
    const detail = await request(`/api/payments/customer/intents/${intent.id}`, { cookie: customerCookie });
    const payment = detail.body.data as { amount: unknown; capturedAmount: unknown; refundableAmount: unknown };
    assert.equal(typeof payment.amount, "string");
    assert.equal(typeof payment.capturedAmount, "string");
    assert.equal(typeof payment.refundableAmount, "string");
    for (const path of [`/api/payments/customer/intents/${intent.id}`, `/api/mobile/payments/intents/${intent.id}`, `/api/payments/return/${intent.id}`]) {
      assertError(await request(path, { cookie: foreignCookie }), 404, "NOT_FOUND");
    }
    for (const path of ["/api/payments/customer/intents", "/api/mobile/payments/intents"]) {
      assertError(await request(`${path}?organizationId=${foreignOrganization.id}`, { cookie: customerCookie }), 400, "VALIDATION_ERROR");
    }
  });

  await t.test("strict mutations reject client financial/provider/card/redirect fields and production fails closed", async () => {
    assertError(await request("/api/payments/customer/intents", {
      body: {
        amount: "1.000",
        callbackUrl: "https://attacker.invalid/callback",
        cardNumber: "4111111111111111",
        commissionBasisPoints: 1,
        currency: "USD",
        cvv: "123",
        provider: "DETERMINISTIC_TEST",
        redirectUrl: "https://attacker.invalid/return",
        status: "CAPTURED",
        targetId: eligibleOrder.id,
        targetType: "ORDER",
      },
      cookie: customerCookie,
      key: randomUUID(),
      method: "POST",
    }), 400, "VALIDATION_ERROR");
    assertError(await request("/api/payments/customer/intents", {
      body: { targetId: eligibleOrder.id, targetType: "ORDER" },
      contentType: "text/plain",
      cookie: customerCookie,
      key: randomUUID(),
      method: "POST",
    }), 400, "VALIDATION_ERROR");
    assertError(await request("/api/payments/customer/intents", {
      body: "not-json", cookie: customerCookie, key: randomUUID(), method: "POST",
    }), 400, "VALIDATION_ERROR");
    assertError(await request("/api/payments/customer/intents", {
      body: { targetId: eligibleOrder.id, targetType: "ORDER" }, cookie: customerCookie, key: "not-a-uuid", method: "POST",
    }), 400, "VALIDATION_ERROR");
    const unavailable = await request("/api/payments/customer/intents", {
      body: { targetId: eligibleOrder.id, targetType: "ORDER" }, cookie: customerCookie, key: randomUUID(), method: "POST",
    });
    assertError(unavailable, 503, "PAYMENT_PROVIDER_NOT_CONFIGURED");
    assert.equal(await prisma.paymentIntent.count({ where: { orderId: eligibleOrder.id } }), 0);
    assertError(await request(`/api/payments/customer/intents/${intent.id}/retry`, {
      cookie: customerCookie, key: randomUUID(), method: "POST",
    }), 503, "PAYMENT_PROVIDER_NOT_CONFIGURED");
    assertError(await request("/api/payments/webhooks/deterministic", {
      body: "{}",
      method: "POST",
      queryHeaders: { "x-payment-signature": "0".repeat(64), "x-payment-timestamp": String(Math.floor(Date.now() / 1000)) },
    }), 503, "PAYMENT_PROVIDER_NOT_CONFIGURED");
  });

  await t.test("Business roles and Organization scope are enforced by production routes", async () => {
    for (const cookie of [ownerCookie, managerCookie]) {
      assert.equal((await request("/api/payments/business/intents?limit=10", { cookie })).response.status, 200);
      assert.equal((await request(`/api/payments/business/intents/${intent.id}`, { cookie })).response.status, 200);
      assert.equal((await request("/api/payments/business/refunds?limit=10", { cookie })).response.status, 200);
      assert.equal((await request("/api/payments/business/journals?limit=10", { cookie })).response.status, 200);
      assert.equal((await request("/api/payments/business/settlements?limit=10", { cookie })).response.status, 200);
    }
    assert.equal((await request("/api/payments/business/intents", { cookie: receptionistCookie })).response.status, 403);
    for (const path of [
      "/api/payments/business/intents",
      "/api/payments/business/refunds",
      "/api/payments/business/journals",
      "/api/payments/business/settlements",
    ]) {
      assertError(await request(`${path}?organizationId=${foreignOrganization.id}`, { cookie: ownerCookie }), 400, "VALIDATION_ERROR");
    }
    assertError(await request(`/api/payments/business/intents/${intent.id}`, {
      cookie: `${owner.cookie}; rezno-active-business-id=${foreignOrganization.id}`,
    }), 404, "NOT_FOUND");
    assertError(await request(`/api/payments/business/intents/${intent.id}/refunds`, {
      body: { amount: "1000.000", expectedVersion: intent.version, reasonCode: "CUSTOMER_REQUEST" },
      cookie: ownerCookie,
      key: randomUUID(),
      method: "POST",
    }), 503, "PAYMENT_PROVIDER_NOT_CONFIGURED");
  });

  await t.test("Admin reads, settlement statements, reconciliation, revocation, and redaction are explicit", async () => {
    for (const path of [
      "/api/payments/admin/intents?limit=10",
      `/api/payments/admin/intents/${intent.id}`,
      "/api/payments/admin/refunds?limit=10",
      "/api/payments/admin/journals?limit=10",
      "/api/payments/admin/settlements?limit=10",
    ]) {
      const result = await request(path, { cookie: admin.cookie });
      assert.equal(result.response.status, 200, `${path}:${JSON.stringify(result.body)}`);
      assert.doesNotMatch(JSON.stringify(result.body), sensitivePattern());
    }
    const reconciliation = await request("/api/payments/admin/reconciliation", {
      body: { limit: 1, paymentIntentId: intent.id }, cookie: admin.cookie, key: randomUUID(), method: "POST",
    });
    assert.equal(reconciliation.response.status, 200, JSON.stringify(reconciliation.body));
    assert.equal(((reconciliation.body.data as { items: Array<{ classification: string }> }).items[0]?.classification), "NOT_CONFIGURED");
    const preview = await request("/api/payments/admin/settlements/preview", {
      body: {
        currency: "IQD",
        organizationId: organization.id,
        periodEnd: new Date(Date.now() + 60_000).toISOString(),
        periodStart: new Date(Date.now() - 60_000).toISOString(),
      },
      cookie: admin.cookie,
      key: randomUUID(),
      method: "POST",
    });
    assert.equal(preview.response.status, 201, JSON.stringify(preview.body));
    const batch = preview.body.data as { id: string; meaning: string; status: string; version: number };
    assert.equal(batch.meaning, "LEDGER_STATEMENT_NOT_BANK_PAYOUT");
    assert.equal(batch.status, "DRAFT");
    assert.equal((await request(`/api/payments/admin/settlements/${batch.id}`, { cookie: admin.cookie })).response.status, 200);
    assertError(await request(`/api/payments/admin/settlements/${batch.id}/finalize`, {
      body: { expectedVersion: batch.version }, cookie: admin.cookie, key: randomUUID(), method: "POST",
    }), 409, "PAYMENT_STATE_CONFLICT");
    assert.equal((await request("/api/payments/admin/reconciliation", {
      body: { paymentIntentId: intent.id }, cookie: viewAdmin.cookie, key: randomUUID(), method: "POST",
    })).response.status, 403);
    await prisma.adminAccess.update({ where: { id: adminAccess.id }, data: { status: "REVOKED" } });
    assert.equal((await request("/api/payments/admin/intents", { cookie: admin.cookie })).response.status, 403);
  });

  await t.test("payment HTML and RSC surfaces render safe provider truth", async () => {
    const surfaces = [
      { cookie: customerCookie, path: "/customer/payments" },
      { cookie: ownerCookie, path: "/business/payments" },
      { cookie: viewAdmin.cookie, path: "/admin/payments" },
    ];
    for (const surface of surfaces) {
      for (const rsc of [false, true]) {
        const result = await request(surface.path, {
          cookie: surface.cookie,
          queryHeaders: rsc ? { accept: "text/x-component", rsc: "1" } : undefined,
        });
        assert.equal(result.response.status, 200, `${surface.path}:${JSON.stringify(result.body).slice(0, 500)}`);
        const rendered = String(result.body.html ?? "");
        assert.doesNotMatch(rendered, sensitivePattern());
        assert.doesNotMatch(rendered, /4111111111111111|cardNumber|\bcvv\b|\bPAN\b/i);
      }
    }
  });

  assert.ok(ownerMembership.id);
  assert.ok(foreignOwnerMembership.id);
  assert.ok(managerMembership.id);
  assert.ok(receptionistMembership.id);
});

async function membership(
  personId: string,
  organizationId: string,
  systemRole: "OWNER" | "MANAGER" | "RECEPTIONIST",
  commercePermissions: Array<"PAYMENT_VIEW" | "PAYMENT_REFUND" | "SETTLEMENT_VIEW"> = [],
) {
  const role = await prisma.role.create({
    data: { commercePermissions, isSystem: true, name: `${marker}-${systemRole}-${randomUUID().slice(0, 6)}`, organizationId, systemRole },
  });
  const row = await prisma.organizationMember.create({ data: { organizationId, personId, roleId: role.id } });
  return { ...row, roleId: role.id };
}

async function createOrder(customerId: string, storeId: string, total: string) {
  return prisma.order.create({
    data: {
      currency: "IQD",
      customerId,
      customerNameSnapshot: marker,
      customerPhoneSnapshot: "+9647000000000",
      fulfillmentMethod: "CUSTOMER_PICKUP",
      grandTotal: total,
      orderNumber: `${marker}-${randomUUID().slice(0, 10)}`,
      paymentMethod: "PAY_AT_PICKUP",
      pickupAddressSnapshot: "Gate 5C HTTP pickup",
      reservationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      storeId,
      storeNameSnapshot: marker,
      storeSlugSnapshot: marker,
      subtotal: total,
      payment: { create: { amount: total, currency: "IQD", method: "PAY_AT_PICKUP" } },
    },
  });
}

function assertError(result: { body: Record<string, unknown>; response: Response }, status: number, code: string) {
  assert.equal(result.response.status, status, JSON.stringify(result.body));
  assert.equal((result.body.error as { code: string }).code, code);
  assert.doesNotMatch(JSON.stringify(result.body), sensitivePattern());
}

function sensitivePattern() {
  return /DATABASE_URL|BETTER_AUTH_SECRET|postgresql:\/\/|webhookSecret|authorization header|provider access token|objectKey|rawProvider|api[_-]?key/i;
}
