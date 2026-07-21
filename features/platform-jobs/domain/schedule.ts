import { PLATFORM_JOB_LIMITS } from "@/features/platform-jobs/domain/contracts";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import { safeFutureDate } from "@/features/platform-jobs/domain/execution";

export function calculatePlatformScheduleTick(input: {
  nextRunAt: Date;
  now: Date;
  cadenceSeconds: number;
  catchupLimit: number;
}) {
  if (!Number.isInteger(input.cadenceSeconds) || input.cadenceSeconds < 60 || input.cadenceSeconds > 604_800) {
    platformJobError("VALIDATION_ERROR", "The schedule cadence is invalid.");
  }
  if (!Number.isInteger(input.catchupLimit) || input.catchupLimit < 1 || input.catchupLimit > PLATFORM_JOB_LIMITS.maxScheduleCatchup) {
    platformJobError("VALIDATION_ERROR", "The schedule catch-up bound is invalid.");
  }
  if (input.nextRunAt.getTime() > input.now.getTime()) {
    return { due: [], nextRunAt: input.nextRunAt, skipped: 0 } as const;
  }
  const cadenceMs = input.cadenceSeconds * 1_000;
  const intervals = Math.floor((input.now.getTime() - input.nextRunAt.getTime()) / cadenceMs) + 1;
  const emitted = Math.min(intervals, input.catchupLimit);
  const due = Array.from({ length: emitted }, (_, index) => safeFutureDate(input.nextRunAt, index * cadenceMs));
  return {
    due,
    nextRunAt: safeFutureDate(input.nextRunAt, intervals * cadenceMs),
    skipped: intervals - emitted,
  } as const;
}
