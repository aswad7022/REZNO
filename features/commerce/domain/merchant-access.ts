import type { CommercePermission, SystemRole } from "@prisma/client";

import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "@/features/identity/policies/authorization";

export const COMMERCE_PERMISSIONS = [...OWNER_DEFAULT_COMMERCE_PERMISSIONS] as const;

export const MANAGER_ASSIGNABLE_COMMERCE_PERMISSIONS = COMMERCE_PERMISSIONS.filter(
  (permission) => permission !== "STORE_MANAGE",
);

export const STAFF_ASSIGNABLE_COMMERCE_PERMISSIONS = [
  "STORE_VIEW",
  "PRODUCT_VIEW",
  "INVENTORY_VIEW",
  "INVENTORY_ADJUST",
  "ORDER_VIEW",
  "ORDER_MANAGE",
] as const satisfies readonly CommercePermission[];

export function assignableCommercePermissions(
  systemRole: SystemRole | null,
): readonly CommercePermission[] {
  if (systemRole === "MANAGER") return MANAGER_ASSIGNABLE_COMMERCE_PERMISSIONS;
  if (systemRole === "STAFF") return STAFF_ASSIGNABLE_COMMERCE_PERMISSIONS;
  return [];
}

export function effectiveCommercePermissions(input: {
  commercePermissions: readonly CommercePermission[];
  systemRole: SystemRole | null;
}): CommercePermission[] {
  if (input.systemRole === "OWNER") return [...OWNER_DEFAULT_COMMERCE_PERMISSIONS];
  const allowed = new Set(assignableCommercePermissions(input.systemRole));
  return COMMERCE_PERMISSIONS.filter(
    (permission) => allowed.has(permission) && input.commercePermissions.includes(permission),
  );
}

export function canManageCommerceAccess(systemRole: SystemRole | null) {
  return systemRole === "OWNER";
}

export function hasAnyCommerceCapability(
  permissions: readonly CommercePermission[],
) {
  return permissions.length > 0;
}
