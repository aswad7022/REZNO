import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminReviewsPage } from "@/features/reviews/components/admin-reviews-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Reviews");
  return {
    title: t("adminReviews"),
    description: t("adminReviewsDescription"),
  };
}

export default function AdminReviewsRoute() {
  return <AdminReviewsPage />;
}
