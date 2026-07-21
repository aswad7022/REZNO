import "server-only";

import { PlatformJobScheduleKey, PlatformJobType, Prisma } from "@prisma/client";

import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import { PLATFORM_JOB_LIMITS } from "@/features/platform-jobs/domain/contracts";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import { calculatePlatformScheduleTick } from "@/features/platform-jobs/domain/schedule";
import { parsePlatformJobPayload } from "@/features/platform-jobs/domain/registry";
import { assertPlatformJobAdminCurrent, type PlatformJobAdminContext } from "@/features/platform-jobs/services/admin-context";
import { enqueuePlatformJob } from "@/features/platform-jobs/services/jobs";
import { lockPlatformJobSchedule, runPlatformJobSerializable } from "@/features/platform-jobs/services/transaction";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createPlatformJobSchedule(
  transaction: Prisma.TransactionClient,
  input: {
    cadenceSeconds: number;
    catchupLimit: number;
    createdByAdminUserId: string;
    createdByPersonId: string;
    enabled?: boolean;
    jobType: PlatformJobType;
    nextRunAt: Date;
    organizationId?: string | null;
    payload: unknown;
    payloadVersion: number;
    scheduleKey: PlatformJobScheduleKey;
  },
) {
  if (input.scheduleKey !== "PLATFORM_HEALTH_PROBE" || input.jobType !== "PLATFORM_HEALTH_PROBE") {
    platformJobError("VALIDATION_ERROR", "The Gate 6A schedule mapping is not registered.");
  }
  if (!Number.isInteger(input.cadenceSeconds) || input.cadenceSeconds < 60 || input.cadenceSeconds > 604_800) {
    platformJobError("VALIDATION_ERROR", "The platform-job schedule cadence is invalid.");
  }
  if (!Number.isInteger(input.catchupLimit) || input.catchupLimit < 1 || input.catchupLimit > PLATFORM_JOB_LIMITS.maxScheduleCatchup) {
    platformJobError("VALIDATION_ERROR", "The platform-job schedule catch-up limit is invalid.");
  }
  const payload = parsePlatformJobPayload(input.jobType, input.payloadVersion, input.payload);
  const payloadHash = platformJobHash(payload);
  const scopeKey = input.organizationId ? `organization:${input.organizationId}` : "platform";
  const existing = await transaction.platformJobSchedule.findUnique({
    where: { scheduleKey_scopeKey: { scheduleKey: input.scheduleKey, scopeKey } },
  });
  if (existing) {
    const exact = existing.jobType === input.jobType
      && existing.payloadVersion === input.payloadVersion
      && existing.payloadHash === payloadHash
      && existing.cadenceSeconds === input.cadenceSeconds
      && existing.catchupLimit === input.catchupLimit
      && existing.createdByAdminUserId === input.createdByAdminUserId
      && existing.createdByPersonId === input.createdByPersonId
      && existing.nextRunAt.getTime() === input.nextRunAt.getTime();
    if (!exact) platformJobError("IDEMPOTENCY_CONFLICT", "The closed schedule identity already exists with different input.");
    return { replay: true as const, schedule: existing };
  }
  const schedule = await transaction.platformJobSchedule.create({
    data: {
      cadenceSeconds: input.cadenceSeconds,
      catchupLimit: input.catchupLimit,
      createdByAdminUserId: input.createdByAdminUserId,
      createdByPersonId: input.createdByPersonId,
      enabled: input.enabled ?? false,
      jobType: input.jobType,
      nextRunAt: input.nextRunAt,
      organizationId: input.organizationId ?? null,
      payload: payload as Prisma.InputJsonValue,
      payloadHash,
      payloadVersion: input.payloadVersion,
      scheduleKey: input.scheduleKey,
      scopeKey,
    },
  });
  return { replay: false as const, schedule };
}

export async function setPlatformJobScheduleEnabled(
  context: PlatformJobAdminContext,
  input: { enabled: boolean; expectedVersion: number; idempotencyKey: string; scheduleId: string },
) {
  assertUuid(input.scheduleId, "schedule ID");
  assertUuid(input.idempotencyKey, "idempotency key");
  assertVersion(input.expectedVersion);
  const action = input.enabled ? "SCHEDULE_ENABLE" : "SCHEDULE_DISABLE";
  const requestHash = platformJobHash({ action, expectedVersion: input.expectedVersion, scheduleId: input.scheduleId });
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(transaction, context, "PLATFORM_JOBS_MANAGE");
    const existing = await transaction.platformJobMutation.findUnique({
      where: { actorAdminUserId_idempotencyKey: { actorAdminUserId: current.userId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      if (existing.action !== action || existing.requestHash !== requestHash) {
        platformJobError("IDEMPOTENCY_CONFLICT", "The schedule idempotency key was reused with changed input.");
      }
      return { ...(safeResult(existing.result)), replay: true as const };
    }
    await lockPlatformJobSchedule(transaction, input.scheduleId);
    const schedule = await transaction.platformJobSchedule.findUnique({ where: { id: input.scheduleId } });
    if (!schedule) platformJobError("NOT_FOUND", "The platform-job schedule was not found.");
    if (schedule.version !== input.expectedVersion) platformJobError("CONFLICT", "The platform-job schedule version changed.");
    if (schedule.enabled === input.enabled) platformJobError("CONFLICT", "The platform-job schedule already has the requested state.");
    const updated = await transaction.platformJobSchedule.update({
      where: { id: schedule.id },
      data: { enabled: input.enabled, updatedAt: new Date(), version: { increment: 1 } },
    });
    const result = { enabled: updated.enabled, scheduleId: updated.id, version: updated.version };
    await transaction.platformJobMutation.create({
      data: {
        action,
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        result,
        scheduleId: updated.id,
      },
    });
    return { ...result, replay: false as const };
  });
}

export async function runPlatformSchedulerTick(
  context: PlatformJobAdminContext,
  input: { batchSize: number; idempotencyKey: string; now?: Date },
) {
  assertUuid(input.idempotencyKey, "idempotency key");
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > PLATFORM_JOB_LIMITS.maxSchedulerBatch) {
    platformJobError("VALIDATION_ERROR", "The scheduler batch is outside the accepted bound.");
  }
  const now = input.now ?? new Date();
  const requestHash = platformJobHash({ action: "SCHEDULER_TICK", batchSize: input.batchSize });
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(transaction, context, "PLATFORM_JOBS_MANAGE");
    const existing = await transaction.platformJobMutation.findUnique({
      where: { actorAdminUserId_idempotencyKey: { actorAdminUserId: current.userId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      if (existing.action !== "SCHEDULER_TICK" || existing.requestHash !== requestHash) {
        platformJobError("IDEMPOTENCY_CONFLICT", "The scheduler idempotency key was reused with changed input.");
      }
      return { ...safeResult(existing.result), replay: true as const };
    }
    const due = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT schedule."id"
      FROM "PlatformJobSchedule" AS schedule
      WHERE schedule."enabled" = TRUE
        AND schedule."nextRunAt" <= ${now}
      ORDER BY schedule."nextRunAt", schedule."id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${input.batchSize}
    `);
    let jobsCreated = 0;
    let intervalsSkipped = 0;
    for (const item of due) {
      const schedule = await transaction.platformJobSchedule.findUnique({ where: { id: item.id } });
      if (!schedule?.enabled || schedule.nextRunAt.getTime() > now.getTime()) continue;
      const tick = calculatePlatformScheduleTick({
        cadenceSeconds: schedule.cadenceSeconds,
        catchupLimit: schedule.catchupLimit,
        nextRunAt: schedule.nextRunAt,
        now,
      });
      for (const dueAt of tick.due) {
        const created = await enqueuePlatformJob(transaction, {
          availableAt: now,
          createdByAdminUserId: current.userId,
          createdByPersonId: current.personId,
          deduplicationKey: `schedule:${schedule.id}:${dueAt.toISOString()}`,
          jobType: schedule.jobType,
          organizationId: schedule.organizationId,
          payload: schedule.payload,
          payloadVersion: schedule.payloadVersion,
          scheduleId: schedule.id,
          source: "SCHEDULE",
        });
        if (!created.replay) jobsCreated += 1;
      }
      intervalsSkipped += tick.skipped;
      await transaction.platformJobSchedule.update({
        where: { id: schedule.id },
        data: { lastTickAt: now, nextRunAt: tick.nextRunAt, updatedAt: now, version: { increment: 1 } },
      });
    }
    const result = {
      intervalsSkipped,
      jobsCreated,
      schedulesProcessed: due.length,
    };
    await transaction.platformJobMutation.create({
      data: {
        action: "SCHEDULER_TICK",
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        result,
      },
    });
    return { ...result, replay: false as const };
  });
}

function safeResult(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    platformJobError("CONFLICT", "The stored scheduler mutation result is invalid.");
  }
  return value as Record<string, string | number | boolean | null>;
}

function assertUuid(value: string, label: string) {
  if (!UUID.test(value)) platformJobError("VALIDATION_ERROR", `The ${label} is invalid.`);
}

function assertVersion(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    platformJobError("VALIDATION_ERROR", "The expected version is invalid.");
  }
}
