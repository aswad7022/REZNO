import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ProfilePage } from "@/features/profile/components/profile-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Profile");
  return { title: t("title") };
}

export default function CustomerProfilePage() {
  return <ProfilePage role="customer" />;
}
