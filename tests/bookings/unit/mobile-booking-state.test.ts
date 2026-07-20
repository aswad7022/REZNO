import assert from "node:assert/strict";
import test from "node:test";

import {
  canReviewMobileBooking,
  createMobileBookingSubmissionGate,
  EMPTY_BOOKING_SELECTION,
  mobileBookingFailureRecovery,
  mergeMobileBookingPage,
  mobileBookingManagementFailure,
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

test("mobile management pagination de-duplicates and classifies recovery", () => {
  const booking = {
    id: "booking",
    reference: "RZ-BOOKING",
    businessName: "Business",
    branchName: "Branch",
    serviceName: "Service",
    memberName: null,
    startsAt: "2026-07-20T08:00:00.000Z",
    endsAt: "2026-07-20T08:30:00.000Z",
    timezone: "Asia/Baghdad",
    price: "25000",
    currency: "IQD",
    paymentMethod: null,
    paymentStatus: "UNPAID" as const,
    status: "CONFIRMED" as const,
    createdAt: "2026-07-14T08:00:00.000Z",
    cancellation: {
      eligible: true,
      deadline: "2026-07-19T08:00:00.000Z",
      cancelledAt: null,
    },
    changeRequest: null,
    reviewState: {
      eligible: false,
      hasReview: false,
      reason: "BOOKING_NOT_COMPLETED" as const,
    },
  };
  const merged = mergeMobileBookingPage([booking], {
    items: [{ ...booking, status: "CANCELLED", cancellation: { ...booking.cancellation, eligible: false } }],
    nextCursor: null,
    counts: { all: 1, upcoming: 0, completed: 0, cancelled: 1 },
  }, true);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.status, "CANCELLED");
  assert.deepEqual(mobileBookingManagementFailure("UNAUTHENTICATED"), {
    sessionExpired: true,
    conflict: false,
  });
  assert.equal(
    mobileBookingManagementFailure("BOOKING_STATE_CONFLICT").conflict,
    true,
  );
});
