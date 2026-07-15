import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { OperationalBlocksPage } from "@/features/business-operations/components/operational-blocks-page";
import { getOperationalBlocksView } from "@/features/business-operations/services/blocks-view";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OperationalBlocks");
  return { title: t("title") };
}

export default async function BranchBlocksPage({ params }: PageProps) {
  const { branchId } = await params;
  const [data, t] = await Promise.all([
    getOperationalBlocksView(branchId),
    getTranslations("OperationalBlocks"),
  ]);
  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description", { branch: data.branchName })}
      />
      <OperationalBlocksPage data={data} />
    </DashboardShell>
  );
}
