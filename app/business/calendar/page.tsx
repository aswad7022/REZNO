import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BusinessCalendarPage } from "@/features/bookings/components/business-calendar-page";
import type { BusinessCalendarSearchParams } from "@/features/bookings/services/business-calendar";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Bookings");
  return { title: t("calendarTitle") };
}

export default async function BusinessCalendarRoute({
  searchParams,
}: {
  searchParams: Promise<BusinessCalendarSearchParams>;
}) {
  return <BusinessCalendarPage searchParams={await searchParams} />;
}
