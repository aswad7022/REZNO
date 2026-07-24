import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { platformJobError } from "@/features/platform-jobs/domain/errors";
import { runAutomaticPlatformSchedulerTick } from "@/features/platform-jobs/services/schedules";
import { runAutomaticPlatformWorkerBatch } from "@/features/platform-jobs/services/worker";
import type { VerifiedGitHubRuntimeIdentity } from "@/features/platform-operations/services/github-oidc";
import {
  assertPlatformRuntimeInvocationOwned,
  type PlatformRuntimeAuthority,
} from "@/features/platform-operations/services/runtime-authority";
import { prisma } from "@/lib/db/prisma";

export const PLATFORM_RUNTIME_CONTROL_ID = "github-actions-runtime";
const INVOCATION_LEASE_SECONDS = 240;

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
) {
  const authority = await acquireRuntimeInvocation(identity);
  try {
    const scheduler = await runAutomaticPlatformSchedulerTick(authority);
    const worker = await runAutomaticPlatformWorkerBatch(authority);
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
  scheduler: {
    intervalsSkipped: number;
    jobsCreated: number;
    schedulesProcessed: number;
  },
  worker: {
    claimed: number;
    deadLettered: number;
    failed: number;
    monitor:
      | { result: Prisma.InputJsonValue; state: "SUCCEEDED" }
      | { errorCode: string; state: "FAILED" }
      | { state: "NOT_CLAIMED" };
    recovered: number;
    retryWait: number;
    succeeded: number;
  },
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
        state: "SUCCEEDED",
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
