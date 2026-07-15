import type { SystemRole } from "@prisma/client";

export type BusinessOperationCapability =
  | "AUDIT_READ"
  | "BLOCK_READ"
  | "BLOCK_WRITE"
  | "BRANCH_ARCHIVE"
  | "BRANCH_READ"
  | "BRANCH_WRITE"
  | "HOURS_READ"
  | "HOURS_WRITE"
  | "SETTINGS_READ"
  | "SETTINGS_WRITE";

const capabilities = {
  OWNER: new Set<BusinessOperationCapability>([
    "AUDIT_READ",
    "BLOCK_READ",
    "BLOCK_WRITE",
    "BRANCH_ARCHIVE",
    "BRANCH_READ",
    "BRANCH_WRITE",
    "HOURS_READ",
    "HOURS_WRITE",
    "SETTINGS_READ",
    "SETTINGS_WRITE",
  ]),
  MANAGER: new Set<BusinessOperationCapability>([
    "BLOCK_READ",
    "BLOCK_WRITE",
    "BRANCH_READ",
    "BRANCH_WRITE",
    "HOURS_READ",
    "HOURS_WRITE",
    "SETTINGS_READ",
    "SETTINGS_WRITE",
  ]),
  RECEPTIONIST: new Set<BusinessOperationCapability>([
    "BLOCK_READ",
    "BLOCK_WRITE",
    "BRANCH_READ",
    "HOURS_READ",
  ]),
  STAFF: new Set<BusinessOperationCapability>(),
} as const satisfies Record<SystemRole, ReadonlySet<BusinessOperationCapability>>;

export function canPerformBusinessOperation(
  role: SystemRole | null,
  capability: BusinessOperationCapability,
) {
  return Boolean(role && capabilities[role].has(capability));
}

export function businessOperationCapabilities(role: SystemRole | null) {
  return role ? new Set(capabilities[role]) : new Set<BusinessOperationCapability>();
}
