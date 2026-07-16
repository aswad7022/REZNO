import type { Metadata } from "next";

import { BusinessRestaurantReservationDetailPage } from "@/features/restaurants/components/business-restaurant-reservation-detail-page";

export const metadata: Metadata = { title: "تفاصيل حجز المطعم | REZNO" };

export default async function BusinessRestaurantReservationDetailRoute({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return <BusinessRestaurantReservationDetailPage bookingId={bookingId} />;
}
