import type { NextRequest } from "next/server";

import { bookingData, handleCustomerBookingRequest } from "@/features/bookings/api/http";
import {
  parseAvailabilityQuery,
  parseBookingUuid,
} from "@/features/bookings/api/validation";
import { getCustomerRescheduleOptions } from "@/features/bookings/services/booking-management";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  return handleCustomerBookingRequest(
    request,
    "reschedule-options",
    async ({ personId }) => {
      const bookingId = parseBookingUuid((await params).bookingId, "bookingId");
      const query = parseAvailabilityQuery(request.nextUrl.searchParams);
      return bookingData(
        await getCustomerRescheduleOptions({
          customerId: personId,
          bookingId,
          ...query,
        }),
      );
    },
    { limit: 60 },
  );
}
