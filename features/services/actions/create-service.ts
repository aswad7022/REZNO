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
  archiveOperationalService,
  createOperationalService,
  setOperationalServiceActive,
  updateOperationalService,
} from "@/features/business-operations/services/service-catalog";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import type { ServiceActionState } from "@/features/services/types";
import { logServerError } from "@/lib/logging/server";

const serviceFields = [
  "categoryId",
  "confirmFutureBookings",
  "contextOrganizationId",
  "description",
  "expectedVersion",
  "idempotencyKey",
  "imageUrl",
  "name",
  "staffSelectionMode",
] as const;

function hasUnknownFields(formData: FormData, allowed: readonly string[] = serviceFields) {
  const fields = new Set<string>(allowed);
  return [...formData.keys()].some(
    (key) => !key.startsWith("$ACTION_") && !fields.has(key),
  );
}

function serviceInput(formData: FormData) {
  return {
    categoryId: formData.get("categoryId"),
    description: formData.get("description") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
    name: formData.get("name"),
    staffSelectionMode: formData.get("staffSelectionMode") ?? "OPTIONAL",
  };
}

async function actionError(error: unknown): Promise<ServiceActionState> {
  const t = await getTranslations("Services.messages");
  if (error instanceof BusinessOperationsError) {
    return { code: error.code, message: error.message, status: "error" };
  }
  logServerError("businessOperations.service", error);
  return { message: t("failure"), status: "error" };
}

function revalidateServices() {
  revalidatePath("/business/services");
  revalidatePath("/business/public-profile");
  revalidatePath("/marketplace");
}

export async function createService(
  _previousState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const t = await getTranslations("Services.messages");
  const envelope = createOperationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || hasUnknownFields(formData)) {
    return { code: "INVALID_REQUEST", message: t("invalid"), status: "error" };
  }
  try {
    const result = await createOperationalService({
      actor: await currentBusinessOperationReference(),
      service: serviceInput(formData),
      ...envelope.data,
    });
    revalidateServices();
    return {
      message: t("created"),
      nextIdempotencyKey: randomUUID(),
      replayed: result.replayed,
      status: "success",
      version: result.version,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateService(
  serviceId: string,
  _previousState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const t = await getTranslations("Services.messages");
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || hasUnknownFields(formData)) {
    return { code: "INVALID_REQUEST", message: t("invalid"), status: "error" };
  }
  try {
    const result = await updateOperationalService({
      actor: await currentBusinessOperationReference(),
      confirmFutureBookings: formData.get("confirmFutureBookings") === "on",
      service: serviceInput(formData),
      serviceId,
      ...envelope.data,
    });
    revalidateServices();
    return {
      message: t("updated"),
      nextIdempotencyKey: randomUUID(),
      replayed: result.replayed,
      status: "success",
      version: result.version,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function setServiceActive(
  serviceId: string,
  active: boolean,
  _previousState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const allowed = ["confirmFutureBookings", "contextOrganizationId", "expectedVersion", "idempotencyKey"] as const;
  if (!envelope.success || hasUnknownFields(formData, allowed)) {
    return { code: "INVALID_REQUEST", message: "Invalid Service lifecycle request.", status: "error" };
  }
  try {
    const result = await setOperationalServiceActive({
      active,
      actor: await currentBusinessOperationReference(),
      confirmFutureBookings: formData.get("confirmFutureBookings") === "on",
      serviceId,
      ...envelope.data,
    });
    revalidateServices();
    return { nextIdempotencyKey: randomUUID(), replayed: result.replayed, status: "success", version: result.version };
  } catch (error) {
    return actionError(error);
  }
}

export async function archiveService(
  serviceId: string,
  _previousState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const allowed = ["contextOrganizationId", "expectedVersion", "idempotencyKey"] as const;
  if (!envelope.success || hasUnknownFields(formData, allowed)) {
    return { code: "INVALID_REQUEST", message: "Invalid Service archive request.", status: "error" };
  }
  try {
    const result = await archiveOperationalService({
      actor: await currentBusinessOperationReference(),
      serviceId,
      ...envelope.data,
    });
    revalidateServices();
    return { nextIdempotencyKey: randomUUID(), replayed: result.replayed, status: "success", version: result.version };
  } catch (error) {
    return actionError(error);
  }
}
