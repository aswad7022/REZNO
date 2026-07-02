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
};

export function normalizeAdminPermissions(
  permissions: Iterable<string>,
): AdminPermission[] {
  const allowed = new Set<string>(adminPermissions);
  return Array.from(new Set(permissions)).filter(
    (permission): permission is AdminPermission => allowed.has(permission),
  );
}
