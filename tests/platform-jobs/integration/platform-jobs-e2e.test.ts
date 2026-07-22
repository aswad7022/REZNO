import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { setPlatformJobCursorSigningSecretForTests } from "../../../features/platform-jobs/domain/cursor-signing";
import { PlatformJobDomainError } from "../../../features/platform-jobs/domain/errors";
import { platformHealthPayload } from "../../../features/platform-jobs/domain/registry";
import { setPlatformJobAuthorizationTestHook, type PlatformJobAdminContext } from "../../../features/platform-jobs/services/admin-context";
import { claimPlatformJobs, completePlatformJob, enqueuePlatformJob, failPlatformJob, heartbeatPlatformJob, recoverExpiredPlatformJobLeases, startPlatformJob } from "../../../features/platform-jobs/services/jobs";
import { cancelPlatformJob, requeuePlatformJob, triggerPlatformJob } from "../../../features/platform-jobs/services/mutations";
import { getPlatformJobDetail, listPlatformJobs, listPlatformJobSchedules } from "../../../features/platform-jobs/services/queries";
import { createPlatformJobSchedule, runPlatformSchedulerTick, setPlatformJobScheduleEnabled } from "../../../features/platform-jobs/services/schedules";
import { runPlatformJobSerializable } from "../../../features/platform-jobs/services/transaction";
import { runPlatformWorkerBatch, setPlatformWorkerTestHook } from "../../../features/platform-jobs/services/worker";
import { prisma } from "../../../lib/db/prisma";

const fixture = {
  adminAccessId: "66000000-0000-4000-8000-000000000001",
  organizationId: "66000000-0000-4000-8000-000000000002",
  personId: "66000000-0000-4000-8000-000000000003",
  userId: "gate6a.integration.admin",
};
const context: PlatformJobAdminContext = {
  adminAccessId: fixture.adminAccessId,
  personId: fixture.personId,
  source: "database",
  userId: fixture.userId,
};
const cursorSecret = "gate6a-postgres-cursor-secret-with-sufficient-entropy-2026";

test.before(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required for Gate 6A integration tests.");
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  assert.match(databaseName, /(?:_test|test_)/u, `Refusing Gate 6A integration tests against ${databaseName}`);
  process.env.REZNO_ADMIN_EMAILS = "";
  setPlatformJobCursorSigningSecretForTests(cursorSecret);
  await cleanupPlatformRows();
  await prisma.adminAccess.deleteMany({ where: { id: fixture.adminAccessId } });
  await prisma.person.deleteMany({ where: { id: fixture.personId } });
  await prisma.user.deleteMany({ where: { id: fixture.userId } });
  await prisma.organization.deleteMany({ where: { id: fixture.organizationId } });
  await prisma.user.create({ data: { id: fixture.userId, email: "gate6a-integration@rezno.test", emailVerified: true, name: "Gate 6A Admin" } });
  await prisma.person.create({ data: { authUserId: fixture.userId, firstName: "Gate6A", id: fixture.personId, isOnboarded: true, status: "ACTIVE" } });
  await prisma.adminAccess.create({ data: { id: fixture.adminAccessId, permissions: ["PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE"], role: "ADMIN", status: "ACTIVE", userId: fixture.userId } });
  await prisma.organization.create({ data: { id: fixture.organizationId, name: "Gate 6A Fixture", slug: "gate6a-integration-fixture" } });
});

test.afterEach(async () => {
  setPlatformJobAuthorizationTestHook(undefined);
  setPlatformWorkerTestHook(undefined);
  await prisma.adminAccess.updateMany({ where: { id: fixture.adminAccessId }, data: { permissions: ["PLATFORM_JOBS_VIEW", "PLATFORM_JOBS_MANAGE"], status: "ACTIVE" } });
  await cleanupPlatformRows();
});

test.after(async () => {
  setPlatformJobCursorSigningSecretForTests(undefined);
  await cleanupPlatformRows();
  await prisma.adminAccess.deleteMany({ where: { id: fixture.adminAccessId } });
  await prisma.person.deleteMany({ where: { id: fixture.personId } });
  await prisma.user.deleteMany({ where: { id: fixture.userId } });
  await prisma.organization.deleteMany({ where: { id: fixture.organizationId } });
  await prisma.$disconnect();
});

test("migration chain is healthy at 44/44 and Gate 6A creates no rows", async () => {
  const migrationRows = await prisma.$queryRaw<Array<{ applied: bigint; failed: bigint; total: bigint }>>(Prisma.sql`
    SELECT COUNT(*) FILTER (WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL) AS applied,
           COUNT(*) FILTER (WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL) AS failed,
           COUNT(*) AS total
    FROM "_prisma_migrations"
  `);
  assert.deepEqual(migrationRows[0], { applied: BigInt(44), failed: BigInt(0), total: BigInt(44) });
  assert.equal(await prisma.platformJob.count(), 0);
  assert.equal(await prisma.platformJobSchedule.count(), 0);
  assert.equal(await prisma.platformJobAttempt.count(), 0);
  assert.equal(await prisma.platformJobMutation.count(), 0);
});

test("manual trigger is actor-scoped idempotent and rejects a changed replay", async () => {
  const idempotencyKey = randomUUID();
  const first = await triggerPlatformJob(context, { idempotencyKey, jobType: "PLATFORM_HEALTH_PROBE" });
  const replay = await triggerPlatformJob(context, { idempotencyKey, jobType: "PLATFORM_HEALTH_PROBE" });
  assert.equal(first.replay, false);
  assert.deepEqual(replay, { ...first, replay: true });
  assert.equal(await prisma.platformJob.count(), 1);
  assert.equal(await prisma.platformJobMutation.count(), 1);
  await assert.rejects(cancelPlatformJob(context, { expectedVersion: first.version, idempotencyKey, jobId: first.jobId }), code("IDEMPOTENCY_CONFLICT"));
});

test("concurrent workers claim a durable job exactly once with one canonical attempt", async () => {
  const job = await createJob();
  const [left, right] = await Promise.all([
    claimPlatformJobs({ batchSize: 1, workerId: "worker:gate6a:left" }),
    claimPlatformJobs({ batchSize: 1, workerId: "worker:gate6a:right" }),
  ]);
  assert.equal(left.length + right.length, 1);
  const claimed = [...left, ...right][0];
  assert.equal(claimed.id, job.id);
  assert.equal(claimed.attemptCount, 1);
  assert.equal(claimed.fencingToken, BigInt(1));
  assert.match(claimed.leaseToken, /^[0-9a-f-]{36}$/u);
  assert.equal(await prisma.platformJobAttempt.count({ where: { jobId: job.id } }), 1);
});

test("start, heartbeat, completion, exact replay, and stale fencing are atomic", async () => {
  const base = new Date();
  const job = await createJob({ availableAt: new Date(base.getTime() - 1_000) });
  const [claim] = await claimPlatformJobs({ batchSize: 1, leaseSeconds: 60, now: base, workerId: "worker:gate6a:lifecycle" });
  await assert.rejects(startPlatformJob({ fencingToken: claim.fencingToken, jobId: job.id, leaseToken: randomUUID(), now: new Date(base.getTime() + 1_000), workerId: "worker:gate6a:lifecycle" }), code("STALE_LEASE"));
  await assert.rejects(startPlatformJob({ fencingToken: claim.fencingToken + BigInt(1), jobId: job.id, leaseToken: claim.leaseToken, now: new Date(base.getTime() + 1_000), workerId: "worker:gate6a:lifecycle" }), code("STALE_LEASE"));
  await startPlatformJob({ fencingToken: claim.fencingToken, jobId: job.id, leaseToken: claim.leaseToken, now: new Date(base.getTime() + 1_000), workerId: "worker:gate6a:lifecycle" });
  const heartbeat = await heartbeatPlatformJob({ extensionSeconds: 120, fencingToken: claim.fencingToken, jobId: job.id, leaseToken: claim.leaseToken, now: new Date(base.getTime() + 2_000), workerId: "worker:gate6a:lifecycle" });
  assert.equal(heartbeat.leaseExpiresAt.getTime(), base.getTime() + 122_000);
  const result = { executionGeneration: claim.fencingToken.toString(), kind: "PLATFORM_HEALTHY", payloadVersion: 1 };
  await assert.rejects(completePlatformJob({ fencingToken: claim.fencingToken + BigInt(1), jobId: job.id, leaseToken: claim.leaseToken, now: new Date(base.getTime() + 3_000), result, workerId: "worker:gate6a:lifecycle" }), code("STALE_LEASE"));
  assert.deepEqual(await completePlatformJob({ fencingToken: claim.fencingToken, jobId: job.id, leaseToken: claim.leaseToken, now: new Date(base.getTime() + 3_000), result, workerId: "worker:gate6a:lifecycle" }), { replay: false, status: "SUCCEEDED" });
  assert.deepEqual(await completePlatformJob({ fencingToken: claim.fencingToken, jobId: job.id, leaseToken: claim.leaseToken, now: new Date(base.getTime() + 4_000), result, workerId: "worker:gate6a:lifecycle" }), { replay: true, status: "SUCCEEDED" });
  await assert.rejects(completePlatformJob({ fencingToken: claim.fencingToken, jobId: job.id, leaseToken: claim.leaseToken, result: { ...result, executionGeneration: (claim.fencingToken + BigInt(1)).toString() }, workerId: "worker:gate6a:lifecycle" }), code("CONFLICT"));
  await assert.rejects(heartbeatPlatformJob({ extensionSeconds: 30, fencingToken: claim.fencingToken, jobId: job.id, leaseToken: claim.leaseToken, workerId: "worker:gate6a:lifecycle" }), code("STALE_LEASE"));
  const stored = await prisma.platformJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(stored.status, "SUCCEEDED");
  assert.equal(stored.leaseToken, null);
});

test("expired leases recover once, reject stale tokens, retry, and dead-letter at exhaustion", async () => {
  const base = new Date();
  const job = await createJob({ availableAt: new Date(base.getTime() - 1_000), maxAttempts: 2 });
  const [first] = await claimPlatformJobs({ batchSize: 1, leaseSeconds: 30, now: base, workerId: "worker:gate6a:expired" });
  await startPlatformJob({ fencingToken: first.fencingToken, jobId: job.id, leaseToken: first.leaseToken, now: new Date(base.getTime() + 1_000), workerId: "worker:gate6a:expired" });
  assert.deepEqual(await recoverExpiredPlatformJobLeases(new Date(base.getTime() + 29_999), 1), { deadLettered: 0, recovered: 0, retryWait: 0 });
  assert.deepEqual(await claimPlatformJobs({ batchSize: 1, now: new Date(base.getTime() + 29_999), workerId: "worker:gate6a:thief" }), []);
  assert.deepEqual(await recoverExpiredPlatformJobLeases(new Date(base.getTime() + 31_000), 1), { deadLettered: 0, recovered: 1, retryWait: 1 });
  assert.deepEqual(await recoverExpiredPlatformJobLeases(new Date(base.getTime() + 31_000), 1), { deadLettered: 0, recovered: 0, retryWait: 0 });
  await assert.rejects(completePlatformJob({ fencingToken: first.fencingToken, jobId: job.id, leaseToken: first.leaseToken, result: { executionGeneration: first.fencingToken.toString(), kind: "PLATFORM_HEALTHY", payloadVersion: 1 }, workerId: "worker:gate6a:expired" }), code("STALE_LEASE"));
  const retry = await prisma.platformJob.findUniqueOrThrow({ where: { id: job.id } });
  const [second] = await claimPlatformJobs({ batchSize: 1, leaseSeconds: 30, now: new Date(retry.availableAt.getTime() + 1), workerId: "worker:gate6a:second" });
  await startPlatformJob({ fencingToken: second.fencingToken, jobId: job.id, leaseToken: second.leaseToken, now: new Date(retry.availableAt.getTime() + 2), workerId: "worker:gate6a:second" });
  assert.deepEqual(await recoverExpiredPlatformJobLeases(new Date(retry.availableAt.getTime() + 31_001), 1), { deadLettered: 1, recovered: 1, retryWait: 0 });
  const terminal = await prisma.platformJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(terminal.status, "DEAD_LETTERED");
  assert.equal(terminal.lastErrorCode, "LEASE_EXPIRED");
  assert.equal(terminal.attemptCount, 2);
  assert.equal(terminal.fencingToken, BigInt(2));
});

test("safe failure retries registered transient errors and terminates permanent errors", async () => {
  const base = new Date();
  const retrying = await createJob({ availableAt: new Date(base.getTime() - 1_000), maxAttempts: 2 });
  const [first] = await claimPlatformJobs({ batchSize: 1, now: base, workerId: "worker:gate6a:retry" });
  await startPlatformJob({ fencingToken: first.fencingToken, jobId: retrying.id, leaseToken: first.leaseToken, now: new Date(base.getTime() + 1), workerId: "worker:gate6a:retry" });
  const failed = await failPlatformJob({ errorCode: "TRANSIENT_FAILURE", fencingToken: first.fencingToken, jobId: retrying.id, leaseToken: first.leaseToken, now: new Date(base.getTime() + 2), retryable: true, workerId: "worker:gate6a:retry" });
  assert.equal(failed.status, "RETRY_WAIT");
  assert.deepEqual(await failPlatformJob({ errorCode: "TRANSIENT_FAILURE", fencingToken: first.fencingToken, jobId: retrying.id, leaseToken: first.leaseToken, now: new Date(base.getTime() + 3), retryable: true, workerId: "worker:gate6a:retry" }), { replay: true, status: "RETRY_WAIT" });
  await assert.rejects(failPlatformJob({ errorCode: "HANDLER_EXCEPTION", fencingToken: first.fencingToken, jobId: retrying.id, leaseToken: first.leaseToken, retryable: true, workerId: "worker:gate6a:retry" }), code("CONFLICT"));
  const permanent = await createJob({ deduplicationKey: `integration:${randomUUID()}`, maxAttempts: 5 });
  const [claim] = await claimPlatformJobs({ batchSize: 1, workerId: "worker:gate6a:permanent" });
  assert.equal(claim.id, permanent.id);
  await startPlatformJob({ fencingToken: claim.fencingToken, jobId: permanent.id, leaseToken: claim.leaseToken, workerId: "worker:gate6a:permanent" });
  assert.equal((await failPlatformJob({ errorCode: "PERMANENT_FAILURE", fencingToken: claim.fencingToken, jobId: permanent.id, leaseToken: claim.leaseToken, retryable: false, workerId: "worker:gate6a:permanent" })).status, "FAILED");
});

test("cancel and claim race has exactly one winner and never cancels an owned lease", async () => {
  const job = await createJob();
  const [cancelled, claimed] = await Promise.allSettled([
    cancelPlatformJob(context, { expectedVersion: job.version, idempotencyKey: randomUUID(), jobId: job.id }),
    claimPlatformJobs({ batchSize: 1, workerId: "worker:gate6a:cancel-race" }),
  ]);
  const stored = await prisma.platformJob.findUniqueOrThrow({ where: { id: job.id } });
  if (stored.status === "CANCELLED") {
    assert.equal(cancelled.status, "fulfilled");
    assert.equal(claimed.status === "fulfilled" ? claimed.value.length : -1, 0);
  } else {
    assert.equal(stored.status, "CLAIMED");
    assert.equal(claimed.status, "fulfilled");
    assert.equal(claimed.status === "fulfilled" ? claimed.value.length : 0, 1);
    assert.equal(cancelled.status, "rejected");
  }
  assert.ok(["CANCELLED", "CLAIMED"].includes(stored.status));
});

test("manual requeue preserves failed originals and enforces the three-generation root bound", async () => {
  let failed = await createFailedJob();
  const rootId = failed.id;
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    const mutation = await requeuePlatformJob(context, { expectedVersion: failed.version, idempotencyKey: randomUUID(), jobId: failed.id });
    if (mutation.replay) throw new Error("A fresh requeue unexpectedly replayed.");
    assert.equal(mutation.requeueSequence, sequence);
    assert.notEqual(mutation.requeuedJobId, failed.id);
    assert.equal((await prisma.platformJob.findUniqueOrThrow({ where: { id: failed.id } })).status, "FAILED");
    failed = await failExistingJob(mutation.requeuedJobId, `worker:gate6a:requeue:${sequence}`);
    assert.equal(failed.requeueRootJobId, rootId);
  }
  await assert.rejects(requeuePlatformJob(context, { expectedVersion: failed.version, idempotencyKey: randomUUID(), jobId: failed.id }), code("JOB_NOT_REQUEUEABLE"));
  const root = await prisma.platformJob.findUniqueOrThrow({ where: { id: rootId } });
  assert.equal(root.requeueCount, 3);
  assert.equal(await prisma.platformJob.count(), 4);
});

test("concurrent requeue operations have one winner and one durable descendant", async () => {
  const failed = await createFailedJob();
  const results = await Promise.allSettled([
    requeuePlatformJob(context, { expectedVersion: failed.version, idempotencyKey: randomUUID(), jobId: failed.id }),
    requeuePlatformJob(context, { expectedVersion: failed.version, idempotencyKey: randomUUID(), jobId: failed.id }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(await prisma.platformJob.count({ where: { requeueRootJobId: failed.id } }), 1);
  assert.equal((await prisma.platformJob.findUniqueOrThrow({ where: { id: failed.id } })).requeueCount, 1);
});

test("closed schedules are disabled by default and bounded ticks are idempotent with catch-up", async () => {
  const now = new Date();
  const created = await runPlatformJobSerializable((transaction) => createPlatformJobSchedule(transaction, {
    cadenceSeconds: 60,
    catchupLimit: 3,
    createdByAdminUserId: fixture.userId,
    createdByPersonId: fixture.personId,
    jobType: "PLATFORM_HEALTH_PROBE",
    nextRunAt: new Date(now.getTime() - 5 * 60_000),
    payload: platformHealthPayload(),
    payloadVersion: 1,
    scheduleKey: "PLATFORM_HEALTH_PROBE",
  }));
  assert.equal(created.schedule.enabled, false);
  const enabled = await setPlatformJobScheduleEnabled(context, { enabled: true, expectedVersion: created.schedule.version, idempotencyKey: randomUUID(), scheduleId: created.schedule.id });
  if (enabled.replay) throw new Error("A fresh schedule state mutation unexpectedly replayed.");
  assert.equal(enabled.enabled, true);
  const idempotencyKey = randomUUID();
  const tick = await runPlatformSchedulerTick(context, { batchSize: 1, idempotencyKey, now });
  if (tick.replay) throw new Error("A fresh scheduler tick unexpectedly replayed.");
  assert.deepEqual({ intervalsSkipped: tick.intervalsSkipped, jobsCreated: tick.jobsCreated, schedulesProcessed: tick.schedulesProcessed }, { intervalsSkipped: 3, jobsCreated: 3, schedulesProcessed: 1 });
  const replay = await runPlatformSchedulerTick(context, { batchSize: 1, idempotencyKey, now: new Date(now.getTime() + 60_000) });
  assert.equal(replay.replay, true);
  assert.equal(await prisma.platformJob.count({ where: { scheduleId: created.schedule.id } }), 3);
  await assert.rejects(runPlatformSchedulerTick(context, { batchSize: 2, idempotencyKey, now }), code("IDEMPOTENCY_CONFLICT"));
});

test("bounded worker executes only the inert registered handler and replays its complete mutation", async () => {
  await createJob();
  const idempotencyKey = randomUUID();
  const first = await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey });
  if (first.replay) throw new Error("A fresh worker batch unexpectedly replayed.");
  assert.deepEqual({ claimed: first.claimed, state: first.state, succeeded: first.succeeded }, { claimed: 1, state: "COMPLETE", succeeded: 1 });
  assert.doesNotMatch(JSON.stringify(first), /operation|workerId|leaseToken|fencingToken/iu);
  const replay = await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey });
  assert.equal(replay.replay, true);
  assert.equal("state" in replay ? replay.state : null, "COMPLETE");
  assert.doesNotMatch(JSON.stringify(replay), /operation|workerId|leaseToken|fencingToken/iu);
  assert.equal((await prisma.platformJob.findFirstOrThrow()).status, "SUCCEEDED");
  const mutation = await prisma.platformJobMutation.findFirstOrThrow({ where: { action: "WORKER_BATCH" } });
  assert.equal(mutation.operationCompletedAt instanceof Date, true);
  assert.equal(mutation.operationLeaseToken, null);
  assert.equal(mutation.operationLeaseExpiresAt, null);
  assert.match(mutation.operationWorkerId ?? "", /^operation:[a-f0-9]{64}$/u);
});

test("worker operation resumes a crash before claim with one concurrent owner", async () => {
  await createJob();
  const idempotencyKey = randomUUID();
  let interrupted = false;
  setPlatformWorkerTestHook(({ phase }) => {
    if (!interrupted && phase === "AFTER_OPERATION_ACQUIRED_BEFORE_CLAIM") {
      interrupted = true;
      throw new Error("simulated crash before claim");
    }
  });
  await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey }), /simulated crash/u);
  setPlatformWorkerTestHook(undefined);
  const mutation = await workerMutation(idempotencyKey);
  assert.equal((mutation.result as { state: string }).state, "PROCESSING");
  assert.equal(await prisma.platformJobAttempt.count({ where: { workerId: mutation.operationWorkerId! } }), 0);
  const processing = await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey });
  assert.deepEqual(processing, { replay: true, retryAfterSeconds: 120, state: "PROCESSING" });
  assert.doesNotMatch(JSON.stringify(processing), /operation|workerId|leaseToken|fencingToken/iu);
  await expireWorkerOperation(mutation.id);
  const concurrent = await Promise.all([
    runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey }),
    runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey }),
  ]);
  assert.equal(concurrent.filter((result) => result.state === "COMPLETE").length >= 1, true);
  const final = await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey });
  assert.equal(final.state, "COMPLETE");
  assert.equal("succeeded" in final ? final.succeeded : -1, 1);
  assert.equal(await prisma.platformJobAttempt.count(), 1);
  assert.equal((await workerMutation(idempotencyKey)).operationCompletedAt instanceof Date, true);
});

test("worker operation does not steal an active claimed job and closes it once both leases expire", async () => {
  await createJob();
  const idempotencyKey = randomUUID();
  setPlatformWorkerTestHook(({ phase }) => {
    if (phase === "AFTER_JOB_CLAIM_BEFORE_HANDLER") throw new Error("simulated crash after claim");
  });
  await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey }), /simulated crash/u);
  setPlatformWorkerTestHook(undefined);
  const mutation = await workerMutation(idempotencyKey);
  const attempt = await prisma.platformJobAttempt.findFirstOrThrow({ where: { workerId: mutation.operationWorkerId! } });
  assert.equal(attempt.status, "CLAIMED");
  assert.equal((await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey })).state, "PROCESSING");
  await expireWorkerOperation(mutation.id);
  assert.equal((await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey })).state, "PROCESSING");
  assert.equal(await prisma.platformJobAttempt.count(), 1);
  await expireWorkerOperationAndJobs(mutation.id);
  const recovered = await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey });
  assert.deepEqual(
    pickWorkerResult(recovered),
    { claimed: 1, deadLettered: 0, failed: 0, recovered: 1, retryWait: 1, state: "COMPLETE", succeeded: 0 },
  );
  assert.equal(await prisma.platformJobAttempt.count(), 1);
  assert.equal((await prisma.platformJob.findFirstOrThrow()).status, "RETRY_WAIT");
});

test("partial worker crash finalizes only its canonical attempts without batch expansion or unrelated recovery", async () => {
  await Promise.all([createJob(), createJob(), createJob()]);
  const unrelated = await createJob({ availableAt: new Date("2000-01-01T00:00:00.000Z"), deduplicationKey: `unrelated:${randomUUID()}` });
  const [unrelatedClaim] = await claimPlatformJobs({ batchSize: 1, leaseSeconds: 300, workerId: "worker:unrelated:operation" });
  assert.equal(unrelatedClaim.id, unrelated.id);
  const idempotencyKey = randomUUID();
  setPlatformWorkerTestHook(({ completedJobs, phase }) => {
    if (phase === "AFTER_JOB_OUTCOME" && completedJobs === 1) throw new Error("simulated partial crash");
  });
  await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 3, idempotencyKey }), /simulated partial crash/u);
  setPlatformWorkerTestHook(undefined);
  const mutation = await workerMutation(idempotencyKey);
  assert.equal(await prisma.platformJobAttempt.count({ where: { workerId: mutation.operationWorkerId! } }), 3);
  await expireWorkerOperationAndJobs(mutation.id);
  const resumed = await runPlatformWorkerBatch(context, { batchSize: 3, idempotencyKey });
  assert.deepEqual(
    pickWorkerResult(resumed),
    { claimed: 3, deadLettered: 0, failed: 0, recovered: 2, retryWait: 2, state: "COMPLETE", succeeded: 1 },
  );
  assert.equal(await prisma.platformJobAttempt.count({ where: { workerId: mutation.operationWorkerId! } }), 3);
  assert.deepEqual(
    await prisma.platformJob.findUniqueOrThrow({ where: { id: unrelated.id }, select: { leaseToken: true, status: true } }),
    { leaseToken: unrelatedClaim.leaseToken, status: "CLAIMED" },
  );
});

test("canonical terminal attempts finalize an interrupted worker response without another claim", async () => {
  await Promise.all([createJob(), createJob()]);
  const idempotencyKey = randomUUID();
  setPlatformWorkerTestHook(({ phase }) => {
    if (phase === "BEFORE_OPERATION_FINALIZATION") throw new Error("simulated crash after success");
  });
  await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 2, idempotencyKey }), /simulated crash/u);
  setPlatformWorkerTestHook(undefined);
  const before = await workerMutation(idempotencyKey);
  assert.equal((before.result as { state: string }).state, "PROCESSING");
  assert.equal(await prisma.platformJobAttempt.count({ where: { workerId: before.operationWorkerId! } }), 2);
  const finalized = await runPlatformWorkerBatch(context, { batchSize: 2, idempotencyKey });
  assert.deepEqual(
    pickWorkerResult(finalized),
    { claimed: 2, deadLettered: 0, failed: 0, recovered: 0, retryWait: 0, state: "COMPLETE", succeeded: 2 },
  );
  const exact = await runPlatformWorkerBatch(context, { batchSize: 2, idempotencyKey });
  assert.deepEqual(exact, { ...finalized, replay: true });
  assert.equal(await prisma.platformJobAttempt.count(), 2);
  await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey }), code("IDEMPOTENCY_CONFLICT"));

  const changedActionKey = randomUUID();
  await prisma.platformJobMutation.create({
    data: {
      action: "SCHEDULER_TICK",
      actorAdminUserId: fixture.userId,
      actorPersonId: fixture.personId,
      idempotencyKey: changedActionKey,
      requestHash: "a".repeat(64),
      result: { state: "COMPLETE" },
    },
  });
  await assert.rejects(
    runPlatformWorkerBatch(context, { batchSize: 2, idempotencyKey: changedActionKey }),
    code("IDEMPOTENCY_CONFLICT"),
  );
});

test("stale operation token and fencing generation cannot finalize canonical job outcomes", async () => {
  for (const field of ["operationLeaseToken", "operationFencingToken"] as const) {
    await createJob();
    const idempotencyKey = randomUUID();
    setPlatformWorkerTestHook(async ({ mutationId, phase }) => {
      if (phase !== "BEFORE_OPERATION_FINALIZATION") return;
      await prisma.platformJobMutation.update({
        where: { id: mutationId },
        data: field === "operationLeaseToken"
          ? { operationLeaseToken: randomUUID() }
          : { operationFencingToken: { increment: BigInt(1) } },
      });
    });
    await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey }), code("STALE_LEASE"));
    setPlatformWorkerTestHook(undefined);
    const finalized = await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey });
    assert.equal(finalized.state, "COMPLETE");
    assert.equal("succeeded" in finalized ? finalized.succeeded : -1, 1);
  }
});

test("revoked Admin cannot reclaim an expired worker operation", async () => {
  await createJob();
  const idempotencyKey = randomUUID();
  setPlatformWorkerTestHook(({ phase }) => {
    if (phase === "AFTER_OPERATION_ACQUIRED_BEFORE_CLAIM") throw new Error("simulated authorization boundary crash");
  });
  await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey }), /simulated authorization/u);
  setPlatformWorkerTestHook(undefined);
  const mutation = await workerMutation(idempotencyKey);
  await expireWorkerOperation(mutation.id);
  await prisma.adminAccess.update({ where: { id: fixture.adminAccessId }, data: { status: "REVOKED" } });
  await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey }), code("FORBIDDEN"));
  assert.equal(await prisma.platformJobAttempt.count(), 0);
  await prisma.adminAccess.update({ where: { id: fixture.adminAccessId }, data: { status: "ACTIVE" } });
  assert.equal((await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey })).state, "COMPLETE");
});

test("Admin authorization is revalidated inside the same transaction before reads and mutations", async () => {
  await createJob();
  let revocation: ReturnType<typeof prisma.adminAccess.update> | undefined;
  setPlatformJobAuthorizationTestHook(() => {
    revocation = prisma.adminAccess.update({ where: { id: fixture.adminAccessId }, data: { status: "REVOKED" } });
  });
  const eligibleJobs = await prisma.$queryRaw<Array<{ count: bigint; maximum: Date | null; now: Date }>>(Prisma.sql`
    SELECT COUNT(*) AS count, MAX("createdAt") AS maximum, clock_timestamp() AS now FROM "PlatformJob"
  `);
  assert.equal(eligibleJobs[0].count, BigInt(1), `${eligibleJobs[0].maximum?.toISOString()} <= ${eligibleJobs[0].now.toISOString()}`);
  const authorizedSnapshot = await listPlatformJobs(context, { limit: 1 });
  assert.equal(authorizedSnapshot.items.length, 1);
  assert.ok(revocation);
  await revocation;
  setPlatformJobAuthorizationTestHook(undefined);
  await assert.rejects(triggerPlatformJob(context, { idempotencyKey: randomUUID(), jobType: "PLATFORM_HEALTH_PROBE" }), code("FORBIDDEN"));
  assert.equal(await prisma.platformJobMutation.count(), 0);
});

test("signed snapshot pagination is microsecond-safe, filter-bound, and returns safe DTOs only", async () => {
  const jobs = [await createJob(), await createJob(), await createJob()];
  for (const [index, job] of jobs.entries()) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "PlatformJob"
      SET "createdAt" = CAST(${`2026-07-21T13:00:00.00000${index + 1}Z`} AS timestamptz)
      WHERE "id" = CAST(${job.id} AS uuid)
    `);
  }
  const first = await listPlatformJobs(context, { limit: 1, status: "AVAILABLE" });
  assert.equal(first.items.length, 1);
  assert.ok(first.nextCursor);
  assert.equal(first.items[0].createdAt.endsWith("000003Z"), true);
  assert.equal("payloadHash" in first.items[0], false);
  assert.equal("leaseToken" in first.items[0], false);
  assert.deepEqual(first.items[0].payload, { jobType: "PLATFORM_HEALTH_PROBE", payloadVersion: 1, containsReferencesOnly: true });
  const second = await listPlatformJobs(context, { cursor: first.nextCursor!, limit: 1, status: "AVAILABLE" });
  assert.equal(second.items[0].createdAt.endsWith("000002Z"), true);
  await assert.rejects(listPlatformJobs(context, { cursor: first.nextCursor!, limit: 1, status: "CANCELLED" }), code("INVALID_CURSOR"));
  await assert.rejects(listPlatformJobs(context, { cursor: first.nextCursor!, limit: 2, status: "AVAILABLE" }), code("INVALID_CURSOR"));
  const detail = await getPlatformJobDetail(context, first.items[0].id);
  assert.equal("payloadHash" in detail, false);
  assert.equal("leaseToken" in detail, false);
  assert.equal("workerId" in detail, false);
  assert.equal(detail.payload.containsReferencesOnly, true);
});

test("schedule pagination is signed and safe", async () => {
  await runPlatformJobSerializable((transaction) => createPlatformJobSchedule(transaction, {
    cadenceSeconds: 300,
    catchupLimit: 1,
    createdByAdminUserId: fixture.userId,
    createdByPersonId: fixture.personId,
    jobType: "PLATFORM_HEALTH_PROBE",
    nextRunAt: new Date(Date.now() + 60_000),
    organizationId: fixture.organizationId,
    payload: platformHealthPayload(),
    payloadVersion: 1,
    scheduleKey: "PLATFORM_HEALTH_PROBE",
  }));
  const eligibleSchedules = await prisma.$queryRaw<Array<{ count: bigint; maximum: Date | null; now: Date }>>(Prisma.sql`
    SELECT COUNT(*) AS count, MAX("createdAt") AS maximum, clock_timestamp() AS now FROM "PlatformJobSchedule"
  `);
  assert.equal(eligibleSchedules[0].count, BigInt(1), `${eligibleSchedules[0].maximum?.toISOString()} <= ${eligibleSchedules[0].now.toISOString()}`);
  const page = await listPlatformJobSchedules(context, { limit: 1 });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].organizationId, fixture.organizationId);
  assert.equal("payloadHash" in page.items[0], false);
  assert.equal("payload" in page.items[0], true);
});

test("database constraints reject forged scope, excessive priority, and oversized payload without partial writes", async () => {
  const job = await createJob();
  await assert.rejects(prisma.$executeRaw(Prisma.sql`UPDATE "PlatformJob" SET "priority" = 10 WHERE "id" = CAST(${job.id} AS uuid)`), /PlatformJob_priority_check/u);
  await assert.rejects(prisma.$executeRaw(Prisma.sql`UPDATE "PlatformJob" SET "scopeKey" = 'organization:forged' WHERE "id" = CAST(${job.id} AS uuid)`), /PlatformJob_scope_check/u);
  const huge = { probe: "DURABLE_FOUNDATION", value: "x".repeat(4_096), version: 1 };
  await assert.rejects(prisma.$executeRaw(Prisma.sql`UPDATE "PlatformJob" SET "payload" = CAST(${JSON.stringify(huge)} AS jsonb) WHERE "id" = CAST(${job.id} AS uuid)`), /PlatformJob_payload_object_check/u);
  const unchanged = await prisma.platformJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(unchanged.priority, 5);
  assert.equal(unchanged.scopeKey, "platform");
  assert.deepEqual(unchanged.payload, platformHealthPayload());
});

test("claim and recovery indexes plus all Gate 6A foreign keys exist", async () => {
  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>(Prisma.sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename IN ('PlatformJob', 'PlatformJobSchedule', 'PlatformJobAttempt', 'PlatformJobMutation')
  `);
  const names = new Set(indexes.map((row) => row.indexname));
  for (const name of [
    "PlatformJob_status_priority_availableAt_id_idx",
    "PlatformJob_status_leaseExpiresAt_id_idx",
    "PlatformJobSchedule_enabled_nextRunAt_id_idx",
    "PlatformJobAttempt_status_heartbeatAt_id_idx",
    "PlatformJobMutation_actorAdminUserId_idempotencyKey_key",
    "PlatformJobMutation_action_operationLeaseExpiresAt_id_idx",
    "PlatformJobAttempt_workerId_createdAt_id_idx",
  ]) assert.equal(names.has(name), true, name);
  const foreignKeys = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS count FROM pg_constraint
    WHERE contype = 'f' AND conrelid IN (
      '"PlatformJob"'::regclass, '"PlatformJobAttempt"'::regclass,
      '"PlatformJobSchedule"'::regclass, '"PlatformJobMutation"'::regclass
    )
  `);
  assert.equal(foreignKeys[0].count, BigInt(13));
});

async function workerMutation(idempotencyKey: string) {
  return prisma.platformJobMutation.findUniqueOrThrow({
    where: { actorAdminUserId_idempotencyKey: { actorAdminUserId: fixture.userId, idempotencyKey } },
  });
}

async function expireWorkerOperation(mutationId: string) {
  await prisma.platformJobMutation.update({
    where: { id: mutationId },
    data: { operationLeaseExpiresAt: new Date("2000-01-01T00:00:00.000Z") },
  });
}

async function expireWorkerOperationAndJobs(mutationId: string) {
  const mutation = await prisma.platformJobMutation.findUniqueOrThrow({ where: { id: mutationId } });
  assert.ok(mutation.operationWorkerId);
  await prisma.$transaction([
    prisma.platformJobMutation.update({
      where: { id: mutationId },
      data: { operationLeaseExpiresAt: new Date("2000-01-01T00:00:00.000Z") },
    }),
    prisma.platformJob.updateMany({
      where: { leaseOwner: mutation.operationWorkerId, status: { in: ["CLAIMED", "RUNNING"] } },
      data: { leaseExpiresAt: new Date("2000-01-01T00:00:00.000Z") },
    }),
  ]);
}

function pickWorkerResult(result: Awaited<ReturnType<typeof runPlatformWorkerBatch>>) {
  assert.equal(result.state, "COMPLETE");
  if (result.state !== "COMPLETE") throw new Error("The worker operation did not complete.");
  return {
    claimed: result.claimed,
    deadLettered: result.deadLettered,
    failed: result.failed,
    recovered: result.recovered,
    retryWait: result.retryWait,
    state: result.state,
    succeeded: result.succeeded,
  };
}

async function createJob(input: { availableAt?: Date; deduplicationKey?: string; maxAttempts?: number; organizationId?: string | null } = {}) {
  return (await runPlatformJobSerializable((transaction) => enqueuePlatformJob(transaction, {
    availableAt: input.availableAt ?? new Date(Date.now() - 1_000),
    createdByAdminUserId: fixture.userId,
    createdByPersonId: fixture.personId,
    deduplicationKey: input.deduplicationKey ?? `integration:${randomUUID()}`,
    jobType: "PLATFORM_HEALTH_PROBE",
    maxAttempts: input.maxAttempts,
    organizationId: input.organizationId,
    payload: platformHealthPayload(),
    payloadVersion: 1,
    source: "ADMIN_MANUAL",
  }))).job;
}

async function createFailedJob() {
  return failExistingJob((await createJob({ maxAttempts: 1 })).id, `worker:gate6a:failed:${randomUUID()}`.slice(0, 95));
}

async function failExistingJob(jobId: string, workerId: string) {
  const [claim] = await claimPlatformJobs({ batchSize: 1, workerId });
  assert.equal(claim.id, jobId);
  await startPlatformJob({ fencingToken: claim.fencingToken, jobId, leaseToken: claim.leaseToken, workerId });
  await failPlatformJob({ errorCode: "PERMANENT_FAILURE", fencingToken: claim.fencingToken, jobId, leaseToken: claim.leaseToken, retryable: false, workerId });
  return prisma.platformJob.findUniqueOrThrow({ where: { id: jobId } });
}

async function cleanupPlatformRows() {
  await prisma.platformJobMutation.deleteMany({ where: { actorAdminUserId: fixture.userId } });
  await prisma.platformJobAttempt.deleteMany({ where: { job: { createdByAdminUserId: fixture.userId } } });
  await prisma.platformJob.deleteMany({ where: { requeueRootJobId: { not: null }, createdByAdminUserId: fixture.userId } });
  await prisma.platformJob.deleteMany({ where: { createdByAdminUserId: fixture.userId } });
  await prisma.platformJobSchedule.deleteMany({ where: { createdByAdminUserId: fixture.userId } });
}

function code(expected: string) {
  return (error: unknown) => error instanceof PlatformJobDomainError && error.code === expected;
}
