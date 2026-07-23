import "server-only";

import { randomUUID } from "node:crypto";

import { PlatformJobAttemptStatus, Prisma } from "@prisma/client";

import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import { PLATFORM_JOB_LIMITS } from "@/features/platform-jobs/domain/contracts";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import { assertPlatformJobAdminCurrent, type PlatformJobAdminContext } from "@/features/platform-jobs/services/admin-context";
import { executePlatformJobHandler } from "@/features/platform-jobs/services/handlers";
import {
  claimPlatformJobsInTransaction,
  completePlatformJob,
  failPlatformJob,
  recoverExpiredPlatformJobLeases,
  startPlatformJob,
  type ClaimedPlatformJob,
} from "@/features/platform-jobs/services/jobs";
import {
  assertPlatformJobOperationOwned,
  platformJobDatabaseNow,
  type PlatformJobOperationAuthority,
} from "@/features/platform-jobs/services/operation-lease";
import { runPlatformJobSerializable } from "@/features/platform-jobs/services/transaction";
import { prisma } from "@/lib/db/prisma";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_ATTEMPTS = new Set<PlatformJobAttemptStatus>(["CLAIMED", "RUNNING"]);

type WorkerCompleteResult = {
  claimed: number;
  deadLettered: number;
  failed: number;
  recovered: number;
  retryWait: number;
  state: "COMPLETE";
  succeeded: number;
};

type WorkerTestEvent = {
  claimedJobs: number;
  completedJobs: number;
  mutationId: string;
  phase:
    | "AFTER_OPERATION_ACQUIRED_BEFORE_CLAIM"
    | "AFTER_JOB_CLAIM_BEFORE_HANDLER"
    | "AFTER_JOB_OUTCOME"
    | "BEFORE_OPERATION_FINALIZATION";
};

type WorkerTestHook = (event: WorkerTestEvent) => Promise<void> | void;
let workerTestHook: WorkerTestHook | undefined;

export function setPlatformWorkerTestHook(hook: WorkerTestHook | undefined) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Platform worker test hooks are unavailable in production.");
  }
  workerTestHook = hook;
}

export async function runPlatformWorkerBatch(
  context: PlatformJobAdminContext,
  input: { batchSize: number; idempotencyKey: string },
) {
  assertWorkerInput(input);
  const requestHash = platformJobHash({ action: "WORKER_BATCH", batchSize: input.batchSize });
  const prepared = await acquireWorkerOperation(context, input, requestHash);
  if (prepared.kind === "COMPLETE") return { ...prepared.result, replay: true as const };
  if (prepared.kind === "PROCESSING") {
    return { replay: true as const, retryAfterSeconds: prepared.retryAfterSeconds, state: "PROCESSING" as const };
  }

  await workerTestHook?.({
    claimedJobs: 0,
    completedJobs: 0,
    mutationId: prepared.authority.mutationId,
    phase: "AFTER_OPERATION_ACQUIRED_BEFORE_CLAIM",
  });

  let attempts = await operationAttempts(prepared.authority.workerId);
  assertOperationAttemptBound(attempts.length, prepared.batchSize);
  let claimed: ClaimedPlatformJob[] = [];
  if (attempts.length === 0) {
    claimed = await prisma.$transaction(async (transaction) => {
      const now = await platformJobDatabaseNow(transaction);
      return claimPlatformJobsInTransaction(transaction, {
        batchSize: prepared.batchSize,
        now,
        operation: prepared.authority,
        workerId: prepared.authority.workerId,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    await workerTestHook?.({
      claimedJobs: claimed.length,
      completedJobs: 0,
      mutationId: prepared.authority.mutationId,
      phase: "AFTER_JOB_CLAIM_BEFORE_HANDLER",
    });
  } else {
    const active = attempts.filter((attempt) => ACTIVE_ATTEMPTS.has(attempt.status));
    const recoveryNow = await prisma.$transaction(
      (transaction) => platformJobDatabaseNow(transaction),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    if (active.some((attempt) => attempt.job.leaseExpiresAt && attempt.job.leaseExpiresAt > recoveryNow)) {
      return { replay: true as const, retryAfterSeconds: PLATFORM_JOB_LIMITS.workerOperationLeaseSeconds, state: "PROCESSING" as const };
    }
    if (active.length > 0) {
      await recoverExpiredPlatformJobLeases(recoveryNow, prepared.batchSize, {
        operation: prepared.authority,
        workerId: prepared.authority.workerId,
      });
      attempts = await operationAttempts(prepared.authority.workerId);
      assertOperationAttemptBound(attempts.length, prepared.batchSize);
    }
    if (attempts.some((attempt) => ACTIVE_ATTEMPTS.has(attempt.status))) {
      return { replay: true as const, retryAfterSeconds: PLATFORM_JOB_LIMITS.workerOperationLeaseSeconds, state: "PROCESSING" as const };
    }
  }

  let completedJobs = 0;
  for (const job of claimed) {
    await startPlatformJob({
      fencingToken: job.fencingToken,
      jobId: job.id,
      leaseToken: job.leaseToken,
      operation: prepared.authority,
      workerId: prepared.authority.workerId,
    });
    const outcome = await executePlatformJobHandler({
      fencingToken: job.fencingToken,
      jobId: job.id,
      jobType: job.jobType,
      leaseToken: job.leaseToken,
      operation: prepared.authority,
      payload: job.payload,
      payloadVersion: job.payloadVersion,
    });
    if (outcome.outcome === "SUCCEEDED") {
      await completePlatformJob({
        fencingToken: job.fencingToken,
        jobId: job.id,
        leaseToken: job.leaseToken,
        operation: prepared.authority,
        result: outcome.metadata,
        workerId: prepared.authority.workerId,
      });
    } else {
      await failPlatformJob({
        errorCode: outcome.errorCode,
        fencingToken: job.fencingToken,
        jobId: job.id,
        leaseToken: job.leaseToken,
        operation: prepared.authority,
        retryable: outcome.retryable,
        workerId: prepared.authority.workerId,
      });
    }
    completedJobs += 1;
    await workerTestHook?.({
      claimedJobs: claimed.length,
      completedJobs,
      mutationId: prepared.authority.mutationId,
      phase: "AFTER_JOB_OUTCOME",
    });
  }

  await workerTestHook?.({
    claimedJobs: claimed.length,
    completedJobs,
    mutationId: prepared.authority.mutationId,
    phase: "BEFORE_OPERATION_FINALIZATION",
  });
  const result = await finalizeWorkerOperation(context, prepared.authority);
  return { ...result, replay: prepared.replay };
}

async function acquireWorkerOperation(
  context: PlatformJobAdminContext,
  input: { batchSize: number; idempotencyKey: string },
  requestHash: string,
) {
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(transaction, context, "PLATFORM_JOBS_MANAGE");
    await transaction.$queryRaw(
      Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtextextended(${`platform-worker:${current.userId}:${input.idempotencyKey}`}, 0)) AS text) AS locked`,
    );
    const now = await platformJobDatabaseNow(transaction);
    const existing = await transaction.platformJobMutation.findUnique({
      where: { actorAdminUserId_idempotencyKey: { actorAdminUserId: current.userId, idempotencyKey: input.idempotencyKey } },
    });
    if (!existing) {
      const leaseToken = randomUUID();
      const fencingToken = BigInt(1);
      const workerId = workerOperationIdentity(current.userId, input.idempotencyKey, requestHash);
      const leaseExpiresAt = operationLeaseExpiry(now);
      const mutation = await transaction.platformJobMutation.create({
        data: {
          action: "WORKER_BATCH",
          actorAdminUserId: current.userId,
          actorPersonId: current.personId,
          idempotencyKey: input.idempotencyKey,
          operationBatchSize: input.batchSize,
          operationFencingToken: fencingToken,
          operationLeaseExpiresAt: leaseExpiresAt,
          operationLeaseToken: leaseToken,
          operationWorkerId: workerId,
          requestHash,
          result: { state: "PROCESSING" },
        },
      });
      return {
        authority: { fencingToken, leaseToken, mutationId: mutation.id, workerId },
        batchSize: input.batchSize,
        kind: "OWNED" as const,
        replay: false as const,
      };
    }
    if (existing.action !== "WORKER_BATCH" || existing.requestHash !== requestHash) {
      platformJobError("IDEMPOTENCY_CONFLICT", "The worker idempotency key was reused with changed input.");
    }
    const result = safeStoredResult(existing.result);
    if (existing.operationCompletedAt) {
      if (result.state !== "COMPLETE") platformJobError("CONFLICT", "The terminal worker operation result is invalid.");
      return { kind: "COMPLETE" as const, result };
    }
    const operation = operationFields(existing);
    const statuses = await transaction.platformJobAttempt.findMany({
      where: { workerId: operation.workerId },
      select: { status: true },
      take: PLATFORM_JOB_LIMITS.maxWorkerBatch,
    });
    const canonicalTerminal = statuses.length > 0 && statuses.every((attempt) => !ACTIVE_ATTEMPTS.has(attempt.status));
    if (operation.leaseExpiresAt > now && !canonicalTerminal) {
      return {
        kind: "PROCESSING" as const,
        retryAfterSeconds: boundedRetrySeconds(now, operation.leaseExpiresAt),
      };
    }
    const leaseToken = randomUUID();
    const fencingToken = operation.fencingToken + BigInt(1);
    const leaseExpiresAt = operationLeaseExpiry(now);
    const reclaimed = await transaction.platformJobMutation.updateMany({
      where: {
        id: existing.id,
        operationCompletedAt: null,
        operationFencingToken: operation.fencingToken,
        operationLeaseToken: operation.leaseToken,
      },
      data: {
        operationFencingToken: fencingToken,
        operationLeaseExpiresAt: leaseExpiresAt,
        operationLeaseToken: leaseToken,
      },
    });
    if (reclaimed.count !== 1) platformJobError("STALE_LEASE", "The worker operation ownership changed.");
    return {
      authority: { fencingToken, leaseToken, mutationId: existing.id, workerId: operation.workerId },
      batchSize: operation.batchSize,
      kind: "OWNED" as const,
      replay: true as const,
    };
  });
}

async function finalizeWorkerOperation(
  context: PlatformJobAdminContext,
  authority: PlatformJobOperationAuthority,
) {
  return runPlatformJobSerializable(async (transaction) => {
    await assertPlatformJobAdminCurrent(transaction, context, "PLATFORM_JOBS_MANAGE");
    const now = await platformJobDatabaseNow(transaction);
    await assertPlatformJobOperationOwned(transaction, authority, now);
    const mutation = await transaction.platformJobMutation.findUniqueOrThrow({
      where: { id: authority.mutationId },
      select: { operationBatchSize: true },
    });
    if (!mutation.operationBatchSize) platformJobError("CONFLICT", "The worker operation batch bound is unavailable.");
    const attempts = await transaction.platformJobAttempt.findMany({
      where: { workerId: authority.workerId },
      include: { job: { select: { status: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: PLATFORM_JOB_LIMITS.maxWorkerBatch + 1,
    });
    assertOperationAttemptBound(attempts.length, mutation.operationBatchSize);
    if (attempts.some((attempt) => ACTIVE_ATTEMPTS.has(attempt.status))) {
      platformJobError("CONFLICT", "The worker operation still has active canonical attempts.");
    }
    const result = summarizeAttempts(attempts);
    const completed = await transaction.platformJobMutation.updateMany({
      where: {
        id: authority.mutationId,
        operationCompletedAt: null,
        operationFencingToken: authority.fencingToken,
        operationLeaseExpiresAt: { gt: now },
        operationLeaseToken: authority.leaseToken,
        operationWorkerId: authority.workerId,
      },
      data: {
        operationCompletedAt: now,
        operationLeaseExpiresAt: null,
        operationLeaseToken: null,
        result: result as Prisma.InputJsonObject,
      },
    });
    if (completed.count !== 1) platformJobError("STALE_LEASE", "The worker operation could not be finalized by a stale owner.");
    return result;
  });
}

async function operationAttempts(workerId: string) {
  return prisma.platformJobAttempt.findMany({
    where: { workerId },
    include: { job: { select: { leaseExpiresAt: true, status: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: PLATFORM_JOB_LIMITS.maxWorkerBatch + 1,
  });
}

function summarizeAttempts(
  attempts: Array<{ job: { status: string }; status: PlatformJobAttemptStatus }>,
): WorkerCompleteResult {
  const counts = { deadLettered: 0, failed: 0, recovered: 0, retryWait: 0, succeeded: 0 };
  for (const attempt of attempts) {
    if (attempt.status === "SUCCEEDED") counts.succeeded += 1;
    else if (attempt.status === "DEAD_LETTERED" || attempt.job.status === "DEAD_LETTERED") counts.deadLettered += 1;
    else if (attempt.status === "RETRY_SCHEDULED" || attempt.job.status === "RETRY_WAIT") counts.retryWait += 1;
    else if (attempt.status === "FAILED" || attempt.job.status === "FAILED") counts.failed += 1;
    if (attempt.status === "LEASE_EXPIRED") counts.recovered += 1;
  }
  return { ...counts, claimed: attempts.length, state: "COMPLETE" };
}

function operationFields(existing: {
  operationBatchSize: number | null;
  operationFencingToken: bigint | null;
  operationLeaseExpiresAt: Date | null;
  operationLeaseToken: string | null;
  operationWorkerId: string | null;
}) {
  if (
    !existing.operationBatchSize
    || existing.operationBatchSize > PLATFORM_JOB_LIMITS.maxWorkerBatch
    || !existing.operationFencingToken
    || !existing.operationLeaseExpiresAt
    || !existing.operationLeaseToken
    || !existing.operationWorkerId
  ) platformJobError("CONFLICT", "The stored worker operation lease is invalid.");
  return {
    batchSize: existing.operationBatchSize,
    fencingToken: existing.operationFencingToken,
    leaseExpiresAt: existing.operationLeaseExpiresAt,
    leaseToken: existing.operationLeaseToken,
    workerId: existing.operationWorkerId,
  };
}

function safeStoredResult(value: Prisma.JsonValue): WorkerCompleteResult | { state: "PROCESSING" } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    platformJobError("CONFLICT", "The stored worker mutation result is invalid.");
  }
  const result = value as Record<string, unknown>;
  if (result.state === "PROCESSING" && Object.keys(result).length === 1) return { state: "PROCESSING" };
  const keys = ["claimed", "deadLettered", "failed", "recovered", "retryWait", "state", "succeeded"];
  if (
    result.state !== "COMPLETE"
    || Object.keys(result).sort().join(",") !== keys.sort().join(",")
    || keys.filter((key) => key !== "state").some((key) => !boundedCount(result[key]))
  ) platformJobError("CONFLICT", "The stored worker completion result is invalid.");
  return result as WorkerCompleteResult;
}

function workerOperationIdentity(actorAdminUserId: string, idempotencyKey: string, requestHash: string) {
  return `operation:${platformJobHash({ actorAdminUserId, idempotencyKey, requestHash })}`;
}

function operationLeaseExpiry(now: Date) {
  return new Date(now.getTime() + PLATFORM_JOB_LIMITS.workerOperationLeaseSeconds * 1_000);
}

function boundedRetrySeconds(now: Date, leaseExpiresAt: Date) {
  return Math.max(1, Math.min(
    PLATFORM_JOB_LIMITS.workerOperationLeaseSeconds,
    Math.ceil((leaseExpiresAt.getTime() - now.getTime()) / 1_000),
  ));
}

function boundedCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= PLATFORM_JOB_LIMITS.maxWorkerBatch;
}

function assertOperationAttemptBound(attempts: number, batchSize: number) {
  if (attempts > batchSize) {
    platformJobError("CONFLICT", "The worker operation canonical attempts exceed its original batch bound.");
  }
}

function assertWorkerInput(input: { batchSize: number; idempotencyKey: string }) {
  if (!UUID.test(input.idempotencyKey)) platformJobError("VALIDATION_ERROR", "The worker idempotency key is invalid.");
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > PLATFORM_JOB_LIMITS.maxWorkerBatch) {
    platformJobError("VALIDATION_ERROR", "The worker batch is outside the accepted bound.");
  }
}
