import type { NextRequest } from "next/server";

import { bookingData, handlePublicBookingRequest } from "@/features/bookings/api/http";
import { parseBookingUuid } from "@/features/bookings/api/validation";
import { getPublicOfferingStaff } from "@/features/bookings/services/booking-catalog";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ branchServiceId: string }> },
) {
  return handlePublicBookingRequest(request, "offering.staff", async () => {
    const branchServiceId = parseBookingUuid(
      (await params).branchServiceId,
      "branchServiceId",
    );
    return bookingData(await getPublicOfferingStaff(branchServiceId));
  });
}
