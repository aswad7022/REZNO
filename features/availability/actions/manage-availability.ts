"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import type {
  AvailabilityActionState,
  BlockedTimeActionState,
} from "@/features/availability/types";
import { BusinessOperationsError } from "@/features/business-operations/domain/errors";
import {
  createOperationEnvelopeSchema,
  operationEnvelopeSchema,
} from "@/features/business-operations/domain/validation";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import {
  createOperationalMemberBlock,
  deleteOperationalMemberBlock,
  updateOperationalMemberBlock,
} from "@/features/business-operations/services/member-blocks";
import { updateOperationalStaffSchedule } from "@/features/business-operations/services/staff-schedules";
import { logServerError } from "@/lib/logging/server";

function exactFields(formData: FormData, fields: readonly string[]) {
  const allowed = new Set(fields);
  return [...formData.keys()].every((key) => key.startsWith("$ACTION_") || allowed.has(key));
}

function refresh(memberId: string) {
  revalidatePath(`/business/team/${memberId}/availability`);
  revalidatePath("/business/services");
  revalidatePath("/business/calendar");
}

async function availabilityError(error: unknown): Promise<AvailabilityActionState> {
  const t = await getTranslations("Availability.messages");
  if (error instanceof BusinessOperationsError) return { code: error.code, message: error.message, status: "error" };
  logServerError("businessOperations.staffSchedule", error);
  return { message: t("failure"), status: "error" };
}

async function blockError(error: unknown): Promise<BlockedTimeActionState> {
  const t = await getTranslations("BlockedTime.messages");
  if (error instanceof BusinessOperationsError) return { code: error.code, message: error.message, status: "error" };
  logServerError("businessOperations.memberBlock", error);
  return { message: t("failure"), status: "error" };
}

export async function updateMemberAvailability(
  memberId: string,
  branchId: string,
  _previousState: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const dayFields = Array.from({ length: 7 }, (_, day) => [
    `day-${day}-isOpen`, `day-${day}-openTime`, `day-${day}-closeTime`,
  ]).flat();
  if (!envelope.success || !exactFields(formData, [
    "confirmFutureBookings", "contextOrganizationId", "expectedVersion", "idempotencyKey", ...dayFields,
  ])) return { code: "INVALID_REQUEST", message: "Invalid staff schedule request.", status: "error" };
  try {
    const result = await updateOperationalStaffSchedule({
      actor: await currentBusinessOperationReference(),
      branchId,
      confirmFutureBookings: formData.get("confirmFutureBookings") === "on",
      memberId,
      schedule: {
        days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          closeTime: formData.get(`day-${dayOfWeek}-closeTime`),
          dayOfWeek,
          isOpen: formData.get(`day-${dayOfWeek}-isOpen`) === "on",
          openTime: formData.get(`day-${dayOfWeek}-openTime`),
        })),
      },
      ...envelope.data,
    });
    refresh(memberId);
    return { message: "Staff schedule saved.", nextIdempotencyKey: randomUUID(), replayed: result.replayed, status: "success", version: result.version };
  } catch (error) {
    return availabilityError(error);
  }
}

function blockInput(formData: FormData) {
  return {
    branchId: formData.get("branchId"),
    endsAt: formData.get("endsAt"),
    reason: formData.get("reason") ?? "",
    startsAt: formData.get("startsAt"),
  };
}

const blockFields = [
  "branchId", "confirmFutureBookings", "contextOrganizationId", "endsAt", "expectedVersion", "idempotencyKey", "reason", "startsAt",
] as const;

export async function createBlockedTime(
  memberId: string,
  _previousState: BlockedTimeActionState,
  formData: FormData,
): Promise<BlockedTimeActionState> {
  const envelope = createOperationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || !exactFields(formData, blockFields)) return { code: "INVALID_REQUEST", message: "Invalid member leave request.", status: "error" };
  try {
    const result = await createOperationalMemberBlock({
      actor: await currentBusinessOperationReference(),
      block: blockInput(formData),
      confirmFutureBookings: formData.get("confirmFutureBookings") === "on",
      memberId,
      ...envelope.data,
    });
    refresh(memberId);
    return { message: "Member leave created.", nextIdempotencyKey: randomUUID(), replayed: result.replayed, status: "success", version: result.version };
  } catch (error) {
    return blockError(error);
  }
}

export async function updateBlockedTime(
  memberId: string,
  blockedTimeId: string,
  _previousState: BlockedTimeActionState,
  formData: FormData,
): Promise<BlockedTimeActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || !exactFields(formData, blockFields)) return { code: "INVALID_REQUEST", message: "Invalid member leave request.", status: "error" };
  try {
    const result = await updateOperationalMemberBlock({
      actor: await currentBusinessOperationReference(),
      block: blockInput(formData),
      blockId: blockedTimeId,
      confirmFutureBookings: formData.get("confirmFutureBookings") === "on",
      memberId,
      ...envelope.data,
    });
    refresh(memberId);
    return { message: "Member leave updated.", nextIdempotencyKey: randomUUID(), replayed: result.replayed, status: "success", version: result.version };
  } catch (error) {
    return blockError(error);
  }
}

export async function deleteBlockedTime(
  memberId: string,
  blockedTimeId: string,
  _previousState: BlockedTimeActionState,
  formData: FormData,
): Promise<BlockedTimeActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || !exactFields(formData, ["contextOrganizationId", "expectedVersion", "idempotencyKey"])) {
    return { code: "INVALID_REQUEST", message: "Invalid member leave deletion request.", status: "error" };
  }
  try {
    const result = await deleteOperationalMemberBlock({
      actor: await currentBusinessOperationReference(),
      blockId: blockedTimeId,
      memberId,
      ...envelope.data,
    });
    refresh(memberId);
    return { message: "Member leave removed.", nextIdempotencyKey: randomUUID(), replayed: result.replayed, status: "success", version: result.version };
  } catch (error) {
    return blockError(error);
  }
}
