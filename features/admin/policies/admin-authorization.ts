import type { AdminAccess, AdminAccessRole } from "@prisma/client";

import {
  allAdminPermissions,
  effectiveNormalizedAdminPermissions,
  type AdminPermission,
} from "@/features/admin/config/permissions";

export type AdminGrant = Pick<
  AdminAccess,
  "expiresAt" | "permissions" | "role" | "status"
>;

export type ResolvedAdminGrant = {
  isSuperAdmin: boolean;
  permissions: AdminPermission[];
  role: AdminAccessRole;
  source: "database" | "env";
};

export function isDatabaseAdminAccessActive(
  adminAccess: Pick<AdminAccess, "expiresAt" | "status">,
  now = new Date(),
): boolean {
  return (
    adminAccess.status === "ACTIVE" &&
    (!adminAccess.expiresAt || adminAccess.expiresAt.getTime() > now.getTime())
  );
}

export function resolveAdminGrant({
  databaseAccess,
  envSuperAdmin,
  now = new Date(),
}: {
  databaseAccess: AdminGrant | null;
  envSuperAdmin: boolean;
  now?: Date;
}): ResolvedAdminGrant | null {
  if (envSuperAdmin) {
    return {
      isSuperAdmin: true,
      permissions: allAdminPermissions,
      role: "SUPER_ADMIN",
      source: "env",
    };
  }

  if (
    !databaseAccess ||
    !isDatabaseAdminAccessActive(databaseAccess, now)
  ) {
    return null;
  }

  const isSuperAdmin = databaseAccess.role === "SUPER_ADMIN";
  return {
    isSuperAdmin,
    permissions: isSuperAdmin
      ? allAdminPermissions
      : effectiveNormalizedAdminPermissions(databaseAccess.permissions),
    role: databaseAccess.role,
    source: "database",
  };
}

export function resolvedAdminHasPermission(
  grant: ResolvedAdminGrant | null,
  permission: AdminPermission,
): boolean {
  return Boolean(
    grant &&
      (grant.isSuperAdmin || grant.permissions.includes(permission)),
  );
}
