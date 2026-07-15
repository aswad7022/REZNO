"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { BusinessOperationsError } from "@/features/business-operations/domain/errors";
import { createOperationEnvelopeSchema, operationEnvelopeSchema } from "@/features/business-operations/domain/validation";
import { archiveOperationalBranch, createOperationalBranch, setOperationalBranchActive, updateOperationalBranch } from "@/features/business-operations/services/branches";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import type { BranchActionState } from "@/features/branches/types";
import { logServerError } from "@/lib/logging/server";

const branchFields = ["addressLine1", "addressLine2", "city", "country", "email", "latitude", "locationInstructions", "locationLabel", "longitude", "name", "nearbyLandmark", "phone", "timezone"] as const;
const envelopeFields = ["contextOrganizationId", "expectedVersion", "idempotencyKey"] as const;

function nullable(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function coordinate(value: FormDataEntryValue | null) {
  const normalized = nullable(value);
  return normalized === null ? null : Number(normalized);
}

function branchInput(formData: FormData) {
  return {
    addressLine1: nullable(formData.get("addressLine1")),
    addressLine2: nullable(formData.get("addressLine2")),
    city: nullable(formData.get("city")),
    country: nullable(formData.get("country")),
    email: nullable(formData.get("email")),
    latitude: coordinate(formData.get("latitude")),
    locationInstructions: nullable(formData.get("locationInstructions")),
    locationLabel: nullable(formData.get("locationLabel")),
    longitude: coordinate(formData.get("longitude")),
    name: formData.get("name"),
    nearbyLandmark: nullable(formData.get("nearbyLandmark")),
    phone: nullable(formData.get("phone")),
    timezone: formData.get("timezone"),
  };
}

function unknownFields(formData: FormData, extra: readonly string[] = []) {
  const allowed = new Set([...branchFields, ...envelopeFields, ...extra]);
  return [...formData.keys()].some((key) => !key.startsWith("$ACTION_") && !allowed.has(key));
}

async function messages() {
  return getTranslations("Branches.messages");
}

function actionError(error: unknown, failure: string): BranchActionState {
  if (error instanceof BusinessOperationsError) {
    return { status: "error", code: error.code, details: error.details, message: error.message };
  }
  logServerError("businessOperations.branch", error);
  return { status: "error", message: failure };
}

export async function createBranch(_previous: BranchActionState, formData: FormData): Promise<BranchActionState> {
  const t = await messages();
  const envelope = createOperationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || unknownFields(formData)) return { status: "error", code: "INVALID_REQUEST", message: t("invalid") };
  try {
    const result = await createOperationalBranch({
      actor: await currentBusinessOperationReference(),
      branch: branchInput(formData),
      ...envelope.data,
    });
    revalidatePath("/business/manage/locations");
    return { status: "success", message: t("created"), nextIdempotencyKey: randomUUID(), replayed: result.replayed, version: result.version };
  } catch (error) {
    return actionError(error, t("failure"));
  }
}

export async function updateBranch(branchId: string, _previous: BranchActionState, formData: FormData): Promise<BranchActionState> {
  const t = await messages();
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || unknownFields(formData)) return { status: "error", code: "INVALID_REQUEST", message: t("invalid") };
  try {
    const result = await updateOperationalBranch({ actor: await currentBusinessOperationReference(), branch: branchInput(formData), branchId, ...envelope.data });
    revalidatePath("/business/manage/locations");
    return { status: "success", message: t("updated"), nextIdempotencyKey: randomUUID(), replayed: result.replayed, version: result.version };
  } catch (error) {
    return actionError(error, t("failure"));
  }
}

export async function setBranchActive(branchId: string, active: boolean, _previous: BranchActionState, formData: FormData): Promise<BranchActionState> {
  const t = await messages();
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || unknownFields(formData, ["confirmFutureReservations"])) return { status: "error", code: "INVALID_REQUEST", message: t("invalid") };
  try {
    const result = await setOperationalBranchActive({
      active,
      actor: await currentBusinessOperationReference(),
      branchId,
      confirmFutureReservations: formData.get("confirmFutureReservations") === "on",
      ...envelope.data,
    });
    revalidatePath("/business/manage/locations");
    return { status: "success", message: t("updated"), nextIdempotencyKey: randomUUID(), replayed: result.replayed, version: result.version };
  } catch (error) {
    return actionError(error, t("failure"));
  }
}

export async function archiveBranch(branchId: string, _previous: BranchActionState, formData: FormData): Promise<BranchActionState> {
  const t = await messages();
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || unknownFields(formData)) return { status: "error", code: "INVALID_REQUEST", message: t("invalid") };
  try {
    const result = await archiveOperationalBranch({ actor: await currentBusinessOperationReference(), branchId, ...envelope.data });
    revalidatePath("/business/manage/locations");
    return { status: "success", message: t("updated"), nextIdempotencyKey: randomUUID(), replayed: result.replayed, version: result.version };
  } catch (error) {
    return actionError(error, t("failure"));
  }
}
