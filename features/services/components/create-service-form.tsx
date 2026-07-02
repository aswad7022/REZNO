"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertTriangle, LoaderCircle, Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  createService,
  updateService,
} from "@/features/services/actions/create-service";
import {
  initialServiceActionState,
  type ServiceDetails,
} from "@/features/services/types";

export function CreateServiceForm({
  branches,
  categories,
  members,
  service,
}: {
  branches: Array<{
    id: string;
    name: string;
    hasWorkingHours: boolean;
  }>;
  categories: Array<{ id: string; slug: string; name: string }>;
  members: Array<{ id: string; name: string }>;
  service?: ServiceDetails;
}) {
  const t = useTranslations("Services");
  const common = useTranslations("Common");
  const action = service
    ? updateService.bind(null, service.id)
    : createService;
  const [state, formAction, pending] = useActionState(
    action,
    initialServiceActionState,
  );
  const primaryOffering =
    service?.offerings.find((offering) => offering.isAvailable) ??
    service?.offerings[0];
  const assignedBranchIds = new Set(
    service?.offerings
      .filter((offering) => offering.isAvailable)
      .map((offering) => offering.branchId) ?? [],
  );

  return (
    <form
      id={service ? `service-edit-${service.id}` : undefined}
      action={formAction}
      className="space-y-5"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="service-name">{t("fields.name")}</Label>
          <Input
            id="service-name"
            name="name"
            defaultValue={service?.name}
            required
            aria-invalid={Boolean(state.fieldErrors?.name)}
          />
          {state.fieldErrors?.name ? (
            <p role="alert" className="text-xs text-destructive">
              {state.fieldErrors.name}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="service-category">{t("fields.category")}</Label>
          <Select
            name="categoryId"
            defaultValue={service?.categoryId ?? categories[0]?.id}
          >
            <SelectTrigger id="service-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.slug === "general"
                    ? t("categories.general")
                    : category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="service-description">
            {t("fields.description")}
          </Label>
          <Textarea
            id="service-description"
            name="description"
            defaultValue={service?.description}
            className="min-h-24"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`service-image-${service?.id ?? "new"}`}>
            {t("fields.imageUrl")}
          </Label>
          <Input
            id={`service-image-${service?.id ?? "new"}`}
            name="imageUrl"
            type="url"
            dir="ltr"
            defaultValue={service?.imageUrl}
            placeholder="https://"
            aria-invalid={Boolean(state.fieldErrors?.imageUrl)}
          />
          <p className="text-xs text-muted-foreground">
            {t("imageUrlHelp")}
          </p>
          {state.fieldErrors?.imageUrl ? (
            <p role="alert" className="text-xs text-destructive">
              {state.fieldErrors.imageUrl}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="service-price">{t("fields.price")}</Label>
          <Input
            id="service-price"
            name="price"
            type="number"
            inputMode="decimal"
            min="1"
            step="1"
            dir="ltr"
            required
            defaultValue={primaryOffering?.price}
          />
          {state.fieldErrors?.price ? (
            <p role="alert" className="text-xs text-destructive">
              {state.fieldErrors.price}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="service-duration">{t("fields.duration")}</Label>
          <Input
            id="service-duration"
            name="durationMinutes"
            type="number"
            min="5"
            max="1440"
            step="5"
            dir="ltr"
            required
            defaultValue={primaryOffering?.durationMinutes}
          />
          {state.fieldErrors?.durationMinutes ? (
            <p role="alert" className="text-xs text-destructive">
              {state.fieldErrors.durationMinutes}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="service-pricing-type">
            {t("fields.pricingType")}
          </Label>
          <Select
            name="pricingType"
            defaultValue={primaryOffering?.pricingType ?? "FIXED"}
          >
            <SelectTrigger id="service-pricing-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FIXED">
                {t("pricingTypes.FIXED")}
              </SelectItem>
              <SelectItem value="STARTING_FROM">
                {t("pricingTypes.STARTING_FROM")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div id="service-staff-mode" className="space-y-2">
          <Label htmlFor={`staff-mode-${service?.id ?? "new"}`}>
            {t("fields.staffSelectionMode")}
          </Label>
          <Select
            name="staffSelectionMode"
            defaultValue={service?.staffSelectionMode ?? "OPTIONAL"}
          >
            <SelectTrigger
              id={`staff-mode-${service?.id ?? "new"}`}
              className="w-full"
            >
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
        </div>
        <div className="space-y-2">
          <Label htmlFor={`service-status-${service?.id ?? "new"}`}>
            {t("fields.status")}
          </Label>
          <Select name="status" defaultValue={service?.status ?? "ACTIVE"}>
            <SelectTrigger
              id={`service-status-${service?.id ?? "new"}`}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">{t("statuses.ACTIVE")}</SelectItem>
              <SelectItem value="INACTIVE">
                {t("statuses.INACTIVE")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset id="service-branches" className="space-y-3">
        <legend className="text-sm font-medium">{t("fields.branches")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="rounded-lg border p-3"
            >
              <Label className="flex min-h-6 items-center gap-3 font-normal">
                <Checkbox
                  name="branchIds"
                  value={branch.id}
                  defaultChecked={
                    service ? assignedBranchIds.has(branch.id) : false
                  }
                />
                {branch.name}
              </Label>
              {!branch.hasWorkingHours ? (
                <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <p>
                    {t("readiness.HOURS.selectionWarning")}{" "}
                    <Link
                      href={`/business/manage/locations/${branch.id}/hours`}
                      className="font-semibold underline underline-offset-2"
                    >
                      {t("readiness.HOURS.action")}
                    </Link>
                  </p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {state.fieldErrors?.branchIds ? (
          <p role="alert" className="text-xs text-destructive">
            {state.fieldErrors.branchIds}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">
          {t("fields.assignedEmployees")}
        </legend>
        <p className="text-xs leading-6 text-muted-foreground">
          {t("assignedEmployeesHelp")}
        </p>
        {members.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {members.map((member) => (
              <Label
                key={member.id}
                className="flex min-h-11 items-center gap-3 rounded-lg border p-3 font-normal"
              >
                <Checkbox
                  name="memberIds"
                  value={member.id}
                  defaultChecked={service?.assignedMemberIds.includes(member.id)}
                />
                {member.name}
              </Label>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {t("noEmployees")}
          </p>
        )}
        {state.fieldErrors?.memberIds ? (
          <p role="alert" className="text-xs text-destructive">
            {state.fieldErrors.memberIds}
          </p>
        ) : null}
      </fieldset>

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
        <Button
          type="submit"
          disabled={pending || branches.length === 0 || categories.length === 0}
        >
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          {pending
            ? common("saving")
            : service
              ? t("edit.save")
              : t("add")}
        </Button>
      </div>
    </form>
  );
}
