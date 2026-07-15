import type { BookingStatus, ReviewStatus } from "@prisma/client";

import type { ReviewEligibilityReason } from "@/features/reviews/domain/review-policy";

export interface ReviewActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const initialReviewActionState: ReviewActionState = { status: "idle" };

export interface CustomerReviewRecord {
  id: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  businessReply: string | null;
  businessRepliedAt: string | null;
}

export interface CustomerBookingReviewState {
  booking: {
    id: string;
    reference: string;
    status: BookingStatus;
  };
  eligibility: {
    eligible: boolean;
    reason: ReviewEligibilityReason;
  };
  review: CustomerReviewRecord | null;
}

export interface PublicReviewSummary {
  averageRating: number | null;
  reviewCount: number;
  ratingDistribution: Record<"1" | "2" | "3" | "4" | "5", number>;
}
