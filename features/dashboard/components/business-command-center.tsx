import Link from "next/link";
import {
  Activity,
  Armchair,
  Bell,
  Building2,
  CalendarDays,
  CalendarPlus,
  ChartNoAxesCombined,
  Clock3,
  MapPin,
  Menu,
  MessageSquareText,
  PanelsTopLeft,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BusinessQuickActionKey } from "@/features/business-operations/domain/closure";
import type { BusinessOverview } from "@/features/dashboard/services/business-overview";

const metricIcons = {
  activeBranches: Building2,
  activeMenuItems: Menu,
  activeRestaurantTables: Armchair,
  activeServices: Sparkles,
  activeWorkforce: UsersRound,
  cancellationsToday: CalendarPlus,
  completedToday: UserRoundCheck,
  noShowsToday: Clock3,
  operationalUpdatesLast24Hours: Bell,
  ownCompletedLast7Days: UserRoundCheck,
  ownNoShowsLast7Days: Clock3,
  ownToday: CalendarDays,
  ownUpcoming: CalendarPlus,
  pendingChangeRequests: Activity,
  pendingConfirmations: Clock3,
  restaurantReservationsToday: Armchair,
  reviewsAwaitingReply: MessageSquareText,
  todayActive: CalendarDays,
  upcomingActive: CalendarPlus,
} as const;

const actionIcons = {
  analytics: ChartNoAxesCombined,
  audit: ShieldCheck,
  availability: Clock3,
  bookings: CalendarPlus,
  calendar: CalendarDays,
  locations: MapPin,
  menu: Menu,
  publicProfile: PanelsTopLeft,
  reservations: Armchair,
  services: Sparkles,
  settings: Settings,
  tables: Armchair,
  team: UsersRound,
} as const satisfies Record<BusinessQuickActionKey, typeof CalendarDays>;

function overviewMetrics(overview: BusinessOverview) {
  return Object.entries(overview.metrics).filter(
    (entry): entry is [keyof typeof metricIcons, number] =>
      entry[1] !== null && entry[0] in metricIcons,
  );
}

export async function BusinessCommandCenter({
  overview,
}: {
  overview: BusinessOverview;
}) {
  const t = await getTranslations("DashboardHome.commandCenter");
  const metrics = overviewMetrics(overview);

  return (
    <section
      aria-labelledby="business-command-center-title"
      className="space-y-4 rounded-[2rem] border border-primary/10 bg-card/55 p-4 shadow-sm backdrop-blur sm:p-5"
    >
      <div>
        <p className="text-sm font-medium text-primary">
          {t(`scopes.${overview.scope}.eyebrow`)}
        </p>
        <h2
          id="business-command-center-title"
          className="text-2xl font-bold tracking-tight"
        >
          {t(`scopes.${overview.scope}.title`)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(`scopes.${overview.scope}.description`)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([key, value]) => {
          const Icon = metricIcons[key];
          return (
            <Card key={key} className="border-primary/10 bg-card/95">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t(`metrics.${key}`)}
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

      <Card className="border-dashed border-primary/15">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <p className="text-sm font-medium text-muted-foreground">
            {t("quickActions")}
          </p>
          <div className="flex flex-1 flex-wrap gap-2">
            {overview.quickActions.map((action) => {
              const Icon = actionIcons[action.key];
              return (
                <Button key={action.key} asChild size="sm" variant="outline">
                  <Link href={action.href}>
                    <Icon aria-hidden="true" />
                    {t(`actions.${action.key}`)}
                  </Link>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
