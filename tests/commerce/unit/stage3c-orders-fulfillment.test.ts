import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  COMMERCE_EXPIRATION_CONFIRMATION,
  validateCommerceExpirationEnvironment,
} from "../../../scripts/commerce/expiration-safety";

import { canCustomerCancel } from "../../../features/commerce/api/dto";
import {
  assignableCommercePermissions,
  effectiveCommercePermissions,
  isValidCommercePermissionCombination,
} from "../../../features/commerce/domain/merchant-access";
import {
  decodeMerchantCursor,
  encodeMerchantCursor,
  merchantCursorFingerprint,
} from "../../../features/commerce/domain/merchant-cursor";
import { commerceNotificationEventKey } from "../../../features/commerce/services/commerce-notification-service";
import {
  customerOrderCancellationSchema,
  merchantOrderCancellationSchema,
  merchantOrderDecisionSchema,
  merchantOrderFulfillmentSchema,
  orderMutationRequestHash,
} from "../../../features/commerce/domain/order-input";
import {
  assertCustomerCancellationAllowed,
  assertFulfillmentTransition,
  assertMerchantCancellationAllowed,
  assertOrderTransition,
  assertPaymentTransition,
} from "../../../features/commerce/domain/order-state-machine";
import { getDashboardNavigation } from "../../../features/dashboard/navigation";

const version = "2026-07-17T12:00:00.000Z";
const envelope = () => ({ expectedVersion: version, idempotencyKey: randomUUID(), orderId: randomUUID() });

test("Gate 3C role permissions remain explicit and dependency-safe", () => {
  assert.deepEqual(assignableCommercePermissions("STAFF").filter((item) => item.startsWith("ORDER_")), [
    "ORDER_VIEW",
    "ORDER_MANAGE",
  ]);
  assert.equal(assignableCommercePermissions("STAFF").includes("ORDER_CANCEL"), false);
  assert.equal(assignableCommercePermissions("RECEPTIONIST").length, 0);
  assert.equal(isValidCommercePermissionCombination("MANAGER", ["ORDER_MANAGE"]), false);
  assert.equal(isValidCommercePermissionCombination("MANAGER", ["ORDER_CANCEL"]), false);
  assert.equal(isValidCommercePermissionCombination("MANAGER", ["ORDER_VIEW", "ORDER_CANCEL"]), true);
  assert.equal(isValidCommercePermissionCombination("STAFF", ["ORDER_VIEW", "ORDER_CANCEL"]), false);
  assert.equal(isValidCommercePermissionCombination("RECEPTIONIST", ["ORDER_VIEW"]), false);
  assert.deepEqual(
    effectiveCommercePermissions({ commercePermissions: ["ORDER_MANAGE"], systemRole: "MANAGER" }),
    [],
  );
  assert.deepEqual(
    effectiveCommercePermissions({ commercePermissions: ["ORDER_VIEW", "ORDER_MANAGE"], systemRole: "STAFF" })
      .filter((item) => item.startsWith("ORDER_")),
    ["ORDER_VIEW", "ORDER_MANAGE"],
  );
});

test("Gate 3C navigation is structurally bound to effective ORDER_VIEW", () => {
  const permitted = getDashboardNavigation("business", undefined, "STAFF", "membership", true, [
    "ORDER_VIEW",
    "ORDER_MANAGE",
  ]);
  const denied = getDashboardNavigation("business", undefined, "STAFF", "membership", true, []);
  const hrefs = (groups: typeof permitted) => groups.flatMap((group) => group.items.flatMap((item) => [
    item.href,
    ...(item.children ?? []).map((child) => child.href),
  ]));
  assert.equal(hrefs(permitted).includes("/business/commerce/orders"), true);
  assert.equal(hrefs(denied).includes("/business/commerce/orders"), false);
});

test("Gate 3C strict schemas require UUID keys, exact versions, actions, and bounded normalized reasons", () => {
  assert.equal(merchantOrderDecisionSchema.safeParse({ ...envelope(), action: "confirm" }).success, true);
  assert.equal(merchantOrderDecisionSchema.safeParse({ ...envelope(), action: "reject" }).success, false);
  const rejection = merchantOrderDecisionSchema.parse({ ...envelope(), action: "reject", reason: "  no   stock  " });
  assert.equal(rejection.reason, "no stock");
  assert.equal(merchantOrderDecisionSchema.safeParse({ ...envelope(), action: "confirm", reason: "unexpected" }).success, false);
  assert.equal(merchantOrderDecisionSchema.safeParse({ ...envelope(), action: "confirm", extra: true }).success, false);
  assert.equal(merchantOrderDecisionSchema.safeParse({ ...envelope(), action: "confirm", idempotencyKey: "not-a-uuid" }).success, false);
  assert.equal(merchantOrderDecisionSchema.safeParse({ ...envelope(), action: "confirm", expectedVersion: "yesterday" }).success, false);
  assert.equal(merchantOrderFulfillmentSchema.safeParse({ ...envelope(), action: "delivery_failed" }).success, false);
  assert.equal(merchantOrderFulfillmentSchema.safeParse({ ...envelope(), action: "delivery_failed", reason: "Address unavailable" }).success, true);
  assert.equal(merchantOrderFulfillmentSchema.safeParse({ ...envelope(), action: "start_preparing", reason: "unexpected" }).success, false);
  assert.equal(merchantOrderCancellationSchema.safeParse({ ...envelope(), reason: "Returned", returnedStock: true }).success, true);
  assert.equal(customerOrderCancellationSchema.safeParse({ ...envelope(), reason: "Changed plans" }).success, true);
});

test("Gate 3C canonical transition hashes bind every mutable request dimension", () => {
  const base = {
    action: "merchant_cancel",
    expectedVersion: version,
    orderId: randomUUID(),
    reason: "Returned stock",
    requestedFulfillmentStatus: "CANCELLED",
    requestedOrderStatus: "CANCELLED",
    requestedPaymentStatus: "VOIDED",
    returnedStock: true,
  };
  const hash = orderMutationRequestHash(base);
  assert.equal(orderMutationRequestHash({ ...base }), hash);
  for (const changed of [
    { ...base, expectedVersion: "2026-07-17T12:01:00.000Z" },
    { ...base, orderId: randomUUID() },
    { ...base, reason: "Different" },
    { ...base, returnedStock: false },
    { ...base, requestedOrderStatus: "REJECTED" },
  ]) assert.notEqual(orderMutationRequestHash(changed), hash);
});

test("Gate 3C Order, fulfillment, payment, and cancellation matrices fail closed", () => {
  assert.doesNotThrow(() => assertOrderTransition("PENDING", "CONFIRMED"));
  assert.throws(() => assertOrderTransition("COMPLETED", "CANCELLED"));
  assert.doesNotThrow(() => assertFulfillmentTransition("CUSTOMER_PICKUP", "UNFULFILLED", "PREPARING"));
  assert.doesNotThrow(() => assertFulfillmentTransition("CUSTOMER_PICKUP", "READY_FOR_PICKUP", "PICKED_UP"));
  assert.throws(() => assertFulfillmentTransition("CUSTOMER_PICKUP", "PREPARING", "OUT_FOR_DELIVERY"));
  assert.doesNotThrow(() => assertFulfillmentTransition("STORE_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERY_FAILED"));
  assert.doesNotThrow(() => assertFulfillmentTransition("STORE_DELIVERY", "DELIVERY_FAILED", "OUT_FOR_DELIVERY"));
  assert.throws(() => assertFulfillmentTransition("STORE_DELIVERY", "PREPARING", "READY_FOR_PICKUP"));
  assert.doesNotThrow(() => assertPaymentTransition("UNPAID", "PAID"));
  assert.throws(() => assertPaymentTransition("PAID", "VOIDED"));
  assert.doesNotThrow(() => assertCustomerCancellationAllowed({ fulfillmentStatus: "UNFULFILLED", orderStatus: "CONFIRMED", reason: "Changed" }));
  assert.throws(() => assertCustomerCancellationAllowed({ fulfillmentStatus: "PREPARING", orderStatus: "CONFIRMED", reason: "Changed" }));
  assert.doesNotThrow(() => assertMerchantCancellationAllowed({ fulfillmentStatus: "DELIVERY_FAILED", orderStatus: "CONFIRMED", reason: "Returned" }));
  assert.throws(() => assertMerchantCancellationAllowed({ fulfillmentStatus: "DELIVERED", orderStatus: "COMPLETED", reason: "Late" }));
});

test("Customer cancellation DTO policy omits mutation version outside the safe window", () => {
  assert.equal(canCustomerCancel({ fulfillmentStatus: "UNFULFILLED", paymentStatus: "UNPAID", status: "PENDING" }), true);
  assert.equal(canCustomerCancel({ fulfillmentStatus: "UNFULFILLED", paymentStatus: "UNPAID", status: "CONFIRMED" }), true);
  assert.equal(canCustomerCancel({ fulfillmentStatus: "PREPARING", paymentStatus: "UNPAID", status: "CONFIRMED" }), false);
  assert.equal(canCustomerCancel({ fulfillmentStatus: "UNFULFILLED", paymentStatus: "PAID", status: "CONFIRMED" }), false);
});

test("Merchant Order cursors bind actor, Store, filters, queue, sort, and snapshot", () => {
  const id = randomUUID();
  const filter = merchantCursorFingerprint({ queue: "pending", status: "PENDING" });
  const value = {
    actor: `${randomUUID()}:${randomUUID()}:${randomUUID()}:${randomUUID()}`,
    filter,
    id,
    kind: "orders" as const,
    snapshot: version,
    sortValue: version,
    target: randomUUID(),
  };
  const encoded = encodeMerchantCursor(value);
  assert.equal(decodeMerchantCursor(encoded, value).id, id);
  assert.throws(() => decodeMerchantCursor(encoded, { ...value, actor: `foreign:${value.actor}` }));
  assert.throws(() => decodeMerchantCursor(encoded, { ...value, filter: merchantCursorFingerprint({ queue: "active" }) }));
  assert.throws(() => decodeMerchantCursor(encoded, { ...value, target: randomUUID() }));
  assert.throws(() => decodeMerchantCursor(`${encoded}x`, value));
});

test("Commerce notification keys separate customer and Merchant destinations", () => {
  const orderId = randomUUID();
  const personId = randomUUID();
  const customer = commerceNotificationEventKey(orderId, "order.expired", personId);
  const merchant = commerceNotificationEventKey(orderId, "order.expired", personId, "merchant");
  assert.notEqual(customer, merchant);
  assert.match(customer, new RegExp(orderId));
  assert.match(merchant, /:merchant:/);
});

test("the manual expiration command is locked to the exact staging database", () => {
  const confirmation = { COMMERCE_EXPIRATION_CONFIRM: COMMERCE_EXPIRATION_CONFIRMATION };
  assert.doesNotThrow(() => validateCommerceExpirationEnvironment({
    ...confirmation,
    DATABASE_URL: "postgresql://operator:secret@stage.example/rezno_staging",
  }));
  assert.throws(() => validateCommerceExpirationEnvironment({
    ...confirmation,
    DATABASE_URL: "postgresql://operator:secret@stage.example/rezno_production",
  }), (error: unknown) => error instanceof Error && !error.message.includes("secret"));
  assert.throws(() => validateCommerceExpirationEnvironment({
    DATABASE_URL: "postgresql://stage.example/rezno_staging",
  }));
});
