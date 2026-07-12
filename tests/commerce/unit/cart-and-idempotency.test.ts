import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCartStore,
  assertCartVersion,
  mergeCartQuantity,
} from "../../../features/commerce/domain/cart";
import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import {
  canonicalRequestJson,
  hashCheckoutRequest,
  resolveIdempotency,
} from "../../../features/commerce/domain/idempotency";

test("Cart enforces one Store", () => {
  assert.doesNotThrow(() => assertCartStore("store-a", "store-a"));
  assert.throws(
    () => assertCartStore("store-a", "store-b"),
    (error: unknown) => error instanceof CommerceDomainError && error.code === "CONFLICT",
  );
});

test("duplicate Cart additions merge bounded quantities", () => {
  assert.equal(mergeCartQuantity(2, 3), 5);
  assert.throws(() => mergeCartQuantity(99, 1), CommerceDomainError);
});

test("Cart version conflicts are typed", () => {
  assert.doesNotThrow(() => assertCartVersion(4, 4));
  assert.throws(
    () => assertCartVersion(4, 3),
    (error: unknown) =>
      error instanceof CommerceDomainError && error.code === "CART_VERSION_CONFLICT",
  );
});

test("request canonicalization is stable across key order", () => {
  const left = { cartId: "c", fulfillment: "pickup", nested: { b: 2, a: 1 } };
  const right = { nested: { a: 1, b: 2 }, fulfillment: "pickup", cartId: "c" };
  assert.equal(canonicalRequestJson(left), canonicalRequestJson(right));
  assert.equal(hashCheckoutRequest(left), hashCheckoutRequest(right));
});

test("idempotency resolution replays matching completion and rejects changed input", () => {
  assert.equal(resolveIdempotency(null, "hash"), "CREATE");
  assert.equal(
    resolveIdempotency({ requestHash: "hash", status: "COMPLETED" }, "hash"),
    "REPLAY",
  );
  assert.throws(
    () => resolveIdempotency({ requestHash: "old", status: "COMPLETED" }, "new"),
    (error: unknown) =>
      error instanceof CommerceDomainError && error.code === "IDEMPOTENCY_CONFLICT",
  );
});
