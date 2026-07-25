import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { platformJobHash } from "../../features/platform-jobs/domain/canonical";
import {
  PLATFORM_SCHEDULE_DEFAULTS,
} from "../../features/platform-operations/services/admin";
import {
  PLATFORM_RUNTIME_CONTROL_ID,
} from "../../features/platform-operations/services/runtime";
import {
  distributedRateLimitKeyHash,
} from "../../lib/security/rate-limit";

export const PLATFORM_OPERATIONS_GATE6D_MARKER =
  "rezno-qa-stage6-gate6d-platform-operations";
export const PLATFORM_OPERATIONS_GATE6D_RATE_LIMIT_SMOKE = {
  identifier: `${PLATFORM_OPERATIONS_GATE6D_MARKER}:caller`,
  options: { limit: 3, windowMs: 60_000 },
  scope: "gate6d.staging.fixture",
} as const;

const baseTime = new Date("2026-07-24T18:00:00.123456Z");
const futureWindow = new Date("2030-01-01T00:00:00.123456Z");
const id = (value: number) =>
  `6f000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const platformOperationsGate6dFixtureIds = {
  adminAccessId: id(1),
  adminPersonId: id(2),
  adminUserId: "gate6d.staging.admin",
  alertHistoryId: id(3),
  alertId: id(4),
  incidentHistoryId: id(5),
  incidentId: id(6),
  invocationId: id(7),
  jobId: id(8),
  operationMutationId: id(9),
  operationMutationKey: id(10),
  rateBucketKeyHash: sha256(
    `${PLATFORM_OPERATIONS_GATE6D_MARKER}:rate-bucket`,
  ),
  scheduleIds: PLATFORM_SCHEDULE_DEFAULTS.map((_, index) => id(100 + index)),
} as const;

const permissions = [
  "PLATFORM_JOBS_VIEW",
  "PLATFORM_JOBS_MANAGE",
  "PLATFORM_OPERATIONS_VIEW",
  "PLATFORM_OPERATIONS_MANAGE",
  "COMMERCE_ORDERS_MANAGE",
] as const;

export async function seedPlatformOperationsGate6dFixture(
  prisma: PrismaClient,
) {
  await cleanupPlatformOperationsGate6dFixture(prisma);
  const ids = platformOperationsGate6dFixtureIds;
  const jobPayload = { batchSize: 50 };
  const alertObservation = { count: 1, saturated: false };
  const invocationCompletedAt = new Date(baseTime.getTime() + 3_000);
  const firstScheduleId = ids.scheduleIds[0];
  if (!firstScheduleId) {
    throw new Error("Gate 6D fixture schedule registry is empty.");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.user.create({
      data: {
        createdAt: baseTime,
        email: `${PLATFORM_OPERATIONS_GATE6D_MARKER}@rezno.invalid`,
        emailVerified: true,
        id: ids.adminUserId,
        name: PLATFORM_OPERATIONS_GATE6D_MARKER,
        updatedAt: baseTime,
      },
    });
    await transaction.person.create({
      data: {
        authUserId: ids.adminUserId,
        createdAt: baseTime,
        firstName: "Gate6D",
        id: ids.adminPersonId,
        isOnboarded: true,
        status: "ACTIVE",
        updatedAt: baseTime,
      },
    });
    await transaction.adminAccess.create({
      data: {
        createdAt: baseTime,
        id: ids.adminAccessId,
        permissions: [...permissions],
        role: "ADMIN",
        status: "ACTIVE",
        updatedAt: baseTime,
        userId: ids.adminUserId,
      },
    });

    await transaction.platformJobSchedule.createMany({
      data: PLATFORM_SCHEDULE_DEFAULTS.map((definition, index) => {
        const payload = { ...definition.payload };
        return {
          cadenceSeconds: definition.cadenceSeconds,
          catchupLimit: definition.catchupLimit,
          createdAt: baseTime,
          createdByAdminUserId: ids.adminUserId,
          createdByPersonId: ids.adminPersonId,
          enabled: false,
          id: ids.scheduleIds[index]!,
          jobType: definition.jobType,
          nextRunAt: new Date(
            futureWindow.getTime() + index * 1_000,
          ),
          payload,
          payloadHash: platformJobHash(payload),
          payloadVersion: 1,
          scheduleKey: definition.scheduleKey,
          scopeKey: "platform",
          updatedAt: baseTime,
          version: 1,
        };
      }),
    });

    await transaction.platformRuntimeControl.create({
      data: {
        configuredByAdminUserId: ids.adminUserId,
        configuredByPersonId: ids.adminPersonId,
        createdAt: baseTime,
        disabledAt: baseTime,
        expectedIntervalSeconds: 300,
        generation: BigInt(1),
        id: PLATFORM_RUNTIME_CONTROL_ID,
        lastInvocationAt: invocationCompletedAt,
        lastSucceededAt: null,
        provider: "GITHUB_ACTIONS_SCHEDULED_HTTP",
        state: "DISABLED",
        updatedAt: invocationCompletedAt,
        version: 1,
      },
    });
    await transaction.platformRuntimeInvocation.create({
      data: {
        completedAt: invocationCompletedAt,
        controlGeneration: BigInt(1),
        controlId: PLATFORM_RUNTIME_CONTROL_ID,
        createdAt: baseTime,
        eventName: "schedule",
        fencingToken: BigInt(1),
        gitRefHash: sha256("refs/heads/main"),
        id: ids.invocationId,
        monitorCompletedAt: invocationCompletedAt,
        monitorResult: { state: "NOT_CLAIMED" },
        provider: "GITHUB_ACTIONS_SCHEDULED_HTTP",
        repositorySha: "38ec9e3d6bd9db56f46e515cccab5dd6301bc63e",
        requestedAt: baseTime,
        safeErrorCode: "STAGING_FIXTURE",
        schedulerCompletedAt: new Date(baseTime.getTime() + 1_000),
        schedulerResult: {
          jobsCreated: 0,
          schedulesProcessed: 0,
          state: "COMPLETE",
        },
        state: "FAILED",
        tokenJtiHash: sha256(
          `${PLATFORM_OPERATIONS_GATE6D_MARKER}:runtime-jti`,
        ),
        updatedAt: invocationCompletedAt,
        workerCompletedAt: new Date(baseTime.getTime() + 2_000),
        workerId: "runtime:gate6d-staging-fixture",
        workerResult: {
          claimed: 0,
          state: "COMPLETE",
          succeeded: 0,
        },
        workflowRefHash: sha256(
          "aswad7022/REZNO/.github/workflows/platform-runtime.yml@refs/heads/main",
        ),
      },
    });
    await transaction.distributedRateLimitBucket.create({
      data: {
        count: 2,
        createdAt: baseTime,
        expiresAt: new Date(futureWindow.getTime() + 86_400_000),
        keyHash: ids.rateBucketKeyHash,
        keyVersion: 1,
        resetAt: new Date(futureWindow.getTime() + 60_000),
        updatedAt: baseTime,
        windowStartedAt: futureWindow,
      },
    });
    await transaction.platformJob.create({
      data: {
        availableAt: baseTime,
        createdAt: baseTime,
        createdByAdminUserId: ids.adminUserId,
        createdByPersonId: ids.adminPersonId,
        deduplicationKey: `${PLATFORM_OPERATIONS_GATE6D_MARKER}:commerce-expiry`,
        id: ids.jobId,
        jobType: "COMMERCE_ORDER_EXPIRY",
        maxAttempts: 3,
        payload: jobPayload,
        payloadHash: platformJobHash(jobPayload),
        payloadVersion: 1,
        priority: 9,
        scopeKey: "platform",
        source: "ADMIN_MANUAL",
        status: "AVAILABLE",
        updatedAt: baseTime,
      },
    });

    await transaction.platformAlert.create({
      data: {
        createdAt: baseTime,
        deduplicationKey: "platform:gate6d_staging_fixture",
        domain: "PLATFORM",
        firstObservedAt: baseTime,
        id: ids.alertId,
        lastObservedAt: baseTime,
        observation: alertObservation,
        rule: "OVERDUE_JOBS",
        severity: "WARNING",
        state: "OPEN",
        summaryCode: "gate6d_staging_fixture",
        updatedAt: baseTime,
        version: 1,
      },
    });
    await transaction.platformAlertHistory.create({
      data: {
        actorAdminUserId: ids.adminUserId,
        actorPersonId: ids.adminPersonId,
        alertId: ids.alertId,
        createdAt: baseTime,
        event: "OPENED",
        fromState: null,
        id: ids.alertHistoryId,
        metadata: {
          fixture: PLATFORM_OPERATIONS_GATE6D_MARKER,
        },
        source: "ADMIN",
        toState: "OPEN",
      },
    });
    await transaction.platformIncident.create({
      data: {
        createdAt: baseTime,
        deduplicationKey: "incident:gate6d_staging_fixture",
        domain: "PLATFORM",
        id: ids.incidentId,
        severity: "WARNING",
        sourceAlertId: ids.alertId,
        state: "OPEN",
        summaryCode: "gate6d_staging_fixture",
        updatedAt: baseTime,
        version: 1,
      },
    });
    await transaction.platformIncidentHistory.create({
      data: {
        actorAdminUserId: ids.adminUserId,
        actorPersonId: ids.adminPersonId,
        createdAt: baseTime,
        event: "CREATED",
        fromState: null,
        id: ids.incidentHistoryId,
        incidentId: ids.incidentId,
        metadata: {
          fixture: PLATFORM_OPERATIONS_GATE6D_MARKER,
        },
        source: "ADMIN",
        toState: "OPEN",
      },
    });
    await transaction.platformOperationMutation.create({
      data: {
        action: "SCHEDULE_BOOTSTRAP",
        actorAdminUserId: ids.adminUserId,
        actorPersonId: ids.adminPersonId,
        createdAt: baseTime,
        id: ids.operationMutationId,
        idempotencyKey: ids.operationMutationKey,
        requestHash: platformJobHash({
          action: "SCHEDULE_BOOTSTRAP",
          registryVersion: 1,
        }),
        result: {
          configured: PLATFORM_SCHEDULE_DEFAULTS.length,
          created: PLATFORM_SCHEDULE_DEFAULTS.length,
          enabled: 0,
          registryVersion: 1,
        },
        scheduleId: firstScheduleId,
      },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 30_000,
  });

  return platformOperationsGate6dFixtureFingerprint(prisma);
}

export async function platformOperationsGate6dFixtureFingerprint(
  prisma: PrismaClient,
) {
  const ids = platformOperationsGate6dFixtureIds;
  const [
    actor,
    schedules,
    jobs,
    attempts,
    jobMutations,
    rateBuckets,
    runtimeControls,
    runtimeInvocations,
    alerts,
    alertHistory,
    incidents,
    incidentHistory,
    operationMutations,
  ] = await Promise.all([
    prisma.adminAccess.findMany({
      where: { id: ids.adminAccessId },
      select: { id: true, permissions: true, role: true, status: true, userId: true },
    }),
    prisma.platformJobSchedule.findMany({
      where: { createdByAdminUserId: ids.adminUserId },
      orderBy: { id: "asc" },
      select: {
        enabled: true,
        id: true,
        jobType: true,
        scheduleKey: true,
        version: true,
      },
    }),
    prisma.platformJob.findMany({
      where: { createdByAdminUserId: ids.adminUserId },
      orderBy: { id: "asc" },
      select: {
        attemptCount: true,
        id: true,
        jobType: true,
        status: true,
        version: true,
      },
    }),
    prisma.platformJobAttempt.findMany({
      where: { job: { createdByAdminUserId: ids.adminUserId } },
      orderBy: [{ jobId: "asc" }, { attemptNumber: "asc" }],
      select: { attemptNumber: true, jobId: true, status: true },
    }),
    prisma.platformJobMutation.findMany({
      where: { actorAdminUserId: ids.adminUserId },
      orderBy: { id: "asc" },
      select: { action: true, id: true },
    }),
    prisma.distributedRateLimitBucket.findMany({
      where: {
        keyHash: {
          in: [ids.rateBucketKeyHash, rateLimitSmokeBucketKeyHash()],
        },
      },
      orderBy: { keyHash: "asc" },
      select: { count: true, keyHash: true, keyVersion: true },
    }),
    prisma.platformRuntimeControl.findMany({
      where: {
        configuredByAdminUserId: ids.adminUserId,
        id: PLATFORM_RUNTIME_CONTROL_ID,
      },
      select: { generation: true, id: true, state: true, version: true },
    }),
    prisma.platformRuntimeInvocation.findMany({
      where: { id: ids.invocationId },
      select: {
        controlGeneration: true,
        id: true,
        repositorySha: true,
        state: true,
      },
    }),
    prisma.platformAlert.findMany({
      where: { id: ids.alertId },
      select: { id: true, rule: true, state: true, version: true },
    }),
    prisma.platformAlertHistory.findMany({
      where: { alertId: ids.alertId },
      orderBy: { id: "asc" },
      select: { event: true, id: true, source: true, toState: true },
    }),
    prisma.platformIncident.findMany({
      where: { id: ids.incidentId },
      select: { id: true, sourceAlertId: true, state: true, version: true },
    }),
    prisma.platformIncidentHistory.findMany({
      where: { incidentId: ids.incidentId },
      orderBy: { id: "asc" },
      select: { event: true, id: true, source: true, toState: true },
    }),
    prisma.platformOperationMutation.findMany({
      where: { actorAdminUserId: ids.adminUserId },
      orderBy: { id: "asc" },
      select: { action: true, id: true },
    }),
  ]);
  const rows = jsonSafe({
    actor,
    alertHistory,
    alerts,
    attempts,
    incidentHistory,
    incidents,
    jobMutations,
    jobs,
    operationMutations,
    rateBuckets,
    runtimeControls,
    runtimeInvocations,
    schedules,
  });
  return {
    counts: {
      actor: actor.length,
      alertHistory: alertHistory.length,
      alerts: alerts.length,
      incidentHistory: incidentHistory.length,
      incidents: incidents.length,
      jobAttempts: attempts.length,
      jobMutations: jobMutations.length,
      jobs: jobs.length,
      operationMutations: operationMutations.length,
      rateBuckets: rateBuckets.length,
      runtimeControls: runtimeControls.length,
      runtimeInvocations: runtimeInvocations.length,
      schedules: schedules.length,
    },
    fingerprint: sha256(JSON.stringify(rows)),
  };
}

export async function platformOperationsGate6dNonFixtureFingerprint(
  prisma: PrismaClient,
) {
  const tables = await prisma.$queryRaw<Array<{ table: string }>>(Prisma.sql`
    SELECT tablename AS table
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `);
  const components: Array<{
    count: string;
    digest: string;
    table: string;
  }> = [];
  for (const { table } of tables) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(table)) {
      throw new Error("Unexpected staging table identifier.");
    }
    const quoted = `"${table.replaceAll('"', '""')}"`;
    const where = nonFixtureWhere(table);
    const [row] = await prisma.$queryRawUnsafe<Array<{
      count: bigint;
      digest: string;
    }>>(
      `SELECT count(*)::bigint AS count,
              md5(COALESCE(
                string_agg(
                  md5(to_jsonb(row_value)::text),
                  '' ORDER BY md5(to_jsonb(row_value)::text)
                ),
                ''
              )) AS digest
       FROM ${quoted} AS row_value ${where}`,
    );
    if (!row) throw new Error("Gate 6D fingerprint query returned no row.");
    components.push({
      count: row.count.toString(),
      digest: row.digest,
      table,
    });
  }
  return sha256(JSON.stringify(components));
}

export async function platformOperationsGate6dForeignSentinels(
  prisma: PrismaClient,
) {
  const ids = platformOperationsGate6dFixtureIds;
  const [person, organization] = await Promise.all([
    prisma.person.findFirst({
      where: { id: { not: ids.adminPersonId } },
      orderBy: { id: "asc" },
      select: { id: true, status: true, updatedAt: true },
    }),
    prisma.organization.findFirst({
      orderBy: { id: "asc" },
      select: { id: true, status: true, updatedAt: true },
    }),
  ]);
  if (process.env.NODE_ENV !== "test" && (!person || !organization)) {
    throw new Error(
      "Gate 6D real staging requires foreign Person and Organization sentinels.",
    );
  }
  return {
    organization: organization ? sha256(JSON.stringify(organization)) : null,
    person: person ? sha256(JSON.stringify(person)) : null,
  };
}

export async function cleanupPlatformOperationsGate6dFixture(
  prisma: PrismaClient,
) {
  await assertFixtureOwnership(prisma);
  const ids = platformOperationsGate6dFixtureIds;
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`
      ALTER TABLE "PlatformOperationMutation"
      DISABLE TRIGGER "PlatformOperationMutation_append_only"
    `);
    await transaction.$executeRaw(Prisma.sql`
      ALTER TABLE "PlatformIncidentHistory"
      DISABLE TRIGGER "PlatformIncidentHistory_append_only"
    `);
    await transaction.$executeRaw(Prisma.sql`
      ALTER TABLE "PlatformAlertHistory"
      DISABLE TRIGGER "PlatformAlertHistory_append_only"
    `);
    const operationMutations =
      await transaction.platformOperationMutation.deleteMany({
        where: { actorAdminUserId: ids.adminUserId },
      });
    const incidentHistory =
      await transaction.platformIncidentHistory.deleteMany({
        where: { incidentId: ids.incidentId },
      });
    const alertHistory = await transaction.platformAlertHistory.deleteMany({
      where: { alertId: ids.alertId },
    });
    await transaction.$executeRaw(Prisma.sql`
      ALTER TABLE "PlatformOperationMutation"
      ENABLE TRIGGER "PlatformOperationMutation_append_only"
    `);
    await transaction.$executeRaw(Prisma.sql`
      ALTER TABLE "PlatformIncidentHistory"
      ENABLE TRIGGER "PlatformIncidentHistory_append_only"
    `);
    await transaction.$executeRaw(Prisma.sql`
      ALTER TABLE "PlatformAlertHistory"
      ENABLE TRIGGER "PlatformAlertHistory_append_only"
    `);

    const incidents = await transaction.platformIncident.deleteMany({
      where: { id: ids.incidentId },
    });
    const alerts = await transaction.platformAlert.deleteMany({
      where: { id: ids.alertId },
    });
    const runtimeInvocations =
      await transaction.platformRuntimeInvocation.deleteMany({
        where: {
          control: { configuredByAdminUserId: ids.adminUserId },
          controlId: PLATFORM_RUNTIME_CONTROL_ID,
        },
      });
    const runtimeControls = await transaction.platformRuntimeControl.deleteMany({
      where: {
        configuredByAdminUserId: ids.adminUserId,
        id: PLATFORM_RUNTIME_CONTROL_ID,
      },
    });
    const rateBuckets =
      await transaction.distributedRateLimitBucket.deleteMany({
        where: {
          keyHash: {
            in: [ids.rateBucketKeyHash, rateLimitSmokeBucketKeyHash()],
          },
        },
      });
    const jobMutations = await transaction.platformJobMutation.deleteMany({
      where: { actorAdminUserId: ids.adminUserId },
    });
    const jobAttempts = await transaction.platformJobAttempt.deleteMany({
      where: { job: { createdByAdminUserId: ids.adminUserId } },
    });
    const childJobs = await transaction.platformJob.deleteMany({
      where: {
        createdByAdminUserId: ids.adminUserId,
        parentJobId: { not: null },
      },
    });
    const jobs = await transaction.platformJob.deleteMany({
      where: { createdByAdminUserId: ids.adminUserId },
    });
    const schedules = await transaction.platformJobSchedule.deleteMany({
      where: { createdByAdminUserId: ids.adminUserId },
    });
    const adminAccess = await transaction.adminAccess.deleteMany({
      where: { id: ids.adminAccessId, userId: ids.adminUserId },
    });
    const person = await transaction.person.deleteMany({
      where: { authUserId: ids.adminUserId, id: ids.adminPersonId },
    });
    const user = await transaction.user.deleteMany({
      where: {
        email: `${PLATFORM_OPERATIONS_GATE6D_MARKER}@rezno.invalid`,
        id: ids.adminUserId,
      },
    });
    return {
      adminAccess: adminAccess.count,
      alertHistory: alertHistory.count,
      alerts: alerts.count,
      childJobs: childJobs.count,
      incidentHistory: incidentHistory.count,
      incidents: incidents.count,
      jobAttempts: jobAttempts.count,
      jobMutations: jobMutations.count,
      jobs: jobs.count,
      operationMutations: operationMutations.count,
      person: person.count,
      rateBuckets: rateBuckets.count,
      runtimeControls: runtimeControls.count,
      runtimeInvocations: runtimeInvocations.count,
      schedules: schedules.count,
      user: user.count,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 30_000,
  });
}

export function platformOperationsGate6dCleanupTotal(
  cleanup: Awaited<
    ReturnType<typeof cleanupPlatformOperationsGate6dFixture>
  >,
) {
  return Object.values(cleanup).reduce((sum, count) => sum + count, 0);
}

async function assertFixtureOwnership(prisma: PrismaClient) {
  const ids = platformOperationsGate6dFixtureIds;
  const [
    user,
    person,
    adminAccess,
    control,
    alert,
    incident,
    schedules,
    jobs,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ids.adminUserId },
      select: { email: true },
    }),
    prisma.person.findUnique({
      where: { id: ids.adminPersonId },
      select: { authUserId: true },
    }),
    prisma.adminAccess.findUnique({
      where: { id: ids.adminAccessId },
      select: { userId: true },
    }),
    prisma.platformRuntimeControl.findUnique({
      where: { id: PLATFORM_RUNTIME_CONTROL_ID },
      select: { configuredByAdminUserId: true },
    }),
    prisma.platformAlert.findUnique({
      where: { id: ids.alertId },
      select: { deduplicationKey: true },
    }),
    prisma.platformIncident.findUnique({
      where: { id: ids.incidentId },
      select: { deduplicationKey: true },
    }),
    prisma.platformJobSchedule.findMany({
      where: { id: { in: [...ids.scheduleIds] } },
      select: { createdByAdminUserId: true },
    }),
    prisma.platformJob.findMany({
      where: { id: ids.jobId },
      select: { createdByAdminUserId: true },
    }),
  ]);
  if (
    (user
      && user.email
        !== `${PLATFORM_OPERATIONS_GATE6D_MARKER}@rezno.invalid`)
    || (person && person.authUserId !== ids.adminUserId)
    || (adminAccess && adminAccess.userId !== ids.adminUserId)
    || (control && control.configuredByAdminUserId !== ids.adminUserId)
    || (
      alert
      && alert.deduplicationKey !== "platform:gate6d_staging_fixture"
    )
    || (
      incident
      && incident.deduplicationKey !== "incident:gate6d_staging_fixture"
    )
    || schedules.some(
      (schedule) => schedule.createdByAdminUserId !== ids.adminUserId,
    )
    || jobs.some((job) => job.createdByAdminUserId !== ids.adminUserId)
  ) {
    throw new Error(
      "Gate 6D fixture ownership check rejected a reserved-ID collision.",
    );
  }
}

function nonFixtureWhere(table: string) {
  const ids = platformOperationsGate6dFixtureIds;
  const text = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const uuid = (value: string) => `${text(value)}::uuid`;
  if (table === "user") {
    return `WHERE row_value."id" <> ${text(ids.adminUserId)}`;
  }
  if (table === "Person") {
    return `WHERE row_value."id" <> ${uuid(ids.adminPersonId)}`;
  }
  if (table === "AdminAccess") {
    return `WHERE row_value."id" <> ${uuid(ids.adminAccessId)}`;
  }
  if (table === "PlatformJobSchedule") {
    return `WHERE row_value."createdByAdminUserId" <> ${text(ids.adminUserId)}`;
  }
  if (table === "PlatformJob") {
    return `WHERE row_value."createdByAdminUserId" IS DISTINCT FROM ${text(ids.adminUserId)}`;
  }
  if (table === "PlatformJobAttempt") {
    return `WHERE NOT EXISTS (
      SELECT 1 FROM "PlatformJob" AS fixture_job
      WHERE fixture_job."id" = row_value."jobId"
        AND fixture_job."createdByAdminUserId" = ${text(ids.adminUserId)}
    )`;
  }
  if (table === "PlatformJobMutation") {
    return `WHERE row_value."actorAdminUserId" <> ${text(ids.adminUserId)}`;
  }
  if (table === "DistributedRateLimitBucket") {
    return `WHERE row_value."keyHash" NOT IN (
      ${text(ids.rateBucketKeyHash)},
      ${text(rateLimitSmokeBucketKeyHash())}
    )`;
  }
  if (table === "PlatformRuntimeControl") {
    return `WHERE NOT (
      row_value."id" = ${text(PLATFORM_RUNTIME_CONTROL_ID)}
      AND row_value."configuredByAdminUserId" = ${text(ids.adminUserId)}
    )`;
  }
  if (table === "PlatformRuntimeInvocation") {
    return `WHERE row_value."id" <> ${uuid(ids.invocationId)}`;
  }
  if (table === "PlatformAlert") {
    return `WHERE row_value."id" <> ${uuid(ids.alertId)}`;
  }
  if (table === "PlatformAlertHistory") {
    return `WHERE row_value."alertId" <> ${uuid(ids.alertId)}`;
  }
  if (table === "PlatformIncident") {
    return `WHERE row_value."id" <> ${uuid(ids.incidentId)}`;
  }
  if (table === "PlatformIncidentHistory") {
    return `WHERE row_value."incidentId" <> ${uuid(ids.incidentId)}`;
  }
  if (table === "PlatformOperationMutation") {
    return `WHERE row_value."actorAdminUserId" <> ${text(ids.adminUserId)}`;
  }
  if (table === "AdminAuditLog") {
    return `WHERE row_value."adminUserId" <> ${text(ids.adminUserId)}`;
  }
  return "";
}

export function rateLimitSmokeBucketKeyHash() {
  const input = PLATFORM_OPERATIONS_GATE6D_RATE_LIMIT_SMOKE;
  return distributedRateLimitKeyHash(
    input.scope,
    input.identifier,
    input.options,
  );
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]),
    );
  }
  return value;
}
