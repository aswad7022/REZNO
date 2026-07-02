import type { SystemRole } from "@prisma/client";

export function canManageOrganization(systemRole: SystemRole | null): boolean {
  return systemRole === "OWNER" || systemRole === "MANAGER";
}
