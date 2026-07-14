import type { NextRequest } from "next/server";

import { bookingData, handlePublicBookingRequest } from "@/features/bookings/api/http";
import {
  parseBookingSlug,
  parseBookingUuid,
} from "@/features/bookings/api/validation";
import { getPublicServiceBranches } from "@/features/bookings/services/booking-catalog";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ serviceId: string; slug: string }> },
) {
  return handlePublicBookingRequest(request, "service.branches", async () => {
    const values = await params;
    const slug = parseBookingSlug(values.slug);
    const serviceId = parseBookingUuid(values.serviceId, "serviceId");
    return bookingData(await getPublicServiceBranches(slug, serviceId));
  });
}
