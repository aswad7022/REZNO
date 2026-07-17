import "server-only";

import { forbidden } from "next/navigation";

import type { CommercePermission } from "@prisma/client";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { firstCommerceAdminPermission } from "@/features/admin/config/permissions";
import { getCurrentAdminAccess } from "@/features/admin/services/admin-auth";
import {
  resolveMerchantCommerceContext,
  type CommerceAdminContext,
  type MerchantCommerceContext,
} from "@/features/commerce/services/authorization";
import { requireBusinessIdentity } from "@/features/identity/server";

export async function requireAuthenticatedMerchantCommerceContext(
  permission: CommercePermission,
): Promise<MerchantCommerceContext> {
  const identity = await requireBusinessIdentity();
  return resolveMerchantCommerceContext(
    {
      contextOrganizationId: identity.membership.organizationId,
      membershipId: identity.membership.id,
      personId: identity.person.id,
    },
    permission,
  );
}

export async function requireAuthenticatedMerchantActor(): Promise<MerchantCommerceContext> {
  const identity = await requireBusinessIdentity();
  return resolveMerchantCommerceContext({
    contextOrganizationId: identity.membership.organizationId,
    membershipId: identity.membership.id,
    personId: identity.person.id,
  });
}

export async function requireAuthenticatedCommerceAdmin(
  permission: AdminPermission,
): Promise<CommerceAdminContext> {
  const access = await getCurrentAdminAccess();
  if (!access || (!access.isSuperAdmin && !access.permissions.includes(permission))) {
    forbidden();
  }
  return {
    adminAccessId: access.adminAccess?.id ?? null,
    isSuperAdmin: access.isSuperAdmin,
    personId: access.identity.person.id,
    permissions: access.permissions,
    source: access.source,
    userId: access.identity.session.user.id,
  };
}

export async function requireAuthenticatedCommerceAdminHub(): Promise<CommerceAdminContext> {
  const access = await getCurrentAdminAccess();
  const permission = access?.isSuperAdmin
    ? "COMMERCE_STORES_VIEW"
    : access ? firstCommerceAdminPermission(access.permissions) : null;
  if (!access || !permission) forbidden();
  return {
    adminAccessId: access.adminAccess?.id ?? null,
    isSuperAdmin: access.isSuperAdmin,
    personId: access.identity.person.id,
    permissions: access.permissions,
    source: access.source,
    userId: access.identity.session.user.id,
  };
}
