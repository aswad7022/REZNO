import Link from "next/link";
import { CalendarClock, UsersRound } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TeamMemberForm } from "@/features/team/components/team-member-form";
import { getCurrentOrganizationTeam } from "@/features/team/services/team";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export async function TeamManagementPage() {
  const [{ members, branches, canEdit }, t, format] = await Promise.all([
    getCurrentOrganizationTeam(),
    getTranslations("Team"),
    getFormatter(),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader title={t("title")} description={t("description")} />

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("add")}</CardTitle>
            <CardDescription>{t("emptyDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <TeamMemberForm branches={branches} />
          </CardContent>
        </Card>
      ) : null}

      {members.length === 0 ? (
        <DashboardEmpty
          icon={UsersRound}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <div className="grid gap-4">
          {members.map((member) => {
            const roleKey = member.systemRole ?? "CUSTOM";
            return (
              <Card key={member.id}>
                <CardHeader className="flex-row items-start gap-4">
                  <Avatar className="size-11">
                    {member.avatarUrl ? (
                      <AvatarImage src={member.avatarUrl} alt="" />
                    ) : null}
                    <AvatarFallback>
                      {initials(member.name) || "RU"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{member.name}</CardTitle>
                      <Badge variant="secondary">{t(`roles.${roleKey}`)}</Badge>
                    </div>
                    <CardDescription className="mt-1" dir="ltr">
                      {member.email}
                    </CardDescription>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {member.branchNames.length > 0
                        ? member.branchNames.join(" · ")
                        : t("noBranches")}
                      {" · "}
                      {t("joined", {
                        date: format.dateTime(member.joinedAt, {
                          dateStyle: "medium",
                        }),
                      })}
                    </p>
                  </div>
                </CardHeader>
                {canEdit && member.systemRole !== "OWNER" ? (
                  <CardContent>
                    {member.branchIds.length > 0 ? (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="mb-4"
                      >
                        <Link
                          href={`/business/team/${member.id}/availability`}
                        >
                          <CalendarClock />
                          {t("availability")}
                        </Link>
                      </Button>
                    ) : null}
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {t("edit")}
                      </summary>
                      <div className="mt-5 border-t pt-5">
                        <TeamMemberForm branches={branches} member={member} />
                      </div>
                    </details>
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
