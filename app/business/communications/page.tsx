import { BellRing, MessageCircleMore, RadioTower } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BusinessCommunicationsHubPage() {
  const t = await getTranslations("Stage4Communications");
  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("businessTitle")}
        description={t("businessDescription")}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><BellRing className="size-5 text-primary" /><CardTitle>{t("notificationCenter")}</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>{t("notificationCenterDescription")}</p>
            <Button asChild><Link href="/business/notifications">{t("openNotificationCenter")}</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><MessageCircleMore className="size-5" /><CardTitle>{t("messaging")}</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>{t("messagingDescription")}</p>
            <Button asChild variant="outline"><Link href="/business/messages">{t("openMessages")}</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><RadioTower className="size-5" /><CardTitle>{t("outboundDelivery")}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t("outboundDescription")}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
