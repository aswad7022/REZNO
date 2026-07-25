import { Prisma } from "@prisma/client";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import {
  assertPlatformJobAdminCurrent,
  type PlatformJobAdminContext,
} from "@/features/platform-jobs/services/admin-context";
import {
  assertPlatformRuntimeAuthorityCurrent,
  assertPlatformRuntimeInvocationOwned,
  type PlatformRuntimeAuthority,
} from "@/features/platform-operations/services/runtime-authority";

export type AdminPlatformJobOperationAuthority = {
  fencingToken: bigint;
  kind?: "ADMIN_MUTATION";
  leaseToken: string;
  mutationId: string;
  workerId: string;
};

export type PlatformJobOperationAuthority =
  | AdminPlatformJobOperationAuthority
  | PlatformRuntimeAuthority;

export async function assertPlatformJobOperationOwned(
  transaction: Prisma.TransactionClient,
  authority: PlatformJobOperationAuthority,
  now: Date,
) {
  if (authority.kind === "RUNTIME_INVOCATION") {
    const invocation = await assertPlatformRuntimeInvocationOwned(
      transaction,
      authority,
    );
    return {
      adminAccessId: null,
      personId: invocation.configuredByPersonId,
      source: "runtime" as const,
      userId: invocation.configuredByAdminUserId,
    };
  }
  const operation = await transaction.$queryRaw<Array<{
    actorAdminUserId: string;
    actorPersonId: string;
    id: string;
  }>>(Prisma.sql`
    SELECT mutation."id",
           mutation."actorAdminUserId" AS "actorAdminUserId",
           mutation."actorPersonId" AS "actorPersonId"
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
  const owned = operation[0]!;
  return {
    adminAccessId: null,
    personId: owned.actorPersonId,
    source: "database",
    userId: owned.actorAdminUserId,
  } satisfies PlatformJobAdminContext;
}

export async function assertPlatformJobOperationAuthorized(
  transaction: Prisma.TransactionClient,
  authority: PlatformJobOperationAuthority,
  now: Date,
  permissions: readonly AdminPermission[],
) {
  if (authority.kind === "RUNTIME_INVOCATION") {
    return assertPlatformRuntimeAuthorityCurrent(
      transaction,
      authority,
      permissions,
    );
  }
  const actor = await assertPlatformJobOperationOwned(
    transaction,
    authority,
    now,
  ) as PlatformJobAdminContext;
  return assertPlatformJobAdminCurrent(transaction, actor, permissions);
}

export async function platformJobDatabaseNow(transaction: Prisma.TransactionClient) {
  const [clock] = await transaction.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT clock_timestamp() AS now`,
  );
  if (!clock?.now) platformJobError("PLATFORM_JOB_FAILURE", "The database clock is unavailable.");
  return clock.now;
}
