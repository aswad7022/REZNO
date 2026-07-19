import "server-only";

import { Prisma, type SystemRole } from "@prisma/client";
import type { AdminPermission } from "@/features/admin/config/permissions";
import { resolveAdminGrant, resolvedAdminHasPermission } from "@/features/admin/policies/admin-authorization";
import { storageError } from "@/features/storage/domain/errors";

export type StorageCustomerActor = {
  kind: "customer";
  personId: string;
  userId: string;
};

export type StorageBusinessActor = {
  kind: "business";
  membershipId: string;
  organizationId: string;
  personId: string;
  roleId: string;
  systemRole: SystemRole;
  userId: string;
};

export type StorageActor = StorageCustomerActor | StorageBusinessActor;

export type StorageAdminActor = {
  adminAccessId: string | null;
  kind: "admin";
  personId: string;
  source: "database" | "env";
  userId: string;
};

export async function assertStorageActorCurrent(
  transaction: Prisma.TransactionClient,
  actor: StorageActor,
) {
  if (actor.kind === "customer") {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT person."id"
      FROM "Person" AS person
      WHERE person."id" = ${actor.personId}::uuid
        AND person."authUserId" = ${actor.userId}
        AND person."deletedAt" IS NULL
        AND person."isOnboarded" = TRUE
        AND person."status" = 'ACTIVE'
      FOR SHARE OF person
    `);
    if (!rows[0]) storageError("FORBIDDEN", "The current Person identity changed.");
    return actor;
  }
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
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
      AND role."organizationId" = ${actor.organizationId}::uuid
      AND role."systemRole" IN ('OWNER', 'MANAGER')
      AND role."systemRole" = ${actor.systemRole}::"SystemRole"
    FOR SHARE OF membership, person, organization, role
  `);
  if (!rows[0]) storageError("FORBIDDEN", "The active Business storage scope changed.");
  return actor;
}

export async function assertStorageAdminCurrent(
  transaction: Prisma.TransactionClient,
  actor: StorageAdminActor,
  permission: AdminPermission,
) {
  const rows = await transaction.$queryRaw<Array<{ email: string }>>(Prisma.sql`
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
  const identity = rows[0];
  if (!identity) storageError("FORBIDDEN", "The current Admin identity changed.");
  const envSuperAdmin = adminEmails().has(identity.email.trim().toLowerCase());
  if (!envSuperAdmin) {
    await transaction.$queryRaw(Prisma.sql`
      SELECT access."id" FROM "AdminAccess" AS access
      WHERE access."userId" = ${actor.userId}
      FOR SHARE OF access
    `);
  }
  const databaseAccess = envSuperAdmin
    ? null
    : await transaction.adminAccess.findUnique({ where: { userId: actor.userId } });
  const grant = resolveAdminGrant({ databaseAccess, envSuperAdmin });
  if (!resolvedAdminHasPermission(grant, permission)) {
    storageError("FORBIDDEN", `Current Admin permission ${permission} is required.`);
  }
  return actor;
}

function adminEmails() {
  return new Set((process.env.REZNO_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean));
}
