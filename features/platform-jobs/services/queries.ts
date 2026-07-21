import "server-only";

import { PlatformJobSource, PlatformJobStatus, PlatformJobType, Prisma } from "@prisma/client";

import { platformJobHash } from "@/features/platform-jobs/domain/canonical";
import { PLATFORM_JOB_LIMITS } from "@/features/platform-jobs/domain/contracts";
import { decodePlatformJobCursor, encodePlatformJobCursor, platformJobCursorBinding } from "@/features/platform-jobs/domain/cursor";
import { platformJobError } from "@/features/platform-jobs/domain/errors";
import { platformJobPayloadSummary } from "@/features/platform-jobs/domain/registry";
import { assertPlatformJobAdminCurrent, type PlatformJobAdminContext } from "@/features/platform-jobs/services/admin-context";
import { runPlatformJobSerializable } from "@/features/platform-jobs/services/transaction";
import { getExactPostgresTime } from "@/lib/db/postgres-timestamp";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PlatformJobListInput = {
  cursor?: string;
  jobType?: PlatformJobType;
  limit?: number;
  source?: PlatformJobSource;
  status?: PlatformJobStatus;
};

type JobRow = {
  attemptCount: number;
  availableAt: Date;
  createdAtExact: string;
  fencingToken: bigint;
  id: string;
  jobType: PlatformJobType;
  maxAttempts: number;
  organizationId: string | null;
  payloadVersion: number;
  priority: number;
  source: PlatformJobSource;
  status: PlatformJobStatus;
  version: number;
};

export async function listPlatformJobs(context: PlatformJobAdminContext, input: PlatformJobListInput = {}) {
  const limit = input.limit ?? PLATFORM_JOB_LIMITS.defaultListPage;
  if (!Number.isInteger(limit) || limit < 1 || limit > PLATFORM_JOB_LIMITS.maxListPage) {
    platformJobError("VALIDATION_ERROR", "The platform-job page size is invalid.");
  }
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(transaction, context, "PLATFORM_JOBS_VIEW");
    const authoritativeNow = await getExactPostgresTime(transaction);
    const adminScope = platformJobHash({
      adminAccessId: current.adminAccessId,
      source: current.source,
      userId: current.userId,
    });
    const filter = platformJobCursorBinding({
      jobType: input.jobType ?? null,
      source: input.source ?? null,
      status: input.status ?? null,
    });
    const cursor = input.cursor
      ? decodePlatformJobCursor("PLATFORM_JOB", input.cursor, { adminScope, filter, pageSize: limit }, authoritativeNow)
      : null;
    const snapshot = cursor?.snapshot ?? authoritativeNow;
    const conditions: Prisma.Sql[] = [
      Prisma.sql`job."createdAt" <= CAST(${snapshot} AS timestamptz)`,
    ];
    if (input.jobType) conditions.push(Prisma.sql`job."jobType" = CAST(${input.jobType} AS "PlatformJobType")`);
    if (input.source) conditions.push(Prisma.sql`job."source" = CAST(${input.source} AS "PlatformJobSource")`);
    if (input.status) conditions.push(Prisma.sql`job."status" = CAST(${input.status} AS "PlatformJobStatus")`);
    if (cursor) {
      conditions.push(Prisma.sql`(
        job."createdAt" < CAST(${cursor.sortValue} AS timestamptz)
        OR (job."createdAt" = CAST(${cursor.sortValue} AS timestamptz) AND job."id" < CAST(${cursor.id} AS uuid))
      )`);
    }
    const rows = await transaction.$queryRaw<JobRow[]>(Prisma.sql`
      SELECT job."id", job."jobType", job."status", job."source",
             job."payloadVersion", job."organizationId", job."priority",
             job."availableAt", job."attemptCount", job."maxAttempts",
             job."fencingToken", job."version",
             to_char(job."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtExact"
      FROM "PlatformJob" AS job
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY job."createdAt" DESC, job."id" DESC
      LIMIT ${limit + 1}
    `);
    const items = rows.slice(0, limit).map(jobListDto);
    const anchor = rows.length > limit ? rows[limit - 1] : null;
    return {
      items,
      nextCursor: anchor
        ? encodePlatformJobCursor("PLATFORM_JOB", {
            adminScope,
            filter,
            id: anchor.id,
            pageSize: limit,
            snapshot,
            sortValue: anchor.createdAtExact,
          })
        : null,
    };
  });
}

export async function getPlatformJobDetail(context: PlatformJobAdminContext, jobId: string) {
  if (!UUID.test(jobId)) platformJobError("VALIDATION_ERROR", "The platform job ID is invalid.");
  return runPlatformJobSerializable(async (transaction) => {
    await assertPlatformJobAdminCurrent(transaction, context, "PLATFORM_JOBS_VIEW");
    const job = await transaction.platformJob.findUnique({
      where: { id: jobId },
      include: {
        attempts: { orderBy: [{ attemptNumber: "desc" }], take: 20 },
        mutations: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 },
      },
    });
    if (!job) platformJobError("NOT_FOUND", "The platform job was not found.");
    return {
      attemptCount: job.attemptCount,
      attempts: job.attempts.map((attempt) => ({
        attemptNumber: attempt.attemptNumber,
        createdAt: attempt.createdAt.toISOString(),
        errorCode: attempt.errorCode,
        fencingToken: attempt.fencingToken.toString(),
        finishedAt: attempt.finishedAt?.toISOString() ?? null,
        heartbeatAt: attempt.heartbeatAt?.toISOString() ?? null,
        resultMetadata: attempt.resultMetadata,
        startedAt: attempt.startedAt?.toISOString() ?? null,
        status: attempt.status,
        workerFingerprint: platformJobHash(attempt.workerId),
      })),
      availableAt: job.availableAt.toISOString(),
      cancelledAt: job.cancelledAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      failedAt: job.failedAt?.toISOString() ?? null,
      fencingToken: job.fencingToken.toString(),
      id: job.id,
      jobType: job.jobType,
      lastErrorCode: job.lastErrorCode,
      lease: job.leaseExpiresAt ? {
        active: true,
        expiresAt: job.leaseExpiresAt.toISOString(),
        heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
        ownerFingerprint: job.leaseOwner ? platformJobHash(job.leaseOwner) : null,
      } : { active: false, expiresAt: null, heartbeatAt: null, ownerFingerprint: null },
      maxAttempts: job.maxAttempts,
      mutations: job.mutations.map((mutation) => ({ action: mutation.action, createdAt: mutation.createdAt.toISOString() })),
      organizationId: job.organizationId,
      payload: platformJobPayloadSummary(job.jobType, job.payloadVersion),
      priority: job.priority,
      requeueCount: job.requeueCount,
      requeueRootJobId: job.requeueRootJobId,
      requeueSequence: job.requeueSequence,
      resultMetadata: job.resultMetadata,
      source: job.source,
      status: job.status,
      updatedAt: job.updatedAt.toISOString(),
      version: job.version,
    };
  });
}

export async function listPlatformJobSchedules(
  context: PlatformJobAdminContext,
  input: { cursor?: string; limit?: number } = {},
) {
  const limit = input.limit ?? PLATFORM_JOB_LIMITS.defaultListPage;
  if (!Number.isInteger(limit) || limit < 1 || limit > PLATFORM_JOB_LIMITS.maxListPage) {
    platformJobError("VALIDATION_ERROR", "The schedule page size is invalid.");
  }
  return runPlatformJobSerializable(async (transaction) => {
    const current = await assertPlatformJobAdminCurrent(transaction, context, "PLATFORM_JOBS_VIEW");
    const authoritativeNow = await getExactPostgresTime(transaction);
    const adminScope = platformJobHash({ adminAccessId: current.adminAccessId, source: current.source, userId: current.userId });
    const filter = platformJobCursorBinding({ kind: "PLATFORM_JOB_SCHEDULE" });
    const cursor = input.cursor
      ? decodePlatformJobCursor("PLATFORM_JOB_SCHEDULE", input.cursor, { adminScope, filter, pageSize: limit }, authoritativeNow)
      : null;
    const snapshot = cursor?.snapshot ?? authoritativeNow;
    const rows = await transaction.$queryRaw<Array<{
      cadenceSeconds: number;
      catchupLimit: number;
      createdAtExact: string;
      enabled: boolean;
      id: string;
      jobType: PlatformJobType;
      lastTickAt: Date | null;
      nextRunAt: Date;
      organizationId: string | null;
      payloadVersion: number;
      scheduleKey: string;
      version: number;
    }>>(Prisma.sql`
      SELECT schedule."id", schedule."scheduleKey"::text AS "scheduleKey",
             schedule."jobType", schedule."payloadVersion", schedule."organizationId",
             schedule."cadenceSeconds", schedule."catchupLimit", schedule."enabled",
             schedule."nextRunAt", schedule."lastTickAt", schedule."version",
             to_char(schedule."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtExact"
      FROM "PlatformJobSchedule" AS schedule
      WHERE schedule."createdAt" <= CAST(${snapshot} AS timestamptz)
        ${cursor ? Prisma.sql`AND (
          schedule."createdAt" < CAST(${cursor.sortValue} AS timestamptz)
          OR (schedule."createdAt" = CAST(${cursor.sortValue} AS timestamptz) AND schedule."id" < CAST(${cursor.id} AS uuid))
        )` : Prisma.empty}
      ORDER BY schedule."createdAt" DESC, schedule."id" DESC
      LIMIT ${limit + 1}
    `);
    const items = rows.slice(0, limit).map((schedule) => ({
      cadenceSeconds: schedule.cadenceSeconds,
      catchupLimit: schedule.catchupLimit,
      enabled: schedule.enabled,
      id: schedule.id,
      jobType: schedule.jobType,
      lastTickAt: schedule.lastTickAt?.toISOString() ?? null,
      nextRunAt: schedule.nextRunAt.toISOString(),
      organizationId: schedule.organizationId,
      payload: platformJobPayloadSummary(schedule.jobType, schedule.payloadVersion),
      scheduleKey: schedule.scheduleKey,
      version: schedule.version,
    }));
    const anchor = rows.length > limit ? rows[limit - 1] : null;
    return {
      items,
      nextCursor: anchor ? encodePlatformJobCursor("PLATFORM_JOB_SCHEDULE", {
        adminScope,
        filter,
        id: anchor.id,
        pageSize: limit,
        snapshot,
        sortValue: anchor.createdAtExact,
      }) : null,
    };
  });
}

function jobListDto(row: JobRow) {
  return {
    attemptCount: row.attemptCount,
    availableAt: row.availableAt.toISOString(),
    createdAt: row.createdAtExact,
    fencingToken: row.fencingToken.toString(),
    id: row.id,
    jobType: row.jobType,
    maxAttempts: row.maxAttempts,
    organizationId: row.organizationId,
    payload: platformJobPayloadSummary(row.jobType, row.payloadVersion),
    priority: row.priority,
    source: row.source,
    status: row.status,
    version: row.version,
  };
}
