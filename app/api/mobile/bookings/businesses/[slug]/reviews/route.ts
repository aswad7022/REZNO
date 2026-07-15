import type { NextRequest } from "next/server";

import { parseBookingSlug } from "@/features/bookings/api/validation";
import {
  handlePublicReviewRequest,
  reviewData,
} from "@/features/reviews/api/http";
import { parsePublicReviewQuery } from "@/features/reviews/api/validation";
import { listPublicBusinessReviews } from "@/features/reviews/services/review-lifecycle";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handlePublicReviewRequest(request, "business.list", async () => {
    const slug = parseBookingSlug((await params).slug);
    const query = parsePublicReviewQuery(request.nextUrl.searchParams);
    return reviewData(await listPublicBusinessReviews({ slug, ...query }));
  });
}
