import Link from "next/link";
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  ExternalLink,
  MessageSquareText,
  Plus,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardSummary } from "@/features/dashboard/services/dashboard-summary";

const metricIcons = {
  todayBookings: CalendarDays,
  upcomingBookings: CalendarPlus,
  pendingReviews: MessageSquareText,
  unreadNotifications: Bell,
} as const;

const quickActions = [
  ["addService", "/business/services", Plus],
  ["addEmployee", "/business/team", UserPlus],
  ["publicProfile", "/business/public-profile", Sparkles],
  ["calendar", "/business/calendar", CalendarDays],
  ["bookings", "/business/bookings", CalendarPlus],
] as const;

export async function BusinessCommandCenter({
  summary,
  publicSlug,
}: {
  summary: DashboardSummary;
  publicSlug: string;
}) {
  const t = await getTranslations("DashboardHome.commandCenter");
  const metrics = summary.commandCenter;

  if (!metrics) {
    return null;
  }

  return (
    <section
      aria-labelledby="business-command-center-title"
      className="space-y-4 rounded-[2rem] border border-primary/10 bg-card/55 p-4 shadow-sm backdrop-blur sm:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">{t("eyebrow")}</p>
          <h2
            id="business-command-center-title"
            className="text-2xl font-bold tracking-tight"
          >
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(metrics).map(([key, value]) => {
          const metricKey = key as keyof typeof metricIcons;
          const Icon = metricIcons[metricKey];

          return (
            <Card
              key={key}
              className="rezno-card-hover border-primary/10 bg-card/95"
            >
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t(`metrics.${metricKey}`)}
                </CardTitle>
                <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tracking-tight">{value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-dashed border-primary/15 bg-gradient-to-l from-primary/5 via-background to-violet-500/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <p className="text-sm font-medium text-muted-foreground">
            {t("quickActions")}
          </p>
          <div className="flex flex-1 flex-wrap gap-2">
            {quickActions.map(([key, href, Icon]) => (
              <Button key={key} asChild size="sm" variant="outline">
                <Link href={href}>
                  <Icon aria-hidden="true" />
                  {t(`actions.${key}`)}
                </Link>
              </Button>
            ))}
            <Button asChild size="sm">
              <Link href={`/${publicSlug}`} target="_blank">
                <ExternalLink aria-hidden="true" />
                {t("actions.openPublic")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
