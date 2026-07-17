"use client";

import { useActionState } from "react";

import { adminStoreLifecycleAction } from "@/features/commerce/actions/manage-admin-store";
import type { CommerceActionState } from "@/features/commerce/actions/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: CommerceActionState = { message: "", ok: false };

export function AdminStoreModerationForm(props: {
  action: "approve" | "reactivate" | "reject" | "suspend";
  expectedVersion: string;
  idempotencyKey: string;
  storeId: string;
}) {
  const [state, action, pending] = useActionState(adminStoreLifecycleAction, INITIAL);
  const needsReason = props.action === "reject" || props.action === "suspend";
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-xl border p-3">
      <input type="hidden" name="action" value={props.action} />
      <input type="hidden" name="expectedVersion" value={props.expectedVersion} />
      <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
      <input type="hidden" name="storeId" value={props.storeId} />
      {needsReason ? <div className="min-w-64 flex-1 space-y-2">
        <Label htmlFor={`admin-store-reason-${props.action}`}>السبب</Label>
        <Input id={`admin-store-reason-${props.action}`} name="reason" required minLength={2} maxLength={1000} />
      </div> : <input type="hidden" name="reason" value="" />}
      <Button type="submit" disabled={pending} variant={needsReason ? "destructive" : "default"}>{props.action}</Button>
      <p aria-live="polite" className={state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{state.message}</p>
    </form>
  );
}
