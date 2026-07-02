import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PublicProfileManagementPage } from "@/features/business/components/public-profile-management-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PublicProfileManagement");
  return { title: t("title") };
}

export default function BusinessPublicProfileRoute() {
  return <PublicProfileManagementPage />;
}
