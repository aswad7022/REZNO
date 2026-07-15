import type { NextRequest } from "next/server";

import { restaurantReservationApiError } from "@/features/restaurants/api/errors";
import { handleCustomerRestaurantRequest, restaurantData } from "@/features/restaurants/api/http";
import {
  parseRestaurantBookingVersion,
  parseRestaurantIdempotencyKey,
  parseRestaurantUuid,
  parseRescheduleRestaurantReservationRequest,
} from "@/features/restaurants/api/validation";
import { getRestaurantReservationDetailForCustomer } from "@/features/restaurants/services/reservation-detail";
import { rescheduleCustomerRestaurantReservation } from "@/features/restaurants/services/reservation-management";

export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  return handleCustomerRestaurantRequest(
    request,
    "reschedule",
    async ({ personId }) => {
      const bookingId = parseRestaurantUuid((await params).bookingId, "bookingId");
      const idempotencyKey = parseRestaurantIdempotencyKey(request);
      const expectedBookingUpdatedAt = parseRestaurantBookingVersion(request);
      const selection = await parseRescheduleRestaurantReservationRequest(request);
      const result = await rescheduleCustomerRestaurantReservation({
        bookingId,
        customerId: personId,
        expectedBookingUpdatedAt,
        idempotencyKey,
        ...selection,
      });
      const reservation = await getRestaurantReservationDetailForCustomer(
        personId,
        bookingId,
      );
      if (!reservation) {
        restaurantReservationApiError("NOT_FOUND", 404, "Reservation was not found.");
      }
      return restaurantData({ reservation, replayed: result.replayed });
    },
    { limit: 12 },
  );
}
