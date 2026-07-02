import Link from "next/link";
import {
  ArrowLeft,
  CalendarCheck2,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { BusinessCard } from "@/components/public-site/business-card";
import { PublicFooter } from "@/components/public-site/public-footer";
import { PublicHeader } from "@/components/public-site/public-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { searchMarketplace } from "@/features/marketplace/services/marketplace";
import { getPublicOfferings } from "@/features/bookings/services/bookings";
import {
  getCurrentIdentity,
  getAnyBusinessMembership,
} from "@/features/identity/server";

export default async function Home() {
  const identity = await getCurrentIdentity();
  if (identity) {
    if (!identity.person.isOnboarded) {
      redirect("/onboarding");
    }

    const membership = await getAnyBusinessMembership(identity.person.id);
    redirect(membership ? "/business" : "/customer");
  }

  const [t, businesses, offerings] = await Promise.all([
    getTranslations("Landing"),
    searchMarketplace({ take: 6 }),
    getPublicOfferings(),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main>
        <section className="relative overflow-hidden border-b">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_35%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.1fr_.9fr] lg:py-36">
            <div>
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-sm text-muted-foreground">
                <Sparkles className="size-4" />
                {t("eyebrow")}
              </span>
              <h1 className="max-w-3xl text-4xl leading-tight font-bold tracking-tight text-balance sm:text-6xl">
                {t("title")}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                {t("description")}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/marketplace">
                    <Search />
                    {t("explore")}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/register?intent=business">
                    {t("listBusiness")}
                  </Link>
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {([
                [Search, "searchFeature"],
                [CalendarCheck2, "bookingFeature"],
                [ShieldCheck, "manageFeature"],
              ] satisfies Array<
                [
                  LucideIcon,
                  "searchFeature" | "bookingFeature" | "manageFeature",
                ]
              >).map(([Icon, key]) => (
                <Card key={key as string} className="bg-background/80">
                  <CardContent className="flex items-start gap-4 p-5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <h2 className="font-semibold">{t(`${key}.title`)}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t(`${key}.description`)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y bg-muted/35">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {t("trendingServicesTitle")}
              </h2>
              <p className="mt-2 text-muted-foreground">
                {t("trendingServicesDescription")}
              </p>
            </div>
            {offerings.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {offerings.slice(0, 6).map((offering) => (
                  <Card key={offering.id} className="bg-background">
                    <CardContent className="p-5">
                      <p className="text-xs font-medium text-primary">
                        {offering.organizationName}
                      </p>
                      <h3 className="mt-2 font-semibold">{offering.serviceName}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {offering.branchName} · {offering.durationMinutes}{" "}
                        {t("minutes")}
                      </p>
                      <div className="mt-5 flex items-center justify-between gap-3">
                        <span className="font-semibold">
                          {t("price", { price: offering.price })}
                        </span>
                        <Button asChild size="sm">
                          <Link href={`/customer/bookings/new?offeringId=${offering.id}`}>
                            {t("bookNow")}
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed bg-background">
                <CardContent className="py-12 text-center text-muted-foreground">
                  {t("servicesEmpty")}
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {t("featuredTitle")}
              </h2>
              <p className="mt-2 text-muted-foreground">
                {t("featuredDescription")}
              </p>
            </div>
            <Button asChild variant="ghost" className="hidden sm:flex">
              <Link href="/marketplace">
                {t("viewAll")}
                <ArrowLeft className="rtl:rotate-0 ltr:rotate-180" />
              </Link>
            </Button>
          </div>
          {businesses.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {businesses.map((business) => (
                <BusinessCard key={business.id} business={business} />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-14 text-center text-muted-foreground">
                {t("featuredEmpty")}
              </CardContent>
            </Card>
          )}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
