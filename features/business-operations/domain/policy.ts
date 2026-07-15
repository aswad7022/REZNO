import type { SystemRole } from "@prisma/client";

export type BusinessOperationCapability =
  | "AUDIT_READ"
  | "BLOCK_READ"
  | "BLOCK_WRITE"
  | "BRANCH_ASSIGNMENT_WRITE"
  | "BRANCH_ARCHIVE"
  | "BRANCH_READ"
  | "BRANCH_WRITE"
  | "HOURS_READ"
  | "HOURS_WRITE"
  | "MEMBER_BLOCK_READ"
  | "MEMBER_BLOCK_WRITE_ALL"
  | "MEMBER_BLOCK_WRITE_SELF"
  | "OFFERING_READ"
  | "OFFERING_WRITE"
  | "ROLE_WRITE"
  | "SERVICE_ASSIGNMENT_WRITE"
  | "SERVICE_READ"
  | "SERVICE_WRITE"
  | "SETTINGS_READ"
  | "SETTINGS_WRITE"
  | "STAFF_SCHEDULE_READ"
  | "STAFF_SCHEDULE_WRITE"
  | "WORKFORCE_READ"
  | "WORKFORCE_WRITE";

const capabilities = {
  OWNER: new Set<BusinessOperationCapability>([
    "AUDIT_READ",
    "BLOCK_READ",
    "BLOCK_WRITE",
    "BRANCH_ASSIGNMENT_WRITE",
    "BRANCH_ARCHIVE",
    "BRANCH_READ",
    "BRANCH_WRITE",
    "HOURS_READ",
    "HOURS_WRITE",
    "MEMBER_BLOCK_READ",
    "MEMBER_BLOCK_WRITE_ALL",
    "MEMBER_BLOCK_WRITE_SELF",
    "OFFERING_READ",
    "OFFERING_WRITE",
    "ROLE_WRITE",
    "SERVICE_ASSIGNMENT_WRITE",
    "SERVICE_READ",
    "SERVICE_WRITE",
    "SETTINGS_READ",
    "SETTINGS_WRITE",
    "STAFF_SCHEDULE_READ",
    "STAFF_SCHEDULE_WRITE",
    "WORKFORCE_READ",
    "WORKFORCE_WRITE",
  ]),
  MANAGER: new Set<BusinessOperationCapability>([
    "BLOCK_READ",
    "BLOCK_WRITE",
    "BRANCH_ASSIGNMENT_WRITE",
    "BRANCH_READ",
    "BRANCH_WRITE",
    "HOURS_READ",
    "HOURS_WRITE",
    "MEMBER_BLOCK_READ",
    "MEMBER_BLOCK_WRITE_ALL",
    "MEMBER_BLOCK_WRITE_SELF",
    "OFFERING_READ",
    "OFFERING_WRITE",
    "ROLE_WRITE",
    "SERVICE_ASSIGNMENT_WRITE",
    "SERVICE_READ",
    "SERVICE_WRITE",
    "SETTINGS_READ",
    "SETTINGS_WRITE",
    "STAFF_SCHEDULE_READ",
    "STAFF_SCHEDULE_WRITE",
    "WORKFORCE_READ",
    "WORKFORCE_WRITE",
  ]),
  RECEPTIONIST: new Set<BusinessOperationCapability>([
    "BLOCK_READ",
    "BLOCK_WRITE",
    "BRANCH_READ",
    "HOURS_READ",
    "MEMBER_BLOCK_READ",
    "OFFERING_READ",
    "SERVICE_READ",
    "STAFF_SCHEDULE_READ",
    "WORKFORCE_READ",
  ]),
  STAFF: new Set<BusinessOperationCapability>([
    "MEMBER_BLOCK_READ",
    "MEMBER_BLOCK_WRITE_SELF",
    "OFFERING_READ",
    "SERVICE_READ",
    "STAFF_SCHEDULE_READ",
    "WORKFORCE_READ",
  ]),
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
