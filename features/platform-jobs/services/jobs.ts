import "server-only";

import {
  PlatformJobErrorCode,
  PlatformJobSource,
  PlatformJobStatus,
  PlatformJobType,
  Prisma,
} from "@prisma/client";

import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import { PLATFORM_JOB_LIMITS } from "@/features/platform-jobs/domain/contracts";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import {
  platformHeartbeatExpiry,
  platformLeaseExpiry,
  platformRetryDelayMs,
  safeFutureDate,
} from "@/features/platform-jobs/domain/execution";
import { parsePlatformJobPayload, parsePlatformJobResult, isRetryablePlatformJobError } from "@/features/platform-jobs/domain/registry";
import { prisma } from "@/lib/db/prisma";
import { runPlatformJobSerializable } from "@/features/platform-jobs/services/transaction";
import {
  assertPlatformJobOperationOwned,
  platformJobDatabaseNow,
  type PlatformJobOperationAuthority,
} from "@/features/platform-jobs/services/operation-lease";

export type ClaimedPlatformJob = {
  attemptCount: number;
  fencingToken: bigint;
  id: string;
  jobType: PlatformJobType;
  leaseExpiresAt: Date;
  leaseToken: string;
  maxAttempts: number;
  payload: Prisma.JsonValue;
  payloadVersion: number;
};

export async function enqueuePlatformJob(
  transaction: Prisma.TransactionClient,
  input: {
    availableAt: Date;
    createdByAdminUserId: string;
    createdByPersonId: string;
    deduplicationKey: string;
    jobType: PlatformJobType;
    maxAttempts?: number;
    organizationId?: string | null;
    payload: unknown;
    payloadVersion: number;
    priority?: number;
    requeueRootJobId?: string | null;
    requeueSequence?: number;
    scheduleId?: string | null;
    source: PlatformJobSource;
  },
) {
  const payload = parsePlatformJobPayload(input.jobType, input.payloadVersion, input.payload);
  const payloadHash = platformJobHash(payload);
  const maxAttempts = input.maxAttempts ?? 5;
  const priority = input.priority ?? 5;
  if (!Number.isInteger(priority) || priority < 0 || priority > 9) {
    platformJobError("VALIDATION_ERROR", "The platform-job priority is invalid.");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > PLATFORM_JOB_LIMITS.maxAttempts) {
    platformJobError("VALIDATION_ERROR", "The maximum job attempts value is invalid.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:~-]{0,159}$/.test(input.deduplicationKey)) {
    platformJobError("VALIDATION_ERROR", "The server-generated deduplication key is invalid.");
  }
  if ((input.source === "SCHEDULE") !== Boolean(input.scheduleId)) {
    platformJobError("VALIDATION_ERROR", "The job source and schedule reference disagree.");
  }
  const scopeKey = input.organizationId ? `organization:${input.organizationId}` : "platform";
  const existing = await transaction.platformJob.findUnique({
    where: {
      jobType_scopeKey_deduplicationKey: {
        deduplicationKey: input.deduplicationKey,
        jobType: input.jobType,
        scopeKey,
      },
    },
  });
  if (existing) {
    const exact = existing.payloadHash === payloadHash
      && existing.payloadVersion === input.payloadVersion
      && existing.source === input.source
      && existing.scheduleId === (input.scheduleId ?? null)
      && existing.createdByAdminUserId === input.createdByAdminUserId
      && existing.createdByPersonId === input.createdByPersonId
      && existing.priority === priority
      && existing.maxAttempts === maxAttempts
      && existing.availableAt.getTime() === input.availableAt.getTime()
      && existing.requeueRootJobId === (input.requeueRootJobId ?? null)
      && existing.requeueSequence === (input.requeueSequence ?? 0);
    if (!exact) platformJobError("IDEMPOTENCY_CONFLICT", "The platform-job deduplication key was reused with different input.");
    return { job: existing, replay: true as const };
  }
  const now = new Date();
  const status: PlatformJobStatus = input.availableAt.getTime() > now.getTime() ? "SCHEDULED" : "AVAILABLE";
  const job = await transaction.platformJob.create({
    data: {
      availableAt: input.availableAt,
      createdByAdminUserId: input.createdByAdminUserId,
      createdByPersonId: input.createdByPersonId,
      deduplicationKey: input.deduplicationKey,
      jobType: input.jobType,
      maxAttempts,
      organizationId: input.organizationId ?? null,
      payload: payload as Prisma.InputJsonValue,
      payloadHash,
      payloadVersion: input.payloadVersion,
      priority,
      requeueRootJobId: input.requeueRootJobId ?? null,
      requeueSequence: input.requeueSequence ?? 0,
      scheduleId: input.scheduleId ?? null,
      scopeKey,
      source: input.source,
      status,
    },
  });
  return { job, replay: false as const };
}

export async function claimPlatformJobs(input: {
  batchSize: number;
  leaseSeconds?: number;
  now?: Date;
  workerId: string;
}): Promise<ClaimedPlatformJob[]> {
  return prisma.$transaction(
    (transaction) => claimPlatformJobsInTransaction(transaction, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}

export async function claimPlatformJobsInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    batchSize: number;
    leaseSeconds?: number;
    now?: Date;
    operation?: PlatformJobOperationAuthority;
    workerId: string;
  },
): Promise<ClaimedPlatformJob[]> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,95}$/.test(input.workerId)) {
    platformJobError("VALIDATION_ERROR", "The server-generated worker identity is invalid.");
  }
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > PLATFORM_JOB_LIMITS.maxWorkerBatch) {
    platformJobError("VALIDATION_ERROR", "The worker batch is outside the accepted bound.");
  }
  const now = input.now ?? new Date();
  if (input.operation) await assertPlatformJobOperationOwned(transaction, input.operation, now);
  const leaseExpiresAt = platformLeaseExpiry(now, input.leaseSeconds ?? PLATFORM_JOB_LIMITS.defaultLeaseSeconds);
  return transaction.$queryRaw<ClaimedPlatformJob[]>(Prisma.sql`
    WITH candidates AS (
      SELECT job."id"
      FROM "PlatformJob" AS job
      WHERE job."status" IN ('SCHEDULED', 'AVAILABLE', 'RETRY_WAIT')
        AND job."availableAt" <= ${now}
        AND job."attemptCount" < job."maxAttempts"
      ORDER BY job."priority" DESC, job."availableAt" ASC, job."id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${input.batchSize}
    ), claimed AS (
      UPDATE "PlatformJob" AS job
      SET "status" = 'CLAIMED',
          "attemptCount" = job."attemptCount" + 1,
          "leaseOwner" = ${input.workerId},
          "leaseToken" = gen_random_uuid(),
          "fencingToken" = job."fencingToken" + 1,
          "leaseExpiresAt" = ${leaseExpiresAt},
          "heartbeatAt" = ${now},
          "claimedAt" = ${now},
          "startedAt" = NULL,
          "lastErrorCode" = NULL,
          "version" = job."version" + 1,
          "updatedAt" = ${now}
      FROM candidates
      WHERE job."id" = candidates."id"
      RETURNING job."id", job."jobType", job."payloadVersion", job."payload",
                job."attemptCount", job."maxAttempts", job."leaseToken",
                job."fencingToken", job."leaseExpiresAt"
    ), attempts AS (
      INSERT INTO "PlatformJobAttempt" (
        "id", "jobId", "attemptNumber", "status", "workerId", "leaseToken",
        "fencingToken", "heartbeatAt", "createdAt", "updatedAt"
      )
      SELECT gen_random_uuid(), claimed."id", claimed."attemptCount", 'CLAIMED',
             ${input.workerId}, claimed."leaseToken", claimed."fencingToken",
             ${now}, ${now}, ${now}
      FROM claimed
      RETURNING "jobId"
    )
    SELECT claimed."id",
           claimed."jobType" AS "jobType",
           claimed."payloadVersion" AS "payloadVersion",
           claimed."payload",
           claimed."attemptCount" AS "attemptCount",
           claimed."maxAttempts" AS "maxAttempts",
           claimed."leaseToken"::text AS "leaseToken",
           claimed."fencingToken" AS "fencingToken",
           claimed."leaseExpiresAt" AS "leaseExpiresAt"
    FROM claimed
    ORDER BY claimed."id"
  `);
}

export async function startPlatformJob(input: {
  fencingToken: bigint;
  jobId: string;
  leaseToken: string;
  now?: Date;
  operation?: PlatformJobOperationAuthority;
  workerId: string;
}) {
  const now = input.now ?? new Date();
  return runPlatformJobSerializable(async (transaction) => {
    if (input.operation) {
      await assertPlatformJobOperationOwned(transaction, input.operation, await platformJobDatabaseNow(transaction));
    }
    const updated = await transaction.platformJob.updateMany({
      where: {
        id: input.jobId,
        fencingToken: input.fencingToken,
        leaseExpiresAt: { gt: now },
        leaseOwner: input.workerId,
        leaseToken: input.leaseToken,
        status: "CLAIMED",
      },
      data: { startedAt: now, status: "RUNNING", updatedAt: now, version: { increment: 1 } },
    });
    if (updated.count !== 1) platformJobError("STALE_LEASE", "The job claim is stale or no longer owned by this worker.");
    const attempt = await transaction.platformJobAttempt.updateMany({
      where: { fencingToken: input.fencingToken, jobId: input.jobId, leaseToken: input.leaseToken, status: "CLAIMED" },
      data: { heartbeatAt: now, startedAt: now, status: "RUNNING", updatedAt: now },
    });
    if (attempt.count !== 1) platformJobError("CONFLICT", "The canonical job attempt is unavailable.");
    return { startedAt: now };
  });
}

export async function heartbeatPlatformJob(input: {
  extensionSeconds: number;
  fencingToken: bigint;
  jobId: string;
  leaseToken: string;
  now?: Date;
  workerId: string;
}) {
  const now = input.now ?? new Date();
  return runPlatformJobSerializable(async (transaction) => {
    const current = await transaction.platformJob.findFirst({
      where: {
        id: input.jobId,
        fencingToken: input.fencingToken,
        leaseOwner: input.workerId,
        leaseToken: input.leaseToken,
        status: { in: ["CLAIMED", "RUNNING"] },
      },
      select: { claimedAt: true, leaseExpiresAt: true },
    });
    if (!current?.claimedAt || !current.leaseExpiresAt) platformJobError("STALE_LEASE", "The heartbeat lease is stale.");
    if (current.leaseExpiresAt.getTime() <= now.getTime()) platformJobError("LEASE_EXPIRED", "The job lease has expired.");
    const leaseExpiresAt = platformHeartbeatExpiry(now, current.claimedAt, input.extensionSeconds);
    if (leaseExpiresAt.getTime() <= now.getTime()) platformJobError("LEASE_EXPIRED", "The maximum job lease horizon has elapsed.");
    const job = await transaction.platformJob.updateMany({
      where: {
        id: input.jobId,
        fencingToken: input.fencingToken,
        leaseExpiresAt: { gt: now },
        leaseOwner: input.workerId,
        leaseToken: input.leaseToken,
        status: { in: ["CLAIMED", "RUNNING"] },
      },
      data: { heartbeatAt: now, leaseExpiresAt, updatedAt: now, version: { increment: 1 } },
    });
    if (job.count !== 1) platformJobError("STALE_LEASE", "The heartbeat lost its lease race.");
    const attempt = await transaction.platformJobAttempt.updateMany({
      where: { fencingToken: input.fencingToken, jobId: input.jobId, leaseToken: input.leaseToken, status: { in: ["CLAIMED", "RUNNING"] } },
      data: { heartbeatAt: now, updatedAt: now },
    });
    if (attempt.count !== 1) platformJobError("CONFLICT", "The canonical job attempt is unavailable.");
    return { heartbeatAt: now, leaseExpiresAt };
  });
}

export async function completePlatformJob(input: {
  fencingToken: bigint;
  jobId: string;
  leaseToken: string;
  now?: Date;
  operation?: PlatformJobOperationAuthority;
  result: unknown;
  workerId: string;
}) {
  const now = input.now ?? new Date();
  return runPlatformJobSerializable(async (transaction) => {
    if (input.operation) {
      await assertPlatformJobOperationOwned(transaction, input.operation, await platformJobDatabaseNow(transaction));
    }
    const attempt = await transaction.platformJobAttempt.findUnique({
      where: { jobId_leaseToken: { jobId: input.jobId, leaseToken: input.leaseToken } },
      include: { job: { select: { jobType: true } } },
    });
    if (!attempt) platformJobError("STALE_LEASE", "The completion attempt is unknown.");
    if (attempt.fencingToken !== input.fencingToken) platformJobError("STALE_LEASE", "The completion fencing generation is stale.");
    const result = parsePlatformJobResult(attempt.job.jobType, input.result);
    const resultHash = platformJobHash(result);
    if (attempt.status === "SUCCEEDED") {
      if (attempt.resultHash !== resultHash) platformJobError("CONFLICT", "The completed job was replayed with changed result metadata.");
      return { replay: true as const, status: "SUCCEEDED" as const };
    }
    if (attempt.status !== "RUNNING") platformJobError("STALE_LEASE", "The completion attempt is no longer active.");
    const job = await transaction.platformJob.updateMany({
      where: {
        id: input.jobId,
        fencingToken: input.fencingToken,
        leaseExpiresAt: { gt: now },
        leaseOwner: input.workerId,
        leaseToken: input.leaseToken,
        status: "RUNNING",
      },
      data: {
        claimedAt: null,
        completedAt: now,
        heartbeatAt: null,
        leaseExpiresAt: null,
        leaseOwner: null,
        leaseToken: null,
        resultHash,
        resultMetadata: result as Prisma.InputJsonValue,
        status: "SUCCEEDED",
        updatedAt: now,
        version: { increment: 1 },
      },
    });
    if (job.count !== 1) platformJobError("STALE_LEASE", "The completion lease is stale or expired.");
    const updatedAttempt = await transaction.platformJobAttempt.updateMany({
      where: { id: attempt.id, status: "RUNNING" },
      data: {
        finishedAt: now,
        resultHash,
        resultMetadata: result as Prisma.InputJsonValue,
        status: "SUCCEEDED",
        updatedAt: now,
      },
    });
    if (updatedAttempt.count !== 1) platformJobError("CONFLICT", "The completion attempt lost its terminal race.");
    return { replay: false as const, status: "SUCCEEDED" as const };
  });
}

export async function failPlatformJob(input: {
  errorCode: PlatformJobErrorCode;
  fencingToken: bigint;
  jobId: string;
  leaseToken: string;
  now?: Date;
  operation?: PlatformJobOperationAuthority;
  retryable: boolean;
  workerId: string;
}) {
  const now = input.now ?? new Date();
  return runPlatformJobSerializable(async (transaction) => {
    if (input.operation) {
      await assertPlatformJobOperationOwned(transaction, input.operation, await platformJobDatabaseNow(transaction));
    }
    const attempt = await transaction.platformJobAttempt.findUnique({
      where: { jobId_leaseToken: { jobId: input.jobId, leaseToken: input.leaseToken } },
      include: { job: true },
    });
    if (!attempt) platformJobError("STALE_LEASE", "The failure attempt is unknown.");
    if (attempt.fencingToken !== input.fencingToken) platformJobError("STALE_LEASE", "The failure fencing generation is stale.");
    if (["RETRY_SCHEDULED", "FAILED", "DEAD_LETTERED"].includes(attempt.status)) {
      if (attempt.errorCode !== input.errorCode) platformJobError("CONFLICT", "The failed job was replayed with a changed safe error code.");
      return { replay: true as const, status: attempt.job.status };
    }
    if (attempt.status !== "RUNNING") platformJobError("STALE_LEASE", "The failure attempt is no longer active.");
    const delay = input.retryable && isRetryablePlatformJobError(attempt.job.jobType, input.errorCode)
      ? platformRetryDelayMs(input.jobId, attempt.attemptNumber, attempt.job.maxAttempts)
      : null;
    const status: PlatformJobStatus = delay !== null
      ? "RETRY_WAIT"
      : input.retryable ? "DEAD_LETTERED" : "FAILED";
    const attemptStatus = status === "RETRY_WAIT" ? "RETRY_SCHEDULED" : status;
    const availableAt = delay === null ? attempt.job.availableAt : safeFutureDate(now, delay);
    const job = await transaction.platformJob.updateMany({
      where: {
        id: input.jobId,
        fencingToken: input.fencingToken,
        leaseExpiresAt: { gt: now },
        leaseOwner: input.workerId,
        leaseToken: input.leaseToken,
        status: "RUNNING",
      },
      data: {
        availableAt,
        claimedAt: null,
        failedAt: status === "RETRY_WAIT" ? null : now,
        heartbeatAt: null,
        lastErrorCode: input.errorCode,
        leaseExpiresAt: null,
        leaseOwner: null,
        leaseToken: null,
        startedAt: status === "RETRY_WAIT" ? null : attempt.job.startedAt,
        status,
        updatedAt: now,
        version: { increment: 1 },
      },
    });
    if (job.count !== 1) platformJobError("STALE_LEASE", "The failure lease is stale or expired.");
    const updatedAttempt = await transaction.platformJobAttempt.updateMany({
      where: { id: attempt.id, status: "RUNNING" },
      data: { errorCode: input.errorCode, finishedAt: now, status: attemptStatus, updatedAt: now },
    });
    if (updatedAttempt.count !== 1) platformJobError("CONFLICT", "The failure attempt lost its terminal race.");
    return { replay: false as const, status };
  });
}

export async function recoverExpiredPlatformJobLeases(
  now = new Date(),
  batchSize: number = PLATFORM_JOB_LIMITS.maxWorkerBatch,
  scope?: { operation?: PlatformJobOperationAuthority; workerId?: string },
) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > PLATFORM_JOB_LIMITS.maxWorkerBatch) {
    platformJobError("VALIDATION_ERROR", "The recovery batch is outside the accepted bound.");
  }
  return prisma.$transaction(async (transaction) => {
    const recoveryNow = scope?.operation ? await platformJobDatabaseNow(transaction) : now;
    if (scope?.operation) await assertPlatformJobOperationOwned(transaction, scope.operation, recoveryNow);
    const expired = await transaction.$queryRaw<Array<{
      attemptCount: number;
      id: string;
      leaseToken: string;
      maxAttempts: number;
      startedAt: Date | null;
    }>>(Prisma.sql`
      SELECT job."id", job."attemptCount", job."maxAttempts", job."leaseToken"::text AS "leaseToken", job."startedAt"
      FROM "PlatformJob" AS job
      WHERE job."status" IN ('CLAIMED', 'RUNNING')
        AND job."leaseExpiresAt" <= ${recoveryNow}
        ${scope?.workerId ? Prisma.sql`AND job."leaseOwner" = ${scope.workerId}` : Prisma.empty}
      ORDER BY job."leaseExpiresAt", job."id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `);
    let retryWait = 0;
    let deadLettered = 0;
    for (const job of expired) {
      const delay = platformRetryDelayMs(job.id, job.attemptCount, job.maxAttempts);
      const terminal = delay === null;
      await transaction.platformJob.update({
        where: { id: job.id },
        data: {
          availableAt: terminal ? recoveryNow : safeFutureDate(recoveryNow, delay),
          claimedAt: null,
          failedAt: terminal ? recoveryNow : null,
          heartbeatAt: null,
          lastErrorCode: "LEASE_EXPIRED",
          leaseExpiresAt: null,
          leaseOwner: null,
          leaseToken: null,
          startedAt: terminal ? job.startedAt : null,
          status: terminal ? "DEAD_LETTERED" : "RETRY_WAIT",
          updatedAt: recoveryNow,
          version: { increment: 1 },
        },
      });
      const attempt = await transaction.platformJobAttempt.updateMany({
        where: { jobId: job.id, leaseToken: job.leaseToken, status: { in: ["CLAIMED", "RUNNING"] } },
        data: { errorCode: "LEASE_EXPIRED", finishedAt: recoveryNow, status: "LEASE_EXPIRED", updatedAt: recoveryNow },
      });
      if (attempt.count !== 1) platformJobError("CONFLICT", "Lease recovery could not close the canonical attempt.");
      if (terminal) deadLettered += 1;
      else retryWait += 1;
    }
    return { deadLettered, recovered: expired.length, retryWait };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
