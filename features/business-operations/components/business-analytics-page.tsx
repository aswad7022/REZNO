import Link from "next/link";
import { Activity, CalendarRange, ChartNoAxesCombined, UsersRound } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BusinessAnalyticsPeriod } from "@/features/business-operations/domain/closure";
import { getBusinessOperationalAnalytics } from "@/features/business-operations/services/analytics";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";

export async function BusinessAnalyticsPage({
  period,
}: {
  period: BusinessAnalyticsPeriod;
}) {
  const [analytics, t, format] = await Promise.all([
    getBusinessOperationalAnalytics(
      await currentBusinessOperationReference("BUSINESS_ANALYTICS_READ"),
      period,
    ),
    getTranslations("BusinessAnalytics"),
    getFormatter(),
  ]);
  const summary = [
    ["totalBookings", analytics.metrics.totalBookings, CalendarRange],
    ["completionRate", analytics.metrics.completionRate, Activity],
    ["cancellationRate", analytics.metrics.cancellationRate, ChartNoAxesCombined],
    ["noShowRate", analytics.metrics.noShowRate, UsersRound],
  ] as const;

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex gap-2">
            {(["7", "30"] as const).map((value) => (
              <Button
                key={value}
                asChild
                size="sm"
                variant={period === value ? "default" : "outline"}
              >
                <Link href={`/business/analytics?period=${value}`}>
                  {t("period", { days: value })}
                </Link>
              </Button>
            ))}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{t("completedLocalDays")}</Badge>
        <span>{t("snapshot", { value: format.dateTime(new Date(analytics.snapshotAt), { dateStyle: "medium", timeStyle: "short" }) })}</span>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map(([key, value, Icon]) => (
          <Card key={key}>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t(`metrics.${key}`)}
              </CardTitle>
              <Icon className="size-4 text-primary" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {key.endsWith("Rate") ? `${format.number(value)}%` : format.number(value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <DimensionCard
          title={t("topServices")}
          empty={t("empty")}
          rows={analytics.topServices}
        />
        <DimensionCard
          title={t("branches")}
          empty={t("empty")}
          rows={analytics.branches}
        />
        <DimensionCard
          title={t("staffWorkload")}
          empty={t("empty")}
          rows={analytics.staffWorkload}
        />
        <Card>
          <CardHeader>
            <CardTitle>{t("bookingMix")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <MetricRow label={t("metrics.genericBookings")} value={analytics.metrics.genericBookings} />
            <MetricRow label={t("metrics.restaurantReservations")} value={analytics.metrics.restaurantReservations} />
            <MetricRow label={t("metrics.restaurantGuests")} value={analytics.metrics.restaurantGuests} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("statusDistribution")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const).map((status) => (
            <div key={status} className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">{t(`statuses.${status}`)}</p>
              <p className="mt-1 text-2xl font-semibold">{analytics.statusDistribution[status]}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dailySeries")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-7 gap-2 sm:grid-cols-10 lg:grid-cols-[repeat(15,minmax(0,1fr))]">
          {analytics.dailyBookings.map((day) => (
            <div
              key={day.dayOffset}
              className="rounded-lg border px-2 py-3 text-center"
              title={t("daysAgo", { days: day.dayOffset })}
            >
              <p className="text-lg font-semibold">{day.count}</p>
              <p className="text-[0.65rem] text-muted-foreground">-{day.dayOffset}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t("noRevenue")}</p>
    </DashboardShell>
  );
}

function DimensionCard({
  empty,
  rows,
  title,
}: {
  empty: string;
  rows: Array<{ count: number; id: string; name: string }>;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.length ? (
          rows.map((row) => <MetricRow key={row.id} label={row.name} value={row.count} />)
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2">
      <span className="truncate">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
