import { createHash } from "node:crypto";

import { prisma } from "../../lib/db/prisma";
import {
  assertGate9BActivationPreconditions,
  GATE9B_ALLOWED_STAGING_SCHEDULES,
  GATE9B_EXPECTED_JOB_TYPES,
  GATE9B_LOCAL_TEST_SOURCE,
  gate9BDatabaseBindingSha256,
  gate9BDeploymentEvidenceFromEnv,
  gate9BRestorePointEvidenceFromEnv,
  parseGate9BStagingDatabaseIdentity,
} from "../../features/stage9/gate9b";
import {
  collectStage9BMigrationEvidence,
  localStage9BRestorePointEvidence,
  snapshotStage9BEnv,
} from "./gate9b-evidence-helpers";

let phase = "BOOT";

async function main() {
  const env = snapshotStage9BEnv();
  const allowLocalTest = env.REZNO_STAGE9_GATE9B_ALLOW_LOCAL_TEST_DB === "true";

  phase = "IDENTITY";
  const identity = parseGate9BStagingDatabaseIdentity(env.DATABASE_URL, {
    allowLocalTest,
    expectedHost: env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST,
    expectedIdentitySource: env.REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE,
    expectedRole: env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE,
  });

  phase = "MIGRATIONS";
  const migrationEvidence = await collectStage9BMigrationEvidence(prisma, env);

  phase = "REGISTRY";
  const enumRows = await prisma.$queryRaw<Array<{ label: string; type: string }>>`
    SELECT enum_type.typname AS type, enum_value.enumlabel AS label
    FROM pg_enum AS enum_value
    JOIN pg_type AS enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname IN ('PlatformJobType', 'PlatformJobScheduleKey')
    ORDER BY enum_type.typname, enum_value.enumsortorder
  `;
  const jobTypes = enumRows.filter((row) => row.type === "PlatformJobType").map((row) => row.label);
  const scheduleKeys = enumRows.filter((row) => row.type === "PlatformJobScheduleKey").map((row) => row.label);
  if (!sameSet(jobTypes, GATE9B_EXPECTED_JOB_TYPES) || !sameSet(scheduleKeys, GATE9B_ALLOWED_STAGING_SCHEDULES)) {
    throw new Error("Gate 9B staging registry does not match the accepted Stage 6 registry.");
  }

  phase = "ACTIVATION_PRECONDITIONS";
  const now = new Date();
  const databaseBindingSha256 = gate9BDatabaseBindingSha256(identity);
  const restorePointEvidence =
    allowLocalTest
    && env.NODE_ENV === "test"
    && env.REZNO_STAGE9_GATE9B_RESTORE_POINT_ID?.trim()
    && env.REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFICATION_SOURCE === GATE9B_LOCAL_TEST_SOURCE
      ? localStage9BRestorePointEvidence({
        createdAt: new Date(now.getTime() - 60_000),
        databaseBindingSha256,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
        verifiedAt: now,
      })
      : gate9BRestorePointEvidenceFromEnv(env);
  assertGate9BActivationPreconditions({
    databaseIdentity: identity,
    deploymentEvidence: gate9BDeploymentEvidenceFromEnv(env) ?? undefined,
    env,
    migrationEvidence,
    now,
    restorePointEvidence,
  });

  phase = "PROBE";
  const probeKeyHash = createHash("sha256").update("gate9b:staging:read-write-probe").digest("hex");
  await prisma.distributedRateLimitBucket.deleteMany({ where: { keyHash: probeKeyHash } });
  await prisma.distributedRateLimitBucket.create({
    data: {
      count: 1,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
      keyHash: probeKeyHash,
      keyVersion: 1,
      resetAt: new Date(now.getTime() + 5 * 60_000),
      windowStartedAt: now,
    },
  });
  const probeInserted = await prisma.distributedRateLimitBucket.count({ where: { keyHash: probeKeyHash } });
  await prisma.distributedRateLimitBucket.deleteMany({ where: { keyHash: probeKeyHash } });
  const probeRemaining = await prisma.distributedRateLimitBucket.count({ where: { keyHash: probeKeyHash } });
  if (probeInserted !== 1 || probeRemaining !== 0) {
    throw new Error("Gate 9B staging read/write probe did not clean up exactly.");
  }

  console.log(JSON.stringify({
    databaseIdentity: identity,
    jobTypes: jobTypes.length,
    migrations: {
      applied: migrationEvidence.applied,
      failed: migrationEvidence.failed,
      rolledBack: migrationEvidence.rolledBack,
      schemaDrift: migrationEvidence.schemaDrift,
      total: migrationEvidence.total,
    },
    probe: { inserted: probeInserted, remaining: probeRemaining },
    scheduleKeys: scheduleKeys.length,
    status: "passed",
  }, null, 2));
}

function sameSet(left: readonly string[], right: readonly string[]) {
  return left.length === right.length
    && left.every((item) => right.includes(item as never))
    && right.every((item) => left.includes(item));
}

main()
  .catch((error) => {
    process.exitCode = 1;
    console.error(`Gate 9B database evidence failed closed at ${phase}.`);
    if (error instanceof Error) console.error(error.message);
  })
  .finally(() => prisma.$disconnect());
