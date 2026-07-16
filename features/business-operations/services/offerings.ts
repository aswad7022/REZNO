import "server-only";

import { Prisma } from "@prisma/client";

import { businessOperationsError } from "@/features/business-operations/domain/errors";
import { operationalOfferingSchema } from "@/features/business-operations/domain/services-workforce";
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
  lockOrganization,
  lockService,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";

function offeringSnapshot(offering: {
  branchId: string;
  durationMinutes: number;
  isAvailable: boolean;
  price: { toString(): string };
  pricingType: "FIXED" | "STARTING_FROM";
  serviceId: string;
}) {
  return {
    branchId: offering.branchId,
    durationMinutes: offering.durationMinutes,
    isAvailable: offering.isAvailable,
    price: offering.price.toString(),
    pricingType: offering.pricingType,
    serviceId: offering.serviceId,
  };
}

async function requireOfferingRelationships(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  branchId: string,
  serviceId: string,
) {
  const [branch, service] = await Promise.all([
    transaction.branch.findFirst({
      where: {
        deletedAt: null,
        id: branchId,
        organizationId: actor.organizationId,
        status: { not: "ARCHIVED" },
      },
      select: { id: true },
    }),
    transaction.service.findFirst({
      where: {
        deletedAt: null,
        id: serviceId,
        organizationId: actor.organizationId,
        status: { not: "ARCHIVED" },
      },
      select: { id: true },
    }),
  ]);
  if (!branch || !service) {
    businessOperationsError("OFFERING_NOT_FOUND", "Service offering relationships were not found.");
  }
}

async function futureOfferingImpact(
  transaction: Prisma.TransactionClient,
  offeringId: string,
  now = new Date(),
) {
  return transaction.booking.count({
    where: {
      branchServiceId: offeringId,
      startsAt: { gt: now },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
  });
}

async function replayOfferingMutation(
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
    ? await transaction.branchService.findFirst({
      where: {
        id: replay.targetId,
        branch: { organizationId: actor.organizationId },
        service: { organizationId: actor.organizationId },
      },
    })
    : null;
  if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
    businessOperationsError("STALE_VERSION", "A later offering change superseded this replay.");
  }
  return {
    offeringId: current.id,
    replayed: true,
    version: current.updatedAt.toISOString(),
  };
}

export async function createOperationalOffering(input: {
  actor: BusinessOperationActorReference;
  branchId: string;
  contextOrganizationId: string;
  idempotencyKey: string;
  offering: unknown;
  serviceId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "OFFERING_WRITE");
  assertBusinessOperationMutationRate(actor, "offering-create");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalOfferingSchema.safeParse(input.offering);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Offering input is invalid.");
  const requestHash = hashBusinessOperation({
    action: "OFFERING_CREATE",
    branchId: input.branchId,
    offering: parsed.data,
    serviceId: input.serviceId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockService(transaction, input.serviceId, actor.organizationId);
    await lockBranch(transaction, input.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "OFFERING_WRITE");
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    if (replay) {
      const current = replay.targetId
        ? await transaction.branchService.findFirst({
          where: {
            id: replay.targetId,
            branch: { organizationId: actor.organizationId },
            service: { organizationId: actor.organizationId },
          },
        })
        : null;
      if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
        businessOperationsError("STALE_VERSION", "A later offering change superseded this replay.");
      }
      return { offeringId: current.id, replayed: true, version: current.updatedAt.toISOString() };
    }
    await requireOfferingRelationships(transaction, actor, input.branchId, input.serviceId);
    const existing = await transaction.branchService.findUnique({
      where: {
        branchId_serviceId: {
          branchId: input.branchId,
          serviceId: input.serviceId,
        },
      },
      select: { id: true },
    });
    if (existing) businessOperationsError("OFFERING_CONFLICT", "This Branch already has the Service offering.");
    const created = await transaction.branchService.create({
      data: {
        branchId: input.branchId,
        durationMinutes: parsed.data.durationMinutes,
        isAvailable: true,
        price: new Prisma.Decimal(parsed.data.price),
        pricingType: parsed.data.pricingType,
        serviceId: input.serviceId,
      },
    });
    await recordBusinessOperation(transaction, {
      action: "OFFERING_CREATE",
      actor,
      after: offeringSnapshot(created),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { offeringId: created.id },
      resultVersion: created.updatedAt,
      targetId: created.id,
      targetType: "BranchService",
    });
    return { offeringId: created.id, replayed: false, version: created.updatedAt.toISOString() };
  });
}

export async function updateOperationalOffering(input: {
  actor: BusinessOperationActorReference;
  confirmFutureBookings: boolean;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  isAvailable: boolean;
  offering: unknown;
  offeringId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "OFFERING_WRITE");
  assertBusinessOperationMutationRate(actor, "offering-update");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalOfferingSchema.safeParse(input.offering);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Offering input is invalid.");
  const requestHash = hashBusinessOperation({
    action: "OFFERING_UPDATE",
    confirmFutureBookings: input.confirmFutureBookings,
    isAvailable: input.isAvailable,
    offering: parsed.data,
    offeringId: input.offeringId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    const scoped = await transaction.branchService.findFirst({
      where: {
        id: input.offeringId,
        branch: { organizationId: actor.organizationId },
        service: { organizationId: actor.organizationId },
      },
      select: { branchId: true, serviceId: true },
    });
    if (!scoped) businessOperationsError("OFFERING_NOT_FOUND", "Service offering was not found.");
    await lockService(transaction, scoped.serviceId, actor.organizationId);
    await lockBranch(transaction, scoped.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "OFFERING_WRITE");
    const replay = await replayOfferingMutation(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    await requireOfferingRelationships(transaction, actor, scoped.branchId, scoped.serviceId);
    const current = await transaction.branchService.findFirst({
      where: {
        id: input.offeringId,
        branch: { organizationId: actor.organizationId },
        service: { organizationId: actor.organizationId },
      },
    });
    if (!current) businessOperationsError("OFFERING_NOT_FOUND", "Service offering was not found.");
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    const materialChange =
      current.durationMinutes !== parsed.data.durationMinutes ||
      current.price.toString() !== new Prisma.Decimal(parsed.data.price).toString() ||
      current.pricingType !== parsed.data.pricingType ||
      (current.isAvailable && !input.isAvailable);
    const futureBookings = materialChange
      ? await futureOfferingImpact(transaction, current.id)
      : 0;
    if (futureBookings > 0 && !input.confirmFutureBookings) {
      businessOperationsError(
        "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED",
        "Future bookings require explicit confirmation.",
        { total: futureBookings },
      );
    }
    const updated = await transaction.branchService.update({
      where: { id: current.id },
      data: {
        durationMinutes: parsed.data.durationMinutes,
        isAvailable: input.isAvailable,
        price: new Prisma.Decimal(parsed.data.price),
        pricingType: parsed.data.pricingType,
      },
    });
    await recordBusinessOperation(transaction, {
      action: updated.isAvailable
        ? current.isAvailable ? "OFFERING_UPDATE" : "OFFERING_ENABLE"
        : "OFFERING_DISABLE",
      actor,
      after: offeringSnapshot(updated),
      before: offeringSnapshot(current),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { offeringId: updated.id },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "BranchService",
    });
    return { offeringId: updated.id, replayed: false, version: updated.updatedAt.toISOString() };
  });
}

export async function removeOperationalOffering(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  offeringId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "OFFERING_WRITE");
  assertBusinessOperationMutationRate(actor, "offering-remove");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({ action: "OFFERING_REMOVE", offeringId: input.offeringId });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "OFFERING_WRITE");
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    const current = await transaction.branchService.findFirst({
      where: {
        id: input.offeringId,
        branch: { organizationId: actor.organizationId },
        service: { organizationId: actor.organizationId },
      },
    });
    if (replay) {
      if (current) businessOperationsError("STALE_VERSION", "The removed offering was recreated or changed.");
      return { offeringId: input.offeringId, replayed: true, version: replay.resultVersion.toISOString() };
    }
    if (!current) businessOperationsError("OFFERING_NOT_FOUND", "Service offering was not found.");
    await lockService(transaction, current.serviceId, actor.organizationId);
    await lockBranch(transaction, current.branchId, actor.organizationId);
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    const [bookings, favorites] = await Promise.all([
      transaction.booking.count({ where: { branchServiceId: current.id } }),
      transaction.customerFavoriteService.count({ where: { branchServiceId: current.id } }),
    ]);
    if (bookings > 0 || favorites > 0) {
      businessOperationsError(
        "OFFERING_CONFLICT",
        "Historical or active relationships prevent offering removal.",
        { bookings, favorites },
      );
    }
    const removedAt = new Date();
    await transaction.branchService.delete({ where: { id: current.id } });
    await recordBusinessOperation(transaction, {
      action: "OFFERING_REMOVE",
      actor,
      after: { deleted: true },
      before: offeringSnapshot(current),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { deleted: true, offeringId: current.id },
      resultVersion: removedAt,
      targetId: current.id,
      targetType: "BranchService",
    });
    return { offeringId: current.id, replayed: false, version: removedAt.toISOString() };
  });
}
