export const adminPermissions = [
  "ADMIN_DASHBOARD_VIEW",
  "BUSINESSES_VIEW",
  "BUSINESSES_MANAGE",
  "USERS_VIEW",
  "USERS_MANAGE",
  "MESSAGES_VIEW",
  "MESSAGES_SEND",
  "NOTIFICATIONS_SEND",
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

export const adminPermissionLabels: Record<AdminPermission, string> = {
  ADMIN_DASHBOARD_VIEW: "View admin dashboard",
  BUSINESSES_VIEW: "View businesses",
  BUSINESSES_MANAGE: "Manage businesses",
  USERS_VIEW: "View users",
  USERS_MANAGE: "Manage users",
  MESSAGES_VIEW: "View messages",
  MESSAGES_SEND: "Send messages",
  NOTIFICATIONS_SEND: "Send notifications",
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
