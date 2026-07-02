import { CalendarOff } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

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
import { deleteBlockedTime } from "@/features/availability/actions/manage-availability";
import {
  AvailabilityForm,
  BlockedTimeForm,
} from "@/features/availability/components/availability-forms";
import { getMemberAvailability } from "@/features/availability/services/availability";

export async function AvailabilityPage({ memberId }: { memberId: string }) {
  const [data, t, blockedT, format] = await Promise.all([
    getMemberAvailability(memberId),
    getTranslations("Availability"),
    getTranslations("BlockedTime"),
    getFormatter(),
  ]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description", { member: data.memberName })}
      />
      {data.branches.map((branch) => (
        <Card key={branch.id}>
          <CardHeader>
            <CardTitle>{t("branchTitle", { branch: branch.name })}</CardTitle>
            <CardDescription dir="ltr">{branch.timezone}</CardDescription>
          </CardHeader>
          <CardContent>
            <AvailabilityForm branch={branch} memberId={data.memberId} />
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>{blockedT("title")}</CardTitle>
          <CardDescription>{blockedT("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <BlockedTimeForm
            memberId={data.memberId}
            branches={data.branches.map(({ id, name }) => ({ id, name }))}
          />
          {data.blockedTimes.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarOff className="size-4" />
              {blockedT("empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {data.blockedTimes.map((blocked) => (
                <div
                  key={blocked.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <span>
                    <strong>{blocked.branchName}</strong>{" "}
                    {format.dateTimeRange(blocked.startsAt, blocked.endsAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      hour12: true,
                    })}
                    {blocked.reason ? ` · ${blocked.reason}` : ""}
                  </span>
                  <form
                    action={deleteBlockedTime.bind(
                      null,
                      data.memberId,
                      blocked.id,
                    )}
                  >
                    <Button type="submit" size="sm" variant="ghost">
                      {blockedT("remove")}
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
