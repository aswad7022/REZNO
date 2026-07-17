"use server";

import { revalidatePath } from "next/cache";

import { actionError, type CommerceActionState } from "@/features/commerce/actions/action-state";
import {
  addMerchantProductMedia,
  archiveMerchantProduct,
  archiveMerchantVariant,
  createMerchantProduct,
  createMerchantVariant,
  publishMerchantProduct,
  removeMerchantProductMedia,
  reorderMerchantProductMedia,
  restoreMerchantVariant,
  setMerchantDefaultVariant,
  unpublishMerchantProduct,
  updateMerchantProduct,
  updateMerchantProductMedia,
  updateMerchantVariant,
} from "@/features/commerce/services/merchant-product-service";
import {
  adjustInventory,
  updateInventoryThreshold,
} from "@/features/commerce/services/inventory-service";
import { requireBusinessIdentity } from "@/features/identity/server";

export async function saveMerchantProductAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  const allowed = [
    "categoryId", "compareAtPrice", "contextOrganizationId", "description", "expectedVersion",
    "idempotencyKey", "mode", "name", "optionValues", "price", "productId", "sku", "slug", "title",
  ];
  if (hasUnknownFields(formData, allowed)) return invalidInput();
  try {
    const common = {
      categoryId: text(formData, "categoryId"),
      contextOrganizationId: text(formData, "contextOrganizationId"),
      description: text(formData, "description"),
      idempotencyKey: text(formData, "idempotencyKey"),
      name: text(formData, "name"),
      slug: text(formData, "slug"),
    };
    const mode = text(formData, "mode");
    if (mode === "create") {
      await createMerchantProduct(await currentReference(), {
        ...common,
        defaultVariant: variantProfile(formData),
      });
    } else if (mode === "update") {
      await updateMerchantProduct(await currentReference(), {
        ...common,
        expectedVersion: text(formData, "expectedVersion"),
        productId: text(formData, "productId"),
      });
    } else return invalidInput();
    revalidateCommerce(text(formData, "productId"));
    return success("تم حفظ المنتج بنجاح.");
  } catch (error) {
    return actionError(error);
  }
}

export async function merchantProductLifecycleAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  const allowed = ["contextOrganizationId", "expectedVersion", "idempotencyKey", "operation", "productId"];
  if (hasUnknownFields(formData, allowed)) return invalidInput();
  try {
    const input = aggregateEnvelope(formData);
    const operation = text(formData, "operation");
    if (operation === "publish") await publishMerchantProduct(await currentReference(), input);
    else if (operation === "unpublish") await unpublishMerchantProduct(await currentReference(), input);
    else if (operation === "archive") await archiveMerchantProduct(await currentReference(), input);
    else return invalidInput();
    revalidateCommerce(input.productId);
    return success("تم تحديث دورة حياة المنتج.");
  } catch (error) {
    return actionError(error);
  }
}

export async function merchantVariantAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  const allowed = [
    "compareAtPrice", "contextOrganizationId", "expectedVersion", "idempotencyKey", "makeDefault",
    "operation", "optionValues", "price", "productId", "replacementVariantId", "sku", "title", "variantId",
  ];
  if (hasUnknownFields(formData, allowed)) return invalidInput();
  try {
    const reference = await currentReference();
    const input = aggregateEnvelope(formData);
    const variantId = text(formData, "variantId");
    const operation = text(formData, "operation");
    if (operation === "create") await createMerchantVariant(reference, { ...input, ...variantProfile(formData) });
    else if (operation === "update") await updateMerchantVariant(reference, { ...input, ...variantProfile(formData), variantId });
    else if (operation === "default") await setMerchantDefaultVariant(reference, { ...input, variantId });
    else if (operation === "archive") await archiveMerchantVariant(reference, {
      ...input,
      replacementVariantId: text(formData, "replacementVariantId") || null,
      variantId,
    });
    else if (operation === "restore") await restoreMerchantVariant(reference, {
      ...input,
      makeDefault: formData.get("makeDefault") === "on",
      variantId,
    });
    else return invalidInput();
    revalidateCommerce(input.productId);
    return success("تم تحديث المتغير.");
  } catch (error) {
    return actionError(error);
  }
}

export async function merchantProductMediaAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  const allowed = [
    "altText", "contextOrganizationId", "expectedVersion", "idempotencyKey", "mediaId", "mediaIds",
    "operation", "productId", "url", "variantId",
  ];
  if (hasUnknownFields(formData, allowed)) return invalidInput();
  try {
    const reference = await currentReference();
    const input = aggregateEnvelope(formData);
    const operation = text(formData, "operation");
    if (operation === "add") await addMerchantProductMedia(reference, {
      ...input,
      altText: text(formData, "altText"),
      url: text(formData, "url"),
      variantId: text(formData, "variantId") || null,
    });
    else if (operation === "update") await updateMerchantProductMedia(reference, {
      ...input,
      altText: text(formData, "altText"),
      mediaId: text(formData, "mediaId"),
    });
    else if (operation === "remove") await removeMerchantProductMedia(reference, {
      ...input,
      mediaId: text(formData, "mediaId"),
    });
    else if (operation === "reorder") await reorderMerchantProductMedia(reference, {
      ...input,
      mediaIds: text(formData, "mediaIds").split(",").map((value) => value.trim()).filter(Boolean),
    });
    else return invalidInput();
    revalidateCommerce(input.productId);
    return success("تم تحديث وسائط المنتج.");
  } catch (error) {
    return actionError(error);
  }
}

export async function merchantInventoryAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  const allowed = [
    "contextOrganizationId", "expectedVersion", "idempotencyKey", "inventoryItemId", "lowStockThreshold",
    "operation", "quantityDelta", "reason",
  ];
  if (hasUnknownFields(formData, allowed)) return invalidInput();
  try {
    const reference = await currentReference();
    const inventoryItemId = text(formData, "inventoryItemId");
    const expectedVersion = integer(formData, "expectedVersion");
    const idempotencyKey = text(formData, "idempotencyKey");
    const operation = text(formData, "operation");
    if (operation === "adjust") await adjustInventory(reference, {
      expectedVersion,
      idempotencyKey,
      inventoryItemId,
      quantityDelta: integer(formData, "quantityDelta"),
      reason: text(formData, "reason"),
    });
    else if (operation === "threshold") await updateInventoryThreshold(reference, {
      contextOrganizationId: text(formData, "contextOrganizationId"),
      expectedVersion,
      idempotencyKey,
      inventoryItemId,
      lowStockThreshold: nullableInteger(formData, "lowStockThreshold"),
    });
    else return invalidInput();
    revalidatePath("/business/commerce/inventory");
    revalidatePath(`/business/commerce/inventory/${inventoryItemId}`);
    revalidatePath("/business/commerce/products");
    return success("تم تحديث المخزون.");
  } catch (error) {
    return actionError(error);
  }
}

async function currentReference() {
  const identity = await requireBusinessIdentity();
  return {
    contextOrganizationId: identity.membership.organizationId,
    membershipId: identity.membership.id,
    personId: identity.person.id,
  };
}

function aggregateEnvelope(formData: FormData) {
  return {
    contextOrganizationId: text(formData, "contextOrganizationId"),
    expectedVersion: text(formData, "expectedVersion"),
    idempotencyKey: text(formData, "idempotencyKey"),
    productId: text(formData, "productId"),
  };
}

function variantProfile(formData: FormData) {
  return {
    compareAtPrice: text(formData, "compareAtPrice"),
    optionValues: jsonObject(formData, "optionValues"),
    price: text(formData, "price"),
    sku: text(formData, "sku"),
    title: text(formData, "title"),
  };
}

function jsonObject(formData: FormData, key: string) {
  const parsed: unknown = JSON.parse(text(formData, key) || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid object input.");
  return parsed;
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function integer(formData: FormData, key: string) {
  const value = text(formData, key);
  return /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
}

function nullableInteger(formData: FormData, key: string) {
  const value = text(formData, key).trim();
  return value ? integer(formData, key) : null;
}

function hasUnknownFields(formData: FormData, allowed: readonly string[]) {
  const allow = new Set(allowed);
  return [...formData.keys()].some((key) => !key.startsWith("$ACTION_") && !allow.has(key));
}

function revalidateCommerce(productId?: string) {
  revalidatePath("/business/commerce");
  revalidatePath("/business/commerce/products");
  revalidatePath("/business/commerce/inventory");
  if (productId) revalidatePath(`/business/commerce/products/${productId}`);
}

function invalidInput(): CommerceActionState {
  return { code: "VALIDATION_ERROR", message: "بيانات الطلب غير صالحة.", ok: false };
}

function success(message: string): CommerceActionState {
  return { message, ok: true };
}
