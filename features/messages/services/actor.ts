import "server-only";

import type { Prisma } from "@prisma/client";

import type { AdminPermission } from "@/features/admin/config/permissions";
import {
  resolveAdminGrant,
  resolvedAdminHasPermission,
} from "@/features/admin/policies/admin-authorization";
import type { MessageActor } from "@/features/messages/domain/contracts";
import { messageError } from "@/features/messages/domain/errors";

export async function assertMessageActorCurrent(
  transaction: Prisma.TransactionClient,
  actor: MessageActor,
  permission: AdminPermission = "MESSAGES_VIEW",
): Promise<MessageActor> {
  if (actor.kind === "customer") {
    const person = await transaction.person.findFirst({
      where: {
        authUserId: actor.userId,
        deletedAt: null,
        id: actor.personId,
        isOnboarded: true,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!person) messageError("FORBIDDEN", "The Customer identity changed.");
    return actor;
  }
  if (actor.kind === "business") {
    const membership = await transaction.organizationMember.findFirst({
      where: {
        deletedAt: null,
        id: actor.membershipId,
        organizationId: actor.organizationId,
        personId: actor.personId,
        roleId: actor.roleId,
        status: "ACTIVE",
        organization: {
          deletedAt: null,
          isActive: true,
          status: "ACTIVE",
        },
        person: {
          authUserId: actor.userId,
          deletedAt: null,
          isOnboarded: true,
          status: "ACTIVE",
        },
        role: {
          id: actor.roleId,
          organizationId: actor.organizationId,
          systemRole: actor.systemRole,
        },
      },
      select: { id: true },
    });
    if (!membership) {
      messageError("FORBIDDEN", "The active Business messaging scope changed.");
    }
    return actor;
  }

  const person = await transaction.person.findFirst({
    where: {
      authUserId: actor.userId,
      deletedAt: null,
      id: actor.personId,
      isOnboarded: true,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!person) messageError("FORBIDDEN", "The Admin identity changed.");
  const user = await transaction.user.findUnique({
    where: { id: actor.userId },
    select: { email: true },
  });
  const envSuperAdmin = Boolean(
    actor.adminSource === "env" &&
      user &&
      getMessageAdminEmails().has(user.email.trim().toLowerCase()),
  );
  const databaseAccess = envSuperAdmin
    ? null
    : await transaction.adminAccess.findUnique({ where: { userId: actor.userId } });
  const grant = resolveAdminGrant({ databaseAccess, envSuperAdmin });
  if (!resolvedAdminHasPermission(grant, permission)) {
    messageError("FORBIDDEN", `Current Admin permission ${permission} is required.`);
  }
  return actor;
}

function getMessageAdminEmails() {
  return new Set(
    (process.env.REZNO_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
