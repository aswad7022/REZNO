import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import { seedRestaurantQaFixture } from "../../../scripts/staging/restaurant-qa-seed-core";
import {
  RESTAURANT_QA_CONFIRMATION_ENV,
  RESTAURANT_QA_CONFIRMATION_TOKEN,
  RestaurantQaSeedSafetyError,
  validateRestaurantQaSeedEnvironment,
} from "../../../scripts/staging/restaurant-qa-seed-safety";

test("Restaurant QA seed requires exact confirmation and staging marker without leaking secrets", () => {
  const confirmation = { [RESTAURANT_QA_CONFIRMATION_ENV]: RESTAURANT_QA_CONFIRMATION_TOKEN };
  for (const environment of [
    {},
    confirmation,
    { ...confirmation, DATABASE_URL: "postgresql://db.example/rezno" },
    { ...confirmation, DATABASE_URL: "postgresql://stage.example/rezno_prod" },
    { ...confirmation, DATABASE_URL: "postgresql://stage.example/rezno_live" },
  ]) {
    assert.throws(() => validateRestaurantQaSeedEnvironment(environment), RestaurantQaSeedSafetyError);
  }
  const databaseUrl = "postgresql://operator:secret@stage.example/rezno_staging";
  assert.deepEqual(validateRestaurantQaSeedEnvironment({ ...confirmation, DATABASE_URL: databaseUrl }), { databaseUrl });
});

test("Restaurant QA seed uses one bounded remote transaction", async () => {
  let options: { maxWait?: number; timeout?: number } | undefined;
  const expected = {
    branchId: "branch",
    businessSlug: "business",
    customerId: "customer",
    managementBookingIds: ["cancellable", "reschedulable", "completed", "cancelled"],
    ownerMemberId: "owner",
  };
  const database = {
    $transaction: async (_operation: unknown, transactionOptions: typeof options) => {
      options = transactionOptions;
      return expected;
    },
  } as unknown as PrismaClient;
  assert.deepEqual(await seedRestaurantQaFixture(database), expected);
  assert.deepEqual(options, { maxWait: 10_000, timeout: 30_000 });
});
