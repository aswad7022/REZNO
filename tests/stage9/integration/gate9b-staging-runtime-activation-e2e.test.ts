import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  GATE9B_ALLOWED_STAGING_SCHEDULES,
  GATE9B_EXPECTED_JOB_TYPES,
  GATE9B_EXPECTED_MIGRATION_COUNT,
  evaluateGate9BRuntimeSnapshot,
} from "../../../features/stage9/gate9b";
import { prisma } from "../../../lib/db/prisma";

async function assertDisposableDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Gate 9B integration refuses NODE_ENV=production.");
  }
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  assert.match(
    rows[0]?.database ?? "",
    /(?:_test|test_|gate9b|gate9a|marketplace_ci)/,
    "Gate 9B integration requires a disposable PostgreSQL database.",
  );
}

test("Gate 9B disposable database baseline proves registry, migrations, and cleanup probe", async () => {
  await assertDisposableDatabase();
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
  assert.equal(Number(migrations[0]?.total ?? -1), GATE9B_EXPECTED_MIGRATION_COUNT);
  assert.equal(Number(migrations[0]?.applied ?? -1), GATE9B_EXPECTED_MIGRATION_COUNT);
  assert.equal(Number(migrations[0]?.failed ?? -1), 0);
  assert.equal(Number(migrations[0]?.rolledBack ?? -1), 0);

  const enumRows = await prisma.$queryRaw<Array<{ label: string; type: string }>>`
    SELECT enum_type.typname AS type, enum_value.enumlabel AS label
    FROM pg_enum AS enum_value
    JOIN pg_type AS enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname IN ('PlatformJobType', 'PlatformJobScheduleKey')
    ORDER BY enum_type.typname, enum_value.enumsortorder
  `;
  assert.deepEqual(
    enumRows.filter((row) => row.type === "PlatformJobType").map((row) => row.label).sort(),
    [...GATE9B_EXPECTED_JOB_TYPES].sort(),
  );
  assert.deepEqual(
    enumRows.filter((row) => row.type === "PlatformJobScheduleKey").map((row) => row.label).sort(),
    [...GATE9B_ALLOWED_STAGING_SCHEDULES].sort(),
  );

  const probeKeyHash = createHash("sha256").update("gate9b:disposable:probe").digest("hex");
  const before = await prisma.distributedRateLimitBucket.findUnique({
    where: { keyHash: probeKeyHash },
  });
  assert.equal(before, null);
  const now = new Date("2026-07-29T12:00:00.000Z");
  await prisma.distributedRateLimitBucket.create({
    data: {
      count: 1,
      expiresAt: new Date("2026-07-29T12:10:00.000Z"),
      keyHash: probeKeyHash,
      keyVersion: 1,
      resetAt: new Date("2026-07-29T12:05:00.000Z"),
      windowStartedAt: now,
    },
  });
  assert.equal(
    (await prisma.distributedRateLimitBucket.findUnique({
      where: { keyHash: probeKeyHash },
    }))?.count,
    1,
  );
  await prisma.distributedRateLimitBucket.deleteMany({
    where: { keyHash: probeKeyHash },
  });
  assert.equal(
    await prisma.distributedRateLimitBucket.findUnique({
      where: { keyHash: probeKeyHash },
    }),
    null,
  );
});

test("Gate 9B runtime snapshot stays truthful before activation on disposable data", () => {
  const result = evaluateGate9BRuntimeSnapshot({
    enabledScheduleKeys: [],
    jobTypes: GATE9B_EXPECTED_JOB_TYPES,
    providerTruth: {
      ai: "DISABLED",
      communications: "NOT_CONFIGURED",
      payment: "DETERMINISTIC_TEST",
      push: "NOT_CONFIGURED",
      storage: "NOT_CONFIGURED",
    },
    scheduleKeys: GATE9B_ALLOWED_STAGING_SCHEDULES,
    stage6Runtime: "NOT_ACTIVATED",
  });
  assert.equal(result.ok, true);
});
