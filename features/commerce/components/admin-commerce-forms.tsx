"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CommerceActionState } from "@/features/commerce/actions/action-state";
import {
  adminCategoryCreateAction,
  adminCategoryTransitionAction,
  adminCategoryUpdateAction,
  adminInventoryCorrectionAction,
  adminOrderInterventionAction,
  adminProductModerationAction,
} from "@/features/commerce/actions/manage-admin-commerce";

const INITIAL: CommerceActionState = { message: "", ok: false };

export function AdminCategoryForm(props: {
  categoryId: string;
  displayOrder?: number;
  expectedVersion?: string;
  idempotencyKey: string;
  name?: string;
  slug?: string;
}) {
  const mutation = props.expectedVersion ? adminCategoryUpdateAction : adminCategoryCreateAction;
  const [state, action, pending] = useActionState(mutation, INITIAL);
  return <form action={action} className="space-y-4 rounded-xl border p-4">
    <input type="hidden" name="categoryId" value={props.categoryId} />
    <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
    {props.expectedVersion ? <input type="hidden" name="expectedVersion" value={props.expectedVersion} /> : null}
    <Field label="اسم الفئة" name="name" defaultValue={props.name} minLength={2} maxLength={120} />
    <Field label="المعرّف النصي" name="slug" defaultValue={props.slug} dir="ltr" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={100} />
    <Field label="ترتيب العرض" name="displayOrder" defaultValue={String(props.displayOrder ?? 0)} type="number" min={-1000000} max={1000000} />
    <SubmitState state={state} pending={pending} label={props.expectedVersion ? "حفظ التحديث" : "إنشاء الفئة"} />
  </form>;
}

export function AdminCategoryTransitionForm(props: {
  action: "archive" | "deactivate" | "reactivate";
  categoryId: string;
  expectedVersion: string;
  idempotencyKey: string;
  publishedImpact: boolean;
}) {
  const [state, action, pending] = useActionState(adminCategoryTransitionAction, INITIAL);
  return <form action={action} className="space-y-3 rounded-xl border p-4">
    <input type="hidden" name="action" value={props.action} />
    <input type="hidden" name="categoryId" value={props.categoryId} />
    <input type="hidden" name="expectedVersion" value={props.expectedVersion} />
    <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
    <Field label="سبب التغيير" name="reason" minLength={2} maxLength={500} />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmPublishedImpact" value="true" required={props.publishedImpact} /> أؤكد أثر المنتجات المنشورة</label>
    <SubmitState state={state} pending={pending} label={props.action} destructive={props.action !== "reactivate"} />
  </form>;
}

export function AdminProductModerationForm(props: {
  action: "clear" | "suspend";
  expectedVersion: string;
  idempotencyKey: string;
  productId: string;
}) {
  const [state, action, pending] = useActionState(adminProductModerationAction, INITIAL);
  return <form action={action} className="space-y-3 rounded-xl border p-4">
    <input type="hidden" name="action" value={props.action} />
    <input type="hidden" name="expectedVersion" value={props.expectedVersion} />
    <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
    <input type="hidden" name="productId" value={props.productId} />
    <Field label="سبب المراجعة" name="reason" minLength={2} maxLength={1000} />
    <SubmitState state={state} pending={pending} label={props.action === "suspend" ? "تعليق المنتج" : "إعادة المنتج لمسودة"} destructive={props.action === "suspend"} />
  </form>;
}

export function AdminInventoryCorrectionForm(props: { expectedVersion: number; idempotencyKey: string; inventoryItemId: string }) {
  const [state, action, pending] = useActionState(adminInventoryCorrectionAction, INITIAL);
  return <form action={action} className="space-y-3 rounded-xl border p-4">
    <input type="hidden" name="expectedVersion" value={props.expectedVersion} />
    <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
    <input type="hidden" name="inventoryItemId" value={props.inventoryItemId} />
    <Field label="التغيير الموقّع" name="quantityDelta" type="number" min={-2147483647} max={2147483647} />
    <Field label="سبب التصحيح" name="reason" minLength={2} maxLength={500} />
    <SubmitState state={state} pending={pending} label="تسجيل التصحيح" destructive />
  </form>;
}

export function AdminOrderInterventionForm(props: {
  action: "cancel" | "expire";
  expectedVersion: string;
  idempotencyKey: string;
  orderId: string;
  returnedStockRequired?: boolean;
}) {
  const [state, action, pending] = useActionState(adminOrderInterventionAction, INITIAL);
  return <form action={action} className="space-y-3 rounded-xl border p-4">
    <input type="hidden" name="action" value={props.action} />
    <input type="hidden" name="expectedVersion" value={props.expectedVersion} />
    <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
    <input type="hidden" name="orderId" value={props.orderId} />
    <Field label="سبب التدخل" name="reason" minLength={2} maxLength={500} />
    {props.action === "cancel" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="returnedStock" value="true" required={props.returnedStockRequired} /> تأكيد عودة المخزون فعليًا</label> : <input type="hidden" name="returnedStock" value="false" />}
    <SubmitState state={state} pending={pending} label={props.action === "expire" ? "إنهاء الطلب المتأخر" : "إلغاء الطلب إداريًا"} destructive />
  </form>;
}

function Field(props: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const id = `admin-commerce-${props.name}`;
  const { label, ...input } = props;
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input {...input} id={id} name={props.name} required /></div>;
}

function SubmitState(props: { destructive?: boolean; label: string; pending: boolean; state: CommerceActionState }) {
  return <div className="space-y-2"><Button disabled={props.pending} type="submit" variant={props.destructive ? "destructive" : "default"}>{props.pending ? "جارٍ التنفيذ…" : props.label}</Button><p aria-live="polite" className={props.state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{props.state.message}</p></div>;
}
