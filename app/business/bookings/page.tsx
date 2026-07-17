import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { BusinessCalendarPage } from "@/features/bookings/components/business-calendar-page";
import type { BusinessCalendarSearchParams } from "@/features/bookings/services/business-calendar";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { requireBusinessIdentity } from "@/features/identity/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Bookings");
  return { title: t("businessTitle") };
}

export default async function BusinessBookingsRoute({
  searchParams,
}: {
  searchParams: Promise<BusinessCalendarSearchParams>;
}) {
  const identity = await requireBusinessIdentity();
  if (isRestaurantVertical(identity.membership.organization.vertical)) notFound();
  return (
    <BusinessCalendarPage
      searchParams={{ ...(await searchParams), type: "service" }}
    />
  );
}
