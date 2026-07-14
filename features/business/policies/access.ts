import type { SystemRole } from "@prisma/client";

export { canManageOrganization } from "@/features/identity/policies/authorization";

// Preserve this type import for downstream declaration output.
export type OrganizationSystemRole = SystemRole;
