import type { NextRequest } from "next/server";

import { bookingApiError } from "@/features/bookings/api/errors";
import { bookingData, handleCustomerBookingRequest } from "@/features/bookings/api/http";
import {
  parseBookingIdempotencyKey,
  parseBookingUuid,
  parseCancelBookingRequest,
} from "@/features/bookings/api/validation";
import {
  cancelCustomerBookingPersisted,
  getCustomerBookingManagementDetail,
} from "@/features/bookings/services/booking-management";

export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  return handleCustomerBookingRequest(
    request,
    "cancel",
    async ({ personId }) => {
      const bookingId = parseBookingUuid((await params).bookingId, "bookingId");
      const idempotencyKey = parseBookingIdempotencyKey(request);
      const { reason } = await parseCancelBookingRequest(request);
      const result = await cancelCustomerBookingPersisted({
        customerId: personId,
        bookingId,
        idempotencyKey,
        reason,
      });
      const booking = await getCustomerBookingManagementDetail(personId, bookingId);
      if (!booking) bookingApiError("NOT_FOUND", 404, "Booking was not found.");
      return bookingData({ booking, replayed: result.replayed });
    },
    { limit: 12 },
  );
}
