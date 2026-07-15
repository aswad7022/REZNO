import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { RestaurantReservationError } from "../../../features/restaurants/domain/reservation-errors";
import {
  canCustomerManageRestaurantReservation,
  customerRestaurantReservationCursorWhere,
  customerRestaurantReservationOrder,
  customerRestaurantReservationTabWhere,
  decodeCustomerRestaurantReservationCursor,
  encodeCustomerRestaurantReservationCursor,
  restaurantCancellationRequestHash,
  restaurantRescheduleRequestHash,
  restaurantReservationRelationshipsAreValid,
  restaurantReservationCancellationDeadline,
} from "../../../features/restaurants/domain/reservation-management";
import {
  createRestaurantManagementSubmissionGate,
  mergeMobileRestaurantReservationPage,
  mobileRestaurantManagementFailure,
  nextRestaurantReservationDates,
} from "../../../apps/mobile/src/restaurant-reservations/management-state";

test("Restaurant management eligibility shares the configured deadline but keeps a separate domain policy", () => {
  const startsAt = new Date("2026-08-20T12:00:00.000Z");
  assert.equal(
    restaurantReservationCancellationDeadline(startsAt, 24).toISOString(),
    "2026-08-19T12:00:00.000Z",
  );
  assert.equal(
    canCustomerManageRestaurantReservation(
      { startsAt, status: "CONFIRMED", cancellationWindowHours: 24 },
      new Date("2026-08-19T11:59:59.999Z"),
    ),
    true,
  );
  for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW"] as const) {
    assert.equal(
      canCustomerManageRestaurantReservation(
        { startsAt, status, cancellationWindowHours: 24 },
        new Date("2026-08-01T00:00:00.000Z"),
      ),
      false,
    );
  }
});

test("Restaurant relationship integrity rejects cross-tenant branch, table, and menu links", () => {
  const booking = {
    branchId: "branch-a",
    organizationId: "business-a",
    restaurantReservation: {
      branchId: "branch-a",
      businessId: "business-a",
      table: { branchId: "branch-a", businessId: "business-a" },
      items: [{ menuItem: { businessId: "business-a" } }],
    },
  };
  assert.equal(restaurantReservationRelationshipsAreValid(booking), true);
  assert.equal(
    restaurantReservationRelationshipsAreValid({
      ...booking,
      restaurantReservation: {
        ...booking.restaurantReservation,
        businessId: "business-b",
      },
    }),
    false,
  );
  assert.equal(
    restaurantReservationRelationshipsAreValid({
      ...booking,
      restaurantReservation: {
        ...booking.restaurantReservation,
        table: { branchId: "branch-b", businessId: "business-b" },
      },
    }),
    false,
  );
  assert.equal(
    restaurantReservationRelationshipsAreValid({
      ...booking,
      restaurantReservation: {
        ...booking.restaurantReservation,
        items: [{ menuItem: { businessId: "business-b" } }],
      },
    }),
    false,
  );
});

test("Restaurant cursor is versioned, tab-bound, deterministic, and rejects malformed input", () => {
  const value = {
    tab: "upcoming" as const,
    startsAt: "2026-08-20T12:00:00.000Z",
    id: randomUUID(),
    snapshotAt: "2026-07-15T12:00:00.000Z",
  };
  const cursor = encodeCustomerRestaurantReservationCursor(value);
  assert.deepEqual(decodeCustomerRestaurantReservationCursor(cursor, "upcoming"), {
    version: 1,
    ...value,
  });
  assert.throws(
    () => decodeCustomerRestaurantReservationCursor(cursor, "completed"),
    (error: unknown) =>
      error instanceof RestaurantReservationError &&
      error.code === "INVALID_REQUEST",
  );
  assert.throws(
    () => decodeCustomerRestaurantReservationCursor("not-json", "upcoming"),
    RestaurantReservationError,
  );
  assert.deepEqual(customerRestaurantReservationOrder("upcoming"), [
    { startsAt: "asc" },
    { id: "asc" },
  ]);
  assert.deepEqual(customerRestaurantReservationOrder("all"), [
    { startsAt: "desc" },
    { id: "desc" },
  ]);
  assert.ok(customerRestaurantReservationCursorWhere({ version: 1, ...value }));
  assert.deepEqual(
    customerRestaurantReservationTabWhere(
      "completed",
      new Date(value.snapshotAt),
    ),
    { status: "COMPLETED" },
  );
});

test("Restaurant mutation hashes bind the booking and canonical material fields", () => {
  const bookingId = randomUUID();
  const cancellation = { bookingId, reason: null };
  assert.equal(
    restaurantCancellationRequestHash(cancellation),
    restaurantCancellationRequestHash(cancellation),
  );
  assert.notEqual(
    restaurantCancellationRequestHash(cancellation),
    restaurantCancellationRequestHash({ ...cancellation, reason: "changed" }),
  );
  const reschedule = {
    bookingId,
    customerNote: null,
    date: "2026-08-20",
    guestCount: 2,
    seatingArea: "Indoor",
    startsAt: "2026-08-20T12:00:00.000Z",
  };
  assert.notEqual(
    restaurantRescheduleRequestHash(reschedule),
    restaurantRescheduleRequestHash({ ...reschedule, guestCount: 3 }),
  );
});

test("mobile Restaurant management merges cursor pages and gates duplicate submissions", () => {
  const gate = createRestaurantManagementSubmissionGate();
  assert.equal(gate.tryBegin(), true);
  assert.equal(gate.tryBegin(), false);
  gate.finish();
  assert.equal(gate.tryBegin(), true);
  const item = { id: randomUUID() } as never;
  const page = {
    tab: "all" as const,
    items: [item],
    nextCursor: null,
    counts: { all: 1, upcoming: 1, completed: 0, cancelled: 0 },
  };
  assert.deepEqual(mergeMobileRestaurantReservationPage([], page, false), [item]);
  assert.deepEqual(mergeMobileRestaurantReservationPage([item], page, true), [item]);
  assert.equal(mobileRestaurantManagementFailure("TABLE_CONFLICT").conflict, true);
  assert.equal(mobileRestaurantManagementFailure("UNAUTHENTICATED").sessionExpired, true);
  assert.deepEqual(
    nextRestaurantReservationDates(
      "Asia/Baghdad",
      2,
      new Date("2026-07-15T21:30:00.000Z"),
    ),
    ["2026-07-16", "2026-07-17"],
  );
});
