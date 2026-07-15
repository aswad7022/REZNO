"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { BusinessOperationsError } from "@/features/business-operations/domain/errors";
import { operationEnvelopeSchema } from "@/features/business-operations/domain/validation";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { updateOperationalSettings } from "@/features/business-operations/services/settings";
import type { BusinessSettingsActionState } from "@/features/business-settings/types";
import { logServerError } from "@/lib/logging/server";

const allowedFields = new Set([
  "bookingEnabled",
  "cancellationWindowHours",
  "contextOrganizationId",
  "expectedVersion",
  "idempotencyKey",
  "marketplaceVisible",
]);

export async function updateBusinessSettings(
  _previousState: BusinessSettingsActionState,
  formData: FormData,
): Promise<BusinessSettingsActionState> {
  const t = await getTranslations("BusinessSettings.messages");
  if ([...formData.keys()].some((key) => !key.startsWith("$ACTION_") && !allowedFields.has(key))) {
    return { status: "error", code: "INVALID_REQUEST", message: t("invalid") };
  }
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const rawCancellation = formData.get("cancellationWindowHours");
  if (!envelope.success || typeof rawCancellation !== "string" || !/^\d+$/.test(rawCancellation)) {
    return {
      status: "error",
      code: "INVALID_REQUEST",
      message: t("invalid"),
      fieldErrors: { cancellationWindowHours: t("invalid") },
    };
  }
  try {
    const result = await updateOperationalSettings({
      actor: await currentBusinessOperationReference(),
      ...envelope.data,
      settings: {
        bookingEnabled: formData.get("bookingEnabled") === "on",
        cancellationWindowHours: Number(rawCancellation),
        marketplaceVisible: formData.get("marketplaceVisible") === "on",
      },
    });
    revalidatePath("/business/manage/settings");
    revalidatePath("/marketplace");
    return {
      status: "success",
      message: t("success"),
      nextIdempotencyKey: randomUUID(),
      replayed: result.replayed,
      version: result.version,
    };
  } catch (error) {
    if (error instanceof BusinessOperationsError) {
      return {
        status: "error",
        code: error.code,
        message: error.code === "FORBIDDEN" ? t("forbidden") : error.code === "INVALID_REQUEST" ? t("invalid") : t("failure"),
      };
    }
    logServerError("businessOperations.settings", error);
    return { status: "error", message: t("failure") };
  }
}
