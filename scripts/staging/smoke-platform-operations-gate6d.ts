import assert from "node:assert/strict";

import { PlatformJobDomainError } from "../../features/platform-jobs/domain/errors";
import type {
  PlatformJobAdminContext,
} from "../../features/platform-jobs/services/admin-context";
import {
  setPlatformRuntimeEnabled,
} from "../../features/platform-operations/services/admin";
import {
  acknowledgePlatformAlert,
  acknowledgePlatformIncident,
  resolvePlatformAlert,
  resolvePlatformIncident,
} from "../../features/platform-operations/services/lifecycle";
import {
  getPlatformAlertDetail,
  getPlatformIncidentDetail,
  getPlatformOperationsOverview,
} from "../../features/platform-operations/services/queries";
import { postgresPool, prisma } from "../../lib/db/prisma";
import {
  attestGate6aPrismaTransport,
} from "../../lib/db/postgres-transport";
import {
  consumeRateLimit,
} from "../../lib/security/rate-limit";
import {
  PLATFORM_OPERATIONS_GATE6D_MARKER,
  PLATFORM_OPERATIONS_GATE6D_RATE_LIMIT_SMOKE,
  platformOperationsGate6dFixtureFingerprint,
  platformOperationsGate6dFixtureIds as ids,
  platformOperationsGate6dForeignSentinels,
  platformOperationsGate6dNonFixtureFingerprint,
  rateLimitSmokeBucketKeyHash,
  seedPlatformOperationsGate6dFixture,
} from "./platform-operations-gate6d-fixture";
import {
  assertPlatformOperationsGate6dStaging,
} from "./platform-operations-gate6d-safety";

const mutationKeys = {
  acknowledgeAlert: "6d000000-0000-4000-8000-000000000020",
  acknowledgeIncident: "6d000000-0000-4000-8000-000000000021",
  resolveAlert: "6d000000-0000-4000-8000-000000000022",
  resolveIncident: "6d000000-0000-4000-8000-000000000023",
  revokedRuntime: "6d000000-0000-4000-8000-000000000024",
} as const;

let phase = "BOOT";

async function main() {
  phase = "TRANSPORT";
  const transport =
    process.env.REZNO_STAGE6_GATE6D_ALLOW_LOCAL_UNENCRYPTED === "true"
      ? undefined
      : await attestGate6aPrismaTransport(postgresPool, prisma);
  phase = "SAFETY";
  const safety = await assertPlatformOperationsGate6dStaging(
    prisma,
    process.env,
    transport,
  );
  phase = "PREFLIGHT";
  const nonFixtureBefore =
    await platformOperationsGate6dNonFixtureFingerprint(prisma);
  const sentinelsBefore =
    await platformOperationsGate6dForeignSentinels(prisma);
  phase = "SEED";
  const seeded = await seedPlatformOperationsGate6dFixture(prisma);
  const context: PlatformJobAdminContext = {
    adminAccessId: ids.adminAccessId,
    personId: ids.adminPersonId,
    source: "database",
    userId: ids.adminUserId,
  };
  let checks = 0;

  phase = "FIXTURE_TRUTH";
  assert.equal(seeded.counts.actor, 1);
  assert.equal(seeded.counts.schedules, 13);
  assert.equal(seeded.counts.jobs, 1);
  assert.equal(seeded.counts.rateBuckets, 1);
  assert.equal(seeded.counts.runtimeControls, 1);
  assert.equal(seeded.counts.runtimeInvocations, 1);
  assert.equal(seeded.counts.alerts, 1);
  assert.equal(seeded.counts.incidents, 1);
  const control = await prisma.platformRuntimeControl.findUniqueOrThrow({
    where: { id: "github-actions-runtime" },
  });
  assert.equal(control.state, "DISABLED");
  assert.equal(control.lastSucceededAt, null);
  assert.equal(
    await prisma.platformJobSchedule.count({ where: { enabled: true } }),
    0,
  );
  const invocation =
    await prisma.platformRuntimeInvocation.findUniqueOrThrow({
      where: { id: ids.invocationId },
    });
  assert.equal(invocation.state, "FAILED");
  assert.equal(invocation.safeErrorCode, "STAGING_FIXTURE");
  checks += 12;

  phase = "OVERVIEW";
  const overview = await getPlatformOperationsOverview(context);
  assert.equal(overview.rateLimit.backend, "POSTGRESQL");
  assert.equal(overview.rateLimit.availability, "AVAILABLE");
  assert.deepEqual(overview.providers, {
    communications: "NOT_CONFIGURED",
    payment: "NOT_CONFIGURED",
    storage: "NOT_CONFIGURED",
  });
  assert.equal(overview.runtime.state, "DISABLED");
  assert.equal(overview.runtime.connection, "NOT_CONNECTED");
  assert.equal(overview.metrics.disabledSchedules!.count >= 13, true);
  assert.doesNotMatch(
    JSON.stringify(overview),
    /password|authorization|leaseToken|DATABASE_URL|postgres(?:ql)?:\/\//iu,
  );
  checks += 7;

  phase = "DISTRIBUTED_RATE_LIMIT";
  const rateInput = PLATFORM_OPERATIONS_GATE6D_RATE_LIMIT_SMOKE;
  const attempts = await Promise.all(
    Array.from(
      { length: 8 },
      () => consumeRateLimit(
        rateInput.scope,
        rateInput.identifier,
        rateInput.options,
      ),
    ),
  );
  assert.equal(attempts.filter((item) => item.success).length, 3);
  assert.equal(attempts.filter((item) => !item.success).length, 5);
  assert.equal(attempts.some((item) => item.unavailable), false);
  const rateBucket =
    await prisma.distributedRateLimitBucket.findUniqueOrThrow({
      where: { keyHash: rateLimitSmokeBucketKeyHash() },
    });
  assert.equal(rateBucket.count, 4);
  assert.equal(JSON.stringify(rateBucket).includes(rateInput.identifier), false);
  checks += 5;

  phase = "ALERT_LIFECYCLE";
  const alert = await getPlatformAlertDetail(context, ids.alertId);
  const acknowledgedAlert = await acknowledgePlatformAlert(context, {
    expectedVersion: alert.version,
    idempotencyKey: mutationKeys.acknowledgeAlert,
    targetId: alert.id,
  });
  const alertReplay = await acknowledgePlatformAlert(context, {
    expectedVersion: alert.version,
    idempotencyKey: mutationKeys.acknowledgeAlert,
    targetId: alert.id,
  });
  assert.equal(acknowledgedAlert.replay, false);
  assert.equal(alertReplay.replay, true);
  const currentAlert = await getPlatformAlertDetail(context, ids.alertId);
  const resolvedAlert = await resolvePlatformAlert(context, {
    expectedVersion: currentAlert.version,
    idempotencyKey: mutationKeys.resolveAlert,
    targetId: currentAlert.id,
  });
  if (resolvedAlert.replay) {
    throw new Error("Gate 6D alert resolution unexpectedly replayed.");
  }
  assert.equal(resolvedAlert.state, "RESOLVED");
  checks += 3;

  phase = "INCIDENT_LIFECYCLE";
  const incident = await getPlatformIncidentDetail(context, ids.incidentId);
  const acknowledgedIncident = await acknowledgePlatformIncident(context, {
    expectedVersion: incident.version,
    idempotencyKey: mutationKeys.acknowledgeIncident,
    targetId: incident.id,
  });
  const currentIncident =
    await getPlatformIncidentDetail(context, ids.incidentId);
  const resolvedIncident = await resolvePlatformIncident(context, {
    expectedVersion: currentIncident.version,
    idempotencyKey: mutationKeys.resolveIncident,
    targetId: currentIncident.id,
  });
  if (acknowledgedIncident.replay || resolvedIncident.replay) {
    throw new Error("Gate 6D incident lifecycle unexpectedly replayed.");
  }
  assert.equal(acknowledgedIncident.state, "ACKNOWLEDGED");
  assert.equal(resolvedIncident.state, "RESOLVED");
  checks += 2;

  phase = "APPEND_ONLY";
  await assert.rejects(
    prisma.platformAlertHistory.updateMany({
      where: { alertId: ids.alertId },
      data: { metadata: { changed: true } },
    }),
  );
  await assert.rejects(
    prisma.platformIncidentHistory.deleteMany({
      where: { incidentId: ids.incidentId },
    }),
  );
  await assert.rejects(
    prisma.platformOperationMutation.deleteMany({
      where: { actorAdminUserId: ids.adminUserId },
    }),
  );
  checks += 3;

  phase = "REVOCATION";
  await prisma.adminAccess.update({
    where: { id: ids.adminAccessId },
    data: { permissions: ["PLATFORM_OPERATIONS_VIEW"] },
  });
  await assert.rejects(
    setPlatformRuntimeEnabled(context, {
      enabled: true,
      expectedVersion: control.version,
      idempotencyKey: mutationKeys.revokedRuntime,
    }),
    domainCode("FORBIDDEN"),
  );
  assert.equal(
    (await prisma.platformRuntimeControl.findUniqueOrThrow({
      where: { id: control.id },
    })).state,
    "DISABLED",
  );
  checks += 2;

  phase = "POSTFLIGHT";
  const sentinelsAfter =
    await platformOperationsGate6dForeignSentinels(prisma);
  const nonFixtureAfter =
    await platformOperationsGate6dNonFixtureFingerprint(prisma);
  assert.deepEqual(sentinelsAfter, sentinelsBefore);
  assert.equal(nonFixtureAfter, nonFixtureBefore);
  const fixtureEvidence =
    await platformOperationsGate6dFixtureFingerprint(prisma);
  assert.doesNotMatch(
    JSON.stringify(fixtureEvidence),
    /password|authorization|postgres(?:ql)?:\/\//iu,
  );
  checks += 3;

  console.log(JSON.stringify({
    ...safety,
    checks,
    fixture: PLATFORM_OPERATIONS_GATE6D_MARKER,
    fixtureEvidence,
    foreignSentinels: sentinelsAfter,
    nonFixtureFingerprint: nonFixtureAfter,
    status: "passed",
  }));
}

function domainCode(code: string) {
  return (error: unknown) => (
    error instanceof PlatformJobDomainError && error.code === code
  );
}

const keepAlive = setInterval(() => undefined, 1_000);
main()
  .catch(() => {
    process.exitCode = 1;
    console.error(`Gate 6D staging smoke failed closed at ${phase}.`);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await postgresPool.end();
    clearInterval(keepAlive);
  });
