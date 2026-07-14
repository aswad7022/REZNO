import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMERCE_QA_CONFIRMATION_ENV,
  COMMERCE_QA_CONFIRMATION_TOKEN,
  CommerceQaSeedSafetyError,
  validateCommerceQaSeedEnvironment,
} from "../../../scripts/staging/commerce-qa-seed-safety";

const confirmation = {
  [COMMERCE_QA_CONFIRMATION_ENV]: COMMERCE_QA_CONFIRMATION_TOKEN,
};

function expectSafetyBlocker(
  environment: Readonly<Record<string, string | undefined>>,
  secret?: string,
) {
  assert.throws(
    () => validateCommerceQaSeedEnvironment(environment),
    (error: unknown) => {
      assert.ok(error instanceof CommerceQaSeedSafetyError);
      if (secret) assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
}

test("Commerce QA seed safety requires the explicit confirmation token", () => {
  expectSafetyBlocker({ DATABASE_URL: "postgresql://db.example/rezno_staging" });
  expectSafetyBlocker({
    COMMERCE_QA_SEED_CONFIRM: "REZNO_STAGING_ONLY",
    DATABASE_URL: "postgresql://db.example/rezno_staging",
  });
});

test("Commerce QA seed safety accepts only PostgreSQL targets with an explicit stage marker", () => {
  expectSafetyBlocker({ ...confirmation });
  expectSafetyBlocker({ ...confirmation, DATABASE_URL: "mysql://db.example/rezno_staging" });
  expectSafetyBlocker({ ...confirmation, DATABASE_URL: "postgresql://db.example/rezno" });
  expectSafetyBlocker({
    ...confirmation,
    DATABASE_URL: "postgresql://staging-user:staging-password@db.example/rezno",
  });
  expectSafetyBlocker({
    ...confirmation,
    DATABASE_URL: "postgresql://operator:secret@db.example/rezno?project=staging",
  });
  expectSafetyBlocker({
    ...confirmation,
    DATABASE_URL: "postgresql://operator:secret@db.example/rezno?schema=staging",
  });

  const databaseUrl = "postgresql://operator:secret@stage.db.example/rezno?schema=public";
  assert.deepEqual(validateCommerceQaSeedEnvironment({ ...confirmation, DATABASE_URL: databaseUrl }), {
    databaseUrl,
  });
  assert.doesNotThrow(() =>
    validateCommerceQaSeedEnvironment({
      ...confirmation,
      DATABASE_URL: "postgres://operator:secret@db.example/rezno_staging?schema=public",
    }),
  );
});

test("Commerce QA seed safety rejects production markers even when staging is also present", () => {
  const secret = "super-secret-password";
  for (const databaseName of ["rezno_stage_prod", "rezno_staging_production", "rezno_stage_live"]) {
    expectSafetyBlocker(
      {
        ...confirmation,
        DATABASE_URL: `postgresql://operator:${secret}@db.example/${databaseName}`,
      },
      secret,
    );
  }
});
