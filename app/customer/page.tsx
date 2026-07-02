import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DashboardHome } from "@/features/dashboard/dashboard-home";
import { getDashboardUser } from "@/lib/auth/dashboard-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Dashboard.navigation.items");
  return { title: t("dashboard") };
}

export default async function CustomerPage() {
  const user = await getDashboardUser();

  return <DashboardHome role="customer" user={user} />;
}
