import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { PLATFORM_JOB_LIMITS } from "../../../features/platform-jobs/domain/contracts";
import { PlatformJobDomainError } from "../../../features/platform-jobs/domain/errors";
import { platformHealthPayload } from "../../../features/platform-jobs/domain/registry";
import type { PlatformJobAdminContext } from "../../../features/platform-jobs/services/admin-context";
import { setPlatformJobHandlerForTests } from "../../../features/platform-jobs/services/handlers";
import { enqueuePlatformJob } from "../../../features/platform-jobs/services/jobs";
import {
  runAutomaticPlatformSchedulerTick,
  setPlatformJobScheduleEnabled,
} from "../../../features/platform-jobs/services/schedules";
import {
  bootstrapPlatformSchedules,
  initializePlatformRuntime,
  setPlatformRuntimeEnabled,
} from "../../../features/platform-operations/services/admin";
import {
  acknowledgePlatformAlert,
  acknowledgePlatformIncident,
  createPlatformIncident,
  resolvePlatformAlert,
  resolvePlatformIncident,
} from "../../../features/platform-operations/services/lifecycle";
import {
  getPlatformAlertDetail,
  getPlatformOperationsOverview,
  listPlatformAlerts,
} from "../../../features/platform-operations/services/queries";
import {
  assertPlatformRuntimeInvocationOwned,
  type PlatformRuntimeAuthority,
} from "../../../features/platform-operations/services/runtime-authority";
import {
  PlatformRuntimeError,
  PLATFORM_RUNTIME_CONTROL_ID,
  runPlatformRuntimeCycle,
} from "../../../features/platform-operations/services/runtime";
import { prisma } from "../../../lib/db/prisma";
import { consumeRateLimit } from "../../../lib/security/rate-limit";
import {
  cleanupPlatformOperationsGate6dFixture,
  platformOperationsGate6dCleanupTotal,
  seedPlatformOperationsGate6dFixture,
} from "../../../scripts/staging/platform-operations-gate6d-fixture";

const fixture = {
  adminAccessId: "6d000000-0000-4000-8000-000000000001",
  personId: "6d000000-0000-4000-8000-000000000002",
  userId: "gate6d.integration.admin",
};
const context: PlatformJobAdminContext = {
  adminAccessId: fixture.adminAccessId,
  personId: fixture.personId,
  source: "database",
  userId: fixture.userId,
};
const permissions = [
  "PLATFORM_JOBS_VIEW",
  "PLATFORM_JOBS_MANAGE",
  "PLATFORM_OPERATIONS_VIEW",
  "PLATFORM_OPERATIONS_MANAGE",
  "COMMERCE_ORDERS_MANAGE",
] as const;
const rateSecret =
  "gate6d-distributed-rate-secret-2026-A9!zQ7#mV4@pL2";
let previousRateBackend: string | undefined;
let previousAuthSecret: string | undefined;

test.before(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required for Gate 6D integration tests.");
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  assert.match(
    databaseName,
    /(?:_test|test_)/u,
    `Refusing Gate 6D integration tests against ${databaseName}`,
  );
  process.env.REZNO_ADMIN_EMAILS = "";
  previousRateBackend = process.env.REZNO_RATE_LIMIT_BACKEND;
  previousAuthSecret = process.env.BETTER_AUTH_SECRET;
  process.env.REZNO_RATE_LIMIT_BACKEND = "postgres";
  process.env.BETTER_AUTH_SECRET = rateSecret;
  await cleanupGate6D();
  await prisma.adminAccess.deleteMany({ where: { id: fixture.adminAccessId } });
  await prisma.person.deleteMany({ where: { id: fixture.personId } });
  await prisma.user.deleteMany({ where: { id: fixture.userId } });
  await prisma.user.create({
    data: {
      email: "gate6d-integration@rezno.test",
      emailVerified: true,
      id: fixture.userId,
      name: "Gate 6D Admin",
    },
  });
  await prisma.person.create({
    data: {
      authUserId: fixture.userId,
      firstName: "Gate6D",
      id: fixture.personId,
      isOnboarded: true,
      status: "ACTIVE",
    },
  });
  await prisma.adminAccess.create({
    data: {
      id: fixture.adminAccessId,
      permissions: [...permissions],
      role: "ADMIN",
      status: "ACTIVE",
      userId: fixture.userId,
    },
  });
});

test.beforeEach(async () => {
  await cleanupGate6D();
  await prisma.adminAccess.update({
    where: { id: fixture.adminAccessId },
    data: { permissions: [...permissions], status: "ACTIVE" },
  });
});

test.after(async () => {
  await cleanupGate6D();
  await prisma.adminAccess.deleteMany({ where: { id: fixture.adminAccessId } });
  await prisma.person.deleteMany({ where: { id: fixture.personId } });
  await prisma.user.deleteMany({ where: { id: fixture.userId } });
  restoreEnvironment("REZNO_RATE_LIMIT_BACKEND", previousRateBackend);
  restoreEnvironment("BETTER_AUTH_SECRET", previousAuthSecret);
  await prisma.$disconnect();
});

test("Migration 49 remains healthy in the 51-migration chain and creates no Gate 6D operational rows", async () => {
  const [health] = await prisma.$queryRaw<Array<{
    applied: bigint;
    failed: bigint;
    total: bigint;
  }>>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (
        WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
      ) AS applied,
      COUNT(*) FILTER (
        WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
      ) AS failed,
      COUNT(*) AS total
    FROM "_prisma_migrations"
  `);
  assert.deepEqual(
    health,
    { applied: BigInt(51), failed: BigInt(0), total: BigInt(51) },
  );
  assert.equal(await prisma.distributedRateLimitBucket.count(), 0);
  assert.equal(await prisma.platformRuntimeControl.count(), 0);
  assert.equal(await prisma.platformRuntimeInvocation.count(), 0);
  assert.equal(await prisma.platformAlert.count(), 0);
  assert.equal(await prisma.platformIncident.count(), 0);
  assert.equal(await prisma.platformOperationMutation.count(), 0);
});

test("distributed PostgreSQL consumption grants one shared allowance across concurrent callers", async () => {
  const rawIdentity = `person:${randomUUID()}:organization:${randomUUID()}`;
  const attempts = await Promise.all(
    Array.from(
      { length: 30 },
      () => consumeRateLimit(
        "gate6d.integration.multi-instance",
        rawIdentity,
        { limit: 10, windowMs: 60_000 },
      ),
    ),
  );
  assert.equal(attempts.filter((item) => item.success).length, 10);
  assert.equal(attempts.filter((item) => !item.success).length, 20);
  assert.equal(attempts.some((item) => item.unavailable), false);
  assert.equal(
    attempts
      .filter((item) => !item.success)
      .every((item) => item.retryAfterSeconds >= 1 && item.retryAfterSeconds <= 60),
    true,
  );

  const [bucket] = await prisma.distributedRateLimitBucket.findMany();
  assert.ok(bucket);
  assert.equal(bucket.count, 11);
  assert.match(bucket.keyHash, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(bucket).includes(rawIdentity), false);

  const changedPolicy = await consumeRateLimit(
    "gate6d.integration.multi-instance",
    rawIdentity,
    { limit: 11, windowMs: 60_000 },
  );
  assert.equal(changedPolicy.success, true);
  assert.equal(await prisma.distributedRateLimitBucket.count(), 2);
});

test("runtime and schedule initialization are race-safe, exact replayable, and disabled by default", async () => {
  const runtimeKey = randomUUID();
  const runtimeResults = await Promise.all([
    initializePlatformRuntime(context, runtimeKey),
    initializePlatformRuntime(context, runtimeKey),
  ]);
  assert.deepEqual(
    runtimeResults.map((result) => result.replay).sort(),
    [false, true],
  );
  const control = await currentRuntimeControl();
  assert.equal(control.state, "DISABLED");

  const scheduleKey = randomUUID();
  const scheduleResults = await Promise.all([
    bootstrapPlatformSchedules(context, scheduleKey),
    bootstrapPlatformSchedules(context, scheduleKey),
  ]);
  assert.deepEqual(
    scheduleResults.map((result) => result.replay).sort(),
    [false, true],
  );
  assert.equal(await prisma.platformJobSchedule.count(), 13);
  assert.equal(
    await prisma.platformJobSchedule.count({ where: { enabled: true } }),
    0,
  );
  await assert.rejects(
    setPlatformRuntimeEnabled(context, {
      enabled: true,
      expectedVersion: 1,
      idempotencyKey: runtimeKey,
    }),
    domainCode("IDEMPOTENCY_CONFLICT"),
  );
});

test("Gate 6D staging fixture seeds deterministically and cleans exact rows twice", async () => {
  const first = await seedPlatformOperationsGate6dFixture(prisma);
  const second = await seedPlatformOperationsGate6dFixture(prisma);
  assert.deepEqual(second, first);
  assert.equal(first.counts.schedules, 13);
  assert.equal(first.counts.runtimeControls, 1);
  assert.equal(first.counts.runtimeInvocations, 1);
  assert.equal(first.counts.alertHistory, 1);
  assert.equal(first.counts.incidentHistory, 1);
  assert.equal(first.counts.operationMutations, 1);
  const cleanup = await cleanupPlatformOperationsGate6dFixture(prisma);
  assert.equal(platformOperationsGate6dCleanupTotal(cleanup) > 0, true);
  const replay = await cleanupPlatformOperationsGate6dFixture(prisma);
  assert.equal(platformOperationsGate6dCleanupTotal(replay), 0);
});

test("automatic runtime records a truthful monitor phase and rejects token replay", async () => {
  await initializePlatformRuntime(context, randomUUID());
  const initialized = await currentRuntimeControl();
  await setPlatformRuntimeEnabled(context, {
    enabled: true,
    expectedVersion: initialized.version,
    idempotencyKey: randomUUID(),
  });
  const firstIdentity = runtimeIdentity("first");
  const first = await runPlatformRuntimeCycle(firstIdentity);
  assert.equal(first.state, "SUCCEEDED");
  assert.deepEqual(first.monitor, { state: "NOT_CLAIMED" });
  const firstStored = await prisma.platformRuntimeInvocation.findUniqueOrThrow({
    where: { id: first.invocationId },
  });
  assert.deepEqual(firstStored.monitorResult, { state: "NOT_CLAIMED" });
  assert.ok(firstStored.monitorCompletedAt);
  await assert.rejects(
    runPlatformRuntimeCycle(firstIdentity),
    runtimeCode("TOKEN_REPLAY"),
  );

  await bootstrapPlatformSchedules(context, randomUUID());
  const schedule = await prisma.platformJobSchedule.findFirstOrThrow({
    where: { scheduleKey: "PLATFORM_OPERATIONS_MONITOR" },
  });
  await setPlatformJobScheduleEnabled(context, {
    enabled: true,
    expectedVersion: schedule.version,
    idempotencyKey: randomUUID(),
    scheduleId: schedule.id,
  });
  await prisma.platformJobSchedule.update({
    where: { id: schedule.id },
    data: { nextRunAt: new Date(Date.now() - 1_000) },
  });

  await enqueueHealthJobs(
    PLATFORM_JOB_LIMITS.maxWorkerBatch * 3 + 1,
    {
      availableAt: new Date(Date.now() - 10 * 60_000),
      prefix: "gate6d-overdue-overflow",
    },
  );
  const monitored = await runPlatformRuntimeCycle(runtimeIdentity("monitor"));
  assert.equal(monitored.monitor.state, "SUCCEEDED");
  assert.equal(monitored.worker.claimed, PLATFORM_JOB_LIMITS.maxWorkerBatch * 3);
  assert.equal(monitored.worker.remainingAvailable, 2);
  assert.equal(
    await prisma.platformJob.count({
      where: {
        jobType: "PLATFORM_OPERATIONS_MONITOR",
        status: "SUCCEEDED",
      },
    }),
    1,
  );
  const alert = await prisma.platformAlert.findUnique({
    where: { deduplicationKey: "platform:overdue_jobs" },
  });
  assert.ok(alert);
  assert.equal(alert.state, "OPEN");
  assert.equal(
    await prisma.platformAlertHistory.count({
      where: { alertId: alert.id, event: "OPENED", source: "RUNTIME" },
    }),
    1,
  );
});

test("automatic runtime drains the steady-state scheduled burst without leaving backlog", async () => {
  await initializePlatformRuntime(context, randomUUID());
  const initialized = await currentRuntimeControl();
  await setPlatformRuntimeEnabled(context, {
    enabled: true,
    expectedVersion: initialized.version,
    idempotencyKey: randomUUID(),
  });

  const scheduledBurst = 17;
  const schedule = await createHealthScheduleFixture();
  await enqueueHealthJobs(scheduledBurst, {
    availableAt: new Date(Date.now() - 60_000),
    prefix: "gate6d-runtime-burst",
    scheduleId: schedule.id,
    source: "SCHEDULE",
  });

  const result = await runPlatformRuntimeCycle(runtimeIdentity("steady-burst"));

  assert.equal(result.state, "SUCCEEDED");
  assert.equal(result.worker.claimed, scheduledBurst);
  assert.equal(result.worker.succeeded, scheduledBurst);
  assert.equal(result.worker.batchesRun, 2);
  assert.equal(result.worker.remainingAvailable, 0);
  assert.equal(
    await prisma.platformJob.count({
      where: { jobType: "PLATFORM_HEALTH_PROBE", status: "AVAILABLE" },
    }),
    0,
  );
  assert.equal(
    await prisma.platformAlert.count({ where: { state: "OPEN" } }),
    0,
  );
});

test("automatic runtime drains all thirteen platform schedules before monitor reconciliation", async () => {
  await ensureRuntimeEnabled();
  await bootstrapPlatformSchedules(context, randomUUID());
  const schedules = await prisma.platformJobSchedule.findMany({
    orderBy: { scheduleKey: "asc" },
  });
  assert.equal(schedules.length, 13);
  const now = new Date();
  for (const schedule of schedules) {
    await setPlatformJobScheduleEnabled(context, {
      enabled: true,
      expectedVersion: schedule.version,
      idempotencyKey: randomUUID(),
      scheduleId: schedule.id,
    });
    await prisma.platformJobSchedule.update({
      where: { id: schedule.id },
      data: {
        nextRunAt: new Date(
          now.getTime() - schedule.cadenceSeconds * 1_000 - 1_000,
        ),
      },
    });
  }

  const result = await runPlatformRuntimeCycle(runtimeIdentity("scheduler-drain"));

  assert.equal(result.state, "SUCCEEDED");
  assert.equal(result.scheduler.batchesRun, 2);
  assert.equal(result.scheduler.schedulesProcessed, schedules.length);
  assert.equal(
    result.scheduler.batches.every(
      (batch) => batch.schedulesProcessed <= PLATFORM_JOB_LIMITS.maxSchedulerBatch,
    ),
    true,
  );
  assert.equal(result.worker.claimed, result.scheduler.jobsCreated);
  assert.equal(result.worker.remainingAvailable, 0);
  assert.equal(
    await prisma.platformJobSchedule.count({
      where: {
        enabled: true,
        nextRunAt: { lte: new Date(Date.now() - 60_000) },
      },
    }),
    0,
  );
  assert.equal(
    await prisma.platformAlert.count({ where: { state: "OPEN" } }),
    0,
  );
  const stored = await prisma.platformRuntimeInvocation.findUniqueOrThrow({
    where: { id: result.invocationId },
  });
  assert.deepEqual(stored.schedulerResult, result.scheduler);
});

test("automatic runtime drains bounded worker batches across boundary counts", async (t) => {
  const cases = [
    { batches: 1, count: 5, label: "baseline-five" },
    { batches: 1, count: 8, label: "old-fixed-limit-regression" },
    {
      batches: 1,
      count: PLATFORM_JOB_LIMITS.maxWorkerBatch,
      label: "max-worker-batch",
    },
    {
      batches: 2,
      count: PLATFORM_JOB_LIMITS.maxWorkerBatch + 1,
      label: "max-worker-batch-plus-one",
    },
    { batches: 2, count: 17, label: "stage9b-real-burst" },
  ];

  for (const item of cases) {
    await t.test(item.label, async () => {
      await cleanupGate6D();
      await ensureRuntimeEnabled();
      const schedule = await createHealthScheduleFixture();
      await enqueueHealthJobs(item.count, {
        availableAt: new Date(Date.now() - 60_000),
        prefix: item.label,
        scheduleId: schedule.id,
        source: "SCHEDULE",
      });

      const result = await runPlatformRuntimeCycle(runtimeIdentity(item.label));

      assert.equal(result.worker.claimed, item.count);
      assert.equal(result.worker.succeeded, item.count);
      assert.equal(result.worker.failed, 0);
      assert.equal(result.worker.retryWait, 0);
      assert.equal(result.worker.deadLettered, 0);
      assert.equal(result.worker.batchesRun, item.batches);
      assert.equal(result.worker.remainingAvailable, 0);
      assert.equal(result.worker.stopReason, "DRAINED");
      assert.equal(
        await prisma.platformJob.count({ where: { status: "AVAILABLE" } }),
        0,
      );
      assert.equal(
        await prisma.platformJobAttempt.count(),
        item.count,
      );
    });
  }
});

test("automatic runtime leaves explicit overflow for the next bounded cycle and reconciles alerts after drain", async () => {
  await ensureRuntimeEnabled();
  const total = PLATFORM_JOB_LIMITS.maxWorkerBatch * 3 + 4;
  await enqueueHealthJobs(total, {
    availableAt: new Date(Date.now() - 10 * 60_000),
    prefix: "gate6d-overflow-drain",
  });

  const first = await runPlatformRuntimeCycle(runtimeIdentity("overflow-one"));
  assert.equal(first.worker.claimed, PLATFORM_JOB_LIMITS.maxWorkerBatch * 3);
  assert.equal(first.worker.remainingAvailable, 4);
  assert.equal(first.worker.stopReason, "MAX_JOBS_REACHED");
  assert.equal(
    await prisma.platformJob.count({ where: { status: "AVAILABLE" } }),
    4,
  );
  const alert = await prisma.platformAlert.findUniqueOrThrow({
    where: { deduplicationKey: "platform:overdue_jobs" },
  });
  assert.equal(alert.state, "OPEN");

  const second = await runPlatformRuntimeCycle(runtimeIdentity("overflow-two"));
  assert.equal(second.worker.claimed, 4);
  assert.equal(second.worker.succeeded, 4);
  assert.equal(second.worker.remainingAvailable, 0);
  assert.equal(second.worker.stopReason, "DRAINED");
  assert.equal(
    await prisma.platformJob.count({ where: { status: "AVAILABLE" } }),
    0,
  );
  const resolved = await prisma.platformAlert.findUniqueOrThrow({
    where: { deduplicationKey: "platform:overdue_jobs" },
  });
  assert.equal(resolved.state, "RESOLVED");
});

test("automatic runtime records retryable and terminal failures without losing the rest of the drain", async () => {
  await ensureRuntimeEnabled();
  const ids = await enqueueHealthJobs(8, {
    availableAt: new Date(Date.now() - 60_000),
    prefix: "gate6d-failure-drain",
  });
  const retryableJobId = ids[1]!;
  const terminalJobId = ids[4]!;
  setPlatformJobHandlerForTests("PLATFORM_HEALTH_PROBE", async (_payload, handlerContext) => {
    if (handlerContext.jobId === retryableJobId) {
      return {
        errorCode: "TRANSIENT_FAILURE",
        outcome: "FAILED",
        retryable: true,
      };
    }
    if (handlerContext.jobId === terminalJobId) {
      return {
        errorCode: "PERMANENT_FAILURE",
        outcome: "FAILED",
        retryable: false,
      };
    }
    return {
      metadata: healthResult(handlerContext.fencingToken),
      outcome: "SUCCEEDED",
    };
  });
  try {
    const result = await runPlatformRuntimeCycle(runtimeIdentity("failure-drain"));
    assert.equal(result.worker.claimed, 8);
    assert.equal(result.worker.succeeded, 6);
    assert.equal(result.worker.retryWait, 1);
    assert.equal(result.worker.failed, 1);
    assert.equal(
      await prisma.platformJob.count({ where: { status: "SUCCEEDED" } }),
      6,
    );
    assert.equal(
      await prisma.platformJob.count({ where: { status: "RETRY_WAIT" } }),
      1,
    );
    assert.equal(
      await prisma.platformJob.count({ where: { status: "FAILED" } }),
      1,
    );
  } finally {
    setPlatformJobHandlerForTests("PLATFORM_HEALTH_PROBE", undefined);
  }
});

test("automatic runtime refuses overlapping invocation ownership without duplicate job effects", async () => {
  await ensureRuntimeEnabled();
  await enqueueHealthJobs(12, {
    availableAt: new Date(Date.now() - 60_000),
    prefix: "gate6d-runtime-contention",
  });
  let releaseHandler!: () => void;
  let startedHandler!: () => void;
  const started = new Promise<void>((resolve) => {
    startedHandler = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseHandler = resolve;
  });
  let held = false;
  setPlatformJobHandlerForTests("PLATFORM_HEALTH_PROBE", async (_payload, handlerContext) => {
    if (!held) {
      held = true;
      startedHandler();
      await release;
    }
    return {
      metadata: healthResult(handlerContext.fencingToken),
      outcome: "SUCCEEDED",
    };
  });
  try {
    const first = runPlatformRuntimeCycle(runtimeIdentity("contention-a"));
    await started;
    await assert.rejects(
      runPlatformRuntimeCycle(runtimeIdentity("contention-b")),
      runtimeCode("RUNTIME_BUSY"),
    );
    releaseHandler();
    const result = await first;
    assert.equal(result.worker.claimed, 12);
    assert.equal(result.worker.succeeded, 12);
    assert.equal(
      await prisma.platformJobAttempt.count(),
      12,
    );
  } finally {
    releaseHandler();
    setPlatformJobHandlerForTests("PLATFORM_HEALTH_PROBE", undefined);
  }
});

test("automatic runtime honors the explicit cycle batch bound and preserves remaining work for the next pass", async () => {
  await ensureRuntimeEnabled();
  await enqueueHealthJobs(PLATFORM_JOB_LIMITS.maxWorkerBatch + 1, {
    availableAt: new Date(Date.now() - 10 * 60_000),
    prefix: "gate6d-batch-bound",
  });

  const first = await runPlatformRuntimeCycle(
    runtimeIdentity("bounded-one"),
    { maxWorkerBatches: 1 },
  );
  assert.equal(first.worker.claimed, PLATFORM_JOB_LIMITS.maxWorkerBatch);
  assert.equal(first.worker.batchesRun, 1);
  assert.equal(first.worker.stopReason, "MAX_JOBS_REACHED");
  assert.equal(first.worker.remainingAvailable, 1);
  assert.equal(
    await prisma.platformAlert.count({
      where: {
        deduplicationKey: "platform:overdue_jobs",
        state: "OPEN",
      },
    }),
    1,
  );

  const second = await runPlatformRuntimeCycle(runtimeIdentity("bounded-two"));
  assert.equal(second.worker.claimed, 1);
  assert.equal(second.worker.remainingAvailable, 0);
  const alert = await prisma.platformAlert.findUniqueOrThrow({
    where: { deduplicationKey: "platform:overdue_jobs" },
  });
  assert.equal(alert.state, "RESOLVED");
});

test("automatic runtime stops before claiming jobs when the cycle deadline is already unsafe", async () => {
  await ensureRuntimeEnabled();
  await enqueueHealthJobs(5, {
    availableAt: new Date(Date.now() - 10 * 60_000),
    prefix: "gate6d-deadline-bound",
  });

  const result = await runPlatformRuntimeCycle(
    runtimeIdentity("deadline-bound"),
    {
      deadlineAt: new Date(Date.now()),
      nowMs: () => Date.now(),
    },
  );

  assert.equal(result.worker.claimed, 0);
  assert.equal(result.worker.batchesRun, 0);
  assert.equal(result.worker.stopReason, "DEADLINE_APPROACHING");
  assert.equal(result.worker.remainingAvailable, 5);
  assert.equal(
    await prisma.platformJobAttempt.count(),
    0,
  );
  assert.equal(
    await prisma.platformJob.count({ where: { status: "AVAILABLE" } }),
    5,
  );
});

test("runtime generation fences stale scheduler and worker authority after disable", async () => {
  await initializePlatformRuntime(context, randomUUID());
  const initialized = await currentRuntimeControl();
  await setPlatformRuntimeEnabled(context, {
    enabled: true,
    expectedVersion: initialized.version,
    idempotencyKey: randomUUID(),
  });
  const enabled = await currentRuntimeControl();
  const authorityA = await createRuntimeAuthority(enabled.generation);
  await prisma.$transaction((transaction) =>
    assertPlatformRuntimeInvocationOwned(transaction, authorityA));

  await setPlatformRuntimeEnabled(context, {
    enabled: false,
    expectedVersion: enabled.version,
    idempotencyKey: randomUUID(),
  });
  const disabled = await currentRuntimeControl();
  await assert.rejects(
    prisma.$transaction((transaction) =>
      assertPlatformRuntimeInvocationOwned(transaction, authorityA)),
    domainCode("STALE_LEASE"),
  );

  await setPlatformRuntimeEnabled(context, {
    enabled: true,
    expectedVersion: disabled.version,
    idempotencyKey: randomUUID(),
  });
  const reenabled = await currentRuntimeControl();
  const authorityB = await createRuntimeAuthority(reenabled.generation);
  await prisma.$transaction((transaction) =>
    assertPlatformRuntimeInvocationOwned(transaction, authorityB));
  await assert.rejects(
    runAutomaticPlatformSchedulerTick(authorityA),
    domainCode("STALE_LEASE"),
  );
});

test("concurrent automatic scheduler ticks emit one canonical occurrence", async () => {
  await initializePlatformRuntime(context, randomUUID());
  const initialized = await currentRuntimeControl();
  await setPlatformRuntimeEnabled(context, {
    enabled: true,
    expectedVersion: initialized.version,
    idempotencyKey: randomUUID(),
  });
  const enabled = await currentRuntimeControl();
  await bootstrapPlatformSchedules(context, randomUUID());
  const schedule = await prisma.platformJobSchedule.findFirstOrThrow({
    where: { scheduleKey: "PLATFORM_OPERATIONS_MONITOR" },
  });
  await setPlatformJobScheduleEnabled(context, {
    enabled: true,
    expectedVersion: schedule.version,
    idempotencyKey: randomUUID(),
    scheduleId: schedule.id,
  });
  await prisma.platformJobSchedule.update({
    where: { id: schedule.id },
    data: { nextRunAt: new Date(Date.now() - 1_000) },
  });
  const authority = await createRuntimeAuthority(enabled.generation);
  const ticks = await Promise.all([
    runAutomaticPlatformSchedulerTick(authority),
    runAutomaticPlatformSchedulerTick(authority),
  ]);
  assert.equal(ticks.reduce((sum, tick) => sum + tick.jobsCreated, 0), 1);
  assert.equal(
    await prisma.platformJob.count({ where: { scheduleId: schedule.id } }),
    1,
  );
});

test("alert and incident lifecycle serializes replay, version races, revocation, and immutable history", async () => {
  const alert = await createAlert("lifecycle");
  const acknowledgeKey = randomUUID();
  const acknowledged = await Promise.all([
    acknowledgePlatformAlert(context, {
      expectedVersion: alert.version,
      idempotencyKey: acknowledgeKey,
      targetId: alert.id,
    }),
    acknowledgePlatformAlert(context, {
      expectedVersion: alert.version,
      idempotencyKey: acknowledgeKey,
      targetId: alert.id,
    }),
  ]);
  assert.deepEqual(
    acknowledged.map((result) => result.replay).sort(),
    [false, true],
  );

  const currentAlert = await prisma.platformAlert.findUniqueOrThrow({
    where: { id: alert.id },
  });
  const incidentKey = randomUUID();
  const incidents = await Promise.all([
    createPlatformIncident(context, {
      expectedVersion: currentAlert.version,
      idempotencyKey: incidentKey,
      targetId: alert.id,
    }),
    createPlatformIncident(context, {
      expectedVersion: currentAlert.version,
      idempotencyKey: incidentKey,
      targetId: alert.id,
    }),
  ]);
  assert.deepEqual(
    incidents.map((result) => result.replay).sort(),
    [false, true],
  );
  const incident = await prisma.platformIncident.findUniqueOrThrow({
    where: { sourceAlertId: alert.id },
  });

  const raced = await Promise.allSettled([
    acknowledgePlatformIncident(context, {
      expectedVersion: incident.version,
      idempotencyKey: randomUUID(),
      targetId: incident.id,
    }),
    acknowledgePlatformIncident(context, {
      expectedVersion: incident.version,
      idempotencyKey: randomUUID(),
      targetId: incident.id,
    }),
  ]);
  assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(raced.filter((result) => result.status === "rejected").length, 1);

  const currentIncident = await prisma.platformIncident.findUniqueOrThrow({
    where: { id: incident.id },
  });
  await resolvePlatformIncident(context, {
    expectedVersion: currentIncident.version,
    idempotencyKey: randomUUID(),
    targetId: incident.id,
  });
  await assert.rejects(
    prisma.platformIncidentHistory.updateMany({
      where: { incidentId: incident.id },
      data: { metadata: { changed: true } },
    }),
  );
  await assert.rejects(
    prisma.platformAlertHistory.deleteMany({ where: { alertId: alert.id } }),
  );

  const revocationAlert = await createAlert("revocation");
  await prisma.adminAccess.update({
    where: { id: fixture.adminAccessId },
    data: { permissions: ["PLATFORM_OPERATIONS_VIEW"] },
  });
  await assert.rejects(
    resolvePlatformAlert(context, {
      expectedVersion: revocationAlert.version,
      idempotencyKey: randomUUID(),
      targetId: revocationAlert.id,
    }),
    domainCode("FORBIDDEN"),
  );
  assert.equal(
    (await prisma.platformAlert.findUniqueOrThrow({
      where: { id: revocationAlert.id },
    })).state,
    "OPEN",
  );
});

test("overview, provider truth, and signed pagination remain bounded and redacted", async () => {
  await Promise.all([
    createAlert("page-a"),
    createAlert("page-b"),
  ]);
  const overview = await getPlatformOperationsOverview(context);
  assert.equal(overview.rateLimit.backend, "POSTGRESQL");
  assert.equal(overview.rateLimit.availability, "AVAILABLE");
  assert.equal(overview.runtime.connection, "NOT_CONNECTED");
  assert.deepEqual(overview.providers, {
    communications: "NOT_CONFIGURED",
    payment: "NOT_CONFIGURED",
    storage: "NOT_CONFIGURED",
  });
  assert.deepEqual(
    [
      "activeLeases",
      "activeRateBuckets",
      "communicationBacklog",
      "communicationFailures",
      "deadLetteredJobs",
      "delayedSchedules",
      "disabledSchedules",
      "expiredLeases",
      "expiredRateBuckets",
      "openAlerts",
      "openIncidents",
      "overdueJobs",
      "paymentBacklog",
      "renditionBacklog",
      "retryWaitJobs",
      "runtimeStale",
      "settlementGenerationStale",
      "storageBacklog",
    ].every((key) => key in overview.metrics),
    true,
  );
  assert.equal(
    JSON.stringify(overview).includes(process.env.DATABASE_URL ?? "never"),
    false,
  );
  const first = await listPlatformAlerts(context, { limit: 1 });
  assert.equal(first.items.length, 1);
  assert.ok(first.nextCursor);
  const second = await listPlatformAlerts(context, {
    cursor: first.nextCursor ?? undefined,
    limit: 1,
  });
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0]?.id, first.items[0]?.id);
  const forged = `${first.nextCursor?.slice(0, -1)}A`;
  await assert.rejects(
    listPlatformAlerts(context, { cursor: forged, limit: 1 }),
    domainCode("INVALID_CURSOR"),
  );
  for (const item of [...first.items, ...second.items]) {
    assert.equal("deduplicationKey" in item, false);
    assert.equal("acknowledgedByAdminId" in item, false);
    assert.equal("resolvedByPersonId" in item, false);
  }

  const unsafeObservation = await createAlert("unsafe-observation");
  await prisma.platformAlert.update({
    where: { id: unsafeObservation.id },
    data: {
      observation: {
        count: 1,
        rawProviderPayload: "must-not-cross-the-DTO",
        saturated: false,
      },
    },
  });
  await assert.rejects(
    getPlatformAlertDetail(context, unsafeObservation.id),
    domainCode("CONFLICT"),
  );
});

test("Migration 49 constraints, append-only triggers, and due indexes enforce the closed truth table", async () => {
  await assert.rejects(
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO "DistributedRateLimitBucket" (
        "keyHash",
        "keyVersion",
        "count",
        "windowStartedAt",
        "resetAt",
        "expiresAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${"f".repeat(64)},
        1,
        0,
        clock_timestamp(),
        clock_timestamp() + INTERVAL '1 minute',
        clock_timestamp() + INTERVAL '2 minutes',
        clock_timestamp(),
        clock_timestamp()
      )
    `),
  );
  const indexes = await prisma.$queryRaw<Array<{
    indexdef: string;
    indexname: string;
  }>>(Prisma.sql`
    SELECT "indexname", "indexdef"
    FROM "pg_indexes"
    WHERE "schemaname" = current_schema()
      AND "tablename" IN (
        'DistributedRateLimitBucket',
        'PlatformRuntimeInvocation',
        'PlatformAlert',
        'PlatformIncident'
      )
  `);
  const definitions = indexes
    .map((index) => index.indexdef.replaceAll('"', ""))
    .join("\n");
  assert.match(
    definitions,
    /DistributedRateLimitBucket_expiresAt_keyHash_idx.*expiresAt, keyHash/u,
  );
  assert.match(
    definitions,
    /PlatformRuntimeInvocation_state_leaseExpiresAt_id_idx.*state, leaseExpiresAt, id/u,
  );
  assert.match(
    definitions,
    /PlatformAlert_createdAt_id_idx.*createdAt, id/u,
  );
  assert.match(
    definitions,
    /PlatformIncident_createdAt_id_idx.*createdAt, id/u,
  );
});

async function createAlert(label: string) {
  const now = new Date();
  const alert = await prisma.platformAlert.create({
    data: {
      deduplicationKey: `platform:test_${label.replaceAll("-", "_")}_${randomUUID().replaceAll("-", "")}`,
      domain: "PLATFORM",
      firstObservedAt: now,
      lastObservedAt: now,
      observation: { count: 1, saturated: false },
      rule: "OVERDUE_JOBS",
      severity: "WARNING",
      summaryCode: "platform_jobs_overdue",
    },
  });
  await prisma.platformAlertHistory.create({
    data: {
      actorAdminUserId: fixture.userId,
      actorPersonId: fixture.personId,
      alertId: alert.id,
      event: "OPENED",
      fromState: null,
      metadata: { source: "integration_fixture" },
      source: "ADMIN",
      toState: "OPEN",
    },
  });
  return alert;
}

async function ensureRuntimeEnabled() {
  await initializePlatformRuntime(context, randomUUID());
  const initialized = await currentRuntimeControl();
  await setPlatformRuntimeEnabled(context, {
    enabled: true,
    expectedVersion: initialized.version,
    idempotencyKey: randomUUID(),
  });
}

async function createHealthScheduleFixture() {
  await bootstrapPlatformSchedules(context, randomUUID());
  return prisma.platformJobSchedule.findFirstOrThrow({
    where: { scheduleKey: "PLATFORM_HEALTH_PROBE" },
  });
}

async function enqueueHealthJobs(
  count: number,
  input: {
    availableAt: Date;
    prefix: string;
    scheduleId?: string;
    source?: "ADMIN_MANUAL" | "SCHEDULE";
  },
) {
  const ids: string[] = [];
  await prisma.$transaction(async (transaction) => {
    for (let index = 0; index < count; index += 1) {
      const created = await enqueuePlatformJob(transaction, {
        availableAt: input.availableAt,
        createdByAdminUserId: fixture.userId,
        createdByPersonId: fixture.personId,
        deduplicationKey: `${input.prefix}:${index}:${randomUUID()}`,
        jobType: "PLATFORM_HEALTH_PROBE",
        payload: platformHealthPayload(),
        payloadVersion: 1,
        scheduleId: input.scheduleId,
        source: input.source ?? "ADMIN_MANUAL",
      });
      ids.push(created.job.id);
    }
  });
  return ids;
}

function healthResult(fencingToken: bigint) {
  return {
    executionGeneration: fencingToken.toString(),
    kind: "PLATFORM_HEALTHY" as const,
    payloadVersion: 1 as const,
  };
}

async function createRuntimeAuthority(
  controlGeneration: bigint,
): Promise<PlatformRuntimeAuthority> {
  const id = randomUUID();
  const leaseToken = randomUUID();
  const workerId = `runtime:${id}`;
  await prisma.platformRuntimeInvocation.create({
    data: {
      controlGeneration,
      controlId: PLATFORM_RUNTIME_CONTROL_ID,
      eventName: "schedule",
      fencingToken: BigInt(1),
      gitRefHash: hash(`ref:${id}`),
      id,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      leaseToken,
      provider: "GITHUB_ACTIONS_SCHEDULED_HTTP",
      repositorySha: "a".repeat(40),
      requestedAt: new Date(),
      tokenJtiHash: hash(`jti:${id}`),
      workerId,
      workflowRefHash: hash(`workflow:${id}`),
    },
  });
  return {
    controlGeneration,
    fencingToken: BigInt(1),
    invocationId: id,
    jobType: "PLATFORM_HEALTH_PROBE",
    kind: "RUNTIME_INVOCATION",
    leaseToken,
    workerId,
  };
}

function currentRuntimeControl() {
  return prisma.platformRuntimeControl.findUniqueOrThrow({
    where: { id: PLATFORM_RUNTIME_CONTROL_ID },
  });
}

function runtimeIdentity(label: string) {
  return {
    eventName: "schedule" as const,
    gitRefHash: hash(`ref:${label}`),
    repositorySha: "a".repeat(40),
    requestedAt: new Date(),
    tokenJtiHash: hash(`jti:${label}:${randomUUID()}`),
    workflowRefHash: hash(`workflow:${label}`),
  };
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function cleanupGate6D() {
  await prisma.$transaction(async (transaction) => {
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
    await transaction.platformOperationMutation.deleteMany();
    await transaction.platformIncidentHistory.deleteMany();
    await transaction.platformAlertHistory.deleteMany();
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
  });
  await prisma.platformIncident.deleteMany();
  await prisma.platformAlert.deleteMany();
  await prisma.platformRuntimeInvocation.deleteMany();
  await prisma.platformRuntimeControl.deleteMany();
  await prisma.distributedRateLimitBucket.deleteMany();
  await prisma.platformJobMutation.deleteMany();
  await prisma.platformJobAttempt.deleteMany();
  await prisma.platformJob.deleteMany({ where: { parentJobId: { not: null } } });
  await prisma.platformJob.deleteMany();
  await prisma.platformJobSchedule.deleteMany();
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function domainCode(code: string) {
  return (error: unknown) => (
    error instanceof PlatformJobDomainError && error.code === code
  );
}

function runtimeCode(code: PlatformRuntimeError["code"]) {
  return (error: unknown) => (
    error instanceof PlatformRuntimeError && error.code === code
  );
}
