"use client";

import { useActionState } from "react";
import type { MenuCategory, MenuItem, RestaurantTable } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  createMenuCategory,
  createMenuItem,
  createRestaurantTable,
  initialRestaurantActionState,
  updateMenuCategory,
  updateMenuItem,
  updateRestaurantTable,
} from "@/features/restaurants/actions/manage-restaurant";

export function RestaurantTableForm({
  branches,
  table,
}: {
  branches: Array<{ id: string; name: string }>;
  table?: RestaurantTable;
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
      <Field name="name" label="Name" defaultValue={table?.name} required />
      <Field name="code" label="Code" defaultValue={table?.code ?? ""} />
      <Field
        name="capacity"
        label="Capacity"
        type="number"
        min="1"
        defaultValue={table?.capacity ?? 2}
        required
      />
      <div className="space-y-2">
        <Label htmlFor={`branch-${table?.id ?? "new"}`}>Branch</Label>
        <select
          id={`branch-${table?.id ?? "new"}`}
          name="branchId"
          defaultValue={table?.branchId ?? ""}
          className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
        >
          <option value="">All branches</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </div>
      <Field name="area" label="Area" defaultValue={table?.area ?? ""} />
      <Field name="floor" label="Floor" defaultValue={table?.floor ?? ""} />
      <Field
        name="positionLabel"
        label="Position"
        defaultValue={table?.positionLabel ?? ""}
      />
      <SwitchField
        name="isActive"
        label="Active"
        defaultChecked={table?.isActive ?? true}
      />
      <SubmitState pending={pending} state={state} />
    </form>
  );
}

export function MenuCategoryForm({ category }: { category?: MenuCategory }) {
  const action = category
    ? updateMenuCategory.bind(null, category.id)
    : createMenuCategory;
  const [state, formAction, pending] = useActionState(
    action,
    initialRestaurantActionState,
  );

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <Field name="name" label="Name" defaultValue={category?.name} required />
      <Field
        name="sortOrder"
        label="Sort order"
        type="number"
        min="0"
        defaultValue={category?.sortOrder ?? 0}
      />
      <div className="space-y-2 md:col-span-2">
        <Label>Description</Label>
        <Input name="description" defaultValue={category?.description ?? ""} />
      </div>
      <SwitchField
        name="isActive"
        label="Active"
        defaultChecked={category?.isActive ?? true}
      />
      <SubmitState pending={pending} state={state} />
    </form>
  );
}

export function MenuItemForm({
  categories,
  item,
}: {
  categories: MenuCategory[];
  item?: MenuItem;
}) {
  const action = item ? updateMenuItem.bind(null, item.id) : createMenuItem;
  const [state, formAction, pending] = useActionState(
    action,
    initialRestaurantActionState,
  );

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Category</Label>
        <select
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
      <Field name="name" label="Name" defaultValue={item?.name} required />
      <Field
        name="price"
        label="Price"
        type="number"
        min="1"
        step="0.01"
        defaultValue={item?.price.toString() ?? ""}
        required
      />
      <Field
        name="currency"
        label="Currency"
        defaultValue={item?.currency ?? "IQD"}
        required
      />
      <Field
        name="preparationMinutes"
        label="Preparation minutes"
        type="number"
        min="1"
        defaultValue={item?.preparationMinutes ?? ""}
      />
      <Field
        name="sortOrder"
        label="Sort order"
        type="number"
        min="0"
        defaultValue={item?.sortOrder ?? 0}
      />
      <div className="space-y-2 md:col-span-2">
        <Label>Description</Label>
        <Input name="description" defaultValue={item?.description ?? ""} />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Image URL</Label>
        <Input name="imageUrl" defaultValue={item?.imageUrl ?? ""} />
      </div>
      <SwitchField
        name="isAvailable"
        label="Available"
        defaultChecked={item?.isAvailable ?? true}
      />
      <SubmitState pending={pending} state={state} />
    </form>
  );
}

function Field({
  label,
  ...props
}: React.ComponentProps<typeof Input> & { label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input {...props} />
    </div>
  );
}

function SwitchField({
  defaultChecked,
  label,
  name,
}: {
  defaultChecked: boolean;
  label: string;
  name: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border p-3">
      <Label>{label}</Label>
      <Switch name={name} defaultChecked={defaultChecked} />
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
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {state.message ? (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      ) : null}
    </div>
  );
}
