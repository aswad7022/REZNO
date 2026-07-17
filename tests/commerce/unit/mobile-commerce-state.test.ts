import assert from "node:assert/strict";
import test from "node:test";

import {
  beginKeyedMutation,
  canApplyCheckoutCompletion,
  canApplyResourceSnapshot,
  canRenderCustomerCancellation,
  checkoutDraftForCart,
  checkoutSemanticSignature,
  collectAllCursorPages,
  finishKeyedMutation,
  hasBackDestination,
  isConfirmedEmptyResource,
  isLatestRequest,
  optimisticSet,
  resolvedSetMembership,
  rollbackOptimisticSet,
  resolveCheckoutAttempt,
  resolveOrderCancellationAttempt,
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

test("mobile Order cancellation reuses one key for a normalized retry and rotates on material change", () => {
  let sequence = 0;
  const createKey = () => `cancel-key-${++sequence}`;
  const input = {
    expectedVersion: "2026-07-17T12:00:00.000Z",
    orderId: "11111111-1111-4111-8111-111111111111",
    reason: "Changed plans",
  };
  const first = resolveOrderCancellationAttempt(null, input, createKey);
  const retry = resolveOrderCancellationAttempt(first, { ...input, reason: "  Changed   plans " }, createKey);
  const changedReason = resolveOrderCancellationAttempt(retry, { ...input, reason: "Unavailable" }, createKey);
  const changedVersion = resolveOrderCancellationAttempt(changedReason, {
    ...input, expectedVersion: "2026-07-17T12:01:00.000Z", reason: "Unavailable",
  }, createKey);
  assert.equal(first.key, retry.key);
  assert.notEqual(retry.key, changedReason.key);
  assert.notEqual(changedReason.key, changedVersion.key);
});

test("pickup signatures exclude stale addresses and normalize instructions", () => {
  assert.equal(
    checkoutSemanticSignature({ ...checkout, addressId: "stale" }),
    checkoutSemanticSignature({ ...checkout, addressId: null, customerInstructions: "ring once" }),
  );
});

test("Checkout draft survives address navigation for the same Cart and resets across stores", () => {
  const cart = { id: "cart-a", store: { id: "store-a" } };
  const initial = checkoutDraftForCart(null, cart);
  const edited = {
    ...initial,
    addressId: "address-a",
    attempt: { key: "checkout-key", signature: "checkout-signature" },
    customerInstructions: "side entrance",
    fulfillmentMethod: "STORE_DELIVERY" as const,
  };

  assert.equal(checkoutDraftForCart(edited, cart), edited);
  assert.deepEqual(checkoutDraftForCart(edited, { id: "cart-a", store: { id: "store-b" } }), {
    addressId: null,
    attempt: null,
    cartId: "cart-a",
    customerInstructions: "",
    fulfillmentMethod: "CUSTOMER_PICKUP",
    storeId: "store-b",
  });
});

test("empty states require a confirmed successful empty response", () => {
  assert.equal(isConfirmedEmptyResource("loading", false), false);
  assert.equal(isConfirmedEmptyResource("error", false), false);
  assert.equal(isConfirmedEmptyResource("ready", true), false);
  assert.equal(isConfirmedEmptyResource("ready", false), true);
});

test("top-level Commerce routes expose Back only when a destination exists", () => {
  assert.equal(hasBackDestination(0, false), false);
  assert.equal(hasBackDestination(0, true), true);
  assert.equal(hasBackDestination(1, false), true);
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

test("favorite rollback changes only the failed id and never overwrites a newer same-id intent", () => {
  const optimistic = new Set(["store-a", "store-b"]);
  assert.deepEqual([...rollbackOptimisticSet(optimistic, "store-b", true, false)], ["store-a"]);
  const newerIntent = new Set(["store-a"]);
  assert.deepEqual([...rollbackOptimisticSet(newerIntent, "store-b", true, false)], ["store-a"]);
});

test("favorite mutations are single-flight per resource id", () => {
  const active = new Map<string, number>();
  assert.equal(beginKeyedMutation(active, "store-a", 1), true);
  assert.equal(beginKeyedMutation(active, "store-a", 2), false);
  assert.equal(beginKeyedMutation(active, "store-b", 3), true);
  assert.equal(finishKeyedMutation(active, "store-a", 2), false);
  assert.equal(finishKeyedMutation(active, "store-a", 1), true);
  assert.equal(beginKeyedMutation(active, "store-a", 4), true);
});

test("resource snapshots reject delayed refreshes after a newer request or mutation", () => {
  assert.equal(canApplyResourceSnapshot(2, 2, 5, 5), true);
  assert.equal(canApplyResourceSnapshot(1, 2, 5, 5), false);
  assert.equal(canApplyResourceSnapshot(2, 2, 5, 6), false);
});

test("Checkout completion applies only to the mounted latest submission and exact submitted Cart", () => {
  const current = {
    cartRequestIsLatest: true,
    currentCart: { id: "cart-a", version: 3 },
    latestSubmissionSequence: 2,
    mounted: true,
    submissionSequence: 2,
    submittedCart: { id: "cart-a", version: 3 },
  };
  assert.equal(canApplyCheckoutCompletion(current), true);
  assert.equal(canApplyCheckoutCompletion({ ...current, mounted: false }), false);
  assert.equal(canApplyCheckoutCompletion({ ...current, latestSubmissionSequence: 3 }), false);
  assert.equal(canApplyCheckoutCompletion({ ...current, cartRequestIsLatest: false }), false);
  assert.equal(canApplyCheckoutCompletion({ ...current, currentCart: { id: "cart-a", version: 4 } }), false);
});

test("favorite membership stays unknown until the complete snapshot is ready", () => {
  const ids = new Set(["favorite"]);
  assert.equal(resolvedSetMembership(ids, "favorite", "loading"), undefined);
  assert.equal(resolvedSetMembership(ids, "missing", "error"), undefined);
  assert.equal(resolvedSetMembership(ids, "favorite", "ready"), true);
  assert.equal(resolvedSetMembership(ids, "missing", "ready"), false);
});

test("favorite bootstrap follows every cursor before publishing a complete snapshot", async () => {
  const cursors: Array<string | undefined> = [];
  const result = await collectAllCursorPages(async (cursor) => {
    cursors.push(cursor);
    return cursor
      ? { data: ["favorite-2"], pageInfo: { hasNextPage: false, nextCursor: null } }
      : { data: ["favorite-1"], pageInfo: { hasNextPage: true, nextCursor: "page-2" } };
  });
  assert.deepEqual(cursors, [undefined, "page-2"]);
  assert.deepEqual(result, {
    data: ["favorite-1", "favorite-2"],
    pageInfo: { hasNextPage: false, nextCursor: null },
  });
});

test("stale search responses and paid cancellation controls fail closed", () => {
  assert.equal(isLatestRequest(3, 4), false);
  assert.equal(isLatestRequest(4, 4), true);
  assert.equal(canRenderCustomerCancellation({ canCustomerCancel: true, expectedVersion: "version", paymentStatus: "PAID" }), false);
  assert.equal(canRenderCustomerCancellation({ canCustomerCancel: true, paymentStatus: "UNPAID" }), false);
  assert.equal(canRenderCustomerCancellation({ canCustomerCancel: true, expectedVersion: "version", paymentStatus: "UNPAID" }), true);
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
