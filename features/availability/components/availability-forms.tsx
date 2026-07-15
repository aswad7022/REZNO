"use client";

import { useActionState } from "react";
import { LoaderCircle, Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  deleteBlockedTime,
  updateBlockedTime,
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
  idempotencyKey,
  memberId,
  organizationId,
}: {
  branch: MemberAvailabilityBranch;
  idempotencyKey: string;
  memberId: string;
  organizationId: string;
}) {
  const t = useTranslations("WorkingHours");
  const availabilityT = useTranslations("Availability");
  const common = useTranslations("Common");
  const action = updateMemberAvailability.bind(null, memberId, branch.id);
  const [state, formAction, pending] = useActionState(
    action,
    initialAvailabilityActionState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="contextOrganizationId" value={organizationId} />
      <input type="hidden" name="expectedVersion" value={state.version ?? branch.version} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
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
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox name="confirmFutureBookings" />
          {availabilityT("confirmImpact")}
        </Label>
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
  blockedTime,
  branches,
  idempotencyKey,
  memberId,
  organizationId,
}: {
  blockedTime?: {
    branchId: string;
    endsAt: string;
    id: string;
    reason: string;
    startsAt: string;
    version: string;
  };
  branches: Array<{ id: string; name: string }>;
  idempotencyKey: string;
  memberId: string;
  organizationId: string;
}) {
  const t = useTranslations("BlockedTime");
  const [state, formAction, pending] = useActionState(
    blockedTime
      ? updateBlockedTime.bind(null, memberId, blockedTime.id)
      : createBlockedTime.bind(null, memberId),
    initialBlockedTimeActionState,
  );

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="contextOrganizationId" value={organizationId} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      {blockedTime ? <input type="hidden" name="expectedVersion" value={state.version ?? blockedTime.version} /> : null}
      <div className="space-y-2">
        <Label htmlFor="blocked-branch">{t("branch")}</Label>
        <Select name="branchId" defaultValue={blockedTime?.branchId ?? branches[0]?.id}>
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
        <Input id="blocked-reason" name="reason" defaultValue={blockedTime?.reason} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="blocked-start">{t("startsAt")}</Label>
        <Input
          id="blocked-start"
          name="startsAt"
          type="datetime-local"
          required
          dir="ltr"
          defaultValue={blockedTime?.startsAt}
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
          defaultValue={blockedTime?.endsAt}
        />
      </div>
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox name="confirmFutureBookings" />
          {t("confirmImpact")}
        </Label>
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
          {blockedTime ? t("save") : t("add")}
        </Button>
      </div>
    </form>
  );
}

export function DeleteBlockedTimeForm({
  blockedTimeId,
  expectedVersion,
  idempotencyKey,
  memberId,
  organizationId,
}: {
  blockedTimeId: string;
  expectedVersion: string;
  idempotencyKey: string;
  memberId: string;
  organizationId: string;
}) {
  const t = useTranslations("BlockedTime");
  const [state, formAction, pending] = useActionState(
    deleteBlockedTime.bind(null, memberId, blockedTimeId),
    initialBlockedTimeActionState,
  );
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="contextOrganizationId" value={organizationId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        {t("remove")}
      </Button>
      {state.message ? <p aria-live="polite" className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{state.message}</p> : null}
    </form>
  );
}
