import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { BusinessAuditPage } from "@/features/business-operations/components/business-audit-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BusinessAudit");
  return { description: t("description"), title: t("title") };
}

export default async function BusinessAuditRoute() {
  const t = await getTranslations("BusinessAudit");
  return (
    <DashboardShell>
      <DashboardPageHeader title={t("title")} description={t("description")} />
      <BusinessAuditPage />
    </DashboardShell>
  );
}
