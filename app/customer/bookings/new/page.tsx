import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { NewBookingPage } from "@/features/bookings/components/new-booking-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Bookings");
  return { title: t("newTitle") };
}

export default async function NewBookingRoute({
  searchParams,
}: {
  searchParams: Promise<{
    offeringId?: string;
    date?: string;
    error?: string;
    memberId?: string;
  }>;
}) {
  return <NewBookingPage {...(await searchParams)} />;
}
