import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { AdminAccessRole, AdminAccessStatus } from "@prisma/client";

import { allAdminPermissions, type AdminPermission } from "../../features/admin/config/permissions";
import { serializeCart } from "../../features/commerce/api/dto";
import { CommerceDomainError } from "../../features/commerce/domain/errors";
import { addCartItem, getCustomerCart } from "../../features/commerce/services/cart-service";
import { createPendingOrder } from "../../features/commerce/services/checkout-service";
import {
  getAdminCategoryDetail,
  transitionAdminCategory,
} from "../../features/commerce/services/admin-category-service";
import { listAdminCommerceAudit } from "../../features/commerce/services/admin-commerce-audit-service";
import { getAdminCommerceOverview } from "../../features/commerce/services/admin-commerce-overview-service";
import { correctAdminInventory } from "../../features/commerce/services/admin-inventory-service";
import { getAdminOrderDetail, listAdminOrders } from "../../features/commerce/services/admin-order-query-service";
import { getAdminProductDetail, moderateAdminProduct } from "../../features/commerce/services/admin-product-service";
import { getAdminStoreDetail, listAdminStores } from "../../features/commerce/services/admin-store-query-service";
import type { CommerceAdminContext } from "../../features/commerce/services/authorization";
import { getMerchantCommerceReports } from "../../features/commerce/services/merchant-report-service";
import { interveneAdminOrder } from "../../features/commerce/services/order-service";
import { approveStore } from "../../features/commerce/services/store-service";
import { getPublicProduct } from "../../features/commerce/public/catalog-service";
import { prisma } from "../../lib/db/prisma";
import {
  COMMERCE_ADMIN_STAGE3D_FIXTURE as FIXTURE,
  seedCommerceAdminStage3dFixture,
} from "./commerce-admin-stage3d-seed-core";
import { assertCommerceAdminStage3dSmokeSafety } from "./commerce-admin-stage3d-smoke-safety";

type Session = { cookie: string; personId: string; userId: string };
type AdminSession = Session & { context: CommerceAdminContext };

const baseUrl = process.env.COMMERCE_STAGING_BASE_URL?.replace(/\/$/, "") ?? "";
const authBaseUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const oidcToken = process.env.VERCEL_OIDC_TOKEN ?? "";
const runId = randomUUID().replaceAll("-", "").slice(0, 16);
const userIds: string[] = [];
const personIds: string[] = [];
const cartIds: string[] = [];
const sideEffectEvidence = {
  adminAuditDelta: 0,
  historyDelta: 0,
  movementDelta: 0,
  notificationDelta: 0,
  restoredAdminAudits: 0,
  restoredHistories: 0,
  restoredMovements: 0,
  restoredNotifications: 0,
};
let baselineFingerprint = "";
let phase = "safety";
const evidence = new Set<string>();

const profiles = {
  storesView: ["COMMERCE_STORES_VIEW"],
  storesReview: ["COMMERCE_STORES_VIEW", "COMMERCE_STORES_REVIEW"],
  catalogView: ["COMMERCE_CATALOG_VIEW"],
  catalogModerate: ["COMMERCE_CATALOG_VIEW", "COMMERCE_CATALOG_MODERATE"],
  inventoryView: ["COMMERCE_INVENTORY_VIEW"],
  inventoryManage: ["COMMERCE_INVENTORY_VIEW", "COMMERCE_INVENTORY_MANAGE"],
  ordersView: ["COMMERCE_ORDERS_VIEW"],
  ordersManage: ["COMMERCE_ORDERS_VIEW", "COMMERCE_ORDERS_MANAGE"],
  auditView: ["AUDIT_LOG_VIEW"],
} as const satisfies Record<string, readonly AdminPermission[]>;

async function main() {
  const database = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assertCommerceAdminStage3dSmokeSafety({
    authBaseUrl,
    baseUrl,
    confirmation: process.env.COMMERCE_ADMIN_STAGE3D_SMOKE_CONFIRM,
    database: database[0]?.database ?? "",
    vercelEnvironment: process.env.VERCEL_ENV,
  });
  assert.ok(bypass || oidcToken, "Vercel preview protection authentication is required.");

  phase = "fixture-baseline";
  baselineFingerprint = (await resetFixture()).fingerprint;

  phase = "authenticated-admin-profiles";
  const admins = {} as Record<keyof typeof profiles, AdminSession>;
  let suffix = 1;
  for (const [key, permissions] of Object.entries(profiles) as Array<[
    keyof typeof profiles,
    readonly AdminPermission[],
  ]>) admins[key] = await createAdmin(key, [...permissions], { suffix: suffix++ });
  const superAdmin = await createAdmin("super-admin", [], { role: "SUPER_ADMIN", suffix: suffix++ });
  const expired = await createAdmin("expired", ["COMMERCE_CATALOG_VIEW"], {
    expiresAt: new Date("2020-01-01T00:00:00.000Z"), suffix: suffix++,
  });
  const revoked = await createAdmin("revoked", ["COMMERCE_ORDERS_VIEW"], {
    status: "REVOKED", suffix: suffix++,
  });
  const foreign = await signUp("foreign-non-admin", suffix++);
  const merchant = await signUp("reports-merchant", suffix++);
  await prisma.organizationMember.create({ data: {
    organizationId: FIXTURE.organizations.active[0], personId: merchant.personId,
    roleId: FIXTURE.merchant.roleId, status: "ACTIVE",
  } });

  phase = "html-rsc-role-boundaries";
  const scopeRoutes: Array<[AdminSession, string, string]> = [
    [admins.storesView, "/admin/commerce/stores", "/admin/commerce/orders"],
    [admins.catalogView, "/admin/commerce/products", "/admin/commerce/stores"],
    [admins.inventoryView, "/admin/commerce/inventory", "/admin/commerce/products"],
    [admins.ordersView, "/admin/commerce/orders", "/admin/commerce/inventory"],
    [admins.auditView, "/admin/commerce/audit", "/admin/commerce/orders"],
  ];
  for (const [session, allowed, denied] of scopeRoutes) {
    for (const rsc of [false, true]) {
      const hub = await page("/admin/commerce", session.cookie, rsc);
      assert.equal(hub.response.status, 200);
      assert.match(routeText(hub.text), new RegExp(allowed));
      assert.equal(routeText(hub.text).includes(denied), false);
      assertForbidden(await page(denied, session.cookie, rsc));
    }
  }
  assert.equal((await page("/admin/commerce", superAdmin.cookie)).response.status, 200);
  assertForbidden(await page("/admin/commerce", expired.cookie));
  assertForbidden(await page("/admin/commerce", revoked.cookie));
  assertForbidden(await page("/admin/commerce", foreign.cookie));
  evidence.add("role-html-rsc-direct-route");

  phase = "service-scope-and-redaction";
  assert.ok((await getAdminCommerceOverview(admins.ordersView.context)).orders);
  assert.equal((await getAdminCommerceOverview(admins.ordersView.context)).stores, null);
  assert.ok((await listAdminStores(admins.storesView.context, { limit: 20 })).data.length >= 6);
  const orderList = await listAdminOrders(admins.ordersView.context, { limit: 20 });
  assert.equal(JSON.stringify(orderList).includes("PRIVATE STAGE3D"), false);
  assert.ok((await getAdminOrderDetail(admins.ordersView.context, FIXTURE.orders.pending)).order.customer.phone);
  await assert.rejects(listAdminOrders(admins.catalogView.context, { limit: 20 }), isCode("FORBIDDEN"));
  evidence.add("scoped-admin-dtos-pii");

  phase = "store-moderation";
  await resetFixture();
  const pending = await prisma.store.findUniqueOrThrow({ where: { id: FIXTURE.stores.pending[0] } });
  const storeInput = {
    expectedVersion: pending.updatedAt.toISOString(), idempotencyKey: randomUUID(), reason: null,
    storeId: pending.id,
  };
  const approved = await approveStore(admins.storesReview.context, storeInput);
  assert.deepEqual(await approveStore(admins.storesReview.context, storeInput), approved);
  assert.equal(await prisma.adminAuditLog.count({ where: { idempotencyKey: storeInput.idempotencyKey } }), 1);
  assert.equal((await getAdminStoreDetail(admins.storesView.context, pending.id)).profile.status, "ACTIVE");
  evidence.add("store-moderation-replay");

  phase = "category-impact";
  await resetFixture();
  const cart = await addCartItem(foreign.personId, { quantity: 1, variantId: FIXTURE.variant(2) });
  cartIds.push(cart.id);
  assert.equal(serializeCart(await getCustomerCart(foreign.personId))?.availability, true);
  const category = await getAdminCategoryDetail(admins.catalogModerate.context, FIXTURE.categories.active[0]);
  const activeOrderBefore = await prisma.order.findUniqueOrThrow({ where: { id: FIXTURE.orders.confirmed } });
  await transitionAdminCategory(admins.catalogModerate.context, {
    action: "deactivate", categoryId: FIXTURE.categories.active[0], confirmPublishedImpact: true,
    expectedVersion: category.expectedVersion!, idempotencyKey: randomUUID(), reason: "Staging catalog impact probe",
  });
  await assert.rejects(getPublicProduct(FIXTURE.stores.active[1], "stage3d-published"));
  const unavailableCart = await getCustomerCart(foreign.personId);
  assert.equal(serializeCart(unavailableCart)?.availability, false);
  await assert.rejects(createPendingOrder({
    cartId: unavailableCart!.id, cartVersion: unavailableCart!.version, customerId: foreign.personId,
    fulfillmentMethod: "CUSTOMER_PICKUP", idempotencyKey: randomUUID(),
  }), isCode("PRODUCT_UNAVAILABLE"));
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: activeOrderBefore.id } })).status, activeOrderBefore.status);
  evidence.add("category-public-cart-checkout-order-preservation");

  phase = "product-moderation";
  await resetFixture();
  const product = await getAdminProductDetail(admins.catalogModerate.context, FIXTURE.products.published);
  const productInput = {
    action: "suspend" as const, expectedVersion: product.expectedVersion!, idempotencyKey: randomUUID(),
    productId: FIXTURE.products.published, reason: "Staging Product moderation probe",
  };
  const suspended = await moderateAdminProduct(admins.catalogModerate.context, productInput);
  assert.deepEqual(await moderateAdminProduct(admins.catalogModerate.context, productInput), suspended);
  await assert.rejects(getPublicProduct(FIXTURE.stores.active[1], "stage3d-published"));
  assert.equal(serializeCart(await getCustomerCart(foreign.personId))?.availability, false);
  const suspendedDetail = await getAdminProductDetail(admins.catalogModerate.context, FIXTURE.products.published);
  await moderateAdminProduct(admins.catalogModerate.context, {
    action: "clear", expectedVersion: suspendedDetail.expectedVersion!, idempotencyKey: randomUUID(),
    productId: FIXTURE.products.published, reason: "Staging Product clearance probe",
  });
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: FIXTURE.products.published } })).status, "DRAFT");
  evidence.add("product-suspend-replay-clear");

  phase = "inventory-correction";
  await resetFixture();
  const inventory = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: FIXTURE.inventory(2) } });
  const sideEffectsBefore = await prisma.stockMovement.count({ where: { inventoryItemId: inventory.id } });
  await assert.rejects(correctAdminInventory(admins.inventoryManage.context, {
    expectedVersion: inventory.version, idempotencyKey: randomUUID(), inventoryItemId: inventory.id,
    quantityDelta: -3, reason: "Reserved floor denial probe",
  }), isCode("INSUFFICIENT_STOCK"));
  const correction = {
    expectedVersion: inventory.version, idempotencyKey: randomUUID(), inventoryItemId: inventory.id,
    quantityDelta: -1, reason: "Verified staging physical count",
  };
  const corrected = await correctAdminInventory(admins.inventoryManage.context, correction);
  assert.deepEqual(await correctAdminInventory(admins.inventoryManage.context, correction), corrected);
  assert.equal(await prisma.stockMovement.count({ where: { inventoryItemId: inventory.id } }), sideEffectsBefore + 1);
  evidence.add("inventory-floor-correction-replay");

  phase = "order-interventions";
  await resetFixture();
  const interventionOrderIds = [FIXTURE.orders.overdue, FIXTURE.orders.pending];
  const notificationScope = {
    OR: interventionOrderIds.map((orderId) => ({ eventKey: { startsWith: `commerce:${orderId}:` } })),
  };
  const orderSideEffectsBefore = {
    adminAudit: await prisma.adminAuditLog.count({ where: { targetId: { in: interventionOrderIds }, targetType: "Order" } }),
    history: await prisma.orderStatusHistory.count({ where: { orderId: { in: interventionOrderIds } } }),
    movement: await prisma.stockMovement.count({ where: { orderId: { in: interventionOrderIds } } }),
    notification: await prisma.notification.count({ where: notificationScope }),
  };
  const overdue = await prisma.order.findUniqueOrThrow({ where: { id: FIXTURE.orders.overdue } });
  await interveneAdminOrder(admins.ordersManage.context, {
    action: "expire", expectedVersion: overdue.updatedAt.toISOString(), idempotencyKey: randomUUID(),
    orderId: overdue.id, reason: "Staging overdue expiration", returnedStock: false,
  });
  const pendingOrder = await prisma.order.findUniqueOrThrow({ where: { id: FIXTURE.orders.pending } });
  const cancelInput = {
    action: "cancel" as const, expectedVersion: pendingOrder.updatedAt.toISOString(), idempotencyKey: randomUUID(),
    orderId: pendingOrder.id, reason: "Staging administrative cancellation", returnedStock: false,
  };
  const cancelled = await interveneAdminOrder(admins.ordersManage.context, cancelInput);
  assert.deepEqual(await interveneAdminOrder(admins.ordersManage.context, cancelInput), cancelled);
  const paid = await prisma.order.findUniqueOrThrow({ where: { id: FIXTURE.orders.paid } });
  await assert.rejects(interveneAdminOrder(admins.ordersManage.context, {
    action: "cancel", expectedVersion: paid.updatedAt.toISOString(), idempotencyKey: randomUUID(),
    orderId: paid.id, reason: "Paid denial probe", returnedStock: false,
  }), isCode("INVALID_TRANSITION"));
  const out = await prisma.order.update({ where: { id: FIXTURE.orders.preparing }, data: { fulfillmentStatus: "OUT_FOR_DELIVERY" } });
  await assert.rejects(interveneAdminOrder(admins.ordersManage.context, {
    action: "cancel", expectedVersion: out.updatedAt.toISOString(), idempotencyKey: randomUUID(),
    orderId: out.id, reason: "Out for delivery denial probe", returnedStock: false,
  }), isCode("INVALID_TRANSITION"));
  const orderSideEffectsAfter = {
    adminAudit: await prisma.adminAuditLog.count({ where: { targetId: { in: interventionOrderIds }, targetType: "Order" } }),
    history: await prisma.orderStatusHistory.count({ where: { orderId: { in: interventionOrderIds } } }),
    movement: await prisma.stockMovement.count({ where: { orderId: { in: interventionOrderIds } } }),
    notification: await prisma.notification.count({ where: notificationScope }),
  };
  sideEffectEvidence.adminAuditDelta = orderSideEffectsAfter.adminAudit - orderSideEffectsBefore.adminAudit;
  sideEffectEvidence.historyDelta = orderSideEffectsAfter.history - orderSideEffectsBefore.history;
  sideEffectEvidence.movementDelta = orderSideEffectsAfter.movement - orderSideEffectsBefore.movement;
  sideEffectEvidence.notificationDelta = orderSideEffectsAfter.notification - orderSideEffectsBefore.notification;
  assert.deepEqual({
    adminAuditDelta: sideEffectEvidence.adminAuditDelta,
    historyDelta: sideEffectEvidence.historyDelta,
    movementDelta: sideEffectEvidence.movementDelta,
    notificationDelta: sideEffectEvidence.notificationDelta,
  }, { adminAuditDelta: 2, historyDelta: 2, movementDelta: 2, notificationDelta: 6 });
  evidence.add("order-expire-cancel-replay-paid-delivery-denial");

  phase = "audit-and-reports";
  const audit = await listAdminCommerceAudit(admins.auditView.context, { limit: 2 });
  assert.ok(audit.data.length > 0);
  if (audit.pageInfo.nextCursor) {
    await assert.rejects(listAdminCommerceAudit(admins.auditView.context, {
      cursor: audit.pageInfo.nextCursor, limit: 2, targetType: "Product",
    }), isCode("INVALID_CURSOR"));
  }
  const report = await getMerchantCommerceReports({
    contextOrganizationId: FIXTURE.organizations.active[0],
    membershipId: FIXTURE.merchant.membershipId,
    personId: FIXTURE.merchant.personId,
  }, {});
  assert.equal(report.store?.id, FIXTURE.stores.active[0]);
  assert.equal(JSON.stringify(report).includes("PRIVATE STAGE3D"), false);
  const merchantCookie = `${merchant.cookie}; rezno-active-business-id=${FIXTURE.organizations.active[0]}`;
  assert.equal((await page("/business/commerce/reports", merchantCookie)).response.status, 200);
  evidence.add("audit-pagination-merchant-reports");

  phase = "restore-and-counts";
  const restored = await resetFixture();
  assert.equal(restored.fingerprint, baselineFingerprint);
  sideEffectEvidence.restoredHistories = await prisma.orderStatusHistory.count({ where: { orderId: { in: Object.values(FIXTURE.orders) } } });
  sideEffectEvidence.restoredMovements = await prisma.stockMovement.count({ where: { orderId: { in: Object.values(FIXTURE.orders) } } });
  sideEffectEvidence.restoredAdminAudits = await prisma.adminAuditLog.count({ where: { id: { in: [1, 2, 3, 4].map(FIXTURE.adminAudit) } } });
  sideEffectEvidence.restoredNotifications = await prisma.notification.count({
    where: { OR: Object.values(FIXTURE.orders).map((orderId) => ({ eventKey: { startsWith: `commerce:${orderId}:` } })) },
  });
  assert.deepEqual({
    adminAudits: sideEffectEvidence.restoredAdminAudits,
    histories: sideEffectEvidence.restoredHistories,
    movements: sideEffectEvidence.restoredMovements,
    notifications: sideEffectEvidence.restoredNotifications,
  }, { adminAudits: 4, histories: 8, movements: 8, notifications: 0 });
  evidence.add("deterministic-restore-exact-counts");
}

async function resetFixture() {
  return seedCommerceAdminStage3dFixture(prisma);
}

async function signUp(label: string, suffix: number): Promise<Session> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      body: JSON.stringify({
        email: `stage3d-${runId}-${label}@rezno.invalid`, name: `Stage 3D ${label}`,
        password: `Rz!${randomUUID()}${randomUUID()}`,
      }),
      headers: requestHeaders({ "content-type": "application/json", origin: authBaseUrl, "user-agent": `rezno-stage3d-${runId}-${label}` }),
      method: "POST", redirect: "manual",
    });
    if (response.status !== 429) break;
    const retryAfter = Math.min(30, Math.max(1, Number(response.headers.get("retry-after") ?? "30")));
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000 + 250));
  }
  assert.ok(response);
  assert.equal(response.status, 200, `Authentication failed for ${label} with status ${response.status}.`);
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id },
    data: { isOnboarded: true, phone: `+964750006${String(suffix).padStart(3, "0")}`, status: "ACTIVE" },
  });
  userIds.push(payload.user.id); personIds.push(person.id);
  return { cookie: cookie.split(";")[0]!, personId: person.id, userId: payload.user.id };
}

async function createAdmin(label: string, permissions: AdminPermission[], options: {
  expiresAt?: Date;
  role?: AdminAccessRole;
  status?: AdminAccessStatus;
  suffix: number;
}): Promise<AdminSession> {
  const session = await signUp(label, options.suffix);
  const access = await prisma.adminAccess.create({ data: {
    expiresAt: options.expiresAt, permissions, role: options.role ?? "ADMIN",
    status: options.status ?? "ACTIVE", userId: session.userId,
  } });
  const isSuperAdmin = options.role === "SUPER_ADMIN";
  return { ...session, context: {
    adminAccessId: access.id, isSuperAdmin, personId: session.personId,
    permissions: isSuperAdmin ? allAdminPermissions : permissions, source: "database", userId: session.userId,
  } };
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

function requestHeaders(initial: Record<string, string>) {
  const headers = new Headers(initial);
  if (bypass) headers.set("x-vercel-protection-bypass", bypass);
  else headers.set("x-vercel-trusted-oidc-idp-token", oidcToken);
  return headers;
}

function routeText(value: string) { return value.replaceAll("\\/", "/"); }
function assertForbidden(result: { response: Response; text: string }) {
  assert.ok(result.response.status === 403 || result.text.includes("NEXT_HTTP_ERROR_FALLBACK;403"));
}
function assertNoRaw(value: string) {
  assert.doesNotMatch(value, /DATABASE_URL|PrismaClient|PostgreSQL|postgres(?:ql)?:\/\/|Invalid `prisma\.|Authorization:/i);
}
function isCode(expected: CommerceDomainError["code"]) {
  return (error: unknown) => error instanceof CommerceDomainError && error.code === expected;
}

async function cleanup() {
  if (baselineFingerprint) await resetFixture();
  await prisma.$transaction(async (transaction) => {
    if (cartIds.length) await transaction.cart.deleteMany({ where: { id: { in: cartIds } } });
    await transaction.notification.deleteMany({ where: { recipientPersonId: { in: personIds } } });
    await transaction.organizationMember.deleteMany({ where: { personId: { in: personIds } } });
    await transaction.adminAuditLog.deleteMany({ where: { adminUserId: { in: userIds } } });
    await transaction.adminAccess.deleteMany({ where: { userId: { in: userIds } } });
    await transaction.account.deleteMany({ where: { userId: { in: userIds } } });
    await transaction.session.deleteMany({ where: { userId: { in: userIds } } });
    await transaction.person.deleteMany({ where: { id: { in: personIds } } });
    await transaction.user.deleteMany({ where: { id: { in: userIds } } });
  }, { timeout: 120_000 });
  assert.equal(await prisma.user.count({ where: { id: { in: userIds } } }), 0);
}

async function run() {
  let failure: unknown;
  let cleanupFailure: unknown;
  let failedPhase = "";
  try { await main(); } catch (error) { failure = error; failedPhase = phase; }
  try { await cleanup(); } catch (error) { cleanupFailure = error; }
  await prisma.$disconnect();
  if (failure || cleanupFailure) {
    const detail = [
      failure ? `phase=${failedPhase} ${failure instanceof Error ? failure.message : "unknown failure"}` : "",
      cleanupFailure ? `cleanup=${cleanupFailure instanceof Error ? cleanupFailure.message : "unknown failure"}` : "",
    ].filter(Boolean).join("; ").replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]").slice(0, 700);
    console.error(`Stage 3D authenticated staging smoke failed: ${detail}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Stage 3D authenticated staging smoke passed. identities=14 checks=${evidence.size} ` +
    `deltas=audit:${sideEffectEvidence.adminAuditDelta},history:${sideEffectEvidence.historyDelta},movement:${sideEffectEvidence.movementDelta},notification:${sideEffectEvidence.notificationDelta} ` +
    `restored=audit:${sideEffectEvidence.restoredAdminAudits},history:${sideEffectEvidence.restoredHistories},movement:${sideEffectEvidence.restoredMovements},notification:${sideEffectEvidence.restoredNotifications} ` +
    `cleanup=verified fingerprint=${baselineFingerprint}`,
  );
}

void run();
