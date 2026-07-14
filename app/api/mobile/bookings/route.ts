import type { NextRequest } from "next/server";

import { bookingData, handleCustomerBookingRequest } from "@/features/bookings/api/http";
import {
  parseBookingIdempotencyKey,
  parseCustomerBookingListQuery,
  parseCreateBookingRequest,
} from "@/features/bookings/api/validation";
import { createCustomerBooking } from "@/features/bookings/services/booking-creation";
import { listCustomerBookings } from "@/features/bookings/services/booking-management";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerBookingRequest(
    request,
    "list",
    async ({ personId }) => {
      const query = parseCustomerBookingListQuery(request.nextUrl.searchParams);
      return bookingData(
        await listCustomerBookings({ customerId: personId, ...query }),
      );
    },
    { limit: 120 },
  );
}

export function POST(request: NextRequest) {
  return handleCustomerBookingRequest(
    request,
    "create",
    async ({ personId }) => {
      const idempotencyKey = parseBookingIdempotencyKey(request);
      const input = await parseCreateBookingRequest(request);
      const result = await createCustomerBooking({
        ...input,
        customerId: personId,
        idempotencyKey,
      });
      return bookingData(result, result.replayed ? 200 : 201);
    },
    { limit: 10 },
  );
}
