import "server-only";

import type { NextRequest } from "next/server";
import type { AdminPermission } from "@/features/admin/config/permissions";
import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import { canManageOrganizationStorage } from "@/features/storage/domain/purpose-registry";
import { storageError } from "@/features/storage/domain/errors";
import type { StorageActor, StorageAdminActor } from "@/features/storage/services/actor";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

const ACTIVE_BUSINESS_COOKIE = "rezno-active-business-id";

export async function resolveStorageActorFromRequest(
  request: NextRequest,
  mode: "customer" | "business",
): Promise<StorageActor> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) storageError("FORBIDDEN", "Authentication is required.");
  const person = await prisma.person.findFirst({
    where: {
      authUserId: session.user.id,
      deletedAt: null,
      isOnboarded: true,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!person) storageError("FORBIDDEN", "An active Person is required.");
  if (mode === "customer") return { kind: "customer", personId: person.id, userId: session.user.id };
  const memberships = await prisma.organizationMember.findMany({
    where: {
      personId: person.id,
      deletedAt: null,
      status: "ACTIVE",
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
    },
    select: {
      id: true,
      organizationId: true,
      roleId: true,
      role: { select: { organizationId: true, systemRole: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const valid = memberships.filter((item) =>
    item.role.organizationId === item.organizationId
    && canManageOrganizationStorage(item.role.systemRole),
  );
  const selectedId = request.cookies.get(ACTIVE_BUSINESS_COOKIE)?.value;
  const selected = valid.length === 1 ? valid[0] : valid.find((item) => item.organizationId === selectedId);
  if (!selected || !selected.role.systemRole) {
    storageError("FORBIDDEN", "An active Owner or Manager Business must be selected.");
  }
  return {
    kind: "business",
    membershipId: selected.id,
    organizationId: selected.organizationId,
    personId: person.id,
    roleId: selected.roleId,
    systemRole: selected.role.systemRole,
    userId: session.user.id,
  };
}

export async function resolveStorageAdminActor(permission: AdminPermission): Promise<StorageAdminActor> {
  const access = await requireAdminPermission(permission);
  return {
    adminAccessId: access.adminAccess?.id ?? null,
    kind: "admin",
    personId: access.identity.person.id,
    source: access.source,
    userId: access.identity.session.user.id,
  };
}
