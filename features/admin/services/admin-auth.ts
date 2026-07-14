import "server-only";

import { forbidden } from "next/navigation";
import type { AdminAccess, AdminAccessRole } from "@prisma/client";

import {
  getCurrentIdentity,
  requireActiveIdentity,
} from "@/features/identity/server";
import {
  allAdminPermissions,
  type AdminPermission,
} from "@/features/admin/config/permissions";
import { resolveAdminGrant } from "@/features/admin/policies/admin-authorization";
import { prisma } from "@/lib/db/prisma";
import { logServerError } from "@/lib/logging/server";

export function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.REZNO_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function getIdentityEmail(user: { id: string; email?: string | null }) {
  const sessionEmail = user.email?.trim().toLowerCase();
  if (sessionEmail) return sessionEmail;

  try {
    const databaseUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });

    return databaseUser?.email.trim().toLowerCase() ?? null;
  } catch (error) {
    logServerError("adminAuth.emailLookup", error, { userId: user.id });
    return null;
  }
}

export async function isSuperAdminUser(user: {
  id: string;
  email?: string | null;
}): Promise<boolean> {
  const adminEmails = getAdminEmails();

  if (adminEmails.size === 0) {
    return false;
  }

  const email = await getIdentityEmail(user);
  return Boolean(email && adminEmails.has(email));
}

export interface CurrentAdminAccess {
  identity: Awaited<ReturnType<typeof requireActiveIdentity>>;
  isSuperAdmin: boolean;
  role: AdminAccessRole;
  permissions: AdminPermission[];
  adminAccess: AdminAccess | null;
  source: "env" | "database";
}

async function getActiveDatabaseAdminAccess(userId: string) {
  return prisma.adminAccess.findUnique({
    where: { userId },
  });
}

function accessFromDatabase(
  identity: Awaited<ReturnType<typeof requireActiveIdentity>>,
  adminAccess: AdminAccess,
): CurrentAdminAccess | null {
  const grant = resolveAdminGrant({
    databaseAccess: adminAccess,
    envSuperAdmin: false,
  });
  if (!grant) return null;

  return {
    identity,
    isSuperAdmin: grant.isSuperAdmin,
    role: grant.role,
    permissions: grant.permissions,
    adminAccess,
    source: "database",
  };
}

export async function getCurrentAdminAccess(): Promise<CurrentAdminAccess | null> {
  const identity = await getCurrentIdentity();

  if (
    !identity ||
    identity.person.deletedAt ||
    identity.person.status !== "ACTIVE"
  ) {
    return null;
  }

  const envSuperAdmin = await isSuperAdminUser(identity.session.user);
  if (envSuperAdmin) {
    return {
      identity,
      isSuperAdmin: true,
      role: "SUPER_ADMIN",
      permissions: allAdminPermissions,
      adminAccess: null,
      source: "env",
    };
  }

  try {
    const adminAccess = await getActiveDatabaseAdminAccess(
      identity.session.user.id,
    );
    return adminAccess ? accessFromDatabase(identity, adminAccess) : null;
  } catch (error) {
    logServerError("adminAuth.accessLookup", error, {
      userId: identity.session.user.id,
    });
    return null;
  }
}

export async function getAdminAccessState() {
  const identity = await requireActiveIdentity();
  const adminEmails = getAdminEmails();
  const email = await getIdentityEmail(identity.session.user);
  const envSuperAdmin = Boolean(email && adminEmails.has(email));

  if (envSuperAdmin) {
    return {
      status: "allowed" as const,
      identity,
      isSuperAdmin: true,
      role: "SUPER_ADMIN" as const,
      permissions: allAdminPermissions,
      adminAccess: null,
      source: "env" as const,
    };
  }

  const databaseAccess = await getActiveDatabaseAdminAccess(
    identity.session.user.id,
  );
  const databaseState = databaseAccess
    ? accessFromDatabase(identity, databaseAccess)
    : null;

  if (databaseState) {
    return { status: "allowed" as const, ...databaseState };
  }

  if (adminEmails.size === 0) {
    const activeAdmins = await prisma.adminAccess.count({
      where: {
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    if (activeAdmins === 0) {
      return { status: "notConfigured" as const };
    }
  }

  forbidden();
}

export async function requireAdminIdentity() {
  const state = await getAdminAccessState();

  if (state.status === "notConfigured") {
    forbidden();
  }

  const { identity } = state;
  return identity;
}

export async function requireSuperAdmin() {
  const state = await getAdminAccessState();

  if (state.status === "notConfigured" || !state.isSuperAdmin) {
    forbidden();
  }

  return state;
}

export async function requireAdminPermission(permission: AdminPermission) {
  const state = await getAdminAccessState();

  if (state.status === "notConfigured") {
    forbidden();
  }

  if (!state.isSuperAdmin && !state.permissions.includes(permission)) {
    forbidden();
  }

  return state;
}

export async function canAdmin(permission: AdminPermission): Promise<boolean> {
  const access = await getCurrentAdminAccess();
  return Boolean(
    access &&
      (access.isSuperAdmin || access.permissions.includes(permission)),
  );
}
