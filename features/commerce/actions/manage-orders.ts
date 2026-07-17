"use server";

import { revalidatePath } from "next/cache";

import { actionError, type CommerceActionState } from "@/features/commerce/actions/action-state";
import {
  advanceOrderFulfillment,
  cancelMerchantOrder,
  confirmOrder,
  rejectOrder,
} from "@/features/commerce/services/order-service";
import { requireBusinessIdentity } from "@/features/identity/server";

const DECISIONS = new Set(["confirm", "reject"]);
const FULFILLMENT = new Set([
  "start_preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "delivery_failed",
  "retry_delivery",
  "finalize_pickup",
  "finalize_delivery",
]);

export async function merchantOrderAction(
  _previous: CommerceActionState,
  formData: FormData,
): Promise<CommerceActionState> {
  const allowed = [
    "action",
    "expectedVersion",
    "idempotencyKey",
    "orderId",
    "reason",
    "returnedStock",
  ];
  if (hasUnknownFields(formData, allowed)) return invalidInput();
  try {
    const action = text(formData, "action");
    const envelope = {
      expectedVersion: text(formData, "expectedVersion"),
      idempotencyKey: text(formData, "idempotencyKey"),
      orderId: text(formData, "orderId"),
    };
    const reference = await currentReference();
    if (DECISIONS.has(action)) {
      if (action === "confirm") await confirmOrder(reference, { ...envelope, action });
      else await rejectOrder(reference, { ...envelope, action: "reject", reason: text(formData, "reason") });
    } else if (FULFILLMENT.has(action)) {
      await advanceOrderFulfillment(reference, {
        ...envelope,
        action: action as "start_preparing",
        ...(action === "delivery_failed" ? { reason: text(formData, "reason") } : {}),
      });
    } else if (action === "cancel") {
      await cancelMerchantOrder(reference, {
        ...envelope,
        reason: text(formData, "reason"),
        returnedStock: formData.get("returnedStock") === "on",
      });
    } else return invalidInput();
    revalidatePath("/business/commerce");
    revalidatePath("/business/commerce/orders");
    revalidatePath(`/business/commerce/orders/${envelope.orderId}`);
    return { message: "تم تحديث الطلب بنجاح.", ok: true };
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

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function hasUnknownFields(formData: FormData, allowed: readonly string[]) {
  const allow = new Set(allowed);
  return [...formData.keys()].some((key) => !key.startsWith("$ACTION_") && !allow.has(key));
}

function invalidInput(): CommerceActionState {
  return { code: "VALIDATION_ERROR", message: "بيانات الطلب غير صالحة.", ok: false };
}
