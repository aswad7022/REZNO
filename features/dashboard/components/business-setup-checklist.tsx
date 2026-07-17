import Link from "next/link";
import {
  AlertCircle,
  Armchair,
  CalendarDays,
  CheckCircle2,
  Circle,
  ExternalLink,
  Menu,
  Plus,
  UserPlus,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyProfileLink } from "@/features/dashboard/components/copy-profile-link";
import {
  type BusinessSetupCheckKey,
  type BusinessSetupStatus,
} from "@/features/dashboard/services/business-setup";

const items = [
  ["organization", "/business/manage/settings"],
  ["businessInfo", "/business/public-profile"],
  ["coverImage", "/business/public-profile"],
  ["logo", "/business/public-profile"],
  ["branch", "/business/manage/locations"],
  ["hours", "/business/manage/locations"],
  ["bookingEnabled", "/business/manage/settings"],
  ["service", "/business/services"],
  ["offering", "/business/services"],
  ["employee", "/business/team"],
  ["table", "/business/tables"],
  ["menuCategory", "/business/menu"],
  ["menuItem", "/business/menu"],
  ["published", "/business/manage/settings"],
] satisfies Array<readonly [BusinessSetupCheckKey, string]>;

const statusStyles = {
  ready: {
    icon: CheckCircle2,
    className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
  },
  almost: {
    icon: AlertCircle,
    className: "border-amber-500/25 bg-amber-500/10 text-amber-700",
  },
  notReady: {
    icon: AlertCircle,
    className: "border-destructive/25 bg-destructive/10 text-destructive",
  },
} as const;

export async function BusinessSetupChecklist({
  setup,
}: {
  setup: BusinessSetupStatus;
}) {
  const t = await getTranslations("BusinessSetup");
  const requiredItems = items.filter(([key]) => setup.requiredChecks.includes(key));
  const missingItems = requiredItems.filter(([key]) => !setup.checks[key]);
  const status = statusStyles[setup.status];
  const StatusIcon = status.icon;

  return (
    <Card className="overflow-hidden border-primary/15 bg-card/95 shadow-xl shadow-primary/5">
      <CardHeader className="relative space-y-5 overflow-hidden bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_22rem),linear-gradient(135deg,color-mix(in_oklch,var(--primary)_10%,white),white_52%,color-mix(in_oklch,var(--accent)_18%,white))] dark:bg-[radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_22rem),linear-gradient(135deg,color-mix(in_oklch,var(--primary)_12%,black),color-mix(in_oklch,var(--card)_92%,black))]">
        <div className="pointer-events-none absolute -top-24 start-10 size-56 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold shadow-sm ${status.className}`}
              role="status"
              aria-live="polite"
            >
              <StatusIcon aria-hidden="true" className="size-4" />
              {t(`states.${setup.status}.label`)}
            </div>
            <div>
              <CardTitle className="text-3xl font-bold tracking-tight">
                {t("title")}
              </CardTitle>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {t(`states.${setup.status}.description`)}
              </p>
            </div>
          </div>
          <div className="relative flex flex-wrap gap-2 lg:justify-end">
            <Button asChild size="sm">
              <Link href="/business/public-profile">{t("manage")}</Link>
            </Button>
            <CopyProfileLink
              slug={setup.slug}
              label={t("copy")}
              copiedLabel={t("copied")}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{t("progressTitle")}</span>
            <span className="text-muted-foreground">
              {t("score", { score: setup.score })}
            </span>
          </div>
          <div
            className="h-3.5 overflow-hidden rounded-full bg-primary/10 ring-1 ring-primary/10"
            role="progressbar"
            aria-label={t("progressTitle")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={setup.score}
          >
          <div
              className="h-full rounded-full bg-gradient-to-l from-primary via-indigo-500 to-violet-500 shadow-[0_0_18px_color-mix(in_oklch,var(--primary)_35%,transparent)] transition-all"
            style={{ width: `${setup.score}%` }}
          />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2 border-b pb-4">
          {setup.restaurant ? (
            <>
              <Button asChild size="sm">
                <Link href="/business/tables">
                  <Armchair />
                  {t("quick.tables")}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/business/menu">
                  <Menu />
                  {t("quick.menu")}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/business/reservations">
                  <CalendarDays />
                  {t("quick.reservations")}
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="sm">
                <Link href="/business/services">
                  <Plus />
                  {t("quick.addService")}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/business/team">
                  <UserPlus />
                  {t("quick.addEmployee")}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/business/bookings">
                  <CalendarDays />
                  {t("quick.bookings")}
                </Link>
              </Button>
            </>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link href={`/${setup.slug}`} target="_blank">
              <ExternalLink />
              {t("quick.openPublic")}
            </Link>
          </Button>
        </div>
        {missingItems.length > 0 ? (
          <div className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-inner sm:p-5">
            <h3 className="font-semibold">{t("missingTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("missingDescription")}
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {missingItems.map(([key, href]) => (
                <div
                  key={key}
                  className="rezno-card-hover flex flex-col gap-3 rounded-2xl border bg-background/85 p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{t(`items.${key}`)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(`explanations.${key}`)}
                    </p>
                  </div>
                  <Button asChild size="sm" className="shrink-0">
                    <Link href={href}>{t("fixNow")}</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <p className="font-medium text-emerald-700">{t("readyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("readyDescription")}
            </p>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {requiredItems.map(([key, href]) => {
            const done = setup.checks[key];
            const Icon = done ? CheckCircle2 : Circle;
            return (
              <Button
                key={key}
                asChild
                variant="ghost"
                className="h-auto justify-start whitespace-normal rounded-2xl py-3.5"
              >
                <Link href={href}>
                  <Icon
                    aria-hidden="true"
                    className={
                      done ? "text-emerald-600" : "text-muted-foreground"
                    }
                  />
                  {t(`items.${key}`)}
                </Link>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
