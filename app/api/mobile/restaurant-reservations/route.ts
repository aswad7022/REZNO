import type { NextRequest } from "next/server";

import { handleCustomerRestaurantRequest, restaurantData } from "@/features/restaurants/api/http";
import {
  parseCreateRestaurantReservationRequest,
  parseRestaurantIdempotencyKey,
} from "@/features/restaurants/api/validation";
import { createCustomerRestaurantReservation } from "@/features/restaurants/services/reservation-creation";

export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return handleCustomerRestaurantRequest(
    request,
    "create",
    async ({ personId }) => {
      const idempotencyKey = parseRestaurantIdempotencyKey(request);
      const input = await parseCreateRestaurantReservationRequest(request);
      const result = await createCustomerRestaurantReservation({
        ...input,
        customerId: personId,
        idempotencyKey,
      });
      return restaurantData(result, result.replayed ? 200 : 201);
    },
    { limit: 10 },
  );
}
