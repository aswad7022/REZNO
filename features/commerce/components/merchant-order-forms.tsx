"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CommerceActionState } from "@/features/commerce/actions/action-state";
import { merchantOrderAction } from "@/features/commerce/actions/manage-orders";
import type { MerchantOrderAction } from "@/features/commerce/domain/order-input";

const INITIAL: CommerceActionState = { message: "", ok: false };
const ACTION_LABELS = {
  cancel: "orderAction_cancel",
  confirm: "orderAction_confirm",
  delivery_failed: "orderAction_delivery_failed",
  finalize_delivery: "orderAction_finalize_delivery",
  finalize_pickup: "orderAction_finalize_pickup",
  out_for_delivery: "orderAction_out_for_delivery",
  ready_for_pickup: "orderAction_ready_for_pickup",
  reject: "orderAction_reject",
  retry_delivery: "orderAction_retry_delivery",
  start_preparing: "orderAction_start_preparing",
} as const satisfies Record<MerchantOrderAction, string>;

export function MerchantOrderForms({
  allowedActions,
  expectedVersion,
  idempotencyKeys,
  orderId,
  fulfillmentStatus,
}: {
  allowedActions: MerchantOrderAction[];
  expectedVersion: string;
  idempotencyKeys: Record<string, string>;
  orderId: string;
  fulfillmentStatus: string;
}) {
  const t = useTranslations("Commerce");
  const [state, action, pending] = useActionState(merchantOrderAction, INITIAL);
  return <section className="space-y-4" aria-labelledby="order-actions-title">
    <h2 className="text-lg font-semibold" id="order-actions-title">{t("orderActions")}</h2>
    <div className="grid gap-4 md:grid-cols-2">
      {allowedActions.map((operation) => {
        const reasonRequired = operation === "reject" || operation === "cancel" || operation === "delivery_failed";
        const dangerous = operation === "reject" || operation === "cancel" || operation.startsWith("finalize_");
        return <form
          action={action}
          className="space-y-3 rounded-xl border p-4"
          key={operation}
          onSubmit={(event) => {
            if (dangerous && !window.confirm(t("orderActionConfirmation"))) event.preventDefault();
          }}
        >
          <input name="action" type="hidden" value={operation} />
          <input name="expectedVersion" type="hidden" value={expectedVersion} />
          <input name="idempotencyKey" type="hidden" value={idempotencyKeys[operation]} />
          <input name="orderId" type="hidden" value={orderId} />
          <h3 className="font-medium">{t(ACTION_LABELS[operation])}</h3>
          {reasonRequired ? <div className="space-y-2">
            <Label htmlFor={`order-reason-${operation}`}>{t("orderReason")}</Label>
            <Input id={`order-reason-${operation}`} maxLength={500} minLength={2} name="reason" required />
          </div> : null}
          {operation === "cancel" && fulfillmentStatus === "DELIVERY_FAILED" ? <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" name="returnedStock" type="checkbox" />
            <span>{t("returnedStockConfirmation")}</span>
          </label> : null}
          <Button
            disabled={pending}
            type="submit"
            variant={dangerous ? "destructive" : "default"}
          >{t(ACTION_LABELS[operation])}</Button>
        </form>;
      })}
    </div>
    <p aria-live="polite" className={state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{state.message}</p>
  </section>;
}
