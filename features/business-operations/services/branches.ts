import "server-only";

import { randomUUID } from "node:crypto";
import type { EntityStatus, Prisma } from "@prisma/client";

import { businessOperationsError } from "@/features/business-operations/domain/errors";
import { canPerformBusinessOperation } from "@/features/business-operations/domain/policy";
import { branchArchiveConflicts, requiresReservationImpactConfirmation } from "@/features/business-operations/domain/lifecycle";
import {
  hashBusinessOperation,
  operationalBranchSchema,
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
import { futureReservationImpact } from "@/features/business-operations/services/impact";
import {
  assertExpectedVersion,
  lockBranch,
  lockOrganization,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { prisma } from "@/lib/db/prisma";

type BranchInput = ReturnType<typeof operationalBranchSchema.parse>;

function slugify(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

function branchSnapshot(branch: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  latitude: { toString(): string } | null;
  locationInstructions: string | null;
  locationLabel: string | null;
  longitude: { toString(): string } | null;
  name: string;
  nearbyLandmark: string | null;
  phone: string | null;
  status: EntityStatus;
  timezone: string;
}) {
  return {
    addressLine1: branch.addressLine1,
    addressLine2: branch.addressLine2,
    city: branch.city,
    country: branch.country,
    email: branch.email,
    latitude: branch.latitude?.toString() ?? null,
    locationInstructions: branch.locationInstructions,
    locationLabel: branch.locationLabel,
    longitude: branch.longitude?.toString() ?? null,
    name: branch.name,
    nearbyLandmark: branch.nearbyLandmark,
    phone: branch.phone,
    status: branch.status,
    timezone: branch.timezone,
  };
}

function toBranchData(input: BranchInput) {
  return {
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    country: input.country,
    email: input.email,
    latitude: input.latitude,
    locationInstructions: input.locationInstructions,
    locationLabel: input.locationLabel,
    longitude: input.longitude,
    name: input.name,
    nearbyLandmark: input.nearbyLandmark,
    phone: input.phone,
    timezone: input.timezone,
  };
}

export async function listOperationalBranches(reference: BusinessOperationActorReference) {
  const actor = await resolveBusinessOperationActor(reference, "BRANCH_READ");
  const canWrite = canPerformBusinessOperation(actor.role, "BRANCH_WRITE");
  const canArchive = canPerformBusinessOperation(actor.role, "BRANCH_ARCHIVE");
  const branches = await prisma.branch.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(canWrite ? {} : { deletedAt: null, status: "ACTIVE" as const }),
    },
    include: {
      businessHours: { where: { isOpen: true }, select: { dayOfWeek: true } },
      blockedTimes: {
        where: { memberId: null, endsAt: { gt: new Date() } },
        select: { id: true },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  return {
    canArchive,
    canWrite,
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    role: actor.role,
    branches: branches.map((branch) => ({
      ...branchSnapshot(branch),
      id: branch.id,
      slug: branch.slug,
      version: branch.updatedAt.toISOString(),
      archivedAt: branch.deletedAt?.toISOString() ?? null,
      openDays: branch.businessHours.map((day) => day.dayOfWeek),
      upcomingBlockCount: branch.blockedTimes.length,
    })),
  };
}

export async function createOperationalBranch(input: {
  actor: BusinessOperationActorReference;
  branch: unknown;
  contextOrganizationId: string;
  idempotencyKey: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "BRANCH_WRITE");
  assertBusinessOperationMutationRate(actor, "branch-create");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalBranchSchema.safeParse(input.branch);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Branch input is invalid.");
  const requestHash = hashBusinessOperation({ action: "BRANCH_CREATE", branch: parsed.data });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "BRANCH_WRITE");
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    if (replay) {
      if (!replay.targetId) businessOperationsError("IDEMPOTENCY_CONFLICT", "Branch replay target is unavailable.");
      const current = await transaction.branch.findFirst({ where: { id: replay.targetId, organizationId: actor.organizationId } });
      if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
        businessOperationsError("STALE_VERSION", "A later Branch change superseded this replay.");
      }
      return { branchId: current.id, replayed: true, version: current.updatedAt.toISOString() };
    }
    const slug = `${slugify(parsed.data.name) || "branch"}-${randomUUID().slice(0, 8)}`;
    const branch = await transaction.branch.create({
      data: {
        ...toBranchData(parsed.data),
        organizationId: actor.organizationId,
        slug,
        status: "ACTIVE",
        businessHours: {
          create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            closeTime: "17:00",
            dayOfWeek,
            isOpen: false,
            openTime: "09:00",
          })),
        },
      },
    });
    await recordBusinessOperation(transaction, {
      action: "BRANCH_CREATE",
      actor,
      after: branchSnapshot(branch),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { branchId: branch.id },
      resultVersion: branch.updatedAt,
      targetId: branch.id,
      targetType: "Branch",
    });
    return { branchId: branch.id, replayed: false, version: branch.updatedAt.toISOString() };
  });
}

async function replayBranchMutation(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  input: { idempotencyKey: string; requestHash: string },
) {
  const replay = await resolveMutationReplay(transaction, {
    actorMembershipId: actor.membershipId,
    idempotencyKey: input.idempotencyKey,
    organizationId: actor.organizationId,
    requestHash: input.requestHash,
  });
  if (!replay) return null;
  const current = replay.targetId
    ? await transaction.branch.findFirst({ where: { id: replay.targetId, organizationId: actor.organizationId } })
    : null;
  if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
    businessOperationsError("STALE_VERSION", "A later Branch change superseded this replay.");
  }
  return { branchId: current.id, replayed: true, version: current.updatedAt.toISOString() };
}

export async function updateOperationalBranch(input: {
  actor: BusinessOperationActorReference;
  branch: unknown;
  branchId: string;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "BRANCH_WRITE");
  assertBusinessOperationMutationRate(actor, "branch-update");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalBranchSchema.safeParse(input.branch);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Branch input is invalid.");
  const requestHash = hashBusinessOperation({ action: "BRANCH_UPDATE", branch: parsed.data, branchId: input.branchId });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockBranch(transaction, input.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "BRANCH_WRITE");
    const replay = await replayBranchMutation(transaction, actor, { idempotencyKey: input.idempotencyKey, requestHash });
    if (replay) return replay;
    const current = await transaction.branch.findFirst({
      where: { id: input.branchId, organizationId: actor.organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
    });
    if (!current) businessOperationsError("BRANCH_NOT_FOUND", "Branch was not found.");
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    if (current.timezone !== parsed.data.timezone) {
      const impact = await futureReservationImpact(transaction, current.id);
      if (impact.total > 0) {
        businessOperationsError("TIMEZONE_CHANGE_CONFLICT", "Future reservations prevent a timezone change.", { ...impact });
      }
    }
    const updated = await transaction.branch.update({ where: { id: current.id }, data: toBranchData(parsed.data) });
    await recordBusinessOperation(transaction, {
      action: "BRANCH_UPDATE",
      actor,
      after: branchSnapshot(updated),
      before: branchSnapshot(current),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { branchId: updated.id },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "Branch",
    });
    return { branchId: updated.id, replayed: false, version: updated.updatedAt.toISOString() };
  });
}

export async function setOperationalBranchActive(input: {
  active: boolean;
  actor: BusinessOperationActorReference;
  branchId: string;
  confirmFutureReservations: boolean;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "BRANCH_WRITE");
  assertBusinessOperationMutationRate(actor, "branch-lifecycle");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const action = input.active ? "BRANCH_ACTIVATE" : "BRANCH_DEACTIVATE";
  const requestHash = hashBusinessOperation({
    action,
    branchId: input.branchId,
    confirmFutureReservations: input.confirmFutureReservations,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockBranch(transaction, input.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "BRANCH_WRITE");
    const replay = await replayBranchMutation(transaction, actor, { idempotencyKey: input.idempotencyKey, requestHash });
    if (replay) return replay;
    const current = await transaction.branch.findFirst({
      where: { id: input.branchId, organizationId: actor.organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
    });
    if (!current) businessOperationsError("BRANCH_NOT_FOUND", "Branch was not found.");
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    if (!input.active) {
      const otherActive = await transaction.branch.count({
        where: { organizationId: actor.organizationId, id: { not: current.id }, deletedAt: null, status: "ACTIVE" },
      });
      if (otherActive === 0) businessOperationsError("BRANCH_LAST_ACTIVE", "The final active Branch cannot be deactivated.");
      const impact = await futureReservationImpact(transaction, current.id);
      if (requiresReservationImpactConfirmation(impact) && !input.confirmFutureReservations) {
        businessOperationsError("FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED", "Future reservations require explicit confirmation.", { ...impact });
      }
    }
    const updated = await transaction.branch.update({
      where: { id: current.id },
      data: { status: input.active ? "ACTIVE" : "INACTIVE" },
    });
    await recordBusinessOperation(transaction, {
      action,
      actor,
      after: { status: updated.status },
      before: { status: current.status },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { branchId: updated.id, status: updated.status },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "Branch",
    });
    return { branchId: updated.id, replayed: false, version: updated.updatedAt.toISOString() };
  });
}

export async function archiveOperationalBranch(input: {
  actor: BusinessOperationActorReference;
  branchId: string;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "BRANCH_ARCHIVE");
  assertBusinessOperationMutationRate(actor, "branch-archive");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({ action: "BRANCH_ARCHIVE", branchId: input.branchId });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockBranch(transaction, input.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "BRANCH_ARCHIVE");
    const replay = await replayBranchMutation(transaction, actor, { idempotencyKey: input.idempotencyKey, requestHash });
    if (replay) return replay;
    const current = await transaction.branch.findFirst({
      where: { id: input.branchId, organizationId: actor.organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
    });
    if (!current) businessOperationsError("BRANCH_NOT_FOUND", "Branch was not found.");
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    if (current.status !== "INACTIVE") {
      businessOperationsError("BRANCH_ARCHIVE_CONFLICT", "Only an inactive Branch can be archived.");
    }
    const [impact, activeOfferings, activeAssignments, activeTables] = await Promise.all([
      futureReservationImpact(transaction, current.id),
      transaction.branchService.count({ where: { branchId: current.id, isAvailable: true } }),
      transaction.branchAssignment.count({ where: { branchId: current.id, member: { deletedAt: null, status: "ACTIVE" } } }),
      transaction.restaurantTable.count({ where: { branchId: current.id, isActive: true } }),
    ]);
    if (branchArchiveConflicts({ ...impact, activeAssignments, activeOfferings, activeTables }).length) {
      businessOperationsError("BRANCH_ARCHIVE_CONFLICT", "Active operational relationships prevent Branch archival.", {
        ...impact,
        activeAssignments,
        activeOfferings,
        activeTables,
      });
    }
    const archivedAt = new Date();
    const updated = await transaction.branch.update({
      where: { id: current.id },
      data: { deletedAt: archivedAt, status: "ARCHIVED" },
    });
    await recordBusinessOperation(transaction, {
      action: "BRANCH_ARCHIVE",
      actor,
      after: { archivedAt: archivedAt.toISOString(), status: updated.status },
      before: { archivedAt: null, status: current.status },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { branchId: updated.id },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "Branch",
    });
    return { branchId: updated.id, replayed: false, version: updated.updatedAt.toISOString() };
  });
}
