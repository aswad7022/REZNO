import type { NextRequest } from "next/server";

import { restaurantReservationApiError } from "@/features/restaurants/api/errors";
import { handleCustomerRestaurantRequest, restaurantData } from "@/features/restaurants/api/http";
import { parseRestaurantUuid } from "@/features/restaurants/api/validation";
import { getRestaurantReservationDetailForCustomer } from "@/features/restaurants/services/reservation-detail";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest, context: { params: Promise<{ bookingId: string }> }) {
  return handleCustomerRestaurantRequest(request, "detail", async ({ personId }) => {
    const { bookingId } = await context.params;
    const detail = await getRestaurantReservationDetailForCustomer(
      personId,
      parseRestaurantUuid(bookingId, "bookingId"),
    );
    if (!detail) {
      restaurantReservationApiError("NOT_FOUND", 404, "Reservation was not found.");
    }
    return restaurantData(detail);
  });
}
