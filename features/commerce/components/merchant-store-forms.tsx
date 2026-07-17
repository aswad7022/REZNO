"use client";

import { useActionState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import {
  merchantStoreLifecycleAction,
  saveMerchantStoreAction,
} from "@/features/commerce/actions/manage-merchant-store";
import type { CommerceActionState } from "@/features/commerce/actions/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const INITIAL: CommerceActionState = { message: "", ok: false };

export interface StoreFormValue {
  coverImageUrl: string | null;
  currency: string;
  deliveryArea: string | null;
  deliveryCity: string | null;
  deliveryEnabled: boolean;
  deliveryEstimateMinutes: number | null;
  deliveryFee: string;
  description: string | null;
  expectedVersion: string;
  id: string;
  logoUrl: string | null;
  minimumOrderValue: string;
  name: string;
  pickupAdditionalDetails: string | null;
  pickupArea: string | null;
  pickupCity: string | null;
  pickupEnabled: boolean;
  pickupInstructions: string | null;
  pickupStreet: string | null;
  preparationEstimateMinutes: number | null;
  slug: string;
  status: string;
  supportPhone: string | null;
}

export function MerchantStoreForm({
  contextOrganizationId,
  idempotencyKey,
  store,
}: {
  contextOrganizationId: string;
  idempotencyKey: string;
  store: StoreFormValue | null;
}) {
  const t = useTranslations("Commerce");
  const [state, action, pending] = useActionState(saveMerchantStoreAction, INITIAL);
  const disabled = Boolean(store && !["DRAFT", "REJECTED", "ACTIVE"].includes(store.status));
  return (
    <form action={action} className="space-y-5" aria-describedby="store-form-result">
      <input type="hidden" name="mode" value={store ? "update" : "create"} />
      <input type="hidden" name="contextOrganizationId" value={contextOrganizationId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="currency" value="IQD" />
      {store ? <>
        <input type="hidden" name="storeId" value={store.id} />
        <input type="hidden" name="expectedVersion" value={store.expectedVersion} />
      </> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("fields.name")} name="name" defaultValue={store?.name} required disabled={disabled} readOnly={store?.status === "ACTIVE"} />
        <Field label={t("fields.slug")} name="slug" defaultValue={store?.slug} required dir="ltr" disabled={disabled} readOnly={store?.status === "ACTIVE"} />
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="store-description">{t("fields.description")}</Label>
          <Textarea id="store-description" name="description" defaultValue={store?.description ?? ""} maxLength={4000} disabled={disabled} readOnly={store?.status === "ACTIVE"} />
        </div>
        <Field label={t("fields.logoUrl")} name="logoUrl" type="url" dir="ltr" defaultValue={store?.logoUrl ?? ""} disabled={disabled} readOnly={store?.status === "ACTIVE"} />
        <Field label={t("fields.coverImageUrl")} name="coverImageUrl" type="url" dir="ltr" defaultValue={store?.coverImageUrl ?? ""} disabled={disabled} readOnly={store?.status === "ACTIVE"} />
        <Field label={t("fields.supportPhone")} name="supportPhone" type="tel" dir="ltr" defaultValue={store?.supportPhone ?? ""} disabled={disabled} />
        <Field label={t("fields.preparationEstimate")} name="preparationEstimateMinutes" type="number" min={1} max={10080} defaultValue={store?.preparationEstimateMinutes ?? ""} disabled={disabled} />
        <Field label={t("fields.deliveryEstimate")} name="deliveryEstimateMinutes" type="number" min={1} max={10080} defaultValue={store?.deliveryEstimateMinutes ?? ""} disabled={disabled} />
        <Field label={t("fields.deliveryFee")} name="deliveryFee" inputMode="numeric" defaultValue={store?.deliveryFee ?? "0"} required disabled={disabled} />
        <Field label={t("fields.minimumOrder")} name="minimumOrderValue" inputMode="numeric" defaultValue={store?.minimumOrderValue ?? "0"} required disabled={disabled} />
      </div>
      <FulfillmentSection prefix="delivery" enabled={store?.deliveryEnabled} city={store?.deliveryCity} area={store?.deliveryArea} disabled={disabled} />
      <FulfillmentSection prefix="pickup" enabled={store?.pickupEnabled} city={store?.pickupCity} area={store?.pickupArea} street={store?.pickupStreet} details={store?.pickupAdditionalDetails} instructions={store?.pickupInstructions} disabled={disabled} />
      <p id="store-form-result" aria-live="polite" className={state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{state.message}</p>
      <Button type="submit" disabled={pending || disabled}>{pending ? t("saving") : t(store ? "save" : "create")}</Button>
    </form>
  );
}

export function MerchantStoreLifecycleForms({
  contextOrganizationId,
  expectedVersion,
  idempotencyKeys,
  status,
  storeId,
}: {
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKeys: { archive: string; reopen: string; submit: string };
  status: string;
  storeId: string;
}) {
  const t = useTranslations("Commerce");
  const [state, action, pending] = useActionState(merchantStoreLifecycleAction, INITIAL);
  const available = status === "DRAFT" ? "submit" : status === "REJECTED" ? "reopen" : null;
  return (
    <div className="space-y-4">
      {available ? (
        <form
          action={action}
          className="flex flex-wrap items-end gap-3"
          onSubmit={available === "submit" ? confirmSubmission(t("confirmSubmit")) : undefined}
        >
          <Envelope action={available} contextOrganizationId={contextOrganizationId} expectedVersion={expectedVersion} idempotencyKey={idempotencyKeys[available]} storeId={storeId} />
          <Button type="submit" disabled={pending}>{t(available)}</Button>
        </form>
      ) : null}
      {["DRAFT", "PENDING_REVIEW", "REJECTED", "SUSPENDED"].includes(status) ? (
        <form
          action={action}
          className="flex flex-wrap items-end gap-3"
          onSubmit={confirmSubmission(t("confirmArchive"))}
        >
          <Envelope action="archive" contextOrganizationId={contextOrganizationId} expectedVersion={expectedVersion} idempotencyKey={idempotencyKeys.archive} storeId={storeId} />
          <Field label={t("archiveReason")} name="reason" required maxLength={500} />
          <Button type="submit" variant="destructive" disabled={pending}>{t("archive")}</Button>
        </form>
      ) : null}
      <p aria-live="polite" className={state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{state.message}</p>
    </div>
  );
}

function confirmSubmission(message: string) {
  return (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) event.preventDefault();
  };
}

function Envelope(props: {
  action: string;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  storeId: string;
}) {
  return <>
    <input type="hidden" name="action" value={props.action} />
    <input type="hidden" name="contextOrganizationId" value={props.contextOrganizationId} />
    <input type="hidden" name="expectedVersion" value={props.expectedVersion} />
    <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
    <input type="hidden" name="storeId" value={props.storeId} />
  </>;
}

function FulfillmentSection(props: {
  area?: string | null;
  city?: string | null;
  details?: string | null;
  disabled?: boolean;
  enabled?: boolean;
  instructions?: string | null;
  prefix: "delivery" | "pickup";
  street?: string | null;
}) {
  const t = useTranslations("Commerce");
  return (
    <fieldset className="grid gap-4 rounded-xl border p-4 md:grid-cols-2" disabled={props.disabled}>
      <legend className="px-2 font-semibold">{t(`${props.prefix}.title`)}</legend>
      <label className="flex items-center gap-2 md:col-span-2">
        <input type="checkbox" name={`${props.prefix}Enabled`} defaultChecked={props.enabled} />
        {t(`${props.prefix}.enabled`)}
      </label>
      <Field label={t("fields.city")} name={`${props.prefix}City`} defaultValue={props.city ?? ""} />
      <Field label={t("fields.area")} name={`${props.prefix}Area`} defaultValue={props.area ?? ""} />
      {props.prefix === "pickup" ? <>
        <Field label={t("fields.street")} name="pickupStreet" defaultValue={props.street ?? ""} />
        <Field label={t("fields.details")} name="pickupAdditionalDetails" defaultValue={props.details ?? ""} />
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="pickup-instructions">{t("fields.instructions")}</Label>
          <Textarea id="pickup-instructions" name="pickupInstructions" defaultValue={props.instructions ?? ""} maxLength={1000} />
        </div>
      </> : null}
    </fieldset>
  );
}

function Field({ label, name, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const id = `commerce-${name}`;
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} name={name} {...props} />
  </div>;
}
