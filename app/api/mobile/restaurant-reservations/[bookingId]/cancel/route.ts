import type { NextRequest } from "next/server";

import { restaurantReservationApiError } from "@/features/restaurants/api/errors";
import { handleCustomerRestaurantRequest, restaurantData } from "@/features/restaurants/api/http";
import {
  parseCancelRestaurantReservationRequest,
  parseRestaurantBookingVersion,
  parseRestaurantIdempotencyKey,
  parseRestaurantUuid,
} from "@/features/restaurants/api/validation";
import { getRestaurantReservationDetailForCustomer } from "@/features/restaurants/services/reservation-detail";
import { cancelCustomerRestaurantReservation } from "@/features/restaurants/services/reservation-management";

export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  return handleCustomerRestaurantRequest(
    request,
    "cancel",
    async ({ personId }) => {
      const bookingId = parseRestaurantUuid((await params).bookingId, "bookingId");
      const idempotencyKey = parseRestaurantIdempotencyKey(request);
      const expectedBookingUpdatedAt = parseRestaurantBookingVersion(request);
      const { reason } = await parseCancelRestaurantReservationRequest(request);
      const result = await cancelCustomerRestaurantReservation({
        bookingId,
        customerId: personId,
        expectedBookingUpdatedAt,
        idempotencyKey,
        reason,
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
