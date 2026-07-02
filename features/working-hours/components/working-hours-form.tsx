"use client";

import { useActionState } from "react";
import { Clock3, LoaderCircle, Save } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateWorkingHours } from "@/features/working-hours/actions/update-working-hours";
import {
  initialWorkingHoursActionState,
  type BranchWorkingHours,
} from "@/features/working-hours/types";

type DayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";

export function WorkingHoursForm({
  schedule,
}: {
  schedule: BranchWorkingHours;
}) {
  const t = useTranslations("WorkingHours");
  const common = useTranslations("Common");
  const action = updateWorkingHours.bind(null, schedule.branchId);
  const [state, formAction, pending] = useActionState(
    action,
    initialWorkingHoursActionState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {schedule.days.map((day) => {
        const dayKey = String(day.dayOfWeek) as DayKey;
        return (
          <Card key={day.dayOfWeek} className="shadow-none">
            <CardContent className="grid gap-4 sm:grid-cols-[minmax(8rem,1fr)_auto_minmax(18rem,2fr)] sm:items-center">
              <div className="flex items-center gap-3">
                <Clock3
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="font-medium">{t(`days.${dayKey}`)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id={`day-${day.dayOfWeek}-isOpen`}
                  name={`day-${day.dayOfWeek}-isOpen`}
                  defaultChecked={day.isOpen}
                  disabled={!schedule.canEdit || pending}
                />
                <Label htmlFor={`day-${day.dayOfWeek}-isOpen`}>
                  {t("open")}
                </Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`day-${day.dayOfWeek}-openTime`}>
                    {t("opensAt")}
                  </Label>
                  <Input
                    id={`day-${day.dayOfWeek}-openTime`}
                    name={`day-${day.dayOfWeek}-openTime`}
                    type="time"
                    defaultValue={day.openTime}
                    disabled={!schedule.canEdit || pending}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`day-${day.dayOfWeek}-closeTime`}>
                    {t("closesAt")}
                  </Label>
                  <Input
                    id={`day-${day.dayOfWeek}-closeTime`}
                    name={`day-${day.dayOfWeek}-closeTime`}
                    type="time"
                    defaultValue={day.closeTime}
                    disabled={!schedule.canEdit || pending}
                    dir="ltr"
                  />
                </div>
              </div>
              {state.dayErrors?.[day.dayOfWeek] ? (
                <p
                  role="alert"
                  className="text-xs text-destructive sm:col-start-3"
                >
                  {state.dayErrors[day.dayOfWeek]}
                </p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          aria-live="polite"
          className={
            state.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {state.message}
        </p>
        {schedule.canEdit ? (
          <Button type="submit" disabled={pending}>
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {pending ? common("saving") : common("saveChanges")}
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">
            {common("readOnly")}
          </span>
        )}
      </div>
    </form>
  );
}
