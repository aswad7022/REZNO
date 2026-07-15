import type { NextRequest } from "next/server";

import { restaurantData, handlePublicRestaurantRequest } from "@/features/restaurants/api/http";
import {
  parseRestaurantAvailabilityQuery,
  parseRestaurantUuid,
} from "@/features/restaurants/api/validation";
import { getPublicRestaurantReservationAvailability } from "@/features/restaurants/services/reservation-public";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest, context: { params: Promise<{ branchId: string }> }) {
  return handlePublicRestaurantRequest(
    request,
    "availability",
    async () => {
      const { branchId } = await context.params;
      return restaurantData(
        await getPublicRestaurantReservationAvailability({
          branchId: parseRestaurantUuid(branchId, "branchId"),
          ...parseRestaurantAvailabilityQuery(request.nextUrl.searchParams),
        }),
      );
    },
    { cacheControl: "no-store, max-age=0", limit: 120 },
  );
}
