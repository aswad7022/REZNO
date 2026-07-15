import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { RestaurantReservationApiError } from "../../../features/restaurants/api/errors";
import {
  parseCreateRestaurantReservationRequest,
  parseRestaurantAvailabilityQuery,
  parseRestaurantIdempotencyKey,
} from "../../../features/restaurants/api/validation";

function request(body: unknown, key = randomUUID()) {
  return new Request("https://rezno.invalid/api", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "idempotency-key": key },
    method: "POST",
  });
}

test("restaurant create DTO accepts only the public contract", async () => {
  const body = {
    businessSlug: "qa-restaurant",
    branchId: randomUUID(),
    date: "2026-07-20",
    startsAt: "2026-07-20T09:00:00.000Z",
    guestCount: 2,
    seatingArea: null,
    customerNote: " Window ",
    preorderItems: [{ itemId: randomUUID(), quantity: 2 }],
  };
  const parsed = await parseCreateRestaurantReservationRequest(request(body));
  assert.equal(parsed.customerNote, "Window");
  assert.equal(parsed.guestCount, 2);
  for (const forbidden of ["customerId", "tableId", "price", "status", "durationMinutes", "notification"] as const) {
    await assert.rejects(
      parseCreateRestaurantReservationRequest(request({ ...body, [forbidden]: "forged" })),
      (error: unknown) => error instanceof RestaurantReservationApiError && error.code === "INVALID_REQUEST",
    );
  }
  await assert.rejects(
    parseCreateRestaurantReservationRequest(request({ ...body, guestCount: 2.5 })),
    RestaurantReservationApiError,
  );
  await assert.rejects(
    parseCreateRestaurantReservationRequest(request({ ...body, preorderItems: [{ itemId: body.branchId, quantity: 1, price: 1 }] })),
    RestaurantReservationApiError,
  );
});

test("availability query and UUID idempotency header are strict", () => {
  assert.deepEqual(
    parseRestaurantAvailabilityQuery(new URLSearchParams("date=2026-07-20&guestCount=2")),
    { date: "2026-07-20", guestCount: 2, seatingArea: null },
  );
  assert.throws(
    () => parseRestaurantAvailabilityQuery(new URLSearchParams("date=2026-07-20&guestCount=2&guestCount=3")),
    RestaurantReservationApiError,
  );
  assert.throws(
    () => parseRestaurantIdempotencyKey(new Request("https://rezno.invalid")),
    RestaurantReservationApiError,
  );
  assert.throws(
    () => parseRestaurantIdempotencyKey(new Request("https://rezno.invalid", { headers: { "idempotency-key": "not-a-uuid" } })),
    RestaurantReservationApiError,
  );
});
