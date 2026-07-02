"use server";

import { revalidatePath } from "next/cache";

import { canManageOrganization } from "@/features/business/policies/access";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { requireBusinessIdentity } from "@/features/identity/server";
import {
  menuCategorySchema,
  menuItemSchema,
  restaurantTableSchema,
} from "@/features/restaurants/schemas/restaurant";
import { prisma } from "@/lib/db/prisma";

export interface RestaurantActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const initialRestaurantActionState: RestaurantActionState = {
  status: "idle",
};

async function requireWritableRestaurant() {
  const identity = await requireBusinessIdentity();
  if (
    !canManageOrganization(identity.membership.role.systemRole) ||
    !isRestaurantVertical(identity.membership.organization.vertical)
  ) {
    return { error: { status: "error", message: "forbidden" } as const };
  }
  return { identity };
}

async function branchBelongsToRestaurant(
  branchId: string | null,
  organizationId: string,
) {
  if (!branchId) return true;
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return Boolean(branch);
}

async function menuCategoryBelongsToRestaurant(
  categoryId: string,
  organizationId: string,
) {
  const category = await prisma.menuCategory.findFirst({
    where: { id: categoryId, businessId: organizationId },
    select: { id: true },
  });
  return Boolean(category);
}

export async function createRestaurantTable(
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const context = await requireWritableRestaurant();
  if (context.error) return context.error;
  const parsed = restaurantTableSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "invalid" };
  if (
    !(await branchBelongsToRestaurant(
      parsed.data.branchId,
      context.identity.membership.organizationId,
    ))
  ) {
    return { status: "error", message: "invalidReferences" };
  }

  await prisma.restaurantTable.create({
    data: {
      ...parsed.data,
      businessId: context.identity.membership.organizationId,
    },
  });
  revalidatePath("/business/tables");
  return { status: "success", message: "saved" };
}

export async function updateRestaurantTable(
  tableId: string,
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const context = await requireWritableRestaurant();
  if (context.error) return context.error;
  const parsed = restaurantTableSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "invalid" };
  if (
    !(await branchBelongsToRestaurant(
      parsed.data.branchId,
      context.identity.membership.organizationId,
    ))
  ) {
    return { status: "error", message: "invalidReferences" };
  }

  await prisma.restaurantTable.updateMany({
    where: {
      id: tableId,
      businessId: context.identity.membership.organizationId,
    },
    data: parsed.data,
  });
  revalidatePath("/business/tables");
  return { status: "success", message: "saved" };
}

export async function createMenuCategory(
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const context = await requireWritableRestaurant();
  if (context.error) return context.error;
  const parsed = menuCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "invalid" };

  await prisma.menuCategory.create({
    data: {
      ...parsed.data,
      businessId: context.identity.membership.organizationId,
    },
  });
  revalidatePath("/business/menu");
  return { status: "success", message: "saved" };
}

export async function updateMenuCategory(
  categoryId: string,
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const context = await requireWritableRestaurant();
  if (context.error) return context.error;
  const parsed = menuCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "invalid" };

  await prisma.menuCategory.updateMany({
    where: {
      id: categoryId,
      businessId: context.identity.membership.organizationId,
    },
    data: parsed.data,
  });
  revalidatePath("/business/menu");
  return { status: "success", message: "saved" };
}

export async function createMenuItem(
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const context = await requireWritableRestaurant();
  if (context.error) return context.error;
  const parsed = menuItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "invalid" };
  if (
    !(await menuCategoryBelongsToRestaurant(
      parsed.data.menuCategoryId,
      context.identity.membership.organizationId,
    ))
  ) {
    return { status: "error", message: "invalidReferences" };
  }

  await prisma.menuItem.create({
    data: {
      ...parsed.data,
      businessId: context.identity.membership.organizationId,
    },
  });
  revalidatePath("/business/menu");
  return { status: "success", message: "saved" };
}

export async function updateMenuItem(
  itemId: string,
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const context = await requireWritableRestaurant();
  if (context.error) return context.error;
  const parsed = menuItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "invalid" };
  if (
    !(await menuCategoryBelongsToRestaurant(
      parsed.data.menuCategoryId,
      context.identity.membership.organizationId,
    ))
  ) {
    return { status: "error", message: "invalidReferences" };
  }

  await prisma.menuItem.updateMany({
    where: {
      id: itemId,
      businessId: context.identity.membership.organizationId,
    },
    data: parsed.data,
  });
  revalidatePath("/business/menu");
  return { status: "success", message: "saved" };
}
