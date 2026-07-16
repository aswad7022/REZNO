"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createMenuCategory,
  createMenuItem,
  createRestaurantTable,
  removeMenuCategory,
  removeMenuItem,
  removeRestaurantTable,
  setMenuCategoryActive,
  setMenuItemAvailable,
  setRestaurantTableActive,
  updateMenuCategory,
  updateMenuItem,
  updateRestaurantTable,
} from "@/features/restaurants/actions/manage-restaurant";
import type { RestaurantActionState } from "@/features/restaurants/actions/manage-restaurant";

const initialRestaurantActionState: RestaurantActionState = {
  status: "idle",
};

export interface RestaurantTableFormValue {
  area: string | null;
  branch: { id: string; name: string } | null;
  branchId: string | null;
  capacity: number;
  code: string | null;
  floor: string | null;
  id: string;
  name: string;
  positionLabel: string | null;
  version?: string;
}

export interface MenuCategoryFormValue {
  description: string | null;
  id: string;
  isActive: boolean;
  name: string;
  sortOrder: number;
  version?: string;
}

export interface MenuItemFormValue {
  currency: string;
  description: string | null;
  id: string;
  imageUrl: string | null;
  isAvailable: boolean;
  menuCategoryId: string;
  name: string;
  preparationMinutes: number | null;
  price: string;
  sortOrder: number;
  version?: string;
}

interface OperationProps {
  contextOrganizationId: string;
  idempotencyKey: string;
}

export function RestaurantTableForm({
  branches,
  contextOrganizationId,
  idempotencyKey,
  table,
}: OperationProps & {
  branches: Array<{ id: string; name: string }>;
  table?: RestaurantTableFormValue;
}) {
  const action = table
    ? updateRestaurantTable.bind(null, table.id)
    : createRestaurantTable;
  const [state, formAction, pending] = useActionState(
    action,
    initialRestaurantActionState,
  );

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <OperationFields
        contextOrganizationId={contextOrganizationId}
        expectedVersion={state.version ?? table?.version}
        idempotencyKey={state.nextIdempotencyKey ?? idempotencyKey}
      />
      <Field name="name" label="الاسم" defaultValue={table?.name} maxLength={120} required />
      <Field name="code" label="الرمز" defaultValue={table?.code ?? ""} maxLength={40} />
      <Field
        name="capacity"
        label="السعة"
        type="number"
        min="1"
        max="100"
        defaultValue={table?.capacity ?? 2}
        required
      />
      {table ? (
        <div className="space-y-2">
          <Label>الفرع</Label>
          <p className="flex h-10 items-center rounded-xl border bg-muted/50 px-3 text-sm">
            {table.branch?.name ?? "غير محدد"}
          </p>
          <p className="text-xs text-muted-foreground">
            لا يمكن نقل الطاولة إلى فرع آخر بعد إنشائها.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="branch-new">الفرع</Label>
          <select
            id="branch-new"
            name="branchId"
            defaultValue={branches[0]?.id}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
            required
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Field name="area" label="المنطقة" defaultValue={table?.area ?? ""} maxLength={120} />
      <Field name="floor" label="الطابق" defaultValue={table?.floor ?? ""} maxLength={80} />
      <Field
        name="positionLabel"
        label="وصف الموقع"
        defaultValue={table?.positionLabel ?? ""}
        maxLength={120}
      />
      <SubmitState pending={pending} state={state} />
    </form>
  );
}

export function MenuCategoryForm({
  category,
  contextOrganizationId,
  idempotencyKey,
}: OperationProps & { category?: MenuCategoryFormValue }) {
  const action = category
    ? updateMenuCategory.bind(null, category.id)
    : createMenuCategory;
  const [state, formAction, pending] = useActionState(
    action,
    initialRestaurantActionState,
  );

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <OperationFields
        contextOrganizationId={contextOrganizationId}
        expectedVersion={state.version ?? category?.version}
        idempotencyKey={state.nextIdempotencyKey ?? idempotencyKey}
      />
      <Field name="name" label="الاسم" defaultValue={category?.name} maxLength={120} required />
      <Field
        name="sortOrder"
        label="الترتيب"
        type="number"
        min="0"
        max="10000"
        defaultValue={category?.sortOrder ?? 0}
        required
      />
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`category-description-${category?.id ?? "new"}`}>الوصف</Label>
        <Input
          id={`category-description-${category?.id ?? "new"}`}
          name="description"
          maxLength={500}
          defaultValue={category?.description ?? ""}
        />
      </div>
      <SubmitState pending={pending} state={state} />
    </form>
  );
}

export function MenuItemForm({
  categories,
  contextOrganizationId,
  idempotencyKey,
  item,
}: OperationProps & {
  categories: MenuCategoryFormValue[];
  item?: MenuItemFormValue;
}) {
  const action = item ? updateMenuItem.bind(null, item.id) : createMenuItem;
  const [state, formAction, pending] = useActionState(
    action,
    initialRestaurantActionState,
  );

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <OperationFields
        contextOrganizationId={contextOrganizationId}
        expectedVersion={state.version ?? item?.version}
        idempotencyKey={state.nextIdempotencyKey ?? idempotencyKey}
      />
      <div className="space-y-2">
        <Label htmlFor={`item-category-${item?.id ?? "new"}`}>القسم</Label>
        <select
          id={`item-category-${item?.id ?? "new"}`}
          name="menuCategoryId"
          defaultValue={item?.menuCategoryId ?? categories[0]?.id}
          required
          className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <Field name="name" label="الاسم" defaultValue={item?.name} maxLength={160} required />
      <Field
        name="price"
        label="السعر"
        inputMode="decimal"
        pattern="^[0-9]{1,8}(\\.[0-9]{1,2})?$"
        defaultValue={item?.price ?? ""}
        required
      />
      <Field
        name="currency"
        label="العملة"
        pattern="[A-Za-z]{3}"
        maxLength={3}
        defaultValue={item?.currency ?? "IQD"}
        required
      />
      <Field
        name="preparationMinutes"
        label="دقائق التحضير"
        type="number"
        min="1"
        max="1440"
        defaultValue={item?.preparationMinutes ?? ""}
      />
      <Field
        name="sortOrder"
        label="الترتيب"
        type="number"
        min="0"
        max="10000"
        defaultValue={item?.sortOrder ?? 0}
        required
      />
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`item-description-${item?.id ?? "new"}`}>الوصف</Label>
        <Input
          id={`item-description-${item?.id ?? "new"}`}
          name="description"
          maxLength={1000}
          defaultValue={item?.description ?? ""}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`item-image-${item?.id ?? "new"}`}>رابط الصورة</Label>
        <Input
          id={`item-image-${item?.id ?? "new"}`}
          name="imageUrl"
          type="url"
          maxLength={2048}
          defaultValue={item?.imageUrl ?? ""}
        />
      </div>
      <SubmitState pending={pending} state={state} />
    </form>
  );
}

export function RestaurantCatalogLifecycleForm({
  action,
  active,
  contextOrganizationId,
  expectedVersion,
  id,
  idempotencyKey,
  label,
}: OperationProps & {
  action: "table-active" | "table-remove" | "category-active" | "category-remove" | "item-available" | "item-remove";
  active?: boolean;
  expectedVersion: string;
  id: string;
  label: string;
}) {
  const operation =
    action === "table-active"
      ? setRestaurantTableActive.bind(null, id, Boolean(active))
      : action === "table-remove"
        ? removeRestaurantTable.bind(null, id)
        : action === "category-active"
          ? setMenuCategoryActive.bind(null, id, Boolean(active))
          : action === "category-remove"
            ? removeMenuCategory.bind(null, id)
            : action === "item-available"
              ? setMenuItemAvailable.bind(null, id, Boolean(active))
              : removeMenuItem.bind(null, id);
  const [state, formAction, pending] = useActionState(
    operation,
    initialRestaurantActionState,
  );
  return (
    <form action={formAction} className="grid gap-1">
      <OperationFields
        contextOrganizationId={contextOrganizationId}
        expectedVersion={state.version ?? expectedVersion}
        idempotencyKey={state.nextIdempotencyKey ?? idempotencyKey}
      />
      <Button
        type="submit"
        size="sm"
        variant={action.endsWith("remove") ? "destructive" : "outline"}
        disabled={pending || state.status === "success"}
      >
        {pending ? "جارٍ الحفظ…" : label}
      </Button>
      {state.message ? <p aria-live="polite" className="text-xs">{state.message}</p> : null}
    </form>
  );
}

function OperationFields({
  contextOrganizationId,
  expectedVersion,
  idempotencyKey,
}: OperationProps & { expectedVersion?: string }) {
  return (
    <>
      <input type="hidden" name="contextOrganizationId" value={contextOrganizationId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {expectedVersion ? (
        <input type="hidden" name="expectedVersion" value={expectedVersion} />
      ) : null}
    </>
  );
}

function Field({
  label,
  ...props
}: React.ComponentProps<typeof Input> & { label: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id ?? props.name}>{label}</Label>
      <Input id={props.id ?? props.name} {...props} />
    </div>
  );
}

function SubmitState({
  pending,
  state,
}: {
  pending: boolean;
  state: { status: string; message?: string };
}) {
  return (
    <div className="flex items-center gap-3 md:col-span-2">
      <Button type="submit" disabled={pending || state.status === "success"}>
        {pending ? "جارٍ الحفظ…" : "حفظ"}
      </Button>
      {state.message ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">{state.message}</p>
      ) : null}
    </div>
  );
}
