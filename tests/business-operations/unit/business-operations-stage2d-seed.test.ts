import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import {
  BUSINESS_OPERATIONS_STAGE2D_FIXTURE,
  seedBusinessOperationsStage2dClosureFixture,
} from "../../../scripts/staging/business-operations-stage2d-closure-seed-core";
import {
  BUSINESS_OPERATIONS_STAGE2D_CONFIRMATION_ENV,
  BUSINESS_OPERATIONS_STAGE2D_CONFIRMATION_TOKEN,
  BusinessOperationsStage2dSeedSafetyError,
  validateBusinessOperationsStage2dSeedEnvironment,
} from "../../../scripts/staging/business-operations-stage2d-closure-seed-safety";

const confirmation = {
  [BUSINESS_OPERATIONS_STAGE2D_CONFIRMATION_ENV]:
    BUSINESS_OPERATIONS_STAGE2D_CONFIRMATION_TOKEN,
};

test("Stage 2D fixture requires the exact token and PostgreSQL staging target", () => {
  for (const environment of [
    {},
    confirmation,
    { ...confirmation, DATABASE_URL: "mysql://stage.example/rezno_staging" },
    { ...confirmation, DATABASE_URL: "postgresql://stage.example/rezno_prod" },
    { ...confirmation, DATABASE_URL: "postgresql://db.example/rezno" },
  ]) {
    assert.throws(
      () => validateBusinessOperationsStage2dSeedEnvironment(environment),
      BusinessOperationsStage2dSeedSafetyError,
    );
  }
  const databaseUrl = "postgresql://operator:secret@stage.example/rezno_staging";
  assert.deepEqual(
    validateBusinessOperationsStage2dSeedEnvironment({
      ...confirmation,
      DATABASE_URL: databaseUrl,
    }),
    { databaseUrl },
  );
});

test("Stage 2D fixture errors never echo credentials", () => {
  const secret = "stage2d-super-secret";
  assert.throws(
    () => validateBusinessOperationsStage2dSeedEnvironment({
      ...confirmation,
      DATABASE_URL: `postgresql://operator:${secret}@stage.example/rezno_production`,
    }),
    (error: unknown) => {
      assert.ok(error instanceof BusinessOperationsStage2dSeedSafetyError);
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
});

test("Stage 2D fixture uses one bounded transaction", async () => {
  let options: { maxWait?: number; timeout?: number } | undefined;
  const expected = { fingerprint: "fixture" };
  const database = {
    $transaction: async (
      _operation: unknown,
      transactionOptions: typeof options,
    ) => {
      options = transactionOptions;
      return expected;
    },
  } as unknown as PrismaClient;
  assert.equal(
    await seedBusinessOperationsStage2dClosureFixture(database),
    expected,
  );
  assert.deepEqual(options, { maxWait: 10_000, timeout: 60_000 });
});

test("Stage 2D fixture identifiers and foreign sentinels are deterministic", () => {
  const fixture = BUSINESS_OPERATIONS_STAGE2D_FIXTURE;
  assert.equal(fixture.namespace, "rezno-qa-business-operations-stage2d-closure");
  assert.notEqual(fixture.organizations.management[0], fixture.organizations.foreign[0]);
  assert.notEqual(fixture.people.staffA[0], fixture.people.staffB[0]);
  assert.equal(new Set(Object.values(fixture.bookings)).size, Object.keys(fixture.bookings).length);
});
