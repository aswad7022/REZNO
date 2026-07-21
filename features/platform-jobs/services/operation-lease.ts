import { Prisma } from "@prisma/client";

import { platformJobError } from "@/features/platform-jobs/domain/errors";

export type PlatformJobOperationAuthority = {
  fencingToken: bigint;
  leaseToken: string;
  mutationId: string;
  workerId: string;
};

export async function assertPlatformJobOperationOwned(
  transaction: Prisma.TransactionClient,
  authority: PlatformJobOperationAuthority,
  now: Date,
) {
  const operation = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT mutation."id"
    FROM "PlatformJobMutation" AS mutation
    WHERE mutation."id" = ${authority.mutationId}::uuid
      AND mutation."action" = 'WORKER_BATCH'
      AND mutation."operationCompletedAt" IS NULL
      AND mutation."operationFencingToken" = ${authority.fencingToken}
      AND mutation."operationLeaseExpiresAt" > ${now}
      AND mutation."operationLeaseToken" = ${authority.leaseToken}::uuid
      AND mutation."operationWorkerId" = ${authority.workerId}
    FOR UPDATE
  `);
  if (operation.length !== 1) {
    platformJobError("STALE_LEASE", "The worker operation lease is stale or expired.");
  }
}

export async function platformJobDatabaseNow(transaction: Prisma.TransactionClient) {
  const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT clock_timestamp() AS now`,
  );
  if (!clock?.now) platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
  return clock.now;
}
