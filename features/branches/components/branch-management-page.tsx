import Link from "next/link";
import { CalendarOff, Clock3, MapPin, Navigation, Plus, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BranchForm } from "@/features/branches/components/branch-form";
import { BranchLifecycleControls } from "@/features/branches/components/branch-lifecycle-controls";
import { getCurrentOrganizationBranches } from "@/features/branches/services/branches";
import { buildWazeNavigationUrl } from "@/features/location/services/waze";

export async function BranchManagementPage() {
  const [{ branches, canArchive, canEdit, createIdempotencyKey, organizationId, organizationName }, t] = await Promise.all([
    getCurrentOrganizationBranches(),
    getTranslations("Branches"),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description")}
        actions={canArchive ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/business/manage/audit"><ShieldCheck />{t("viewAudit")}</Link>
          </Button>
        ) : undefined}
      />

      <Card className="shadow-none"><CardContent className="pt-6"><span className="text-sm text-muted-foreground">{t("activeBusiness")}:</span> <strong>{organizationName}</strong></CardContent></Card>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-4" aria-hidden="true" />
              {t("add")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BranchForm contextOrganizationId={organizationId} idempotencyKey={createIdempotencyKey} />
          </CardContent>
        </Card>
      ) : null}

      {branches.length === 0 ? (
        <DashboardEmpty
          icon={MapPin}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <div className="grid gap-4">
          {branches.map((branch) => (
            <Card key={branch.id}>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>{branch.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {[
                      branch.locationLabel,
                      branch.addressLine1,
                      branch.city,
                      branch.country,
                    ]
                      .filter(Boolean)
                      .join(" · ") || branch.slug}
                  </CardDescription>
                  {branch.nearbyLandmark ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {branch.nearbyLandmark}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge
                    variant={
                      branch.status === "ACTIVE" ? "default" : "secondary"
                    }
                  >
                    {t(`statuses.${branch.status}`)}
                  </Badge>
                  <Badge
                    variant={branch.openDays.length ? "outline" : "destructive"}
                  >
                    {t(
                      branch.openDays.length
                        ? "hoursConfigured"
                        : "hoursMissing",
                      )}
                  </Badge>
                  <Badge
                    variant={
                      branch.latitude && branch.longitude
                        ? "outline"
                        : "secondary"
                    }
                  >
                    {branch.latitude && branch.longitude
                      ? t("locationSet")
                      : t("locationNotSet")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="mb-4 flex flex-wrap gap-2">
                    {branch.status !== "ARCHIVED" ? <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/business/manage/locations/${branch.id}/hours`}
                      >
                        <Clock3 aria-hidden="true" />
                        {t("editHours")}
                      </Link>
                    </Button> : null}
                    {branch.status !== "ARCHIVED" ? <Button asChild variant="outline" size="sm">
                      <Link href={`/business/manage/locations/${branch.id}/blocks`}>
                        <CalendarOff aria-hidden="true" />
                        {t("manageBlocks", { count: branch.upcomingBlockCount })}
                      </Link>
                    </Button> : null}
                    {branch.latitude && branch.longitude ? (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={
                            buildWazeNavigationUrl({
                              latitude: Number(branch.latitude),
                              longitude: Number(branch.longitude),
                            }) ?? "#"
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Navigation aria-hidden="true" />
                          {t("openInWaze")}
                        </a>
                      </Button>
                    ) : null}
                  </div>
                  {canEdit && branch.status !== "ARCHIVED" ? <details>
                    <summary className="cursor-pointer text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {t("edit")}
                    </summary>
                    <div className="mt-5 border-t pt-5">
                      <BranchForm branch={branch} contextOrganizationId={organizationId} idempotencyKey={branch.idempotencyKey} />
                    </div>
                  </details> : null}
                  {canEdit ? <BranchLifecycleControls branch={branch} canArchive={canArchive} contextOrganizationId={organizationId} /> : null}
                </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
