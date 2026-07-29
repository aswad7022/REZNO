import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  GATE9B_LOCAL_TEST_SOURCE,
  GATE9B_REQUIRED_ADMIN_PERMISSIONS,
  GATE9B_REQUIRED_EXTERNAL_INPUTS,
  GATE9B_RUNTIME_URL_VARIABLE,
  GATE9B_STAGING_ORIGIN,
  GATE9B_STAGING_PROJECT,
  STAGE9_GATE9B_BASE_SHA,
  STAGE9_GATE9B_BRANCH,
  STAGE9_GATE9B_VERSION,
  assertGate9BActivationPreconditions,
  evaluateGate9BRuntimeSnapshot,
  evaluateGate9BActivationPreconditions,
  gate9BDatabaseBindingSha256,
  gate9BMissingExternalInputs,
  gate9BOutputContainsSecretLikeValue,
  parseGate9BStagingDatabaseIdentity,
  validateGate9BDeploymentEvidence,
  validateGate9BEnvironment,
  validateGate9BProviderPosture,
  validateGate9BRuntimeUrl,
  type Gate9BAdminEvidence,
  type Gate9BDeploymentEvidence,
  type Gate9BMigrationEvidence,
  type Gate9BRestorePointEvidence,
} from "../../../features/stage9/gate9b";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const reviewedSha = "810fa41465c3249610ecc52e85e157241157f75e";
const now = new Date("2026-07-29T12:00:00.000Z");

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
    expectedIdentitySource: "neon-api",
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
      {
        expectedHost: "prod.us-east-1.aws.neon.tech",
        expectedIdentitySource: "neon-api",
        expectedRole: "prod",
      },
    ),
    /Gate 9B validation failed closed/,
  );
  assert.throws(
    () => parseGate9BStagingDatabaseIdentity(
      "postgresql://role:secret@staging-pooler.us-east-1.aws.neon.tech/rezno_staging?sslmode=verify-full",
      {
        expectedHost: "staging-pooler.us-east-1.aws.neon.tech",
        expectedIdentitySource: "neon-api",
        expectedRole: "role",
      },
    ),
    /Gate 9B validation failed closed/,
  );
  assert.throws(
    () => parseGate9BStagingDatabaseIdentity(url, {
      expectedHost: host,
      expectedIdentitySource: "from-database-url",
      expectedRole: role,
    }),
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

test("Gate 9B runtime URL validation is exact, HTTPS-only, and credential-free", () => {
  assert.equal(validateGate9BRuntimeUrl(GATE9B_STAGING_ORIGIN).ok, true);
  for (const url of [
    undefined,
    "http://rezno-staging.vercel.app",
    "https://user:pass@rezno-staging.vercel.app",
    "https://rezno-staging.vercel.app?token=secret",
    "https://rezno-staging.vercel.app/#fragment",
    "https://127.0.0.1",
    "https://169.254.169.254",
    "https://rezno.vercel.app",
  ] as const) {
    assert.equal(validateGate9BRuntimeUrl(url).ok, false, String(url));
  }
});

test("Gate 9B activation preconditions fail closed until every independent proof is present", () => {
  const healthy = healthyPreconditions();
  assert.equal(evaluateGate9BActivationPreconditions(healthy).ok, true);
  assert.equal(assertGate9BActivationPreconditions(healthy).deploymentSha, reviewedSha);

  const cases = [
    ["restore point missing", { restorePointEvidence: { ...healthy.restorePointEvidence, restorePointIdPresent: false } }],
    ["restore point unverified", { restorePointEvidence: { ...healthy.restorePointEvidence, providerVerified: false, source: "neon-api" } }],
    ["restore point wrong DB", { restorePointEvidence: { ...healthy.restorePointEvidence, databaseBindingSha256: "0".repeat(64) } }],
    ["restore point stale", {
      restorePointEvidence: {
        ...healthy.restorePointEvidence,
        createdAt: "2026-07-27T12:00:00.000Z",
        expiresAt: "2026-07-28T12:00:00.000Z",
      },
    }],
    ["runtime URL missing", { env: { ...healthy.env, REZNO_PLATFORM_RUNTIME_URL: "" } }],
    ["runtime URL unsafe", { env: { ...healthy.env, REZNO_PLATFORM_RUNTIME_URL: "https://rezno-staging.vercel.app?x=1" } }],
    ["deployed SHA mismatch", { deploymentEvidence: { ...healthy.deploymentEvidence, deploymentSha: "b".repeat(40) } }],
    ["DB host mismatch", { env: { ...healthy.env, REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST: "wrong.us-east-1.aws.neon.tech" }, databaseIdentity: undefined }],
    ["DB role mismatch", { env: { ...healthy.env, REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE: "wrong_role" }, databaseIdentity: undefined }],
    ["production-like DB", {
      databaseIdentity: undefined,
      env: {
        ...healthy.env,
        DATABASE_URL: "postgresql://prod:secret@prod.us-east-1.aws.neon.tech/rezno_production?sslmode=verify-full",
        REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST: "prod.us-east-1.aws.neon.tech",
        REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE: "prod",
      },
    }],
    ["migrations mismatch", { migrationEvidence: { ...healthy.migrationEvidence, applied: 50, failed: 1 } }],
    ["schema drift unverified", { migrationEvidence: { ...healthy.migrationEvidence, schemaDrift: "UNVERIFIED" } }],
    ["provider posture unsafe", { env: { ...healthy.env, REZNO_AI_ENABLED: "true" } }],
    ["Admin context missing", { adminEvidence: { status: "MISSING" } }],
    ["Admin context invalid", { adminEvidence: { status: "INVALID" } }],
  ] satisfies readonly [
    string,
    Partial<ReturnType<typeof healthyPreconditions>>,
  ][];

  for (const [name, override] of cases) {
    let mutationCount = 0;
    assert.throws(() => {
      assertGate9BActivationPreconditions({ ...healthy, ...override });
      mutationCount += 1;
    }, /Gate 9B validation failed closed/, name);
    assert.equal(mutationCount, 0, name);
  }

  let mutationCount = 0;
  assertGate9BActivationPreconditions(healthy);
  mutationCount += 1;
  assert.equal(mutationCount, 1);
});

test("Gate 9B preflight CLI exits non-zero for fail-closed and external-input states", () => {
  const legal = legalLocalPreflightEnv();
  assert.equal(runPreflight(legal).status, 0);

  const cases = [
    ["production-like database", {
      DATABASE_URL: "postgresql://prod:secret@prod.us-east-1.aws.neon.tech/rezno_production?sslmode=verify-full",
      REZNO_STAGE9_GATE9B_ALLOW_LOCAL_TEST_DB: "false",
      REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE: "neon-api",
      REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST: "prod.us-east-1.aws.neon.tech",
      REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE: "prod",
    }],
    ["host mismatch", { REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST: "other.neon.tech" }],
    ["role mismatch", { REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE: "wrong_role" }],
    ["migration mismatch", { REZNO_STAGE9_GATE9B_LOCAL_TEST_MIGRATION_EVIDENCE: "mismatched-50-51" }],
    ["restore point unverified", { REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFICATION_SOURCE: "neon-api" }],
    ["runtime URL missing", { REZNO_PLATFORM_RUNTIME_URL: "" }],
    ["runtime URL unsafe", { REZNO_PLATFORM_RUNTIME_URL: "https://rezno-staging.vercel.app?leak=1" }],
  ] as const;

  for (const [name, override] of cases) {
    const result = runPreflight({ ...legal, ...override });
    assert.notEqual(result.status, 0, name);
    assert.equal(result.stdout.includes("super-secret"), false, name);
    assert.equal(result.stderr.includes("super-secret"), false, name);
  }
});

test("Gate 9B verification chain includes the PR diff whitespace guard", () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.match(packageJson.scripts["test:stage9b:diff-check"], /git diff --check/);
  assert.match(packageJson.scripts["test:stage9b"], /test:stage9b:diff-check/);
});

function healthyPreconditions() {
  const env = legalLocalPreflightEnv();
  const databaseIdentity = parseGate9BStagingDatabaseIdentity(env.DATABASE_URL, {
    allowLocalTest: true,
    expectedHost: env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST,
    expectedIdentitySource: env.REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE,
    expectedRole: env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE,
  });
  const databaseBindingSha256 = gate9BDatabaseBindingSha256(databaseIdentity);
  const restorePointEvidence: Gate9BRestorePointEvidence = {
    createdAt: "2026-07-29T11:59:00.000Z",
    databaseBindingSha256,
    expiresAt: "2026-07-29T13:00:00.000Z",
    providerVerified: true,
    restorePointIdPresent: true,
    source: GATE9B_LOCAL_TEST_SOURCE,
    verifiedAt: "2026-07-29T12:00:00.000Z",
  };
  const migrationEvidence: Gate9BMigrationEvidence = {
    applied: GATE9B_EXPECTED_MIGRATION_COUNT,
    criticalHashes: GATE9B_CRITICAL_MIGRATION_HASHES,
    failed: 0,
    rolledBack: 0,
    schemaDrift: "ABSENT",
    total: GATE9B_EXPECTED_MIGRATION_COUNT,
  };
  const deploymentEvidence: Gate9BDeploymentEvidence = {
    deploymentSha: reviewedSha,
    origin: GATE9B_STAGING_ORIGIN,
    projectSlug: GATE9B_STAGING_PROJECT,
    sourceSha: reviewedSha,
    status: "READY",
  };
  const adminEvidence: Gate9BAdminEvidence = {
    permissions: GATE9B_REQUIRED_ADMIN_PERMISSIONS,
    status: "VERIFIED",
  };
  return {
    adminEvidence,
    databaseIdentity,
    deploymentEvidence,
    env,
    migrationEvidence,
    now,
    requireAdmin: true,
    restorePointEvidence,
  };
}

function legalLocalPreflightEnv(): Record<string, string> {
  const databaseUrl = "postgresql://rezno_test:super-secret@127.0.0.1/rezno_staging?sslmode=disable";
  const identity = parseGate9BStagingDatabaseIdentity(databaseUrl, {
    allowLocalTest: true,
    expectedHost: "127.0.0.1",
    expectedIdentitySource: GATE9B_LOCAL_TEST_SOURCE,
    expectedRole: "rezno_test",
  });
  return {
    BETTER_AUTH_SECRET: "test-secret-not-production",
    BETTER_AUTH_URL: GATE9B_STAGING_ORIGIN,
    DATABASE_URL: databaseUrl,
    GEMINI_API_KEY: "",
    NEXT_PUBLIC_APP_URL: GATE9B_STAGING_ORIGIN,
    NODE_ENV: "test",
    REZNO_AI_ENABLED: "false",
    REZNO_AI_GEMINI_ENABLED: "false",
    REZNO_PAYMENT_PROVIDER: "NOT_CONFIGURED",
    REZNO_PLATFORM_RUNTIME_URL: GATE9B_STAGING_ORIGIN,
    REZNO_PUSH_RECEIPT_PROVIDERS: "NOT_CONFIGURED",
    REZNO_STAGE9_GATE9B_ALLOW_LOCAL_TEST_DB: "true",
    REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE: GATE9B_LOCAL_TEST_SOURCE,
    REZNO_STAGE9_GATE9B_DEPLOYMENT_PROJECT: GATE9B_STAGING_PROJECT,
    REZNO_STAGE9_GATE9B_DEPLOYMENT_SHA: reviewedSha,
    REZNO_STAGE9_GATE9B_DEPLOYMENT_SOURCE_SHA: reviewedSha,
    REZNO_STAGE9_GATE9B_DEPLOYMENT_STATUS: "READY",
    REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST: "127.0.0.1",
    REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE: "rezno_test",
    REZNO_STAGE9_GATE9B_LOCAL_TEST_MIGRATION_EVIDENCE: "accepted-51-51",
    REZNO_STAGE9_GATE9B_RESTORE_POINT_CREATED_AT: "2026-07-29T11:59:00.000Z",
    REZNO_STAGE9_GATE9B_RESTORE_POINT_DATABASE_BINDING_SHA256:
      gate9BDatabaseBindingSha256(identity),
    REZNO_STAGE9_GATE9B_RESTORE_POINT_EXPIRES_AT: "2026-07-29T13:00:00.000Z",
    REZNO_STAGE9_GATE9B_RESTORE_POINT_ID: "local-restore-point-test",
    REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFICATION_SOURCE: GATE9B_LOCAL_TEST_SOURCE,
    REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFIED_AT: "2026-07-29T12:00:00.000Z",
    REZNO_STAGE9_GATE9B_SCHEMA_DRIFT_STATUS: "ABSENT",
    REZNO_STORAGE_PROVIDER: "NOT_CONFIGURED",
  };
}

function runPreflight(env: Record<string, string>) {
  const nodeEnv = env.NODE_ENV === "development" || env.NODE_ENV === "production" || env.NODE_ENV === "test"
    ? env.NODE_ENV
    : "test";
  const childEnv: NodeJS.ProcessEnv = {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    ...env,
    NODE_ENV: nodeEnv,
    NODE_OPTIONS: "--conditions=react-server",
  };
  return spawnSync(path.join(repoRoot, "node_modules/.bin/tsx"), [
    "scripts/stage9/gate9b-preflight.ts",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    env: childEnv,
  });
}
