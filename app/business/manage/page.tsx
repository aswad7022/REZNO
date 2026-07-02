import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BusinessManagementPage } from "@/features/business/components/business-management-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BusinessManagement");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function BusinessManagePage() {
  return <BusinessManagementPage />;
}
