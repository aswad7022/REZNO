import type { NextRequest } from "next/server";

import { parseBookingUuid } from "@/features/bookings/api/validation";
import {
  handleCustomerReviewRequest,
  reviewData,
} from "@/features/reviews/api/http";
import { parseCustomerReviewRequest } from "@/features/reviews/api/validation";
import { reviewDomainError } from "@/features/reviews/domain/errors";
import {
  createOrReplayCustomerReview,
  getCustomerBookingReviewState,
} from "@/features/reviews/services/review-lifecycle";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  return handleCustomerReviewRequest(request, "state", async ({ personId }) => {
    const bookingId = parseBookingUuid((await params).bookingId, "bookingId");
    const state = await getCustomerBookingReviewState(personId, bookingId);
    if (!state) reviewDomainError("NOT_FOUND", "Booking was not found.");
    return reviewData(state);
  });
}

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  return handleCustomerReviewRequest(
    request,
    "create",
    async ({ personId }) => {
      const bookingId = parseBookingUuid((await params).bookingId, "bookingId");
      const review = await parseCustomerReviewRequest(request);
      const result = await createOrReplayCustomerReview({
        bookingId,
        customerId: personId,
        review,
      });
      return reviewData(
        { review: result.review, replayed: result.replayed },
        result.replayed ? 200 : 201,
      );
    },
    { limit: 10 },
  );
}
