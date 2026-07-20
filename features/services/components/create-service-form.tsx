"use client";

import { useActionState } from "react";
import { LoaderCircle, Save, Sparkles } from "lucide-react";
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
import { createService, updateService } from "@/features/services/actions/create-service";
import {
  initialServiceActionState,
  type ServiceDetails,
} from "@/features/services/types";

export function CreateServiceForm({
  categories,
  idempotencyKey,
  organizationId,
  service,
}: {
  categories: Array<{ id: string; slug: string; name: string }>;
  idempotencyKey: string;
  organizationId: string;
  service?: ServiceDetails;
}) {
  const t = useTranslations("Services");
  const common = useTranslations("Common");
  const action = service ? updateService.bind(null, service.id) : createService;
  const [state, formAction, pending] = useActionState(action, initialServiceActionState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="contextOrganizationId" value={organizationId} />
      <input type="hidden" name="idempotencyKey" value={state.nextIdempotencyKey ?? idempotencyKey} />
      {service ? (
        <input type="hidden" name="expectedVersion" value={state.version ?? service.version} />
      ) : null}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`service-name-${service?.id ?? "new"}`}>{t("fields.name")}</Label>
          <Input id={`service-name-${service?.id ?? "new"}`} name="name" defaultValue={service?.name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`service-category-${service?.id ?? "new"}`}>{t("fields.category")}</Label>
          <Select name="categoryId" defaultValue={service?.categoryId ?? categories[0]?.id}>
            <SelectTrigger id={`service-category-${service?.id ?? "new"}`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.slug === "general" ? t("categories.general") : category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`service-description-${service?.id ?? "new"}`}>{t("fields.description")}</Label>
          <Textarea id={`service-description-${service?.id ?? "new"}`} name="description" defaultValue={service?.description} maxLength={2000} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`staff-mode-${service?.id ?? "new"}`}>{t("fields.staffSelectionMode")}</Label>
          <Select name="staffSelectionMode" defaultValue={service?.staffSelectionMode ?? "OPTIONAL"}>
            <SelectTrigger id={`staff-mode-${service?.id ?? "new"}`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">{t("staffModes.NONE")}</SelectItem>
              <SelectItem value="OPTIONAL">{t("staffModes.OPTIONAL")}</SelectItem>
              <SelectItem value="REQUIRED">{t("staffModes.REQUIRED")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {service ? (
          <Label className="flex min-h-11 items-center gap-3 rounded-lg border p-3 font-normal">
            <Checkbox name="confirmFutureBookings" />
            {t("confirmFutureBookings")}
          </Label>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {state.message}{state.replayed ? ` · ${t("replayed")}` : ""}
        </p>
        <Button type="submit" disabled={pending || categories.length === 0}>
          {pending ? <LoaderCircle className="animate-spin" /> : service ? <Save /> : <Sparkles />}
          {pending ? common("saving") : service ? common("saveChanges") : t("add")}
        </Button>
      </div>
    </form>
  );
}
