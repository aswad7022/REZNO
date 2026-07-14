import type { NextRequest } from "next/server";

import { bookingData, handlePublicBookingRequest } from "@/features/bookings/api/http";
import {
  parseAvailabilityQuery,
  parseBookingUuid,
} from "@/features/bookings/api/validation";
import { getPublicBookingAvailability } from "@/features/bookings/services/booking-availability";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ branchServiceId: string }> },
) {
  return handlePublicBookingRequest(
    request,
    "offering.availability",
    async () => {
      const branchServiceId = parseBookingUuid(
        (await params).branchServiceId,
        "branchServiceId",
      );
      const query = parseAvailabilityQuery(request.nextUrl.searchParams);
      return bookingData(
        await getPublicBookingAvailability({ branchServiceId, ...query }),
      );
    },
    { cacheControl: "no-store, max-age=0", limit: 120 },
  );
}
