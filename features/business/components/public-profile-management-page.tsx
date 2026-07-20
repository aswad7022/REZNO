import Link from "next/link";
import { headers } from "next/headers";
import {
  CalendarOff,
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
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { getCurrentBusinessProfile } from "@/features/business/services/business-profile";
import { getPublicProfileManagementData } from "@/features/business/services/public-profile-management";
import { PublicProfileActions } from "@/features/marketplace/components/public-profile-actions";
import { PublicProfileSection } from "@/features/marketplace/components/public-profile-motion";
import { MediaManager } from "@/features/media/components/media-manager";

export async function PublicProfileManagementPage() {
  await currentBusinessOperationReference("SETTINGS_READ");
  const [profile, data, t, hoursT, mediaT, format, headerList] = await Promise.all([
    getCurrentBusinessProfile(),
    getPublicProfileManagementData(),
    getTranslations("PublicProfileManagement"),
    getTranslations("WorkingHours"),
    getTranslations("Media"),
    getFormatter(),
    headers(),
  ]);
  const publicPath = `/${profile.slug}`;
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const publicUrl = host ? `${protocol}://${host}${publicPath}` : publicPath;

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={publicPath} target="_blank">
                <ExternalLink />
                {t("open")}
              </Link>
            </Button>
            <PublicProfileActions
              businessName={profile.name}
              path={publicPath}
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
        <Card className="border-primary/15 bg-gradient-to-br from-primary/5 to-background">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="size-5" />
              {t("publicBusinessPage")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0 rounded-2xl border bg-background/80 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("publicUrl")}
                </p>
                <Link
                  className="mt-1 block break-all text-sm font-semibold text-primary underline-offset-4 hover:underline"
                  href={publicPath}
                  target="_blank"
                >
                  {publicUrl}
                </Link>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("businessSlug")}: <span dir="ltr">{profile.slug}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={publicPath} target="_blank">
                    <ExternalLink />
                    {t("viewPublicPage")}
                  </Link>
                </Button>
                <PublicProfileActions
                  businessName={profile.name}
                  path={publicPath}
                  labels={{
                    share: t("share"),
                    copy: t("copyPublicLink"),
                    copied: t("copiedPublicLink"),
                    qr: t("qr"),
                    qrDescription: t("qrDescription"),
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </PublicProfileSection>

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
            {data.branches.map((branch) => (
              <div key={branch.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">{branch.name}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/business/manage/locations/${branch.id}/hours`}>
                        {t("editHours")}
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/business/manage/locations/${branch.id}/blocks`}>
                        <CalendarOff />
                        {t("manageClosures")}
                      </Link>
                    </Button>
                  </div>
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
                      <div key={closure.id} className="mt-2 text-xs text-muted-foreground">
                        <span>
                          {format.dateTimeRange(closure.startsAt, closure.endsAt, {
                            dateStyle: "medium",
                            timeStyle: "short",
                            hour12: true,
                          })}
                          {closure.reason ? ` · ${closure.reason}` : ""}
                        </span>
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
        <Card>
          <CardHeader><CardTitle>{mediaT("manage")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <MediaManager description={mediaT("altText")} endpoint="/api/media/business/profile" purpose="BUSINESS_LOGO" slot="BUSINESS_LOGO" storageMode="business" title={t("imageAdded")} />
            <MediaManager description={mediaT("altText")} endpoint="/api/media/business/profile" purpose="BUSINESS_COVER" slot="BUSINESS_COVER" storageMode="business" title={t("imageAdded")} />
            <MediaManager collection description={mediaT("emptyGallery")} endpoint="/api/media/business/profile" purpose="BUSINESS_GALLERY_IMAGE" reorderEndpoint="/api/media/business/profile/reorder" slot="BUSINESS_GALLERY" storageMode="business" title={mediaT("emptyGallery")} />
          </CardContent>
        </Card>
      </PublicProfileSection>

      <PublicProfileSection>
        <BusinessProfileForm profile={profile} />
      </PublicProfileSection>
    </DashboardShell>
  );
}
