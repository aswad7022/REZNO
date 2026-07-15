"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createBranch,
  updateBranch,
} from "@/features/branches/actions/manage-branch";
import {
  initialBranchActionState,
  type BranchDetails,
  type BranchField,
} from "@/features/branches/types";
import { LocationPicker } from "@/features/location/components/location-picker";

function Field({
  children,
  error,
  htmlFor,
  label,
}: {
  children: ReactNode;
  error?: string;
  htmlFor: BranchField;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function BranchForm({
  branch,
  contextOrganizationId,
  idempotencyKey,
}: {
  branch?: BranchDetails;
  contextOrganizationId: string;
  idempotencyKey: string;
}) {
  const t = useTranslations("Branches");
  const common = useTranslations("Common");
  const action = branch ? updateBranch.bind(null, branch.id) : createBranch;
  const [state, formAction, pending] = useActionState(
    action,
    initialBranchActionState,
  );

  function fieldProps(field: BranchField) {
    const error = state.fieldErrors?.[field];
    return {
      "aria-describedby": error ? `${field}-error` : undefined,
      "aria-invalid": Boolean(error),
      id: field,
      name: field,
    };
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="contextOrganizationId" value={contextOrganizationId} />
      {branch ? <input type="hidden" name="expectedVersion" value={state.version ?? branch.version} /> : null}
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          htmlFor="name"
          label={t("fields.name")}
          error={state.fieldErrors?.name}
        >
          <Input
            {...fieldProps("name")}
            defaultValue={branch?.name}
            placeholder={t("placeholders.name")}
            required
          />
        </Field>
        <Field
          htmlFor="timezone"
          label={t("fields.timezone")}
          error={state.fieldErrors?.timezone}
        >
          <Input
            {...fieldProps("timezone")}
            defaultValue={branch?.timezone ?? "Asia/Baghdad"}
            dir="ltr"
            required
          />
        </Field>
        <Field
          htmlFor="phone"
          label={t("fields.phone")}
          error={state.fieldErrors?.phone}
        >
          <Input
            {...fieldProps("phone")}
            type="tel"
            defaultValue={branch?.phone}
            dir="ltr"
          />
        </Field>
        <Field
          htmlFor="email"
          label={t("fields.email")}
          error={state.fieldErrors?.email}
        >
          <Input
            {...fieldProps("email")}
            type="email"
            defaultValue={branch?.email}
            dir="ltr"
          />
        </Field>
        <Field
          htmlFor="addressLine1"
          label={t("fields.addressLine1")}
          error={state.fieldErrors?.addressLine1}
        >
          <Input
            {...fieldProps("addressLine1")}
            defaultValue={branch?.addressLine1}
          />
        </Field>
        <Field
          htmlFor="addressLine2"
          label={t("fields.addressLine2")}
          error={state.fieldErrors?.addressLine2}
        >
          <Input
            {...fieldProps("addressLine2")}
            defaultValue={branch?.addressLine2}
          />
        </Field>
        <Field
          htmlFor="city"
          label={t("fields.city")}
          error={state.fieldErrors?.city}
        >
          <Input
            {...fieldProps("city")}
            defaultValue={branch?.city}
            placeholder={t("placeholders.city")}
          />
        </Field>
        <Field
          htmlFor="country"
          label={t("fields.country")}
          error={state.fieldErrors?.country}
        >
          <Input
            {...fieldProps("country")}
            defaultValue={branch?.country}
            placeholder={t("placeholders.country")}
          />
        </Field>
        <Field
          htmlFor="locationLabel"
          label={t("fields.locationLabel")}
          error={state.fieldErrors?.locationLabel}
        >
          <Input
            {...fieldProps("locationLabel")}
            defaultValue={branch?.locationLabel}
            placeholder={t("placeholders.locationLabel")}
          />
        </Field>
        <Field
          htmlFor="nearbyLandmark"
          label={t("fields.nearbyLandmark")}
          error={state.fieldErrors?.nearbyLandmark}
        >
          <Input
            {...fieldProps("nearbyLandmark")}
            defaultValue={branch?.nearbyLandmark}
            placeholder={t("placeholders.nearbyLandmark")}
          />
        </Field>
        <Field
          htmlFor="locationInstructions"
          label={t("fields.locationInstructions")}
          error={state.fieldErrors?.locationInstructions}
        >
          <Input
            {...fieldProps("locationInstructions")}
            defaultValue={branch?.locationInstructions}
            placeholder={t("placeholders.locationInstructions")}
          />
        </Field>
        <LocationPicker
          defaultLatitude={branch?.latitude}
          defaultLongitude={branch?.longitude}
          labels={{
            latitude: t("fields.latitude"),
            longitude: t("fields.longitude"),
            chooseOnMap: t("chooseOnMap"),
            movePin: t("movePin"),
            mapData: t("mapData"),
          }}
        />
        {state.fieldErrors?.latitude ? (
          <p role="alert" className="text-xs text-destructive md:col-span-2">
            {state.fieldErrors.latitude}
          </p>
        ) : null}
        {state.fieldErrors?.longitude ? (
          <p role="alert" className="text-xs text-destructive md:col-span-2">
            {state.fieldErrors.longitude}
          </p>
        ) : null}
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
        <Button type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}
          {pending
            ? common("saving")
            : branch
              ? common("saveChanges")
              : t("add")}
        </Button>
      </div>
    </form>
  );
}
