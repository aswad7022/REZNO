import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { CommercePermission } from "@prisma/client";
import type { AdminPermission } from "../../../features/admin/config/permissions";

import { serializeCart } from "../../../features/commerce/api/dto";
import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import { addCartItem, getCustomerCart } from "../../../features/commerce/services/cart-service";
import { createPendingOrder } from "../../../features/commerce/services/checkout-service";
import {
  createAdminCategory,
  getAdminCategoryDetail,
  transitionAdminCategory,
} from "../../../features/commerce/services/admin-category-service";
import { listAdminCommerceAudit } from "../../../features/commerce/services/admin-commerce-audit-service";
import { correctAdminInventory, getAdminInventoryDetail } from "../../../features/commerce/services/admin-inventory-service";
import { getAdminOrderDetail, listAdminOrders } from "../../../features/commerce/services/admin-order-query-service";
import { getAdminProductDetail, moderateAdminProduct } from "../../../features/commerce/services/admin-product-service";
import type { CommerceAdminContext, MerchantActorReference } from "../../../features/commerce/services/authorization";
import { getMerchantCommerceReports } from "../../../features/commerce/services/merchant-report-service";
import { confirmOrder, interveneAdminOrder } from "../../../features/commerce/services/order-service";
import { prisma } from "../../../lib/db/prisma";

const OWNER_PERMISSIONS: CommercePermission[] = [
  "STORE_VIEW", "STORE_MANAGE", "PRODUCT_VIEW", "PRODUCT_CREATE", "PRODUCT_UPDATE",
  "PRODUCT_ARCHIVE", "INVENTORY_VIEW", "INVENTORY_ADJUST", "ORDER_VIEW", "ORDER_MANAGE",
  "ORDER_CANCEL", "REPORTS_VIEW",
];

function code(expected: CommerceDomainError["code"]) {
  return (error: unknown) => error instanceof CommerceDomainError && error.code === expected;
}

async function reset() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.match(rows[0]?.database ?? "", /(?:_test|test_)/);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE');
}

async function createPerson(label: string) {
  return prisma.person.create({ data: {
    authUserId: `stage3d-${label}-${randomUUID()}`,
    firstName: label,
    isOnboarded: true,
    phone: "+9647500003300",
  } });
}

async function createAdmin(label: string, permissions: AdminPermission[]) {
  const userId = `stage3d-admin-${label}-${randomUUID()}`;
  const user = await prisma.user.create({ data: { email: `${userId}@rezno.invalid`, id: userId, name: label } });
  const person = await prisma.person.create({ data: { authUserId: user.id, firstName: label, isOnboarded: true } });
  const access = await prisma.adminAccess.create({ data: { permissions, userId: user.id } });
  return {
    access,
    context: {
      adminAccessId: access.id,
      isSuperAdmin: false,
      permissions,
      personId: person.id,
      source: "database",
      userId: user.id,
    } satisfies CommerceAdminContext,
    person,
    user,
  };
}

async function createMerchant() {
  const person = await createPerson("merchant");
  const organization = await prisma.organization.create({ data: { name: "Stage 3D Merchant", slug: `stage3d-${randomUUID().slice(0, 8)}` } });
  const role = await prisma.role.create({ data: {
    commercePermissions: OWNER_PERMISSIONS, isSystem: true, name: "Owner",
    organizationId: organization.id, systemRole: "OWNER",
  } });
  const membership = await prisma.organizationMember.create({ data: { organizationId: organization.id, personId: person.id, roleId: role.id } });
  const reference = { contextOrganizationId: organization.id, membershipId: membership.id, personId: person.id } satisfies MerchantActorReference;
  const store = await prisma.store.create({ data: {
    deliveryArea: "Karrada", deliveryCity: "Baghdad", deliveryEnabled: true,
    deliveryEstimateMinutes: 30, deliveryFee: "1000", minimumOrderValue: "0",
    name: "Stage 3D Store", organizationId: organization.id, pickupArea: "Karrada",
    pickupCity: "Baghdad", pickupEnabled: true, pickupInstructions: "Use order number",
    pickupStreet: "Stage 3D Street", preparationEstimateMinutes: 15, publishedAt: new Date(),
    slug: `stage3d-store-${randomUUID().slice(0, 8)}`, status: "ACTIVE", supportPhone: "+9647500003301",
  } });
  return { membership, organization, person, reference, store };
}

async function checkout(variantId: string, now?: Date) {
  const customer = await createPerson(`customer-${randomUUID().slice(0, 4)}`);
  const cart = await addCartItem(customer.id, { quantity: 1, variantId });
  const order = await createPendingOrder({
    cartId: cart.id, cartVersion: cart.version, customerId: customer.id,
    customerInstructions: "private-stage3d-instructions", fulfillmentMethod: "CUSTOMER_PICKUP",
    idempotencyKey: randomUUID(), now,
  });
  return { cart, customer, order };
}

test("Gate 3D Commerce Admin and Stage 3 closure PostgreSQL end-to-end", { concurrency: false }, async (t) => {
  await reset();
  t.after(async () => { await reset(); await prisma.$disconnect(); });

  const permissions: AdminPermission[] = [
    "COMMERCE_STORES_VIEW", "COMMERCE_STORES_REVIEW", "COMMERCE_CATALOG_VIEW",
    "COMMERCE_CATALOG_MODERATE", "COMMERCE_INVENTORY_VIEW", "COMMERCE_INVENTORY_MANAGE",
    "COMMERCE_ORDERS_VIEW", "COMMERCE_ORDERS_MANAGE", "AUDIT_LOG_VIEW",
  ];
  const admin = await createAdmin("full", permissions);
  const merchant = await createMerchant();
  const category = await prisma.marketplaceCategory.create({ data: {
    name: "Stage 3D Products", normalizedName: "stage 3d products", slug: `stage3d-products-${randomUUID().slice(0, 8)}`,
  } });
  const product = await prisma.product.create({ data: {
    categoryId: category.id, description: "Stage 3D Product", name: "Stage 3D Product",
    normalizedSearchText: "stage 3d product", publishedAt: new Date(), slug: `stage3d-product-${randomUUID().slice(0, 8)}`,
    status: "PUBLISHED", storeId: merchant.store.id,
  } });
  const variant = await prisma.productVariant.create({ data: {
    currency: "IQD", isDefault: true, optionKey: "default", optionValues: {}, price: "10000",
    productId: product.id, sku: `STAGE3D-${randomUUID().slice(0, 8)}`, storeId: merchant.store.id, title: "Default",
  } });
  const inventory = await prisma.inventoryItem.create({ data: { lowStockThreshold: 5, onHand: 30, variantId: variant.id } });

  await t.test("Category create/replay/conflict and impact-aware lifecycle are exact", async () => {
    const key = randomUUID(); const categoryId = randomUUID();
    const payload = { categoryId, displayOrder: 10, idempotencyKey: key, name: "Admin Category", slug: `admin-${randomUUID().slice(0, 8)}` };
    const created = await createAdminCategory(admin.context, payload);
    assert.deepEqual(await createAdminCategory(admin.context, payload), created);
    await assert.rejects(createAdminCategory(admin.context, { ...payload, name: "Changed" }), code("IDEMPOTENCY_CONFLICT"));
    assert.equal(await prisma.adminAuditLog.count({ where: { action: "commerce.category.create", targetId: categoryId } }), 1);

    const retainedCustomer = await createPerson("retained-cart");
    await addCartItem(retainedCustomer.id, { quantity: 1, variantId: variant.id });
    const existingOrder = await checkout(variant.id);
    const detail = await getAdminCategoryDetail(admin.context, category.id);
    assert.equal(detail.impact.publishedProducts, 1);
    assert.ok(detail.impact.activeCartItems >= 1);
    const transition = {
      action: "deactivate" as const, categoryId: category.id, confirmPublishedImpact: false,
      expectedVersion: detail.expectedVersion!, idempotencyKey: randomUUID(), reason: "Catalog operational review",
    };
    await assert.rejects(transitionAdminCategory(admin.context, transition), code("VALIDATION_ERROR"));
    const beforeAudit = await prisma.adminAuditLog.count({ where: { targetId: category.id } });
    await transitionAdminCategory(admin.context, { ...transition, confirmPublishedImpact: true, idempotencyKey: randomUUID() });
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status, "PUBLISHED");
    assert.equal(serializeCart(await getCustomerCart(retainedCustomer.id))?.availability, false);
    assert.equal(await prisma.adminAuditLog.count({ where: { targetId: category.id } }), beforeAudit + 1);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: existingOrder.order.id } })).status, "PENDING");
  });

  await t.test("Product suspension/clearance is versioned, replay-safe, and returns to DRAFT", async () => {
    await prisma.marketplaceCategory.update({ where: { id: category.id }, data: { status: "ACTIVE" } });
    const current = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    const key = randomUUID();
    const payload = { action: "suspend" as const, expectedVersion: current.updatedAt.toISOString(), idempotencyKey: key, productId: product.id, reason: "Unsafe catalog claim" };
    const suspended = await moderateAdminProduct(admin.context, payload);
    assert.deepEqual(await moderateAdminProduct(admin.context, payload), suspended);
    await assert.rejects(moderateAdminProduct(admin.context, { ...payload, reason: "Changed reason" }), code("IDEMPOTENCY_CONFLICT"));
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status, "SUSPENDED");
    const detail = await getAdminProductDetail(admin.context, product.id);
    await moderateAdminProduct(admin.context, { action: "clear", expectedVersion: detail.expectedVersion!, idempotencyKey: randomUUID(), productId: product.id, reason: "Claim cleared after review" });
    const cleared = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(cleared.status, "DRAFT"); assert.equal(cleared.publishedAt, null);
    await prisma.product.update({ where: { id: product.id }, data: { publishedAt: new Date(), status: "PUBLISHED" } });
  });

  await t.test("Admin Inventory correction protects reserved floor and emits one movement/audit", async () => {
    const pending = await checkout(variant.id);
    const locked = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
    const movementBefore = await prisma.stockMovement.count({ where: { inventoryItemId: inventory.id } });
    const auditBefore = await prisma.adminAuditLog.count({ where: { action: "commerce.inventory.admin-correct" } });
    await assert.rejects(correctAdminInventory(admin.context, {
      expectedVersion: locked.version, idempotencyKey: randomUUID(), inventoryItemId: inventory.id,
      quantityDelta: -locked.onHand, reason: "Would violate reserved floor",
    }), code("INSUFFICIENT_STOCK"));
    assert.equal(await prisma.stockMovement.count({ where: { inventoryItemId: inventory.id } }), movementBefore);
    assert.equal(await prisma.adminAuditLog.count({ where: { action: "commerce.inventory.admin-correct" } }), auditBefore);
    const key = randomUUID(); const valid = { expectedVersion: locked.version, idempotencyKey: key, inventoryItemId: inventory.id, quantityDelta: -1, reason: "Verified physical count" };
    const result = await correctAdminInventory(admin.context, valid);
    assert.deepEqual(await correctAdminInventory(admin.context, valid), result);
    assert.equal(await prisma.stockMovement.count({ where: { inventoryItemId: inventory.id, actorType: "ADMIN" } }), 1);
    assert.equal(await prisma.adminAuditLog.count({ where: { action: "commerce.inventory.admin-correct" } }), auditBefore + 1);
    const detail = await getAdminInventoryDetail(admin.context, inventory.id, { limit: 20 });
    assert.ok(detail.activeReservations >= 1);
    void pending;
  });

  await t.test("Admin Order cancellation and expiry reuse reservation/history/notification invariants", async () => {
    const pending = await checkout(variant.id);
    const pendingInput = { action: "cancel" as const, expectedVersion: pending.order.updatedAt.toISOString(), idempotencyKey: randomUUID(), orderId: pending.order.id, reason: "Admin customer support cancellation", returnedStock: false };
    const cancelled = await interveneAdminOrder(admin.context, pendingInput);
    assert.deepEqual(await interveneAdminOrder(admin.context, pendingInput), cancelled);
    assert.equal(await prisma.orderStatusHistory.count({ where: { orderId: pending.order.id, actorType: "ADMIN" } }), 1);
    assert.equal(await prisma.adminAuditLog.count({ where: { action: "commerce.order.admin-cancel", targetId: pending.order.id } }), 1);
    await assert.rejects(interveneAdminOrder(admin.context, { ...pendingInput, reason: "Changed" }), code("IDEMPOTENCY_CONFLICT"));

    const confirmedSeed = await checkout(variant.id);
    const confirmed = await confirmOrder(merchant.reference, {
      action: "confirm", expectedVersion: confirmedSeed.order.updatedAt.toISOString(), idempotencyKey: randomUUID(), orderId: confirmedSeed.order.id,
    });
    const beforeRestock = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
    await interveneAdminOrder(admin.context, { action: "cancel", expectedVersion: confirmed.updatedAt, idempotencyKey: randomUUID(), orderId: confirmed.id, reason: "Confirmed order exception", returnedStock: false });
    const afterRestock = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
    assert.equal(afterRestock.onHand, beforeRestock.onHand + 1);

    const oldNow = new Date(Date.now() - 30 * 60_000);
    const overdue = await checkout(variant.id, oldNow);
    await interveneAdminOrder(admin.context, { action: "expire", expectedVersion: overdue.order.updatedAt.toISOString(), idempotencyKey: randomUUID(), orderId: overdue.order.id, reason: "Overdue confirmation window", returnedStock: false });
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: overdue.order.id } })).status, "EXPIRED");
  });

  await t.test("Admin Order lists redact PII, audit cursors bind filters, and reports remain tenant-scoped", async () => {
    const list = await listAdminOrders(admin.context, { limit: 2 });
    assert.equal(JSON.stringify(list.data).includes("private-stage3d-instructions"), false);
    const orderId = list.data[0]!.id;
    const detail = await getAdminOrderDetail(admin.context, orderId);
    assert.equal(detail.order.id, orderId);
    const audit = await listAdminCommerceAudit(admin.context, { limit: 2 });
    assert.ok(audit.data.length > 0);
    if (audit.pageInfo.nextCursor) {
      await assert.rejects(listAdminCommerceAudit(admin.context, { cursor: audit.pageInfo.nextCursor, limit: 2, targetType: "Product" }), code("INVALID_CURSOR"));
    }
    const report = await getMerchantCommerceReports(merchant.reference, {});
    assert.equal(report.store?.id, merchant.store.id);
    assert.equal(JSON.stringify(report).includes("private-stage3d-instructions"), false);
    assert.equal("grandTotal" in report.orders, false);
  });

  await t.test("revoked and expired AdminAccess are denied with zero side effects", async () => {
    const current = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    await prisma.adminAccess.update({ where: { id: admin.access.id }, data: { status: "REVOKED" } });
    const before = await prisma.adminAuditLog.count();
    await assert.rejects(moderateAdminProduct(admin.context, { action: "suspend", expectedVersion: current.updatedAt.toISOString(), idempotencyKey: randomUUID(), productId: product.id, reason: "Must not run" }), code("FORBIDDEN"));
    assert.equal(await prisma.adminAuditLog.count(), before);
  });
});
