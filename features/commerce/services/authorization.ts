import type { AdminPermission } from "@/features/admin/config/permissions";
import { commerceError } from "@/features/commerce/domain/errors";
import { prisma } from "@/lib/db/prisma";
import type { CommercePermission, Prisma } from "@prisma/client";

type CommerceDatabase = Prisma.TransactionClient | typeof prisma;

export interface CustomerCommerceContext {
  personId: string;
}

export interface MerchantCommerceContext {
  organizationId: string;
  personId: string;
  permissions: readonly CommercePermission[];
}

export interface CommerceAdminContext {
  isSuperAdmin: boolean;
  permissions: readonly AdminPermission[];
  userId: string;
}

export async function resolveMerchantCommerceContext(
  identity: { organizationId: string; personId: string },
  permission: CommercePermission,
  database: CommerceDatabase = prisma,
): Promise<MerchantCommerceContext> {
  const membership = await database.organizationMember.findFirst({
    where: {
      organizationId: identity.organizationId,
      personId: identity.personId,
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      role: { organizationId: identity.organizationId },
    },
    select: {
      organizationId: true,
      personId: true,
      role: { select: { commercePermissions: true } },
    },
  });

  if (!membership) {
    return commerceError("FORBIDDEN", "No active Organization membership was found.");
  }
  if (!membership.role.commercePermissions.includes(permission)) {
    return commerceError("FORBIDDEN", `Missing commerce permission ${permission}.`);
  }

  return {
    organizationId: membership.organizationId,
    personId: membership.personId,
    permissions: membership.role.commercePermissions,
  };
}

export async function requireActiveCommerceCustomer(
  personId: string,
  database: CommerceDatabase = prisma,
): Promise<CustomerCommerceContext> {
  const person = await database.person.findFirst({
    where: { id: personId, deletedAt: null, isOnboarded: true, status: "ACTIVE" },
    select: { id: true },
  });
  if (!person) return commerceError("UNAUTHORIZED", "An active onboarded customer is required.");
  return { personId: person.id };
}

export function assertAdminPermission(
  context: CommerceAdminContext,
  permission: AdminPermission,
) {
  if (!context.isSuperAdmin && !context.permissions.includes(permission)) {
    commerceError("FORBIDDEN", `Missing admin permission ${permission}.`);
  }
}
