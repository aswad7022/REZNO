import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { RescheduleBookingPage } from "@/features/bookings/components/reschedule-booking-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Bookings");
  return { title: t("rescheduleTitle") };
}

export default async function RescheduleBookingRoute({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{
    date?: string;
    memberId?: string;
    error?: "invalid" | "unavailable" | "notAllowed";
  }>;
}) {
  const [{ bookingId }, query] = await Promise.all([params, searchParams]);
  return <RescheduleBookingPage bookingId={bookingId} {...query} />;
}
