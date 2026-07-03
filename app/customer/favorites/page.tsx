import Link from "next/link";
import { Heart } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { BusinessCard } from "@/components/public-site/business-card";
import { Button } from "@/components/ui/button";
import { FavoriteServicesSection } from "@/features/favorites/components/favorite-services-section";
import {
  getCustomerFavoriteBusinesses,
  getCustomerFavoriteServices,
} from "@/features/favorites/services/favorites";

export default async function CustomerFavoritesPage() {
  const [favoriteBusinesses, favoriteServices, t] = await Promise.all([
    getCustomerFavoriteBusinesses(),
    getCustomerFavoriteServices(),
    getTranslations("Favorites"),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("yourFavorites")}
        description={t("favoriteBusinessesDescription")}
        actions={
          <Button asChild variant="outline">
            <Link href="/marketplace">{t("browseMarketplace")}</Link>
          </Button>
        }
      />
      <div className="space-y-10">
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">{t("favoritePlaces")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("favoritePlacesDescription")}
            </p>
          </div>
          {favoriteBusinesses.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {favoriteBusinesses.map((business) => (
                <BusinessCard
                  key={business.id}
                  business={business}
                  canToggleFavorite
                />
              ))}
            </div>
          ) : (
            <DashboardEmpty
              action={
                <Button asChild>
                  <Link href="/marketplace">{t("browseMarketplace")}</Link>
                </Button>
              }
              description={t("emptyDescription")}
              icon={Heart}
              title={t("noFavoriteBusinessesYet")}
            />
          )}
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">{t("favoriteServices")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("favoriteServicesDescription")}
            </p>
          </div>
          <FavoriteServicesSection initialServices={favoriteServices} />
        </section>
      </div>
    </DashboardShell>
  );
}
