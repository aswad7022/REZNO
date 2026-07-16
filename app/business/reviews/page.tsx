import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { requireBusinessIdentity } from "@/features/identity/server";
import { BusinessReviewsPage } from "@/features/reviews/components/business-reviews-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Reviews");
  return {
    title: t("businessReviews"),
    description: t("businessReviewsDescription"),
  };
}

export default async function BusinessReviewsRoute() {
  const identity = await requireBusinessIdentity();
  if (isRestaurantVertical(identity.membership.organization.vertical)) notFound();
  return <BusinessReviewsPage />;
}
