"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { BusinessOperationsError } from "@/features/business-operations/domain/errors";
import {
  createOperationEnvelopeSchema,
  operationEnvelopeSchema,
} from "@/features/business-operations/domain/validation";
import {
  addOperationalServiceAssignment,
  removeOperationalServiceAssignment,
} from "@/features/business-operations/services/assignments";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import {
  createOperationalOffering,
  removeOperationalOffering,
  updateOperationalOffering,
} from "@/features/business-operations/services/offerings";
import type { ServiceActionState } from "@/features/services/types";
import { logServerError } from "@/lib/logging/server";

function resultState(result: { replayed: boolean; version: string }): ServiceActionState {
  return {
    nextIdempotencyKey: randomUUID(),
    replayed: result.replayed,
    status: "success",
    version: result.version,
  };
}

function actionError(error: unknown): ServiceActionState {
  if (error instanceof BusinessOperationsError) {
    return { code: error.code, message: error.message, status: "error" };
  }
  logServerError("businessOperations.serviceOffering", error);
  return { message: "The operational change could not be saved.", status: "error" };
}

function revalidateOperations() {
  revalidatePath("/business/services");
  revalidatePath("/business/team");
  revalidatePath("/business/public-profile");
  revalidatePath("/marketplace");
}

function exactFields(formData: FormData, fields: readonly string[]) {
  const allowed = new Set(fields);
  return [...formData.keys()].every((key) => key.startsWith("$ACTION_") || allowed.has(key));
}

function offering(formData: FormData) {
  return {
    durationMinutes: Number(formData.get("durationMinutes")),
    price: formData.get("price"),
    pricingType: formData.get("pricingType"),
  };
}

export async function createOffering(
  serviceId: string,
  _previous: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const envelope = createOperationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const branchId = formData.get("branchId");
  if (!envelope.success || typeof branchId !== "string" || !exactFields(formData, [
    "branchId", "contextOrganizationId", "durationMinutes", "idempotencyKey", "price", "pricingType",
  ])) return { code: "INVALID_REQUEST", message: "Invalid offering request.", status: "error" };
  try {
    const result = await createOperationalOffering({
      actor: await currentBusinessOperationReference(),
      branchId,
      offering: offering(formData),
      serviceId,
      ...envelope.data,
    });
    revalidateOperations();
    return resultState(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateOffering(
  offeringId: string,
  _previous: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || !exactFields(formData, [
    "confirmFutureBookings", "contextOrganizationId", "durationMinutes", "expectedVersion", "idempotencyKey", "isAvailable", "price", "pricingType",
  ])) return { code: "INVALID_REQUEST", message: "Invalid offering request.", status: "error" };
  try {
    const result = await updateOperationalOffering({
      actor: await currentBusinessOperationReference(),
      confirmFutureBookings: formData.get("confirmFutureBookings") === "on",
      isAvailable: formData.get("isAvailable") === "on",
      offering: offering(formData),
      offeringId,
      ...envelope.data,
    });
    revalidateOperations();
    return resultState(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function removeOffering(
  offeringId: string,
  _previous: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || !exactFields(formData, ["contextOrganizationId", "expectedVersion", "idempotencyKey"])) {
    return { code: "INVALID_REQUEST", message: "Invalid offering removal request.", status: "error" };
  }
  try {
    const result = await removeOperationalOffering({
      actor: await currentBusinessOperationReference(),
      offeringId,
      ...envelope.data,
    });
    revalidateOperations();
    return resultState(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function addServiceAssignment(
  serviceId: string,
  _previous: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const envelope = createOperationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const memberId = formData.get("memberId");
  if (!envelope.success || typeof memberId !== "string" || !exactFields(formData, ["contextOrganizationId", "idempotencyKey", "memberId"])) {
    return { code: "INVALID_REQUEST", message: "Invalid Service assignment request.", status: "error" };
  }
  try {
    const result = await addOperationalServiceAssignment({
      actor: await currentBusinessOperationReference(),
      memberId,
      serviceId,
      ...envelope.data,
    });
    revalidateOperations();
    return resultState(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function removeServiceAssignment(
  assignmentId: string,
  _previous: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || !exactFields(formData, ["confirmFutureBookings", "contextOrganizationId", "expectedVersion", "idempotencyKey"])) {
    return { code: "INVALID_REQUEST", message: "Invalid Service assignment removal request.", status: "error" };
  }
  try {
    const result = await removeOperationalServiceAssignment({
      actor: await currentBusinessOperationReference(),
      assignmentId,
      confirmFutureBookings: formData.get("confirmFutureBookings") === "on",
      ...envelope.data,
    });
    revalidateOperations();
    return resultState(result);
  } catch (error) {
    return actionError(error);
  }
}
