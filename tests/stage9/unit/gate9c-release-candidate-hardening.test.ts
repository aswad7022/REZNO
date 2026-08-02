import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  GATE9C_CRITICAL_MIGRATION_HASHES,
  GATE9C_DEFERRED_PRODUCTION_BLOCKERS,
  GATE9C_EXPECTED_JOB_TYPE_COUNT,
  GATE9C_EXPECTED_MIGRATION_COUNT,
  GATE9C_EXPECTED_SCHEDULE_COUNT,
  GATE9C_STAGING_ORIGIN,
  GATE9C_STAGING_PROJECT,
  STAGE9_GATE9C_BASE_SHA,
  STAGE9_GATE9C_BRANCH,
  STAGE9_GATE9C_VERSION,
  assertGate9CReleaseCandidate,
  evaluateGate9CReleaseCandidate,
  type Gate9CBuildEvidence,
  type Gate9CDatabaseEvidence,
  type Gate9CDeploymentEvidence,
  type Gate9CReleaseCandidateInput,
} from "../../../features/stage9/gate9c";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const now = new Date("2026-08-01T12:00:00.000Z");
const verifiedAt = "2026-08-01T11:55:00.000Z";
const sourceSha = "a".repeat(40);

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type MutableGate9CInput = Omit<
  Gate9CReleaseCandidateInput,
  "build" | "database" | "deployment" | "environment" | "secretConfiguration"
> & {
  build: Mutable<Gate9CBuildEvidence>;
  database: Mutable<Gate9CDatabaseEvidence>;
  deployment: Mutable<Gate9CDeploymentEvidence>;
  environment: Record<string, string | undefined>;
  secretConfiguration: {
    authSecretConfigured: boolean;
    databaseUrlConfigured: boolean;
    geminiCredentialConfigured: boolean;
  };
};

function healthyInput(): MutableGate9CInput {
  return {
    now,
    environment: {
      BETTER_AUTH_URL: GATE9C_STAGING_ORIGIN,
      NEXT_PUBLIC_APP_URL: GATE9C_STAGING_ORIGIN,
      NODE_ENV: "production",
      REZNO_AI_ENABLED: "false",
      REZNO_AI_GEMINI_ENABLED: "false",
      REZNO_AI_KILL_SWITCH: "true",
      REZNO_DEPLOYMENT_ENV: "staging",
      REZNO_PAYMENT_PROVIDER: "NOT_CONFIGURED",
      REZNO_PLATFORM_RUNTIME_URL: GATE9C_STAGING_ORIGIN,
      REZNO_PUSH_RECEIPT_PROVIDERS: "NOT_CONFIGURED",
      REZNO_STORAGE_PROVIDER: "NOT_CONFIGURED",
      VERCEL_ENV: "production",
    },
    secretConfiguration: {
      authSecretConfigured: true,
      databaseUrlConfigured: true,
      geminiCredentialConfigured: false,
    },
    deployment: {
      authorizedSha: sourceSha,
      githubDefaultBranch: "main",
      githubDefaultBranchHeadSha: sourceSha,
      localHeadSha: sourceSha,
      origin: GATE9C_STAGING_ORIGIN,
      projectSlug: GATE9C_STAGING_PROJECT,
      sourceRef: "main",
      sourceSha,
      status: "READY",
      verifiedAt,
    },
    database: {
      activeJobs: 0,
      appliedMigrations: GATE9C_EXPECTED_MIGRATION_COUNT,
      criticalMigrationHashes: GATE9C_CRITICAL_MIGRATION_HASHES,
      enabledSchedules: GATE9C_EXPECTED_SCHEDULE_COUNT,
      failedMigrations: 0,
      jobTypes: GATE9C_EXPECTED_JOB_TYPE_COUNT,
      openAlerts: 0,
      overdueJobs: 0,
      rolledBackMigrations: 0,
      runningAttempts: 0,
      runningInvocations: 0,
      runtime: "ENABLED",
      schemaDrift: "ABSENT",
      staleLeases: 0,
      totalMigrations: GATE9C_EXPECTED_MIGRATION_COUNT,
      totalSchedules: GATE9C_EXPECTED_SCHEDULE_COUNT,
      verifiedAt,
    },
    build: {
      auditFindings: 0,
      buildPassed: true,
      cancelledTests: 0,
      eslintPassed: true,
      mobileAndroidModules: 1_016,
      mobileIosModules: 1_016,
      mobileProductionOriginConfigured: false,
      mobileWebModules: 752,
      nextRouteCount: 115,
      prismaSchemaDiff: false,
      secretFindings: 0,
      skippedTests: 0,
      sourceSha,
      testsPassed: true,
      todoTests: 0,
      typeScriptPassed: true,
    },
  };
}

test("Gate 9C identifies the release-candidate boundary without claiming production closure", () => {
  assert.equal(STAGE9_GATE9C_BASE_SHA, "c20ba5720e55bdb8676c29cd901ab83916da88fb");
  assert.equal(STAGE9_GATE9C_BRANCH, "codex/stage9-gate9c-release-candidate-hardening");
  assert.equal(STAGE9_GATE9C_VERSION, "stage9-gate9c-release-candidate-hardening-v1");
  assert.equal(GATE9C_STAGING_ORIGIN, "https://rezno-staging.vercel.app");
  assert.equal(GATE9C_STAGING_PROJECT, "rezno-staging");
  assert.equal(GATE9C_EXPECTED_MIGRATION_COUNT, 51);
  assert.equal(GATE9C_EXPECTED_SCHEDULE_COUNT, 13);
  assert.equal(GATE9C_EXPECTED_JOB_TYPE_COUNT, 23);
  assert.deepEqual(GATE9C_DEFERRED_PRODUCTION_BLOCKERS, [
    "STAGE7_PHYSICAL_DEVICE_EVIDENCE",
    "APNS_FCM_PROVIDER_EVIDENCE",
    "PAYMENT_PROVIDER_ADAPTER",
    "STORAGE_PROVIDER_ADAPTER",
    "MOBILE_PRODUCTION_API_ORIGIN",
  ]);
});

test("Gate 9C accepts a clean staging release candidate but keeps production external-input-required", () => {
  const result = evaluateGate9CReleaseCandidate(healthyInput());
  assert.equal(result.ok, true);
  assert.equal(result.reason, "READY");
  assert.equal(result.status, "READY_FOR_STAGING_RELEASE_CANDIDATE");
  assert.equal(result.productionStatus, "EXTERNAL_INPUT_REQUIRED");
  assert.deepEqual(result.findings, []);
  assert.deepEqual(assertGate9CReleaseCandidate(healthyInput()), result);
});

test("Gate 9C origin and environment posture fail closed", () => {
  const cases: Array<[string, (input: MutableGate9CInput) => void, string]> = [
    ["development runtime", (input) => { input.environment.NODE_ENV = "development"; }, "INVALID_RELEASE_ENVIRONMENT"],
    ["production target", (input) => { input.environment.REZNO_DEPLOYMENT_ENV = "production"; }, "INVALID_RELEASE_ENVIRONMENT"],
    ["preview environment", (input) => { input.environment.VERCEL_ENV = "preview"; }, "INVALID_RELEASE_ENVIRONMENT"],
    ["auth origin path", (input) => { input.environment.BETTER_AUTH_URL = `${GATE9C_STAGING_ORIGIN}/signin`; }, "INVALID_RELEASE_ORIGIN"],
    ["public origin query", (input) => { input.environment.NEXT_PUBLIC_APP_URL = `${GATE9C_STAGING_ORIGIN}?preview=1`; }, "INVALID_RELEASE_ORIGIN"],
    ["runtime preview host", (input) => { input.environment.REZNO_PLATFORM_RUNTIME_URL = "https://rezno-git-main-owner.vercel.app"; }, "INVALID_RELEASE_ORIGIN"],
    ["test payment provider", (input) => { input.environment.REZNO_PAYMENT_PROVIDER = "DETERMINISTIC_TEST"; }, "UNSAFE_PROVIDER_POSTURE"],
    ["unknown storage provider", (input) => { input.environment.REZNO_STORAGE_PROVIDER = "S3"; }, "UNSAFE_PROVIDER_POSTURE"],
    ["push provider", (input) => { input.environment.REZNO_PUSH_RECEIPT_PROVIDERS = "FCM"; }, "UNSAFE_PROVIDER_POSTURE"],
    ["AI enabled", (input) => { input.environment.REZNO_AI_ENABLED = "true"; }, "AI_RUNTIME_MUST_REMAIN_DISABLED"],
    ["kill switch off", (input) => { input.environment.REZNO_AI_KILL_SWITCH = "false"; }, "AI_RUNTIME_MUST_REMAIN_DISABLED"],
    ["Gemini credential", (input) => { input.secretConfiguration.geminiCredentialConfigured = true; }, "AI_RUNTIME_MUST_REMAIN_DISABLED"],
    ["auth secret missing", (input) => { input.secretConfiguration.authSecretConfigured = false; }, "MISSING_RELEASE_INPUT"],
  ];

  for (const [label, mutate, expectedCode] of cases) {
    const input = structuredClone(healthyInput());
    mutate(input);
    const result = evaluateGate9CReleaseCandidate(input);
    assert.equal(result.ok, false, label);
    assert.equal(result.findings.some((item) => item.code === expectedCode), true, label);
    assert.equal(JSON.stringify(result).includes("rezno-git-main-owner"), false, label);
  }
});

test("Gate 9C deployment evidence binds main, Vercel staging, the approved alias, and one fresh SHA", () => {
  const cases: Array<[string, (input: MutableGate9CInput) => void, string]> = [
    ["wrong project", (input) => { Object.assign(input.deployment, { projectSlug: "rezno" }); }, "DEPLOYMENT_EVIDENCE_INVALID"],
    ["wrong alias", (input) => { input.deployment.origin = "https://rezno.vercel.app"; }, "DEPLOYMENT_EVIDENCE_INVALID"],
    ["source SHA mismatch", (input) => { input.deployment.sourceSha = "b".repeat(40); }, "DEPLOYMENT_SHA_MISMATCH"],
    ["GitHub SHA mismatch", (input) => { input.deployment.githubDefaultBranchHeadSha = "c".repeat(40); }, "DEPLOYMENT_SHA_MISMATCH"],
    ["malformed SHA", (input) => { input.deployment.authorizedSha = "not-a-sha"; }, "DEPLOYMENT_EVIDENCE_INVALID"],
    ["stale metadata", (input) => { input.deployment.verifiedAt = "2026-08-01T10:00:00.000Z"; }, "DEPLOYMENT_EVIDENCE_STALE"],
    ["future metadata", (input) => { input.deployment.verifiedAt = "2026-08-01T12:01:00.000Z"; }, "DEPLOYMENT_EVIDENCE_STALE"],
  ];
  for (const [label, mutate, expectedCode] of cases) {
    const input = structuredClone(healthyInput());
    mutate(input);
    const result = evaluateGate9CReleaseCandidate(input);
    assert.equal(result.ok, false, label);
    assert.equal(result.findings.some((item) => item.code === expectedCode), true, label);
  }
});

test("Gate 9C requires a current clean database and runtime snapshot", () => {
  const cases: Array<[string, (input: MutableGate9CInput) => void, string]> = [
    ["migration count", (input) => { input.database.totalMigrations = 52; }, "MIGRATION_BASELINE_MISMATCH"],
    ["migration hash", (input) => { input.database.criticalMigrationHashes = {}; }, "MIGRATION_BASELINE_MISMATCH"],
    ["schema drift", (input) => { (input.database as unknown as { schemaDrift: string }).schemaDrift = "PRESENT"; }, "MIGRATION_BASELINE_MISMATCH"],
    ["schedule disabled", (input) => { input.database.enabledSchedules = 12; }, "RUNTIME_NOT_STABLE"],
    ["active backlog", (input) => { input.database.activeJobs = 1; }, "RUNTIME_NOT_STABLE"],
    ["overdue backlog", (input) => { input.database.overdueJobs = 1; }, "RUNTIME_NOT_STABLE"],
    ["open alert", (input) => { input.database.openAlerts = 1; }, "RUNTIME_NOT_STABLE"],
    ["running invocation", (input) => { input.database.runningInvocations = 1; }, "RUNTIME_NOT_STABLE"],
    ["stale lease", (input) => { input.database.staleLeases = 1; }, "RUNTIME_NOT_STABLE"],
    ["stale evidence", (input) => { input.database.verifiedAt = "2026-08-01T10:00:00.000Z"; }, "DATABASE_EVIDENCE_STALE"],
  ];
  for (const [label, mutate, expectedCode] of cases) {
    const input = structuredClone(healthyInput());
    mutate(input);
    const result = evaluateGate9CReleaseCandidate(input);
    assert.equal(result.ok, false, label);
    assert.equal(result.findings.some((item) => item.code === expectedCode), true, label);
  }
});

test("Gate 9C rejects test, build, provenance, performance, audit, and secret regressions", () => {
  const cases: Array<[string, (input: MutableGate9CInput) => void, string]> = [
    ["failed tests", (input) => { input.build.testsPassed = false; }, "BUILD_EVIDENCE_INVALID"],
    ["skipped tests", (input) => { input.build.skippedTests = 1; }, "BUILD_EVIDENCE_INVALID"],
    ["schema diff", (input) => { input.build.prismaSchemaDiff = true; }, "BUILD_EVIDENCE_INVALID"],
    ["build SHA mismatch", (input) => { input.build.sourceSha = "b".repeat(40); }, "BUILD_EVIDENCE_INVALID"],
    ["unapproved mobile production origin", (input) => { input.build.mobileProductionOriginConfigured = true; }, "UNAPPROVED_MOBILE_PRODUCTION_ORIGIN"],
    ["route budget", (input) => { input.build.nextRouteCount = 321; }, "PERFORMANCE_BUDGET_EXCEEDED"],
    ["iOS module budget", (input) => { input.build.mobileIosModules = 1_201; }, "PERFORMANCE_BUDGET_EXCEEDED"],
    ["dependency finding", (input) => { input.build.auditFindings = 1; }, "SECURITY_SCAN_FAILED"],
    ["secret finding", (input) => { input.build.secretFindings = 1; }, "SECURITY_SCAN_FAILED"],
  ];
  for (const [label, mutate, expectedCode] of cases) {
    const input = structuredClone(healthyInput());
    mutate(input);
    const result = evaluateGate9CReleaseCandidate(input);
    assert.equal(result.ok, false, label);
    assert.equal(result.findings.some((item) => item.code === expectedCode), true, label);
  }
});

test("Gate 9C release evidence CLI is non-mutating, redacted, and fail-closed", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "rezno-gate9c-"));
  try {
    const input = healthyInput();
    delete (input as { now?: Date }).now;
    const fresh = new Date().toISOString();
    input.deployment.verifiedAt = fresh;
    input.database.verifiedAt = fresh;
    const evidenceFile = path.join(temp, "evidence.json");
    writeFileSync(evidenceFile, JSON.stringify(input), { mode: 0o600 });
    const run = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(repoRoot, "scripts/stage9/gate9c-release-evidence.ts"),
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          REZNO_STAGE9_GATE9C_EVIDENCE_FILE: evidenceFile,
        },
      },
    );
    assert.equal(run.status, 0, run.stderr);
    const output = JSON.parse(run.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.status, "READY_FOR_STAGING_RELEASE_CANDIDATE");
    assert.equal(output.productionStatus, "EXTERNAL_INPUT_REQUIRED");
    assert.equal(run.stdout.includes(sourceSha), false);
    assert.equal(run.stdout.includes(evidenceFile), false);

    (input as { now?: Date }).now = new Date("2099-01-01T00:00:00.000Z");
    input.deployment.verifiedAt = "2099-01-01T00:00:00.000Z";
    input.database.verifiedAt = "2099-01-01T00:00:00.000Z";
    writeFileSync(evidenceFile, JSON.stringify(input), { mode: 0o600 });
    const forgedClock = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(repoRoot, "scripts/stage9/gate9c-release-evidence.ts"),
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          REZNO_STAGE9_GATE9C_EVIDENCE_FILE: evidenceFile,
        },
      },
    );
    assert.equal(forgedClock.status, 2);
    assert.equal(JSON.parse(forgedClock.stdout).ok, false);

    const unknownSecretField = healthyInput() as MutableGate9CInput & {
      environment: MutableGate9CInput["environment"] & { DATABASE_URL?: string };
    };
    delete (unknownSecretField as { now?: Date }).now;
    unknownSecretField.deployment.verifiedAt = fresh;
    unknownSecretField.database.verifiedAt = fresh;
    unknownSecretField.environment.DATABASE_URL = "must-not-be-accepted";
    writeFileSync(evidenceFile, JSON.stringify(unknownSecretField), { mode: 0o600 });
    const unknownField = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(repoRoot, "scripts/stage9/gate9c-release-evidence.ts"),
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          REZNO_STAGE9_GATE9C_EVIDENCE_FILE: evidenceFile,
        },
      },
    );
    assert.equal(unknownField.status, 2);
    assert.equal(JSON.parse(unknownField.stdout).ok, false);
    assert.equal(unknownField.stdout.includes("DATABASE_URL"), false);

    const unknownMigrationHash = healthyInput();
    delete (unknownMigrationHash as { now?: Date }).now;
    unknownMigrationHash.deployment.verifiedAt = fresh;
    unknownMigrationHash.database.verifiedAt = fresh;
    unknownMigrationHash.database.criticalMigrationHashes = {
      ...GATE9C_CRITICAL_MIGRATION_HASHES,
      UNEXPECTED_MIGRATION: "0".repeat(64),
    };
    writeFileSync(evidenceFile, JSON.stringify(unknownMigrationHash), { mode: 0o600 });
    const extraMigrationKey = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(repoRoot, "scripts/stage9/gate9c-release-evidence.ts"),
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          REZNO_STAGE9_GATE9C_EVIDENCE_FILE: evidenceFile,
        },
      },
    );
    assert.equal(extraMigrationKey.status, 2);
    assert.equal(JSON.parse(extraMigrationKey.stdout).ok, false);
    assert.equal(extraMigrationKey.stdout.includes("UNEXPECTED_MIGRATION"), false);

    const secretBearingMigrationHash = healthyInput();
    delete (secretBearingMigrationHash as { now?: Date }).now;
    secretBearingMigrationHash.deployment.verifiedAt = fresh;
    secretBearingMigrationHash.database.verifiedAt = fresh;
    secretBearingMigrationHash.database.criticalMigrationHashes = {
      ...GATE9C_CRITICAL_MIGRATION_HASHES,
      DATABASE_URL: [
        "postgresql:/",
        "/fake-user:fake-password@fake.invalid/fake",
      ].join(""),
    };
    writeFileSync(evidenceFile, JSON.stringify(secretBearingMigrationHash), {
      mode: 0o600,
    });
    const secretBearingEvidence = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(repoRoot, "scripts/stage9/gate9c-release-evidence.ts"),
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          REZNO_STAGE9_GATE9C_EVIDENCE_FILE: evidenceFile,
        },
      },
    );
    assert.equal(secretBearingEvidence.status, 2);
    assert.deepEqual(JSON.parse(secretBearingEvidence.stdout).findings, [
      "SECRET_REDACTION_FAILURE",
    ]);
    assert.equal(secretBearingEvidence.stdout.includes("DATABASE_URL"), false);
    assert.equal(secretBearingEvidence.stdout.includes("fake-user"), false);
    assert.equal(secretBearingEvidence.stdout.includes("fake-password"), false);
    assert.equal(secretBearingEvidence.stdout.includes("postgresql"), false);

    const missingEnvironment = { ...process.env };
    delete missingEnvironment.REZNO_STAGE9_GATE9C_EVIDENCE_FILE;
    const missing = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(repoRoot, "scripts/stage9/gate9c-release-evidence.ts"),
      ],
      { cwd: repoRoot, encoding: "utf8", env: missingEnvironment },
    );
    assert.equal(missing.status, 2);
    assert.equal(JSON.parse(missing.stdout).ok, false);
    assert.equal(readFileSync(evidenceFile, "utf8").includes(sourceSha), true);
  } finally {
    rmSync(temp, { force: true, recursive: true });
  }
});

test("Gate 9C keeps mobile production closed while preview remains pinned to staging", () => {
  const eas = JSON.parse(readFileSync(path.join(repoRoot, "apps/mobile/eas.json"), "utf8"));
  assert.equal(
    eas.build.preview.env.EXPO_PUBLIC_REZNO_API_BASE_URL,
    GATE9C_STAGING_ORIGIN,
  );
  assert.equal(
    Object.hasOwn(eas.build.production, "env"),
    false,
  );
  const mobileConfig = readFileSync(
    path.join(repoRoot, "apps/mobile/src/config/api-base-url.ts"),
    "utf8",
  );
  assert.match(mobileConfig, /APPROVED_RELEASE_API_ORIGINS/);
  assert.match(mobileConfig, /https:\/\/rezno-staging\.vercel\.app/);
  assert.match(mobileConfig, /is required for a release build/);
});
