import Link from "next/link";
import type { Metadata } from "next";
import { Activity, Building2, CalendarDays, Database, ShieldCheck, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { getAdminOverview } from "@/features/admin/services/admin-dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Super Admin | REZNO" };

export default async function AdminOverviewPage() {
  const [overview, t] = await Promise.all([
    getAdminOverview(),
    getTranslations("Admin.overview"),
  ]);
  const stats = [
    [t("totalBusinesses"), overview.businesses, Building2],
    [t("activeBusinesses"), overview.activeBusinesses, Activity],
    [t("users"), overview.users, Users],
    [t("bookings"), overview.bookings, CalendarDays],
    [t("restaurants"), overview.restaurants, Building2],
  ] as const;

  return (
    <>
      <AdminPageHeader
        title={t("title")}
        description={t("description")}
      />
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map(([label, value, Icon]) => (
          <Card key={label} className="border-primary/10">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="size-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="border-primary/10 lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("recentBusinesses")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.recentBusinesses.map((business) => (
              <Link
                key={business.id}
                href={`/admin/businesses/${business.id}`}
                className="flex items-center justify-between rounded-2xl border p-3 hover:bg-muted/60"
              >
                <span>
                  <span className="font-medium">{business.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {business.vertical}
                  </span>
                </span>
                <Badge variant={business.isActive ? "default" : "secondary"}>
                  {business.status}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4" />
              {t("systemStatus")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Status
              connected={t("connected")}
              incomplete={t("incomplete")}
              label={t("database")}
              ok={overview.databaseConnected}
            />
            <Status
              connected={t("connected")}
              incomplete={t("incomplete")}
              label={t("authSecret")}
              ok={overview.authConfigured}
            />
            <div className="flex justify-between">
              <span>{t("environment")}</span>
              <Badge variant="secondary">{overview.environment}</Badge>
            </div>
            <div className="flex justify-between">
              <span>{t("adminGuard")}</span>
              <Badge variant="secondary">
                <ShieldCheck className="me-1 size-3" />
                REZNO_ADMIN_EMAILS
              </Badge>
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function Status({
  connected,
  incomplete,
  label,
  ok,
}: {
  connected: string;
  incomplete: string;
  label: string;
  ok: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <Badge variant={ok ? "default" : "destructive"}>
        {ok ? connected : incomplete}
      </Badge>
    </div>
  );
}
