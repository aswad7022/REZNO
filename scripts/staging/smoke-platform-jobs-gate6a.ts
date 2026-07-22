import assert from "node:assert/strict";

import { paymentProvider } from "../../features/payments/providers/registry";
import { configuredStorageProvider } from "../../features/storage/providers/registry";
import { STAGE_6_ARCHITECTURE } from "../../features/platform-jobs/domain/contracts";
import { PlatformJobDomainError } from "../../features/platform-jobs/domain/errors";
import { platformJobHash } from "../../features/platform-jobs/domain/canonical";
import { platformHealthPayload } from "../../features/platform-jobs/domain/registry";
import { claimPlatformJobs, completePlatformJob, failPlatformJob, heartbeatPlatformJob, recoverExpiredPlatformJobLeases, startPlatformJob } from "../../features/platform-jobs/services/jobs";
import { cancelPlatformJob, requeuePlatformJob } from "../../features/platform-jobs/services/mutations";
import { getPlatformJobDetail, listPlatformJobs } from "../../features/platform-jobs/services/queries";
import { runPlatformSchedulerTick, setPlatformJobScheduleEnabled } from "../../features/platform-jobs/services/schedules";
import { runPlatformWorkerBatch, setPlatformWorkerTestHook } from "../../features/platform-jobs/services/worker";
import { postgresPool, prisma } from "../../lib/db/prisma";
import { attestGate6aPrismaTransport } from "../../lib/db/postgres-transport";
import { PLATFORM_JOBS_GATE6A_MARKER, platformJobsGate6aFixtureFingerprint, platformJobsGate6aFixtureIds as ids, platformJobsGate6aNonFixtureFingerprint } from "./platform-jobs-gate6a-fixture";
import { assertPlatformJobsGate6aStaging } from "./platform-jobs-gate6a-safety";

const context = { adminAccessId: ids.adminAccessId, personId: ids.personId, source: "database" as const, userId: ids.userId };
const keys = {
  cancel: "6a000000-0000-4000-8000-000000000031",
  recoveredCancel: "6a000000-0000-4000-8000-000000000032",
  requeue: "6a000000-0000-4000-8000-000000000033",
  schedule: "6a000000-0000-4000-8000-000000000034",
  tick: "6a000000-0000-4000-8000-000000000035",
  workerBeforeClaim: "6a000000-0000-4000-8000-000000000036",
  workerAfterClaim: "6a000000-0000-4000-8000-000000000037",
  workerAfterSuccess: "6a000000-0000-4000-8000-000000000038",
  workerRevoked: "6a000000-0000-4000-8000-000000000039",
} as const;
const operationJobs = {
  beforeClaim: "6a000000-0000-4000-8000-000000000041",
  afterClaim: "6a000000-0000-4000-8000-000000000042",
  afterSuccess: "6a000000-0000-4000-8000-000000000043",
  revoked: "6a000000-0000-4000-8000-000000000044",
} as const;

async function main() {
  const transport = await attestGate6aPrismaTransport(postgresPool, prisma);
  const safety = await assertPlatformJobsGate6aStaging(prisma, process.env, transport);
  const nonFixtureBefore = await platformJobsGate6aNonFixtureFingerprint(prisma);
  let checks = 0;

  assert.equal(configuredStorageProvider().kind, "NOT_CONFIGURED");
  assert.equal(paymentProvider().kind, "NOT_CONFIGURED");
  assert.equal(STAGE_6_ARCHITECTURE.runtime.externalQueueProvider, "NOT_CONFIGURED");
  assert.equal(STAGE_6_ARCHITECTURE.runtime.automaticScheduler, "NOT_CONNECTED");
  assert.equal(STAGE_6_ARCHITECTURE.runtime.alwaysOnWorker, "NOT_CONNECTED");
  checks += 5;

  const base = new Date("2026-07-21T12:00:01.000Z");
  const [left, right] = await Promise.all([
    claimPlatformJobs({ batchSize: 1, leaseSeconds: 60, now: base, workerId: "staging:gate6a:claim:left" }),
    claimPlatformJobs({ batchSize: 1, leaseSeconds: 60, now: base, workerId: "staging:gate6a:claim:right" }),
  ]);
  assert.equal(left.length + right.length, 1);
  const success = [...left, ...right][0];
  assert.equal(success.id, ids.jobs.success);
  await startPlatformJob({ fencingToken: success.fencingToken, jobId: success.id, leaseToken: success.leaseToken, now: new Date(base.getTime() + 1), workerId: left.length ? "staging:gate6a:claim:left" : "staging:gate6a:claim:right" });
  const owner = left.length ? "staging:gate6a:claim:left" : "staging:gate6a:claim:right";
  await assert.rejects(heartbeatPlatformJob({ extensionSeconds: 30, fencingToken: success.fencingToken, jobId: success.id, leaseToken: success.leaseToken, now: new Date(base.getTime() + 2), workerId: "staging:gate6a:claim:thief" }), code("STALE_LEASE"));
  await heartbeatPlatformJob({ extensionSeconds: 60, fencingToken: success.fencingToken, jobId: success.id, leaseToken: success.leaseToken, now: new Date(base.getTime() + 2), workerId: owner });
  const result = { executionGeneration: success.fencingToken.toString(), kind: "PLATFORM_HEALTHY", payloadVersion: 1 };
  assert.equal((await completePlatformJob({ fencingToken: success.fencingToken, jobId: success.id, leaseToken: success.leaseToken, now: new Date(base.getTime() + 3), result, workerId: owner })).replay, false);
  assert.equal((await completePlatformJob({ fencingToken: success.fencingToken, jobId: success.id, leaseToken: success.leaseToken, now: new Date(base.getTime() + 4), result, workerId: owner })).replay, true);
  await assert.rejects(completePlatformJob({ fencingToken: success.fencingToken + BigInt(1), jobId: success.id, leaseToken: success.leaseToken, result, workerId: owner }), code("STALE_LEASE"));
  checks += 7;

  const recoveryBase = new Date("2026-07-21T12:10:01.000Z");
  const [recovery] = await claimPlatformJobs({ batchSize: 1, leaseSeconds: 30, now: recoveryBase, workerId: "staging:gate6a:recovery" });
  assert.equal(recovery.id, ids.jobs.recovery);
  await startPlatformJob({ fencingToken: recovery.fencingToken, jobId: recovery.id, leaseToken: recovery.leaseToken, now: new Date(recoveryBase.getTime() + 1), workerId: "staging:gate6a:recovery" });
  assert.equal((await recoverExpiredPlatformJobLeases(new Date(recoveryBase.getTime() + 29_999), 1)).recovered, 0);
  assert.equal((await recoverExpiredPlatformJobLeases(new Date(recoveryBase.getTime() + 30_001), 1)).recovered, 1);
  const recovered = await prisma.platformJob.findUniqueOrThrow({ where: { id: recovery.id } });
  assert.equal(recovered.status, "RETRY_WAIT");
  await cancelPlatformJob(context, { expectedVersion: recovered.version, idempotencyKey: keys.recoveredCancel, jobId: recovered.id });
  checks += 5;

  const retryBase = new Date("2026-07-21T12:20:01.000Z");
  const [retryFirst] = await claimPlatformJobs({ batchSize: 1, now: retryBase, workerId: "staging:gate6a:retry:one" });
  assert.equal(retryFirst.id, ids.jobs.retry);
  await startPlatformJob({ fencingToken: retryFirst.fencingToken, jobId: retryFirst.id, leaseToken: retryFirst.leaseToken, now: new Date(retryBase.getTime() + 1), workerId: "staging:gate6a:retry:one" });
  assert.equal((await failPlatformJob({ errorCode: "TRANSIENT_FAILURE", fencingToken: retryFirst.fencingToken, jobId: retryFirst.id, leaseToken: retryFirst.leaseToken, now: new Date(retryBase.getTime() + 2), retryable: true, workerId: "staging:gate6a:retry:one" })).status, "RETRY_WAIT");
  const retryWait = await prisma.platformJob.findUniqueOrThrow({ where: { id: retryFirst.id } });
  const [retrySecond] = await claimPlatformJobs({ batchSize: 1, now: new Date(retryWait.availableAt.getTime() + 1), workerId: "staging:gate6a:retry:two" });
  assert.equal(retrySecond.id, retryFirst.id);
  await startPlatformJob({ fencingToken: retrySecond.fencingToken, jobId: retrySecond.id, leaseToken: retrySecond.leaseToken, now: new Date(retryWait.availableAt.getTime() + 2), workerId: "staging:gate6a:retry:two" });
  assert.equal((await failPlatformJob({ errorCode: "TRANSIENT_FAILURE", fencingToken: retrySecond.fencingToken, jobId: retrySecond.id, leaseToken: retrySecond.leaseToken, now: new Date(retryWait.availableAt.getTime() + 3), retryable: true, workerId: "staging:gate6a:retry:two" })).status, "DEAD_LETTERED");
  checks += 6;

  const cancel = await prisma.platformJob.findUniqueOrThrow({ where: { id: ids.jobs.cancel } });
  const cancelled = await cancelPlatformJob(context, { expectedVersion: cancel.version, idempotencyKey: keys.cancel, jobId: cancel.id });
  if (cancelled.replay) throw new Error("Fresh staging cancellation unexpectedly replayed.");
  assert.equal(cancelled.status, "CANCELLED");
  const failed = await prisma.platformJob.findUniqueOrThrow({ where: { id: ids.jobs.requeue } });
  const requeued = await requeuePlatformJob(context, { expectedVersion: failed.version, idempotencyKey: keys.requeue, jobId: failed.id });
  if (requeued.replay) throw new Error("Fresh staging requeue unexpectedly replayed.");
  assert.equal(requeued.requeueSequence, 1);
  assert.equal((await prisma.platformJob.findUniqueOrThrow({ where: { id: failed.id } })).status, "FAILED");
  checks += 4;

  const schedule = await prisma.platformJobSchedule.findUniqueOrThrow({ where: { id: ids.scheduleId } });
  await setPlatformJobScheduleEnabled(context, { enabled: true, expectedVersion: schedule.version, idempotencyKey: keys.schedule, scheduleId: schedule.id });
  const tickNow = new Date();
  const tick = await runPlatformSchedulerTick(context, { batchSize: 1, idempotencyKey: keys.tick, now: tickNow });
  if (tick.replay) throw new Error("Fresh staging scheduler tick unexpectedly replayed.");
  assert.equal(tick.jobsCreated, 2);
  assert.ok(tick.intervalsSkipped > 0);
  assert.equal((await runPlatformSchedulerTick(context, { batchSize: 1, idempotencyKey: keys.tick, now: new Date(tickNow.getTime() + 60_000) })).replay, true);
  assert.equal(await prisma.platformJob.count({ where: { scheduleId: schedule.id } }), 2);
  checks += 4;

  await createWorkerSmokeJob(operationJobs.beforeClaim, "before-claim");
  setPlatformWorkerTestHook(({ phase }) => {
    if (phase === "AFTER_OPERATION_ACQUIRED_BEFORE_CLAIM") throw new Error("staging crash before claim");
  });
  await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey: keys.workerBeforeClaim }), /crash before claim/u);
  setPlatformWorkerTestHook(undefined);
  await expireOperation(keys.workerBeforeClaim, false);
  const beforeClaim = await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey: keys.workerBeforeClaim });
  assert.equal(beforeClaim.state, "COMPLETE");
  assert.equal("succeeded" in beforeClaim ? beforeClaim.succeeded : -1, 1);
  checks += 4;

  await createWorkerSmokeJob(operationJobs.afterClaim, "after-claim");
  setPlatformWorkerTestHook(({ phase }) => {
    if (phase === "AFTER_JOB_CLAIM_BEFORE_HANDLER") throw new Error("staging crash after claim");
  });
  await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey: keys.workerAfterClaim }), /crash after claim/u);
  setPlatformWorkerTestHook(undefined);
  const afterClaimMutation = await workerMutation(keys.workerAfterClaim);
  const afterClaimAttempt = await prisma.platformJobAttempt.findFirstOrThrow({ where: { workerId: afterClaimMutation.operationWorkerId! } });
  assert.equal((await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey: keys.workerAfterClaim })).state, "PROCESSING");
  await expireOperation(keys.workerAfterClaim, false);
  assert.equal((await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey: keys.workerAfterClaim })).state, "PROCESSING");
  assert.equal((await prisma.platformJobAttempt.findUniqueOrThrow({ where: { id: afterClaimAttempt.id } })).leaseToken, afterClaimAttempt.leaseToken);
  await expireOperation(keys.workerAfterClaim, true);
  const afterClaim = await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey: keys.workerAfterClaim });
  assert.equal(afterClaim.state, "COMPLETE");
  assert.equal("recovered" in afterClaim ? afterClaim.recovered : -1, 1);
  assert.equal(await prisma.platformJobAttempt.count({ where: { workerId: afterClaimMutation.operationWorkerId! } }), 1);
  checks += 8;

  await createWorkerSmokeJob(operationJobs.afterSuccess, "after-success");
  setPlatformWorkerTestHook(({ phase }) => {
    if (phase === "BEFORE_OPERATION_FINALIZATION") throw new Error("staging crash after success");
  });
  await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey: keys.workerAfterSuccess }), /crash after success/u);
  setPlatformWorkerTestHook(undefined);
  const successMutation = await workerMutation(keys.workerAfterSuccess);
  const successAttempts = await prisma.platformJobAttempt.count({ where: { workerId: successMutation.operationWorkerId! } });
  const finalized = await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey: keys.workerAfterSuccess });
  assert.equal(finalized.state, "COMPLETE");
  assert.equal(await prisma.platformJobAttempt.count({ where: { workerId: successMutation.operationWorkerId! } }), successAttempts);
  await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 2, idempotencyKey: keys.workerAfterSuccess }), code("IDEMPOTENCY_CONFLICT"));
  checks += 5;

  await createWorkerSmokeJob(operationJobs.revoked, "revoked");
  setPlatformWorkerTestHook(({ phase }) => {
    if (phase === "AFTER_OPERATION_ACQUIRED_BEFORE_CLAIM") throw new Error("staging revoked-operation crash");
  });
  await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey: keys.workerRevoked }), /revoked-operation/u);
  setPlatformWorkerTestHook(undefined);
  await expireOperation(keys.workerRevoked, false);
  await prisma.adminAccess.update({ where: { id: ids.adminAccessId }, data: { status: "REVOKED" } });
  try {
    await assert.rejects(runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey: keys.workerRevoked }), code("FORBIDDEN"));
    assert.equal(await prisma.platformJobAttempt.count({ where: { workerId: (await workerMutation(keys.workerRevoked)).operationWorkerId! } }), 0);
  } finally {
    await prisma.adminAccess.update({ where: { id: ids.adminAccessId }, data: { status: "ACTIVE" } });
  }
  assert.equal((await runPlatformWorkerBatch(context, { batchSize: 1, idempotencyKey: keys.workerRevoked })).state, "COMPLETE");
  checks += 4;

  const list = await listPlatformJobs(context, { limit: 50 });
  assert.ok(list.items.length > 0);
  assert.equal(list.items.every((item) => item.payload.containsReferencesOnly), true);
  const detail = await getPlatformJobDetail(context, success.id);
  assert.equal(detail.lease.active, false);
  assert.equal("leaseToken" in detail, false);
  assert.equal("payloadHash" in detail, false);
  const types = await prisma.platformJob.groupBy({ by: ["jobType"], where: { createdByAdminUserId: ids.userId } });
  assert.deepEqual(types.map((item) => item.jobType), ["PLATFORM_HEALTH_PROBE"]);
  checks += 6;

  const nonFixtureAfter = await platformJobsGate6aNonFixtureFingerprint(prisma);
  assert.equal(nonFixtureAfter, nonFixtureBefore);
  checks += 1;
  console.log(JSON.stringify({
    ...safety,
    checks,
    fixture: PLATFORM_JOBS_GATE6A_MARKER,
    fixtureEvidence: await platformJobsGate6aFixtureFingerprint(prisma),
    nonFixtureFingerprint: nonFixtureAfter,
    runtime: STAGE_6_ARCHITECTURE.runtime,
    status: "passed",
  }));
}

function code(expected: string) {
  return (error: unknown) => error instanceof PlatformJobDomainError && error.code === expected;
}

async function createWorkerSmokeJob(id: string, key: string) {
  const payload = platformHealthPayload();
  await prisma.platformJob.create({
    data: {
      availableAt: new Date("2026-07-21T00:00:00.000Z"),
      createdByAdminUserId: ids.userId,
      createdByPersonId: ids.personId,
      deduplicationKey: `staging:${PLATFORM_JOBS_GATE6A_MARKER}:worker:${key}`,
      id,
      jobType: "PLATFORM_HEALTH_PROBE",
      maxAttempts: 2,
      payload,
      payloadHash: platformJobHash(payload),
      payloadVersion: 1,
      priority: 9,
      scopeKey: "platform",
      source: "ADMIN_MANUAL",
      status: "AVAILABLE",
    },
  });
}

async function workerMutation(idempotencyKey: string) {
  return prisma.platformJobMutation.findUniqueOrThrow({
    where: { actorAdminUserId_idempotencyKey: { actorAdminUserId: ids.userId, idempotencyKey } },
  });
}

async function expireOperation(idempotencyKey: string, expireJobs: boolean) {
  const mutation = await workerMutation(idempotencyKey);
  await prisma.$transaction([
    prisma.platformJobMutation.update({
      where: { id: mutation.id },
      data: { operationLeaseExpiresAt: new Date("2000-01-01T00:00:00.000Z") },
    }),
    ...(expireJobs && mutation.operationWorkerId
      ? [prisma.platformJob.updateMany({
        where: { leaseOwner: mutation.operationWorkerId, status: { in: ["CLAIMED", "RUNNING"] } },
        data: { leaseExpiresAt: new Date("2000-01-01T00:00:00.000Z") },
      })]
      : []),
  ]);
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error("Gate 6A staging smoke failed closed.");
  })
  .finally(async () => {
    setPlatformWorkerTestHook(undefined);
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
