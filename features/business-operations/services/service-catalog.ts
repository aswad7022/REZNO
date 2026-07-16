import "server-only";

import type { Prisma, ServiceStatus, SystemRole } from "@prisma/client";

import { businessOperationsError } from "@/features/business-operations/domain/errors";
import { canPerformBusinessOperation } from "@/features/business-operations/domain/policy";
import { operationalServiceSchema } from "@/features/business-operations/domain/services-workforce";
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
  lockOrganization,
  lockService,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { prisma } from "@/lib/db/prisma";

type ServiceInput = ReturnType<typeof operationalServiceSchema.parse>;

function serviceSnapshot(service: {
  categoryId: string;
  deletedAt: Date | null;
  description: string | null;
  imageUrl: string | null;
  name: string;
  staffSelectionMode: "NONE" | "OPTIONAL" | "REQUIRED";
  status: ServiceStatus;
}) {
  return {
    categoryId: service.categoryId,
    deletedAt: service.deletedAt?.toISOString() ?? null,
    description: service.description,
    imageUrl: service.imageUrl,
    name: service.name,
    staffSelectionMode: service.staffSelectionMode,
    status: service.status,
  };
}

function toServiceData(input: ServiceInput) {
  return {
    categoryId: input.categoryId,
    description: input.description,
    imageUrl: input.imageUrl,
    name: input.name,
    staffSelectionMode: input.staffSelectionMode,
  };
}

async function requireCategory(
  transaction: Prisma.TransactionClient,
  categoryId: string,
) {
  const category = await transaction.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) businessOperationsError("INVALID_REQUEST", "Service category is invalid.");
}

async function futureServiceImpact(
  transaction: Prisma.TransactionClient,
  serviceId: string,
  now = new Date(),
) {
  const bookings = await transaction.booking.findMany({
    where: {
      branchService: { serviceId },
      startsAt: { gt: now },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: {
      branchId: true,
      branchServiceId: true,
    },
  });
  return {
    affectedBranches: new Set(bookings.map((booking) => booking.branchId)).size,
    affectedOfferings: new Set(bookings.map((booking) => booking.branchServiceId).filter(Boolean)).size,
    total: bookings.length,
  };
}

async function replayServiceMutation(
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
    ? await transaction.service.findFirst({
      where: { id: replay.targetId, organizationId: actor.organizationId },
    })
    : null;
  if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
    businessOperationsError("STALE_VERSION", "A later Service change superseded this replay.");
  }
  return {
    replayed: true,
    serviceId: current.id,
    status: current.status,
    version: current.updatedAt.toISOString(),
  };
}

export async function listOperationalServices(
  reference: BusinessOperationActorReference,
) {
  const actor = await resolveBusinessOperationActor(reference, "SERVICE_READ");
  const canWrite = canPerformBusinessOperation(actor.role, "SERVICE_WRITE");
  if (canWrite) return listManagementServiceCatalog(actor);
  if (actor.role === "STAFF") return listStaffServiceCatalog(actor);
  return listReceptionistServiceCatalog(actor);
}

const managementServiceAssignmentRoles = {
  MANAGER: ["RECEPTIONIST", "STAFF"],
  OWNER: ["MANAGER", "RECEPTIONIST", "STAFF"],
} as const satisfies Record<"MANAGER" | "OWNER", readonly SystemRole[]>;

async function listManagementServiceCatalog(actor: BusinessOperationActor) {
  const manageableRoles = actor.role === "OWNER"
    ? managementServiceAssignmentRoles.OWNER
    : managementServiceAssignmentRoles.MANAGER;
  const services = await prisma.service.findMany({
    where: { organizationId: actor.organizationId },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      branchServices: {
        where: { branch: { organizationId: actor.organizationId } },
        include: { branch: { select: { id: true, name: true, status: true, deletedAt: true } } },
        orderBy: { branch: { name: "asc" } },
      },
      staffAssignments: {
        where: {
          member: {
            organizationId: actor.organizationId,
            role: { systemRole: { in: [...manageableRoles] } },
          },
        },
        select: { createdAt: true, id: true, memberId: true },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  return {
    canWrite: true as const,
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    role: actor.role,
    scope: "MANAGEMENT" as const,
    services: services.map((service) => ({
      ...serviceSnapshot(service),
      assignedMemberIds: service.staffAssignments.map((assignment) => assignment.memberId),
      staffAssignments: service.staffAssignments.map((assignment) => ({
        id: assignment.id,
        memberId: assignment.memberId,
        version: assignment.createdAt.toISOString(),
      })),
      category: service.category,
      id: service.id,
      offerings: service.branchServices.map((offering) => ({
        branchId: offering.branchId,
        branchName: offering.branch.name,
        branchStatus: offering.branch.status,
        durationMinutes: offering.durationMinutes,
        id: offering.id,
        isAvailable: offering.isAvailable,
        price: offering.price.toString(),
        pricingType: offering.pricingType,
        version: offering.updatedAt.toISOString(),
      })),
      version: service.updatedAt.toISOString(),
    })),
  };
}

function readOnlyService(service: {
  branchServices: Array<{
    branch: { name: string };
    durationMinutes: number;
    price: { toString(): string };
  }>;
  description: string | null;
  imageUrl: string | null;
  name: string;
}) {
  return {
    description: service.description ?? "",
    imageUrl: service.imageUrl ?? "",
    name: service.name,
    offerings: service.branchServices.map((offering) => ({
      branchName: offering.branch.name,
      durationMinutes: offering.durationMinutes,
      price: offering.price.toString(),
    })),
  };
}

async function listReceptionistServiceCatalog(actor: BusinessOperationActor) {
  const services = await prisma.service.findMany({
    where: {
      deletedAt: null,
      organizationId: actor.organizationId,
      status: "ACTIVE",
    },
    select: {
      branchServices: {
        where: {
          branch: {
            deletedAt: null,
            organizationId: actor.organizationId,
            status: "ACTIVE",
          },
          isAvailable: true,
        },
        select: {
          branch: { select: { name: true } },
          durationMinutes: true,
          price: true,
        },
        orderBy: { branch: { name: "asc" } },
      },
      description: true,
      imageUrl: true,
      name: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return {
    canWrite: false as const,
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    role: actor.role,
    scope: "RECEPTIONIST" as const,
    services: services.map(readOnlyService),
  };
}

async function listStaffServiceCatalog(actor: BusinessOperationActor) {
  const activeSelf = {
    deletedAt: null,
    id: actor.membershipId,
    organizationId: actor.organizationId,
    person: { deletedAt: null, status: "ACTIVE" as const },
    status: "ACTIVE" as const,
  };
  const [services, activeBranchAssignment] = await Promise.all([
    prisma.service.findMany({
      where: {
        deletedAt: null,
        organizationId: actor.organizationId,
        staffAssignments: { some: { member: activeSelf, memberId: actor.membershipId } },
        status: "ACTIVE",
      },
      select: {
        branchServices: {
          where: {
            branch: {
              assignments: { some: { member: activeSelf, memberId: actor.membershipId } },
              deletedAt: null,
              organizationId: actor.organizationId,
              status: "ACTIVE",
            },
            isAvailable: true,
          },
          select: {
            branch: { select: { name: true } },
            durationMinutes: true,
            price: true,
          },
          orderBy: { branch: { name: "asc" } },
        },
        description: true,
        imageUrl: true,
        name: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.branchAssignment.findFirst({
      where: {
        branch: {
          deletedAt: null,
          organizationId: actor.organizationId,
          status: "ACTIVE",
        },
        member: activeSelf,
        memberId: actor.membershipId,
      },
      select: { id: true },
    }),
  ]);
  return {
    canWrite: false as const,
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    role: actor.role,
    scheduleMemberId: activeBranchAssignment ? actor.membershipId : null,
    scope: "STAFF" as const,
    services: services.map(readOnlyService),
  };
}

export async function createOperationalService(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  idempotencyKey: string;
  service: unknown;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "SERVICE_WRITE");
  assertBusinessOperationMutationRate(actor, "service-create");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalServiceSchema.safeParse(input.service);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Service input is invalid.");
  const requestHash = hashBusinessOperation({ action: "SERVICE_CREATE", service: parsed.data });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "SERVICE_WRITE");
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    if (replay) {
      const current = replay.targetId
        ? await transaction.service.findFirst({
          where: { id: replay.targetId, organizationId: actor.organizationId },
        })
        : null;
      if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
        businessOperationsError("STALE_VERSION", "A later Service change superseded this replay.");
      }
      return { replayed: true, serviceId: current.id, version: current.updatedAt.toISOString() };
    }
    await requireCategory(transaction, parsed.data.categoryId);
    const created = await transaction.service.create({
      data: {
        ...toServiceData(parsed.data),
        organizationId: actor.organizationId,
        status: "ACTIVE",
      },
    });
    await recordBusinessOperation(transaction, {
      action: "SERVICE_CREATE",
      actor,
      after: serviceSnapshot(created),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { serviceId: created.id },
      resultVersion: created.updatedAt,
      targetId: created.id,
      targetType: "Service",
    });
    return { replayed: false, serviceId: created.id, version: created.updatedAt.toISOString() };
  });
}

export async function updateOperationalService(input: {
  actor: BusinessOperationActorReference;
  confirmFutureBookings: boolean;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  service: unknown;
  serviceId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "SERVICE_WRITE");
  assertBusinessOperationMutationRate(actor, "service-update");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalServiceSchema.safeParse(input.service);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Service input is invalid.");
  const requestHash = hashBusinessOperation({
    action: "SERVICE_UPDATE",
    confirmFutureBookings: input.confirmFutureBookings,
    service: parsed.data,
    serviceId: input.serviceId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockService(transaction, input.serviceId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "SERVICE_WRITE");
    const replay = await replayServiceMutation(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    const current = await transaction.service.findFirst({
      where: {
        deletedAt: null,
        id: input.serviceId,
        organizationId: actor.organizationId,
        status: { not: "ARCHIVED" },
      },
    });
    if (!current) businessOperationsError("SERVICE_NOT_FOUND", "Service was not found.");
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    await requireCategory(transaction, parsed.data.categoryId);
    if (current.staffSelectionMode !== parsed.data.staffSelectionMode) {
      const impact = await futureServiceImpact(transaction, current.id);
      if (impact.total > 0 && !input.confirmFutureBookings) {
        businessOperationsError(
          "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED",
          "Future bookings require explicit confirmation.",
          impact,
        );
      }
    }
    const updated = await transaction.service.update({
      where: { id: current.id },
      data: toServiceData(parsed.data),
    });
    await recordBusinessOperation(transaction, {
      action: "SERVICE_UPDATE",
      actor,
      after: serviceSnapshot(updated),
      before: serviceSnapshot(current),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { serviceId: updated.id },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "Service",
    });
    return {
      replayed: false,
      serviceId: updated.id,
      status: updated.status,
      version: updated.updatedAt.toISOString(),
    };
  });
}

export async function setOperationalServiceActive(input: {
  active: boolean;
  actor: BusinessOperationActorReference;
  confirmFutureBookings: boolean;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  serviceId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "SERVICE_WRITE");
  assertBusinessOperationMutationRate(actor, "service-lifecycle");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const action = input.active ? "SERVICE_ACTIVATE" : "SERVICE_DEACTIVATE";
  const requestHash = hashBusinessOperation({
    action,
    confirmFutureBookings: input.confirmFutureBookings,
    serviceId: input.serviceId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockService(transaction, input.serviceId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "SERVICE_WRITE");
    const replay = await replayServiceMutation(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    const current = await transaction.service.findFirst({
      where: {
        deletedAt: null,
        id: input.serviceId,
        organizationId: actor.organizationId,
        status: { not: "ARCHIVED" },
      },
    });
    if (!current) businessOperationsError("SERVICE_NOT_FOUND", "Service was not found.");
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    if (!input.active) {
      const impact = await futureServiceImpact(transaction, current.id);
      if (impact.total > 0 && !input.confirmFutureBookings) {
        businessOperationsError(
          "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED",
          "Future bookings require explicit confirmation.",
          impact,
        );
      }
    }
    const updated = await transaction.service.update({
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
      result: { serviceId: updated.id, status: updated.status },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "Service",
    });
    return {
      replayed: false,
      serviceId: updated.id,
      status: updated.status,
      version: updated.updatedAt.toISOString(),
    };
  });
}

export async function archiveOperationalService(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  serviceId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "SERVICE_WRITE");
  assertBusinessOperationMutationRate(actor, "service-archive");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({ action: "SERVICE_ARCHIVE", serviceId: input.serviceId });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockService(transaction, input.serviceId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "SERVICE_WRITE");
    const replay = await replayServiceMutation(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    const current = await transaction.service.findFirst({
      where: {
        deletedAt: null,
        id: input.serviceId,
        organizationId: actor.organizationId,
        status: { not: "ARCHIVED" },
      },
    });
    if (!current) businessOperationsError("SERVICE_NOT_FOUND", "Service was not found.");
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    if (current.status !== "INACTIVE") {
      businessOperationsError("SERVICE_ARCHIVE_CONFLICT", "Only an inactive Service can be archived.");
    }
    const [impact, activeOfferings, activeAssignments] = await Promise.all([
      futureServiceImpact(transaction, current.id),
      transaction.branchService.count({
        where: { isAvailable: true, serviceId: current.id },
      }),
      transaction.serviceStaffAssignment.count({
        where: {
          serviceId: current.id,
          member: {
            deletedAt: null,
            status: "ACTIVE",
            person: { deletedAt: null, status: "ACTIVE" },
          },
        },
      }),
    ]);
    if (impact.total > 0 || activeOfferings > 0 || activeAssignments > 0) {
      businessOperationsError(
        "SERVICE_ARCHIVE_CONFLICT",
        "Active operational relationships prevent Service archival.",
        { ...impact, activeAssignments, activeOfferings },
      );
    }
    const archivedAt = new Date();
    const updated = await transaction.service.update({
      where: { id: current.id },
      data: { deletedAt: archivedAt, status: "ARCHIVED" },
    });
    await recordBusinessOperation(transaction, {
      action: "SERVICE_ARCHIVE",
      actor,
      after: serviceSnapshot(updated),
      before: serviceSnapshot(current),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { serviceId: updated.id, status: updated.status },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "Service",
    });
    return {
      replayed: false,
      serviceId: updated.id,
      status: updated.status,
      version: updated.updatedAt.toISOString(),
    };
  });
}
