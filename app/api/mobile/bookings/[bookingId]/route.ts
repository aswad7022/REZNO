import type { NextRequest } from "next/server";

import { bookingApiError } from "@/features/bookings/api/errors";
import { bookingData, handleCustomerBookingRequest } from "@/features/bookings/api/http";
import { parseBookingUuid } from "@/features/bookings/api/validation";
import { getCustomerBookingManagementDetail } from "@/features/bookings/services/booking-management";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  return handleCustomerBookingRequest(request, "detail", async ({ personId }) => {
    const bookingId = parseBookingUuid((await params).bookingId, "bookingId");
    const booking = await getCustomerBookingManagementDetail(personId, bookingId);
    if (!booking) bookingApiError("NOT_FOUND", 404, "Booking was not found.");
    return bookingData(booking);
  });
}
