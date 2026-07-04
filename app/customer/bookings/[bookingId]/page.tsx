import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CustomerBookingDetailsPage } from "@/features/bookings/components/customer-booking-details-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Bookings");
  return { title: t("detailsTitle") };
}

export default async function CustomerBookingDetailsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ bookingId }, query] = await Promise.all([params, searchParams]);

  return (
    <CustomerBookingDetailsPage
      bookingId={bookingId}
      created={query.created === "1"}
    />
  );
}
