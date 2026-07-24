import type { PlatformJobScheduleKey, PlatformJobType } from "@prisma/client";

import type { AdminPermission } from "@/features/admin/config/permissions";

const PLATFORM_ONLY = ["PLATFORM_JOBS_MANAGE"] as const satisfies readonly AdminPermission[];
const STORAGE_AUTOMATION = [
  "PLATFORM_JOBS_MANAGE",
  "STORAGE_RECORDS_MANAGE",
] as const satisfies readonly AdminPermission[];
const COMMUNICATION_AUTOMATION = [
  "PLATFORM_JOBS_MANAGE",
  "COMMUNICATIONS_DISPATCH",
] as const satisfies readonly AdminPermission[];
const PAYMENT_AUTOMATION = [
  "PLATFORM_JOBS_MANAGE",
  "PAYMENTS_RECONCILE",
] as const satisfies readonly AdminPermission[];
const REFUND_AUTOMATION = [
  "PLATFORM_JOBS_MANAGE",
  "PAYMENTS_REFUND",
  "PAYMENTS_RECONCILE",
] as const satisfies readonly AdminPermission[];
const SETTLEMENT_AUTOMATION = [
  "PLATFORM_JOBS_MANAGE",
  "SETTLEMENTS_MANAGE",
] as const satisfies readonly AdminPermission[];

const JOB_PERMISSIONS = {
  PLATFORM_HEALTH_PROBE: PLATFORM_ONLY,
  STORAGE_MAINTENANCE_DISCOVERY: STORAGE_AUTOMATION,
  STORAGE_ORPHAN_CLEANUP: STORAGE_AUTOMATION,
  STORAGE_ASSET_DELETE_RETRY: STORAGE_AUTOMATION,
  STORAGE_RESCAN_DISCOVERY: STORAGE_AUTOMATION,
  STORAGE_ASSET_RESCAN: STORAGE_AUTOMATION,
  MEDIA_RENDITION_DISCOVERY: STORAGE_AUTOMATION,
  MEDIA_RENDITION_GENERATE: STORAGE_AUTOMATION,
  MEDIA_RENDITION_CLEANUP_DISCOVERY: STORAGE_AUTOMATION,
  MEDIA_RENDITION_DELETE: STORAGE_AUTOMATION,
  COMMUNICATION_CAMPAIGN_DISCOVERY: COMMUNICATION_AUTOMATION,
  COMMUNICATION_DELIVERY_DISCOVERY: COMMUNICATION_AUTOMATION,
  COMMUNICATION_CAMPAIGN_DISPATCH: COMMUNICATION_AUTOMATION,
  COMMUNICATION_DELIVERY_DISPATCH: COMMUNICATION_AUTOMATION,
  PAYMENT_PROVIDER_EVENT_PROCESS: PAYMENT_AUTOMATION,
  PAYMENT_RETRY_DISCOVERY: PAYMENT_AUTOMATION,
  PAYMENT_ATTEMPT_RETRY: PAYMENT_AUTOMATION,
  PAYMENT_REFUND_RETRY: REFUND_AUTOMATION,
  PAYMENT_RECONCILIATION: PAYMENT_AUTOMATION,
  SETTLEMENT_STATEMENT_GENERATE: SETTLEMENT_AUTOMATION,
} as const satisfies Record<PlatformJobType, readonly AdminPermission[]>;

const SCHEDULE_PERMISSIONS = {
  PLATFORM_HEALTH_PROBE: PLATFORM_ONLY,
  STORAGE_MAINTENANCE_DISCOVERY: STORAGE_AUTOMATION,
  STORAGE_RESCAN_DISCOVERY: STORAGE_AUTOMATION,
  MEDIA_RENDITION_DISCOVERY: STORAGE_AUTOMATION,
  MEDIA_RENDITION_CLEANUP_DISCOVERY: STORAGE_AUTOMATION,
  COMMUNICATION_CAMPAIGN_DISCOVERY: COMMUNICATION_AUTOMATION,
  COMMUNICATION_DELIVERY_DISCOVERY: COMMUNICATION_AUTOMATION,
  PAYMENT_RETRY_DISCOVERY: PAYMENT_AUTOMATION,
  PAYMENT_RECONCILIATION: PAYMENT_AUTOMATION,
  SETTLEMENT_STATEMENT_GENERATE: SETTLEMENT_AUTOMATION,
} as const satisfies Record<PlatformJobScheduleKey, readonly AdminPermission[]>;

export function requiredPlatformJobPermissions(jobType: PlatformJobType): readonly AdminPermission[] {
  return JOB_PERMISSIONS[jobType];
}

export function requiredPlatformSchedulePermissions(
  scheduleKey: PlatformJobScheduleKey,
): readonly AdminPermission[] {
  return SCHEDULE_PERMISSIONS[scheduleKey];
}

export function authorizedPlatformJobTypes(
  permissions: Iterable<AdminPermission>,
): PlatformJobType[] {
  const available = new Set(permissions);
  return (Object.keys(JOB_PERMISSIONS) as PlatformJobType[]).filter((jobType) =>
    JOB_PERMISSIONS[jobType].every((permission) => available.has(permission)),
  );
}

export function authorizedPlatformScheduleKeys(
  permissions: Iterable<AdminPermission>,
): PlatformJobScheduleKey[] {
  const available = new Set(permissions);
  return (Object.keys(SCHEDULE_PERMISSIONS) as PlatformJobScheduleKey[]).filter((scheduleKey) =>
    SCHEDULE_PERMISSIONS[scheduleKey].every((permission) => available.has(permission)),
  );
}
