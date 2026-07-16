import "server-only";

import type { Prisma, SystemRole } from "@prisma/client";

import { businessOperationsError } from "@/features/business-operations/domain/errors";
import {
  canInviteRole,
  invitationExpiresAtIsAllowed,
  operationalInvitationSchema,
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
  lockOrganization,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { prisma } from "@/lib/db/prisma";

function normalizeEmail(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

function roleName(role: Exclude<SystemRole, "OWNER">) {
  return role === "MANAGER" ? "Manager" : role === "RECEPTIONIST" ? "Receptionist" : "Staff";
}

function invitationSnapshot(invitation: {
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  expiresAt: Date | null;
  roleId: string | null;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
}) {
  return {
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    cancelledAt: invitation.cancelledAt?.toISOString() ?? null,
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
    roleId: invitation.roleId,
    status: invitation.status,
  };
}

async function replayInvitationMutation(
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
    ? await transaction.organizationInvitation.findFirst({
      where: { id: replay.targetId, organizationId: actor.organizationId },
    })
    : null;
  if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
    businessOperationsError("STALE_VERSION", "A later invitation change superseded this replay.");
  }
  return {
    invitationId: current.id,
    replayed: true,
    status: current.status,
    version: current.updatedAt.toISOString(),
  };
}

export async function createOperationalInvitation(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  idempotencyKey: string;
  invitation: unknown;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "WORKFORCE_WRITE");
  assertBusinessOperationMutationRate(actor, "invitation-create");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const parsed = operationalInvitationSchema.safeParse(input.invitation);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Invitation input is invalid.");
  const expiresAt = new Date(parsed.data.expiresAt);
  if (!invitationExpiresAtIsAllowed(expiresAt)) {
    businessOperationsError("INVALID_REQUEST", "Invitation expiration is outside the allowed range.");
  }
  if (!canInviteRole(actor.role, parsed.data.systemRole)) {
    businessOperationsError("FORBIDDEN", "This invitation role is not permitted.");
  }
  const normalizedEmail = normalizeEmail(parsed.data.email);
  const requestHash = hashBusinessOperation({
    action: "INVITATION_CREATE",
    expiresAt: expiresAt.toISOString(),
    normalizedEmail,
    systemRole: parsed.data.systemRole,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "WORKFORCE_WRITE");
    const replay = await resolveMutationReplay(transaction, {
      actorMembershipId: actor.membershipId,
      idempotencyKey: input.idempotencyKey,
      organizationId: actor.organizationId,
      requestHash,
    });
    if (replay) {
      const current = replay.targetId
        ? await transaction.organizationInvitation.findFirst({
          where: { id: replay.targetId, organizationId: actor.organizationId },
        })
        : null;
      if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
        businessOperationsError("STALE_VERSION", "A later invitation change superseded this replay.");
      }
      return { invitationId: current.id, replayed: true, version: current.updatedAt.toISOString() };
    }
    const actorPerson = await transaction.person.findUnique({
      where: { id: actor.personId },
      select: { authUserId: true },
    });
    const ownUser = actorPerson
      ? await transaction.user.findUnique({
        where: { id: actorPerson.authUserId },
        select: { email: true },
      })
      : null;
    if (ownUser && normalizeEmail(ownUser.email) === normalizedEmail) {
      businessOperationsError("INVITATION_CONFLICT", "A member cannot invite their own identity.");
    }
    const recipientUser = await transaction.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      select: { id: true },
    });
    const recipientPerson = recipientUser
      ? await transaction.person.findUnique({
        where: { authUserId: recipientUser.id },
        select: { deletedAt: true, id: true, status: true },
      })
      : null;
    if (recipientPerson?.deletedAt || (recipientPerson && recipientPerson.status !== "ACTIVE")) {
      businessOperationsError("INVITATION_CONFLICT", "The invitation recipient is unavailable.");
    }
    if (recipientPerson) {
      const membership = await transaction.organizationMember.findUnique({
        where: {
          personId_organizationId: {
            organizationId: actor.organizationId,
            personId: recipientPerson.id,
          },
        },
        select: { status: true, deletedAt: true },
      });
      if (membership?.status === "ACTIVE" && !membership.deletedAt) {
        businessOperationsError("INVITATION_CONFLICT", "The invitation recipient is already an active member.");
      }
    }
    await transaction.organizationInvitation.updateMany({
      where: {
        expiresAt: { lte: new Date() },
        normalizedEmail,
        organizationId: actor.organizationId,
        status: "PENDING",
      },
      data: { status: "EXPIRED" },
    });
    const duplicate = await transaction.organizationInvitation.findFirst({
      where: {
        expiresAt: { gt: new Date() },
        normalizedEmail,
        organizationId: actor.organizationId,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (duplicate) businessOperationsError("INVITATION_CONFLICT", "A valid pending invitation already exists.");
    const role = await transaction.role.upsert({
      where: {
        organizationId_name: {
          name: roleName(parsed.data.systemRole),
          organizationId: actor.organizationId,
        },
      },
      create: {
        isSystem: true,
        name: roleName(parsed.data.systemRole),
        organizationId: actor.organizationId,
        systemRole: parsed.data.systemRole,
      },
      update: { isSystem: true, systemRole: parsed.data.systemRole },
    });
    const created = await transaction.organizationInvitation.create({
      data: {
        email: parsed.data.email.trim(),
        expiresAt,
        invitedByPersonId: actor.personId,
        normalizedEmail,
        organizationId: actor.organizationId,
        recipientPersonId: recipientPerson?.id,
        roleId: role.id,
      },
    });
    await recordBusinessOperation(transaction, {
      action: "INVITATION_CREATE",
      actor,
      after: {
        expiresAt: created.expiresAt?.toISOString() ?? null,
        role: parsed.data.systemRole,
        status: created.status,
      },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { invitationId: created.id },
      resultVersion: created.updatedAt,
      targetId: created.id,
      targetType: "OrganizationInvitation",
    });
    return { invitationId: created.id, replayed: false, version: created.updatedAt.toISOString() };
  });
}

export async function revokeOperationalInvitation(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  invitationId: string;
}) {
  const actor = await resolveBusinessOperationActor(input.actor, "WORKFORCE_WRITE");
  assertBusinessOperationMutationRate(actor, "invitation-revoke");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({ action: "INVITATION_REVOKE", invitationId: input.invitationId });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "WORKFORCE_WRITE");
    const replay = await replayInvitationMutation(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) return replay;
    const current = await transaction.organizationInvitation.findFirst({
      where: {
        id: input.invitationId,
        organizationId: actor.organizationId,
        status: "PENDING",
      },
      include: { role: { select: { systemRole: true } } },
    });
    if (!current) businessOperationsError("NOT_FOUND", "Pending invitation was not found.");
    if (!canInviteRole(actor.role, current.role?.systemRole ?? "OWNER")) {
      businessOperationsError("FORBIDDEN", "This invitation cannot be revoked by the current role.");
    }
    assertExpectedVersion(current.updatedAt, input.expectedVersion);
    const updated = await transaction.organizationInvitation.update({
      where: { id: current.id },
      data: { cancelledAt: new Date(), status: "CANCELLED" },
    });
    await recordBusinessOperation(transaction, {
      action: "INVITATION_REVOKE",
      actor,
      after: invitationSnapshot(updated),
      before: invitationSnapshot(current),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { invitationId: updated.id, status: updated.status },
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "OrganizationInvitation",
    });
    return { invitationId: updated.id, replayed: false, status: updated.status, version: updated.updatedAt.toISOString() };
  });
}

export async function acceptOperationalInvitation(input: {
  email: string;
  idempotencyKey: string;
  invitationId: string;
  personId: string;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const visible = await prisma.organizationInvitation.findFirst({
    where: {
      id: input.invitationId,
      OR: [{ normalizedEmail }, { recipientPersonId: input.personId }],
    },
    select: { organizationId: true },
  });
  if (!visible) businessOperationsError("NOT_FOUND", "Invitation was not found.");
  const requestHash = hashBusinessOperation({
    action: "INVITATION_ACCEPT",
    invitationId: input.invitationId,
    personId: input.personId,
  });
  const result = await runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, visible.organizationId);
    const invitation = await transaction.organizationInvitation.findFirst({
      where: {
        id: input.invitationId,
        organizationId: visible.organizationId,
        OR: [{ normalizedEmail }, { recipientPersonId: input.personId }],
      },
      include: { organization: true, role: true },
    });
    if (!invitation?.role?.systemRole || invitation.role.systemRole === "OWNER") {
      businessOperationsError("NOT_FOUND", "Invitation was not found.");
    }
    if (invitation.status === "PENDING" && (!invitation.expiresAt || invitation.expiresAt <= new Date())) {
      const expired = await transaction.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      return { expired: true as const, invitationId: expired.id };
    }
    let membership = await transaction.organizationMember.findUnique({
      where: {
        personId_organizationId: {
          organizationId: invitation.organizationId,
          personId: input.personId,
        },
      },
      include: { role: true },
    });
    if (invitation.status === "ACCEPTED") {
      if (!membership || invitation.recipientPersonId !== input.personId) {
        businessOperationsError("NOT_FOUND", "Invitation was not found.");
      }
      const actor: BusinessOperationActor = {
        membershipId: membership.id,
        organizationId: invitation.organizationId,
        organizationName: invitation.organization.name,
        organizationSlug: invitation.organization.slug,
        personId: input.personId,
        role: membership.role.systemRole ?? invitation.role.systemRole,
      };
      const replay = await replayInvitationMutation(transaction, actor, {
        idempotencyKey: input.idempotencyKey,
        requestHash,
      });
      if (!replay) businessOperationsError("INVITATION_CONFLICT", "Invitation was already accepted.");
      return { ...replay, expired: false as const, membershipId: membership.id, organizationId: invitation.organizationId };
    }
    if (invitation.status !== "PENDING") {
      businessOperationsError("NOT_FOUND", "Invitation was not found.");
    }
    if (membership?.status === "ACTIVE" && !membership.deletedAt) {
      businessOperationsError("INVITATION_CONFLICT", "An active membership already exists.");
    }
    membership = membership
      ? await transaction.organizationMember.update({
        where: { id: membership.id },
        data: { deletedAt: null, roleId: invitation.role.id, status: "ACTIVE" },
        include: { role: true },
      })
      : await transaction.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          personId: input.personId,
          roleId: invitation.role.id,
          status: "ACTIVE",
        },
        include: { role: true },
      });
    const actor: BusinessOperationActor = {
      membershipId: membership.id,
      organizationId: invitation.organizationId,
      organizationName: invitation.organization.name,
      organizationSlug: invitation.organization.slug,
      personId: input.personId,
      role: membership.role.systemRole ?? invitation.role.systemRole,
    };
    const accepted = await transaction.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        acceptedAt: new Date(),
        recipientPersonId: input.personId,
        status: "ACCEPTED",
      },
    });
    await recordBusinessOperation(transaction, {
      action: "INVITATION_ACCEPT",
      actor,
      after: {
        acceptedAt: accepted.acceptedAt?.toISOString() ?? null,
        role: invitation.role.systemRole,
        status: accepted.status,
      },
      before: { role: invitation.role.systemRole, status: invitation.status },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: { invitationId: accepted.id, membershipId: membership.id },
      resultVersion: accepted.updatedAt,
      targetId: accepted.id,
      targetType: "OrganizationInvitation",
    });
    return {
      expired: false as const,
      invitationId: accepted.id,
      membershipId: membership.id,
      organizationId: invitation.organizationId,
      replayed: false,
      status: accepted.status,
      version: accepted.updatedAt.toISOString(),
    };
  });
  if (result.expired) businessOperationsError("INVITATION_EXPIRED", "Invitation has expired.");
  return result;
}

export async function declineOperationalInvitation(input: {
  email: string;
  invitationId: string;
  personId: string;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const visible = await prisma.organizationInvitation.findFirst({
    where: {
      id: input.invitationId,
      status: "PENDING",
      OR: [{ normalizedEmail }, { recipientPersonId: input.personId }],
    },
    select: { organizationId: true },
  });
  if (!visible) businessOperationsError("NOT_FOUND", "Invitation was not found.");
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, visible.organizationId);
    const invitation = await transaction.organizationInvitation.findFirst({
      where: {
        id: input.invitationId,
        organizationId: visible.organizationId,
        status: "PENDING",
        OR: [{ normalizedEmail }, { recipientPersonId: input.personId }],
      },
    });
    if (!invitation) businessOperationsError("NOT_FOUND", "Invitation was not found.");
    if (!invitation.expiresAt || invitation.expiresAt <= new Date()) {
      await transaction.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      return { invitationId: invitation.id, status: "EXPIRED" as const };
    }
    const declined = await transaction.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        declinedAt: new Date(),
        recipientPersonId: input.personId,
        status: "DECLINED",
      },
    });
    return { invitationId: declined.id, status: declined.status };
  });
}
