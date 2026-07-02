import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowLeft,
  CalendarCheck2,
  CalendarPlus,
  History,
  Sparkles,
  Utensils,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardSummary } from "@/features/dashboard/services/dashboard-summary";
import { BusinessCommandCenter } from "@/features/dashboard/components/business-command-center";
import { BusinessHeroSlider } from "@/features/dashboard/components/business-hero-slider";
import { BusinessSetupChecklist } from "@/features/dashboard/components/business-setup-checklist";
import { CustomerDiscovery } from "@/features/dashboard/components/customer-discovery";
import { CustomerDiscoverySkeleton } from "@/features/dashboard/components/customer-discovery-skeleton";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { RestaurantOverviewPanel } from "@/features/restaurants/components/restaurant-overview-panel";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardRole, DashboardUser } from "@/types/dashboard";

function firstName(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] ?? name;
}

export async function DashboardHome({
  role,
  user,
}: {
  role: DashboardRole;
  user: DashboardUser;
}) {
  const isBusiness = role === "business";
  const [summary, t, bookingT, format] = await Promise.all([
    getDashboardSummary(role),
    getTranslations("DashboardHome"),
    getTranslations("Bookings"),
    getFormatter(),
  ]);
  const isRestaurant = Boolean(
    summary.vertical && isRestaurantVertical(summary.vertical),
  );
  const metrics = [
    {
      key: "upcoming",
      value: summary.primaryCount,
      icon: CalendarCheck2,
    },
    {
      key: isBusiness ? (isRestaurant ? "menuItems" : "services") : "history",
      value: summary.secondaryCount,
      icon: isBusiness ? (isRestaurant ? Utensils : Sparkles) : History,
    },
  ] as const;

  return (
    <DashboardShell>
      {isBusiness ? (
        <BusinessHeroSlider
          navigationLabel={t("hero.navigationLabel")}
          slides={[
            {
              title: t("hero.hours.title"),
              description: t("hero.hours.description"),
            },
            {
              title: t("hero.images.title"),
              description: t("hero.images.description"),
            },
            {
              title: t("hero.calendar.title"),
              description: t("hero.calendar.description"),
            },
          ]}
        />
      ) : null}
      {isBusiness ? (
        <Suspense fallback={<Skeleton className="h-56 rounded-2xl" />}>
          <BusinessSetupChecklist />
        </Suspense>
      ) : null}
      {isBusiness && summary.publicSlug ? (
        <BusinessCommandCenter summary={summary} publicSlug={summary.publicSlug} />
      ) : null}
      {isRestaurant ? (
        <Suspense fallback={<Skeleton className="h-36 rounded-2xl" />}>
          <RestaurantOverviewPanel />
        </Suspense>
      ) : null}
      <DashboardPageHeader
        title={t("welcome", { name: firstName(user.name) })}
        description={t(isBusiness ? "businessDescription" : "customerDescription")}
        actions={
          <Button asChild>
            <Link
              href={
                isBusiness ? "/business/calendar" : "/customer/bookings/new"
              }
            >
              <CalendarPlus />
              {t(isBusiness ? "openCalendar" : "bookAppointment")}
            </Link>
          </Button>
        }
      />
      {!isBusiness ? (
        <Suspense fallback={<CustomerDiscoverySkeleton />}>
          <CustomerDiscovery />
        </Suspense>
      ) : null}
      <section className="grid gap-4 sm:grid-cols-2">
        {metrics.map((metric) => (
          <Card key={metric.key} className="rezno-card-hover border-primary/10">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">
                {t(`metrics.${metric.key}`)}
              </CardTitle>
              <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <metric.icon className="size-4" aria-hidden="true" />
              </span>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tracking-tight">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("nearestTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("nearestDescription")}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/${role}/bookings`}>
              {t("viewAll")}
              <ArrowLeft className="rtl:rotate-0 ltr:rotate-180" />
            </Link>
          </Button>
        </div>
        {summary.recentBookings.length === 0 ? (
          <DashboardEmpty
            icon={CalendarCheck2}
            title={t("emptyTitle")}
            description={t(
              isBusiness ? "businessEmptyDescription" : "customerEmptyDescription",
            )}
            action={
              <Button asChild variant="outline">
                <Link
                  href={
                    isBusiness ? "/business/services" : "/customer/bookings/new"
                  }
                >
                  {t(isBusiness ? "manageServices" : "findService")}
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {summary.recentBookings.map((booking) => (
              <Card key={booking.id} className="rezno-card-hover border-primary/10">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{booking.serviceName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {booking.branchName}
                      </p>
                    </div>
                    <Badge>{bookingT(`statuses.${booking.status}`)}</Badge>
                  </div>
                  <p className="mt-4 text-sm">
                    {format.dateTime(booking.startsAt, {
                      timeZone: booking.timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                      hour12: true,
                    })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
