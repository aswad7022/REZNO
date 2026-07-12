import assert from "node:assert/strict";
import test from "node:test";

import {
  reservationExpiresAt,
  stockMovementKey,
} from "../../../features/commerce/domain/inventory";

test("reservations expire exactly fifteen minutes after creation", () => {
  const now = new Date("2026-07-12T12:00:00.000Z");
  assert.equal(reservationExpiresAt(now).toISOString(), "2026-07-12T12:15:00.000Z");
});

test("stock movement keys are deterministic and action-specific", () => {
  const input = {
    action: "reserve",
    orderId: "order",
    reservationId: "reservation",
    variantId: "variant",
  };
  assert.equal(stockMovementKey(input), stockMovementKey(input));
  assert.notEqual(stockMovementKey(input), stockMovementKey({ ...input, action: "release" }));
});
