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
  addOperationalBranchAssignment,
  removeOperationalBranchAssignment,
} from "@/features/business-operations/services/assignments";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import {
  createOperationalInvitation,
  revokeOperationalInvitation,
} from "@/features/business-operations/services/invitations";
import {
  removeOperationalMembership,
  setOperationalMembershipActive,
  updateOperationalMemberProfile,
  updateOperationalMemberRole,
} from "@/features/business-operations/services/workforce";
import type { TeamMemberActionState } from "@/features/team/types";
import { logServerError } from "@/lib/logging/server";

function exactFields(formData: FormData, fields: readonly string[]) {
  const allowed = new Set(fields);
  return [...formData.keys()].every((key) => key.startsWith("$ACTION_") || allowed.has(key));
}

function state(result: { replayed: boolean; version: string }, message?: string): TeamMemberActionState {
  return {
    message,
    nextIdempotencyKey: randomUUID(),
    replayed: result.replayed,
    status: "success",
    version: result.version,
  };
}

async function actionError(error: unknown): Promise<TeamMemberActionState> {
  const t = await getTranslations("Team.messages");
  if (error instanceof BusinessOperationsError) {
    return { code: error.code, message: error.message, status: "error" };
  }
  logServerError("businessOperations.workforce", error);
  return { message: t("failure"), status: "error" };
}

function refresh(memberId?: string) {
  revalidatePath("/business/team");
  if (memberId) revalidatePath(`/business/team/${memberId}/availability`);
  revalidatePath("/business/services");
  revalidatePath("/business/public-profile");
}

export async function addTeamMember(
  _previous: TeamMemberActionState,
  formData: FormData,
): Promise<TeamMemberActionState> {
  const envelope = createOperationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const rawExpiration = formData.get("expiresAt");
  const expiration = typeof rawExpiration === "string" ? new Date(rawExpiration) : null;
  if (!envelope.success || !expiration || Number.isNaN(expiration.getTime()) || !exactFields(formData, [
    "contextOrganizationId", "email", "expiresAt", "idempotencyKey", "systemRole",
  ])) return { code: "INVALID_REQUEST", message: "Invalid invitation request.", status: "error" };
  try {
    const result = await createOperationalInvitation({
      actor: await currentBusinessOperationReference(),
      invitation: {
        email: formData.get("email"),
        expiresAt: expiration.toISOString(),
        systemRole: formData.get("systemRole"),
      },
      ...envelope.data,
    });
    refresh();
    return state(result, "Invitation created.");
  } catch (error) {
    return actionError(error);
  }
}

export async function updateTeamMember(
  memberId: string,
  _previous: TeamMemberActionState,
  formData: FormData,
): Promise<TeamMemberActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || !exactFields(formData, [
    "bio", "contextOrganizationId", "expectedVersion", "idempotencyKey", "isPublicProfessional", "publicSlug", "specialties",
  ])) return { code: "INVALID_REQUEST", message: "Invalid workforce profile request.", status: "error" };
  const slug = String(formData.get("publicSlug") ?? "").trim();
  try {
    const result = await updateOperationalMemberProfile({
      actor: await currentBusinessOperationReference(),
      memberId,
      profile: {
        bio: formData.get("bio") ?? "",
        isPublicProfessional: formData.get("isPublicProfessional") === "on",
        publicSlug: slug || null,
        specialties: String(formData.get("specialties") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      },
      ...envelope.data,
    });
    refresh(memberId);
    return state(result, "Workforce profile updated.");
  } catch (error) {
    return actionError(error);
  }
}

export async function revokeInvitation(
  invitationId: string,
  _previous: TeamMemberActionState,
  formData: FormData,
): Promise<TeamMemberActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || !exactFields(formData, ["contextOrganizationId", "expectedVersion", "idempotencyKey"])) {
    return { code: "INVALID_REQUEST", message: "Invalid invitation revocation request.", status: "error" };
  }
  try {
    const result = await revokeOperationalInvitation({
      actor: await currentBusinessOperationReference(),
      invitationId,
      ...envelope.data,
    });
    refresh();
    return state(result, "Invitation revoked.");
  } catch (error) {
    return actionError(error);
  }
}

export async function updateMemberRole(
  memberId: string,
  _previous: TeamMemberActionState,
  formData: FormData,
): Promise<TeamMemberActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const role = formData.get("systemRole");
  if (!envelope.success || !["MANAGER", "RECEPTIONIST", "STAFF"].includes(String(role)) || !exactFields(formData, [
    "contextOrganizationId", "expectedVersion", "idempotencyKey", "systemRole",
  ])) return { code: "INVALID_REQUEST", message: "Invalid role request.", status: "error" };
  try {
    const result = await updateOperationalMemberRole({
      actor: await currentBusinessOperationReference(),
      memberId,
      systemRole: role as "MANAGER" | "RECEPTIONIST" | "STAFF",
      ...envelope.data,
    });
    refresh(memberId);
    return state(result, "Role updated.");
  } catch (error) {
    return actionError(error);
  }
}

export async function setMemberActive(
  memberId: string,
  active: boolean,
  _previous: TeamMemberActionState,
  formData: FormData,
): Promise<TeamMemberActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || !exactFields(formData, ["confirmFutureBookings", "contextOrganizationId", "expectedVersion", "idempotencyKey"])) {
    return { code: "INVALID_REQUEST", message: "Invalid membership lifecycle request.", status: "error" };
  }
  try {
    const result = await setOperationalMembershipActive({
      active,
      actor: await currentBusinessOperationReference(),
      confirmFutureBookings: formData.get("confirmFutureBookings") === "on",
      memberId,
      ...envelope.data,
    });
    refresh(memberId);
    return state(result, active ? "Membership activated." : "Membership deactivated.");
  } catch (error) {
    return actionError(error);
  }
}

export async function removeMember(
  memberId: string,
  _previous: TeamMemberActionState,
  formData: FormData,
): Promise<TeamMemberActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || !exactFields(formData, ["confirmFutureBookings", "contextOrganizationId", "expectedVersion", "idempotencyKey"])) {
    return { code: "INVALID_REQUEST", message: "Invalid membership removal request.", status: "error" };
  }
  try {
    const result = await removeOperationalMembership({
      actor: await currentBusinessOperationReference(),
      confirmFutureBookings: formData.get("confirmFutureBookings") === "on",
      memberId,
      ...envelope.data,
    });
    refresh(memberId);
    return state(result, "Membership removed.");
  } catch (error) {
    return actionError(error);
  }
}

export async function addBranchAssignment(
  memberId: string,
  _previous: TeamMemberActionState,
  formData: FormData,
): Promise<TeamMemberActionState> {
  const envelope = createOperationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  const branchId = formData.get("branchId");
  if (!envelope.success || typeof branchId !== "string" || !exactFields(formData, ["branchId", "contextOrganizationId", "idempotencyKey"])) {
    return { code: "INVALID_REQUEST", message: "Invalid Branch assignment request.", status: "error" };
  }
  try {
    const result = await addOperationalBranchAssignment({
      actor: await currentBusinessOperationReference(),
      branchId,
      memberId,
      ...envelope.data,
    });
    refresh(memberId);
    return state(result, "Branch assignment added.");
  } catch (error) {
    return actionError(error);
  }
}

export async function removeBranchAssignment(
  assignmentId: string,
  _previous: TeamMemberActionState,
  formData: FormData,
): Promise<TeamMemberActionState> {
  const envelope = operationEnvelopeSchema.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!envelope.success || !exactFields(formData, ["confirmFutureBookings", "contextOrganizationId", "expectedVersion", "idempotencyKey"])) {
    return { code: "INVALID_REQUEST", message: "Invalid Branch assignment removal request.", status: "error" };
  }
  try {
    const result = await removeOperationalBranchAssignment({
      actor: await currentBusinessOperationReference(),
      assignmentId,
      confirmFutureBookings: formData.get("confirmFutureBookings") === "on",
      ...envelope.data,
    });
    refresh();
    return state(result, "Branch assignment removed.");
  } catch (error) {
    return actionError(error);
  }
}
