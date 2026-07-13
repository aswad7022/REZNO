import assert from "node:assert/strict";
import test from "node:test";

import {
  canRenderCustomerCancellation,
  checkoutSemanticSignature,
  isLatestRequest,
  optimisticSet,
  resolveCheckoutAttempt,
} from "../../../apps/mobile/src/commerce/state";
import { commerceNotificationOrderDestination } from "../../../apps/mobile/src/commerce/notification-navigation";
import { commerceCopy, commercePaymentMethodLabel, formatCommerceMoney } from "../../../apps/mobile/src/i18n/commerce";

const checkout = {
  addressId: null,
  cartId: "11111111-1111-4111-8111-111111111111",
  cartVersion: 2,
  customerInstructions: "  ring   once ",
  fulfillmentMethod: "CUSTOMER_PICKUP" as const,
};

test("mobile Checkout reuses one key for an unchanged retry and rotates for semantic changes", () => {
  let next = 0;
  const createKey = () => `key-${++next}`;
  const first = resolveCheckoutAttempt(null, checkout, createKey);
  const retry = resolveCheckoutAttempt(first, { ...checkout, customerInstructions: "ring once" }, createKey);
  const changed = resolveCheckoutAttempt(retry, { ...checkout, cartVersion: 3 }, createKey);
  assert.equal(retry.key, first.key);
  assert.notEqual(changed.key, first.key);
  assert.equal(next, 2);
});

test("pickup signatures exclude stale addresses and normalize instructions", () => {
  assert.equal(
    checkoutSemanticSignature({ ...checkout, addressId: "stale" }),
    checkoutSemanticSignature({ ...checkout, addressId: null, customerInstructions: "ring once" }),
  );
});

test("mobile money display groups decimal strings without floating point arithmetic", () => {
  assert.equal(formatCommerceMoney("25000.000", "IQD", "en"), "25,000 IQD");
  assert.equal(formatCommerceMoney("25000.500", "IQD", "ar"), "25٬000.5 د.ع");
});

test("offline payment methods remain localized", () => {
  assert.equal(commercePaymentMethodLabel("CASH_ON_DELIVERY", commerceCopy.ar), "الدفع نقداً عند التوصيل");
  assert.equal(commercePaymentMethodLabel("PAY_AT_PICKUP", commerceCopy.ckb), "پارەدان لە وەرگرتن");
});

test("favorite rollback helpers do not mutate prior state", () => {
  const original = new Set(["store-a"]);
  const optimistic = optimisticSet(original, "store-b", true);
  const rolledBack = optimisticSet(optimistic, "store-b", false);
  assert.deepEqual([...original], ["store-a"]);
  assert.deepEqual([...rolledBack], ["store-a"]);
});

test("stale search responses and paid cancellation controls fail closed", () => {
  assert.equal(isLatestRequest(3, 4), false);
  assert.equal(isLatestRequest(4, 4), true);
  assert.equal(canRenderCustomerCancellation({ canCustomerCancel: true, paymentStatus: "PAID" }), false);
  assert.equal(canRenderCustomerCancellation({ canCustomerCancel: true, paymentStatus: "UNPAID" }), true);
});

test("Commerce notification activation maps only server-authorized Order destinations", () => {
  const notification = {
    body: "Order created",
    createdAt: "2026-07-13T00:00:00.000Z",
    id: "22222222-2222-4222-8222-222222222222",
    orderId: "11111111-1111-4111-8111-111111111111",
    priority: "NORMAL" as const,
    title: "Order received",
  };
  assert.equal(commerceNotificationOrderDestination(notification), notification.orderId);
  assert.equal(commerceNotificationOrderDestination({ ...notification, orderId: null }), null);
});
