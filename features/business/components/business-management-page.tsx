import Link from "next/link";
import {
  Armchair,
  CalendarClock,
  ChartNoAxesCombined,
  MapPin,
  Menu,
  PanelsTopLeft,
  Settings,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { resolveBusinessOperationActor } from "@/features/business-operations/services/context";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { getBusinessReadiness } from "@/features/dashboard/services/business-setup";
import { prisma } from "@/lib/db/prisma";

export async function BusinessManagementPage() {
  const reference = await currentBusinessOperationReference(
    "BUSINESS_MANAGEMENT_HUB_READ",
  );
  const actor = await resolveBusinessOperationActor(
    reference,
    "BUSINESS_MANAGEMENT_HUB_READ",
  );
  const [readiness, t, organization] = await Promise.all([
    getBusinessReadiness(reference),
    getTranslations("BusinessManagementHub"),
    prisma.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { vertical: true },
    }),
  ]);
  const restaurant = isRestaurantVertical(organization.vertical);
  const cards = [
    ["settings", "/business/manage/settings", Settings],
    ["locations", "/business/manage/locations", MapPin],
    ["hours", "/business/manage/locations", CalendarClock],
    ...(restaurant
      ? ([
          ["tables", "/business/tables", Armchair],
          ["menu", "/business/menu", Menu],
          ["workforce", "/business/team", UsersRound],
        ] as const)
      : ([
          ["services", "/business/services", Sparkles],
          ["workforce", "/business/team", UsersRound],
        ] as const)),
    ["publicProfile", "/business/public-profile", PanelsTopLeft],
    ["analytics", "/business/analytics", ChartNoAxesCombined],
    ...(actor.role === "OWNER"
      ? ([["audit", "/business/manage/audit", ShieldCheck]] as const)
      : []),
  ] as const;

  return (
    <DashboardShell>
      <DashboardPageHeader title={t("title")} description={t("description")} />
      <Card className="border-primary/15">
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>{t("readiness.title")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(`readiness.states.${readiness.status}`)}
            </p>
          </div>
          <Badge variant={readiness.status === "ready" ? "default" : "secondary"}>
            {readiness.score}%
          </Badge>
        </CardHeader>
        {readiness.status !== "ready" ? (
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <Link href="/business">{t("readiness.action")}</Link>
            </Button>
          </CardContent>
        ) : null}
      </Card>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([key, href, Icon]) => (
          <Card key={key}>
            <CardHeader>
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <CardTitle className="mt-3">{t(`cards.${key}.title`)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                {t(`cards.${key}.description`)}
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href={href}>{t("open")}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </DashboardShell>
  );
}
