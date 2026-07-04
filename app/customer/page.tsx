import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CustomerControlCenter } from "@/features/customer/components/customer-control-center";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CustomerHome");

  return { title: t("title") };
}

export default async function CustomerPage() {
  return <CustomerControlCenter />;
}
