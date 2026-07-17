import type { Metadata } from "next";

import { BusinessCalendarPage } from "@/features/bookings/components/business-calendar-page";
import type { BusinessCalendarSearchParams } from "@/features/bookings/services/business-calendar";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { requireRestaurantBusiness } from "@/features/restaurants/services/restaurant-management";

export const metadata: Metadata = { title: "حجوزات المطعم | REZNO" };

export default async function BusinessReservationsRoute({
  searchParams,
}: {
  searchParams: Promise<BusinessCalendarSearchParams>;
}) {
  await Promise.all([
    requireRestaurantBusiness(),
    currentBusinessOperationReference("RESTAURANT_RESERVATION_OPERATE"),
  ]);
  return (
    <BusinessCalendarPage
      searchParams={{ ...(await searchParams), type: "restaurant" }}
    />
  );
}
