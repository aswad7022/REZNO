import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GATE9D_CRITICAL_MIGRATION_HASHES,
  GATE9D_EXPECTED_JOB_TYPE_COUNT,
  GATE9D_EXPECTED_MIGRATION_COUNT,
  GATE9D_EXPECTED_SCHEDULE_COUNT,
  GATE9D_REQUIRED_EXTERNAL_BLOCKERS,
  GATE9D_STAGING_ORIGIN,
  GATE9D_STAGING_PROJECT,
  STAGE9_GATE9D_BASE_SHA,
  STAGE9_GATE9D_BRANCH,
  STAGE9_GATE9D_VERSION,
  assertGate9DFinalReleaseClosure,
  containsGate9DSecretLikeEvidence,
  evaluateGate9DFinalReleaseClosure,
  type Gate9DExternalEvidenceItem,
  type Gate9DFinalReleaseClosureInput,
} from "../../../features/stage9/gate9d";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const now = new Date("2026-08-03T12:00:00.000Z");
const verifiedAt = "2026-08-03T11:55:00.000Z";
const sourceSha = "a".repeat(40);

type DeepMutable<T> = T extends Date ? T
  : T extends readonly (infer U)[] ? Array<DeepMutable<U>>
  : T extends object ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
  : T;
type MutableGate9DInput = DeepMutable<Gate9DFinalReleaseClosureInput>;

function deferredItem(status: Gate9DExternalEvidenceItem["status"]) {
  return { source: "NONE" as const, status };
}

function passedItem(
  source: Exclude<Gate9DExternalEvidenceItem["source"], "NONE" | "SELF_ATTESTED">,
  evidenceRef: string,
) {
  return {
    evidenceRef,
    source,
    status: "PASSED" as const,
    verifiedAt,
  };
}

function externalValidationInput(): MutableGate9DInput {
  return {
    now,
    gates: {
      aiGates: "CLOSED",
      gate9A: "CLOSED",
      gate9B: "CLOSED",
      gate9C: "CLOSED",
      pr100: "OUT_OF_SCOPE",
      stage6ProductionRuntime: "NOT_ACTIVATED",
      stage6StagingRuntime: "CLOSED",
      stage7ExternalValidation: "DEFERRED_BY_OWNER",
      stages1Through8: "CLOSED_WITH_STAGE7_EXTERNAL_DEFERRED",
    },
    inventory: {
      androidHermesModules: 1_016,
      buildPassed: true,
      criticalMigrationHashes: { ...GATE9D_CRITICAL_MIGRATION_HASHES },
      eslintPassed: true,
      expoDoctorPassed: true,
      gate9dVersion: STAGE9_GATE9D_VERSION,
      iosHermesModules: 1_016,
      migration52Present: false,
      migrationCount: GATE9D_EXPECTED_MIGRATION_COUNT,
      mobileProductionOriginConfigured: false,
      mobileWebModules: 752,
      nextRouteCount: 115,
      packageVersion: "0.1.0",
      prismaSchemaDiff: false,
      sourceSha,
      testFailures: 0,
      testSkips: 0,
      testTodos: 0,
      testsPassed: true,
      typeScriptPassed: true,
    },
    operations: {
      goNoGoMatrixComplete: true,
      incidentRunbookComplete: true,
      monitoringRunbookComplete: true,
      postReleaseObservationPlanComplete: true,
      rollbackRunbookComplete: true,
    },
    production: {
      aiProductionActivation: deferredItem("DEFERRED_BY_OWNER"),
      androidPhysicalDevice: deferredItem("DEFERRED_BY_OWNER"),
      apnsFcmProvider: deferredItem("NOT_CONFIGURED"),
      appStoreApproval: deferredItem("NOT_APPROVED"),
      geminiProductionSecret: deferredItem("DEFERRED_BY_OWNER"),
      iosPhysicalDevice: deferredItem("DEFERRED_BY_OWNER"),
      mobileProductionOrigin: deferredItem("NOT_CONFIGURED"),
      ownerProductionAuthorization: deferredItem("NOT_AUTHORIZED"),
      paymentProvider: deferredItem("NOT_IMPLEMENTED"),
      playStoreApproval: deferredItem("NOT_APPROVED"),
      productionAi: "DISABLED",
      productionRuntime: "NOT_ACTIVATED",
      storageProvider: deferredItem("NOT_IMPLEMENTED"),
    },
    security: {
      clientBundleSecretFindings: 0,
      dependencyAuditFindings: 0,
      privacyScanFindings: 0,
      productionMutationPerformed: false,
      productionSecretsChanged: false,
      secretScanFindings: 0,
    },
    source: {
      authorizedSha: sourceSha,
      ciConclusion: "success",
      githubDefaultBranch: "main",
      githubDefaultBranchHeadSha: sourceSha,
      localHeadSha: sourceSha,
      repository: "aswad7022/REZNO",
      sources: [
        "REPOSITORY_SOURCE",
        "GITHUB_API",
        "GITHUB_ACTIONS",
        "VERCEL_API",
      ],
      vercelOrigin: GATE9D_STAGING_ORIGIN,
      vercelProjectSlug: GATE9D_STAGING_PROJECT,
      vercelSourceRef: "main",
      vercelSourceSha: sourceSha,
      vercelStatus: "READY",
      verifiedAt,
    },
    staging: {
      activeJobs: 0,
      appliedMigrations: GATE9D_EXPECTED_MIGRATION_COUNT,
      enabledSchedules: GATE9D_EXPECTED_SCHEDULE_COUNT,
      failedMigrations: 0,
      jobTypes: GATE9D_EXPECTED_JOB_TYPE_COUNT,
      openAlerts: 0,
      overdueJobs: 0,
      provider: "GITHUB_ACTIONS_SCHEDULED_HTTP",
      rolledBackMigrations: 0,
      runningAttempts: 0,
      runningInvocations: 0,
      runtime: "ENABLED",
      schemaDrift: "ABSENT",
      staleLeases: 0,
      totalMigrations: GATE9D_EXPECTED_MIGRATION_COUNT,
      totalSchedules: GATE9D_EXPECTED_SCHEDULE_COUNT,
      verifiedAt,
    },
  };
}

function readyInput(): MutableGate9DInput {
  const input = externalValidationInput();
  input.production = {
    aiProductionActivation: passedItem(
      "OWNER_APPROVAL",
      "https://github.com/aswad7022/REZNO/issues/9001",
    ),
    androidPhysicalDevice: passedItem(
      "GOOGLE_PLAY_CONSOLE",
      "eas-build:11111111-1111-4111-8111-111111111111",
    ),
    apnsFcmProvider: passedItem(
      "APNS_FCM_PROVIDER",
      "provider-evidence:apns-fcm-2026-08-03",
    ),
    appStoreApproval: passedItem(
      "APPLE_CONNECT",
      "store-review:apple-2026-08-03",
    ),
    geminiProductionSecret: passedItem(
      "OWNER_APPROVAL",
      "https://github.com/aswad7022/REZNO/issues/9002",
    ),
    iosPhysicalDevice: passedItem(
      "APPLE_CONNECT",
      "eas-build:22222222-2222-4222-8222-222222222222",
    ),
    mobileProductionOrigin: passedItem(
      "OWNER_APPROVAL",
      "https://github.com/aswad7022/REZNO/issues/9003",
    ),
    ownerProductionAuthorization: passedItem(
      "OWNER_APPROVAL",
      "https://github.com/aswad7022/REZNO/issues/9004",
    ),
    paymentProvider: passedItem(
      "PAYMENT_PROVIDER",
      "provider-evidence:payment-2026-08-03",
    ),
    playStoreApproval: passedItem(
      "GOOGLE_PLAY_CONSOLE",
      "store-review:google-2026-08-03",
    ),
    productionAi: "DISABLED",
    productionRuntime: "NOT_ACTIVATED",
    storageProvider: passedItem(
      "STORAGE_PROVIDER",
      "provider-evidence:storage-2026-08-03",
    ),
  };
  input.gates.stage7ExternalValidation = "CLOSED";
  return input;
}

test("Gate 9D binds the final-release closure contract and inherited Stage 9 baselines", () => {
  assert.equal(STAGE9_GATE9D_BASE_SHA, "d5a01deafeb19dbc72529dc15d20bc9ef7df9377");
  assert.equal(STAGE9_GATE9D_BRANCH, "codex/stage9-gate9d-final-release-closure");
  assert.equal(STAGE9_GATE9D_VERSION, "stage9-gate9d-final-release-closure-v1");
  assert.equal(GATE9D_STAGING_ORIGIN, "https://rezno-staging.vercel.app");
  assert.equal(GATE9D_STAGING_PROJECT, "rezno-staging");
  assert.equal(GATE9D_EXPECTED_MIGRATION_COUNT, 51);
  assert.equal(GATE9D_EXPECTED_SCHEDULE_COUNT, 13);
  assert.equal(GATE9D_EXPECTED_JOB_TYPE_COUNT, 23);
  assert.deepEqual(GATE9D_REQUIRED_EXTERNAL_BLOCKERS, [
    "STAGE7_PHYSICAL_IOS_DEVICE_EVIDENCE",
    "STAGE7_PHYSICAL_ANDROID_DEVICE_EVIDENCE",
    "APNS_FCM_PROVIDER_EVIDENCE",
    "APP_STORE_APPROVAL",
    "PLAY_STORE_APPROVAL",
    "PAYMENT_PROVIDER_ADAPTER",
    "STORAGE_PROVIDER_ADAPTER",
    "MOBILE_PRODUCTION_API_ORIGIN",
    "AI_PRODUCTION_ACTIVATION_DECISION",
    "GEMINI_PRODUCTION_SECRET_DECISION",
    "OWNER_PRODUCTION_AUTHORIZATION",
  ]);
});

test("Gate 9D completes author evidence while preserving explicit external validation blockers", () => {
  const result = evaluateGate9DFinalReleaseClosure(externalValidationInput());
  assert.equal(result.ok, true);
  assert.equal(result.status, "EXTERNAL_VALIDATION_REQUIRED");
  assert.equal(result.reason, "EXTERNAL_VALIDATION_REQUIRED");
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.externalBlockers, GATE9D_REQUIRED_EXTERNAL_BLOCKERS);
  assert.deepEqual(assertGate9DFinalReleaseClosure(externalValidationInput()), result);
});

test("Gate 9D accepts only fully trusted external evidence before final release review readiness", () => {
  const result = evaluateGate9DFinalReleaseClosure(readyInput());
  assert.equal(result.ok, true);
  assert.equal(result.status, "READY_FOR_INDEPENDENT_FINAL_RELEASE_REVIEW");
  assert.equal(result.reason, "READY");
  assert.deepEqual(result.externalBlockers, []);
  assert.deepEqual(result.findings, []);
});

test("Gate 9D rejects unknown top-level and nested evidence fields before READY", () => {
  const cases: Array<[string, (input: MutableGate9DInput) => void]> = [
    ["top level", (input) => { Object.assign(input, { extraField: "not-secret" }); }],
    ["source", (input) => { Object.assign(input.source, { extraField: "not-secret" }); }],
    ["inventory", (input) => { Object.assign(input.inventory, { extraField: "not-secret" }); }],
    ["critical migration key", (input) => {
      Object.assign(input.inventory.criticalMigrationHashes, {
        "20260799999999_unexpected": "0".repeat(64),
      });
    }],
    ["staging", (input) => { Object.assign(input.staging, { extraField: "not-secret" }); }],
    ["gates", (input) => { Object.assign(input.gates, { extraField: "not-secret" }); }],
    ["production boundary", (input) => { Object.assign(input.production, { extraField: "not-secret" }); }],
    ["external evidence item", (input) => {
      Object.assign(input.production.iosPhysicalDevice, { extraField: "not-secret" });
    }],
    ["security", (input) => { Object.assign(input.security, { extraField: "not-secret" }); }],
    ["operations", (input) => { Object.assign(input.operations, { extraField: "not-secret" }); }],
  ];

  for (const [label, mutate] of cases) {
    const input = externalValidationInput();
    mutate(input);
    const result = evaluateGate9DFinalReleaseClosure(input);
    assert.equal(result.ok, false, label);
    assert.equal(result.status, "BLOCKED", label);
    assert.equal(result.reason, "EVIDENCE_SHAPE_INVALID", label);
  }
});

test("Gate 9D rejects secret-like keys and values at any depth without treating them as evidence", () => {
  const cases: Array<[string, (input: MutableGate9DInput) => void]> = [
    ["secret-like top-level key", (input) => {
      Object.assign(input, { DATABASE_URL: "not-needed" });
    }],
    ["secret-like nested key", (input) => {
      Object.assign(input.production.paymentProvider, { api_key: "not-needed" });
    }],
    ["secret-like nested value", (input) => {
      Object.assign(input.production.storageProvider, {
        evidenceRef: [
          "postgresql:/",
          "/fake-user:fake-password@fake.invalid/fake",
        ].join(""),
      });
    }],
    ["secret-like migration key and value", (input) => {
      Object.assign(input.inventory.criticalMigrationHashes, {
        DATABASE_URL: [
          "postgresql:/",
          "/fake-user:fake-password@fake.invalid/fake",
        ].join(""),
      });
    }],
  ];

  for (const [label, mutate] of cases) {
    const input = externalValidationInput();
    mutate(input);
    assert.equal(containsGate9DSecretLikeEvidence(input), true, label);
    const result = evaluateGate9DFinalReleaseClosure(input);
    assert.equal(result.ok, false, label);
    assert.equal(result.status, "BLOCKED", label);
    assert.equal(result.reason, "SECRET_REDACTION_FAILURE", label);
  }
});

test("Gate 9D source, migration, staging, gate, security, and operations evidence fail closed", () => {
  const cases: Array<[string, (input: MutableGate9DInput) => void, string]> = [
    ["self-attested source", (input) => { input.source.sources.push("SELF_ATTESTED"); }, "SELF_ATTESTED_EVIDENCE"],
    ["unknown source enum", (input) => {
      (input.source.sources as unknown as string[]).push("OPERATOR_NOTE");
    }, "SOURCE_PROVENANCE_INVALID"],
    ["malformed source list", (input) => {
      (input.source as unknown as { sources: string }).sources = "GITHUB_API";
    }, "SOURCE_PROVENANCE_INVALID"],
    ["wrong repository", (input) => {
      (input.source as unknown as { repository: string }).repository = "someone/else";
    }, "SOURCE_PROVENANCE_INVALID"],
    ["wrong alias", (input) => { input.source.vercelOrigin = "https://rezno.vercel.app"; }, "SOURCE_PROVENANCE_INVALID"],
    ["source SHA mismatch", (input) => { input.source.vercelSourceSha = "b".repeat(40); }, "SOURCE_PROVENANCE_INVALID"],
    ["malformed SHA", (input) => { input.source.authorizedSha = "not-a-sha"; }, "SOURCE_PROVENANCE_INVALID"],
    ["stale source", (input) => { input.source.verifiedAt = "2026-08-03T10:00:00.000Z"; }, "SOURCE_PROVENANCE_STALE"],
    ["future source", (input) => { input.source.verifiedAt = "2026-08-03T12:01:00.000Z"; }, "SOURCE_PROVENANCE_STALE"],
    ["migration count", (input) => { input.inventory.migrationCount = 52; }, "MIGRATION_BASELINE_MISMATCH"],
    ["migration 52", (input) => { input.inventory.migration52Present = true; }, "MIGRATION_BASELINE_MISMATCH"],
    ["migration hash", (input) => { input.inventory.criticalMigrationHashes = {}; }, "MIGRATION_BASELINE_MISMATCH"],
    ["failed tests", (input) => { input.inventory.testFailures = 1; }, "RELEASE_INVENTORY_INVALID"],
    ["mobile production origin configured", (input) => {
      input.inventory.mobileProductionOriginConfigured = true;
    }, "RELEASE_INVENTORY_INVALID"],
    ["staging disabled", (input) => {
      (input.staging as unknown as { runtime: string }).runtime = "DISABLED";
    }, "STAGING_RUNTIME_NOT_STABLE"],
    ["staging open alert", (input) => { input.staging.openAlerts = 1; }, "STAGING_RUNTIME_NOT_STABLE"],
    ["staging stale lease", (input) => { input.staging.staleLeases = 1; }, "STAGING_RUNTIME_NOT_STABLE"],
    ["stale staging", (input) => { input.staging.verifiedAt = "2026-08-03T10:00:00.000Z"; }, "SOURCE_PROVENANCE_STALE"],
    ["gate 9B not closed", (input) => {
      (input.gates as unknown as { gate9B: string }).gate9B = "OPEN";
    }, "GATE_CLOSURE_INVALID"],
    ["production runtime activated", (input) => {
      (input.production as unknown as { productionRuntime: string }).productionRuntime = "ACTIVATED";
    }, "PRODUCTION_BOUNDARY_VIOLATION"],
    ["production AI enabled", (input) => {
      (input.production as unknown as { productionAi: string }).productionAi = "ENABLED";
    }, "PRODUCTION_BOUNDARY_VIOLATION"],
    ["passed external evidence without trusted proof", (input) => {
      input.production.iosPhysicalDevice = {
        source: "NONE",
        status: "PASSED",
      };
    }, "EXTERNAL_EVIDENCE_INVALID"],
    ["unknown external source enum", (input) => {
      input.production.iosPhysicalDevice = {
        source: "OPERATOR_NOTE" as Gate9DExternalEvidenceItem["source"],
        status: "PASSED",
        evidenceRef: "provider-evidence:physical-device",
        verifiedAt,
      };
    }, "EXTERNAL_EVIDENCE_INVALID"],
    ["unknown external status enum", (input) => {
      input.production.iosPhysicalDevice = {
        source: "APPLE_CONNECT",
        status: "OPERATOR_APPROVED" as Gate9DExternalEvidenceItem["status"],
      };
    }, "EXTERNAL_EVIDENCE_INVALID"],
    ["missing external item", (input) => {
      delete (input.production as unknown as { iosPhysicalDevice?: unknown })
        .iosPhysicalDevice;
    }, "EXTERNAL_EVIDENCE_INVALID"],
    ["production mutation", (input) => {
      input.security.productionMutationPerformed = true;
    }, "PRODUCTION_BOUNDARY_VIOLATION"],
    ["secret scan finding", (input) => { input.security.secretScanFindings = 1; }, "SECURITY_SCAN_FAILED"],
    ["runbook incomplete", (input) => {
      input.operations.rollbackRunbookComplete = false;
    }, "RUNBOOKS_INCOMPLETE"],
  ];

  for (const [label, mutate, expectedCode] of cases) {
    const input = externalValidationInput();
    mutate(input);
    const result = evaluateGate9DFinalReleaseClosure(input);
    assert.equal(result.ok, false, label);
    assert.equal(result.status, "BLOCKED", label);
    assert.equal(
      result.findings.some((item) => item.code === expectedCode),
      true,
      label,
    );
    assert.equal(JSON.stringify(result).includes("fake-password"), false, label);
  }
});

test("Gate 9D release evidence CLI is redacted, fail-closed, and accepts external-validation handoff", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "rezno-gate9d-"));
  try {
    const input = externalValidationInput();
    delete (input as { now?: Date }).now;
    const fresh = new Date(Date.now() - 60_000).toISOString();
    input.source.verifiedAt = fresh;
    input.staging.verifiedAt = fresh;
    const evidenceFile = path.join(temp, "evidence.json");
    writeFileSync(evidenceFile, JSON.stringify(input), { mode: 0o600 });
    const run = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(repoRoot, "scripts/stage9/gate9d-final-release-evidence.ts"),
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          REZNO_STAGE9_GATE9D_EVIDENCE_FILE: evidenceFile,
        },
      },
    );
    assert.equal(run.status, 0, run.stderr);
    const output = JSON.parse(run.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.status, "EXTERNAL_VALIDATION_REQUIRED");
    assert.equal(output.reason, "EXTERNAL_VALIDATION_REQUIRED");
    assert.equal(output.externalBlockers.length, GATE9D_REQUIRED_EXTERNAL_BLOCKERS.length);
    assert.equal(run.stdout.includes(sourceSha), false);
    assert.equal(run.stdout.includes(evidenceFile), false);

    const unknownField = externalValidationInput();
    delete (unknownField as { now?: Date }).now;
    unknownField.source.verifiedAt = fresh;
    unknownField.staging.verifiedAt = fresh;
    Object.assign(unknownField.inventory, { extraField: "not-secret" });
    writeFileSync(evidenceFile, JSON.stringify(unknownField), { mode: 0o600 });
    const unknownRun = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(repoRoot, "scripts/stage9/gate9d-final-release-evidence.ts"),
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          REZNO_STAGE9_GATE9D_EVIDENCE_FILE: evidenceFile,
        },
      },
    );
    assert.equal(unknownRun.status, 2);
    assert.equal(JSON.parse(unknownRun.stdout).reason, "EVIDENCE_SHAPE_INVALID");
    assert.equal(unknownRun.stdout.includes("extraField"), false);

    const secretBearingEvidence = externalValidationInput();
    delete (secretBearingEvidence as { now?: Date }).now;
    secretBearingEvidence.source.verifiedAt = fresh;
    secretBearingEvidence.staging.verifiedAt = fresh;
    Object.assign(secretBearingEvidence, {
      DATABASE_URL: [
        "postgresql:/",
        "/fake-user:fake-password@fake.invalid/fake",
      ].join(""),
    });
    writeFileSync(evidenceFile, JSON.stringify(secretBearingEvidence), {
      mode: 0o600,
    });
    const secretRun = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(repoRoot, "scripts/stage9/gate9d-final-release-evidence.ts"),
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          REZNO_STAGE9_GATE9D_EVIDENCE_FILE: evidenceFile,
        },
      },
    );
    assert.equal(secretRun.status, 2);
    assert.deepEqual(JSON.parse(secretRun.stdout).findings, [
      "SECRET_REDACTION_FAILURE",
    ]);
    assert.equal(secretRun.stdout.includes("DATABASE_URL"), false);
    assert.equal(secretRun.stdout.includes("fake-user"), false);
    assert.equal(secretRun.stdout.includes("fake-password"), false);
    assert.equal(secretRun.stdout.includes("postgresql"), false);

    const missingEnvironment = { ...process.env };
    delete missingEnvironment.REZNO_STAGE9_GATE9D_EVIDENCE_FILE;
    const missing = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(repoRoot, "scripts/stage9/gate9d-final-release-evidence.ts"),
      ],
      { cwd: repoRoot, encoding: "utf8", env: missingEnvironment },
    );
    assert.equal(missing.status, 2);
    assert.equal(JSON.parse(missing.stdout).reason, "MISSING_FINAL_RELEASE_INPUT");
    assert.equal(readFileSync(evidenceFile, "utf8").includes(sourceSha), true);
  } finally {
    rmSync(temp, { force: true, recursive: true });
  }
});

test("Gate 9D keeps mobile production origin unset until owner-authorized Gate 9D external work", () => {
  const eas = JSON.parse(readFileSync(path.join(repoRoot, "apps/mobile/eas.json"), "utf8"));
  assert.equal(
    eas.build.preview.env.EXPO_PUBLIC_REZNO_API_BASE_URL,
    GATE9D_STAGING_ORIGIN,
  );
  assert.equal(
    Object.hasOwn(eas.build.production, "env"),
    false,
  );
});
