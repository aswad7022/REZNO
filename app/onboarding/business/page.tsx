import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireActiveIdentity } from "@/features/identity/server";
import { BusinessOnboardingForm } from "@/features/onboarding/components/business-onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Onboarding");
  return { title: t("addBusinessTitle") };
}

export default async function AddBusinessPage() {
  const [{ person }, t] = await Promise.all([
    requireActiveIdentity(),
    getTranslations("Onboarding"),
  ]);

  if (!person.isOnboarded) {
    redirect("/onboarding?intent=business");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4 sm:p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">{t("addBusinessTitle")}</CardTitle>
          <CardDescription>{t("addBusinessDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessOnboardingForm />
        </CardContent>
      </Card>
    </main>
  );
}
