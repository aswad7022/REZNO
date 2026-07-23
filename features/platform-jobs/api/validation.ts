import "server-only";

import { z } from "zod";

import { PLATFORM_JOB_LIMITS } from "@/features/platform-jobs/domain/contracts";
import { PLATFORM_JOB_ALLOWED_TYPES } from "@/features/platform-jobs/domain/contracts";
import { platformJobError } from "@/features/platform-jobs/domain/errors";

const uuid = z.string().uuid();
const idempotency = z.object({ idempotencyKey: uuid }).strict();
const versioned = idempotency.extend({ expectedVersion: z.number().int().min(1).max(2_147_483_647) }).strict();

const trigger = idempotency.extend({ jobType: z.literal("PLATFORM_HEALTH_PROBE") }).strict();
const boundedBatch = idempotency.extend({
  batchSize: z.number().int().min(1).max(PLATFORM_JOB_LIMITS.maxWorkerBatch),
}).strict();
const scheduleState = versioned.extend({ enabled: z.boolean() }).strict();
const automationDiscovery = idempotency.extend({
  batchSize: z.number().int().min(1).max(PLATFORM_JOB_LIMITS.maxDomainDiscoveryBatch),
  jobType: z.enum([
    "STORAGE_MAINTENANCE_DISCOVERY",
    "STORAGE_RESCAN_DISCOVERY",
    "MEDIA_RENDITION_DISCOVERY",
    "MEDIA_RENDITION_CLEANUP_DISCOVERY",
  ]),
}).strict();
const automationRescan = versioned.extend({ assetId: uuid }).strict();

export async function readBoundedPlatformJobJson(request: Request) {
  const contentType = request.headers.get("content-type")?.trim().toLowerCase() ?? "";
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/.test(contentType)) {
    platformJobError("VALIDATION_ERROR", "Content-Type must be application/json.");
  }
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(declared)) platformJobError("VALIDATION_ERROR", "Content-Length is invalid.");
    const length = Number(declared);
    if (!Number.isSafeInteger(length)) platformJobError("VALIDATION_ERROR", "Content-Length is invalid.");
    if (length > PLATFORM_JOB_LIMITS.maxRequestBytes) platformJobError("PAYLOAD_TOO_LARGE", "The request body exceeds 8 KiB.");
  }
  if (!request.body) platformJobError("VALIDATION_ERROR", "A JSON request body is required.");
  const reader = request.body.getReader();
  const buffer = new Uint8Array(PLATFORM_JOB_LIMITS.maxRequestBytes);
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (size + chunk.value.byteLength > PLATFORM_JOB_LIMITS.maxRequestBytes) {
        await reader.cancel();
        platformJobError("PAYLOAD_TOO_LARGE", "The request body exceeds 8 KiB.");
      }
      buffer.set(chunk.value, size);
      size += chunk.value.byteLength;
    }
  } catch (error) {
    if (error instanceof Error && error.name === "PlatformJobDomainError") throw error;
    try { await reader.cancel(); } catch { /* no raw stream error leaves this boundary */ }
    platformJobError("VALIDATION_ERROR", "The request body could not be read safely.");
  } finally {
    reader.releaseLock();
  }
  if (size === 0) platformJobError("VALIDATION_ERROR", "A nonempty JSON request body is required.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size));
  } catch {
    platformJobError("VALIDATION_ERROR", "The request body must be valid UTF-8.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    platformJobError("VALIDATION_ERROR", "The request body must be valid JSON.");
  }
}

export function parsePlatformJobTrigger(raw: unknown) {
  return parse(trigger, raw);
}

export function parsePlatformJobVersionedMutation(raw: unknown) {
  return parse(versioned, raw);
}

export function parsePlatformJobWorkerBatch(raw: unknown) {
  return parse(boundedBatch, raw);
}

export function parsePlatformJobSchedulerBatch(raw: unknown) {
  return parse(boundedBatch, raw);
}

export function parsePlatformJobScheduleState(raw: unknown) {
  return parse(scheduleState, raw);
}

export function parseStorageAutomationDiscovery(raw: unknown) {
  return parse(automationDiscovery, raw);
}

export function parseStorageAutomationRescan(raw: unknown) {
  return parse(automationRescan, raw);
}

export function assertNoPlatformJobQuery(url: URL) {
  strictQuery(url.searchParams, []);
}

export function parsePlatformJobListQuery(url: URL) {
  strictQuery(url.searchParams, ["cursor", "jobType", "limit", "source", "status"]);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = optionalCursor(url.searchParams.get("cursor"));
  const jobType = optionalEnum(url.searchParams.get("jobType"), PLATFORM_JOB_ALLOWED_TYPES);
  const source = optionalEnum(url.searchParams.get("source"), ["ADMIN_MANUAL", "SCHEDULE", "DOMAIN_DISCOVERY"] as const);
  const status = optionalEnum(url.searchParams.get("status"), [
    "SCHEDULED", "AVAILABLE", "CLAIMED", "RUNNING", "SUCCEEDED",
    "RETRY_WAIT", "FAILED", "DEAD_LETTERED", "CANCELLED",
  ] as const);
  return { cursor, jobType, limit, source, status };
}

export function parsePlatformJobScheduleListQuery(url: URL) {
  strictQuery(url.searchParams, ["cursor", "limit"]);
  return {
    cursor: optionalCursor(url.searchParams.get("cursor")),
    limit: parseLimit(url.searchParams.get("limit")),
  };
}

function parse<T>(schema: z.ZodType<T>, raw: unknown) {
  const value = schema.safeParse(raw);
  if (!value.success) platformJobError("VALIDATION_ERROR", "The platform-job request is invalid.");
  return value.data;
}

function strictQuery(params: URLSearchParams, allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  for (const key of params.keys()) {
    if (!allowedSet.has(key) || params.getAll(key).length !== 1) {
      platformJobError("VALIDATION_ERROR", "The platform-job query is invalid.");
    }
  }
}

function parseLimit(value: string | null) {
  if (value === null) return undefined;
  if (!/^[1-9][0-9]?$/.test(value)) platformJobError("VALIDATION_ERROR", "The page size is invalid.");
  const limit = Number(value);
  if (limit > PLATFORM_JOB_LIMITS.maxListPage) platformJobError("VALIDATION_ERROR", "The page size is invalid.");
  return limit;
}

function optionalCursor(value: string | null) {
  if (value === null) return undefined;
  if (!value || value.length > 3_000 || !/^[A-Za-z0-9_-]+$/.test(value)) platformJobError("INVALID_CURSOR", "The platform-job cursor is invalid.");
  return value;
}

function optionalEnum<const T extends readonly string[]>(value: string | null, values: T): T[number] | undefined {
  if (value === null) return undefined;
  if (!values.includes(value)) platformJobError("VALIDATION_ERROR", "The platform-job filter is invalid.");
  return value as T[number];
}
