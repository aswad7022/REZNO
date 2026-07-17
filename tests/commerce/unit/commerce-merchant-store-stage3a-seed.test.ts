import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import {
  COMMERCE_MERCHANT_STORE_STAGE3A_FIXTURE,
  seedCommerceMerchantStoreStage3aFixture,
} from "../../../scripts/staging/commerce-merchant-store-stage3a-seed-core";
import {
  COMMERCE_MERCHANT_STORE_STAGE3A_CONFIRMATION_ENV,
  COMMERCE_MERCHANT_STORE_STAGE3A_CONFIRMATION_TOKEN,
  CommerceMerchantStoreStage3aSeedSafetyError,
  validateCommerceMerchantStoreStage3aSeedEnvironment,
} from "../../../scripts/staging/commerce-merchant-store-stage3a-seed-safety";

const confirmation = {
  [COMMERCE_MERCHANT_STORE_STAGE3A_CONFIRMATION_ENV]:
    COMMERCE_MERCHANT_STORE_STAGE3A_CONFIRMATION_TOKEN,
};

test("Stage 3A fixture requires the exact token and a PostgreSQL staging target", () => {
  for (const environment of [
    {},
    confirmation,
    { ...confirmation, DATABASE_URL: "mysql://stage.example/rezno_staging" },
    { ...confirmation, DATABASE_URL: "postgresql://stage.example/rezno_prod" },
    { ...confirmation, DATABASE_URL: "postgresql://db.example/rezno" },
  ]) {
    assert.throws(
      () => validateCommerceMerchantStoreStage3aSeedEnvironment(environment),
      CommerceMerchantStoreStage3aSeedSafetyError,
    );
  }
  const databaseUrl = "postgresql://operator:secret@stage.example/rezno_staging";
  assert.deepEqual(
    validateCommerceMerchantStoreStage3aSeedEnvironment({ ...confirmation, DATABASE_URL: databaseUrl }),
    { databaseUrl },
  );
});

test("Stage 3A fixture safety errors never echo credentials", () => {
  const secret = "stage3a-super-secret";
  assert.throws(
    () => validateCommerceMerchantStoreStage3aSeedEnvironment({
      ...confirmation,
      DATABASE_URL: `postgresql://operator:${secret}@stage.example/rezno_production`,
    }),
    (error: unknown) => {
      assert.ok(error instanceof CommerceMerchantStoreStage3aSeedSafetyError);
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
});

test("Stage 3A fixture uses one bounded serializable transaction", async () => {
  let options: { isolationLevel?: unknown; maxWait?: number; timeout?: number } | undefined;
  const expected = { fingerprint: "fixture" };
  const database = {
    $transaction: async (_operation: unknown, transactionOptions: typeof options) => {
      options = transactionOptions;
      return expected;
    },
  } as unknown as PrismaClient;
  assert.equal(await seedCommerceMerchantStoreStage3aFixture(database), expected);
  assert.equal(options?.isolationLevel, "Serializable");
  assert.deepEqual({ maxWait: options?.maxWait, timeout: options?.timeout }, { maxWait: 10_000, timeout: 60_000 });
});

test("Stage 3A fixture identities, Store states and probes are deterministic", () => {
  const fixture = COMMERCE_MERCHANT_STORE_STAGE3A_FIXTURE;
  assert.equal(fixture.namespace, "rezno-qa-commerce-merchant-store-stage3a");
  assert.equal(new Set(Object.values(fixture.organizations).map(([id]) => id)).size, Object.keys(fixture.organizations).length);
  assert.equal(new Set(Object.values(fixture.stores).map(([id]) => id)).size, Object.keys(fixture.stores).length);
  assert.equal(fixture.unsafeImageProbe.startsWith("https://127.0.0.1/"), true);
  assert.notEqual(fixture.stores.draft[1], fixture.stores.foreign[1]);
});
