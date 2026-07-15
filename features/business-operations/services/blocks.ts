import "server-only";

import { TZDate } from "@date-fns/tz";
import type { Prisma } from "@prisma/client";

import { businessOperationsError } from "@/features/business-operations/domain/errors";
import { requiresReservationImpactConfirmation } from "@/features/business-operations/domain/lifecycle";
import {
  blockLocalInputSchema,
  hashBusinessOperation,
} from "@/features/business-operations/domain/validation";
import { recordBusinessOperation } from "@/features/business-operations/services/audit";
import {
  assertBusinessOperationActorCurrent,
  assertBusinessOperationMutationRate,
  assertRenderedOrganization,
  resolveBusinessOperationActor,
  type BusinessOperationActor,
  type BusinessOperationActorReference,
} from "@/features/business-operations/services/context";
import { intervalReservationImpact } from "@/features/business-operations/services/impact";
import {
  assertExpectedVersion,
  lockBranch,
  lockOrganization,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { prisma } from "@/lib/db/prisma";

const MAX_BLOCK_DURATION_MS = 31 * 86_400_000;

function localInstant(value: string, timezone: string) {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const zoned = new TZDate(year, month - 1, day, hour, minute, timezone);
  const roundTrip = `${zoned.getFullYear()}-${String(zoned.getMonth() + 1).padStart(2, "0")}-${String(zoned.getDate()).padStart(2, "0")}T${String(zoned.getHours()).padStart(2, "0")}:${String(zoned.getMinutes()).padStart(2, "0")}`;
  if (roundTrip !== value) businessOperationsError("INVALID_REQUEST", "The local time does not exist in this Branch timezone.");
  return new Date(zoned);
}

function blockSnapshot(block: { endsAt: Date; reason: string | null; startsAt: Date }) {
  return {
    endsAt: block.endsAt.toISOString(),
    reason: block.reason,
    startsAt: block.startsAt.toISOString(),
  };
}

async function resolveBlockInput(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  branchId: string,
  value: unknown,
) {
  const parsed = blockLocalInputSchema.safeParse(value);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Branch block input is invalid.");
  const branch = await transaction.branch.findFirst({
    where: { id: branchId, organizationId: actor.organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
  });
  if (!branch) businessOperationsError("BRANCH_NOT_FOUND", "Branch was not found.");
  const startsAt = localInstant(parsed.data.startsAt, branch.timezone);
  const endsAt = localInstant(parsed.data.endsAt, branch.timezone);
  if (startsAt >= endsAt || endsAt <= new Date() || endsAt.getTime() - startsAt.getTime() > MAX_BLOCK_DURATION_MS) {
    businessOperationsError("INVALID_REQUEST", "Branch block timing is invalid.");
  }
  return { branch, endsAt, reason: parsed.data.reason, startsAt };
}

async function assertNoOverlap(
  transaction: Prisma.TransactionClient,
  input: { blockId?: string; branchId: string; endsAt: Date; startsAt: Date },
) {
  const overlap = await transaction.blockedTime.findFirst({
    where: {
      branchId: input.branchId,
      id: input.blockId ? { not: input.blockId } : undefined,
      memberId: null,
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
    select: { id: true },
  });
  if (overlap) businessOperationsError("BLOCK_TIME_CONFLICT", "This Branch already has an overlapping closure.");
}

export async function listOperationalBlocks(
  reference: BusinessOperationActorReference,
  branchId: string,
) {
  const actor = await resolveBusinessOperationActor(reference, "BLOCK_READ");
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      organizationId: actor.organizationId,
      deletedAt: null,
      ...(actor.role === "RECEPTIONIST" ? { status: "ACTIVE" as const } : { status: { not: "ARCHIVED" as const } }),
    },
  });
  if (!branch) businessOperationsError("BRANCH_NOT_FOUND", "Branch was not found.");
  const blocks = await prisma.blockedTime.findMany({
    where: { branchId: branch.id, memberId: null },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  return {
    branchId: branch.id,
    branchName: branch.name,
    canWrite: true,
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    timezone: branch.timezone,
    blocks: blocks.map((block) => ({
      ...blockSnapshot(block),
      id: block.id,
      historical: block.endsAt <= new Date(),
      version: block.updatedAt.toISOString(),
    })),
  };
}

export async function createOperationalBlock(input: {
  actor: BusinessOperationActorReference;
  block: unknown;
  branchId: string;
  confirmFutureReservations: boolean;
  contextOrganizationId: string;
  idempotencyKey: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "BLOCK_WRITE");
  assertBusinessOperationMutationRate(actor, "block-create");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockBranch(transaction, input.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "BLOCK_WRITE");
    const resolved = await resolveBlockInput(transaction, actor, input.branchId, input.block);
    const requestHash = hashBusinessOperation({
      action: "BLOCK_CREATE",
      block: blockSnapshot(resolved),
      branchId: input.branchId,
      confirmFutureReservations: input.confirmFutureReservations,
    });
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    if (replay) {
      const current = replay.targetId
        ? await transaction.blockedTime.findFirst({
          where: {
            branchId: input.branchId,
            id: replay.targetId,
            memberId: null,
            branch: { organizationId: actor.organizationId },
          },
        })
        : null;
      if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
        businessOperationsError("STALE_VERSION", "A later block change superseded this replay.");
      }
      return { blockId: current.id, replayed: true, version: current.updatedAt.toISOString() };
    }
    await assertNoOverlap(transaction, { branchId: input.branchId, endsAt: resolved.endsAt, startsAt: resolved.startsAt });
    const impact = await intervalReservationImpact(transaction, input.branchId, resolved.startsAt, resolved.endsAt);
    if (requiresReservationImpactConfirmation(impact) && !input.confirmFutureReservations) {
      businessOperationsError("FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED", "Future reservations overlap this closure.", { ...impact });
    }
    const created = await transaction.blockedTime.create({
      data: { branchId: input.branchId, endsAt: resolved.endsAt, memberId: null, reason: resolved.reason, startsAt: resolved.startsAt },
    });
    await recordBusinessOperation(transaction, {
      action: "BLOCK_CREATE",
      actor,
      after: blockSnapshot(created),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { blockId: created.id },
      resultVersion: created.updatedAt,
      targetId: created.id,
      targetType: "BlockedTime",
    });
    return { blockId: created.id, replayed: false, version: created.updatedAt.toISOString() };
  });
}

export async function updateOperationalBlock(input: {
  actor: BusinessOperationActorReference;
  block: unknown;
  blockId: string;
  branchId: string;
  confirmFutureReservations: boolean;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "BLOCK_WRITE");
  assertBusinessOperationMutationRate(actor, "block-update");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockBranch(transaction, input.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "BLOCK_WRITE");
    const resolved = await resolveBlockInput(transaction, actor, input.branchId, input.block);
    const requestHash = hashBusinessOperation({
      action: "BLOCK_UPDATE",
      block: blockSnapshot(resolved),
      blockId: input.blockId,
      branchId: input.branchId,
      confirmFutureReservations: input.confirmFutureReservations,
    });
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    const current = await transaction.blockedTime.findFirst({
      where: { id: input.blockId, branchId: input.branchId, memberId: null, branch: { organizationId: actor.organizationId } },
    });
    if (!current || current.endsAt <= new Date()) businessOperationsError("NOT_FOUND", "Mutable Branch block was not found.");
    if (replay) {
      if (current.updatedAt.getTime() !== replay.resultVersion.getTime()) businessOperationsError("STALE_VERSION", "A later block change superseded this replay.");
      return { blockId: current.id, replayed: true, version: current.updatedAt.toISOString() };
    }
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    await assertNoOverlap(transaction, { blockId: current.id, branchId: input.branchId, endsAt: resolved.endsAt, startsAt: resolved.startsAt });
    const impact = await intervalReservationImpact(transaction, input.branchId, resolved.startsAt, resolved.endsAt);
    if (requiresReservationImpactConfirmation(impact) && !input.confirmFutureReservations) businessOperationsError("FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED", "Future reservations overlap this closure.", { ...impact });
    const updated = await transaction.blockedTime.update({
      where: { id: current.id },
      data: { endsAt: resolved.endsAt, reason: resolved.reason, startsAt: resolved.startsAt },
    });
    await recordBusinessOperation(transaction, {
      action: "BLOCK_UPDATE",
      actor,
      after: blockSnapshot(updated),
      before: blockSnapshot(current),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { blockId: updated.id },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "BlockedTime",
    });
    return { blockId: updated.id, replayed: false, version: updated.updatedAt.toISOString() };
  });
}

export async function deleteOperationalBlock(input: {
  actor: BusinessOperationActorReference;
  blockId: string;
  branchId: string;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "BLOCK_WRITE");
  assertBusinessOperationMutationRate(actor, "block-delete");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({ action: "BLOCK_DELETE", blockId: input.blockId, branchId: input.branchId });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockBranch(transaction, input.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "BLOCK_WRITE");
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    const current = await transaction.blockedTime.findFirst({
      where: { id: input.blockId, branchId: input.branchId, memberId: null, branch: { organizationId: actor.organizationId } },
    });
    if (replay) {
      if (current) businessOperationsError("STALE_VERSION", "The deleted block was recreated or changed.");
      return { blockId: input.blockId, replayed: true, version: replay.resultVersion.toISOString() };
    }
    if (!current || current.endsAt <= new Date()) businessOperationsError("NOT_FOUND", "Mutable Branch block was not found.");
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    const removedAt = new Date();
    await transaction.blockedTime.delete({ where: { id: current.id } });
    await recordBusinessOperation(transaction, {
      action: "BLOCK_DELETE",
      actor,
      before: blockSnapshot(current),
      after: { deleted: true },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { blockId: current.id, deleted: true },
      resultVersion: removedAt,
      targetId: current.id,
      targetType: "BlockedTime",
    });
    return { blockId: current.id, replayed: false, version: removedAt.toISOString() };
  });
}
