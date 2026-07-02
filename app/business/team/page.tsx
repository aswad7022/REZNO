import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { TeamManagementPage } from "@/features/team/components/team-management-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Team");
  return { title: t("title"), description: t("description") };
}

export default function BusinessTeamPage() {
  return <TeamManagementPage />;
}
