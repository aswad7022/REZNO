import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { WorkingHoursForm } from "@/features/working-hours/components/working-hours-form";
import { getBranchWorkingHours } from "@/features/working-hours/services/working-hours";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("WorkingHours");
  return { title: t("title") };
}

export default async function BranchWorkingHoursPage({ params }: PageProps) {
  const { branchId } = await params;
  const [schedule, t] = await Promise.all([
    getBranchWorkingHours(branchId),
    getTranslations("WorkingHours"),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description", { branch: schedule.branchName })}
      />
      <WorkingHoursForm schedule={schedule} />
    </DashboardShell>
  );
}
