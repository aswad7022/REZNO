"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock3, Heart, ImageIcon, MapPin, Sparkles, Star } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FavoriteServiceButton } from "@/features/favorites/components/favorite-service-button";
import type { FavoriteServiceItem } from "@/features/favorites/services/favorites";

export function FavoriteServicesSection({
  initialServices,
}: {
  initialServices: FavoriteServiceItem[];
}) {
  const t = useTranslations("Favorites");
  const format = useFormatter();
  const [services, setServices] = useState(initialServices);

  if (services.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed bg-card/70 p-8 text-center">
        <Heart className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
        <h3 className="mt-3 text-lg font-semibold">{t("noFavoriteServicesYet")}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {t("favoriteServicesDescription")}
        </p>
        <Button asChild className="mt-5">
          <Link href="/marketplace">{t("browseMarketplace")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {services.map((service) => (
        <Card
          key={service.id}
          className="group h-full overflow-hidden border-primary/10 bg-card/95 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/20 hover:shadow-2xl hover:shadow-primary/10"
        >
          <div className="relative flex aspect-[16/8] items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 via-accent/25 to-muted">
            {service.imageUrl ? (
              <Image
                src={service.imageUrl}
                alt={service.serviceName}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
            ) : (
              <ImageIcon className="size-9 text-primary/35" aria-hidden="true" />
            )}
            <div className="absolute end-3 top-3">
              <FavoriteServiceButton
                branchServiceId={service.id}
                canToggle
                compact
                initialFavorited={service.isFavorited}
                onChange={(isFavorited) => {
                  if (!isFavorited) {
                    setServices((current) =>
                      current.filter((item) => item.id !== service.id),
                    );
                  }
                }}
              />
            </div>
          </div>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="line-clamp-2 text-lg font-bold">
                  {service.serviceName}
                </CardTitle>
                <Link
                  href={`/${service.businessSlug}`}
                  className="mt-1 block truncate text-sm font-medium text-primary hover:underline"
                >
                  {service.businessName}
                </Link>
              </div>
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                {service.categoryName}
              </Badge>
            </div>
            {service.description ? (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {service.description}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock3 className="size-4" aria-hidden="true" />
                {t("duration", { count: service.durationMinutes })}
              </span>
              <strong>
                {t("price", {
                  price: format.number(Number(service.price), {
                    maximumFractionDigits: 0,
                  }),
                })}
              </strong>
            </div>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" aria-hidden="true" />
              <span className="truncate">
                {[service.locationLabel, service.city, service.branchName]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </p>
            {service.nearbyLandmark ? (
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {service.nearbyLandmark}
              </p>
            ) : null}
            {service.reviewCount > 0 && service.averageRating !== null ? (
              <p className="flex items-center gap-1 text-xs font-medium text-amber-600">
                <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                {t("ratingSummary", {
                  rating: format.number(service.averageRating, {
                    maximumFractionDigits: 1,
                  }),
                  count: service.reviewCount,
                })}
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild>
                <Link href={`/book/${service.id}`}>
                  <Sparkles />
                  {t("bookService")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/${service.businessSlug}`}>{t("viewBusiness")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
