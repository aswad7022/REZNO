import "server-only";

import { businessOperationsError } from "@/features/business-operations/domain/errors";
import { normalizeOperationalSchedule } from "@/features/business-operations/domain/hours";
import { requiresReservationImpactConfirmation } from "@/features/business-operations/domain/lifecycle";
import {
  hashBusinessOperation,
  operationalHoursSchema,
} from "@/features/business-operations/domain/validation";
import { recordBusinessOperation } from "@/features/business-operations/services/audit";
import {
  assertBusinessOperationActorCurrent,
  assertBusinessOperationMutationRate,
  assertRenderedOrganization,
  resolveBusinessOperationActor,
  type BusinessOperationActorReference,
} from "@/features/business-operations/services/context";
import { hoursReservationImpact } from "@/features/business-operations/services/impact";
import {
  assertExpectedVersion,
  lockBranch,
  lockOrganization,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { prisma } from "@/lib/db/prisma";

export async function readOperationalHours(
  reference: BusinessOperationActorReference,
  branchId: string,
) {
  const actor = await resolveBusinessOperationActor(reference, "HOURS_READ");
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      organizationId: actor.organizationId,
      deletedAt: null,
      ...(actor.role === "RECEPTIONIST" ? { status: "ACTIVE" as const } : { status: { not: "ARCHIVED" as const } }),
    },
    include: { businessHours: { orderBy: { dayOfWeek: "asc" } } },
  });
  if (!branch) businessOperationsError("BRANCH_NOT_FOUND", "Branch was not found.");
  return {
    branchId: branch.id,
    branchName: branch.name,
    canWrite: actor.role === "OWNER" || actor.role === "MANAGER",
    days: normalizeOperationalSchedule(branch.businessHours),
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    timezone: branch.timezone,
    version: branch.updatedAt.toISOString(),
  };
}

export async function updateOperationalHours(input: {
  actor: BusinessOperationActorReference;
  branchId: string;
  confirmFutureReservations: boolean;
  contextOrganizationId: string;
  days: unknown;
  expectedVersion: string;
  idempotencyKey: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "HOURS_WRITE");
  assertBusinessOperationMutationRate(actor, "hours-update");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalHoursSchema.safeParse({ days: input.days });
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Working hours are invalid.");
  const days = [...parsed.data.days].sort((left, right) => left.dayOfWeek - right.dayOfWeek);
  const requestHash = hashBusinessOperation({
    action: "HOURS_UPDATE",
    branchId: input.branchId,
    confirmFutureReservations: input.confirmFutureReservations,
    days,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockBranch(transaction, input.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "HOURS_WRITE");
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    const branch = await transaction.branch.findFirst({
      where: { id: input.branchId, organizationId: actor.organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
      include: { businessHours: { orderBy: { dayOfWeek: "asc" } } },
    });
    if (!branch) businessOperationsError("BRANCH_NOT_FOUND", "Branch was not found.");
    if (replay) {
      if (branch.updatedAt.getTime() !== replay.resultVersion.getTime()) {
        businessOperationsError("STALE_VERSION", "A later hours change superseded this replay.");
      }
      return { replayed: true, version: branch.updatedAt.toISOString() };
    }
    assertExpectedVersion(branch.updatedAt, input.expectedVersion);
    const impact = await hoursReservationImpact(transaction, {
      branchId: branch.id,
      days,
      timezone: branch.timezone,
    });
    if (requiresReservationImpactConfirmation(impact) && !input.confirmFutureReservations) {
      businessOperationsError("FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED", "Future reservations fall outside the new hours.", { ...impact });
    }
    const before = normalizeOperationalSchedule(branch.businessHours);
    await transaction.businessHour.deleteMany({ where: { branchId: branch.id } });
    await transaction.businessHour.createMany({
      data: days.map((day) => ({ ...day, branchId: branch.id })),
    });
    const updated = await transaction.branch.update({
      where: { id: branch.id },
      data: { updatedAt: new Date() },
    });
    await recordBusinessOperation(transaction, {
      action: "HOURS_UPDATE",
      actor,
      after: days,
      before,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { branchId: branch.id },
      resultVersion: updated.updatedAt,
      targetId: branch.id,
      targetType: "BusinessHours",
    });
    return { replayed: false, version: updated.updatedAt.toISOString() };
  });
}
