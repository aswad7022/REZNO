import "server-only";

import { Prisma } from "@prisma/client";

import { expirePendingOrdersBatch } from "@/features/commerce/services/expiration-service";
import { requiredPlatformJobPermissions } from "@/features/platform-jobs/domain/authority";
import { PlatformJobDomainError, platformJobError } from "@/features/platform-jobs/domain/errors";
import type {
  PlatformJobHandlerContext,
  PlatformJobHandlerResult,
} from "@/features/platform-jobs/services/handlers";
import { assertPlatformJobOperationAuthorized } from "@/features/platform-jobs/services/operation-lease";
import { reconcilePlatformOperationAlerts } from "@/features/platform-operations/services/monitor";
import { prisma } from "@/lib/db/prisma";

type Gate6DJobType =
  | "COMMERCE_ORDER_EXPIRY"
  | "PLATFORM_OPERATIONS_MONITOR"
  | "DISTRIBUTED_RATE_LIMIT_CLEANUP";

export async function runPlatformOperationsHandler(
  jobType: Gate6DJobType,
  payload: unknown,
  context: PlatformJobHandlerContext,
): Promise<PlatformJobHandlerResult> {
  try {
    switch (jobType) {
      case "COMMERCE_ORDER_EXPIRY":
        return success(
          await expireCommerceOrders(
            payload as { batchSize: number },
            context,
          ),
        );
      case "PLATFORM_OPERATIONS_MONITOR":
        return success(await monitorPlatformOperations(context));
      case "DISTRIBUTED_RATE_LIMIT_CLEANUP":
        return success(
          await cleanupRateLimitBuckets(
            payload as { batchSize: number },
            context,
          ),
        );
    }
  } catch (error) {
    if (error instanceof PlatformJobDomainError) {
      return {
        errorCode:
          error.code === "LEASE_EXPIRED" || error.code === "STALE_LEASE"
            ? "LEASE_EXPIRED"
            : "PERMANENT_FAILURE",
        outcome: "FAILED",
        retryable: false,
      };
    }
    return {
      errorCode: "TRANSIENT_FAILURE",
      outcome: "FAILED",
      retryable: true,
    };
  }
}

async function expireCommerceOrders(
  payload: { batchSize: number },
  context: PlatformJobHandlerContext,
) {
  const now = await prisma.$transaction(async (transaction) => {
    const current = await assertJobLease(transaction, context);
    return current.now;
  });
  const result = await expirePendingOrdersBatch({
    batchSize: payload.batchSize,
    executionGuard: async (transaction) => {
      await assertJobLease(transaction, context);
    },
    now,
  });
  return {
    expired: result.expired,
    kind: "COMMERCE_PENDING_ORDERS_EXPIRED" as const,
    scanned: result.scanned,
    skipped: result.scanned - result.expired,
  };
}

async function monitorPlatformOperations(
  context: PlatformJobHandlerContext,
) {
  return prisma.$transaction(async (transaction) => {
    const { actor, now } = await assertJobLease(transaction, context);
    const result = await reconcilePlatformOperationAlerts(
      transaction,
      actor,
      now,
    );
    return {
      ...result,
      kind: "PLATFORM_OPERATIONS_OBSERVED" as const,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function cleanupRateLimitBuckets(
  payload: { batchSize: number },
  context: PlatformJobHandlerContext,
) {
  return prisma.$transaction(async (transaction) => {
    const { now } = await assertJobLease(transaction, context);
    const buckets = await transaction.$queryRaw<Array<{ keyHash: string }>>(
      Prisma.sql`
        SELECT bucket."keyHash"
        FROM "DistributedRateLimitBucket" AS bucket
        WHERE bucket."expiresAt" <= ${now}
        ORDER BY bucket."expiresAt", bucket."keyHash"
        FOR UPDATE SKIP LOCKED
        LIMIT ${payload.batchSize}
      `,
    );
    if (buckets.length > 0) {
      await assertJobLease(transaction, context);
      await transaction.distributedRateLimitBucket.deleteMany({
        where: { keyHash: { in: buckets.map((bucket) => bucket.keyHash) } },
      });
    }
    return {
      deleted: buckets.length,
      kind: "DISTRIBUTED_RATE_LIMIT_BUCKETS_CLEANED" as const,
      scanned: buckets.length,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function assertJobLease(
  transaction: Prisma.TransactionClient,
  context: PlatformJobHandlerContext,
) {
  if (context.signal.aborted) {
    platformJobError("LEASE_EXPIRED", "The platform operation was aborted.");
  }
  const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT clock_timestamp() AS now`,
  );
  if (!clock?.now) {
    platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
  }
  if (!context.operation) {
    platformJobError(
      "FORBIDDEN",
      "Gate 6D handlers require a fenced worker operation.",
    );
  }
  const actor = await assertPlatformJobOperationAuthorized(
    transaction,
    context.operation,
    clock.now,
    requiredPlatformJobPermissions(context.jobType),
  );
  const job = await transaction.platformJob.findFirst({
    where: {
      fencingToken: context.fencingToken,
      id: context.jobId,
      jobType: context.jobType,
      leaseExpiresAt: { gt: clock.now },
      leaseToken: context.leaseToken,
      status: "RUNNING",
    },
    select: { id: true },
  });
  if (!job) {
    platformJobError("LEASE_EXPIRED", "The Gate 6D job lease is stale.");
  }
  return { actor, now: clock.now };
}

function success(metadata: unknown): PlatformJobHandlerResult {
  return { metadata, outcome: "SUCCEEDED" };
}
