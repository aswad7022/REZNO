import assert from "node:assert/strict";
import test from "node:test";

import { isOverduePending } from "../../../features/commerce/domain/admin-commerce";
import {
  adminAuditNextHref,
  adminCategoryNextHref,
  adminInventoryMovementNextHref,
  adminInventoryNextHref,
  adminOrderNextHref,
  adminProductNextHref,
  adminStoreAuditNextHref,
  parseAdminAuditPageQuery,
  parseAdminCategoryPageQuery,
  parseAdminInventoryPageQuery,
  parseAdminOrderPageQuery,
  parseAdminProductPageQuery,
} from "../../../features/commerce/domain/admin-commerce-query";
import { CommerceDomainError } from "../../../features/commerce/domain/errors";

function code(expected: CommerceDomainError["code"]) {
  return (error: unknown) => error instanceof CommerceDomainError && error.code === expected;
}

function params(href: string) {
  return new URL(href, "https://rezno.invalid").searchParams;
}

test("Admin Order overdue classification uses the explicit inclusive evaluation timestamp", () => {
  const evaluationTime = new Date("2026-07-18T10:00:00.000Z");
  assert.equal(isOverduePending("PENDING", new Date("2026-07-18T10:00:00.001Z"), evaluationTime), false);
  assert.equal(isOverduePending("PENDING", new Date("2026-07-18T10:00:00.000Z"), evaluationTime), true);
  assert.equal(isOverduePending("PENDING", new Date("2026-07-18T09:59:59.999Z"), evaluationTime), true);
  assert.equal(isOverduePending("CONFIRMED", new Date("2026-07-18T09:59:59.999Z"), evaluationTime), false);
  assert.equal(isOverduePending("PENDING", new Date("2026-07-18T10:00:00.001Z"), new Date("2030-01-01T00:00:00.000Z")), true);
});

test("Admin list query adapters reject duplicate, malformed, unknown, and ambiguous values", () => {
  assert.throws(() => parseAdminCategoryPageQuery({ status: "INVALID" }), code("VALIDATION_ERROR"));
  assert.throws(() => parseAdminCategoryPageQuery({ q: ["one", "two"] }), code("VALIDATION_ERROR"));
  assert.throws(() => parseAdminProductPageQuery({ categoryId: "not-a-uuid" }), code("VALIDATION_ERROR"));
  assert.throws(() => parseAdminInventoryPageQuery({ lowStock: "yes" }), code("VALIDATION_ERROR"));
  assert.throws(() => parseAdminOrderPageQuery({ createdFrom: "2026-07-18" }), code("VALIDATION_ERROR"));
  assert.throws(() => parseAdminOrderPageQuery({ cursor: "" }), code("INVALID_CURSOR"));
  assert.throws(() => parseAdminAuditPageQuery({ unexpected: "value" }), code("VALIDATION_ERROR"));
});

test("Category, Product, Inventory, and Order next links preserve every canonical active filter", () => {
  const category = params(adminCategoryNextHref({ q: "active", status: "ACTIVE" }, "category-cursor"));
  assert.deepEqual(Object.fromEntries(category), { cursor: "category-cursor", q: "active", status: "ACTIVE" });

  const product = params(adminProductNextHref({
    categoryId: "11111111-1111-4111-8111-111111111111",
    q: "product",
    readinessIssue: true,
    status: "PUBLISHED",
    storeStatus: "ACTIVE",
    unsafeMedia: false,
    updatedFrom: new Date("2026-07-01T00:00:00.000Z"),
    updatedTo: new Date("2026-07-18T00:00:00.000Z"),
  }, "product-cursor"));
  for (const [key, value] of Object.entries({
    categoryId: "11111111-1111-4111-8111-111111111111", cursor: "product-cursor", q: "product",
    readinessIssue: "true", status: "PUBLISHED", storeStatus: "ACTIVE", unsafeMedia: "false",
    updatedFrom: "2026-07-01T00:00:00.000Z", updatedTo: "2026-07-18T00:00:00.000Z",
  })) assert.equal(product.get(key), value);

  const inventory = params(adminInventoryNextHref({
    availability: "in_stock", lowStock: false,
    organizationId: "22222222-2222-4222-8222-222222222222", productStatus: "PUBLISHED", q: "sku",
    reserved: true, storeId: "33333333-3333-4333-8333-333333333333", variantStatus: "ACTIVE",
  }, "inventory-cursor"));
  for (const [key, value] of Object.entries({
    availability: "in_stock", cursor: "inventory-cursor", lowStock: "false",
    organizationId: "22222222-2222-4222-8222-222222222222", productStatus: "PUBLISHED", q: "sku",
    reserved: "true", storeId: "33333333-3333-4333-8333-333333333333", variantStatus: "ACTIVE",
  })) assert.equal(inventory.get(key), value);

  const order = params(adminOrderNextHref({
    createdFrom: new Date("2026-07-01T00:00:00.000Z"), createdTo: new Date("2026-07-18T00:00:00.000Z"),
    deliveryFailure: false, fulfillment: "UNFULFILLED", fulfillmentMethod: "CUSTOMER_PICKUP",
    organizationId: "44444444-4444-4444-8444-444444444444", overdue: false, payment: "UNPAID",
    q: "RZ", status: "PENDING", storeId: "55555555-5555-4555-8555-555555555555",
    updatedFrom: new Date("2026-07-02T00:00:00.000Z"), updatedTo: new Date("2026-07-17T00:00:00.000Z"),
  }, "order-cursor"));
  for (const key of [
    "q", "status", "fulfillment", "payment", "fulfillmentMethod", "organizationId", "storeId", "overdue",
    "deliveryFailure", "createdFrom", "createdTo", "updatedFrom", "updatedTo", "cursor",
  ]) assert.notEqual(order.get(key), null, `${key} must be preserved`);
});

test("Commerce Audit and detail-history links preserve scope and target cursor names", () => {
  const audit = params(adminAuditNextHref({
    action: "commerce.order", adminUserId: "admin-user", from: new Date("2026-07-01T00:00:00.000Z"),
    targetId: "66666666-6666-4666-8666-666666666666", targetType: "Order", to: new Date("2026-07-18T00:00:00.000Z"),
  }, "audit-cursor"));
  assert.deepEqual(Object.fromEntries(audit), {
    action: "commerce.order", adminUserId: "admin-user", cursor: "audit-cursor",
    from: "2026-07-01T00:00:00.000Z", targetId: "66666666-6666-4666-8666-666666666666",
    targetType: "Order", to: "2026-07-18T00:00:00.000Z",
  });
  assert.equal(params(adminInventoryMovementNextHref("inventory", "movement-cursor")).get("cursor"), "movement-cursor");
  assert.equal(params(adminStoreAuditNextHref("store", "audit-cursor")).get("auditCursor"), "audit-cursor");
});
