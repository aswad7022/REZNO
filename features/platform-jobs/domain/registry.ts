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

const registry = {
  PLATFORM_HEALTH_PROBE: {
    payloadVersion: 1,
    payload: healthPayload,
    result: healthResult,
    retryableErrors: new Set(["TRANSIENT_FAILURE", "HANDLER_TIMEOUT", "HANDLER_EXCEPTION"]),
  },
} as const satisfies Record<PlatformJobType, {
  payloadVersion: number;
  payload: z.ZodType;
  result: z.ZodType;
  retryableErrors: ReadonlySet<string>;
}>;

export type PlatformHealthPayload = z.infer<typeof healthPayload>;
export type PlatformHealthResult = z.infer<typeof healthResult>;

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
