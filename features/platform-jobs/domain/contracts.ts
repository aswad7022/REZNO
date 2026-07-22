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
    gate6B: "ACTIVE",
    gate6C: "UNSTARTED",
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
] as const;

export const PLATFORM_JOB_DISCOVERY_TYPES = [
  "STORAGE_MAINTENANCE_DISCOVERY",
  "STORAGE_RESCAN_DISCOVERY",
  "MEDIA_RENDITION_DISCOVERY",
  "MEDIA_RENDITION_CLEANUP_DISCOVERY",
] as const;
export const PLATFORM_JOB_SAFE_ERROR_CODES = [
  "LEASE_EXPIRED",
  "HANDLER_TIMEOUT",
  "HANDLER_ABORTED",
  "HANDLER_EXCEPTION",
  "TRANSIENT_FAILURE",
  "PERMANENT_FAILURE",
] as const;
