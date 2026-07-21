import "server-only";

import { Prisma } from "@prisma/client";

import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import { PLATFORM_JOB_LIMITS } from "@/features/platform-jobs/domain/contracts";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import { assertPlatformJobAdminCurrent, type PlatformJobAdminContext } from "@/features/platform-jobs/services/admin-context";
import { executePlatformJobHandler } from "@/features/platform-jobs/services/handlers";
import {
  claimPlatformJobs,
  completePlatformJob,
  failPlatformJob,
  recoverExpiredPlatformJobLeases,
  startPlatformJob,
} from "@/features/platform-jobs/services/jobs";
import { runPlatformJobSerializable } from "@/features/platform-jobs/services/transaction";
import { prisma } from "@/lib/db/prisma";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function runPlatformWorkerBatch(
  context: PlatformJobAdminContext,
  input: { batchSize: number; idempotencyKey: string },
) {
  if (!UUID.test(input.idempotencyKey)) platformJobError("VALIDATION_ERROR", "The worker idempotency key is invalid.");
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > PLATFORM_JOB_LIMITS.maxWorkerBatch) {
    platformJobError("VALIDATION_ERROR", "The worker batch is outside the accepted bound.");
  }
  const requestHash = platformJobHash({ action: "WORKER_BATCH", batchSize: input.batchSize });
  const prepared = await runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(transaction, context, "PLATFORM_JOBS_MANAGE");
    const existing = await transaction.platformJobMutation.findUnique({
      where: { actorAdminUserId_idempotencyKey: { actorAdminUserId: current.userId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      if (existing.action !== "WORKER_BATCH" || existing.requestHash !== requestHash) {
        platformJobError("IDEMPOTENCY_CONFLICT", "The worker idempotency key was reused with changed input.");
      }
      const result = safeResult(existing.result);
      if (result.state !== "COMPLETE") platformJobError("CONFLICT", "The original bounded worker operation is still incomplete.");
      return { current, mutationId: existing.id, replay: true as const, result };
    }
    const mutation = await transaction.platformJobMutation.create({
      data: {
        action: "WORKER_BATCH",
        actorAdminUserId: current.userId,
        actorPersonId: current.personId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        result: { state: "PROCESSING" },
      },
    });
    return { current, mutationId: mutation.id, replay: false as const, result: null };
  });
  if (prepared.replay) return { ...prepared.result, replay: true as const };

  const workerId = `admin:${platformJobHash(prepared.current.userId).slice(0, 16)}:${input.idempotencyKey}`;
  const recovery = await recoverExpiredPlatformJobLeases(new Date(), input.batchSize);
  const claimed = await claimPlatformJobs({ batchSize: input.batchSize, workerId });
  const counts = { deadLettered: 0, failed: 0, retryWait: 0, succeeded: 0 };
  for (const job of claimed) {
    try {
      await startPlatformJob({ fencingToken: job.fencingToken, jobId: job.id, leaseToken: job.leaseToken, workerId });
      const outcome = await executePlatformJobHandler({
        fencingToken: job.fencingToken,
        jobId: job.id,
        jobType: job.jobType,
        leaseToken: job.leaseToken,
        payload: job.payload,
        payloadVersion: job.payloadVersion,
      });
      if (outcome.outcome === "SUCCEEDED") {
        await completePlatformJob({
          fencingToken: job.fencingToken,
          jobId: job.id,
          leaseToken: job.leaseToken,
          result: outcome.metadata,
          workerId,
        });
        counts.succeeded += 1;
      } else {
        const failed = await failPlatformJob({
          errorCode: outcome.errorCode,
          fencingToken: job.fencingToken,
          jobId: job.id,
          leaseToken: job.leaseToken,
          retryable: outcome.retryable,
          workerId,
        });
        if (failed.status === "RETRY_WAIT") counts.retryWait += 1;
        else if (failed.status === "DEAD_LETTERED") counts.deadLettered += 1;
        else counts.failed += 1;
      }
    } catch {
      try {
        const failed = await failPlatformJob({
          errorCode: "HANDLER_EXCEPTION",
          fencingToken: job.fencingToken,
          jobId: job.id,
          leaseToken: job.leaseToken,
          retryable: true,
          workerId,
        });
        if (failed.status === "RETRY_WAIT") counts.retryWait += 1;
        else if (failed.status === "DEAD_LETTERED") counts.deadLettered += 1;
        else counts.failed += 1;
      } catch {
        counts.failed += 1;
      }
    }
  }
  const result = {
    ...counts,
    claimed: claimed.length,
    recovered: recovery.recovered,
    state: "COMPLETE",
  } as const;
  await prisma.platformJobMutation.update({
    where: { id: prepared.mutationId },
    data: { result: result as unknown as Prisma.InputJsonObject },
  });
  return { ...result, replay: false as const };
}

function safeResult(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    platformJobError("CONFLICT", "The stored worker mutation result is invalid.");
  }
  return value as Record<string, string | number | boolean | null>;
}
