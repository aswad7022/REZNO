import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import {
  BUSINESS_DAILY_OPERATIONS_STAGE2C_FIXTURE,
  businessDailyOperationsStage2cBookingLane,
  seedBusinessDailyOperationsStage2cFixture,
} from "../../../scripts/staging/business-daily-operations-stage2c-seed-core";
import {
  BUSINESS_DAILY_OPERATIONS_STAGE2C_CONFIRMATION_ENV,
  BUSINESS_DAILY_OPERATIONS_STAGE2C_CONFIRMATION_TOKEN,
  BusinessDailyOperationsStage2cSeedSafetyError,
  validateBusinessDailyOperationsStage2cSeedEnvironment,
} from "../../../scripts/staging/business-daily-operations-stage2c-seed-safety";

const confirmation = {
  [BUSINESS_DAILY_OPERATIONS_STAGE2C_CONFIRMATION_ENV]:
    BUSINESS_DAILY_OPERATIONS_STAGE2C_CONFIRMATION_TOKEN,
};

test("Stage 2C fixture requires the exact token and PostgreSQL staging target", () => {
  for (const environment of [
    {},
    confirmation,
    { ...confirmation, DATABASE_URL: "mysql://stage.example/rezno_staging" },
    { ...confirmation, DATABASE_URL: "postgresql://stage.example/rezno_prod" },
    { ...confirmation, DATABASE_URL: "postgresql://db.example/rezno" },
  ]) {
    assert.throws(
      () => validateBusinessDailyOperationsStage2cSeedEnvironment(environment),
      BusinessDailyOperationsStage2cSeedSafetyError,
    );
  }
  const databaseUrl = "postgresql://operator:secret@stage.example/rezno_staging";
  assert.deepEqual(
    validateBusinessDailyOperationsStage2cSeedEnvironment({
      ...confirmation,
      DATABASE_URL: databaseUrl,
    }),
    { databaseUrl },
  );
});

test("Stage 2C fixture safety errors never echo credentials", () => {
  const secret = "stage2c-super-secret";
  assert.throws(
    () => validateBusinessDailyOperationsStage2cSeedEnvironment({
      ...confirmation,
      DATABASE_URL: `postgresql://operator:${secret}@stage.example/rezno_production`,
    }),
    (error: unknown) => {
      assert.ok(error instanceof BusinessDailyOperationsStage2cSeedSafetyError);
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
});

test("Stage 2C fixture uses one bounded transaction", async () => {
  let options: { maxWait?: number; timeout?: number } | undefined;
  const expected = { namespace: "fixture" };
  const database = {
    $transaction: async (_operation: unknown, transactionOptions: typeof options) => {
      options = transactionOptions;
      return expected;
    },
  } as unknown as PrismaClient;
  assert.equal(await seedBusinessDailyOperationsStage2cFixture(database), expected);
  assert.deepEqual(options, { maxWait: 10_000, timeout: 60_000 });
});

test("Stage 2C fixture keeps generic change workflows in a non-Restaurant organization", () => {
  const fixture = BUSINESS_DAILY_OPERATIONS_STAGE2C_FIXTURE;
  assert.notEqual(fixture.organizations.a.id, fixture.organizations.generic.id);
  assert.notEqual(fixture.organizations.b.id, fixture.organizations.generic.id);
  assert.equal(
    businessDailyOperationsStage2cBookingLane(fixture.bookings.customerRequest),
    "generic-change",
  );
  assert.equal(
    businessDailyOperationsStage2cBookingLane(fixture.bookings.businessProposal),
    "generic-change",
  );
  assert.equal(
    businessDailyOperationsStage2cBookingLane(fixture.bookings.pending),
    "primary-daily",
  );
});
