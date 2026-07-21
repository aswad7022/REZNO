import "server-only";

import { Prisma } from "@prisma/client";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { resolveAdminGrant, resolvedAdminHasPermission } from "@/features/admin/policies/admin-authorization";
import type { CurrentAdminAccess } from "@/features/admin/services/admin-auth";
import { platformJobError } from "@/features/platform-jobs/domain/errors";

export type PlatformJobAdminContext = {
  adminAccessId: string | null;
  personId: string;
  source: "database" | "env";
  userId: string;
};

type AuthorizationTestHook = (context: PlatformJobAdminContext) => Promise<void> | void;
let authorizationTestHook: AuthorizationTestHook | undefined;

export function platformJobAdminContext(access: CurrentAdminAccess): PlatformJobAdminContext {
  return {
    adminAccessId: access.adminAccess?.id ?? null,
    personId: access.identity.person.id,
    source: access.source,
    userId: access.identity.session.user.id,
  };
}

export function setPlatformJobAuthorizationTestHook(hook: AuthorizationTestHook | undefined) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Platform job authorization test hooks are unavailable in production.");
  }
  authorizationTestHook = hook;
}

export async function assertPlatformJobAdminCurrent(
  transaction: Prisma.TransactionClient,
  context: PlatformJobAdminContext,
  permission: AdminPermission,
) {
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
  if (!identity) platformJobError("FORBIDDEN", "The current Admin identity changed.");

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
    platformJobError("FORBIDDEN", `Current Admin permission ${permission} is required.`);
  }

  const current: PlatformJobAdminContext = {
    ...context,
    adminAccessId: databaseAccess?.id ?? null,
    source: envSuperAdmin ? "env" : "database",
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
