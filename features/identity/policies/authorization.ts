import type { CommercePermission, SystemRole } from "@prisma/client";

/**
 * Organization capabilities are derived from the system role. Commerce
 * capabilities are explicit on Role; there are no per-membership overrides.
 * Tenant checks must succeed before any capability check is evaluated.
 */
export const ORGANIZATION_ROLE_POLICY = {
  OWNER: {
    bookingOperations: true,
    organizationManagement: true,
    organizationWideMessaging: true,
  },
  MANAGER: {
    bookingOperations: true,
    organizationManagement: true,
    organizationWideMessaging: true,
  },
  RECEPTIONIST: {
    bookingOperations: true,
    organizationManagement: false,
    organizationWideMessaging: false,
  },
  STAFF: {
    bookingOperations: false,
    organizationManagement: false,
    organizationWideMessaging: false,
  },
} as const satisfies Record<SystemRole, Record<string, boolean>>;

export const OWNER_DEFAULT_COMMERCE_PERMISSIONS = [
  "STORE_VIEW",
  "STORE_MANAGE",
  "PRODUCT_VIEW",
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "PRODUCT_ARCHIVE",
  "INVENTORY_VIEW",
  "INVENTORY_ADJUST",
  "ORDER_VIEW",
  "ORDER_MANAGE",
  "ORDER_CANCEL",
  "REPORTS_VIEW",
  "PAYMENT_VIEW",
  "PAYMENT_REFUND",
  "SETTLEMENT_VIEW",
] as const satisfies readonly CommercePermission[];

// Store lifecycle ownership is deliberately not delegable in Gate 1A. Other
// Commerce permissions can be assigned explicitly to a non-owner Role.
export const OWNER_ONLY_COMMERCE_PERMISSIONS = [
  "STORE_MANAGE",
] as const satisfies readonly CommercePermission[];

export function defaultCommercePermissionsForRole(
  systemRole: SystemRole | null,
): readonly CommercePermission[] {
  return systemRole === "OWNER" ? OWNER_DEFAULT_COMMERCE_PERMISSIONS : [];
}

export function canManageOrganization(systemRole: SystemRole | null): boolean {
  return Boolean(
    systemRole && ORGANIZATION_ROLE_POLICY[systemRole].organizationManagement,
  );
}

export function canOperateBookings(systemRole: SystemRole | null): boolean {
  return Boolean(
    systemRole && ORGANIZATION_ROLE_POLICY[systemRole].bookingOperations,
  );
}

export function canAccessOrganizationConversations(
  systemRole: SystemRole | null,
): boolean {
  return Boolean(
    systemRole &&
      ORGANIZATION_ROLE_POLICY[systemRole].organizationWideMessaging,
  );
}

export function hasCommercePermission({
  commercePermissions,
  permission,
  systemRole,
}: {
  commercePermissions: readonly CommercePermission[];
  permission: CommercePermission;
  systemRole: SystemRole | null;
}): boolean {
  if (systemRole === "OWNER") {
    return OWNER_DEFAULT_COMMERCE_PERMISSIONS.includes(
      permission as (typeof OWNER_DEFAULT_COMMERCE_PERMISSIONS)[number],
    );
  }

  if (
    OWNER_ONLY_COMMERCE_PERMISSIONS.includes(
      permission as (typeof OWNER_ONLY_COMMERCE_PERMISSIONS)[number],
    )
  ) {
    return false;
  }

  return commercePermissions.includes(permission);
}
