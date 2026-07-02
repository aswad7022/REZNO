import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AvailabilityPage } from "@/features/availability/components/availability-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Availability");
  return { title: t("title") };
}

export default async function MemberAvailabilityRoute({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  return <AvailabilityPage memberId={memberId} />;
}
