import Link from "next/link";
import Image from "next/image";
import { ArrowUpLeft, ImageIcon, MapPin, Sparkles } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import type { MarketplaceBusiness } from "@/features/marketplace/types";

export async function BusinessCard({
  business,
}: {
  business: MarketplaceBusiness;
}) {
  const [t, format] = await Promise.all([
    getTranslations("Marketplace"),
    getFormatter(),
  ]);
  const restaurantExperience = isRestaurantVertical(business.vertical);

  return (
    <Link
      href={`/${business.slug}`}
      className="group rounded-3xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full overflow-hidden border-primary/10 bg-card/95 shadow-sm transition-all group-hover:-translate-y-1 group-hover:border-primary/20 group-hover:shadow-2xl group-hover:shadow-primary/10">
        <div className="relative flex aspect-[16/7] items-center justify-center overflow-hidden bg-gradient-to-br from-blue-100 via-indigo-100 to-violet-100 dark:from-blue-950 dark:via-indigo-950 dark:to-violet-950">
          {business.coverImageUrl ? (
            <Image
              src={business.coverImageUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/28 via-transparent to-transparent" />
          {!business.coverImageUrl ? (
            <ImageIcon className="size-7 text-primary/35" />
          ) : null}
        </div>
        <CardHeader className="flex-row items-center gap-3">
          <Avatar className="relative size-14 overflow-hidden rounded-2xl border-2 border-background shadow-md">
            {business.logoUrl ? (
              <Image
                src={business.logoUrl}
                alt={business.name}
                fill
                sizes="48px"
                className="object-cover"
              />
            ) : null}
            {!business.logoUrl ? (
              <AvatarFallback className="rounded-2xl bg-primary/10 font-semibold text-primary">
                {business.name.slice(0, 2)}
              </AvatarFallback>
            ) : null}
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg font-bold text-foreground transition-colors group-hover:text-primary">
              {business.name}
            </CardTitle>
            {business.categoryName ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {business.categoryName}
              </p>
            ) : null}
            {business.city ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" aria-hidden="true" />
                {business.city}
              </p>
            ) : null}
            {business.distanceKm !== null ? (
              <p className="mt-1 text-xs text-primary">
                {t("distanceKm", {
                  distance: format.number(business.distanceKm, {
                    maximumFractionDigits: 1,
                  }),
                })}
              </p>
            ) : null}
          </div>
          <span className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground transition-all group-hover:bg-primary group-hover:text-primary-foreground">
            <ArrowUpLeft className="size-4 transition-transform group-hover:-translate-x-1 group-hover:-translate-y-1 rtl:rotate-90" />
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
            {business.description ?? t("defaultDescription")}
          </p>
          {business.matchingServiceName ? (
            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-3 text-sm">
              <p className="font-medium">{business.matchingServiceName}</p>
              {business.matchingServicePrice ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("matchingPrice", { price: business.matchingServicePrice })}
                </p>
              ) : null}
            </div>
          ) : null}
          {restaurantExperience ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {business.vertical === "CAFE" ? t("cafe") : t("restaurant")}
              </Badge>
              {business.hasMenu ? (
                <Badge variant="outline">{t("menuAvailable")}</Badge>
              ) : null}
              {business.hasTables ? (
                <Badge variant="outline">{t("tablesAvailable")}</Badge>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Sparkles className="size-4" />
              {restaurantExperience
                ? t("reserveTable")
                : t("serviceCount", { count: business.serviceCount })}
            </span>
            {business.startingPrice ? (
              <span className="font-medium">
                {t("startingPrice", {
                  price: format.number(Number(business.startingPrice), {
                    maximumFractionDigits: 0,
                  }),
                })}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
