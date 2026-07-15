import type { NextRequest } from "next/server";

import { handleCustomerRestaurantRequest, restaurantData } from "@/features/restaurants/api/http";
import {
  parseRestaurantAvailabilityQuery,
  parseRestaurantUuid,
} from "@/features/restaurants/api/validation";
import { getCustomerRestaurantRescheduleOptions } from "@/features/restaurants/services/reservation-management";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  return handleCustomerRestaurantRequest(
    request,
    "reschedule-options",
    async ({ personId }) => {
      const bookingId = parseRestaurantUuid((await params).bookingId, "bookingId");
      const query = parseRestaurantAvailabilityQuery(request.nextUrl.searchParams);
      return restaurantData(
        await getCustomerRestaurantRescheduleOptions({
          bookingId,
          customerId: personId,
          ...query,
        }),
      );
    },
    { limit: 60 },
  );
}
