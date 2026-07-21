import assert from "node:assert/strict";

import { paymentProvider } from "../../features/payments/providers/registry";
import { configuredStorageProvider } from "../../features/storage/providers/registry";
import { STAGE_6_ARCHITECTURE } from "../../features/platform-jobs/domain/contracts";
import { PlatformJobDomainError } from "../../features/platform-jobs/domain/errors";
import { claimPlatformJobs, completePlatformJob, failPlatformJob, heartbeatPlatformJob, recoverExpiredPlatformJobLeases, startPlatformJob } from "../../features/platform-jobs/services/jobs";
import { cancelPlatformJob, requeuePlatformJob } from "../../features/platform-jobs/services/mutations";
import { getPlatformJobDetail, listPlatformJobs } from "../../features/platform-jobs/services/queries";
import { runPlatformSchedulerTick, setPlatformJobScheduleEnabled } from "../../features/platform-jobs/services/schedules";
import { prisma } from "../../lib/db/prisma";
import { PLATFORM_JOBS_GATE6A_MARKER, platformJobsGate6aFixtureFingerprint, platformJobsGate6aFixtureIds as ids, platformJobsGate6aNonFixtureFingerprint } from "./platform-jobs-gate6a-fixture";
import { assertPlatformJobsGate6aStaging } from "./platform-jobs-gate6a-safety";

const context = { adminAccessId: ids.adminAccessId, personId: ids.personId, source: "database" as const, userId: ids.userId };
const keys = {
  cancel: "6a000000-0000-4000-8000-000000000031",
  recoveredCancel: "6a000000-0000-4000-8000-000000000032",
  requeue: "6a000000-0000-4000-8000-000000000033",
  schedule: "6a000000-0000-4000-8000-000000000034",
  tick: "6a000000-0000-4000-8000-000000000035",
} as const;

async function main() {
  const safety = await assertPlatformJobsGate6aStaging(prisma);
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

  const list = await listPlatformJobs(context, { limit: 10 });
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

main().finally(() => prisma.$disconnect());
