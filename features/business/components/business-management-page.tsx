import Link from "next/link";
import { CheckCircle2, Clock3, ExternalLink, LockKeyhole } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BusinessProfileForm } from "@/features/business/components/business-profile-form";
import { getCurrentBusinessProfile } from "@/features/business/services/business-profile";
import { CopyProfileLink } from "@/features/dashboard/components/copy-profile-link";

export async function BusinessManagementPage() {
  const [profile, t] = await Promise.all([
    getCurrentBusinessProfile(),
    getTranslations("BusinessManagement"),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant={profile.visibility === "PUBLISHED" ? "default" : "secondary"}>
              {profile.visibility === "PUBLISHED" ? t("visibility.PUBLISHED") : t("visibility.HIDDEN")}
            </Badge>
            <Button asChild size="sm" variant="outline">
              <Link href={`/${profile.slug}`} target="_blank">
                <ExternalLink />
                {t("openPublicPage")}
              </Link>
            </Button>
            <CopyProfileLink
              slug={profile.slug}
              label={t("copyPublicLink")}
              copiedLabel={t("copiedPublicLink")}
            />
            <Badge variant={profile.isVerified ? "default" : "secondary"}>
              {profile.isVerified ? (
                <CheckCircle2 aria-hidden="true" />
              ) : (
                <Clock3 aria-hidden="true" />
              )}
              {profile.isVerified
                ? t("status.verified")
                : t("status.unverified")}
            </Badge>
          </div>
        }
      />

      <Card className="shadow-none">
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            <span className="text-muted-foreground">{t("status.slug")}:</span>{" "}
            <span dir="ltr" className="font-mono">
              {profile.slug}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">{t("status.role")}:</span>{" "}
            {profile.roleName}
          </span>
        </CardContent>
      </Card>

      {!profile.canEdit ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex gap-3">
            <LockKeyhole
              className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium">{t("restrictedTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("restrictedDescription")}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <BusinessProfileForm profile={profile} />
    </DashboardShell>
  );
}
