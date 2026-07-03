import type { Metadata } from "next";
import { CalendarCheck2 } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAnyBusinessMembership,
  requireActiveIdentity,
} from "@/features/identity/server";
import { completeCustomerOnboarding } from "@/features/onboarding/actions/complete-onboarding";
import { BusinessOnboardingForm } from "@/features/onboarding/components/business-onboarding-form";
import { getSafeInternalPath } from "@/lib/navigation/safe-redirect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Onboarding");
  return { title: t("title") };
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; next?: string }>;
}) {
  const [{ person }, query, t] = await Promise.all([
    requireActiveIdentity(),
    searchParams,
    getTranslations("Onboarding"),
  ]);

  if (person.isOnboarded) {
    const next = getSafeInternalPath(query.next, "");
    if (next) {
      redirect(next);
    }

    const membership = await getAnyBusinessMembership(person.id);

    if (membership) {
      redirect("/business");
    }

    if (query.intent !== "business") {
      redirect("/customer");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4 sm:p-6">
      <div className="w-full max-w-4xl">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
            R
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("welcome")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t("description")}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader>
              <span className="mb-2 grid size-10 place-items-center rounded-xl bg-muted">
                <CalendarCheck2 className="size-5" aria-hidden="true" />
              </span>
              <CardTitle>{t("customerTitle")}</CardTitle>
              <CardDescription>
                {t("customerDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={completeCustomerOnboarding.bind(null, query.next)}
              >
                <Button type="submit" variant="outline" className="w-full">
                  {t("continueCustomer")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("businessTitle")}</CardTitle>
              <CardDescription>
                {t("businessDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BusinessOnboardingForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
