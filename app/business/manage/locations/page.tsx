import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BranchManagementPage } from "@/features/branches/components/branch-management-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Branches");
  return { title: t("title"), description: t("description") };
}

export default function BusinessLocationsPage() {
  return <BranchManagementPage />;
}
