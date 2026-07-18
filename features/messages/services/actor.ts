import "server-only";

import { Prisma } from "@prisma/client";

import type { AdminPermission } from "@/features/admin/config/permissions";
import {
  resolveAdminGrant,
  resolvedAdminHasPermission,
} from "@/features/admin/policies/admin-authorization";
import { refreshAdminMessageActor } from "@/features/messages/domain/admin-actor";
import type { MessageActor } from "@/features/messages/domain/contracts";
import { messageError } from "@/features/messages/domain/errors";

type MessageAuthorizationTestHook = (
  actor: MessageActor,
) => Promise<void> | void;

let authorizationTestHook: MessageAuthorizationTestHook | undefined;

export function setMessageAuthorizationTestHook(
  hook: MessageAuthorizationTestHook | undefined,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Messaging authorization test hooks are unavailable in production.",
    );
  }
  authorizationTestHook = hook;
}

export async function assertMessageActorCurrent(
  transaction: Prisma.TransactionClient,
  actor: MessageActor,
  permission: AdminPermission = "MESSAGES_VIEW",
): Promise<MessageActor> {
  if (actor.kind === "customer") {
    const person = await transaction.$queryRaw<
      Array<{ id: string }>
    >(Prisma.sql`
      SELECT person."id"
      FROM "Person" AS person
      WHERE person."id" = ${actor.personId}::uuid
        AND person."authUserId" = ${actor.userId}
        AND person."deletedAt" IS NULL
        AND person."isOnboarded" = TRUE
        AND person."status" = 'ACTIVE'
      FOR SHARE OF person
    `);
    if (!person[0]) messageError("FORBIDDEN", "The Customer identity changed.");
    await authorizationTestHook?.(actor);
    return actor;
  }
  if (actor.kind === "business") {
    const membership = await transaction.$queryRaw<
      Array<{ id: string }>
    >(Prisma.sql`
      SELECT membership."id"
      FROM "OrganizationMember" AS membership
      JOIN "Person" AS person ON person."id" = membership."personId"
      JOIN "Organization" AS organization ON organization."id" = membership."organizationId"
      JOIN "Role" AS role ON role."id" = membership."roleId"
      WHERE membership."id" = ${actor.membershipId}::uuid
        AND membership."organizationId" = ${actor.organizationId}::uuid
        AND membership."personId" = ${actor.personId}::uuid
        AND membership."roleId" = ${actor.roleId}::uuid
        AND membership."deletedAt" IS NULL
        AND membership."status" = 'ACTIVE'
        AND person."authUserId" = ${actor.userId}
        AND person."deletedAt" IS NULL
        AND person."isOnboarded" = TRUE
        AND person."status" = 'ACTIVE'
        AND organization."deletedAt" IS NULL
        AND organization."isActive" = TRUE
        AND organization."status" = 'ACTIVE'
        AND role."id" = ${actor.roleId}::uuid
        AND role."organizationId" = ${actor.organizationId}::uuid
        AND role."systemRole" = ${actor.systemRole}::"SystemRole"
      FOR SHARE OF membership, person, organization, role
    `);
    if (!membership[0]) {
      messageError("FORBIDDEN", "The active Business messaging scope changed.");
    }
    await authorizationTestHook?.(actor);
    return actor;
  }

  const identities = await transaction.$queryRaw<
    Array<{ email: string }>
  >(Prisma.sql`
    SELECT auth_user."email"
    FROM "Person" AS person
    JOIN "user" AS auth_user ON auth_user."id" = person."authUserId"
    WHERE person."id" = ${actor.personId}::uuid
      AND person."authUserId" = ${actor.userId}
      AND person."deletedAt" IS NULL
      AND person."isOnboarded" = TRUE
      AND person."status" = 'ACTIVE'
    FOR SHARE OF person, auth_user
  `);
  const identity = identities[0];
  if (!identity) messageError("FORBIDDEN", "The Admin identity changed.");
  const envSuperAdmin = Boolean(
    getMessageAdminEmails().has(identity.email.trim().toLowerCase()),
  );
  if (!envSuperAdmin) {
    await transaction.$queryRaw(Prisma.sql`
      SELECT access."id"
      FROM "AdminAccess" AS access
      WHERE access."userId" = ${actor.userId}
      FOR SHARE OF access
    `);
  }
  const databaseAccess = envSuperAdmin
    ? null
    : await transaction.adminAccess.findUnique({
        where: { userId: actor.userId },
      });
  const grant = resolveAdminGrant({ databaseAccess, envSuperAdmin });
  if (!resolvedAdminHasPermission(grant, permission)) {
    messageError(
      "FORBIDDEN",
      `Current Admin permission ${permission} is required.`,
    );
  }
  if (!grant) messageError("FORBIDDEN", "The Admin grant changed.");
  const currentActor = refreshAdminMessageActor(actor, grant);
  await authorizationTestHook?.(currentActor);
  return currentActor;
}

function getMessageAdminEmails() {
  return new Set(
    (process.env.REZNO_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
