import "server-only";

import type { Prisma, SystemRole } from "@prisma/client";

import { businessOperationsError } from "@/features/business-operations/domain/errors";
import { canPerformBusinessOperation } from "@/features/business-operations/domain/policy";
import {
  canAssignRole,
  canManageWorkforceRole,
  operationalMemberProfileSchema,
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
  lockMembership,
  lockOrganization,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { prisma } from "@/lib/db/prisma";

function memberSnapshot(member: {
  bio: string | null;
  deletedAt: Date | null;
  isPublicProfessional: boolean;
  photoUrl: string | null;
  publicSlug: string | null;
  roleId: string;
  specialties: string[];
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
}) {
  return {
    bio: member.bio,
    deletedAt: member.deletedAt?.toISOString() ?? null,
    isPublicProfessional: member.isPublicProfessional,
    photoUrl: member.photoUrl,
    publicSlug: member.publicSlug,
    roleId: member.roleId,
    specialties: member.specialties,
    status: member.status,
  };
}

function memberAuditSnapshot(member: Parameters<typeof memberSnapshot>[0]) {
  const { photoUrl, ...snapshot } = memberSnapshot(member);
  return { ...snapshot, legacyPhotoPresent: Boolean(photoUrl) };
}

async function futureMemberImpact(
  transaction: Prisma.TransactionClient,
  memberId: string,
  filters?: { branchId?: string; serviceId?: string },
  now = new Date(),
) {
  const bookings = await transaction.booking.findMany({
    where: {
      memberId,
      branchId: filters?.branchId,
      branchService: filters?.serviceId
        ? { serviceId: filters.serviceId }
        : undefined,
      startsAt: { gt: now },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { branchId: true, branchService: { select: { serviceId: true } } },
  });
  return {
    affectedBranches: new Set(bookings.map((booking) => booking.branchId)).size,
    affectedServices: new Set(bookings.map((booking) => booking.branchService?.serviceId).filter(Boolean)).size,
    total: bookings.length,
  };
}

async function requireTargetMember(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  memberId: string,
) {
  const member = await transaction.organizationMember.findFirst({
    where: {
      id: memberId,
      organizationId: actor.organizationId,
      role: { organizationId: actor.organizationId },
    },
    include: {
      person: true,
      role: true,
    },
  });
  if (!member) businessOperationsError("MEMBER_NOT_FOUND", "Workforce member was not found.");
  return member;
}

function assertTargetAuthority(actor: BusinessOperationActor, targetRole: SystemRole | null) {
  if (!canManageWorkforceRole(actor.role, targetRole)) {
    businessOperationsError("FORBIDDEN", "This role cannot manage the target workforce member.");
  }
}

async function replayMemberMutation(
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
    ? await transaction.organizationMember.findFirst({
      where: { id: replay.targetId, organizationId: actor.organizationId },
    })
    : null;
  if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
    businessOperationsError("STALE_VERSION", "A later membership change superseded this replay.");
  }
  return {
    memberId: current.id,
    replayed: true,
    status: current.status,
    version: current.updatedAt.toISOString(),
  };
}

export async function listOperationalWorkforce(
  reference: BusinessOperationActorReference,
) {
  const actor = await resolveBusinessOperationActor(reference, "WORKFORCE_READ");
  const canWrite = canPerformBusinessOperation(actor.role, "WORKFORCE_WRITE");
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(actor.role === "STAFF"
        ? { id: actor.membershipId }
        : actor.role === "RECEPTIONIST"
          ? {
            deletedAt: null,
            status: "ACTIVE",
            person: { deletedAt: null, status: "ACTIVE" },
          }
          : {}),
    },
    include: {
      assignments: {
        include: { branch: { select: { id: true, name: true, status: true } } },
        orderBy: { branch: { name: "asc" } },
      },
      person: true,
      role: true,
      serviceAssignments: {
        include: { service: { select: { id: true, name: true, status: true, deletedAt: true } } },
        orderBy: { service: { name: "asc" } },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const emails = canWrite
    ? await prisma.user.findMany({
      where: { id: { in: members.map((member) => member.person.authUserId) } },
      select: { email: true, id: true },
    })
    : [];
  const emailByUserId = new Map(emails.map((user) => [user.id, user.email]));
  const invitations = canWrite
    ? await prisma.organizationInvitation.findMany({
      where: { organizationId: actor.organizationId, status: "PENDING" },
      include: { role: { select: { systemRole: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    })
    : [];
  return {
    canWrite,
    invitations: invitations.map((invitation) => ({
      createdAt: invitation.createdAt.toISOString(),
      email: invitation.email,
      expiresAt: invitation.expiresAt?.toISOString() ?? null,
      id: invitation.id,
      role: invitation.role?.systemRole ?? null,
      status: invitation.status,
      version: invitation.updatedAt.toISOString(),
    })),
    members: members.map((member) => ({
      ...memberSnapshot(member),
      avatarUrl: member.person.avatarUrl,
      canManage: canWrite && canManageWorkforceRole(actor.role, member.role.systemRole),
      createdAt: member.createdAt.toISOString(),
      assignments: member.assignments.map((assignment) => ({
        branchId: assignment.branchId,
        branchName: assignment.branch.name,
        branchStatus: assignment.branch.status,
        id: assignment.id,
        version: assignment.createdAt.toISOString(),
      })),
      email: canWrite ? emailByUserId.get(member.person.authUserId) ?? "" : null,
      id: member.id,
      name: member.person.displayName ??
        [member.person.firstName, member.person.lastName].filter(Boolean).join(" "),
      personStatus: member.person.status,
      role: member.role.systemRole,
      serviceAssignments: member.serviceAssignments.map((assignment) => ({
        id: assignment.id,
        serviceId: assignment.serviceId,
        serviceName: assignment.service.name,
        serviceStatus: assignment.service.status,
        version: assignment.createdAt.toISOString(),
      })),
      version: member.updatedAt.toISOString(),
    })),
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    role: actor.role,
  };
}

export async function updateOperationalMemberProfile(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  memberId: string;
  profile: unknown;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "WORKFORCE_WRITE");
  assertBusinessOperationMutationRate(actor, "member-profile");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalMemberProfileSchema.safeParse(input.profile);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Member profile input is invalid.");
  const requestHash = hashBusinessOperation({
    action: "MEMBERSHIP_PROFILE_UPDATE",
    memberId: input.memberId,
    profile: parsed.data,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockMembership(transaction, input.memberId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "WORKFORCE_WRITE");
    const replay = await replayMemberMutation(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    const current = await requireTargetMember(transaction, actor, input.memberId);
    assertTargetAuthority(actor, current.role.systemRole);
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    if (
      parsed.data.isPublicProfessional &&
      (current.person.deletedAt || current.person.status !== "ACTIVE")
    ) {
      businessOperationsError("RELATIONSHIP_CONFLICT", "An active Person is required for a public workforce profile.");
    }
    if (parsed.data.publicSlug) {
      const duplicate = await transaction.organizationMember.findFirst({
        where: {
          id: { not: current.id },
          organizationId: actor.organizationId,
          publicSlug: parsed.data.publicSlug,
        },
        select: { id: true },
      });
      if (duplicate) businessOperationsError("RELATIONSHIP_CONFLICT", "The public workforce slug is already used.");
    }
    const updated = await transaction.organizationMember.update({
      where: { id: current.id },
      data: {
        bio: parsed.data.bio,
        isPublicProfessional: parsed.data.isPublicProfessional,
        publicSlug: parsed.data.isPublicProfessional ? parsed.data.publicSlug : null,
        specialties: parsed.data.specialties,
      },
    });
    await recordBusinessOperation(transaction, {
      action: "MEMBERSHIP_PROFILE_UPDATE",
      actor,
      after: memberAuditSnapshot(updated),
      before: memberAuditSnapshot(current),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { memberId: updated.id },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "OrganizationMember",
    });
    return { memberId: updated.id, replayed: false, status: updated.status, version: updated.updatedAt.toISOString() };
  });
}

export async function updateOperationalMemberRole(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  memberId: string;
  systemRole: "MANAGER" | "RECEPTIONIST" | "STAFF";
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "ROLE_WRITE");
  assertBusinessOperationMutationRate(actor, "member-role");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "MEMBERSHIP_ROLE_UPDATE",
    memberId: input.memberId,
    systemRole: input.systemRole,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockMembership(transaction, input.memberId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "ROLE_WRITE");
    const replay = await replayMemberMutation(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    const current = await requireTargetMember(transaction, actor, input.memberId);
    if (!canAssignRole(actor.role, current.role.systemRole, input.systemRole)) {
      businessOperationsError("FORBIDDEN", "This role change is not permitted.");
    }
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    const role = await transaction.role.upsert({
      where: {
        organizationId_name: {
          name: input.systemRole === "MANAGER"
            ? "Manager"
            : input.systemRole === "RECEPTIONIST" ? "Receptionist" : "Staff",
          organizationId: actor.organizationId,
        },
      },
      create: {
        isSystem: true,
        name: input.systemRole === "MANAGER"
          ? "Manager"
          : input.systemRole === "RECEPTIONIST" ? "Receptionist" : "Staff",
        organizationId: actor.organizationId,
        systemRole: input.systemRole,
      },
      update: { isSystem: true, systemRole: input.systemRole },
    });
    const updated = await transaction.organizationMember.update({
      where: { id: current.id },
      data: { roleId: role.id },
    });
    await recordBusinessOperation(transaction, {
      action: "MEMBERSHIP_ROLE_UPDATE",
      actor,
      after: { role: input.systemRole },
      before: { role: current.role.systemRole },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { memberId: updated.id, role: input.systemRole },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "OrganizationMember",
    });
    return { memberId: updated.id, replayed: false, status: updated.status, version: updated.updatedAt.toISOString() };
  });
}

export async function setOperationalMembershipActive(input: {
  active: boolean;
  actor: BusinessOperationActorReference;
  confirmFutureBookings: boolean;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  memberId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "WORKFORCE_WRITE");
  assertBusinessOperationMutationRate(actor, "member-lifecycle");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const action = input.active ? "MEMBERSHIP_ACTIVATE" : "MEMBERSHIP_DEACTIVATE";
  const requestHash = hashBusinessOperation({
    action,
    confirmFutureBookings: input.confirmFutureBookings,
    memberId: input.memberId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockMembership(transaction, input.memberId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "WORKFORCE_WRITE");
    const replay = await replayMemberMutation(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    const current = await requireTargetMember(transaction, actor, input.memberId);
    assertTargetAuthority(actor, current.role.systemRole);
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    if (input.active && (current.person.deletedAt || current.person.status !== "ACTIVE")) {
      businessOperationsError("RELATIONSHIP_CONFLICT", "An active Person is required to activate membership.");
    }
    if (!input.active) {
      const impact = await futureMemberImpact(transaction, current.id);
      if (impact.total > 0 && !input.confirmFutureBookings) {
        businessOperationsError(
          "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED",
          "Future bookings require explicit confirmation.",
          impact,
        );
      }
    }
    const updated = await transaction.organizationMember.update({
      where: { id: current.id },
      data: {
        deletedAt: input.active ? null : current.deletedAt,
        status: input.active ? "ACTIVE" : "INACTIVE",
      },
    });
    await recordBusinessOperation(transaction, {
      action,
      actor,
      after: memberAuditSnapshot(updated),
      before: memberAuditSnapshot(current),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { memberId: updated.id, status: updated.status },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "OrganizationMember",
    });
    return { memberId: updated.id, replayed: false, status: updated.status, version: updated.updatedAt.toISOString() };
  });
}

export async function removeOperationalMembership(input: {
  actor: BusinessOperationActorReference;
  confirmFutureBookings: boolean;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  memberId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "WORKFORCE_WRITE");
  assertBusinessOperationMutationRate(actor, "member-remove");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "MEMBERSHIP_REMOVE",
    confirmFutureBookings: input.confirmFutureBookings,
    memberId: input.memberId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockMembership(transaction, input.memberId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "WORKFORCE_WRITE");
    const replay = await replayMemberMutation(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    const current = await requireTargetMember(transaction, actor, input.memberId);
    assertTargetAuthority(actor, current.role.systemRole);
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    const impact = await futureMemberImpact(transaction, current.id);
    if (impact.total > 0 && !input.confirmFutureBookings) {
      businessOperationsError(
        "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED",
        "Future bookings require explicit confirmation.",
        impact,
      );
    }
    const removedAt = new Date();
    const updated = await transaction.organizationMember.update({
      where: { id: current.id },
      data: {
        deletedAt: removedAt,
        isPublicProfessional: false,
        publicSlug: null,
        status: "INACTIVE",
      },
    });
    await recordBusinessOperation(transaction, {
      action: "MEMBERSHIP_REMOVE",
      actor,
      after: memberAuditSnapshot(updated),
      before: memberAuditSnapshot(current),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { memberId: updated.id, removed: true },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "OrganizationMember",
    });
    return { memberId: updated.id, replayed: false, status: updated.status, version: updated.updatedAt.toISOString() };
  });
}

export { futureMemberImpact };
