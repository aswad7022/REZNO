import type { NextRequest } from "next/server";

import { bookingApiError } from "@/features/bookings/api/errors";
import { bookingData, handleCustomerBookingRequest } from "@/features/bookings/api/http";
import {
  parseBookingIdempotencyKey,
  parseBookingUuid,
  parseChangeBookingRequest,
} from "@/features/bookings/api/validation";
import {
  getCustomerBookingManagementDetail,
  requestCustomerBookingChange,
} from "@/features/bookings/services/booking-management";

export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  return handleCustomerBookingRequest(
    request,
    "change-request",
    async ({ personId }) => {
      const bookingId = parseBookingUuid((await params).bookingId, "bookingId");
      const idempotencyKey = parseBookingIdempotencyKey(request);
      const selection = await parseChangeBookingRequest(request);
      const result = await requestCustomerBookingChange({
        ...selection,
        customerId: personId,
        bookingId,
        idempotencyKey,
      });
      const booking = await getCustomerBookingManagementDetail(personId, bookingId);
      if (!booking) bookingApiError("NOT_FOUND", 404, "Booking was not found.");
      return bookingData({ booking, replayed: result.replayed }, result.replayed ? 200 : 201);
    },
    { limit: 12 },
  );
}
