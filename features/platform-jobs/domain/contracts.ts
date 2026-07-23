export const PLATFORM_JOB_LIMITS = {
  maxRequestBytes: 8_192,
  maxPayloadBytes: 4_096,
  maxResultBytes: 2_048,
  maxErrorCodeLength: 64,
  maxListPage: 50,
  defaultListPage: 20,
  maxWorkerBatch: 10,
  workerOperationLeaseSeconds: 120,
  maxSchedulerBatch: 10,
  maxAttempts: 10,
  minLeaseSeconds: 30,
  maxLeaseSeconds: 300,
  defaultLeaseSeconds: 120,
  maxLeaseHorizonSeconds: 900,
  maxHeartbeatExtensionSeconds: 120,
  minRetryDelaySeconds: 30,
  maxRetryDelaySeconds: 3_600,
  maxScheduleCatchup: 10,
  maxRequeues: 3,
  executionTimeoutMs: 5_000,
  maxDomainDiscoveryBatch: 50,
} as const;

export const STAGE_6_ARCHITECTURE = {
  title: "Stage 6 — Admin and Platform Operations",
  gates: {
    gate6A: "ACCEPTED",
    gate6B: "ACCEPTED",
    gate6C: "ACTIVE",
    gate6D: "UNSTARTED",
  },
  runtime: {
    durableStore: "POSTGRESQL",
    externalQueueProvider: "NOT_CONFIGURED",
    automaticScheduler: "NOT_CONNECTED",
    alwaysOnWorker: "NOT_CONNECTED",
    redis: "LOCAL_DOCKER_ONLY_NOT_CONNECTED",
  },
  providers: {
    storage: "NOT_CONFIGURED",
    payment: "NOT_CONFIGURED",
  },
  boundaries: {
    stage7: "PHYSICAL_DEVICE_AND_RELEASE_QA",
    stage8: "BROAD_VISUAL_POLISH",
    ai: "AFTER_STAGE_8",
  },
} as const;

export const PLATFORM_JOB_ALLOWED_TYPES = [
  "PLATFORM_HEALTH_PROBE",
  "STORAGE_MAINTENANCE_DISCOVERY",
  "STORAGE_ORPHAN_CLEANUP",
  "STORAGE_ASSET_DELETE_RETRY",
  "STORAGE_RESCAN_DISCOVERY",
  "STORAGE_ASSET_RESCAN",
  "MEDIA_RENDITION_DISCOVERY",
  "MEDIA_RENDITION_GENERATE",
  "MEDIA_RENDITION_CLEANUP_DISCOVERY",
  "MEDIA_RENDITION_DELETE",
  "COMMUNICATION_CAMPAIGN_DISCOVERY",
  "COMMUNICATION_DELIVERY_DISCOVERY",
  "COMMUNICATION_CAMPAIGN_DISPATCH",
  "COMMUNICATION_DELIVERY_DISPATCH",
  "PAYMENT_PROVIDER_EVENT_PROCESS",
  "PAYMENT_RETRY_DISCOVERY",
  "PAYMENT_ATTEMPT_RETRY",
  "PAYMENT_REFUND_RETRY",
  "PAYMENT_RECONCILIATION",
  "SETTLEMENT_STATEMENT_GENERATE",
] as const;

export const PLATFORM_JOB_HANDLER_TIMEOUT_OVERRIDES_MS = {
  COMMUNICATION_CAMPAIGN_DISPATCH: 15_000,
  COMMUNICATION_DELIVERY_DISPATCH: 15_000,
  PAYMENT_PROVIDER_EVENT_PROCESS: 15_000,
  PAYMENT_ATTEMPT_RETRY: 15_000,
  PAYMENT_REFUND_RETRY: 15_000,
  PAYMENT_RECONCILIATION: 15_000,
  SETTLEMENT_STATEMENT_GENERATE: 15_000,
} as const satisfies Partial<
  Record<(typeof PLATFORM_JOB_ALLOWED_TYPES)[number], number>
>;

export function platformJobHandlerTimeoutMs(
  jobType: (typeof PLATFORM_JOB_ALLOWED_TYPES)[number],
) {
  return PLATFORM_JOB_HANDLER_TIMEOUT_OVERRIDES_MS[
    jobType as keyof typeof PLATFORM_JOB_HANDLER_TIMEOUT_OVERRIDES_MS
  ] ?? PLATFORM_JOB_LIMITS.executionTimeoutMs;
}

export const PLATFORM_JOB_DISCOVERY_TYPES = [
  "STORAGE_MAINTENANCE_DISCOVERY",
  "STORAGE_RESCAN_DISCOVERY",
  "MEDIA_RENDITION_DISCOVERY",
  "MEDIA_RENDITION_CLEANUP_DISCOVERY",
  "COMMUNICATION_CAMPAIGN_DISCOVERY",
  "COMMUNICATION_DELIVERY_DISCOVERY",
  "PAYMENT_RETRY_DISCOVERY",
] as const;
export const PLATFORM_JOB_SAFE_ERROR_CODES = [
  "LEASE_EXPIRED",
  "HANDLER_TIMEOUT",
  "HANDLER_ABORTED",
  "HANDLER_EXCEPTION",
  "TRANSIENT_FAILURE",
  "PERMANENT_FAILURE",
] as const;
