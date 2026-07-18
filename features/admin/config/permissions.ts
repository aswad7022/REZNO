export const adminPermissions = [
  "ADMIN_DASHBOARD_VIEW",
  "BUSINESSES_VIEW",
  "BUSINESSES_MANAGE",
  "USERS_VIEW",
  "USERS_MANAGE",
  "MESSAGES_VIEW",
  "MESSAGES_SEND",
  "NOTIFICATIONS_VIEW",
  "NOTIFICATIONS_SEND",
  "COMMUNICATIONS_DISPATCH",
  "SETTINGS_VIEW",
  "SETTINGS_MANAGE",
  "AUDIT_LOG_VIEW",
  "COMMERCE_STORES_VIEW",
  "COMMERCE_STORES_REVIEW",
  "COMMERCE_CATALOG_VIEW",
  "COMMERCE_CATALOG_MODERATE",
  "COMMERCE_INVENTORY_VIEW",
  "COMMERCE_INVENTORY_MANAGE",
  "COMMERCE_ORDERS_VIEW",
  "COMMERCE_ORDERS_MANAGE",
] as const;

export type AdminPermission = (typeof adminPermissions)[number];

export const allAdminPermissions: AdminPermission[] = [...adminPermissions];

export const defaultAdminPermissions: AdminPermission[] = [
  "ADMIN_DASHBOARD_VIEW",
  "BUSINESSES_VIEW",
  "USERS_VIEW",
  "MESSAGES_VIEW",
  "SETTINGS_VIEW",
];

export const commerceAdminPermissions = [
  "COMMERCE_STORES_VIEW",
  "COMMERCE_STORES_REVIEW",
  "COMMERCE_CATALOG_VIEW",
  "COMMERCE_CATALOG_MODERATE",
  "COMMERCE_INVENTORY_VIEW",
  "COMMERCE_INVENTORY_MANAGE",
  "COMMERCE_ORDERS_VIEW",
  "COMMERCE_ORDERS_MANAGE",
  "AUDIT_LOG_VIEW",
] as const satisfies readonly AdminPermission[];

export const adminPermissionDependencies: Readonly<
  Partial<Record<AdminPermission, readonly AdminPermission[]>>
> = {
  COMMERCE_CATALOG_MODERATE: ["COMMERCE_CATALOG_VIEW"],
  COMMERCE_INVENTORY_MANAGE: ["COMMERCE_INVENTORY_VIEW"],
  COMMERCE_ORDERS_MANAGE: ["COMMERCE_ORDERS_VIEW"],
  COMMERCE_STORES_REVIEW: ["COMMERCE_STORES_VIEW"],
  NOTIFICATIONS_SEND: ["NOTIFICATIONS_VIEW"],
  COMMUNICATIONS_DISPATCH: ["NOTIFICATIONS_SEND"],
};

export function hasAnyCommerceAdminPermission(
  permissions: Iterable<AdminPermission>,
): boolean {
  const available = new Set(permissions);
  return commerceAdminPermissions.some((permission) => available.has(permission));
}

export function firstCommerceAdminPermission(
  permissions: Iterable<AdminPermission>,
): AdminPermission | null {
  const available = new Set(permissions);
  return commerceAdminPermissions.find((permission) => available.has(permission)) ?? null;
}

export function invalidAdminPermissionDependencies(
  permissions: Iterable<AdminPermission>,
): Array<{ permission: AdminPermission; requires: AdminPermission }> {
  const available = new Set(permissions);
  return Object.entries(adminPermissionDependencies).flatMap(
    ([permission, requirements]) =>
      available.has(permission as AdminPermission)
        ? (requirements ?? []).flatMap((requires) =>
            available.has(requires)
              ? []
              : [{ permission: permission as AdminPermission, requires }],
          )
        : [],
  );
}

export function effectiveNormalizedAdminPermissions(
  permissions: Iterable<string>,
): AdminPermission[] {
  const normalized = normalizeAdminPermissions(permissions);
  const available = new Set(normalized);
  const effective = new Set<AdminPermission>();
  const visiting = new Set<AdminPermission>();
  const include = (permission: AdminPermission): boolean => {
    if (effective.has(permission)) return true;
    if (!available.has(permission) || visiting.has(permission)) return false;
    visiting.add(permission);
    const valid = (adminPermissionDependencies[permission] ?? []).every(include);
    visiting.delete(permission);
    if (valid) effective.add(permission);
    return valid;
  };
  normalized.forEach(include);
  return normalized.filter((permission) => effective.has(permission));
}

export const adminPermissionLabels: Record<AdminPermission, string> = {
  ADMIN_DASHBOARD_VIEW: "View admin dashboard",
  BUSINESSES_VIEW: "View businesses",
  BUSINESSES_MANAGE: "Manage businesses",
  USERS_VIEW: "View users",
  USERS_MANAGE: "Manage users",
  MESSAGES_VIEW: "View messages",
  MESSAGES_SEND: "Send messages",
  NOTIFICATIONS_VIEW: "View communication campaigns",
  NOTIFICATIONS_SEND: "Send notifications",
  COMMUNICATIONS_DISPATCH: "Manually dispatch due communications",
  SETTINGS_VIEW: "View settings",
  SETTINGS_MANAGE: "Manage settings",
  AUDIT_LOG_VIEW: "View audit log",
  COMMERCE_STORES_VIEW: "View commerce Stores",
  COMMERCE_STORES_REVIEW: "Review and moderate commerce Stores",
  COMMERCE_CATALOG_VIEW: "View commerce catalog administration",
  COMMERCE_CATALOG_MODERATE: "Moderate commerce Products",
  COMMERCE_INVENTORY_VIEW: "View commerce inventory",
  COMMERCE_INVENTORY_MANAGE: "Manage commerce inventory",
  COMMERCE_ORDERS_VIEW: "View commerce Orders",
  COMMERCE_ORDERS_MANAGE: "Manage commerce Orders",
};

export function normalizeAdminPermissions(
  permissions: Iterable<string>,
): AdminPermission[] {
  const allowed = new Set<string>(adminPermissions);
  return Array.from(new Set(permissions)).filter(
    (permission): permission is AdminPermission => allowed.has(permission),
  );
}
