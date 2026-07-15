import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  assertModerationTransition,
  canRespondToBusinessReview,
  decodePublicReviewCursor,
  encodePublicReviewCursor,
  evaluateReviewEligibility,
  isPublicReviewStatus,
  publicReviewCursorWhere,
  reviewInputSchema,
  reviewPayloadsEqual,
  roundPublicRating,
} from "../../../features/reviews/domain/review-policy";
import { ReviewDomainError } from "../../../features/reviews/domain/errors";
import {
  createMobileReviewSubmissionGate,
  mobileReviewFailure,
  reviewStateFromAuthoritative,
} from "../../../apps/mobile/src/reviews/state";

test("canonical eligibility accepts only completed generic bookings with valid links", () => {
  const eligible = {
    bookingStatus: "COMPLETED" as const,
    businessVertical: "BEAUTY" as const,
    hasRestaurantReservation: false,
    hasReview: false,
    relationshipsValid: true,
  };
  assert.deepEqual(evaluateReviewEligibility(eligible), {
    eligible: true,
    reason: "ELIGIBLE",
  });
  for (const bookingStatus of ["PENDING", "CONFIRMED", "CANCELLED", "NO_SHOW"] as const) {
    assert.equal(
      evaluateReviewEligibility({ ...eligible, bookingStatus }).reason,
      "BOOKING_NOT_COMPLETED",
    );
  }
  assert.equal(
    evaluateReviewEligibility({ ...eligible, hasRestaurantReservation: true }).reason,
    "RESTAURANT_FLOW_EXCLUDED",
  );
  assert.equal(
    evaluateReviewEligibility({ ...eligible, businessVertical: "CAFE" }).reason,
    "RESTAURANT_FLOW_EXCLUDED",
  );
  assert.equal(
    evaluateReviewEligibility({ ...eligible, relationshipsValid: false }).reason,
    "RELATED_RECORDS_INVALID",
  );
  assert.equal(
    evaluateReviewEligibility({ ...eligible, hasReview: true }).reason,
    "ALREADY_REVIEWED",
  );
});

test("review DTO is strict, normalized, integer-bounded, and payload-sensitive", () => {
  assert.deepEqual(reviewInputSchema.parse({ rating: 5, comment: "  Great  " }), {
    rating: 5,
    comment: "Great",
  });
  assert.deepEqual(reviewInputSchema.parse({ rating: 4, comment: "   " }), {
    rating: 4,
    comment: null,
  });
  for (const payload of [
    { rating: 0, comment: null },
    { rating: 6, comment: null },
    { rating: 4.5, comment: null },
    { rating: "5", comment: null },
    { rating: 5, comment: "x".repeat(1_001) },
    { rating: 5, comment: null, status: "VISIBLE" },
    { rating: 5, comment: null, customerId: randomUUID() },
  ]) {
    assert.equal(reviewInputSchema.safeParse(payload).success, false);
  }
  assert.equal(reviewPayloadsEqual({ rating: 5, comment: "Great" }, { rating: 5, comment: "Great" }), true);
  assert.equal(reviewPayloadsEqual({ rating: 5, comment: "Great" }, { rating: 4, comment: "Great" }), false);
});

test("visibility, rounding, response roles, and moderation fail closed", () => {
  assert.equal(isPublicReviewStatus("VISIBLE"), true);
  assert.equal(isPublicReviewStatus("HIDDEN"), false);
  assert.equal(isPublicReviewStatus("FLAGGED"), false);
  assert.equal(roundPublicRating(4.449), 4.4);
  assert.equal(roundPublicRating(4.45), 4.5);
  assert.equal(roundPublicRating(null), null);
  assert.equal(canRespondToBusinessReview("OWNER"), true);
  assert.equal(canRespondToBusinessReview("MANAGER"), true);
  assert.equal(canRespondToBusinessReview("RECEPTIONIST"), false);
  assert.equal(canRespondToBusinessReview("STAFF"), false);
  assert.deepEqual(assertModerationTransition("FLAGGED", "HIDDEN"), {
    action: "admin.review.hide",
    changed: true,
  });
  assert.throws(
    () => assertModerationTransition("VISIBLE", "FLAGGED"),
    (error: unknown) => error instanceof ReviewDomainError && error.code === "INVALID_REQUEST",
  );
});

test("public cursor is organization-bound and uses timestamp plus unique ID", () => {
  const organizationId = randomUUID();
  const cursor = {
    organizationId,
    id: randomUUID(),
    createdAt: "2026-07-15T10:00:00.000Z",
  };
  const encoded = encodePublicReviewCursor(cursor);
  assert.deepEqual(decodePublicReviewCursor(encoded, organizationId), cursor);
  assert.deepEqual(publicReviewCursorWhere(cursor), {
    OR: [
      { createdAt: { lt: new Date(cursor.createdAt) } },
      { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
    ],
  });
  assert.throws(() => decodePublicReviewCursor(encoded, randomUUID()), ReviewDomainError);
  assert.throws(() => decodePublicReviewCursor("bad", organizationId), ReviewDomainError);
});

test("mobile review state and duplicate-submit gate cover authoritative outcomes", () => {
  const data = {
    booking: { id: randomUUID(), reference: "RZ-1", status: "COMPLETED" as const },
    eligibility: { eligible: true, reason: "ELIGIBLE" as const },
    review: null,
  };
  assert.equal(reviewStateFromAuthoritative(data).status, "eligible");
  assert.equal(
    reviewStateFromAuthoritative({
      ...data,
      eligibility: { eligible: false, reason: "BOOKING_NOT_COMPLETED" },
    }).status,
    "ineligible",
  );
  assert.equal(
    reviewStateFromAuthoritative({
      ...data,
      eligibility: { eligible: false, reason: "ALREADY_REVIEWED" },
      review: {
        id: randomUUID(),
        rating: 5,
        comment: null,
        status: "HIDDEN",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        businessReply: null,
        businessRepliedAt: null,
      },
    }).status,
    "existing",
  );
  const gate = createMobileReviewSubmissionGate();
  assert.equal(gate.tryBegin(), true);
  assert.equal(gate.tryBegin(), false);
  gate.finish();
  assert.equal(gate.tryBegin(), true);
  assert.equal(mobileReviewFailure("UNAUTHENTICATED").sessionExpired, true);
  assert.equal(mobileReviewFailure("REVIEW_CONFLICT").conflict, true);
  assert.equal(mobileReviewFailure("INVALID_REQUEST").validation, true);
});
