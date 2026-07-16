import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ServiceManagementPage } from "@/features/services/components/service-management-page";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { requireBusinessIdentity } from "@/features/identity/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Services");
  return { title: t("title"), description: t("description") };
}

export default async function BusinessServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const identity = await requireBusinessIdentity();
  if (isRestaurantVertical(identity.membership.organization.vertical)) notFound();
  const { edit } = await searchParams;
  return <ServiceManagementPage editId={edit} />;
}
