"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { BusinessOperationsError } from "@/features/business-operations/domain/errors";
import {
  createOperationEnvelopeSchema,
  operationEnvelopeSchema,
} from "@/features/business-operations/domain/validation";
import {
  createOperationalBlock,
  deleteOperationalBlock,
  updateOperationalBlock,
} from "@/features/business-operations/services/blocks";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import type { OperationalBlockActionState } from "@/features/business-operations/types/blocks";
import { logServerError } from "@/lib/logging/server";

const blockFields = ["endsAt", "reason", "startsAt"] as const;
const envelopeFields = [
  "contextOrganizationId",
  "expectedVersion",
  "idempotencyKey",
] as const;

function hasUnknownFields(formData: FormData, allowedExtra: readonly string[] = []) {
  const allowed = new Set([...blockFields, ...envelopeFields, ...allowedExtra]);
  return [...formData.keys()].some(
    (key) => !key.startsWith("$ACTION_") && !allowed.has(key),
  );
}

function blockInput(formData: FormData) {
  const reason = formData.get("reason");
  return {
    endsAt: formData.get("endsAt"),
    reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
    startsAt: formData.get("startsAt"),
  };
}

function actionError(error: unknown, fallback: string): OperationalBlockActionState {
  if (error instanceof BusinessOperationsError) {
    return {
      code: error.code,
      details: error.details,
      message: error.message,
      status: "error",
    };
  }
  logServerError("businessOperations.block", error);
  return { message: fallback, status: "error" };
}

function revalidateOperationalBlocks(branchId: string) {
  revalidatePath(`/business/manage/locations/${branchId}/blocks`);
  revalidatePath("/business/manage/locations");
  revalidatePath("/business/public-profile");
}

export async function createBlock(
  branchId: string,
  _previous: OperationalBlockActionState,
  formData: FormData,
): Promise<OperationalBlockActionState> {
  const t = await getTranslations("OperationalBlocks.messages");
  const envelope = createOperationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (
    !envelope.success ||
    hasUnknownFields(formData, ["confirmFutureReservations"])
  ) {
    return { code: "INVALID_REQUEST", message: t("invalid"), status: "error" };
  }
  try {
    const result = await createOperationalBlock({
      actor: await currentBusinessOperationReference(),
      block: blockInput(formData),
      branchId,
      confirmFutureReservations:
        formData.get("confirmFutureReservations") === "on",
      ...envelope.data,
    });
    revalidateOperationalBlocks(branchId);
    return {
      blockId: result.blockId,
      message: t("created"),
      nextIdempotencyKey: randomUUID(),
      replayed: result.replayed,
      status: "success",
      version: result.version,
    };
  } catch (error) {
    return actionError(error, t("failure"));
  }
}

export async function updateBlock(
  branchId: string,
  blockId: string,
  _previous: OperationalBlockActionState,
  formData: FormData,
): Promise<OperationalBlockActionState> {
  const t = await getTranslations("OperationalBlocks.messages");
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (
    !envelope.success ||
    hasUnknownFields(formData, ["confirmFutureReservations"])
  ) {
    return { code: "INVALID_REQUEST", message: t("invalid"), status: "error" };
  }
  try {
    const result = await updateOperationalBlock({
      actor: await currentBusinessOperationReference(),
      block: blockInput(formData),
      blockId,
      branchId,
      confirmFutureReservations:
        formData.get("confirmFutureReservations") === "on",
      ...envelope.data,
    });
    revalidateOperationalBlocks(branchId);
    return {
      blockId: result.blockId,
      message: t("updated"),
      nextIdempotencyKey: randomUUID(),
      replayed: result.replayed,
      status: "success",
      version: result.version,
    };
  } catch (error) {
    return actionError(error, t("failure"));
  }
}

export async function deleteBlock(
  branchId: string,
  blockId: string,
  _previous: OperationalBlockActionState,
  formData: FormData,
): Promise<OperationalBlockActionState> {
  const t = await getTranslations("OperationalBlocks.messages");
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || hasUnknownFields(formData)) {
    return { code: "INVALID_REQUEST", message: t("invalid"), status: "error" };
  }
  try {
    const result = await deleteOperationalBlock({
      actor: await currentBusinessOperationReference(),
      blockId,
      branchId,
      ...envelope.data,
    });
    revalidateOperationalBlocks(branchId);
    return {
      blockId: result.blockId,
      message: t("deleted"),
      nextIdempotencyKey: randomUUID(),
      replayed: result.replayed,
      status: "success",
      version: result.version,
    };
  } catch (error) {
    return actionError(error, t("failure"));
  }
}
