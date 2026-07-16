import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, CalendarCheck2, CalendarPlus, History } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { BusinessCommandCenter } from "@/features/dashboard/components/business-command-center";
import { BusinessHeroSlider } from "@/features/dashboard/components/business-hero-slider";
import { BusinessSetupChecklist } from "@/features/dashboard/components/business-setup-checklist";
import { CustomerDiscovery } from "@/features/dashboard/components/customer-discovery";
import { CustomerDiscoverySkeleton } from "@/features/dashboard/components/customer-discovery-skeleton";
import { getCurrentBusinessOverview } from "@/features/dashboard/services/current-business-overview";
import { getCustomerDashboardSummary } from "@/features/dashboard/services/dashboard-summary";
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
  return role === "business" ? (
    <BusinessDashboardHome user={user} />
  ) : (
    <CustomerDashboardHome user={user} />
  );
}

async function BusinessDashboardHome({ user }: { user: DashboardUser }) {
  const [overview, t, bookingT, format] = await Promise.all([
    getCurrentBusinessOverview(),
    getTranslations("DashboardHome"),
    getTranslations("Bookings"),
    getFormatter(),
  ]);
  const restaurant =
    "vertical" in overview && isRestaurantVertical(overview.vertical);
  const viewAllHref =
    overview.scope === "STAFF_SELF"
      ? overview.selfCalendarHref
      : restaurant
        ? "/business/reservations"
        : "/business/bookings";
  const emptyAction = overview.quickActions[0];

  return (
    <DashboardShell>
      <BusinessHeroSlider
        navigationLabel={t("hero.navigationLabel")}
        slides={[
          { title: t("hero.hours.title"), description: t("hero.hours.description") },
          { title: t("hero.images.title"), description: t("hero.images.description") },
          { title: t("hero.calendar.title"), description: t("hero.calendar.description") },
        ]}
      />
      {overview.scope === "MANAGEMENT" ? (
        <Suspense fallback={<Skeleton className="h-56 rounded-2xl" />}>
          <BusinessSetupChecklist setup={overview.readiness} />
        </Suspense>
      ) : null}
      <BusinessCommandCenter overview={overview} />
      <DashboardPageHeader
        title={t("welcome", { name: firstName(user.name) })}
        description={t(`businessScopeDescriptions.${overview.scope}`)}
        actions={
          <Button asChild>
            <Link href="/business/calendar">
              <CalendarPlus />
              {t("openCalendar")}
            </Link>
          </Button>
        }
      />
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("nearestTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("nearestDescription")}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href={viewAllHref}>
              {t("viewAll")}
              <ArrowLeft className="rtl:rotate-0 ltr:rotate-180" />
            </Link>
          </Button>
        </div>
        {overview.recentBookings.length === 0 ? (
          <DashboardEmpty
            icon={CalendarCheck2}
            title={t("emptyTitle")}
            description={t("businessEmptyDescription")}
            action={
              emptyAction ? (
                <Button asChild variant="outline">
                  <Link href={emptyAction.href}>
                    {t(`commandCenter.actions.${emptyAction.key}`)}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {overview.recentBookings.map((booking) => (
              <Card key={booking.id} className="border-primary/10">
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

async function CustomerDashboardHome({ user }: { user: DashboardUser }) {
  const [summary, t, bookingT, format] = await Promise.all([
    getCustomerDashboardSummary(),
    getTranslations("DashboardHome"),
    getTranslations("Bookings"),
    getFormatter(),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("welcome", { name: firstName(user.name) })}
        description={t("customerDescription")}
        actions={
          <Button asChild>
            <Link href="/customer/bookings/new">
              <CalendarPlus />
              {t("bookAppointment")}
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<CustomerDiscoverySkeleton />}>
        <CustomerDiscovery />
      </Suspense>
      <section className="grid gap-4 sm:grid-cols-2">
        {([
          ["upcoming", summary.upcomingCount, CalendarCheck2],
          ["history", summary.historyCount, History],
        ] as const).map(([key, value, Icon]) => (
          <Card key={String(key)} className="border-primary/10">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">
                {t(`metrics.${key}`)}
              </CardTitle>
              <Icon className="size-4 text-primary" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tracking-tight">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("nearestTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("nearestDescription")}</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/customer/bookings">
              {t("viewAll")}
              <ArrowLeft className="rtl:rotate-0 ltr:rotate-180" />
            </Link>
          </Button>
        </div>
        {summary.recentBookings.length === 0 ? (
          <DashboardEmpty
            icon={CalendarCheck2}
            title={t("emptyTitle")}
            description={t("customerEmptyDescription")}
            action={
              <Button asChild variant="outline">
                <Link href="/customer/bookings/new">{t("findService")}</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {summary.recentBookings.map((booking) => (
              <Card key={booking.id} className="border-primary/10">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{booking.serviceName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{booking.branchName}</p>
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
