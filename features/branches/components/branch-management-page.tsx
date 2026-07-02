import Link from "next/link";
import { Clock3, MapPin, Navigation, Plus } from "lucide-react";
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
import { getCurrentOrganizationBranches } from "@/features/branches/services/branches";
import { buildWazeNavigationUrl } from "@/features/location/services/waze";

export async function BranchManagementPage() {
  const [{ branches, canEdit }, t, hoursT] = await Promise.all([
    getCurrentOrganizationBranches(),
    getTranslations("Branches"),
    getTranslations("WorkingHours"),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader title={t("title")} description={t("description")} />

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-4" aria-hidden="true" />
              {t("add")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BranchForm />
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
                  {branch.nextWorkingDay !== null ? (
                    <span className="text-xs text-muted-foreground">
                      {t("nextWorkingDay", {
                        day: hoursT(
                          `days.${branch.nextWorkingDay}` as
                            | "days.0"
                            | "days.1"
                            | "days.2"
                            | "days.3"
                            | "days.4"
                            | "days.5"
                            | "days.6",
                        ),
                      })}
                    </span>
                  ) : null}
                  <Badge
                    variant={branch.hasWorkingHours ? "outline" : "destructive"}
                  >
                    {t(
                      branch.hasWorkingHours
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
              {canEdit ? (
                <CardContent>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/business/manage/locations/${branch.id}/hours`}
                      >
                        <Clock3 aria-hidden="true" />
                        {t("editHours")}
                      </Link>
                    </Button>
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
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {t("edit")}
                    </summary>
                    <div className="mt-5 border-t pt-5">
                      <BranchForm branch={branch} />
                    </div>
                  </details>
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
