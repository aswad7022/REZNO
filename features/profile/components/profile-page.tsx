import Link from "next/link";
import { UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProfileForm } from "@/features/profile/components/profile-form";
import { MediaManager } from "@/features/media/components/media-manager";
import { getCurrentProfile } from "@/features/profile/services/profile";
import type { DashboardRole } from "@/types/dashboard";

export async function ProfilePage({ role }: { role: DashboardRole }) {
  const [profile, t, mediaT] = await Promise.all([
    getCurrentProfile(),
    getTranslations("Profile"),
    getTranslations("Media"),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description")}
      />
      {profile ? (
        <>
        <Card className="max-w-3xl">
          <CardContent className="pt-6">
            <MediaManager
              description={mediaT("altText")}
              endpoint="/api/media/customer/profile"
              purpose="CUSTOMER_AVATAR"
              slot="CUSTOMER_AVATAR"
              storageMode="customer"
              title={t("fields.avatarUrl")}
            />
          </CardContent>
        </Card>
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>{t("personalTitle")}</CardTitle>
            <CardDescription>
              {t("personalDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profile} role={role} />
          </CardContent>
        </Card>
        </>
      ) : (
        <DashboardEmpty
          icon={UserRound}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button asChild>
              <Link href="/register">{t("createAccount")}</Link>
            </Button>
          }
        />
      )}
    </DashboardShell>
  );
}
