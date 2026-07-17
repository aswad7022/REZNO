"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CommerceActionState } from "@/features/commerce/actions/action-state";
import { merchantInventoryAction } from "@/features/commerce/actions/manage-products-inventory";

const INITIAL: CommerceActionState = { message: "", ok: false };

export function MerchantInventoryForms({
  contextOrganizationId,
  idempotencyKeys,
  inventory,
}: {
  contextOrganizationId: string;
  idempotencyKeys: { adjust: string; threshold: string };
  inventory: { id: string; lowStockThreshold: number | null; version: number };
}) {
  const t = useTranslations("Commerce");
  const [state, action, pending] = useActionState(merchantInventoryAction, INITIAL);
  return <div className="grid gap-4 md:grid-cols-2">
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <Envelope contextOrganizationId={contextOrganizationId} idempotencyKey={idempotencyKeys.adjust} inventory={inventory} operation="adjust" />
      <Field label={t("inventoryDelta")} name="quantityDelta" type="number" required />
      <Field label={t("inventoryReason")} name="reason" required minLength={2} maxLength={500} />
      <Button type="submit" disabled={pending}>{t("adjustInventory")}</Button>
    </form>
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <Envelope contextOrganizationId={contextOrganizationId} idempotencyKey={idempotencyKeys.threshold} inventory={inventory} operation="threshold" />
      <Field label={t("lowStockThreshold")} name="lowStockThreshold" type="number" min={0} defaultValue={inventory.lowStockThreshold ?? ""} />
      <Button type="submit" disabled={pending}>{t("saveThreshold")}</Button>
    </form>
    <p aria-live="polite" className={state.ok ? "text-sm text-emerald-700 md:col-span-2" : "text-sm text-destructive md:col-span-2"}>{state.message}</p>
  </div>;
}

function Envelope({ contextOrganizationId, idempotencyKey, inventory, operation }: {
  contextOrganizationId: string;
  idempotencyKey: string;
  inventory: { id: string; version: number };
  operation: string;
}) {
  return <>
    <input type="hidden" name="contextOrganizationId" value={contextOrganizationId} />
    <input type="hidden" name="expectedVersion" value={inventory.version} />
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <input type="hidden" name="inventoryItemId" value={inventory.id} />
    <input type="hidden" name="operation" value={operation} />
  </>;
}

function Field({ label, name, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const id = `inventory-${name}`;
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} {...props} /></div>;
}
