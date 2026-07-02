import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CustomerBookingsPage } from "@/features/bookings/components/customer-bookings-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Bookings");
  return { title: t("customerTitle") };
}

export default async function CustomerBookingsRoute({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; rescheduled?: string }>;
}) {
  const query = await searchParams;
  return (
    <CustomerBookingsPage
      created={query.created === "1"}
      rescheduled={query.rescheduled === "1"}
    />
  );
}
