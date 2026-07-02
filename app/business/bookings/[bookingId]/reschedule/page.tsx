import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ProposeBookingChangePage } from "@/features/bookings/components/propose-booking-change-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Bookings.changeRequest");
  return { title: t("title") };
}

export default async function ProposeBookingChangeRoute({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{
    date?: string;
    memberId?: string;
    error?: "invalid" | "unavailable";
  }>;
}) {
  const [{ bookingId }, query] = await Promise.all([params, searchParams]);
  return <ProposeBookingChangePage bookingId={bookingId} {...query} />;
}
