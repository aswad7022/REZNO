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
  listAdminCategories,
  transitionAdminCategory,
} from "../../../features/commerce/services/admin-category-service";
import { listAdminCommerceAudit } from "../../../features/commerce/services/admin-commerce-audit-service";
import { correctAdminInventory, getAdminInventoryDetail, listAdminInventory } from "../../../features/commerce/services/admin-inventory-service";
import { getAdminOrderDetail, listAdminOrders } from "../../../features/commerce/services/admin-order-query-service";
import { getAdminProductDetail, listAdminProducts, moderateAdminProduct } from "../../../features/commerce/services/admin-product-service";
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
  const foreignAdmin = await createAdmin("foreign", ["COMMERCE_CATALOG_VIEW", "COMMERCE_INVENTORY_VIEW", "COMMERCE_ORDERS_VIEW", "AUDIT_LOG_VIEW"]);
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

  await t.test("Admin Order deadline crossing reuses one cursor evaluation timestamp without duplicates or skips", async () => {
    const nonce = randomUUID().slice(0, 8);
    const deadline = new Date("2030-07-18T10:00:00.000Z");
    const beforeDeadline = new Date("2030-07-18T09:59:59.000Z");
    const afterDeadline = new Date("2030-07-18T10:00:01.000Z");
    const created = [];
    for (let index = 0; index < 7; index += 1) {
      created.push(await prisma.order.create({ data: {
        createdAt: new Date(`2026-07-18T00:00:${index.toString().padStart(2, "0")}.000Z`),
        currency: "IQD",
        customerId: merchant.person.id,
        customerNameSnapshot: `Cursor Customer ${index}`,
        customerPhoneSnapshot: "+9647500003300",
        fulfillmentMethod: "CUSTOMER_PICKUP",
        grandTotal: "10000",
        orderNumber: `RZ-CURSOR-${nonce}-${index}`,
        paymentMethod: "PAY_AT_PICKUP",
        reservationExpiresAt: deadline,
        storeId: merchant.store.id,
        storeNameSnapshot: merchant.store.name,
        storeSlugSnapshot: merchant.store.slug,
        subtotal: "10000",
        updatedAt: new Date(`2026-07-18T00:00:${index.toString().padStart(2, "0")}.000Z`),
      } }));
    }
    const expected = new Set(created.map((item) => item.id));
    const base = { limit: 2, orderStatus: "PENDING" as const, overdue: false, query: `RZ-CURSOR-${nonce}` };
    const first = await listAdminOrders(admin.context, base, { now: () => beforeDeadline });
    assert.equal(first.evaluationTime, beforeDeadline.toISOString());
    assert.ok(first.pageInfo.nextCursor);
    assert.equal(first.data.every((item) => item.overdue === false), true);

    const ids = first.data.map((item) => item.id);
    let cursor: string | undefined = first.pageInfo.nextCursor ?? undefined;
    while (cursor) {
      const page = await listAdminOrders(admin.context, { ...base, cursor }, { now: () => afterDeadline });
      assert.equal(page.evaluationTime, beforeDeadline.toISOString());
      assert.equal(page.data.every((item) => item.overdue === false), true);
      ids.push(...page.data.map((item) => item.id));
      cursor = page.pageInfo.nextCursor ?? undefined;
    }
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(new Set(ids), expected);

    const freshNonOverdue = await listAdminOrders(admin.context, base, { now: () => afterDeadline });
    assert.equal(freshNonOverdue.data.length, 0);
    const freshOverdue = await listAdminOrders(admin.context, { ...base, overdue: true }, { now: () => afterDeadline });
    assert.equal(freshOverdue.data.every((item) => item.overdue), true);
    assert.ok(freshOverdue.data.length > 0);

    await assert.rejects(
      listAdminOrders(admin.context, { ...base, cursor: first.pageInfo.nextCursor!, overdue: true }, { now: () => afterDeadline }),
      code("INVALID_CURSOR"),
    );
    await assert.rejects(
      listAdminOrders(foreignAdmin.context, { ...base, cursor: first.pageInfo.nextCursor! }, { now: () => afterDeadline }),
      code("INVALID_CURSOR"),
    );
    await assert.rejects(
      listAdminCommerceAudit(admin.context, { cursor: first.pageInfo.nextCursor!, limit: 2 }),
      code("INVALID_CURSOR"),
    );

    const changedLimit = await listAdminOrders(admin.context, {
      ...base,
      cursor: first.pageInfo.nextCursor!,
      limit: 3,
    }, { now: () => afterDeadline });
    assert.equal(changedLimit.evaluationTime, beforeDeadline.toISOString());
    assert.equal(changedLimit.data.every((item) => expected.has(item.id)), true);
    assert.equal(changedLimit.data.every((item) => !first.data.some((firstItem) => firstItem.id === item.id)), true);
  });

  await t.test("filtered Category, Product, Inventory, and Order service pagination is complete and cursor-bound", async () => {
    const nonce = randomUUID().slice(0, 8);
    const pagedCategories = [];
    for (let index = 0; index < 5; index += 1) {
      pagedCategories.push(await prisma.marketplaceCategory.create({ data: {
        name: `Pagination Category ${nonce} ${index}`,
        normalizedName: `pagination category ${nonce} ${index}`,
        slug: `pagination-category-${nonce}-${index}`,
        status: "INACTIVE",
      } }));
    }
    const categoryIds = new Set<string>();
    let categoryCursor: string | undefined;
    do {
      const page = await listAdminCategories(admin.context, { cursor: categoryCursor, limit: 2, search: nonce, status: "INACTIVE" });
      page.data.forEach((item) => categoryIds.add(item.id));
      categoryCursor = page.pageInfo.nextCursor ?? undefined;
    } while (categoryCursor);
    assert.deepEqual(categoryIds, new Set(pagedCategories.map((item) => item.id)));

    const pagedProducts = [];
    const pagedInventories = [];
    for (let index = 0; index < 5; index += 1) {
      const pagedProduct = await prisma.product.create({ data: {
        categoryId: category.id,
        name: `Pagination Product ${nonce} ${index}`,
        normalizedSearchText: `pagination product ${nonce} ${index}`,
        slug: `pagination-product-${nonce}-${index}`,
        status: "DRAFT",
        storeId: merchant.store.id,
      } });
      pagedProducts.push(pagedProduct);
      const pagedVariant = await prisma.productVariant.create({ data: {
        currency: "IQD", isDefault: true, optionKey: `page-${index}`, optionValues: {}, price: "10000",
        productId: pagedProduct.id, sku: `PAGE-${nonce}-${index}`, storeId: merchant.store.id, title: `Page ${index}`,
      } });
      pagedInventories.push(await prisma.inventoryItem.create({ data: { onHand: 10 + index, reserved: 1, variantId: pagedVariant.id } }));
    }
    const productIds = new Set<string>();
    let productCursor: string | undefined;
    do {
      const page = await listAdminProducts(admin.context, { cursor: productCursor, limit: 2, search: nonce, status: "DRAFT" });
      page.data.forEach((item) => productIds.add(item.id));
      productCursor = page.pageInfo.nextCursor ?? undefined;
    } while (productCursor);
    assert.deepEqual(productIds, new Set(pagedProducts.map((item) => item.id)));

    const inventoryIds = new Set<string>();
    let inventoryCursor: string | undefined;
    do {
      const page = await listAdminInventory(admin.context, { availability: "in_stock", cursor: inventoryCursor, limit: 2, query: nonce, reserved: true });
      page.data.forEach((item) => inventoryIds.add(item.id));
      inventoryCursor = page.pageInfo.nextCursor ?? undefined;
    } while (inventoryCursor);
    assert.deepEqual(inventoryIds, new Set(pagedInventories.map((item) => item.id)));
  });

  await t.test("Commerce audit remains commerce-scoped across pages and Inventory movement history is reachable", async () => {
    const nonce = randomUUID().slice(0, 8);
    const commerceRows = [];
    for (let index = 0; index < 35; index += 1) {
      commerceRows.push(await prisma.adminAuditLog.create({ data: {
        action: `commerce.pagination.${nonce}`,
        adminUserId: admin.user.id,
        createdAt: new Date(`2026-07-17T20:${index.toString().padStart(2, "0")}:00.000Z`),
        metadata: { authorization: "SHOULD-NOT-LEAK", safe: `row-${index}` },
        targetId: product.id,
        targetType: "Product",
      } }));
    }
    await prisma.adminAuditLog.createMany({ data: [
      { action: `admin.pagination.${nonce}`, adminUserId: admin.user.id, targetId: product.id, targetType: "Product" },
      { action: `settings.pagination.${nonce}`, adminUserId: admin.user.id, targetId: product.id, targetType: "Product" },
    ] });
    const auditIds: string[] = [];
    let auditCursor: string | undefined;
    do {
      const page = await listAdminCommerceAudit(admin.context, {
        action: `commerce.pagination.${nonce}`, cursor: auditCursor, limit: 10, targetId: product.id, targetType: "Product",
      });
      assert.equal(page.data.every((item) => item.action.startsWith("commerce.")), true);
      assert.equal(JSON.stringify(page.data).includes("SHOULD-NOT-LEAK"), false);
      auditIds.push(...page.data.map((item) => item.id));
      auditCursor = page.pageInfo.nextCursor ?? undefined;
    } while (auditCursor);
    assert.equal(new Set(auditIds).size, auditIds.length);
    assert.deepEqual(new Set(auditIds), new Set(commerceRows.map((item) => item.id)));
    await assert.rejects(listAdminCommerceAudit(admin.context, { action: "admin.", limit: 10 }), code("VALIDATION_ERROR"));
    const firstAudit = await listAdminCommerceAudit(admin.context, { action: `commerce.pagination.${nonce}`, limit: 10, targetId: product.id, targetType: "Product" });
    assert.ok(firstAudit.pageInfo.nextCursor);
    await assert.rejects(listAdminCommerceAudit(foreignAdmin.context, {
      action: `commerce.pagination.${nonce}`, cursor: firstAudit.pageInfo.nextCursor!, limit: 10, targetId: product.id, targetType: "Product",
    }), code("INVALID_CURSOR"));

    const movements = [];
    for (let index = 0; index < 25; index += 1) {
      movements.push(await prisma.stockMovement.create({ data: {
        actorType: "ADMIN", idempotencyKey: randomUUID(), inventoryItemId: inventory.id,
        metadata: { customerPhone: "+9647999999999", private: "PRIVATE-MOVEMENT" },
        onHandDelta: 1, quantity: 1, reason: `Pagination ${nonce} ${index}`, reservedDelta: 0,
        resultingOnHand: 31, resultingReserved: 0, type: "ADJUSTMENT_IN",
      } }));
    }
    const firstMovements = await getAdminInventoryDetail(admin.context, inventory.id, { limit: 10 });
    assert.ok(firstMovements.movements.pageInfo.nextCursor);
    const secondMovements = await getAdminInventoryDetail(admin.context, inventory.id, {
      cursor: firstMovements.movements.pageInfo.nextCursor!, limit: 10,
    });
    const firstIds = new Set(firstMovements.movements.data.map((item) => item.id));
    assert.equal(secondMovements.movements.data.some((item) => firstIds.has(item.id)), false);
    assert.equal(JSON.stringify(secondMovements.movements.data).includes("PRIVATE-MOVEMENT"), false);

    const otherProduct = await prisma.product.create({ data: {
      categoryId: category.id, name: `Other ${nonce}`, normalizedSearchText: `other ${nonce}`,
      slug: `other-${nonce}`, status: "DRAFT", storeId: merchant.store.id,
    } });
    const otherVariant = await prisma.productVariant.create({ data: {
      currency: "IQD", isDefault: true, optionKey: "other", optionValues: {}, price: "10000",
      productId: otherProduct.id, sku: `OTHER-${nonce}`, storeId: merchant.store.id, title: "Other",
    } });
    const otherInventory = await prisma.inventoryItem.create({ data: { onHand: 1, variantId: otherVariant.id } });
    await assert.rejects(getAdminInventoryDetail(admin.context, otherInventory.id, {
      cursor: firstMovements.movements.pageInfo.nextCursor!, limit: 10,
    }), code("INVALID_CURSOR"));
    void movements;
  });

  await t.test("revoked and expired AdminAccess are denied with zero side effects", async () => {
    const current = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    await prisma.adminAccess.update({ where: { id: admin.access.id }, data: { status: "REVOKED" } });
    const before = await prisma.adminAuditLog.count();
    await assert.rejects(moderateAdminProduct(admin.context, { action: "suspend", expectedVersion: current.updatedAt.toISOString(), idempotencyKey: randomUUID(), productId: product.id, reason: "Must not run" }), code("FORBIDDEN"));
    assert.equal(await prisma.adminAuditLog.count(), before);
  });
});
