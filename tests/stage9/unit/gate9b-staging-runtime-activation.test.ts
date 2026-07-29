import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PLATFORM_SCHEDULE_DEFAULTS } from "../../../features/platform-operations/services/admin";
import {
  GATE9B_ALLOWED_STAGING_SCHEDULES,
  GATE9B_CRITICAL_MIGRATION_HASHES,
  GATE9B_EXPECTED_JOB_TYPES,
  GATE9B_EXPECTED_MIGRATION_COUNT,
  GATE9B_REQUIRED_ADMIN_PERMISSIONS,
  GATE9B_REQUIRED_EXTERNAL_INPUTS,
  GATE9B_RUNTIME_URL_VARIABLE,
  GATE9B_STAGING_ORIGIN,
  GATE9B_STAGING_PROJECT,
  STAGE9_GATE9B_BASE_SHA,
  STAGE9_GATE9B_BRANCH,
  STAGE9_GATE9B_VERSION,
  evaluateGate9BRuntimeSnapshot,
  gate9BMissingExternalInputs,
  gate9BOutputContainsSecretLikeValue,
  parseGate9BStagingDatabaseIdentity,
  validateGate9BDeploymentEvidence,
  validateGate9BEnvironment,
  validateGate9BProviderPosture,
} from "../../../features/stage9/gate9b";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

test("Gate 9B records the author scope without starting Gate 9C or production", () => {
  assert.equal(STAGE9_GATE9B_BASE_SHA, "032e8fe756d5ffbc67f079a2d53cb47e2f3b782d");
  assert.equal(STAGE9_GATE9B_BRANCH, "feat/stage9-staging-runtime-activation");
  assert.equal(STAGE9_GATE9B_VERSION, "stage9-gate9b-staging-runtime-activation-v1");
  assert.equal(GATE9B_STAGING_PROJECT, "rezno-staging");
  assert.equal(GATE9B_STAGING_ORIGIN, "https://rezno-staging.vercel.app");
  assert.equal(GATE9B_RUNTIME_URL_VARIABLE, "REZNO_PLATFORM_RUNTIME_URL");
  assert.equal(GATE9B_EXPECTED_JOB_TYPES.length, 23);
  assert.equal(GATE9B_ALLOWED_STAGING_SCHEDULES.length, 13);
  assert.deepEqual(
    GATE9B_REQUIRED_ADMIN_PERMISSIONS,
    [
      "PLATFORM_JOBS_VIEW",
      "PLATFORM_JOBS_MANAGE",
      "PLATFORM_OPERATIONS_VIEW",
      "PLATFORM_OPERATIONS_MANAGE",
      "STORAGE_RECORDS_VIEW",
      "STORAGE_RECORDS_MANAGE",
      "NOTIFICATIONS_VIEW",
      "NOTIFICATIONS_SEND",
      "COMMUNICATIONS_DISPATCH",
      "PAYMENTS_VIEW",
      "PAYMENTS_RECONCILE",
      "PAYMENTS_REFUND",
      "SETTLEMENTS_VIEW",
      "SETTLEMENTS_MANAGE",
      "COMMERCE_ORDERS_VIEW",
      "COMMERCE_ORDERS_MANAGE",
    ],
  );
});

test("Gate 9B requires external staging identity before write operations", () => {
  assert.deepEqual(
    gate9BMissingExternalInputs({}).sort(),
    GATE9B_REQUIRED_EXTERNAL_INPUTS.map((item) => item.name).sort(),
  );
  const missing = validateGate9BEnvironment({
    BETTER_AUTH_URL: GATE9B_STAGING_ORIGIN,
    NEXT_PUBLIC_APP_URL: GATE9B_STAGING_ORIGIN,
    REZNO_AI_ENABLED: "false",
    REZNO_AI_GEMINI_ENABLED: "false",
    REZNO_PAYMENT_PROVIDER: "DETERMINISTIC_TEST",
    REZNO_PLATFORM_RUNTIME_URL: GATE9B_STAGING_ORIGIN,
    REZNO_STORAGE_PROVIDER: "NOT_CONFIGURED",
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.externalInputRequired, true);
  assert.equal(
    missing.findings.some((finding) => finding.code === "MISSING_EXTERNAL_INPUT"),
    true,
  );
  assert.equal(gate9BOutputContainsSecretLikeValue(missing), false);
});

test("Gate 9B database identity is exact, redacted, and production-refusing", () => {
  const host = "staging-branch.us-east-1.aws.neon.tech";
  const role = "rezno_staging_owner";
  const url = `postgresql://${role}:super-secret-value@${host}/rezno_staging?sslmode=verify-full`;
  const identity = parseGate9BStagingDatabaseIdentity(url, {
    expectedHost: host,
    expectedRole: role,
  });
  assert.equal(identity.database, "rezno_staging");
  assert.equal(identity.directNonPooler, true);
  assert.equal(identity.hostSuffix, "aws.neon.tech");
  assert.equal(identity.hostSha256, createHash("sha256").update(host).digest("hex"));
  assert.equal(identity.roleSha256, createHash("sha256").update(role).digest("hex"));
  assert.equal(JSON.stringify(identity).includes("super-secret-value"), false);
  assert.equal(JSON.stringify(identity).includes(host), false);
  assert.throws(
    () => parseGate9BStagingDatabaseIdentity(
      "postgresql://prod:secret@prod.us-east-1.aws.neon.tech/rezno_production?sslmode=verify-full",
      { expectedHost: "prod.us-east-1.aws.neon.tech", expectedRole: "prod" },
    ),
    /Gate 9B validation failed closed/,
  );
  assert.throws(
    () => parseGate9BStagingDatabaseIdentity(
      "postgresql://role:secret@staging-pooler.us-east-1.aws.neon.tech/rezno_staging?sslmode=verify-full",
      { expectedHost: "staging-pooler.us-east-1.aws.neon.tech", expectedRole: "role" },
    ),
    /Gate 9B validation failed closed/,
  );
});

test("Gate 9B deployment evidence accepts only the staging project and exact source SHA", () => {
  assert.equal(validateGate9BDeploymentEvidence({
    deploymentSha: "a".repeat(40),
    origin: GATE9B_STAGING_ORIGIN,
    projectSlug: GATE9B_STAGING_PROJECT,
    sourceSha: "a".repeat(40),
    status: "SUCCESS",
  }).ok, true);
  const production = validateGate9BDeploymentEvidence({
    deploymentSha: "a".repeat(40),
    origin: "https://rezno.vercel.app",
    projectSlug: "rezno",
    sourceSha: "a".repeat(40),
    status: "SUCCESS",
  });
  assert.equal(production.ok, false);
  assert.equal(
    production.findings.some((finding) => finding.code === "PRODUCTION_TARGET_FORBIDDEN"),
    true,
  );
  const mismatch = validateGate9BDeploymentEvidence({
    deploymentSha: "b".repeat(40),
    origin: GATE9B_STAGING_ORIGIN,
    projectSlug: GATE9B_STAGING_PROJECT,
    sourceSha: "a".repeat(40),
    status: "SUCCESS",
  });
  assert.equal(mismatch.ok, false);
  assert.equal(
    mismatch.findings.some((finding) => finding.code === "DEPLOYMENT_SHA_MISMATCH"),
    true,
  );
});

test("Gate 9B provider posture keeps Gemini, push, and real external providers disabled", () => {
  assert.deepEqual(validateGate9BProviderPosture({
    REZNO_AI_ENABLED: "false",
    REZNO_AI_GEMINI_ENABLED: "false",
    REZNO_PAYMENT_PROVIDER: "DETERMINISTIC_TEST",
    REZNO_STORAGE_PROVIDER: "NOT_CONFIGURED",
  }), []);
  const unsafe = validateGate9BProviderPosture({
    GEMINI_API_KEY: "secret-key-that-must-not-leak",
    REZNO_AI_ENABLED: "true",
    REZNO_PAYMENT_PROVIDER: "STRIPE",
    REZNO_PUSH_RECEIPT_PROVIDERS: "FCM",
    REZNO_STORAGE_PROVIDER: "S3",
  });
  assert.equal(unsafe.length >= 4, true);
  assert.equal(JSON.stringify(unsafe).includes("secret-key-that-must-not-leak"), false);
});

test("Gate 9B runtime registry matches the accepted Stage 6 implementation", () => {
  assert.deepEqual(
    PLATFORM_SCHEDULE_DEFAULTS.map((item) => item.scheduleKey).sort(),
    [...GATE9B_ALLOWED_STAGING_SCHEDULES].sort(),
  );
  const inactive = evaluateGate9BRuntimeSnapshot({
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
  assert.equal(inactive.ok, true);
  const activated = evaluateGate9BRuntimeSnapshot({
    enabledScheduleKeys: GATE9B_ALLOWED_STAGING_SCHEDULES,
    jobTypes: GATE9B_EXPECTED_JOB_TYPES,
    providerTruth: {
      ai: "DISABLED",
      communications: "NOT_CONFIGURED",
      payment: "NOT_CONFIGURED",
      push: "NOT_CONFIGURED",
      storage: "DETERMINISTIC_TEST",
    },
    scheduleKeys: GATE9B_ALLOWED_STAGING_SCHEDULES,
    stage6Runtime: "STAGING_ACTIVATED_PRODUCTION_NOT_ACTIVATED",
  });
  assert.equal(activated.ok, true);
  const incomplete = evaluateGate9BRuntimeSnapshot({
    enabledScheduleKeys: ["PLATFORM_HEALTH_PROBE"],
    jobTypes: GATE9B_EXPECTED_JOB_TYPES.slice(0, 22),
    providerTruth: {
      ai: "DISABLED",
      communications: "NOT_CONFIGURED",
      payment: "NOT_CONFIGURED",
      push: "NOT_CONFIGURED",
      storage: "NOT_CONFIGURED",
    },
    scheduleKeys: GATE9B_ALLOWED_STAGING_SCHEDULES,
    stage6Runtime: "STAGING_ACTIVATED_PRODUCTION_NOT_ACTIVATED",
  });
  assert.equal(incomplete.ok, false);
  assert.equal(
    incomplete.findings.some((finding) => finding.code === "RUNTIME_REGISTRY_MISMATCH"),
    true,
  );
});

test("Gate 9B migration baseline remains exactly at 51 migrations with approved hashes", () => {
  const migrationRoot = path.join(repoRoot, "prisma/migrations");
  const migrationDirs = readdirSync(migrationRoot)
    .filter((entry) => statSync(path.join(migrationRoot, entry)).isDirectory())
    .sort();
  assert.equal(migrationDirs.length, GATE9B_EXPECTED_MIGRATION_COUNT);
  assert.equal(
    migrationDirs.some((entry) => entry.includes("migration_52") || entry.includes("stage9")),
    false,
  );
  for (const [migration, expectedHash] of Object.entries(GATE9B_CRITICAL_MIGRATION_HASHES)) {
    const file = path.join(migrationRoot, migration, "migration.sql");
    assert.equal(existsSync(file), true, migration);
    assert.equal(
      createHash("sha256").update(readFileSync(file)).digest("hex"),
      expectedHash,
      migration,
    );
  }
});
