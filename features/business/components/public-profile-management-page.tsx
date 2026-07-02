import Link from "next/link";
import {
  CalendarDays,
  ExternalLink,
  ImageIcon,
  MapPin,
  Sparkles,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BusinessProfileForm } from "@/features/business/components/business-profile-form";
import { PublicClosureForm } from "@/features/business/components/public-closure-form";
import { deletePublicClosure } from "@/features/business/actions/manage-public-closures";
import { getCurrentBusinessProfile } from "@/features/business/services/business-profile";
import { getPublicProfileManagementData } from "@/features/business/services/public-profile-management";
import { PublicProfileActions } from "@/features/marketplace/components/public-profile-actions";
import { PublicProfileSection } from "@/features/marketplace/components/public-profile-motion";

export async function PublicProfileManagementPage() {
  const [profile, data, t, hoursT, format] = await Promise.all([
    getCurrentBusinessProfile(),
    getPublicProfileManagementData(),
    getTranslations("PublicProfileManagement"),
    getTranslations("WorkingHours"),
    getFormatter(),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/${profile.slug}`} target="_blank">
                <ExternalLink />
                {t("open")}
              </Link>
            </Button>
            <PublicProfileActions
              businessName={profile.name}
              path={`/${profile.slug}`}
              labels={{
                share: t("share"),
                copy: t("copy"),
                copied: t("copied"),
                qr: t("qr"),
                qrDescription: t("qrDescription"),
              }}
            />
          </div>
        }
      />

      <PublicProfileSection>
        <Card className="border-primary/15">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-5" />
              {t("locationTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {data.branches.length ? (
              data.branches.map((branch) => (
                <div key={branch.id} className="rounded-xl border p-4">
                  <p className="font-semibold">{branch.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[branch.address, branch.city].filter(Boolean).join(" · ") ||
                      t("locationMissing")}
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link href="/business/manage/locations">{t("editLocation")}</Link>
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t("noLocations")}</p>
            )}
          </CardContent>
        </Card>
      </PublicProfileSection>

      <PublicProfileSection>
        <Card className="border-primary/15">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-5" />
              {t("hoursTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <PublicClosureForm
              branches={data.branches.map(({ id, name }) => ({ id, name }))}
            />
            {data.branches.map((branch) => (
              <div key={branch.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">{branch.name}</p>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/business/manage/locations/${branch.id}/hours`}>
                      {t("editHours")}
                    </Link>
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {branch.days.filter((day) => day.isOpen).map((day) => (
                    <p key={day.dayOfWeek} className="flex justify-between gap-3">
                      <span>
                        {hoursT(
                          `days.${day.dayOfWeek}` as
                            | "days.0"
                            | "days.1"
                            | "days.2"
                            | "days.3"
                            | "days.4"
                            | "days.5"
                            | "days.6",
                        )}
                      </span>
                      <span dir="ltr" className="text-muted-foreground">
                        {day.openTime} – {day.closeTime}
                      </span>
                    </p>
                  ))}
                </div>
                {branch.specialClosures.length ? (
                  <div className="mt-4 border-t pt-3">
                    <p className="text-sm font-medium">{t("specialClosures")}</p>
                    {branch.specialClosures.map((closure) => (
                      <div key={closure.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {format.dateTimeRange(closure.startsAt, closure.endsAt, {
                            dateStyle: "medium",
                            timeStyle: "short",
                            hour12: true,
                          })}
                          {closure.reason ? ` · ${closure.reason}` : ""}
                        </span>
                        <form action={deletePublicClosure.bind(null, closure.id)}>
                          <Button type="submit" size="sm" variant="ghost">
                            {t("removeClosure")}
                          </Button>
                        </form>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </PublicProfileSection>

      <PublicProfileSection>
        <Card className="border-primary/15">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="size-5" />
              {t("serviceImagesTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.services.length ? (
              data.services.map((service) => (
                <div key={service.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{service.name}</p>
                    <Badge variant={service.imageUrl ? "default" : "secondary"}>
                      {service.imageUrl ? t("imageAdded") : t("imageMissing")}
                    </Badge>
                  </div>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link href={`/business/services?edit=${service.id}#service-edit`}>
                      <Sparkles />
                      {t("editServiceImage")}
                    </Link>
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t("noServices")}</p>
            )}
          </CardContent>
        </Card>
      </PublicProfileSection>

      <PublicProfileSection>
        <BusinessProfileForm profile={profile} />
      </PublicProfileSection>
    </DashboardShell>
  );
}
