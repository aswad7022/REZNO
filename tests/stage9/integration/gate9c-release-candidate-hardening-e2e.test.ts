import assert from "node:assert/strict";
import test from "node:test";

import {
  GATE9C_EXPECTED_JOB_TYPE_COUNT,
  GATE9C_EXPECTED_MIGRATION_COUNT,
  GATE9C_EXPECTED_SCHEDULE_COUNT,
} from "../../../features/stage9/gate9c";
import { prisma } from "../../../lib/db/prisma";

async function assertDisposableDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Gate 9C integration refuses NODE_ENV=production.");
  }
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  assert.match(
    rows[0]?.database ?? "",
    /(?:_test|test_|gate9c|gate9b|gate9a|marketplace_ci)/,
    "Gate 9C integration requires a disposable PostgreSQL database.",
  );
}

test("Gate 9C reads the exact migration and runtime registries without mutating PostgreSQL", async () => {
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
  assert.deepEqual({
    applied: Number(migrations[0]?.applied ?? -1),
    failed: Number(migrations[0]?.failed ?? -1),
    rolledBack: Number(migrations[0]?.rolledBack ?? -1),
    total: Number(migrations[0]?.total ?? -1),
  }, {
    applied: GATE9C_EXPECTED_MIGRATION_COUNT,
    failed: 0,
    rolledBack: 0,
    total: GATE9C_EXPECTED_MIGRATION_COUNT,
  });

  const enumRows = await prisma.$queryRaw<Array<{ label: string; type: string }>>`
    SELECT enum_type.typname AS type, enum_value.enumlabel AS label
    FROM pg_enum AS enum_value
    JOIN pg_type AS enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname IN ('PlatformJobType', 'PlatformJobScheduleKey')
    ORDER BY enum_type.typname, enum_value.enumsortorder
  `;
  assert.equal(
    enumRows.filter((row) => row.type === "PlatformJobType").length,
    GATE9C_EXPECTED_JOB_TYPE_COUNT,
  );
  assert.equal(
    enumRows.filter((row) => row.type === "PlatformJobScheduleKey").length,
    GATE9C_EXPECTED_SCHEDULE_COUNT,
  );

  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
    const checks = await transaction.$queryRaw<Array<{ value: number }>>`
      SELECT 1::int AS value
    `;
    assert.equal(checks[0]?.value, 1);
  });
});
