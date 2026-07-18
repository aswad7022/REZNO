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
  listAdminCategories,
  transitionAdminCategory,
} from "../../features/commerce/services/admin-category-service";
import { listAdminCommerceAudit } from "../../features/commerce/services/admin-commerce-audit-service";
import { getAdminCommerceOverview } from "../../features/commerce/services/admin-commerce-overview-service";
import { correctAdminInventory, getAdminInventoryDetail, listAdminInventory } from "../../features/commerce/services/admin-inventory-service";
import { getAdminOrderDetail, listAdminOrders } from "../../features/commerce/services/admin-order-query-service";
import { getAdminProductDetail, listAdminProducts, moderateAdminProduct } from "../../features/commerce/services/admin-product-service";
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
const probeIds = {
  adminAudit: [] as string[],
  categories: [] as string[],
  inventory: [] as string[],
  movements: [] as string[],
  orders: [] as string[],
  products: [] as string[],
  variants: [] as string[],
};
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

  phase = "admin-cursor-pagination-probes";
  await runAdminPaginationProbes(admins);
  evidence.add("admin-order-clock-filtered-pagination-audit-history");

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

async function runAdminPaginationProbes(admins: Record<keyof typeof profiles, AdminSession>) {
  const categoryRows = [];
  for (let index = 0; index < 21; index += 1) {
    const row = await prisma.marketplaceCategory.create({ data: {
      name: `Stage 3D Pagination Category ${runId} ${index}`,
      normalizedName: `stage 3d pagination category ${runId} ${index}`,
      slug: `stage3d-pagination-category-${runId}-${index}`,
      status: "INACTIVE",
    } });
    categoryRows.push(row); probeIds.categories.push(row.id);
  }
  const productRows = [];
  const inventoryRows = [];
  for (let index = 0; index < 21; index += 1) {
    const product = await prisma.product.create({ data: {
      categoryId: FIXTURE.categories.active[0],
      name: `Stage 3D Pagination Product ${runId} ${index}`,
      normalizedSearchText: `stage 3d pagination product ${runId} ${index}`,
      slug: `stage3d-pagination-product-${runId}-${index}`,
      status: "DRAFT",
      storeId: FIXTURE.stores.active[0],
    } });
    productRows.push(product); probeIds.products.push(product.id);
    const variant = await prisma.productVariant.create({ data: {
      currency: "IQD", isDefault: true, optionKey: `pagination-${index}`, optionValues: {}, price: "10000",
      productId: product.id, sku: `STAGE3D-PAGE-${runId}-${index}`, storeId: FIXTURE.stores.active[0], title: `Pagination ${index}`,
    } });
    probeIds.variants.push(variant.id);
    const inventory = await prisma.inventoryItem.create({ data: { onHand: 5, reserved: 1, variantId: variant.id } });
    inventoryRows.push(inventory); probeIds.inventory.push(inventory.id);
  }

  const deadline = new Date("2030-07-18T10:00:00.000Z");
  const beforeDeadline = new Date("2030-07-18T09:59:59.000Z");
  const afterDeadline = new Date("2030-07-18T10:00:01.000Z");
  const orderRows = [];
  for (let index = 0; index < 21; index += 1) {
    const order = await prisma.order.create({ data: {
      currency: "IQD", customerId: FIXTURE.customerId, customerNameSnapshot: `Pagination Customer ${index}`,
      customerPhoneSnapshot: "+9647500033000", fulfillmentMethod: "CUSTOMER_PICKUP", grandTotal: "10000",
      orderNumber: `RZ-STAGE3D-PAGE-${runId}-${index}`, paymentMethod: "PAY_AT_PICKUP",
      reservationExpiresAt: deadline, storeId: FIXTURE.stores.active[0],
      storeNameSnapshot: "Stage 3D Active Store", storeSlugSnapshot: FIXTURE.stores.active[1], subtotal: "10000",
    } });
    orderRows.push(order); probeIds.orders.push(order.id);
  }

  const orderBase = {
    limit: 5,
    orderStatus: "PENDING" as const,
    organizationId: FIXTURE.organizations.active[0],
    overdue: false,
    query: `RZ-STAGE3D-PAGE-${runId}`,
    storeId: FIXTURE.stores.active[0],
  };
  const firstOrders = await listAdminOrders(admins.ordersView.context, orderBase, { now: () => beforeDeadline });
  assert.ok(firstOrders.pageInfo.nextCursor);
  assert.equal(firstOrders.evaluationTime, beforeDeadline.toISOString());
  const orderIds = firstOrders.data.map((item) => item.id);
  let orderCursor: string | undefined = firstOrders.pageInfo.nextCursor ?? undefined;
  while (orderCursor) {
    const next = await listAdminOrders(admins.ordersView.context, { ...orderBase, cursor: orderCursor }, { now: () => afterDeadline });
    assert.equal(next.evaluationTime, beforeDeadline.toISOString());
    assert.equal(next.data.every((item) => item.overdue === false), true);
    orderIds.push(...next.data.map((item) => item.id));
    orderCursor = next.pageInfo.nextCursor ?? undefined;
  }
  assert.equal(new Set(orderIds).size, orderIds.length);
  assert.deepEqual(new Set(orderIds), new Set(orderRows.map((item) => item.id)));
  assert.equal((await listAdminOrders(admins.ordersView.context, orderBase, { now: () => afterDeadline })).data.length, 0);
  assert.equal((await listAdminOrders(admins.ordersView.context, { ...orderBase, overdue: true }, { now: () => afterDeadline })).data.every((item) => item.overdue), true);
  await assert.rejects(listAdminOrders(admins.ordersView.context, {
    ...orderBase, cursor: firstOrders.pageInfo.nextCursor!, overdue: true,
  }, { now: () => afterDeadline }), isCode("INVALID_CURSOR"));
  await assert.rejects(listAdminOrders(admins.ordersManage.context, {
    ...orderBase, cursor: firstOrders.pageInfo.nextCursor!,
  }, { now: () => afterDeadline }), isCode("INVALID_CURSOR"));
  const changedSize = await listAdminOrders(admins.ordersView.context, {
    ...orderBase, cursor: firstOrders.pageInfo.nextCursor!, limit: 7,
  }, { now: () => afterDeadline });
  assert.equal(changedSize.evaluationTime, beforeDeadline.toISOString());
  assert.equal(changedSize.data.some((item) => firstOrders.data.some((first) => first.id === item.id)), false);

  await assertServicePagination(
    categoryRows.map((item) => item.id),
    (cursor) => listAdminCategories(admins.catalogView.context, { cursor, limit: 7, search: runId, status: "INACTIVE" }),
  );
  await assertServicePagination(
    productRows.map((item) => item.id),
    (cursor) => listAdminProducts(admins.catalogView.context, { cursor, limit: 7, search: runId, status: "DRAFT", storeStatus: "ACTIVE" }),
  );
  await assertServicePagination(
    inventoryRows.map((item) => item.id),
    (cursor) => listAdminInventory(admins.inventoryView.context, { availability: "in_stock", cursor, limit: 7, query: runId, reserved: true }),
  );

  for (let index = 0; index < 35; index += 1) {
    const audit = await prisma.adminAuditLog.create({ data: {
      action: `commerce.pagination.${runId}`, adminUserId: admins.auditView.userId,
      metadata: { authorization: "PRIVATE-STAGING-AUDIT", safe: `row-${index}` },
      targetId: productRows[0]!.id, targetType: "Product",
    } });
    probeIds.adminAudit.push(audit.id);
  }
  for (const action of [`admin.pagination.${runId}`, `settings.pagination.${runId}`]) {
    const audit = await prisma.adminAuditLog.create({ data: {
      action, adminUserId: admins.auditView.userId, metadata: { sentinel: "NON-COMMERCE-STAGING" },
      targetId: productRows[0]!.id, targetType: "Product",
    } });
    probeIds.adminAudit.push(audit.id);
  }
  const auditFirst = await listAdminCommerceAudit(admins.auditView.context, {
    action: `commerce.pagination.${runId}`, limit: 10, targetId: productRows[0]!.id, targetType: "Product",
  });
  assert.ok(auditFirst.pageInfo.nextCursor);
  assert.equal(auditFirst.data.every((item) => item.action.startsWith("commerce.")), true);
  assert.equal(JSON.stringify(auditFirst.data).includes("PRIVATE-STAGING-AUDIT"), false);
  await assert.rejects(listAdminCommerceAudit(admins.auditView.context, { action: "admin.", limit: 10 }), isCode("VALIDATION_ERROR"));

  for (let index = 0; index < 21; index += 1) {
    const movement = await prisma.stockMovement.create({ data: {
      actorType: "ADMIN", idempotencyKey: randomUUID(), inventoryItemId: inventoryRows[0]!.id,
      metadata: { private: "PRIVATE-STAGING-MOVEMENT" }, onHandDelta: 1, quantity: 1,
      reason: `Stage 3D pagination ${runId} ${index}`, reservedDelta: 0, resultingOnHand: 6,
      resultingReserved: 1, type: "ADJUSTMENT_IN",
    } });
    probeIds.movements.push(movement.id);
  }
  const movementFirst = await getAdminInventoryDetail(admins.inventoryView.context, inventoryRows[0]!.id, { limit: 10 });
  assert.ok(movementFirst.movements.pageInfo.nextCursor);
  const movementSecond = await getAdminInventoryDetail(admins.inventoryView.context, inventoryRows[0]!.id, {
    cursor: movementFirst.movements.pageInfo.nextCursor!, limit: 10,
  });
  assert.equal(JSON.stringify(movementSecond.movements.data).includes("PRIVATE-STAGING-MOVEMENT"), false);
  await assert.rejects(getAdminInventoryDetail(admins.inventoryView.context, inventoryRows[1]!.id, {
    cursor: movementFirst.movements.pageInfo.nextCursor!, limit: 10,
  }), isCode("INVALID_CURSOR"));

  for (let index = 0; index < 21; index += 1) {
    const audit = await prisma.adminAuditLog.create({ data: {
      action: `commerce.store.pagination-${runId}`, adminUserId: admins.storesView.userId,
      targetId: FIXTURE.stores.active[0], targetType: "Store",
    } });
    probeIds.adminAudit.push(audit.id);
  }

  const htmlQueries = [
    [`/admin/commerce/categories?q=${runId}&status=INACTIVE`, admins.catalogView, ["q", "status"]],
    [`/admin/commerce/products?q=${runId}&status=DRAFT&storeStatus=ACTIVE`, admins.catalogView, ["q", "status", "storeStatus"]],
    [`/admin/commerce/inventory?q=${runId}&availability=in_stock&reserved=true`, admins.inventoryView, ["q", "availability", "reserved"]],
    [`/admin/commerce/orders?q=${encodeURIComponent(`RZ-STAGE3D-PAGE-${runId}`)}&status=PENDING&overdue=false&organizationId=${FIXTURE.organizations.active[0]}&storeId=${FIXTURE.stores.active[0]}`, admins.ordersView, ["q", "status", "overdue", "organizationId", "storeId"]],
    [`/admin/commerce/audit?action=commerce.pagination.${runId}&targetType=Product&targetId=${productRows[0]!.id}`, admins.auditView, ["action", "targetType", "targetId"]],
  ] as const;
  for (const [path, session, filters] of htmlQueries) {
    const first = await page(path, session.cookie);
    const href = nextPageHref(first.text);
    const next = new URL(href, baseUrl);
    const original = new URL(path, baseUrl);
    for (const filter of filters) assert.equal(next.searchParams.get(filter), original.searchParams.get(filter));
    assert.equal((await page(`${next.pathname}${next.search}`, session.cookie)).response.status, 200);
    assert.equal((await page(path, session.cookie, true)).response.status, 200);
  }
  const changedOrder = new URL(nextPageHref((await page(htmlQueries[3][0], admins.ordersView.cookie)).text), baseUrl);
  const orderHtmlFirst = await page(htmlQueries[3][0], admins.ordersView.cookie);
  const orderEvaluation = orderHtmlFirst.text.match(/عند ([0-9T:.\-]+Z)/)?.[1];
  assert.ok(orderEvaluation);
  const orderHtmlNext = new URL(nextPageHref(orderHtmlFirst.text), baseUrl);
  assert.match((await page(`${orderHtmlNext.pathname}${orderHtmlNext.search}`, admins.ordersView.cookie)).text, new RegExp(orderEvaluation));
  changedOrder.searchParams.set("overdue", "true");
  assertVisibleValidation(await page(`${changedOrder.pathname}${changedOrder.search}`, admins.ordersView.cookie));
  assertVisibleValidation(await page(`/admin/commerce/audit?action=admin.pagination.${runId}`, admins.auditView.cookie));

  const movementPage = await page(`/admin/commerce/inventory/${inventoryRows[0]!.id}`, admins.inventoryView.cookie);
  const movementHref = nextPageHref(movementPage.text);
  assert.equal((await page(movementHref, admins.inventoryView.cookie)).response.status, 200);
  assertVisibleValidation(await page(`/admin/commerce/inventory/${inventoryRows[1]!.id}${new URL(movementHref, baseUrl).search}`, admins.inventoryView.cookie));
  const storePage = await page(`/admin/commerce/stores/${FIXTURE.stores.active[0]}`, admins.storesView.cookie);
  const storeHref = nextPageHref(storePage.text, "auditCursor");
  assert.equal((await page(storeHref, admins.storesView.cookie)).response.status, 200);

  await cleanupPaginationProbes();
  assert.deepEqual(await probeCounts(), { adminAudit: 0, categories: 0, inventory: 0, movements: 0, orders: 0, products: 0, variants: 0 });
}

async function assertServicePagination(
  expectedIds: string[],
  fetchPage: (cursor?: string) => Promise<{ data: Array<{ id: string }>; pageInfo: { nextCursor: string | null } }>,
) {
  const actual: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    actual.push(...page.data.map((item) => item.id));
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(new Set(actual).size, actual.length);
  assert.deepEqual(new Set(actual), new Set(expectedIds));
}

function nextPageHref(html: string, cursorName = "cursor") {
  const value = html.match(new RegExp(`href="([^"]*${cursorName}=[^"]+)"`))?.[1]
    ?.replaceAll("&amp;", "&");
  assert.ok(value, `Expected ${cursorName} pagination link.`);
  return value;
}

function assertVisibleValidation(result: { response: Response; text: string }) {
  assert.equal(result.response.status, 200);
  assert.match(result.text, /role="alert"|VALIDATION_ERROR|INVALID_CURSOR|digest/);
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

async function cleanupPaginationProbes() {
  await prisma.$transaction(async (transaction) => {
    if (probeIds.movements.length) await transaction.stockMovement.deleteMany({ where: { id: { in: probeIds.movements } } });
    if (probeIds.adminAudit.length) await transaction.adminAuditLog.deleteMany({ where: { id: { in: probeIds.adminAudit } } });
    if (probeIds.orders.length) await transaction.order.deleteMany({ where: { id: { in: probeIds.orders } } });
    if (probeIds.inventory.length) await transaction.inventoryItem.deleteMany({ where: { id: { in: probeIds.inventory } } });
    if (probeIds.variants.length) await transaction.productVariant.deleteMany({ where: { id: { in: probeIds.variants } } });
    if (probeIds.products.length) await transaction.product.deleteMany({ where: { id: { in: probeIds.products } } });
    if (probeIds.categories.length) await transaction.marketplaceCategory.deleteMany({ where: { id: { in: probeIds.categories } } });
  }, { timeout: 120_000 });
}

async function probeCounts() {
  const [adminAudit, categories, inventory, movements, orders, products, variants] = await Promise.all([
    prisma.adminAuditLog.count({ where: { id: { in: probeIds.adminAudit } } }),
    prisma.marketplaceCategory.count({ where: { id: { in: probeIds.categories } } }),
    prisma.inventoryItem.count({ where: { id: { in: probeIds.inventory } } }),
    prisma.stockMovement.count({ where: { id: { in: probeIds.movements } } }),
    prisma.order.count({ where: { id: { in: probeIds.orders } } }),
    prisma.product.count({ where: { id: { in: probeIds.products } } }),
    prisma.productVariant.count({ where: { id: { in: probeIds.variants } } }),
  ]);
  return { adminAudit, categories, inventory, movements, orders, products, variants };
}

async function cleanup() {
  await cleanupPaginationProbes();
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
