import type { NextRequest } from "next/server";

import { restaurantData, handlePublicRestaurantRequest } from "@/features/restaurants/api/http";
import { parseRestaurantSlug } from "@/features/restaurants/api/validation";
import { getPublicRestaurantReservationBusiness } from "@/features/restaurants/services/reservation-public";

export function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  return handlePublicRestaurantRequest(request, "business-detail", async () => {
    const { slug } = await context.params;
    return restaurantData(
      await getPublicRestaurantReservationBusiness(parseRestaurantSlug(slug)),
    );
  });
}
