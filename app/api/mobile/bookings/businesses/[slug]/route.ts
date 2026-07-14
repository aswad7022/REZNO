import type { NextRequest } from "next/server";

import { bookingData, handlePublicBookingRequest } from "@/features/bookings/api/http";
import { parseBookingSlug } from "@/features/bookings/api/validation";
import { getPublicBookingBusiness } from "@/features/bookings/services/booking-catalog";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handlePublicBookingRequest(request, "business.detail", async () => {
    const slug = parseBookingSlug((await params).slug);
    return bookingData(await getPublicBookingBusiness(slug));
  });
}
