import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BusinessBookingsPage } from "@/features/bookings/components/business-bookings-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Bookings");
  return { title: t("businessTitle") };
}

export default function BusinessBookingsRoute() {
  return <BusinessBookingsPage />;
}
