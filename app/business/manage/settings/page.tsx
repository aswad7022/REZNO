import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BusinessSettingsPage } from "@/features/business-settings/components/business-settings-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BusinessSettings");
  return { title: t("title"), description: t("description") };
}

export default function BusinessSettingsRoute() {
  return <BusinessSettingsPage />;
}
