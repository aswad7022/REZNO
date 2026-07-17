import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BusinessAnalyticsPage } from "@/features/business-operations/components/business-analytics-page";
import { parseBusinessAnalyticsPeriod } from "@/features/business-operations/domain/closure";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BusinessAnalytics");
  return { description: t("description"), title: t("title") };
}

export default async function BusinessAnalyticsRoute({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const period = parseBusinessAnalyticsPeriod((await searchParams).period);
  if (!period) notFound();
  return <BusinessAnalyticsPage period={period} />;
}
