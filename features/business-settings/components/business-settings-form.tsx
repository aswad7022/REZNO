"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
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
import { updateBusinessSettings } from "@/features/business-settings/actions/update-business-settings";
import { businessVerticals } from "@/features/businesses/config/verticals";
import {
  initialBusinessSettingsActionState,
  type BusinessSettingsDetails,
} from "@/features/business-settings/types";

export function BusinessSettingsForm({
  settings,
}: {
  settings: BusinessSettingsDetails;
}) {
  const t = useTranslations("BusinessSettings");
  const common = useTranslations("Common");
  const [state, formAction, pending] = useActionState(
    updateBusinessSettings,
    initialBusinessSettingsActionState,
  );
  const disabled = !settings.canEdit || pending;

  return (
    <form action={formAction} className="space-y-6">
      <div className="flex items-start justify-between gap-6 rounded-lg border p-4">
        <div>
          <Label htmlFor="bookingEnabled">{t("fields.bookingEnabled")}</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("fields.bookingEnabledHelp")}
          </p>
        </div>
        <Switch
          id="bookingEnabled"
          name="bookingEnabled"
          defaultChecked={settings.bookingEnabled}
          disabled={disabled}
        />
      </div>

      <div className="flex items-start justify-between gap-6 rounded-lg border p-4">
        <div>
          <Label htmlFor="marketplaceVisible">
            {t("fields.marketplaceVisible")}
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("fields.marketplaceVisibleHelp")}
          </p>
        </div>
        <Switch
          id="marketplaceVisible"
          name="marketplaceVisible"
          defaultChecked={settings.marketplaceVisible}
          disabled={disabled}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="vertical">{t("fields.vertical")}</Label>
          <Select
            name="vertical"
            defaultValue={settings.vertical}
            disabled={disabled}
          >
            <SelectTrigger id="vertical" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {businessVerticals.map((vertical) => (
                <SelectItem key={vertical} value={vertical}>
                  {t(`verticals.${vertical}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("fields.verticalHelp")}
          </p>
          {state.fieldErrors?.vertical ? (
            <p role="alert" className="text-xs text-destructive">
              {state.fieldErrors.vertical}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="staffSelectionMode">
            {t("fields.staffSelectionMode")}
          </Label>
          <Select
            name="staffSelectionMode"
            defaultValue={settings.staffSelectionMode}
            disabled={disabled}
          >
            <SelectTrigger id="staffSelectionMode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">{t("staffModes.NONE")}</SelectItem>
              <SelectItem value="OPTIONAL">
                {t("staffModes.OPTIONAL")}
              </SelectItem>
              <SelectItem value="REQUIRED">
                {t("staffModes.REQUIRED")}
              </SelectItem>
            </SelectContent>
          </Select>
          {state.fieldErrors?.staffSelectionMode ? (
            <p role="alert" className="text-xs text-destructive">
              {state.fieldErrors.staffSelectionMode}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cancellationWindowHours">
            {t("fields.cancellationWindowHours")}
          </Label>
          <Input
            id="cancellationWindowHours"
            name="cancellationWindowHours"
            type="number"
            min="0"
            max="720"
            defaultValue={settings.cancellationWindowHours}
            disabled={disabled}
            dir="ltr"
          />
          {state.fieldErrors?.cancellationWindowHours ? (
            <p role="alert" className="text-xs text-destructive">
              {state.fieldErrors.cancellationWindowHours}
            </p>
          ) : null}
        </div>
      </div>

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
        {settings.canEdit ? (
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
