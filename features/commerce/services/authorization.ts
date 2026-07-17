import type { AdminPermission } from "@/features/admin/config/permissions";
import { resolveAdminGrant } from "@/features/admin/policies/admin-authorization";
import { commerceError } from "@/features/commerce/domain/errors";
import { hasCommercePermission } from "@/features/identity/policies/authorization";
import { effectiveCommercePermissions } from "@/features/commerce/domain/merchant-access";
import { prisma } from "@/lib/db/prisma";
import type { CommercePermission, Prisma, SystemRole } from "@prisma/client";

type CommerceDatabase = Prisma.TransactionClient | typeof prisma;

export interface CustomerCommerceContext {
  personId: string;
}

export interface MerchantCommerceContext {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  personId: string;
  roleId: string;
  systemRole: SystemRole;
  permissions: readonly CommercePermission[];
  storeId: string | null;
}

export interface MerchantActorReference {
  contextOrganizationId: string;
  membershipId: string;
  personId: string;
}

export interface CommerceAdminContext {
  adminAccessId: string | null;
  isSuperAdmin: boolean;
  personId: string;
  permissions: readonly AdminPermission[];
  source: "database" | "env";
  userId: string;
}

export async function resolveMerchantCommerceContext(
  reference: MerchantActorReference,
  permission?: CommercePermission,
  database: CommerceDatabase = prisma,
): Promise<MerchantCommerceContext> {
  const membership = await database.organizationMember.findFirst({
    where: {
      id: reference.membershipId,
      organizationId: reference.contextOrganizationId,
      personId: reference.personId,
      deletedAt: null,
      status: "ACTIVE",
      person: { deletedAt: null, isOnboarded: true, status: "ACTIVE" },
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      role: { organizationId: reference.contextOrganizationId },
    },
    select: {
      id: true,
      organizationId: true,
      personId: true,
      organization: { select: { name: true, slug: true, store: { select: { id: true } } } },
      role: { select: { commercePermissions: true, id: true, systemRole: true } },
    },
  });

  if (!membership?.role.systemRole) {
    return commerceError("FORBIDDEN", "No active Organization membership was found.");
  }
  const permissions = effectiveCommercePermissions(membership.role);
  if (
    permission &&
    !hasCommercePermission({
      commercePermissions: permissions,
      permission,
      systemRole: membership.role.systemRole,
    })
  ) {
    return commerceError("FORBIDDEN", `Missing commerce permission ${permission}.`);
  }

  return {
    membershipId: membership.id,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    organizationSlug: membership.organization.slug,
    personId: membership.personId,
    roleId: membership.role.id,
    systemRole: membership.role.systemRole,
    permissions,
    storeId: membership.organization.store?.id ?? null,
  };
}

export async function assertMerchantCommerceContextCurrent(
  database: Prisma.TransactionClient,
  actor: MerchantCommerceContext,
  permission: CommercePermission,
) {
  const current = await resolveMerchantCommerceContext(
    {
      contextOrganizationId: actor.organizationId,
      membershipId: actor.membershipId,
      personId: actor.personId,
    },
    permission,
    database,
  );
  if (current.roleId !== actor.roleId || current.systemRole !== actor.systemRole) {
    commerceError("MEMBERSHIP_UNAVAILABLE", "Merchant membership changed before the operation completed.");
  }
  return current;
}

export function assertRenderedMerchantOrganization(
  actor: MerchantCommerceContext,
  renderedOrganizationId: string,
) {
  if (actor.organizationId !== renderedOrganizationId) {
    commerceError(
      "ACTIVE_ORGANIZATION_CHANGED",
      "The active Business changed after this Commerce form was rendered.",
    );
  }
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

export async function assertCommerceAdminCurrent(
  transaction: Prisma.TransactionClient,
  context: CommerceAdminContext,
  permission: AdminPermission,
) {
  const person = await transaction.person.findFirst({
    where: {
      authUserId: context.userId,
      deletedAt: null,
      id: context.personId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!person) commerceError("FORBIDDEN", "Admin identity is no longer active.");

  if (context.source === "env") {
    const user = await transaction.user.findUnique({
      where: { id: context.userId },
      select: { email: true },
    });
    if (!user || !adminEmailAllowlist().has(user.email.trim().toLowerCase())) {
      commerceError("FORBIDDEN", "Environment super-admin access is no longer active.");
    }
    return;
  }

  const access = await transaction.adminAccess.findFirst({
    where: { id: context.adminAccessId ?? undefined, userId: context.userId },
  });
  const grant = resolveAdminGrant({ databaseAccess: access, envSuperAdmin: false });
  if (!grant || (!grant.isSuperAdmin && !grant.permissions.includes(permission))) {
    commerceError("FORBIDDEN", `Missing admin permission ${permission}.`);
  }
}

function adminEmailAllowlist() {
  return new Set(
    (process.env.REZNO_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
