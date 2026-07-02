"use client";

import { useActionState } from "react";
import { LoaderCircle, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createBlockedTime,
  updateMemberAvailability,
} from "@/features/availability/actions/manage-availability";
import {
  initialAvailabilityActionState,
  initialBlockedTimeActionState,
  type MemberAvailabilityBranch,
} from "@/features/availability/types";

type DayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";

export function AvailabilityForm({
  branch,
  memberId,
}: {
  branch: MemberAvailabilityBranch;
  memberId: string;
}) {
  const t = useTranslations("WorkingHours");
  const common = useTranslations("Common");
  const action = updateMemberAvailability.bind(null, memberId, branch.id);
  const [state, formAction, pending] = useActionState(
    action,
    initialAvailabilityActionState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {branch.days.map((day) => {
        const key = String(day.dayOfWeek) as DayKey;
        return (
          <div
            key={day.dayOfWeek}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto_8rem_8rem] sm:items-center"
          >
            <span className="font-medium">{t(`days.${key}`)}</span>
            <Switch
              name={`day-${day.dayOfWeek}-isOpen`}
              defaultChecked={day.isOpen}
              disabled={pending}
              aria-label={t("open")}
            />
            <Input
              name={`day-${day.dayOfWeek}-openTime`}
              type="time"
              defaultValue={day.openTime}
              disabled={pending}
              dir="ltr"
            />
            <Input
              name={`day-${day.dayOfWeek}-closeTime`}
              type="time"
              defaultValue={day.closeTime}
              disabled={pending}
              dir="ltr"
            />
            {state.dayErrors?.[day.dayOfWeek] ? (
              <p className="text-xs text-destructive sm:col-span-4">
                {state.dayErrors[day.dayOfWeek]}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-3">
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
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Save />}
          {pending ? common("saving") : common("saveChanges")}
        </Button>
      </div>
    </form>
  );
}

export function BlockedTimeForm({
  branches,
  memberId,
}: {
  branches: Array<{ id: string; name: string }>;
  memberId: string;
}) {
  const t = useTranslations("BlockedTime");
  const [state, formAction, pending] = useActionState(
    createBlockedTime.bind(null, memberId),
    initialBlockedTimeActionState,
  );

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="blocked-branch">{t("branch")}</Label>
        <Select name="branchId" defaultValue={branches[0]?.id}>
          <SelectTrigger id="blocked-branch" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="blocked-reason">{t("reason")}</Label>
        <Input id="blocked-reason" name="reason" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="blocked-start">{t("startsAt")}</Label>
        <Input
          id="blocked-start"
          name="startsAt"
          type="datetime-local"
          required
          dir="ltr"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="blocked-end">{t("endsAt")}</Label>
        <Input
          id="blocked-end"
          name="endsAt"
          type="datetime-local"
          required
          dir="ltr"
        />
      </div>
      <div className="flex items-center justify-between gap-3 md:col-span-2">
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
        <Button type="submit" disabled={pending || branches.length === 0}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}
          {t("add")}
        </Button>
      </div>
    </form>
  );
}
