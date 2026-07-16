import type { Metadata } from "next";

import { BusinessBookingDetailPage } from "@/features/bookings/components/business-booking-detail-page";

export const metadata: Metadata = { title: "تفاصيل الحجز | REZNO" };

export default async function BusinessBookingDetailRoute({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return <BusinessBookingDetailPage bookingId={bookingId} />;
}
