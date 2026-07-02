import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ServiceManagementPage } from "@/features/services/components/service-management-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Services");
  return { title: t("title"), description: t("description") };
}

export default async function BusinessServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  return <ServiceManagementPage editId={edit} />;
}
