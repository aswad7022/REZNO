import type { BookingStatus, BusinessVertical, ReviewStatus, SystemRole } from "@prisma/client";
import { z } from "zod";

import { reviewDomainError } from "@/features/reviews/domain/errors";

export const REVIEW_COMMENT_MAX_LENGTH = 1_000;
export const BUSINESS_REPLY_MAX_LENGTH = 1_000;
export const DEFAULT_PUBLIC_REVIEW_PAGE_SIZE = 10;
export const MAX_PUBLIC_REVIEW_PAGE_SIZE = 50;

export const reviewInputSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(REVIEW_COMMENT_MAX_LENGTH).optional().nullable(),
  })
  .strict()
  .transform(({ rating, comment }) => ({
    rating,
    comment: comment?.trim() || null,
  }));

export const businessReplyInputSchema = z
  .object({
    reply: z.string().trim().min(1).max(BUSINESS_REPLY_MAX_LENGTH),
  })
  .strict();

export type NormalizedReviewInput = z.output<typeof reviewInputSchema>;

export type ReviewEligibilityReason =
  | "ELIGIBLE"
  | "ALREADY_REVIEWED"
  | "BOOKING_NOT_COMPLETED"
  | "RELATED_RECORDS_INVALID"
  | "RESTAURANT_FLOW_EXCLUDED";

export function evaluateReviewEligibility(input: {
  bookingStatus: BookingStatus;
  businessVertical: BusinessVertical;
  hasRestaurantReservation: boolean;
  hasReview: boolean;
  relationshipsValid: boolean;
}): { eligible: boolean; reason: ReviewEligibilityReason } {
  if (
    input.hasRestaurantReservation ||
    input.businessVertical === "RESTAURANT" ||
    input.businessVertical === "CAFE"
  ) {
    return { eligible: false, reason: "RESTAURANT_FLOW_EXCLUDED" };
  }
  if (input.bookingStatus !== "COMPLETED") {
    return { eligible: false, reason: "BOOKING_NOT_COMPLETED" };
  }
  if (!input.relationshipsValid) {
    return { eligible: false, reason: "RELATED_RECORDS_INVALID" };
  }
  if (input.hasReview) {
    return { eligible: false, reason: "ALREADY_REVIEWED" };
  }
  return { eligible: true, reason: "ELIGIBLE" };
}

export function reviewPayloadsEqual(
  existing: { rating: number; comment: string | null },
  input: NormalizedReviewInput,
) {
  return existing.rating === input.rating && existing.comment === input.comment;
}

export function isPublicReviewStatus(status: ReviewStatus) {
  return status === "VISIBLE";
}

export function roundPublicRating(value: number | null) {
  return value === null ? null : Math.round((value + Number.EPSILON) * 10) / 10;
}

export function canRespondToBusinessReview(systemRole: SystemRole | null) {
  return systemRole === "OWNER" || systemRole === "MANAGER";
}

export function assertReviewResponseRole(systemRole: SystemRole | null) {
  if (!canRespondToBusinessReview(systemRole)) {
    reviewDomainError("FORBIDDEN", "This business role cannot respond to reviews.");
  }
}

export function assertModerationTransition(
  current: ReviewStatus,
  next: ReviewStatus,
) {
  if (next !== "VISIBLE" && next !== "HIDDEN") {
    reviewDomainError("INVALID_REQUEST", "Unsupported review moderation status.");
  }
  return {
    changed: current !== next,
    action: next === "VISIBLE" ? "admin.review.unhide" : "admin.review.hide",
  };
}

const cursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
});

export type PublicReviewCursor = z.infer<typeof cursorSchema>;

export function encodePublicReviewCursor(cursor: PublicReviewCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodePublicReviewCursor(
  value: string,
  organizationId: string,
): PublicReviewCursor {
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (parsed.organizationId !== organizationId) throw new Error("context");
    return parsed;
  } catch {
    reviewDomainError("INVALID_CURSOR", "Review cursor is invalid.");
  }
}

export function publicReviewCursorWhere(cursor: PublicReviewCursor) {
  const createdAt = new Date(cursor.createdAt);
  return {
    OR: [
      { createdAt: { lt: createdAt } },
      { createdAt, id: { lt: cursor.id } },
    ],
  };
}
