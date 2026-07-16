import { randomUUID } from "node:crypto";
import { CalendarOff } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

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
import {
  AvailabilityForm,
  BlockedTimeForm,
  DeleteBlockedTimeForm,
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
            {branch.canEditSchedule ? (
              <AvailabilityForm branch={branch} idempotencyKey={randomUUID()} memberId={data.memberId} organizationId={data.organizationId} />
            ) : (
              <div className="grid gap-2 text-sm">
                {branch.days.filter((day) => day.isOpen).map((day) => {
                  const dayKey = String(day.dayOfWeek) as "0" | "1" | "2" | "3" | "4" | "5" | "6";
                  return <p key={day.dayOfWeek}>{t(`days.${dayKey}`)}: {day.openTime}–{day.closeTime}</p>;
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>{blockedT("title")}</CardTitle>
          <CardDescription>{blockedT("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {data.canEdit ? <BlockedTimeForm
            idempotencyKey={randomUUID()}
            memberId={data.memberId}
            organizationId={data.organizationId}
            branches={data.branches.map(({ id, name }) => ({ id, name }))}
          /> : null}
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
                  {data.canEdit ? <div className="w-full space-y-3 border-t pt-3">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">{blockedT("edit")}</summary>
                      <div className="mt-3">
                        <BlockedTimeForm
                          blockedTime={{
                            branchId: blocked.branchId,
                            endsAt: localInput(blocked.endsAt, data.branches.find((branch) => branch.id === blocked.branchId)?.timezone ?? "UTC"),
                            id: blocked.id,
                            reason: blocked.reason,
                            startsAt: localInput(blocked.startsAt, data.branches.find((branch) => branch.id === blocked.branchId)?.timezone ?? "UTC"),
                            version: blocked.version,
                          }}
                          branches={data.branches.map(({ id, name }) => ({ id, name }))}
                          idempotencyKey={randomUUID()}
                          memberId={data.memberId}
                          organizationId={data.organizationId}
                        />
                      </div>
                    </details>
                    <DeleteBlockedTimeForm blockedTimeId={blocked.id} expectedVersion={blocked.version} idempotencyKey={randomUUID()} memberId={data.memberId} organizationId={data.organizationId} />
                  </div> : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}

function localInput(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
