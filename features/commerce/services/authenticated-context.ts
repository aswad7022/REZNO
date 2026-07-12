import "server-only";

import type { CommercePermission } from "@prisma/client";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { getCurrentAdminAccess } from "@/features/admin/services/admin-auth";
import { commerceError } from "@/features/commerce/domain/errors";
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
      organizationId: identity.membership.organizationId,
      personId: identity.person.id,
    },
    permission,
  );
}

export async function requireAuthenticatedCommerceAdmin(
  permission: AdminPermission,
): Promise<CommerceAdminContext> {
  const access = await getCurrentAdminAccess();
  if (!access || (!access.isSuperAdmin && !access.permissions.includes(permission))) {
    return commerceError("FORBIDDEN", `Missing admin permission ${permission}.`);
  }
  return {
    isSuperAdmin: access.isSuperAdmin,
    permissions: access.permissions,
    userId: access.identity.session.user.id,
  };
}
