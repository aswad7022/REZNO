"use server";

import { revalidatePath } from "next/cache";

import { actionError, type CommerceActionState } from "@/features/commerce/actions/action-state";
import {
  createAdminCategory,
  transitionAdminCategory,
  updateAdminCategory,
} from "@/features/commerce/services/admin-category-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";
import { correctAdminInventory } from "@/features/commerce/services/admin-inventory-service";
import { moderateAdminProduct } from "@/features/commerce/services/admin-product-service";
import { interveneAdminOrder } from "@/features/commerce/services/order-service";

export async function adminCategoryCreateAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  if (!only(formData, ["categoryId", "displayOrder", "idempotencyKey", "name", "slug"])) return invalid();
  try {
    await createAdminCategory(await requireAuthenticatedCommerceAdmin("COMMERCE_CATALOG_MODERATE"), {
      categoryId: field(formData, "categoryId"),
      displayOrder: numberField(formData, "displayOrder"),
      idempotencyKey: field(formData, "idempotencyKey"),
      name: field(formData, "name"),
      slug: field(formData, "slug"),
    });
    refreshCategory();
    return { message: "تم إنشاء الفئة.", ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function adminCategoryUpdateAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  if (!only(formData, ["categoryId", "displayOrder", "expectedVersion", "idempotencyKey", "name", "slug"])) return invalid();
  try {
    const categoryId = field(formData, "categoryId");
    await updateAdminCategory(await requireAuthenticatedCommerceAdmin("COMMERCE_CATALOG_MODERATE"), {
      categoryId,
      displayOrder: numberField(formData, "displayOrder"),
      expectedVersion: field(formData, "expectedVersion"),
      idempotencyKey: field(formData, "idempotencyKey"),
      name: field(formData, "name"),
      slug: field(formData, "slug"),
    });
    refreshCategory(categoryId);
    return { message: "تم تحديث الفئة.", ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function adminCategoryTransitionAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  if (!only(formData, ["action", "categoryId", "confirmPublishedImpact", "expectedVersion", "idempotencyKey", "reason"])) return invalid();
  try {
    const categoryId = field(formData, "categoryId");
    await transitionAdminCategory(await requireAuthenticatedCommerceAdmin("COMMERCE_CATALOG_MODERATE"), {
      action: field(formData, "action"),
      categoryId,
      confirmPublishedImpact: field(formData, "confirmPublishedImpact") === "true",
      expectedVersion: field(formData, "expectedVersion"),
      idempotencyKey: field(formData, "idempotencyKey"),
      reason: field(formData, "reason"),
    });
    refreshCategory(categoryId);
    return { message: "تم تحديث دورة حياة الفئة.", ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function adminProductModerationAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  if (!only(formData, ["action", "expectedVersion", "idempotencyKey", "productId", "reason"])) return invalid();
  try {
    const productId = field(formData, "productId");
    await moderateAdminProduct(await requireAuthenticatedCommerceAdmin("COMMERCE_CATALOG_MODERATE"), {
      action: field(formData, "action"),
      expectedVersion: field(formData, "expectedVersion"),
      idempotencyKey: field(formData, "idempotencyKey"),
      productId,
      reason: field(formData, "reason"),
    });
    revalidatePath("/admin/commerce/products");
    revalidatePath(`/admin/commerce/products/${productId}`);
    return { message: "تم تحديث حالة المنتج.", ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function adminInventoryCorrectionAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  if (!only(formData, ["expectedVersion", "idempotencyKey", "inventoryItemId", "quantityDelta", "reason"])) return invalid();
  try {
    const inventoryItemId = field(formData, "inventoryItemId");
    await correctAdminInventory(await requireAuthenticatedCommerceAdmin("COMMERCE_INVENTORY_MANAGE"), {
      expectedVersion: numberField(formData, "expectedVersion"),
      idempotencyKey: field(formData, "idempotencyKey"),
      inventoryItemId,
      quantityDelta: numberField(formData, "quantityDelta"),
      reason: field(formData, "reason"),
    });
    revalidatePath("/admin/commerce/inventory");
    revalidatePath(`/admin/commerce/inventory/${inventoryItemId}`);
    return { message: "تم تسجيل تصحيح المخزون.", ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function adminOrderInterventionAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  if (!only(formData, ["action", "expectedVersion", "idempotencyKey", "orderId", "reason", "returnedStock"])) return invalid();
  try {
    const orderId = field(formData, "orderId");
    await interveneAdminOrder(await requireAuthenticatedCommerceAdmin("COMMERCE_ORDERS_MANAGE"), {
      action: field(formData, "action") as "cancel" | "expire",
      expectedVersion: field(formData, "expectedVersion"),
      idempotencyKey: field(formData, "idempotencyKey"),
      orderId,
      reason: field(formData, "reason"),
      returnedStock: field(formData, "returnedStock") === "true",
    });
    revalidatePath("/admin/commerce/orders");
    revalidatePath(`/admin/commerce/orders/${orderId}`);
    return { message: "تم تنفيذ التدخل الإداري.", ok: true };
  } catch (error) {
    return actionError(error);
  }
}

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function numberField(formData: FormData, key: string) {
  const value = Number(field(formData, key));
  return Number.isFinite(value) ? value : Number.NaN;
}

function only(formData: FormData, allowed: string[]) {
  const values = new Set(allowed);
  return [...formData.keys()].every((key) => key.startsWith("$ACTION_") || values.has(key));
}

function invalid(): CommerceActionState {
  return { code: "VALIDATION_ERROR", message: "بيانات العملية غير صالحة.", ok: false };
}

function refreshCategory(categoryId?: string) {
  revalidatePath("/admin/commerce");
  revalidatePath("/admin/commerce/categories");
  if (categoryId) revalidatePath(`/admin/commerce/categories/${categoryId}`);
}
