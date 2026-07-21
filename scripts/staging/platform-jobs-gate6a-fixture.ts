import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { platformJobHash } from "../../features/platform-jobs/domain/canonical";
import { platformHealthPayload } from "../../features/platform-jobs/domain/registry";

export const PLATFORM_JOBS_GATE6A_MARKER = "rezno-qa-stage6-gate6a-durable-jobs";
export const platformJobsGate6aFixtureIds = {
  adminAccessId: "6a000000-0000-4000-8000-000000000001",
  personId: "6a000000-0000-4000-8000-000000000002",
  organizationId: "6a000000-0000-4000-8000-000000000003",
  scheduleId: "6a000000-0000-4000-8000-000000000004",
  jobs: {
    success: "6a000000-0000-4000-8000-000000000011",
    recovery: "6a000000-0000-4000-8000-000000000012",
    retry: "6a000000-0000-4000-8000-000000000013",
    cancel: "6a000000-0000-4000-8000-000000000014",
    requeue: "6a000000-0000-4000-8000-000000000015",
  },
  requeueAttemptId: "6a000000-0000-4000-8000-000000000021",
  requeueLeaseToken: "6a000000-0000-4000-8000-000000000022",
  userId: "rezno.qa.stage6.gate6a.admin",
} as const;

const payload = platformHealthPayload();
const payloadHash = platformJobHash(payload);

export async function seedPlatformJobsGate6aFixture(prisma: PrismaClient) {
  const ids = platformJobsGate6aFixtureIds;
  await prisma.$transaction(async (transaction) => {
    await transaction.user.upsert({
      where: { id: ids.userId },
      create: { email: "rezno.qa.stage6.gate6a@rezno.invalid", emailVerified: true, id: ids.userId, name: PLATFORM_JOBS_GATE6A_MARKER },
      update: {},
    });
    await transaction.person.upsert({
      where: { id: ids.personId },
      create: { authUserId: ids.userId, firstName: "Gate6A", id: ids.personId, isOnboarded: true, status: "ACTIVE" },
      update: {},
    });
    await transaction.adminAccess.upsert({
      where: { id: ids.adminAccessId },
      create: { id: ids.adminAccessId, permissions: ["PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE"], role: "ADMIN", status: "ACTIVE", userId: ids.userId },
      update: {},
    });
    await transaction.organization.upsert({
      where: { id: ids.organizationId },
      create: { id: ids.organizationId, name: PLATFORM_JOBS_GATE6A_MARKER, slug: PLATFORM_JOBS_GATE6A_MARKER },
      update: {},
    });
    await transaction.platformJobSchedule.upsert({
      where: { id: ids.scheduleId },
      create: {
        cadenceSeconds: 60,
        catchupLimit: 2,
        createdByAdminUserId: ids.userId,
        createdByPersonId: ids.personId,
        enabled: false,
        id: ids.scheduleId,
        jobType: "PLATFORM_HEALTH_PROBE",
        nextRunAt: new Date("2026-07-21T12:00:00.000Z"),
        payload,
        payloadHash,
        payloadVersion: 1,
        scheduleKey: "PLATFORM_HEALTH_PROBE",
        scopeKey: "platform",
      },
      update: {},
    });
    for (const [name, id, priority, maxAttempts, availableAt] of [
      ["success", ids.jobs.success, 9, 3, "2026-07-21T12:00:00.000Z"],
      ["recovery", ids.jobs.recovery, 8, 2, "2026-07-21T12:10:00.000Z"],
      ["retry", ids.jobs.retry, 7, 2, "2026-07-21T12:20:00.000Z"],
      ["cancel", ids.jobs.cancel, 6, 1, "2026-07-21T12:30:00.000Z"],
    ] as const) {
      await transaction.platformJob.upsert({
        where: { id },
        create: {
          availableAt: new Date(availableAt),
          createdByAdminUserId: ids.userId,
          createdByPersonId: ids.personId,
          deduplicationKey: `staging:${PLATFORM_JOBS_GATE6A_MARKER}:${name}`,
          id,
          jobType: "PLATFORM_HEALTH_PROBE",
          maxAttempts,
          payload,
          payloadHash,
          payloadVersion: 1,
          priority,
          scopeKey: "platform",
          source: "ADMIN_MANUAL",
          status: name === "success" ? "AVAILABLE" : "SCHEDULED",
        },
        update: {},
      });
    }
    await transaction.platformJob.upsert({
      where: { id: ids.jobs.requeue },
      create: {
        attemptCount: 1,
        availableAt: new Date("2026-07-21T12:00:00.000Z"),
        createdByAdminUserId: ids.userId,
        createdByPersonId: ids.personId,
        deduplicationKey: `staging:${PLATFORM_JOBS_GATE6A_MARKER}:requeue`,
        failedAt: new Date("2026-07-21T12:01:00.000Z"),
        fencingToken: 1,
        id: ids.jobs.requeue,
        jobType: "PLATFORM_HEALTH_PROBE",
        lastErrorCode: "PERMANENT_FAILURE",
        maxAttempts: 1,
        payload,
        payloadHash,
        payloadVersion: 1,
        priority: 5,
        scopeKey: "platform",
        source: "ADMIN_MANUAL",
        startedAt: new Date("2026-07-21T12:00:30.000Z"),
        status: "FAILED",
      },
      update: {},
    });
    await transaction.platformJobAttempt.upsert({
      where: { id: ids.requeueAttemptId },
      create: {
        attemptNumber: 1,
        errorCode: "PERMANENT_FAILURE",
        fencingToken: 1,
        finishedAt: new Date("2026-07-21T12:01:00.000Z"),
        heartbeatAt: new Date("2026-07-21T12:00:30.000Z"),
        id: ids.requeueAttemptId,
        jobId: ids.jobs.requeue,
        leaseToken: ids.requeueLeaseToken,
        startedAt: new Date("2026-07-21T12:00:30.000Z"),
        status: "FAILED",
        workerId: "staging:gate6a:seeded-worker",
      },
      update: {},
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  return platformJobsGate6aFixtureFingerprint(prisma);
}

export async function platformJobsGate6aFixtureFingerprint(prisma: PrismaClient) {
  const ids = platformJobsGate6aFixtureIds;
  const [actor, schedule, jobs, attempts, mutations] = await Promise.all([
    prisma.person.findUnique({ where: { id: ids.personId }, select: { authUserId: true, id: true, isOnboarded: true, status: true } }),
    prisma.platformJobSchedule.findUnique({ where: { id: ids.scheduleId }, select: { cadenceSeconds: true, catchupLimit: true, enabled: true, id: true, jobType: true, nextRunAt: true, version: true } }),
    prisma.platformJob.findMany({ where: { createdByAdminUserId: ids.userId }, orderBy: { id: "asc" }, select: { attemptCount: true, fencingToken: true, id: true, maxAttempts: true, requeueCount: true, requeueRootJobId: true, requeueSequence: true, scheduleId: true, status: true, version: true } }),
    prisma.platformJobAttempt.findMany({ where: { job: { createdByAdminUserId: ids.userId } }, orderBy: [{ jobId: "asc" }, { attemptNumber: "asc" }], select: { attemptNumber: true, errorCode: true, fencingToken: true, jobId: true, status: true } }),
    prisma.platformJobMutation.findMany({ where: { actorAdminUserId: ids.userId }, orderBy: { id: "asc" }, select: { action: true, idempotencyKey: true, jobId: true, scheduleId: true } }),
  ]);
  const value = jsonSafe({ actor, attempts, jobs, mutations, schedule });
  return { counts: { attempts: attempts.length, jobs: jobs.length, mutations: mutations.length, schedules: schedule ? 1 : 0 }, fingerprint: createHash("sha256").update(JSON.stringify(value)).digest("hex") };
}

export async function platformJobsGate6aNonFixtureFingerprint(prisma: PrismaClient) {
  const ids = platformJobsGate6aFixtureIds;
  const tables = await prisma.$queryRaw<Array<{ table: string }>>(Prisma.sql`
    SELECT tablename AS table FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `);
  const components: Array<{ count: string; digest: string; table: string }> = [];
  for (const { table } of tables) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(table)) throw new Error("Unexpected staging table identifier.");
    const where = nonFixtureWhere(table, ids);
    const quoted = `"${table.replaceAll('"', '""')}"`;
    const [row] = await prisma.$queryRawUnsafe<Array<{ count: bigint; digest: string }>>(
      `SELECT count(*)::bigint AS count, md5(COALESCE(string_agg(md5(to_jsonb(row_value)::text), '' ORDER BY md5(to_jsonb(row_value)::text)), '')) AS digest FROM ${quoted} AS row_value ${where}`,
    );
    components.push({ count: row.count.toString(), digest: row.digest, table });
  }
  return createHash("sha256").update(JSON.stringify(components)).digest("hex");
}

export async function cleanupPlatformJobsGate6aFixture(prisma: PrismaClient) {
  const ids = platformJobsGate6aFixtureIds;
  const cleanup = await prisma.$transaction(async (transaction) => ({
    mutations: (await transaction.platformJobMutation.deleteMany({ where: { actorAdminUserId: ids.userId } })).count,
    attempts: (await transaction.platformJobAttempt.deleteMany({ where: { job: { createdByAdminUserId: ids.userId } } })).count,
    requeuedJobs: (await transaction.platformJob.deleteMany({ where: { createdByAdminUserId: ids.userId, requeueRootJobId: { not: null } } })).count,
    jobs: (await transaction.platformJob.deleteMany({ where: { createdByAdminUserId: ids.userId } })).count,
    schedules: (await transaction.platformJobSchedule.deleteMany({ where: { createdByAdminUserId: ids.userId } })).count,
    adminAccess: (await transaction.adminAccess.deleteMany({ where: { id: ids.adminAccessId } })).count,
    person: (await transaction.person.deleteMany({ where: { id: ids.personId } })).count,
    user: (await transaction.user.deleteMany({ where: { id: ids.userId } })).count,
    organization: (await transaction.organization.deleteMany({ where: { id: ids.organizationId } })).count,
  }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  return cleanup;
}

export function platformJobsGate6aCleanupTotal(cleanup: Awaited<ReturnType<typeof cleanupPlatformJobsGate6aFixture>>) {
  return Object.values(cleanup).reduce((sum, count) => sum + count, 0);
}

function nonFixtureWhere(table: string, ids: typeof platformJobsGate6aFixtureIds) {
  const text = (value: string) => `'${value.replaceAll("'", "''")}'`;
  if (table === "user") return `WHERE row_value."id" <> ${text(ids.userId)}`;
  if (table === "Person") return `WHERE row_value."id" <> ${text(ids.personId)}::uuid`;
  if (table === "AdminAccess") return `WHERE row_value."id" <> ${text(ids.adminAccessId)}::uuid`;
  if (table === "Organization") return `WHERE row_value."id" <> ${text(ids.organizationId)}::uuid`;
  if (table === "PlatformJob") return `WHERE row_value."createdByAdminUserId" IS DISTINCT FROM ${text(ids.userId)}`;
  if (table === "PlatformJobSchedule") return `WHERE row_value."createdByAdminUserId" <> ${text(ids.userId)}`;
  if (table === "PlatformJobMutation") return `WHERE row_value."actorAdminUserId" <> ${text(ids.userId)}`;
  if (table === "PlatformJobAttempt") return `WHERE NOT EXISTS (SELECT 1 FROM "PlatformJob" fixture_job WHERE fixture_job."id" = row_value."jobId" AND fixture_job."createdByAdminUserId" = ${text(ids.userId)})`;
  return "";
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}
