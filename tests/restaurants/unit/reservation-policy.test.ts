import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { RestaurantReservationError } from "../../../features/restaurants/domain/reservation-errors";
import {
  normalizeRestaurantNote,
  normalizeRestaurantPreorder,
  parseRestaurantDate,
  restaurantLocalTime,
  restaurantReservationRequestHash,
  selectRestaurantTable,
  validateRestaurantDateRange,
  validateRestaurantGuestCount,
} from "../../../features/restaurants/domain/reservation-policy";
import {
  canReviewMobileRestaurantReservation,
  createRestaurantReservationSubmissionGate,
  EMPTY_RESTAURANT_RESERVATION_SELECTION,
  mobileRestaurantReservationFailure,
  restaurantPreorderItems,
} from "../../../apps/mobile/src/restaurant-reservations/state";

function errorCode(code: RestaurantReservationError["code"]) {
  return (error: unknown) => error instanceof RestaurantReservationError && error.code === code;
}

test("restaurant date, guest, note, preorder, and table policies fail closed", () => {
  assert.deepEqual(parseRestaurantDate("2026-02-28"), { year: 2026, month: 1, day: 28 });
  assert.equal(parseRestaurantDate("2026-02-30"), null);
  assert.equal(validateRestaurantGuestCount(1), 1);
  assert.equal(validateRestaurantGuestCount(100), 100);
  for (const count of [0, -1, 1.5, 101]) {
    assert.throws(() => validateRestaurantGuestCount(count), errorCode("INVALID_REQUEST"));
  }
  assert.equal(normalizeRestaurantNote("  hello  "), "hello");
  assert.equal(normalizeRestaurantNote("   "), null);
  assert.throws(() => normalizeRestaurantNote("x".repeat(501)), errorCode("INVALID_REQUEST"));

  const firstId = randomUUID();
  const secondId = randomUUID();
  assert.deepEqual(
    normalizeRestaurantPreorder([
      { itemId: firstId, quantity: 2 },
      { itemId: secondId, quantity: 1 },
      { itemId: firstId, quantity: 3 },
    ]),
    [
      { itemId: firstId, quantity: 5 },
      { itemId: secondId, quantity: 1 },
    ].sort((left, right) => left.itemId.localeCompare(right.itemId)),
  );
  for (const quantity of [0, -1, 1.5, 21]) {
    assert.throws(
      () => normalizeRestaurantPreorder([{ itemId: firstId, quantity }]),
      errorCode("INVALID_REQUEST"),
    );
  }

  const tables = [
    { id: "b", name: "B", capacity: 4, area: "Indoor" },
    { id: "a", name: "A", capacity: 4, area: "Indoor" },
    { id: "c", name: "C", capacity: 6, area: "Terrace" },
  ];
  assert.equal(selectRestaurantTable(tables, 4, null)?.id, "a");
  assert.equal(selectRestaurantTable(tables, 5, "Terrace")?.id, "c");
  assert.equal(selectRestaurantTable(tables, 5, "Indoor"), null);
});

test("timezone range and DST validation reject invalid local boundaries", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  assert.deepEqual(validateRestaurantDateRange("2026-03-01", "UTC", now), {
    year: 2026,
    month: 2,
    day: 1,
  });
  assert.throws(
    () => validateRestaurantDateRange("2026-06-01", "UTC", now),
    errorCode("DATE_OUT_OF_RANGE"),
  );
  assert.throws(
    () => validateRestaurantDateRange("2026-03-01", "Invalid/Timezone", now),
    errorCode("INVALID_REQUEST"),
  );
  const dstDate = parseRestaurantDate("2026-03-08")!;
  assert.equal(restaurantLocalTime(dstDate, "02:30", "America/New_York"), null);
  assert.ok(restaurantLocalTime(dstDate, "03:30", "America/New_York"));
});

test("request hashing is deterministic and material-choice sensitive", () => {
  const base = {
    businessSlug: "qa-restaurant",
    branchId: randomUUID(),
    customerNote: null,
    date: "2026-07-20",
    durationMinutes: 90,
    guestCount: 2,
    preorderItems: [] as Array<{ itemId: string; quantity: number }>,
    seatingArea: null,
    startsAt: "2026-07-20T09:00:00.000Z",
  };
  assert.equal(restaurantReservationRequestHash(base), restaurantReservationRequestHash({ ...base }));
  for (const changed of [
    { ...base, guestCount: 3 },
    { ...base, seatingArea: "Terrace" },
    { ...base, customerNote: "Window" },
    { ...base, startsAt: "2026-07-20T09:30:00.000Z" },
  ]) {
    assert.notEqual(restaurantReservationRequestHash(base), restaurantReservationRequestHash(changed));
  }
});

test("mobile state normalizes preorder, blocks duplicate submit, and recovers by error class", () => {
  assert.deepEqual(restaurantPreorderItems({ b: 0, c: 2, a: 1 }), [
    { itemId: "a", quantity: 1 },
    { itemId: "c", quantity: 2 },
  ]);
  const gate = createRestaurantReservationSubmissionGate();
  assert.equal(gate.tryBegin(), true);
  assert.equal(gate.tryBegin(), false);
  gate.finish();
  assert.equal(gate.tryBegin(), true);
  assert.equal(mobileRestaurantReservationFailure("TABLE_CONFLICT").returnToAvailability, true);
  assert.equal(mobileRestaurantReservationFailure("MENU_ITEM_UNAVAILABLE").returnToMenu, true);
  assert.equal(mobileRestaurantReservationFailure("UNAUTHENTICATED").requiresAuthentication, true);
  assert.equal(canReviewMobileRestaurantReservation(EMPTY_RESTAURANT_RESERVATION_SELECTION), false);
});
