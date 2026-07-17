"use server";

import { revalidatePath } from "next/cache";

import { actionError, type CommerceActionState } from "@/features/commerce/actions/action-state";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";
import {
  approveStore,
  reactivateStore,
  rejectStore,
  suspendStore,
} from "@/features/commerce/services/store-service";

export async function adminStoreLifecycleAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  const allowed = new Set(["action", "expectedVersion", "idempotencyKey", "reason", "storeId"]);
  if ([...formData.keys()].some((key) => !key.startsWith("$ACTION_") && !allowed.has(key))) {
    return { code: "VALIDATION_ERROR", message: "بيانات المراجعة غير صالحة.", ok: false };
  }
  const value = (key: string) => {
    const item = formData.get(key);
    return typeof item === "string" ? item : "";
  };
  try {
    const context = await requireAuthenticatedCommerceAdmin("COMMERCE_STORES_REVIEW");
    const input = {
      expectedVersion: value("expectedVersion"),
      idempotencyKey: value("idempotencyKey"),
      reason: value("reason").trim() || null,
      storeId: value("storeId"),
    };
    const action = value("action");
    if (action === "approve") await approveStore(context, { ...input, reason: null });
    else if (action === "reject") await rejectStore(context, input);
    else if (action === "suspend") await suspendStore(context, input);
    else if (action === "reactivate") await reactivateStore(context, { ...input, reason: null });
    else return { code: "VALIDATION_ERROR", message: "إجراء المراجعة غير صالح.", ok: false };
    revalidatePath("/admin/commerce");
    revalidatePath("/admin/commerce/stores");
    revalidatePath(`/admin/commerce/stores/${input.storeId}`);
    return { message: "تم تحديث حالة المتجر.", ok: true };
  } catch (error) {
    return actionError(error);
  }
}
