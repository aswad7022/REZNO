import "server-only";

import { TZDate } from "@date-fns/tz";
import type { Prisma } from "@prisma/client";

import { businessOperationsError } from "@/features/business-operations/domain/errors";
import { canPerformBusinessOperation } from "@/features/business-operations/domain/policy";
import {
  canManageWorkforceRole,
  operationalMemberBlockSchema,
} from "@/features/business-operations/domain/services-workforce";
import { hashBusinessOperation } from "@/features/business-operations/domain/validation";
import { recordBusinessOperation } from "@/features/business-operations/services/audit";
import {
  assertBusinessOperationActorCurrent,
  assertBusinessOperationMutationRate,
  assertRenderedOrganization,
  resolveBusinessOperationActor,
  type BusinessOperationActor,
  type BusinessOperationActorReference,
} from "@/features/business-operations/services/context";
import {
  assertExpectedVersion,
  lockBranch,
  lockMembership,
  lockOrganization,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { prisma } from "@/lib/db/prisma";

const MAX_MEMBER_BLOCK_DURATION_MS = 31 * 86_400_000;

function localInstant(value: string, timezone: string) {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const zoned = new TZDate(year, month - 1, day, hour, minute, timezone);
  const roundTrip = `${zoned.getFullYear()}-${String(zoned.getMonth() + 1).padStart(2, "0")}-${String(zoned.getDate()).padStart(2, "0")}T${String(zoned.getHours()).padStart(2, "0")}:${String(zoned.getMinutes()).padStart(2, "0")}`;
  if (roundTrip !== value) {
    businessOperationsError("INVALID_REQUEST", "The local time does not exist in this Branch timezone.");
  }
  return new Date(zoned);
}

function blockSnapshot(block: {
  branchId: string;
  endsAt: Date;
  memberId: string | null;
  reason: string | null;
  startsAt: Date;
}) {
  return {
    branchId: block.branchId,
    endsAt: block.endsAt.toISOString(),
    memberId: block.memberId,
    reason: block.reason,
    startsAt: block.startsAt.toISOString(),
  };
}

async function requireMemberBranch(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  memberId: string,
  branchId: string,
) {
  const assignment = await transaction.branchAssignment.findFirst({
    where: {
      branchId,
      memberId,
      branch: {
        deletedAt: null,
        organizationId: actor.organizationId,
        status: "ACTIVE",
      },
      member: {
        deletedAt: null,
        organizationId: actor.organizationId,
        status: "ACTIVE",
        person: { deletedAt: null, status: "ACTIVE" },
        role: { organizationId: actor.organizationId },
      },
    },
    include: { branch: true, member: { include: { role: true } } },
  });
  if (!assignment) businessOperationsError("NOT_FOUND", "Active member Branch assignment was not found.");
  return assignment;
}

function assertMemberReadScope(
  actor: BusinessOperationActor,
  memberId: string,
) {
  if (actor.role === "STAFF" && actor.membershipId !== memberId) {
    businessOperationsError("NOT_FOUND", "Member availability was not found.");
  }
}

function assertMemberWriteScope(
  actor: BusinessOperationActor,
  target: Awaited<ReturnType<typeof requireMemberBranch>>["member"],
) {
  if (
    canPerformBusinessOperation(actor.role, "MEMBER_BLOCK_WRITE_ALL") &&
    (actor.role === "OWNER" || canManageWorkforceRole(actor.role, target.role.systemRole))
  ) {
    return;
  }
  if (
    canPerformBusinessOperation(actor.role, "MEMBER_BLOCK_WRITE_SELF") &&
    actor.membershipId === target.id &&
    actor.role === "STAFF"
  ) {
    return;
  }
  businessOperationsError("FORBIDDEN", "This role cannot mutate the target member block.");
}

function resolveMemberBlock(
  assignment: Awaited<ReturnType<typeof requireMemberBranch>>,
  value: unknown,
) {
  const parsed = operationalMemberBlockSchema.safeParse(value);
  if (!parsed.success || parsed.data.branchId !== assignment.branchId) {
    businessOperationsError("INVALID_REQUEST", "Member block input is invalid.");
  }
  const startsAt = localInstant(parsed.data.startsAt, assignment.branch.timezone);
  const endsAt = localInstant(parsed.data.endsAt, assignment.branch.timezone);
  if (
    startsAt >= endsAt ||
    endsAt <= new Date() ||
    endsAt.getTime() - startsAt.getTime() > MAX_MEMBER_BLOCK_DURATION_MS
  ) {
    businessOperationsError("INVALID_REQUEST", "Member block timing is invalid.");
  }
  return { endsAt, reason: parsed.data.reason, startsAt };
}

async function assertNoMemberBlockOverlap(
  transaction: Prisma.TransactionClient,
  input: {
    blockId?: string;
    endsAt: Date;
    memberId: string;
    startsAt: Date;
  },
) {
  const overlap = await transaction.blockedTime.findFirst({
    where: {
      endsAt: { gt: input.startsAt },
      id: input.blockId ? { not: input.blockId } : undefined,
      memberId: input.memberId,
      startsAt: { lt: input.endsAt },
    },
    select: { id: true },
  });
  if (overlap) businessOperationsError("BLOCK_TIME_CONFLICT", "This member already has overlapping leave.");
}

async function memberBlockImpact(
  transaction: Prisma.TransactionClient,
  input: {
    branchId: string;
    endsAt: Date;
    memberId: string;
    startsAt: Date;
  },
) {
  return transaction.booking.count({
    where: {
      branchId: input.branchId,
      endsAt: { gt: input.startsAt },
      memberId: input.memberId,
      startsAt: { lt: input.endsAt },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
  });
}

export async function listOperationalMemberBlocks(
  reference: BusinessOperationActorReference,
  memberId: string,
) {
  const actor = await resolveBusinessOperationActor(reference, "MEMBER_BLOCK_READ");
  assertMemberReadScope(actor, memberId);
  const member = await prisma.organizationMember.findFirst({
    where: {
      deletedAt: null,
      id: memberId,
      organizationId: actor.organizationId,
      status: "ACTIVE",
      person: { deletedAt: null, status: "ACTIVE" },
      role: { organizationId: actor.organizationId },
    },
    include: {
      assignments: {
        where: { branch: { deletedAt: null, status: "ACTIVE" } },
        include: { branch: true },
        orderBy: { branch: { name: "asc" } },
      },
      blockedTimes: {
        where: { memberId, endsAt: { gt: new Date() } },
        include: { branch: { select: { name: true } } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      },
      person: true,
      role: true,
    },
  });
  if (!member) businessOperationsError("NOT_FOUND", "Member availability was not found.");
  const canWrite =
    (canPerformBusinessOperation(actor.role, "MEMBER_BLOCK_WRITE_ALL") &&
      (actor.role === "OWNER" || canManageWorkforceRole(actor.role, member.role.systemRole))) ||
    (actor.role === "STAFF" && actor.membershipId === member.id &&
      canPerformBusinessOperation(actor.role, "MEMBER_BLOCK_WRITE_SELF"));
  return {
    blocks: member.blockedTimes.map((block) => ({
      ...blockSnapshot(block),
      branchName: block.branch.name,
      id: block.id,
      version: block.updatedAt.toISOString(),
    })),
    branches: member.assignments.map((assignment) => ({
      id: assignment.branch.id,
      name: assignment.branch.name,
      timezone: assignment.branch.timezone,
    })),
    canWrite,
    memberId,
    memberName: member.person.displayName ??
      [member.person.firstName, member.person.lastName].filter(Boolean).join(" "),
    organizationId: actor.organizationId,
    role: actor.role,
  };
}

export async function createOperationalMemberBlock(input: {
  actor: BusinessOperationActorReference;
  block: unknown;
  confirmFutureBookings: boolean;
  contextOrganizationId: string;
  idempotencyKey: string;
  memberId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "MEMBER_BLOCK_READ");
  assertBusinessOperationMutationRate(actor, "member-block-create");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalMemberBlockSchema.safeParse(input.block);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Member block input is invalid.");
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockMembership(transaction, input.memberId, actor.organizationId);
    await lockBranch(transaction, parsed.data.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "MEMBER_BLOCK_READ");
    const assignment = await requireMemberBranch(
      transaction,
      actor,
      input.memberId,
      parsed.data.branchId,
    );
    assertMemberWriteScope(actor, assignment.member);
    const resolved = resolveMemberBlock(assignment, parsed.data);
    const requestHash = hashBusinessOperation({
      action: "MEMBER_BLOCK_CREATE",
      block: {
        branchId: parsed.data.branchId,
        endsAt: resolved.endsAt.toISOString(),
        reason: resolved.reason,
        startsAt: resolved.startsAt.toISOString(),
      },
      confirmFutureBookings: input.confirmFutureBookings,
      memberId: input.memberId,
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
            id: replay.targetId,
            memberId: input.memberId,
            branch: { organizationId: actor.organizationId },
          },
        })
        : null;
      if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
        businessOperationsError("STALE_VERSION", "A later member block change superseded this replay.");
      }
      return { blockId: current.id, replayed: true, version: current.updatedAt.toISOString() };
    }
    await assertNoMemberBlockOverlap(transaction, {
      endsAt: resolved.endsAt,
      memberId: input.memberId,
      startsAt: resolved.startsAt,
    });
    const impact = await memberBlockImpact(transaction, {
      branchId: parsed.data.branchId,
      endsAt: resolved.endsAt,
      memberId: input.memberId,
      startsAt: resolved.startsAt,
    });
    if (impact > 0 && !input.confirmFutureBookings) {
      businessOperationsError(
        "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED",
        "Future bookings overlap this member leave.",
        { total: impact },
      );
    }
    const created = await transaction.blockedTime.create({
      data: {
        branchId: parsed.data.branchId,
        endsAt: resolved.endsAt,
        memberId: input.memberId,
        reason: resolved.reason,
        startsAt: resolved.startsAt,
      },
    });
    await recordBusinessOperation(transaction, {
      action: "MEMBER_BLOCK_CREATE",
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

export async function updateOperationalMemberBlock(input: {
  actor: BusinessOperationActorReference;
  block: unknown;
  blockId: string;
  confirmFutureBookings: boolean;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  memberId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "MEMBER_BLOCK_READ");
  assertBusinessOperationMutationRate(actor, "member-block-update");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalMemberBlockSchema.safeParse(input.block);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Member block input is invalid.");
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockMembership(transaction, input.memberId, actor.organizationId);
    await lockBranch(transaction, parsed.data.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "MEMBER_BLOCK_READ");
    const assignment = await requireMemberBranch(transaction, actor, input.memberId, parsed.data.branchId);
    assertMemberWriteScope(actor, assignment.member);
    const resolved = resolveMemberBlock(assignment, parsed.data);
    const requestHash = hashBusinessOperation({
      action: "MEMBER_BLOCK_UPDATE",
      block: {
        branchId: parsed.data.branchId,
        endsAt: resolved.endsAt.toISOString(),
        reason: resolved.reason,
        startsAt: resolved.startsAt.toISOString(),
      },
      blockId: input.blockId,
      confirmFutureBookings: input.confirmFutureBookings,
      memberId: input.memberId,
    });
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    const current = await transaction.blockedTime.findFirst({
      where: {
        id: input.blockId,
        memberId: input.memberId,
        branch: { organizationId: actor.organizationId },
      },
    });
    if (!current || current.endsAt <= new Date()) businessOperationsError("NOT_FOUND", "Mutable member block was not found.");
    if (replay) {
      if (current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
        businessOperationsError("STALE_VERSION", "A later member block change superseded this replay.");
      }
      return { blockId: current.id, replayed: true, version: current.updatedAt.toISOString() };
    }
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    await assertNoMemberBlockOverlap(transaction, {
      blockId: current.id,
      endsAt: resolved.endsAt,
      memberId: input.memberId,
      startsAt: resolved.startsAt,
    });
    const impact = await memberBlockImpact(transaction, {
      branchId: parsed.data.branchId,
      endsAt: resolved.endsAt,
      memberId: input.memberId,
      startsAt: resolved.startsAt,
    });
    if (impact > 0 && !input.confirmFutureBookings) {
      businessOperationsError(
        "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED",
        "Future bookings overlap this member leave.",
        { total: impact },
      );
    }
    const updated = await transaction.blockedTime.update({
      where: { id: current.id },
      data: {
        branchId: parsed.data.branchId,
        endsAt: resolved.endsAt,
        reason: resolved.reason,
        startsAt: resolved.startsAt,
      },
    });
    await recordBusinessOperation(transaction, {
      action: "MEMBER_BLOCK_UPDATE",
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

export async function deleteOperationalMemberBlock(input: {
  actor: BusinessOperationActorReference;
  blockId: string;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  memberId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "MEMBER_BLOCK_READ");
  assertBusinessOperationMutationRate(actor, "member-block-delete");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "MEMBER_BLOCK_DELETE",
    blockId: input.blockId,
    memberId: input.memberId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockMembership(transaction, input.memberId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "MEMBER_BLOCK_READ");
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    const current = await transaction.blockedTime.findFirst({
      where: {
        id: input.blockId,
        memberId: input.memberId,
        branch: { organizationId: actor.organizationId },
      },
      include: { member: { include: { role: true } } },
    });
    if (replay) {
      if (current) businessOperationsError("STALE_VERSION", "The member block was recreated or changed.");
      return { blockId: input.blockId, replayed: true, version: replay.resultVersion.toISOString() };
    }
    if (!current || current.endsAt <= new Date() || !current.member) {
      businessOperationsError("NOT_FOUND", "Mutable member block was not found.");
    }
    await lockBranch(transaction, current.branchId, actor.organizationId);
    const assignment = await requireMemberBranch(transaction, actor, input.memberId, current.branchId);
    assertMemberWriteScope(actor, assignment.member);
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    const removedAt = new Date();
    await transaction.blockedTime.delete({ where: { id: current.id } });
    await recordBusinessOperation(transaction, {
      action: "MEMBER_BLOCK_DELETE",
      actor,
      after: { deleted: true },
      before: blockSnapshot(current),
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
