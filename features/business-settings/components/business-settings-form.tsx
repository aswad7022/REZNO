"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateBusinessSettings } from "@/features/business-settings/actions/update-business-settings";
import { initialBusinessSettingsActionState, type BusinessSettingsDetails } from "@/features/business-settings/types";

export function BusinessSettingsForm({ settings }: { settings: BusinessSettingsDetails }) {
  const t = useTranslations("BusinessSettings");
  const common = useTranslations("Common");
  const [state, formAction, pending] = useActionState(updateBusinessSettings, initialBusinessSettingsActionState);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="contextOrganizationId" value={settings.organizationId} />
      <input type="hidden" name="expectedVersion" value={state.version ?? settings.version} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? settings.idempotencyKey} />
      <div className="rounded-lg border bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">{t("activeBusiness")}</p>
        <p className="font-semibold">{settings.organizationName}</p>
      </div>
      <div className="flex items-start justify-between gap-6 rounded-lg border p-4">
        <div>
          <Label htmlFor="bookingEnabled">{t("fields.bookingEnabled")}</Label>
          <p className="mt-1 text-sm text-muted-foreground">{t("fields.bookingEnabledHelp")}</p>
        </div>
        <Switch id="bookingEnabled" name="bookingEnabled" defaultChecked={settings.bookingEnabled} disabled={pending} />
      </div>
      <div className="flex items-start justify-between gap-6 rounded-lg border p-4">
        <div>
          <Label htmlFor="marketplaceVisible">{t("fields.marketplaceVisible")}</Label>
          <p className="mt-1 text-sm text-muted-foreground">{t("fields.marketplaceVisibleHelp")}</p>
        </div>
        <Switch id="marketplaceVisible" name="marketplaceVisible" defaultChecked={settings.marketplaceVisible} disabled={pending} />
      </div>
      <div className="max-w-sm space-y-2">
        <Label htmlFor="cancellationWindowHours">{t("fields.cancellationWindowHours")}</Label>
        <Input id="cancellationWindowHours" name="cancellationWindowHours" type="number" step="1" min="0" max="720" defaultValue={settings.cancellationWindowHours} disabled={pending} dir="ltr" required />
        {state.fieldErrors?.cancellationWindowHours ? <p role="alert" className="text-xs text-destructive">{state.fieldErrors.cancellationWindowHours}</p> : null}
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {state.message}{state.replayed ? ` · ${t("replayed")}` : ""}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {pending ? common("saving") : common("saveChanges")}
        </Button>
      </div>
    </form>
  );
}
