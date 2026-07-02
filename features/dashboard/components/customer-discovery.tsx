import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { BusinessCard } from "@/components/public-site/business-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicOfferings } from "@/features/bookings/services/bookings";
import { MarketplaceCategoryTiles } from "@/features/marketplace/components/marketplace-category-tiles";
import { searchMarketplace } from "@/features/marketplace/services/marketplace";

export async function CustomerDiscovery() {
  const [businesses, services, t] = await Promise.all([
    searchMarketplace({ take: 4 }),
    getPublicOfferings(),
    getTranslations("DashboardHome"),
  ]);

  return (
    <>
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">{t("discovery.categoriesTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("discovery.categoriesDescription")}
          </p>
        </div>
        <MarketplaceCategoryTiles />
      </section>
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">{t("discovery.placesTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("discovery.placesDescription")}
          </p>
        </div>
        {businesses.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {businesses.map((business) => (
              <BusinessCard key={business.id} business={business} />
            ))}
          </div>
        ) : (
          <DashboardEmpty
            icon={Sparkles}
            title={t("discovery.emptyTitle")}
            description={t("discovery.emptyDescription")}
          />
        )}
      </section>
      {services.length > 0 ? (
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              {t("discovery.servicesTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("discovery.servicesDescription")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.slice(0, 6).map((service) => (
              <Card
                key={service.id}
                className="border-primary/10 transition-shadow hover:shadow-md"
              >
                <CardContent className="p-5">
                  <p className="text-xs font-medium text-primary">
                    {service.organizationName}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">
                    {service.serviceName}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {service.branchName}
                  </p>
                  <Button asChild size="sm" className="mt-4 w-full">
                    <Link href={`/customer/bookings/new?offeringId=${service.id}`}>
                      {t("bookAppointment")}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
