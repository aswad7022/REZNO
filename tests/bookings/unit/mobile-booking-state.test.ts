import assert from "node:assert/strict";
import test from "node:test";

import {
  canReviewMobileBooking,
  createMobileBookingSubmissionGate,
  EMPTY_BOOKING_SELECTION,
  mobileBookingFailureRecovery,
  nextBookingDates,
  selectMobileBookingBranch,
  selectMobileBookingDate,
  selectMobileBookingService,
  selectMobileBookingSlot,
  selectMobileBookingStaff,
} from "../../../apps/mobile/src/bookings/state";
import type {
  MobileBookingBranch,
  MobileBookingService,
} from "../../../apps/mobile/src/types/bookings";

const service: MobileBookingService = {
  branchCount: 1,
  categoryName: "Beauty",
  description: null,
  durationMinutes: 30,
  id: "service",
  imageUrl: null,
  name: "Haircut",
  staffSelectionMode: "REQUIRED",
  startingPrice: "25000",
};
const branch: MobileBookingBranch = {
  address: null,
  branchId: "branch",
  branchServiceId: "offering",
  city: "Baghdad",
  durationMinutes: 30,
  locationLabel: null,
  name: "Main",
  price: "25000",
  pricingType: "FIXED",
  staffSelectionMode: "REQUIRED",
  timezone: "Asia/Baghdad",
};
const slot = {
  endsAt: "2026-07-20T08:30:00.000Z",
  memberId: "member",
  memberName: "Sara",
  startsAt: "2026-07-20T08:00:00.000Z",
};

test("mobile booking selection resets dependent choices and requires a persisted slot", () => {
  let state = selectMobileBookingService(EMPTY_BOOKING_SELECTION, service);
  state = selectMobileBookingBranch(state, branch);
  state = selectMobileBookingStaff(state, "member");
  state = selectMobileBookingDate(state, "2026-07-20");
  state = selectMobileBookingSlot(state, slot);
  assert.equal(canReviewMobileBooking(state), true);

  const changedService = selectMobileBookingService(state, {
    ...service,
    id: "different",
  });
  assert.equal(changedService.branch, null);
  assert.equal(changedService.slot, null);
  assert.equal(canReviewMobileBooking(changedService), false);

  const changedDate = selectMobileBookingDate(state, "2026-07-21");
  assert.equal(changedDate.slot, null);
});

test("date rail is deterministic, timezone-aware, and duplicate-free", () => {
  const dates = nextBookingDates(
    "Asia/Baghdad",
    3,
    new Date("2026-07-14T22:30:00.000Z"),
  );
  assert.deepEqual(dates, ["2026-07-15", "2026-07-16", "2026-07-17"]);
});

test("duplicate submission is single-flight and becomes retryable after completion", () => {
  const gate = createMobileBookingSubmissionGate();
  assert.equal(gate.tryBegin(), true);
  assert.equal(gate.tryBegin(), false);
  gate.finish();
  assert.equal(gate.tryBegin(), true);
});

test("mobile submission recovery distinguishes conflicts, authentication, and networks", () => {
  assert.deepEqual(mobileBookingFailureRecovery("SLOT_CONFLICT"), {
    requiresAuthentication: false,
    returnToSlots: true,
  });
  assert.deepEqual(mobileBookingFailureRecovery("UNAUTHENTICATED"), {
    requiresAuthentication: true,
    returnToSlots: false,
  });
  assert.deepEqual(mobileBookingFailureRecovery(undefined), {
    requiresAuthentication: false,
    returnToSlots: false,
  });
});
