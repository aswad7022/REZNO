"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { BusinessOperationsError } from "@/features/business-operations/domain/errors";
import { operationEnvelopeSchema } from "@/features/business-operations/domain/validation";
import { updateOperationalHours } from "@/features/business-operations/services/hours";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import type { WorkingHoursActionState } from "@/features/working-hours/types";
import { logServerError } from "@/lib/logging/server";

export async function updateWorkingHours(branchId: string, _previous: WorkingHoursActionState, formData: FormData): Promise<WorkingHoursActionState> {
  const t = await getTranslations("WorkingHours.messages");
  const staticFields = new Set(["confirmFutureReservations", "contextOrganizationId", "expectedVersion", "idempotencyKey"]);
  const unknown = [...formData.keys()].some((key) =>
    !key.startsWith("$ACTION_") && !staticFields.has(key) && !/^day-[0-6]-(?:isOpen|openTime|closeTime)$/.test(key),
  );
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (unknown || !envelope.success) return { status: "error", code: "INVALID_REQUEST", message: t("invalid") };
  const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    closeTime: formData.get(`day-${dayOfWeek}-closeTime`),
    dayOfWeek,
    isOpen: formData.get(`day-${dayOfWeek}-isOpen`) === "on",
    openTime: formData.get(`day-${dayOfWeek}-openTime`),
  }));
  try {
    const result = await updateOperationalHours({
      actor: await currentBusinessOperationReference(),
      branchId,
      confirmFutureReservations: formData.get("confirmFutureReservations") === "on",
      days,
      ...envelope.data,
    });
    revalidatePath(`/business/manage/locations/${branchId}/hours`);
    revalidatePath("/business/manage/locations");
    return { status: "success", message: t("success"), nextIdempotencyKey: randomUUID(), replayed: result.replayed, version: result.version };
  } catch (error) {
    if (error instanceof BusinessOperationsError) return { status: "error", code: error.code, details: error.details, message: error.message };
    logServerError("businessOperations.hours", error, { branchId });
    return { status: "error", message: t("failure") };
  }
}
