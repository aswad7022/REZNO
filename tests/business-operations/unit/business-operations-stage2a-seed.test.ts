import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { seedBusinessOperationsStage2aFixture } from "../../../scripts/staging/business-operations-stage2a-seed-core";
import {
  BUSINESS_OPERATIONS_STAGE2A_CONFIRMATION_ENV,
  BUSINESS_OPERATIONS_STAGE2A_CONFIRMATION_TOKEN,
  BusinessOperationsStage2aSeedSafetyError,
  validateBusinessOperationsStage2aSeedEnvironment,
} from "../../../scripts/staging/business-operations-stage2a-seed-safety";

const confirmation = {
  [BUSINESS_OPERATIONS_STAGE2A_CONFIRMATION_ENV]: BUSINESS_OPERATIONS_STAGE2A_CONFIRMATION_TOKEN,
};

test("Stage 2A fixture requires confirmation and an explicit PostgreSQL staging target", () => {
  for (const environment of [
    {},
    confirmation,
    { ...confirmation, DATABASE_URL: "mysql://stage.example/rezno_staging" },
    { ...confirmation, DATABASE_URL: "postgresql://stage.example/rezno_prod" },
    { ...confirmation, DATABASE_URL: "postgresql://db.example/rezno" },
  ]) {
    assert.throws(() => validateBusinessOperationsStage2aSeedEnvironment(environment), BusinessOperationsStage2aSeedSafetyError);
  }
  const databaseUrl = "postgresql://operator:secret@stage.example/rezno_staging";
  assert.deepEqual(validateBusinessOperationsStage2aSeedEnvironment({ ...confirmation, DATABASE_URL: databaseUrl }), { databaseUrl });
});

test("Stage 2A fixture safety errors never echo credentials", () => {
  const secret = "stage2a-super-secret";
  assert.throws(() => validateBusinessOperationsStage2aSeedEnvironment({
    ...confirmation,
    DATABASE_URL: `postgresql://operator:${secret}@stage.example/rezno_production`,
  }), (error: unknown) => {
    assert.ok(error instanceof BusinessOperationsStage2aSeedSafetyError);
    assert.equal(error.message.includes(secret), false);
    return true;
  });
});

test("Stage 2A fixture uses one bounded remote transaction", async () => {
  let options: { maxWait?: number; timeout?: number } | undefined;
  const expected = { namespace: "fixture" };
  const database = {
    $transaction: async (_operation: unknown, transactionOptions: typeof options) => {
      options = transactionOptions;
      return expected;
    },
  } as unknown as PrismaClient;
  assert.equal(await seedBusinessOperationsStage2aFixture(database), expected);
  assert.deepEqual(options, { maxWait: 10_000, timeout: 60_000 });
});
