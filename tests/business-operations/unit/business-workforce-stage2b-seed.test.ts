import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { seedBusinessWorkforceStage2bFixture } from "../../../scripts/staging/business-workforce-stage2b-seed-core";
import {
  BUSINESS_WORKFORCE_STAGE2B_CONFIRMATION_ENV,
  BUSINESS_WORKFORCE_STAGE2B_CONFIRMATION_TOKEN,
  BusinessWorkforceStage2bSeedSafetyError,
  validateBusinessWorkforceStage2bSeedEnvironment,
} from "../../../scripts/staging/business-workforce-stage2b-seed-safety";

const confirmation = {
  [BUSINESS_WORKFORCE_STAGE2B_CONFIRMATION_ENV]: BUSINESS_WORKFORCE_STAGE2B_CONFIRMATION_TOKEN,
};

test("Stage 2B fixture requires confirmation and an explicit PostgreSQL staging target", () => {
  for (const environment of [
    {},
    confirmation,
    { ...confirmation, DATABASE_URL: "mysql://stage.example/rezno_staging" },
    { ...confirmation, DATABASE_URL: "postgresql://stage.example/rezno_prod" },
    { ...confirmation, DATABASE_URL: "postgresql://db.example/rezno" },
  ]) {
    assert.throws(() => validateBusinessWorkforceStage2bSeedEnvironment(environment), BusinessWorkforceStage2bSeedSafetyError);
  }
  const databaseUrl = "postgresql://operator:secret@stage.example/rezno_staging";
  assert.deepEqual(validateBusinessWorkforceStage2bSeedEnvironment({ ...confirmation, DATABASE_URL: databaseUrl }), { databaseUrl });
});

test("Stage 2B fixture safety errors never echo credentials", () => {
  const secret = "stage2b-super-secret";
  assert.throws(() => validateBusinessWorkforceStage2bSeedEnvironment({
    ...confirmation,
    DATABASE_URL: `postgresql://operator:${secret}@stage.example/rezno_production`,
  }), (error: unknown) => {
    assert.ok(error instanceof BusinessWorkforceStage2bSeedSafetyError);
    assert.equal(error.message.includes(secret), false);
    return true;
  });
});

test("Stage 2B fixture uses one bounded transaction", async () => {
  let options: { maxWait?: number; timeout?: number } | undefined;
  const expected = { namespace: "fixture" };
  const database = {
    $transaction: async (_operation: unknown, transactionOptions: typeof options) => {
      options = transactionOptions;
      return expected;
    },
  } as unknown as PrismaClient;
  assert.equal(await seedBusinessWorkforceStage2bFixture(database), expected);
  assert.deepEqual(options, { maxWait: 10_000, timeout: 60_000 });
});
