import "server-only";

import { Prisma, type PlatformJobType } from "@prisma/client";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { requiredPlatformJobPermissions } from "@/features/platform-jobs/domain/authority";
import { platformJobError } from "@/features/platform-jobs/domain/errors";

export interface PlatformRuntimeAuthority {
  controlGeneration: bigint;
  fencingToken: bigint;
  invocationId: string;
  jobType: PlatformJobType;
  kind: "RUNTIME_INVOCATION";
  leaseToken: string;
  workerId: string;
}

export async function assertPlatformRuntimeAuthorityCurrent(
  transaction: Prisma.TransactionClient,
  authority: PlatformRuntimeAuthority,
  required: AdminPermission | readonly AdminPermission[],
) {
  const allowed = new Set<AdminPermission>(
    requiredPlatformJobPermissions(authority.jobType),
  );
  const permissions = Array.isArray(required) ? required : [required];
  if (permissions.some((permission) => !allowed.has(permission))) {
    platformJobError(
      "FORBIDDEN",
      "The automatic runtime is not authorized for this job capability.",
    );
  }

  const invocation = await assertPlatformRuntimeInvocationOwned(
    transaction,
    authority,
  );
  return {
    adminAccessId: null,
    personId: invocation.configuredByPersonId,
    permissions: [...allowed],
    runtimeAuthority: authority,
    source: "runtime" as const,
    userId: invocation.configuredByAdminUserId,
  };
}

export async function assertPlatformRuntimeInvocationOwned(
  transaction: Prisma.TransactionClient,
  authority: PlatformRuntimeAuthority,
) {
  const invocations = await transaction.$queryRaw<Array<{
    configuredByAdminUserId: string;
    configuredByPersonId: string;
  }>>(Prisma.sql`
    SELECT
      control."configuredByAdminUserId" AS "configuredByAdminUserId",
      control."configuredByPersonId" AS "configuredByPersonId"
    FROM "PlatformRuntimeInvocation" AS invocation
    JOIN "PlatformRuntimeControl" AS control
      ON control."id" = invocation."controlId"
    WHERE invocation."id" = ${authority.invocationId}::uuid
      AND invocation."state" = 'RUNNING'
      AND invocation."controlGeneration" = ${authority.controlGeneration}
      AND invocation."fencingToken" = ${authority.fencingToken}
      AND invocation."leaseToken" = ${authority.leaseToken}::uuid
      AND invocation."workerId" = ${authority.workerId}
      AND invocation."leaseExpiresAt" > clock_timestamp()
      AND control."state" = 'ENABLED'
      AND control."generation" = ${authority.controlGeneration}
      AND control."provider" = 'GITHUB_ACTIONS_SCHEDULED_HTTP'
    FOR UPDATE OF invocation, control
  `);
  const invocation = invocations[0];
  if (!invocation) {
    platformJobError(
      "STALE_LEASE",
      "The automatic runtime invocation is stale, disabled, or expired.",
    );
  }
  return invocation;
}
