import type { Metadata } from "next";

import { BusinessCalendarPage } from "@/features/bookings/components/business-calendar-page";
import type { BusinessCalendarSearchParams } from "@/features/bookings/services/business-calendar";

export const metadata: Metadata = { title: "حجوزات المطعم | REZNO" };

export default async function BusinessReservationsRoute({
  searchParams,
}: {
  searchParams: Promise<BusinessCalendarSearchParams>;
}) {
  return (
    <BusinessCalendarPage
      searchParams={{ ...(await searchParams), type: "restaurant" }}
    />
  );
}
