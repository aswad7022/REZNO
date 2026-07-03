import type { Metadata } from "next";
import type { BusinessVertical } from "@prisma/client";
import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { BusinessCard } from "@/components/public-site/business-card";
import { PublicFooter } from "@/components/public-site/public-footer";
import { PublicHeader } from "@/components/public-site/public-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getMarketplaceFilters,
  searchMarketplace,
} from "@/features/marketplace/services/marketplace";
import { getCurrentCustomerFavoriteBusinessIds } from "@/features/favorites/services/favorites";
import { MAX_SEARCH_QUERY_LENGTH } from "@/features/search/services/search-normalization";
import { businessVerticals } from "@/features/businesses/config/verticals";
import { MarketplaceCategoryTiles } from "@/features/marketplace/components/marketplace-category-tiles";
import { NearbyBusinessMap } from "@/features/location/components/nearby-business-map";
import { LocationPermissionButton } from "@/features/location/components/location-permission-button";
import {
  DEFAULT_NEARBY_RADIUS_KM,
  NEARBY_RADIUS_OPTIONS_KM,
} from "@/features/location/services/nearby-businesses";
import { buildWazeNavigationUrl } from "@/features/location/services/waze";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketplace");
  return { title: t("title"), description: t("description") };
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    city?: string;
    vertical?: string;
    lat?: string;
    lng?: string;
    radius?: string;
    view?: string;
  }>;
}) {
  const query = await searchParams;
  const searchQuery = query.q?.trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
  const vertical = businessVerticals.includes(query.vertical as BusinessVertical)
    ? (query.vertical as BusinessVertical)
    : undefined;
  const latitude = query.lat ? Number(query.lat) : undefined;
  const longitude = query.lng ? Number(query.lng) : undefined;
  const radiusKm = query.radius ? Number(query.radius) : DEFAULT_NEARBY_RADIUS_KM;
  const view = query.view === "map" ? "map" : "list";
  const hasCustomerLocation =
    Number.isFinite(latitude) && Number.isFinite(longitude);
  const [marketplaceBusinesses, filters, t] = await Promise.all([
    searchMarketplace({
      query: searchQuery,
      category: query.category,
      city: query.city,
      vertical,
      latitude: Number.isFinite(latitude) ? latitude : undefined,
      longitude: Number.isFinite(longitude) ? longitude : undefined,
      radiusKm,
    }),
    getMarketplaceFilters(),
    getTranslations("Marketplace"),
  ]);
  const favoriteState = await getCurrentCustomerFavoriteBusinessIds(
    marketplaceBusinesses.map((business) => business.id),
  );
  const businesses = marketplaceBusinesses.map((business) => ({
    ...business,
    isFavorited: favoriteState.favoriteOrganizationIds.has(business.id),
  }));
  const mapMarkers = businesses.flatMap((business) => {
    if (business.branchLatitude === null || business.branchLongitude === null) {
      return [];
    }
    const restaurant =
      business.vertical === "RESTAURANT" || business.vertical === "CAFE";

    return [
      {
        id: business.id,
        title: business.name,
        description: business.branchLocationLabel ?? business.city,
        latitude: business.branchLatitude,
        longitude: business.branchLongitude,
        distanceKm: business.distanceKm,
        landmark: business.branchNearbyLandmark,
        href: `/${business.slug}`,
        ctaLabel: restaurant ? t("reserveTable") : t("viewBusiness"),
        wazeUrl: buildWazeNavigationUrl({
          latitude: business.branchLatitude,
          longitude: business.branchLongitude,
        }),
      },
    ];
  });
  const mapHref = marketplaceHref(query, { view: "map" });
  const listHref = marketplaceHref(query, { view: "list" });

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="relative mx-auto max-w-7xl overflow-hidden px-4 py-10 sm:px-6 sm:py-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_32rem),radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--accent)_16%,transparent),transparent_28rem)]" />
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-sm font-semibold text-primary">
            {t("searchDiscovery")}
          </span>
          <h1 className="mt-5 bg-gradient-to-l from-slate-950 via-primary to-violet-700 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl dark:from-white dark:via-violet-200 dark:to-indigo-200">
            {t("title")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            {t("description")}
          </p>
        </div>
        <Card className="mx-auto mt-8 max-w-5xl border-primary/10 bg-background/88 shadow-xl shadow-primary/5 backdrop-blur">
          <CardContent className="p-4 sm:p-5">
            <form
              action="/marketplace"
              className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_10rem_9rem_auto]"
            >
              <Input
                name="q"
                type="search"
                defaultValue={searchQuery}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchLabel")}
                className="h-11"
              />
              {query.lat ? <input type="hidden" name="lat" value={query.lat} /> : null}
              {query.lng ? <input type="hidden" name="lng" value={query.lng} /> : null}
              <input type="hidden" name="view" value={view} />
              <select
                name="category"
                defaultValue={query.category ?? ""}
                aria-label={t("category")}
                className="h-11 rounded-xl border bg-background/80 px-3 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <option value="">{t("allCategories")}</option>
                {filters.categories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                name="city"
                defaultValue={query.city ?? ""}
                aria-label={t("city")}
                className="h-11 rounded-xl border bg-background/80 px-3 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <option value="">{t("allCities")}</option>
                {filters.cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
              <select
                name="radius"
                defaultValue={String(radiusKm)}
                aria-label={t("radius")}
                className="h-11 rounded-xl border bg-background/80 px-3 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                {NEARBY_RADIUS_OPTIONS_KM.map((radius) => (
                  <option key={radius} value={radius}>
                    {t("radiusKm", { count: radius })}
                  </option>
                ))}
              </select>
              <select
                name="vertical"
                defaultValue={vertical ?? ""}
                aria-label={t("businessType")}
                className="h-11 rounded-xl border bg-background/80 px-3 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <option value="">{t("allBusinessTypes")}</option>
                <option value="RESTAURANT">{t("restaurant")}</option>
                <option value="CAFE">{t("cafe")}</option>
              </select>
              <Button type="submit" size="lg" className="min-h-11">
                <Search />
                {t("search")}
              </Button>
            </form>
            {searchQuery ? (
              <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center">
                <span>{t("showingResultsFor", { query: searchQuery })}</span>
                <Button asChild variant="ghost" size="sm">
                  <a href={marketplaceHref(query, { q: undefined })}>
                    {t("clearSearch")}
                  </a>
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                {t("searchHint")}
              </p>
            )}
          </CardContent>
        </Card>
        <MarketplaceCategoryTiles currentParams={{ ...query, q: searchQuery }} />
        <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LocationPermissionButton
            labels={{
              idle: t("useMyLocation"),
              loading: t("locationLoading"),
              denied: t("locationPermissionDenied"),
              unavailable: t("locationUnavailable"),
              active: t("usingCurrentLocation"),
            }}
          />
          <div className="flex rounded-2xl border bg-card p-1">
            <Button
              asChild
              variant={view === "list" ? "default" : "ghost"}
              size="sm"
            >
              <a href={listHref}>{t("listView")}</a>
            </Button>
            <Button
              asChild
              variant={view === "map" ? "default" : "ghost"}
              size="sm"
            >
              <a href={mapHref}>{t("mapView")}</a>
            </Button>
          </div>
        </div>
        {hasCustomerLocation ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {businesses.length > 0
              ? t("showingNearYou")
              : t("noNearbyBusinesses")}
          </p>
        ) : null}
        <p className="mt-10 text-sm font-medium text-muted-foreground">
          {t("results", { count: businesses.length })}
        </p>
        {view === "map" && mapMarkers.length > 0 ? (
          <div className="mt-4">
            <NearbyBusinessMap markers={mapMarkers} />
          </div>
        ) : businesses.length > 0 ? (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((business) => (
              <BusinessCard
                key={business.id}
                business={business}
                canToggleFavorite={favoriteState.isAuthenticated}
              />
            ))}
          </div>
        ) : (
          <Card className="mt-4 border-dashed border-primary/20 bg-card/70">
            <CardContent className="py-16 text-center">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Search className="size-5" aria-hidden="true" />
              </div>
              <h2 className="font-semibold">{t("emptyTitle")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {hasCustomerLocation
                  ? t("emptyNearbyDescription")
                  : t("emptyDescription")}
              </p>
              <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                {searchQuery ? (
                  <Button asChild variant="secondary">
                    <a href={marketplaceHref(query, { q: undefined })}>
                      {t("tryAnotherSearch")}
                    </a>
                  </Button>
                ) : null}
                {hasCustomerLocation ? (
                  <Button asChild variant="outline">
                    <a href={marketplaceHref(query, { radius: "25" })}>
                      {t("expandRadius")}
                    </a>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

function marketplaceHref(
  current: Record<string, string | undefined>,
  updates: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...updates })) {
    if (value) params.set(key, value);
  }
  return `/marketplace?${params.toString()}`;
}
