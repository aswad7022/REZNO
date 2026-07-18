import "server-only";

import { Prisma } from "@prisma/client";

import type { AdminPermission } from "@/features/admin/config/permissions";
import type { CurrentAdminAccess } from "@/features/admin/services/admin-auth";
import {
  resolveAdminGrant,
  resolvedAdminHasPermission,
} from "@/features/admin/policies/admin-authorization";
import { communicationError } from "@/features/communications/domain/errors";

export type CommunicationAdminContext = {
  userId: string;
  personId: string;
  source: "database" | "env";
  adminAccessId: string | null;
};

type AuthorizationTestHook = (
  context: CommunicationAdminContext,
) => Promise<void> | void;

let authorizationTestHook: AuthorizationTestHook | undefined;

export function communicationAdminContext(
  access: CurrentAdminAccess,
): CommunicationAdminContext {
  return {
    userId: access.identity.session.user.id,
    personId: access.identity.person.id,
    source: access.source,
    adminAccessId: access.adminAccess?.id ?? null,
  };
}
export function setCommunicationAuthorizationTestHook(
  hook: AuthorizationTestHook | undefined,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Communication authorization test hooks are unavailable in production.");
  }
  authorizationTestHook = hook;
}

export async function assertCommunicationAdminCurrent(
  transaction: Prisma.TransactionClient,
  context: CommunicationAdminContext,
  permission: AdminPermission,
): Promise<CommunicationAdminContext> {
  const identities = await transaction.$queryRaw<Array<{ email: string }>>(Prisma.sql`
    SELECT auth_user."email"
    FROM "Person" AS person
    JOIN "user" AS auth_user ON auth_user."id" = person."authUserId"
    WHERE person."id" = ${context.personId}::uuid
      AND person."authUserId" = ${context.userId}
      AND person."deletedAt" IS NULL
      AND person."isOnboarded" = TRUE
      AND person."status" = 'ACTIVE'
    FOR SHARE OF person, auth_user
  `);
  const identity = identities[0];
  if (!identity) communicationError("FORBIDDEN", "The current Admin identity changed.");

  const envSuperAdmin = adminEmails().has(identity.email.trim().toLowerCase());
  if (!envSuperAdmin) {
    await transaction.$queryRaw(Prisma.sql`
      SELECT access."id"
      FROM "AdminAccess" AS access
      WHERE access."userId" = ${context.userId}
      FOR SHARE OF access
    `);
  }
  const databaseAccess = envSuperAdmin
    ? null
    : await transaction.adminAccess.findUnique({ where: { userId: context.userId } });
  const grant = resolveAdminGrant({ databaseAccess, envSuperAdmin });
  if (!resolvedAdminHasPermission(grant, permission)) {
    communicationError("FORBIDDEN", `Current Admin permission ${permission} is required.`);
  }

  const current: CommunicationAdminContext = {
    ...context,
    source: envSuperAdmin ? "env" : "database",
    adminAccessId: databaseAccess?.id ?? null,
  };
  await authorizationTestHook?.(current);
  return current;
}

function adminEmails() {
  return new Set(
    (process.env.REZNO_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
