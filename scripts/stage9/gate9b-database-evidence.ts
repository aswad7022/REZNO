import { createHash } from "node:crypto";

import { prisma } from "../../lib/db/prisma";
import {
  GATE9B_ALLOWED_STAGING_SCHEDULES,
  GATE9B_EXPECTED_JOB_TYPES,
  GATE9B_EXPECTED_MIGRATION_COUNT,
  parseGate9BStagingDatabaseIdentity,
} from "../../features/stage9/gate9b";

let phase = "BOOT";

async function main() {
  phase = "IDENTITY";
  const identity = parseGate9BStagingDatabaseIdentity(process.env.DATABASE_URL, {
    expectedHost: process.env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST,
    expectedRole: process.env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE,
    allowLocalTest: process.env.REZNO_STAGE9_GATE9B_ALLOW_LOCAL_TEST_DB === "true",
  });

  phase = "MIGRATIONS";
  const migrations = await prisma.$queryRaw<Array<{
    applied: bigint;
    failed: bigint;
    rolledBack: bigint;
    total: bigint;
  }>>`
    SELECT count(*)::bigint AS total,
           count(*) FILTER (
             WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
           )::bigint AS applied,
           count(*) FILTER (
             WHERE finished_at IS NULL AND rolled_back_at IS NULL
           )::bigint AS failed,
           count(*) FILTER (
             WHERE rolled_back_at IS NOT NULL
           )::bigint AS "rolledBack"
    FROM "_prisma_migrations"
  `;
  const migrationSummary = {
    applied: Number(migrations[0]?.applied ?? -1),
    failed: Number(migrations[0]?.failed ?? -1),
    rolledBack: Number(migrations[0]?.rolledBack ?? -1),
    total: Number(migrations[0]?.total ?? -1),
  };
  if (
    migrationSummary.total !== GATE9B_EXPECTED_MIGRATION_COUNT
    || migrationSummary.applied !== GATE9B_EXPECTED_MIGRATION_COUNT
    || migrationSummary.failed !== 0
    || migrationSummary.rolledBack !== 0
  ) {
    throw new Error("Gate 9B requires exact healthy 51/51 staging migrations.");
  }

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

  phase = "PROBE";
  const probeKeyHash = createHash("sha256").update("gate9b:staging:read-write-probe").digest("hex");
  await prisma.distributedRateLimitBucket.deleteMany({ where: { keyHash: probeKeyHash } });
  const now = new Date();
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
    migrations: migrationSummary,
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
