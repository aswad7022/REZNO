"use client";

import { useActionState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CommerceActionState } from "@/features/commerce/actions/action-state";
import {
  merchantProductLifecycleAction,
  merchantVariantAction,
  saveMerchantProductAction,
} from "@/features/commerce/actions/manage-products-inventory";

const INITIAL: CommerceActionState = { message: "", ok: false };

export interface ProductEditorValue {
  category: { id: string };
  description: string | null;
  expectedVersion: string;
  id: string;
  media: Array<{ altText: string | null; id: string; url: string; variantId: string | null }>;
  name: string;
  permittedActions: {
    addMedia: boolean;
    archive: boolean;
    createVariant: boolean;
    publish: boolean;
    unpublish: boolean;
    update: boolean;
  };
  slug: string;
  status: string;
  unsafeMediaIds: string[];
  variants: Array<{
    archivedAt: string | null;
    compareAtPrice: string | null;
    id: string;
    isDefault: boolean;
    optionValues: unknown;
    price: string;
    sku: string;
    status: string;
    title: string;
  }>;
}

export function MerchantProductForm({
  categories,
  contextOrganizationId,
  idempotencyKey,
  product,
}: {
  categories: Array<{ id: string; name: string }>;
  contextOrganizationId: string;
  idempotencyKey: string;
  product?: ProductEditorValue;
}) {
  const t = useTranslations("Commerce");
  const [state, action, pending] = useActionState(saveMerchantProductAction, INITIAL);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="mode" value={product ? "update" : "create"} />
    <input type="hidden" name="contextOrganizationId" value={contextOrganizationId} />
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    {product ? <>
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="expectedVersion" value={product.expectedVersion} />
    </> : null}
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={t("productFields.name")} name="name" defaultValue={product?.name} required minLength={2} maxLength={160} />
      <Field label={t("productFields.slug")} name="slug" defaultValue={product?.slug} required dir="ltr" maxLength={100} />
      <div className="space-y-2">
        <Label htmlFor="commerce-categoryId">{t("productFields.category")}</Label>
        <select id="commerce-categoryId" name="categoryId" defaultValue={product?.category.id} required className="h-9 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">{t("selectCategory")}</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="commerce-product-description">{t("productFields.description")}</Label>
        <Textarea id="commerce-product-description" name="description" defaultValue={product?.description ?? ""} maxLength={8000} />
      </div>
      {!product ? <VariantProfileFields /> : null}
    </div>
    <Result state={state} />
    <Button type="submit" disabled={pending || Boolean(product && !product.permittedActions.update)}>{pending ? t("saving") : t("saveProduct")}</Button>
  </form>;
}

export function ProductLifecycleForms({ contextOrganizationId, idempotencyKeys, product }: {
  contextOrganizationId: string;
  idempotencyKeys: readonly string[];
  product: ProductEditorValue;
}) {
  const t = useTranslations("Commerce");
  const [state, action, pending] = useActionState(merchantProductLifecycleAction, INITIAL);
  const operations: Array<"archive" | "publish" | "unpublish" | null> = [
    product.permittedActions.publish ? "publish" : null,
    product.permittedActions.unpublish ? "unpublish" : null,
    product.permittedActions.archive ? "archive" : null,
  ];
  const available = operations.filter((value): value is "archive" | "publish" | "unpublish" => Boolean(value));
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-3">
      {available.map((operation, index) => <form action={action} key={operation}>
        <AggregateEnvelope contextOrganizationId={contextOrganizationId} expectedVersion={product.expectedVersion} idempotencyKey={keyAt(idempotencyKeys, index)} productId={product.id} />
        <input type="hidden" name="operation" value={operation} />
        <Button type="submit" variant={operation === "archive" ? "destructive" : "default"} disabled={pending}>{t(`productActions.${operation}`)}</Button>
      </form>)}
    </div>
    <Result state={state} />
  </div>;
}

export function ProductVariantForms({ contextOrganizationId, idempotencyKeys, product }: {
  contextOrganizationId: string;
  idempotencyKeys: readonly string[];
  product: ProductEditorValue;
}) {
  const t = useTranslations("Commerce");
  const [state, action, pending] = useActionState(merchantVariantAction, INITIAL);
  return <div className="space-y-5">
    {product.variants.map((variant, index) => <fieldset key={variant.id} className="space-y-3 rounded-xl border p-4">
      <legend className="px-2 font-semibold">{variant.title} · {variant.sku}</legend>
      {variant.status === "ARCHIVED" ? <form action={action} className="flex items-center gap-3">
        <VariantEnvelope contextOrganizationId={contextOrganizationId} idempotencyKey={keyAt(idempotencyKeys, index * 3)} product={product} variantId={variant.id} operation="restore" />
        <label className="flex items-center gap-2"><input name="makeDefault" type="checkbox" />{t("makeDefault")}</label>
        <Button type="submit" disabled={pending}>{t("productActions.restore")}</Button>
      </form> : <>
        <form action={action} className="grid gap-3 md:grid-cols-2">
          <VariantEnvelope contextOrganizationId={contextOrganizationId} idempotencyKey={keyAt(idempotencyKeys, index * 3)} product={product} variantId={variant.id} operation="update" />
          <VariantProfileFields value={variant} />
          <Button className="w-fit" type="submit" disabled={pending}>{t("productActions.updateVariant")}</Button>
        </form>
        <div className="flex flex-wrap gap-3">
          {!variant.isDefault ? <form action={action}>
            <VariantEnvelope contextOrganizationId={contextOrganizationId} idempotencyKey={keyAt(idempotencyKeys, index * 3 + 1)} product={product} variantId={variant.id} operation="default" />
            <Button type="submit" variant="outline" disabled={pending}>{t("makeDefault")}</Button>
          </form> : null}
          <form action={action} className="flex flex-wrap gap-2">
            <VariantEnvelope contextOrganizationId={contextOrganizationId} idempotencyKey={keyAt(idempotencyKeys, index * 3 + 2)} product={product} variantId={variant.id} operation="archive" />
            {variant.isDefault ? <select name="replacementVariantId" aria-label={t("replacementVariant")} className="h-9 rounded-md border bg-background px-3 text-sm" required>
              <option value="">{t("replacementVariant")}</option>
              {product.variants.filter((item) => item.id !== variant.id && item.status === "ACTIVE" && !item.archivedAt).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
            </select> : null}
            <Button type="submit" variant="destructive" disabled={pending}>{t("productActions.archiveVariant")}</Button>
          </form>
        </div>
      </>}
    </fieldset>)}
    {product.permittedActions.createVariant ? <form action={action} className="grid gap-3 rounded-xl border p-4 md:grid-cols-2">
      <VariantEnvelope contextOrganizationId={contextOrganizationId} idempotencyKey={keyAt(idempotencyKeys, product.variants.length * 3)} product={product} operation="create" />
      <h3 className="font-semibold md:col-span-2">{t("addVariant")}</h3>
      <VariantProfileFields />
      <Button className="w-fit" type="submit" disabled={pending}>{t("addVariant")}</Button>
    </form> : null}
    <Result state={state} />
  </div>;
}

function VariantProfileFields({ value }: { value?: ProductEditorValue["variants"][number] }) {
  const t = useTranslations("Commerce");
  return <>
    <Field label={t("productFields.variantTitle")} name="title" defaultValue={value?.title ?? ""} required maxLength={160} />
    <Field label={t("productFields.sku")} name="sku" defaultValue={value?.sku ?? ""} required dir="ltr" maxLength={80} />
    <Field label={t("productFields.price")} name="price" defaultValue={value?.price ?? ""} required inputMode="numeric" />
    <Field label={t("productFields.compareAtPrice")} name="compareAtPrice" defaultValue={value?.compareAtPrice ?? ""} inputMode="numeric" />
    <div className="space-y-2 md:col-span-2">
      <Label htmlFor={`commerce-options-${value?.id ?? "new"}`}>{t("productFields.options")}</Label>
      <Textarea id={`commerce-options-${value?.id ?? "new"}`} name="optionValues" defaultValue={JSON.stringify(value?.optionValues ?? {}, null, 2)} dir="ltr" required />
    </div>
  </>;
}

function VariantEnvelope({ contextOrganizationId, idempotencyKey, operation, product, variantId }: {
  contextOrganizationId: string;
  idempotencyKey: string;
  operation: string;
  product: ProductEditorValue;
  variantId?: string;
}) {
  return <>
    <AggregateEnvelope contextOrganizationId={contextOrganizationId} expectedVersion={product.expectedVersion} idempotencyKey={idempotencyKey} productId={product.id} />
    <input type="hidden" name="operation" value={operation} />
    {variantId ? <input type="hidden" name="variantId" value={variantId} /> : null}
  </>;
}

function AggregateEnvelope(props: { contextOrganizationId: string; expectedVersion: string; idempotencyKey: string; productId: string }) {
  return <>
    <input type="hidden" name="contextOrganizationId" value={props.contextOrganizationId} />
    <input type="hidden" name="expectedVersion" value={props.expectedVersion} />
    <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
    <input type="hidden" name="productId" value={props.productId} />
  </>;
}

function Field({ label, name, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const id = `commerce-${name}-${props.defaultValue ?? "new"}`;
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} name={name} {...props} />
  </div>;
}

function Result({ state }: { state: CommerceActionState }) {
  return <p aria-live="polite" className={state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>{state.message}</p>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}

function keyAt(keys: readonly string[], index: number) {
  const value = keys[index];
  if (!value) throw new Error("Missing server-issued Commerce mutation key.");
  return value;
}
