import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { BriefcaseBusiness } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WorkInvitationActions } from "@/features/team/components/work-invitation-actions";
import { getCurrentUserWorkInvitations } from "@/features/team/services/invitations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("WorkInvitations");
  return { title: t("title") };
}

export default async function CustomerWorkInvitationsPage() {
  const [invitations, t, teamT, format] = await Promise.all([
    getCurrentUserWorkInvitations(),
    getTranslations("WorkInvitations"),
    getTranslations("Team"),
    getFormatter(),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader title={t("title")} description={t("description")} />

      {invitations.length === 0 ? (
        <DashboardEmpty
          icon={BriefcaseBusiness}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <div className="grid gap-4">
          {invitations.map((invitation) => (
            <Card key={invitation.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>
                    {t("invitedToJoin", {
                      business: invitation.businessName,
                    })}
                  </CardTitle>
                  <Badge variant="secondary">{t("pending")}</Badge>
                </div>
                <CardDescription>
                  {t("roleLine", {
                    role: teamT(`roles.${invitation.systemRole ?? "CUSTOM"}`),
                  })}
                  {" · "}
                  {t("sent", {
                    date: format.dateTime(invitation.createdAt, {
                      dateStyle: "medium",
                    }),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <WorkInvitationActions idempotencyKey={randomUUID()} invitationId={invitation.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
