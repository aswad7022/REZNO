import { createHash } from "node:crypto";

import { PLATFORM_JOB_LIMITS } from "@/features/platform-jobs/domain/contracts";
import { platformJobError } from "@/features/platform-jobs/domain/errors";

export function platformLeaseExpiry(now: Date, leaseSeconds: number) {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < PLATFORM_JOB_LIMITS.minLeaseSeconds || leaseSeconds > PLATFORM_JOB_LIMITS.maxLeaseSeconds) {
    platformJobError("VALIDATION_ERROR", "The lease duration is outside the accepted bound.");
  }
  return safeFutureDate(now, leaseSeconds * 1_000);
}

export function platformHeartbeatExpiry(
  now: Date,
  claimedAt: Date,
  extensionSeconds: number,
) {
  if (!Number.isInteger(extensionSeconds) || extensionSeconds < 1 || extensionSeconds > PLATFORM_JOB_LIMITS.maxHeartbeatExtensionSeconds) {
    platformJobError("VALIDATION_ERROR", "The heartbeat extension is outside the accepted bound.");
  }
  const requested = safeFutureDate(now, extensionSeconds * 1_000);
  const horizon = safeFutureDate(claimedAt, PLATFORM_JOB_LIMITS.maxLeaseHorizonSeconds * 1_000);
  return requested.getTime() <= horizon.getTime() ? requested : horizon;
}

export function platformRetryDelayMs(jobId: string, attemptNumber: number, maxAttempts: number) {
  if (!Number.isInteger(attemptNumber) || !Number.isInteger(maxAttempts) || attemptNumber < 1 || maxAttempts < 1 || maxAttempts > PLATFORM_JOB_LIMITS.maxAttempts) {
    platformJobError("VALIDATION_ERROR", "Retry attempt bounds are invalid.");
  }
  if (attemptNumber >= maxAttempts) return null;
  const baseSeconds = Math.min(
    PLATFORM_JOB_LIMITS.maxRetryDelaySeconds,
    PLATFORM_JOB_LIMITS.minRetryDelaySeconds * (2 ** (attemptNumber - 1)),
  );
  const digest = createHash("sha256").update(`${jobId}:${attemptNumber}`).digest();
  const ratio = digest.readUInt32BE(0) / 0xffffffff;
  const jittered = Math.round(baseSeconds * (0.8 + ratio * 0.4));
  return Math.max(
    PLATFORM_JOB_LIMITS.minRetryDelaySeconds,
    Math.min(PLATFORM_JOB_LIMITS.maxRetryDelaySeconds, jittered),
  ) * 1_000;
}

export function safeFutureDate(now: Date, delayMs: number) {
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
    platformJobError("VALIDATION_ERROR", "The requested timestamp delay is invalid.");
  }
  const value = now.getTime() + delayMs;
  if (!Number.isSafeInteger(value) || value > 8_640_000_000_000_000) {
    platformJobError("VALIDATION_ERROR", "The requested timestamp exceeds the supported range.");
  }
  return new Date(value);
}
