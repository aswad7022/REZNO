import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  cancellationRequestHash,
  changeRequestHash,
  customerBookingCursorWhere,
  decodeCustomerBookingCursor,
  encodeCustomerBookingCursor,
} from "../../../features/bookings/domain/management";
import { BookingDomainError } from "../../../features/bookings/domain/errors";
import {
  bookingCancellationDeadline,
  canCustomerCancelBooking,
  canCustomerRequestBookingChange,
  customerBookingTabMatches,
  isActiveBookingStatus,
  isCompletedBooking,
  isFinalBookingStatus,
} from "../../../features/bookings/policies/booking-lifecycle";

test("customer booking lifecycle policy uses persisted status and the configured deadline", () => {
  const now = new Date("2026-07-14T10:00:00.000Z");
  const startsAt = new Date("2026-07-16T10:00:00.000Z");
  assert.equal(isActiveBookingStatus("CONFIRMED"), true);
  assert.equal(isFinalBookingStatus("CANCELLED"), true);
  assert.equal(isCompletedBooking("NO_SHOW"), false);
  assert.equal(isCompletedBooking("COMPLETED"), true);
  assert.equal(
    bookingCancellationDeadline(startsAt, 24).toISOString(),
    "2026-07-15T10:00:00.000Z",
  );
  assert.equal(
    canCustomerCancelBooking(
      { status: "CONFIRMED", startsAt, cancellationWindowHours: 24 },
      now,
    ),
    true,
  );
  assert.equal(
    canCustomerRequestBookingChange(
      { status: "COMPLETED", startsAt, cancellationWindowHours: 24 },
      now,
    ),
    false,
  );
  assert.equal(
    canCustomerCancelBooking(
      { status: "CONFIRMED", startsAt, cancellationWindowHours: 72 },
      now,
    ),
    false,
  );
});

test("tabs map only canonical statuses and upcoming requires a future active booking", () => {
  const now = new Date("2026-07-14T10:00:00.000Z");
  assert.equal(
    customerBookingTabMatches(
      "upcoming",
      { status: "PENDING", startsAt: new Date("2026-07-15T10:00:00.000Z") },
      now,
    ),
    true,
  );
  assert.equal(
    customerBookingTabMatches(
      "upcoming",
      { status: "CONFIRMED", startsAt: new Date("2026-07-13T10:00:00.000Z") },
      now,
    ),
    false,
  );
  assert.equal(
    customerBookingTabMatches("completed", { status: "NO_SHOW", startsAt: now }, now),
    false,
  );
  assert.equal(
    customerBookingTabMatches("cancelled", { status: "CANCELLED", startsAt: now }, now),
    true,
  );
});

test("booking cursor is stable, filter-bound, and rejects malformed context", () => {
  const id = randomUUID();
  const encoded = encodeCustomerBookingCursor({
    tab: "upcoming",
    startsAt: "2026-07-20T08:00:00.000Z",
    id,
    snapshotAt: "2026-07-14T10:00:00.000Z",
  });
  const decoded = decodeCustomerBookingCursor(encoded, "upcoming");
  assert.equal(decoded.id, id);
  assert.deepEqual(customerBookingCursorWhere(decoded), {
    OR: [
      { startsAt: { gt: new Date("2026-07-20T08:00:00.000Z") } },
      {
        startsAt: new Date("2026-07-20T08:00:00.000Z"),
        id: { gt: id },
      },
    ],
  });
  assert.throws(
    () => decodeCustomerBookingCursor(encoded, "completed"),
    (error: unknown) =>
      error instanceof BookingDomainError && error.code === "INVALID_REQUEST",
  );
  assert.throws(
    () => decodeCustomerBookingCursor("not-json", "upcoming"),
    (error: unknown) =>
      error instanceof BookingDomainError && error.code === "INVALID_REQUEST",
  );
});

test("mutation hashes are deterministic and payload-sensitive", () => {
  const bookingId = randomUUID();
  assert.equal(
    cancellationRequestHash({ bookingId, reason: null }),
    cancellationRequestHash({ bookingId, reason: null }),
  );
  assert.notEqual(
    cancellationRequestHash({ bookingId, reason: null }),
    cancellationRequestHash({ bookingId, reason: "changed" }),
  );
  const selection = {
    bookingId,
    date: "2026-07-20",
    startsAt: "2026-07-20T08:00:00.000Z",
    memberId: randomUUID(),
  };
  assert.notEqual(
    changeRequestHash(selection),
    changeRequestHash({ ...selection, startsAt: "2026-07-20T09:00:00.000Z" }),
  );
});
