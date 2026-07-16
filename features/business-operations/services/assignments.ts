import "server-only";

import type { Prisma } from "@prisma/client";

import { businessOperationsError } from "@/features/business-operations/domain/errors";
import { canManageWorkforceRole } from "@/features/business-operations/domain/services-workforce";
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
  lockBranch,
  lockMembership,
  lockOrganization,
  lockService,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { futureMemberImpact } from "@/features/business-operations/services/workforce";

async function requireAssignableMember(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  memberId: string,
) {
  const member = await transaction.organizationMember.findFirst({
    where: {
      deletedAt: null,
      id: memberId,
      organizationId: actor.organizationId,
      status: "ACTIVE",
      person: { deletedAt: null, status: "ACTIVE" },
      role: { organizationId: actor.organizationId },
    },
    include: { role: true },
  });
  if (!member) businessOperationsError("MEMBER_NOT_FOUND", "Active workforce member was not found.");
  if (!canManageWorkforceRole(actor.role, member.role.systemRole)) {
    businessOperationsError("FORBIDDEN", "This role cannot manage assignments for the target member.");
  }
  return member;
}

async function replayRelationship(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  input: { idempotencyKey: string; requestHash: string },
) {
  return resolveMutationReplay(transaction, {
    actorMembershipId: actor.membershipId,
    idempotencyKey: input.idempotencyKey,
    organizationId: actor.organizationId,
    requestHash: input.requestHash,
  });
}

export async function addOperationalBranchAssignment(input: {
  actor: BusinessOperationActorReference;
  branchId: string;
  contextOrganizationId: string;
  idempotencyKey: string;
  memberId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "BRANCH_ASSIGNMENT_WRITE");
  assertBusinessOperationMutationRate(actor, "branch-assignment-add");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "BRANCH_ASSIGNMENT_ADD",
    branchId: input.branchId,
    memberId: input.memberId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockMembership(transaction, input.memberId, actor.organizationId);
    await lockBranch(transaction, input.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "BRANCH_ASSIGNMENT_WRITE");
    const replay = await replayRelationship(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) {
      const current = replay.targetId
        ? await transaction.branchAssignment.findFirst({
          where: {
            id: replay.targetId,
            branch: { organizationId: actor.organizationId },
            member: { organizationId: actor.organizationId },
          },
        })
        : null;
      if (!current || current.createdAt.getTime() !== replay.resultVersion.getTime()) {
        businessOperationsError("STALE_VERSION", "A later Branch assignment change superseded this replay.");
      }
      return { assignmentId: current.id, replayed: true, version: current.createdAt.toISOString() };
    }
    await requireAssignableMember(transaction, actor, input.memberId);
    const branch = await transaction.branch.findFirst({
      where: {
        deletedAt: null,
        id: input.branchId,
        organizationId: actor.organizationId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!branch) businessOperationsError("BRANCH_NOT_FOUND", "Active Branch was not found.");
    const duplicate = await transaction.branchAssignment.findUnique({
      where: {
        memberId_branchId: { branchId: input.branchId, memberId: input.memberId },
      },
      select: { id: true },
    });
    if (duplicate) businessOperationsError("RELATIONSHIP_CONFLICT", "Branch assignment already exists.");
    const created = await transaction.branchAssignment.create({
      data: { branchId: input.branchId, memberId: input.memberId },
    });
    await recordBusinessOperation(transaction, {
      action: "BRANCH_ASSIGNMENT_ADD",
      actor,
      after: { branchId: created.branchId, memberId: created.memberId },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { assignmentId: created.id },
      resultVersion: created.createdAt,
      targetId: created.id,
      targetType: "BranchAssignment",
    });
    return { assignmentId: created.id, replayed: false, version: created.createdAt.toISOString() };
  });
}

export async function removeOperationalBranchAssignment(input: {
  actor: BusinessOperationActorReference;
  assignmentId: string;
  confirmFutureBookings: boolean;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "BRANCH_ASSIGNMENT_WRITE");
  assertBusinessOperationMutationRate(actor, "branch-assignment-remove");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "BRANCH_ASSIGNMENT_REMOVE",
    assignmentId: input.assignmentId,
    confirmFutureBookings: input.confirmFutureBookings,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "BRANCH_ASSIGNMENT_WRITE");
    const replay = await replayRelationship(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    const current = await transaction.branchAssignment.findFirst({
      where: {
        id: input.assignmentId,
        branch: { organizationId: actor.organizationId },
        member: { organizationId: actor.organizationId },
      },
      include: { member: { include: { role: true } } },
    });
    if (replay) {
      if (current) businessOperationsError("STALE_VERSION", "The Branch assignment was recreated or changed.");
      return { assignmentId: input.assignmentId, replayed: true, version: replay.resultVersion.toISOString() };
    }
    if (!current) businessOperationsError("NOT_FOUND", "Branch assignment was not found.");
    await lockMembership(transaction, current.memberId, actor.organizationId);
    await lockBranch(transaction, current.branchId, actor.organizationId);
    if (!canManageWorkforceRole(actor.role, current.member.role.systemRole)) {
      businessOperationsError("FORBIDDEN", "This role cannot remove the target Branch assignment.");
    }
    if (current.createdAt.toISOString() !== input.expectedVersion) {
      businessOperationsError("STALE_VERSION", "The Branch assignment changed. Refresh and retry.");
    }
    const impact = await futureMemberImpact(transaction, current.memberId, { branchId: current.branchId });
    if (impact.total > 0 && !input.confirmFutureBookings) {
      businessOperationsError(
        "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED",
        "Future bookings require explicit confirmation.",
        impact,
      );
    }
    const removedAt = new Date();
    await transaction.branchAssignment.delete({ where: { id: current.id } });
    await recordBusinessOperation(transaction, {
      action: "BRANCH_ASSIGNMENT_REMOVE",
      actor,
      after: { deleted: true },
      before: { branchId: current.branchId, memberId: current.memberId },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { assignmentId: current.id, deleted: true },
      resultVersion: removedAt,
      targetId: current.id,
      targetType: "BranchAssignment",
    });
    return { assignmentId: current.id, replayed: false, version: removedAt.toISOString() };
  });
}

export async function addOperationalServiceAssignment(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  idempotencyKey: string;
  memberId: string;
  serviceId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "SERVICE_ASSIGNMENT_WRITE");
  assertBusinessOperationMutationRate(actor, "service-assignment-add");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "SERVICE_ASSIGNMENT_ADD",
    memberId: input.memberId,
    serviceId: input.serviceId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockMembership(transaction, input.memberId, actor.organizationId);
    await lockService(transaction, input.serviceId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "SERVICE_ASSIGNMENT_WRITE");
    const replay = await replayRelationship(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) {
      const current = replay.targetId
        ? await transaction.serviceStaffAssignment.findFirst({
          where: {
            id: replay.targetId,
            member: { organizationId: actor.organizationId },
            service: { organizationId: actor.organizationId },
          },
        })
        : null;
      if (!current || current.createdAt.getTime() !== replay.resultVersion.getTime()) {
        businessOperationsError("STALE_VERSION", "A later Service assignment change superseded this replay.");
      }
      return { assignmentId: current.id, replayed: true, version: current.createdAt.toISOString() };
    }
    await requireAssignableMember(transaction, actor, input.memberId);
    const [service, branchAssignments] = await Promise.all([
      transaction.service.findFirst({
        where: {
          deletedAt: null,
          id: input.serviceId,
          organizationId: actor.organizationId,
          status: "ACTIVE",
        },
        select: { id: true },
      }),
      transaction.branchAssignment.count({
        where: {
          memberId: input.memberId,
          branch: {
            deletedAt: null,
            organizationId: actor.organizationId,
            status: "ACTIVE",
          },
        },
      }),
    ]);
    if (!service || branchAssignments === 0) {
      businessOperationsError("RELATIONSHIP_CONFLICT", "An active Service and Branch assignment are required.");
    }
    const duplicate = await transaction.serviceStaffAssignment.findUnique({
      where: {
        serviceId_memberId: {
          memberId: input.memberId,
          serviceId: input.serviceId,
        },
      },
      select: { id: true },
    });
    if (duplicate) businessOperationsError("RELATIONSHIP_CONFLICT", "Service assignment already exists.");
    const created = await transaction.serviceStaffAssignment.create({
      data: { memberId: input.memberId, serviceId: input.serviceId },
    });
    await recordBusinessOperation(transaction, {
      action: "SERVICE_ASSIGNMENT_ADD",
      actor,
      after: { memberId: created.memberId, serviceId: created.serviceId },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { assignmentId: created.id },
      resultVersion: created.createdAt,
      targetId: created.id,
      targetType: "ServiceStaffAssignment",
    });
    return { assignmentId: created.id, replayed: false, version: created.createdAt.toISOString() };
  });
}

export async function removeOperationalServiceAssignment(input: {
  actor: BusinessOperationActorReference;
  assignmentId: string;
  confirmFutureBookings: boolean;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "SERVICE_ASSIGNMENT_WRITE");
  assertBusinessOperationMutationRate(actor, "service-assignment-remove");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "SERVICE_ASSIGNMENT_REMOVE",
    assignmentId: input.assignmentId,
    confirmFutureBookings: input.confirmFutureBookings,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "SERVICE_ASSIGNMENT_WRITE");
    const replay = await replayRelationship(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    const current = await transaction.serviceStaffAssignment.findFirst({
      where: {
        id: input.assignmentId,
        member: { organizationId: actor.organizationId },
        service: { organizationId: actor.organizationId },
      },
      include: { member: { include: { role: true } } },
    });
    if (replay) {
      if (current) businessOperationsError("STALE_VERSION", "The Service assignment was recreated or changed.");
      return { assignmentId: input.assignmentId, replayed: true, version: replay.resultVersion.toISOString() };
    }
    if (!current) businessOperationsError("NOT_FOUND", "Service assignment was not found.");
    await lockMembership(transaction, current.memberId, actor.organizationId);
    await lockService(transaction, current.serviceId, actor.organizationId);
    if (!canManageWorkforceRole(actor.role, current.member.role.systemRole)) {
      businessOperationsError("FORBIDDEN", "This role cannot remove the target Service assignment.");
    }
    if (current.createdAt.toISOString() !== input.expectedVersion) {
      businessOperationsError("STALE_VERSION", "The Service assignment changed. Refresh and retry.");
    }
    const impact = await futureMemberImpact(transaction, current.memberId, { serviceId: current.serviceId });
    if (impact.total > 0 && !input.confirmFutureBookings) {
      businessOperationsError(
        "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED",
        "Future bookings require explicit confirmation.",
        impact,
      );
    }
    const removedAt = new Date();
    await transaction.serviceStaffAssignment.delete({ where: { id: current.id } });
    await recordBusinessOperation(transaction, {
      action: "SERVICE_ASSIGNMENT_REMOVE",
      actor,
      after: { deleted: true },
      before: { memberId: current.memberId, serviceId: current.serviceId },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { assignmentId: current.id, deleted: true },
      resultVersion: removedAt,
      targetId: current.id,
      targetType: "ServiceStaffAssignment",
    });
    return { assignmentId: current.id, replayed: false, version: removedAt.toISOString() };
  });
}
