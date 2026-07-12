import assert from "node:assert/strict";
import test from "node:test";

import { assertProductPublishable, isProductPublic } from "../../../features/commerce/domain/catalog";
import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import {
  assertCustomerCancellationAllowed,
  assertFulfillmentTransition,
  assertMerchantCancellationAllowed,
  assertOrderTransition,
  assertPaymentTransition,
} from "../../../features/commerce/domain/order-state-machine";
import { assertStoreTransition } from "../../../features/commerce/domain/store-lifecycle";

test("Store lifecycle accepts only approved transitions", () => {
  assert.doesNotThrow(() => assertStoreTransition("DRAFT", "PENDING_REVIEW"));
  assert.doesNotThrow(() => assertStoreTransition("SUSPENDED", "ACTIVE"));
  assert.throws(() => assertStoreTransition("DRAFT", "ACTIVE"), CommerceDomainError);
});

test("Product publication requires an active Store and available Variant", () => {
  assert.doesNotThrow(() => assertProductPublishable({ activeVariantCount: 1, storeStatus: "ACTIVE" }));
  assert.throws(
    () => assertProductPublishable({ activeVariantCount: 1, storeStatus: "SUSPENDED" }),
    CommerceDomainError,
  );
  assert.equal(
    isProductPublic({
      productStatus: "PUBLISHED",
      publishedAt: new Date(),
      storeStatus: "ACTIVE",
      variantAvailable: true,
    }),
    true,
  );
});

test("Order and fulfillment transitions are centralized", () => {
  assert.doesNotThrow(() => assertOrderTransition("PENDING", "CONFIRMED"));
  assert.throws(() => assertOrderTransition("COMPLETED", "CANCELLED"), CommerceDomainError);
  assert.doesNotThrow(() =>
    assertFulfillmentTransition("CUSTOMER_PICKUP", "PREPARING", "READY_FOR_PICKUP"),
  );
  assert.throws(
    () => assertFulfillmentTransition("CUSTOMER_PICKUP", "PREPARING", "OUT_FOR_DELIVERY"),
    CommerceDomainError,
  );
});

test("customer and merchant cancellation rules differ after preparation", () => {
  assert.doesNotThrow(() =>
    assertCustomerCancellationAllowed({
      fulfillmentStatus: "UNFULFILLED",
      orderStatus: "CONFIRMED",
      reason: "Changed my mind",
    }),
  );
  assert.throws(
    () =>
      assertCustomerCancellationAllowed({
        fulfillmentStatus: "PREPARING",
        orderStatus: "CONFIRMED",
        reason: "Changed my mind",
      }),
    CommerceDomainError,
  );
  assert.doesNotThrow(() =>
    assertMerchantCancellationAllowed({
      fulfillmentStatus: "PREPARING",
      orderStatus: "CONFIRMED",
      reason: "Cannot fulfill",
    }),
  );
});

test("payment state is truthful and terminal once paid", () => {
  assert.doesNotThrow(() => assertPaymentTransition("UNPAID", "PAID"));
  assert.doesNotThrow(() => assertPaymentTransition("UNPAID", "VOIDED"));
  assert.throws(() => assertPaymentTransition("PAID", "VOIDED"), CommerceDomainError);
});
