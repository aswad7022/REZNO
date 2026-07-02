import { getTranslations } from "next-intl/server";

import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BusinessSettingsForm } from "@/features/business-settings/components/business-settings-form";
import { getCurrentBusinessSettings } from "@/features/business-settings/services/business-settings";

export async function BusinessSettingsPage() {
  const [settings, t] = await Promise.all([
    getCurrentBusinessSettings(),
    getTranslations("BusinessSettings"),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader title={t("title")} description={t("description")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("bookingTitle")}</CardTitle>
          <CardDescription>{t("bookingDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessSettingsForm settings={settings} />
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
