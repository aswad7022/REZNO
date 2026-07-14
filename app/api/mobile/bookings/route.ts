import type { NextRequest } from "next/server";

import { bookingData, handleCustomerBookingRequest } from "@/features/bookings/api/http";
import {
  parseBookingIdempotencyKey,
  parseCreateBookingRequest,
} from "@/features/bookings/api/validation";
import { createCustomerBooking } from "@/features/bookings/services/booking-creation";

export const dynamic = "force-dynamic";

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
