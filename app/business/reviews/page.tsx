import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BusinessReviewsPage } from "@/features/reviews/components/business-reviews-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Reviews");
  return {
    title: t("businessReviews"),
    description: t("businessReviewsDescription"),
  };
}

export default function BusinessReviewsRoute() {
  return <BusinessReviewsPage />;
}
