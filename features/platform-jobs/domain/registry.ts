import type { PlatformJobType } from "@prisma/client";
import { z } from "zod";

import { PLATFORM_JOB_LIMITS } from "@/features/platform-jobs/domain/contracts";
import { serializedUtf8Bytes } from "@/features/platform-jobs/domain/canonical";
import { platformJobError } from "@/features/platform-jobs/domain/errors";

const healthPayload = z.object({
  probe: z.literal("DURABLE_FOUNDATION"),
  version: z.literal(1),
}).strict();

const healthResult = z.object({
  executionGeneration: z.string().regex(/^[1-9][0-9]{0,18}$/),
  kind: z.literal("PLATFORM_HEALTHY"),
  payloadVersion: z.literal(1),
}).strict();

const discoveryPayload = z.object({
  batchSize: z.number().int().min(1).max(PLATFORM_JOB_LIMITS.maxDomainDiscoveryBatch),
}).strict();

const exactAssetPayload = z.object({
  assetId: z.string().uuid(),
  expectedVersion: z.number().int().min(1).max(2_147_483_647),
}).strict();

const exactSessionPayload = z.object({
  expectedVersion: z.number().int().min(1).max(2_147_483_647),
  uploadSessionId: z.string().uuid(),
}).strict();

const renditionProfile = z.enum(["AVATAR_256_WEBP", "CARD_640_WEBP", "HERO_1600_WEBP"]);
const renditionGeneratePayload = exactAssetPayload.extend({ profile: renditionProfile }).strict();
const renditionDeletePayload = z.object({
  expectedVersion: z.number().int().min(1).max(2_147_483_647),
  renditionId: z.string().uuid(),
}).strict();

function discoveryResult(kind: string) {
  return z.object({
    enqueued: z.number().int().min(0).max(PLATFORM_JOB_LIMITS.maxDomainDiscoveryBatch * 3),
    kind: z.literal(kind),
    scanned: z.number().int().min(0).max(PLATFORM_JOB_LIMITS.maxDomainDiscoveryBatch * 3),
    skipped: z.number().int().min(0).max(PLATFORM_JOB_LIMITS.maxDomainDiscoveryBatch * 3),
  }).strict();
}

function exactItemResult(kind: string) {
  return z.object({
    kind: z.literal(kind),
    outcome: z.enum(["COMPLETED", "ABSENT", "STALE", "SUPERSEDED"]),
    state: z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/),
  }).strict();
}

const renditionResult = z.object({
  height: z.number().int().min(1).max(1_600),
  kind: z.literal("MEDIA_RENDITION_GENERATED"),
  profile: renditionProfile,
  sizeBytes: z.number().int().min(1).max(4 * 1024 * 1024),
  state: z.literal("READY"),
  width: z.number().int().min(1).max(1_600),
}).strict();

const retryableErrors = new Set(["TRANSIENT_FAILURE", "HANDLER_TIMEOUT", "HANDLER_EXCEPTION"]);

const registry = {
  PLATFORM_HEALTH_PROBE: {
    payloadVersion: 1,
    payload: healthPayload,
    result: healthResult,
    retryableErrors: new Set(["TRANSIENT_FAILURE", "HANDLER_TIMEOUT", "HANDLER_EXCEPTION"]),
  },
  STORAGE_MAINTENANCE_DISCOVERY: definition(discoveryPayload, discoveryResult("STORAGE_MAINTENANCE_DISCOVERED")),
  STORAGE_ORPHAN_CLEANUP: definition(exactSessionPayload, exactItemResult("STORAGE_ORPHAN_CLEANED")),
  STORAGE_ASSET_DELETE_RETRY: definition(exactAssetPayload, exactItemResult("STORAGE_ASSET_DELETE_RETRIED")),
  STORAGE_RESCAN_DISCOVERY: definition(discoveryPayload, discoveryResult("STORAGE_RESCAN_DISCOVERED")),
  STORAGE_ASSET_RESCAN: definition(exactAssetPayload, exactItemResult("STORAGE_ASSET_RESCANNED")),
  MEDIA_RENDITION_DISCOVERY: definition(discoveryPayload, discoveryResult("MEDIA_RENDITION_DISCOVERED")),
  MEDIA_RENDITION_GENERATE: definition(renditionGeneratePayload, renditionResult),
  MEDIA_RENDITION_CLEANUP_DISCOVERY: definition(discoveryPayload, discoveryResult("MEDIA_RENDITION_CLEANUP_DISCOVERED")),
  MEDIA_RENDITION_DELETE: definition(renditionDeletePayload, exactItemResult("MEDIA_RENDITION_DELETED")),
} as const satisfies Record<PlatformJobType, {
  payloadVersion: number;
  payload: z.ZodType;
  result: z.ZodType;
  retryableErrors: ReadonlySet<string>;
}>;

export type PlatformHealthPayload = z.infer<typeof healthPayload>;
export type PlatformHealthResult = z.infer<typeof healthResult>;

function definition(payload: z.ZodType, result: z.ZodType) {
  return { payloadVersion: 1, payload, result, retryableErrors };
}

export function parsePlatformJobPayload(
  jobType: PlatformJobType,
  payloadVersion: number,
  raw: unknown,
) {
  const definition = registry[jobType];
  if (!definition || payloadVersion !== definition.payloadVersion) {
    platformJobError("VALIDATION_ERROR", "The job type or payload version is not registered.");
  }
  const parsed = definition.payload.safeParse(raw);
  if (!parsed.success || serializedUtf8Bytes(parsed.data) > PLATFORM_JOB_LIMITS.maxPayloadBytes) {
    platformJobError("VALIDATION_ERROR", "The job payload is invalid or exceeds its bound.");
  }
  return parsed.data;
}

export function parsePlatformJobResult(jobType: PlatformJobType, raw: unknown) {
  const parsed = registry[jobType].result.safeParse(raw);
  if (!parsed.success || serializedUtf8Bytes(parsed.data) > PLATFORM_JOB_LIMITS.maxResultBytes) {
    platformJobError("PLATFORM_JOB_FAILURE", "The job handler returned unsafe result metadata.");
  }
  return parsed.data;
}

export function isRetryablePlatformJobError(jobType: PlatformJobType, errorCode: string) {
  return registry[jobType].retryableErrors.has(errorCode);
}

export function platformJobPayloadSummary(jobType: PlatformJobType, payloadVersion: number) {
  return { jobType, payloadVersion, containsReferencesOnly: true } as const;
}

export function platformHealthPayload(): PlatformHealthPayload {
  return { probe: "DURABLE_FOUNDATION", version: 1 };
}

export function platformDiscoveryPayload(batchSize: number) {
  return parsePlatformJobPayload("STORAGE_MAINTENANCE_DISCOVERY", 1, { batchSize }) as { batchSize: number };
}
