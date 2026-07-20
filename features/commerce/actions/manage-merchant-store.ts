"use server";

import { revalidatePath } from "next/cache";
import type { CommercePermission } from "@prisma/client";

import {
  actionError,
  type CommerceActionState,
} from "@/features/commerce/actions/action-state";
import { COMMERCE_PERMISSIONS } from "@/features/commerce/domain/merchant-access";
import { updateCommerceRolePermissions } from "@/features/commerce/services/commerce-access-service";
import {
  archiveStore,
  clearUnsafeStoreImages,
  createStoreDraft,
  reopenRejectedStoreDraft,
  submitStoreForReview,
  updateStoreProfile,
} from "@/features/commerce/services/store-service";
import { requireBusinessIdentity } from "@/features/identity/server";

export async function saveMerchantStoreAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  const allowed = [
    "contextOrganizationId", "currency", "deliveryArea", "deliveryCity",
    "deliveryEnabled", "deliveryEstimateMinutes", "deliveryFee", "description", "expectedVersion",
    "idempotencyKey", "minimumOrderValue", "mode", "name", "pickupAdditionalDetails",
    "pickupArea", "pickupCity", "pickupEnabled", "pickupInstructions", "pickupStreet",
    "preparationEstimateMinutes", "slug", "storeId", "supportPhone",
  ];
  if (hasUnknownFields(formData, allowed)) return invalidInput();
  try {
    const reference = await currentReference();
    const mode = text(formData, "mode");
    if (text(formData, "currency") !== "IQD") return invalidInput();
    const profile = {
      contextOrganizationId: text(formData, "contextOrganizationId"),
      currency: "IQD" as const,
      deliveryArea: text(formData, "deliveryArea"),
      deliveryCity: text(formData, "deliveryCity"),
      deliveryEnabled: formData.get("deliveryEnabled") === "on",
      deliveryEstimateMinutes: nullableInteger(formData, "deliveryEstimateMinutes"),
      deliveryFee: text(formData, "deliveryFee"),
      description: text(formData, "description"),
      idempotencyKey: text(formData, "idempotencyKey"),
      minimumOrderValue: text(formData, "minimumOrderValue"),
      name: text(formData, "name"),
      pickupAdditionalDetails: text(formData, "pickupAdditionalDetails"),
      pickupArea: text(formData, "pickupArea"),
      pickupCity: text(formData, "pickupCity"),
      pickupEnabled: formData.get("pickupEnabled") === "on",
      pickupInstructions: text(formData, "pickupInstructions"),
      pickupStreet: text(formData, "pickupStreet"),
      preparationEstimateMinutes: nullableInteger(formData, "preparationEstimateMinutes"),
      slug: text(formData, "slug"),
      supportPhone: text(formData, "supportPhone"),
    };
    if (mode === "create") {
      await createStoreDraft(reference, profile);
    } else if (mode === "update") {
      await updateStoreProfile(reference, {
        ...profile,
        expectedVersion: text(formData, "expectedVersion"),
        storeId: text(formData, "storeId"),
      });
    } else {
      return invalidInput();
    }
    revalidateCommerce();
    return { message: "تم حفظ بيانات المتجر بنجاح.", ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function merchantStoreLifecycleAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  const allowed = ["action", "contextOrganizationId", "expectedVersion", "idempotencyKey", "reason", "storeId"];
  if (hasUnknownFields(formData, allowed)) return invalidInput();
  try {
    const reference = await currentReference();
    const input = {
      contextOrganizationId: text(formData, "contextOrganizationId"),
      expectedVersion: text(formData, "expectedVersion"),
      idempotencyKey: text(formData, "idempotencyKey"),
      storeId: text(formData, "storeId"),
    };
    const action = text(formData, "action");
    if (action === "submit") await submitStoreForReview(reference, input);
    else if (action === "reopen") await reopenRejectedStoreDraft(reference, input);
    else if (action === "archive") {
      await archiveStore(reference, { ...input, reason: text(formData, "reason") });
    } else return invalidInput();
    revalidateCommerce();
    return { message: "تم تحديث حالة المتجر.", ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function clearUnsafeStoreImagesAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  const allowed = ["action", "contextOrganizationId", "expectedVersion", "idempotencyKey", "storeId"];
  if (hasUnknownFields(formData, allowed)) return invalidInput();
  if (text(formData, "action") !== "clearUnsafeImages") return invalidInput();
  try {
    await clearUnsafeStoreImages(await currentReference(), {
      contextOrganizationId: text(formData, "contextOrganizationId"),
      expectedVersion: text(formData, "expectedVersion"),
      idempotencyKey: text(formData, "idempotencyKey"),
      storeId: text(formData, "storeId"),
    });
    revalidateCommerce();
    return { message: "تمت إزالة روابط الصور القديمة غير الآمنة.", ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCommerceAccessAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  const allowed = ["contextOrganizationId", "expectedVersion", "idempotencyKey", "permissions", "roleId"];
  if (hasUnknownFields(formData, allowed)) return invalidInput();
  try {
    await updateCommerceRolePermissions(await currentReference(), {
      contextOrganizationId: text(formData, "contextOrganizationId"),
      expectedVersion: text(formData, "expectedVersion"),
      idempotencyKey: text(formData, "idempotencyKey"),
      permissions: COMMERCE_PERMISSIONS.filter((permission) =>
        formData.getAll("permissions").includes(permission),
      ) as CommercePermission[],
      roleId: text(formData, "roleId"),
    });
    revalidatePath("/business/commerce/access");
    revalidatePath("/business", "layout");
    return { message: "تم تحديث صلاحيات التجارة.", ok: true };
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

function revalidateCommerce() {
  revalidatePath("/business/commerce");
  revalidatePath("/business/commerce/store");
  revalidatePath("/business", "layout");
}

function hasUnknownFields(formData: FormData, allowed: readonly string[]) {
  const allow = new Set(allowed);
  return [...formData.keys()].some((key) => !key.startsWith("$ACTION_") && !allow.has(key));
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function nullableInteger(formData: FormData, key: string) {
  const value = text(formData, key).trim();
  return value ? Number(value) : null;
}

function invalidInput(): CommerceActionState {
  return { code: "VALIDATION_ERROR", message: "بيانات الطلب غير صالحة.", ok: false };
}
