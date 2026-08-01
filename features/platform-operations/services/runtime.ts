import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { PLATFORM_JOB_LIMITS } from "@/features/platform-jobs/domain/contracts";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import { runAutomaticPlatformSchedulerTick } from "@/features/platform-jobs/services/schedules";
import { runAutomaticPlatformWorkerBatch } from "@/features/platform-jobs/services/worker";
import type { VerifiedGitHubRuntimeIdentity } from "@/features/platform-operations/services/github-oidc";
import { reconcilePlatformOperationAlerts } from "@/features/platform-operations/services/monitor";
import {
  assertPlatformRuntimeAuthorityCurrent,
  assertPlatformRuntimeInvocationOwned,
  type PlatformRuntimeAuthority,
} from "@/features/platform-operations/services/runtime-authority";
import { prisma } from "@/lib/db/prisma";

export const PLATFORM_RUNTIME_CONTROL_ID = "github-actions-runtime";
const INVOCATION_LEASE_SECONDS = 240;
const RUNTIME_WORKER_DRAIN_LIMITS = {
  maxBatches: 3,
  maxDurationMs: 210_000,
  maxJobs: PLATFORM_JOB_LIMITS.maxWorkerBatch * 3,
  minRemainingMs: 15_000,
} as const;
const RUNTIME_SCHEDULER_DRAIN_LIMITS = {
  maxBatches: 3,
  maxSchedules: PLATFORM_JOB_LIMITS.maxSchedulerBatch * 3,
} as const;

type RuntimeMonitorResult =
  | { result: Prisma.InputJsonValue; state: "SUCCEEDED" }
  | { errorCode: string; state: "FAILED" }
  | { state: "NOT_CLAIMED" };

type RuntimeWorkerBatchResult = {
  claimed: number;
  deadLettered: number;
  failed: number;
  monitor: RuntimeMonitorResult;
  recovered: number;
  retryWait: number;
  succeeded: number;
};

type RuntimeSchedulerBatchResult = {
  intervalsSkipped: number;
  jobsCreated: number;
  schedulesProcessed: number;
};

type RuntimeSchedulerDrainResult = RuntimeSchedulerBatchResult & {
  batches: Array<RuntimeSchedulerBatchResult & { batchNumber: number }>;
  batchesRun: number;
  maxBatches: number;
  maxSchedulerBatch: number;
  maxSchedules: number;
  state: "COMPLETE";
  stopReason:
    | "DRAINED"
    | "MAX_BATCHES_REACHED"
    | "MAX_SCHEDULES_REACHED";
};

type RuntimeWorkerDrainResult = RuntimeWorkerBatchResult & {
  batches: Array<RuntimeWorkerBatchResult & { batchNumber: number }>;
  batchesRun: number;
  maxBatches: number;
  maxJobs: number;
  maxWorkerBatch: number;
  remainingAvailable: number;
  state: "COMPLETE";
  stopReason:
    | "DRAINED"
    | "DEADLINE_APPROACHING"
    | "MAX_BATCHES_REACHED"
    | "MAX_JOBS_REACHED";
};

type PlatformRuntimeCycleOptions = {
  deadlineAt?: Date;
  maxWorkerBatches?: number;
  nowMs?: () => number;
};

export class PlatformRuntimeError extends Error {
  constructor(
    readonly code:
      | "NOT_CONFIGURED"
      | "NOT_ENABLED"
      | "RUNTIME_BUSY"
      | "TOKEN_REPLAY"
      | "RUNTIME_FAILED",
    readonly status: 409 | 503,
  ) {
    super("The automatic platform runtime could not execute.");
    this.name = "PlatformRuntimeError";
  }
}

export async function runPlatformRuntimeCycle(
  identity: VerifiedGitHubRuntimeIdentity,
  options: PlatformRuntimeCycleOptions = {},
) {
  const authority = await acquireRuntimeInvocation(identity);
  try {
    const scheduler = await drainRuntimeSchedulerBatches(authority);
    const worker = await drainRuntimeWorkerBatches(authority, options);
    const result = await completeRuntimeInvocation(
      authority,
      scheduler,
      worker,
    );
    return result;
  } catch (error) {
    await failRuntimeInvocation(authority);
    throw error;
  }
}

async function drainRuntimeSchedulerBatches(
  authority: PlatformRuntimeAuthority,
): Promise<RuntimeSchedulerDrainResult> {
  const aggregate = emptyRuntimeSchedulerDrain();
  while (
    aggregate.batchesRun < RUNTIME_SCHEDULER_DRAIN_LIMITS.maxBatches
    && aggregate.schedulesProcessed < RUNTIME_SCHEDULER_DRAIN_LIMITS.maxSchedules
  ) {
    const batchNumber = aggregate.batchesRun + 1;
    const batch = await runAutomaticPlatformSchedulerTick(
      authority,
      PLATFORM_JOB_LIMITS.maxSchedulerBatch,
    );
    aggregateSchedulerBatch(aggregate, batch, batchNumber);

    if (batch.schedulesProcessed < PLATFORM_JOB_LIMITS.maxSchedulerBatch) {
      aggregate.stopReason = "DRAINED";
      break;
    }
    if (aggregate.schedulesProcessed >= RUNTIME_SCHEDULER_DRAIN_LIMITS.maxSchedules) {
      aggregate.stopReason = "MAX_SCHEDULES_REACHED";
      break;
    }
  }
  if (!aggregate.stopReason) {
    aggregate.stopReason = "MAX_BATCHES_REACHED";
  }
  await recordRuntimeSchedulerDrain(authority, aggregate);
  return aggregate;
}

function emptyRuntimeSchedulerDrain(): RuntimeSchedulerDrainResult {
  return {
    batches: [],
    batchesRun: 0,
    intervalsSkipped: 0,
    jobsCreated: 0,
    maxBatches: RUNTIME_SCHEDULER_DRAIN_LIMITS.maxBatches,
    maxSchedulerBatch: PLATFORM_JOB_LIMITS.maxSchedulerBatch,
    maxSchedules: RUNTIME_SCHEDULER_DRAIN_LIMITS.maxSchedules,
    schedulesProcessed: 0,
    state: "COMPLETE",
    stopReason: "DRAINED",
  };
}

function aggregateSchedulerBatch(
  aggregate: RuntimeSchedulerDrainResult,
  batch: RuntimeSchedulerBatchResult,
  batchNumber: number,
) {
  aggregate.batches.push({ ...batch, batchNumber });
  aggregate.batchesRun += 1;
  aggregate.intervalsSkipped += batch.intervalsSkipped;
  aggregate.jobsCreated += batch.jobsCreated;
  aggregate.schedulesProcessed += batch.schedulesProcessed;
}

async function recordRuntimeSchedulerDrain(
  authority: PlatformRuntimeAuthority,
  result: RuntimeSchedulerDrainResult,
) {
  await prisma.$transaction(async (transaction) => {
    await assertPlatformRuntimeInvocationOwned(transaction, authority);
    const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT clock_timestamp() AS now`,
    );
    if (!clock?.now) {
      platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
    }
    const updated = await transaction.platformRuntimeInvocation.updateMany({
      where: {
        controlGeneration: authority.controlGeneration,
        fencingToken: authority.fencingToken,
        id: authority.invocationId,
        leaseToken: authority.leaseToken,
        state: "RUNNING",
        workerId: authority.workerId,
      },
      data: {
        schedulerCompletedAt: clock.now,
        schedulerResult: result,
      },
    });
    if (updated.count !== 1) {
      platformJobError(
        "STALE_LEASE",
        "The automatic scheduler lost its runtime fence.",
      );
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function drainRuntimeWorkerBatches(
  authority: PlatformRuntimeAuthority,
  options: PlatformRuntimeCycleOptions,
): Promise<RuntimeWorkerDrainResult> {
  const maxBatches = runtimeWorkerBatchLimit(options.maxWorkerBatches);
  const maxJobs = Math.min(
    RUNTIME_WORKER_DRAIN_LIMITS.maxJobs,
    maxBatches * PLATFORM_JOB_LIMITS.maxWorkerBatch,
  );
  const nowMs = options.nowMs ?? Date.now;
  const deadlineAtMs = runtimeWorkerDeadline(nowMs(), options.deadlineAt);
  const aggregate = emptyRuntimeWorkerDrain(maxBatches, maxJobs);
  while (
    aggregate.batchesRun < maxBatches
    && aggregate.claimed < maxJobs
  ) {
    if (runtimeDeadlineApproaching(nowMs(), deadlineAtMs)) {
      aggregate.stopReason = "DEADLINE_APPROACHING";
      break;
    }
    const batchNumber = aggregate.batchesRun + 1;
    const batch = await runAutomaticPlatformWorkerBatch(
      authority,
      PLATFORM_JOB_LIMITS.maxWorkerBatch,
    );
    aggregateBatch(aggregate, batch, batchNumber);

    if (batch.claimed < PLATFORM_JOB_LIMITS.maxWorkerBatch) {
      aggregate.stopReason = "DRAINED";
      break;
    }
    if (aggregate.claimed >= maxJobs) {
      aggregate.stopReason = "MAX_JOBS_REACHED";
      break;
    }
    if (runtimeDeadlineApproaching(nowMs(), deadlineAtMs)) {
      aggregate.stopReason = "DEADLINE_APPROACHING";
      break;
    }
    const remaining = await countAvailableRuntimeJobs(authority);
    if (remaining === 0) {
      aggregate.stopReason = "DRAINED";
      break;
    }
  }
  if (!aggregate.stopReason) {
    aggregate.stopReason = "MAX_BATCHES_REACHED";
  }
  aggregate.remainingAvailable = await countAvailableRuntimeJobs(authority);
  if (aggregate.claimed > 0) {
    aggregate.monitor = await reconcileRuntimeMonitor(authority);
  }
  return aggregate;
}

function runtimeWorkerBatchLimit(value: number | undefined) {
  const maxBatches = value ?? RUNTIME_WORKER_DRAIN_LIMITS.maxBatches;
  if (
    !Number.isInteger(maxBatches)
    || maxBatches < 1
    || maxBatches > RUNTIME_WORKER_DRAIN_LIMITS.maxBatches
  ) {
    platformJobError(
      "VALIDATION_ERROR",
      "The runtime worker drain batch count is outside the accepted bound.",
    );
  }
  return maxBatches;
}

function runtimeWorkerDeadline(nowMs: number, deadlineAt: Date | undefined) {
  const defaultDeadlineAt = nowMs + RUNTIME_WORKER_DRAIN_LIMITS.maxDurationMs;
  if (!deadlineAt) return defaultDeadlineAt;
  const requested = deadlineAt.getTime();
  if (!Number.isFinite(requested)) {
    platformJobError(
      "VALIDATION_ERROR",
      "The runtime worker drain deadline is invalid.",
    );
  }
  return Math.min(defaultDeadlineAt, requested);
}

function runtimeDeadlineApproaching(nowMs: number, deadlineAtMs: number) {
  return nowMs + RUNTIME_WORKER_DRAIN_LIMITS.minRemainingMs >= deadlineAtMs;
}

function emptyRuntimeWorkerDrain(
  maxBatches: number,
  maxJobs: number,
): RuntimeWorkerDrainResult {
  return {
    batches: [],
    batchesRun: 0,
    claimed: 0,
    deadLettered: 0,
    failed: 0,
    maxBatches,
    maxJobs,
    maxWorkerBatch: PLATFORM_JOB_LIMITS.maxWorkerBatch,
    monitor: { state: "NOT_CLAIMED" },
    recovered: 0,
    remainingAvailable: 0,
    retryWait: 0,
    state: "COMPLETE",
    stopReason: "DRAINED",
    succeeded: 0,
  };
}

function aggregateBatch(
  aggregate: RuntimeWorkerDrainResult,
  batch: RuntimeWorkerBatchResult,
  batchNumber: number,
) {
  aggregate.batches.push({ ...batch, batchNumber });
  aggregate.batchesRun += 1;
  aggregate.claimed += batch.claimed;
  aggregate.deadLettered += batch.deadLettered;
  aggregate.failed += batch.failed;
  aggregate.recovered += batch.recovered;
  aggregate.retryWait += batch.retryWait;
  aggregate.succeeded += batch.succeeded;
  if (batch.monitor.state !== "NOT_CLAIMED") {
    aggregate.monitor = batch.monitor;
  }
}

async function countAvailableRuntimeJobs(
  authority: PlatformRuntimeAuthority,
) {
  return prisma.$transaction(async (transaction) => {
    await assertPlatformRuntimeInvocationOwned(transaction, authority);
    const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT clock_timestamp() AS now`,
    );
    if (!clock?.now) {
      platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
    }
    const [row] = await transaction.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`
        SELECT COUNT(*)::int AS "count"
        FROM "PlatformJob" AS job
        WHERE job."status" IN ('SCHEDULED', 'AVAILABLE', 'RETRY_WAIT')
          AND job."availableAt" <= ${clock.now}
          AND job."attemptCount" < job."maxAttempts"
      `,
    );
    return row?.count ?? 0;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function reconcileRuntimeMonitor(
  authority: PlatformRuntimeAuthority,
): Promise<RuntimeMonitorResult> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const monitorAuthority: PlatformRuntimeAuthority = {
        ...authority,
        jobType: "PLATFORM_OPERATIONS_MONITOR",
      };
      const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
        Prisma.sql`SELECT clock_timestamp() AS now`,
      );
      if (!clock?.now) {
        platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
      }
      const actor = await assertPlatformRuntimeAuthorityCurrent(
        transaction,
        monitorAuthority,
        "PLATFORM_OPERATIONS_MANAGE",
      );
      const result = await reconcilePlatformOperationAlerts(
        transaction,
        actor,
        clock.now,
      );
      return {
        result: {
          ...result,
          kind: "PLATFORM_OPERATIONS_OBSERVED",
        },
        state: "SUCCEEDED" as const,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch {
    return { errorCode: "TRANSIENT_FAILURE", state: "FAILED" };
  }
}

async function acquireRuntimeInvocation(
  identity: VerifiedGitHubRuntimeIdentity,
): Promise<PlatformRuntimeAuthority> {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(Prisma.sql`
      SELECT CAST(
        pg_advisory_xact_lock(
          hashtextextended(${`platform-runtime:${PLATFORM_RUNTIME_CONTROL_ID}`}, 0)
        )
        AS text
      ) AS locked
    `);
    const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT clock_timestamp() AS now`,
    );
    if (!clock?.now) {
      platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
    }
    const control = await transaction.platformRuntimeControl.findUnique({
      where: { id: PLATFORM_RUNTIME_CONTROL_ID },
    });
    if (!control) throw new PlatformRuntimeError("NOT_CONFIGURED", 503);
    if (
      control.state !== "ENABLED"
      || control.provider !== "GITHUB_ACTIONS_SCHEDULED_HTTP"
    ) {
      throw new PlatformRuntimeError("NOT_ENABLED", 503);
    }
    const replay = await transaction.platformRuntimeInvocation.findUnique({
      where: { tokenJtiHash: identity.tokenJtiHash },
      select: { id: true },
    });
    if (replay) throw new PlatformRuntimeError("TOKEN_REPLAY", 409);

    await transaction.platformRuntimeInvocation.updateMany({
      where: {
        controlId: control.id,
        leaseExpiresAt: { lte: clock.now },
        state: "RUNNING",
      },
      data: {
        completedAt: clock.now,
        leaseExpiresAt: null,
        leaseToken: null,
        safeErrorCode: "LEASE_EXPIRED",
        state: "ABANDONED",
      },
    });
    const active = await transaction.platformRuntimeInvocation.findFirst({
      where: {
        controlId: control.id,
        leaseExpiresAt: { gt: clock.now },
        state: "RUNNING",
      },
      select: { id: true },
    });
    if (active) throw new PlatformRuntimeError("RUNTIME_BUSY", 409);

    const invocationId = randomUUID();
    const leaseToken = randomUUID();
    const workerId = `runtime:${invocationId}`;
    const fencingToken = BigInt(1);
    await transaction.platformRuntimeInvocation.create({
      data: {
        controlGeneration: control.generation,
        controlId: control.id,
        eventName: identity.eventName,
        fencingToken,
        gitRefHash: identity.gitRefHash,
        id: invocationId,
        leaseExpiresAt: new Date(
          clock.now.getTime() + INVOCATION_LEASE_SECONDS * 1_000,
        ),
        leaseToken,
        provider: "GITHUB_ACTIONS_SCHEDULED_HTTP",
        repositorySha: identity.repositorySha,
        requestedAt: identity.requestedAt,
        tokenJtiHash: identity.tokenJtiHash,
        workerId,
        workflowRefHash: identity.workflowRefHash,
      },
    });
    const updated = await transaction.platformRuntimeControl.updateMany({
      where: {
        generation: control.generation,
        id: control.id,
        state: "ENABLED",
      },
      data: {
        lastInvocationAt: clock.now,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      platformJobError(
        "STALE_LEASE",
        "The runtime control changed during invocation acquisition.",
      );
    }
    return {
      controlGeneration: control.generation,
      fencingToken,
      invocationId,
      jobType: "PLATFORM_HEALTH_PROBE",
      kind: "RUNTIME_INVOCATION",
      leaseToken,
      workerId,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function completeRuntimeInvocation(
  authority: PlatformRuntimeAuthority,
  scheduler: RuntimeSchedulerDrainResult,
  worker: RuntimeWorkerDrainResult,
) {
  return prisma.$transaction(async (transaction) => {
    await assertPlatformRuntimeInvocationOwned(transaction, authority);
    const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT clock_timestamp() AS now`,
    );
    if (!clock?.now) {
      platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
    }
    const completed = await transaction.platformRuntimeInvocation.updateMany({
      where: {
        controlGeneration: authority.controlGeneration,
        fencingToken: authority.fencingToken,
        id: authority.invocationId,
        leaseExpiresAt: { gt: clock.now },
        leaseToken: authority.leaseToken,
        state: "RUNNING",
        workerId: authority.workerId,
      },
      data: {
        completedAt: clock.now,
        leaseExpiresAt: null,
        leaseToken: null,
        monitorCompletedAt: clock.now,
        monitorResult: worker.monitor,
        state: "SUCCEEDED",
        workerCompletedAt: clock.now,
        workerResult: worker,
      },
    });
    if (completed.count !== 1) {
      platformJobError(
        "STALE_LEASE",
        "The runtime invocation lost its completion fence.",
      );
    }
    const control = await transaction.platformRuntimeControl.updateMany({
      where: {
        generation: authority.controlGeneration,
        id: PLATFORM_RUNTIME_CONTROL_ID,
        state: "ENABLED",
      },
      data: {
        lastSucceededAt: clock.now,
        version: { increment: 1 },
      },
    });
    if (control.count !== 1) {
      platformJobError(
        "STALE_LEASE",
        "The runtime control changed before successful completion.",
      );
    }
    return {
      invocationId: authority.invocationId,
      monitor: worker.monitor,
      scheduler,
      state: "SUCCEEDED" as const,
      worker,
    };
  });
}

async function failRuntimeInvocation(authority: PlatformRuntimeAuthority) {
  try {
    await prisma.$transaction(async (transaction) => {
      const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
        Prisma.sql`SELECT clock_timestamp() AS now`,
      );
      if (!clock?.now) return;
      await transaction.platformRuntimeInvocation.updateMany({
        where: {
          controlGeneration: authority.controlGeneration,
          fencingToken: authority.fencingToken,
          id: authority.invocationId,
          leaseExpiresAt: { gt: clock.now },
          leaseToken: authority.leaseToken,
          state: "RUNNING",
          workerId: authority.workerId,
        },
        data: {
          completedAt: clock.now,
          leaseExpiresAt: null,
          leaseToken: null,
          safeErrorCode: "RUNTIME_PHASE_FAILED",
          state: "FAILED",
        },
      });
    });
  } catch {
    // The next valid invocation abandons an expired row using its exact fence.
  }
}
