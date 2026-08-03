import { readFile } from "node:fs/promises";
import { z } from "zod";

import {
  GATE9D_CRITICAL_MIGRATION_HASHES,
  containsGate9DSecretLikeEvidence,
  evaluateGate9DFinalReleaseClosure,
  type Gate9DFinalReleaseClosureInput,
} from "../../features/stage9/gate9d";

const nonnegativeInteger = z.number().int().nonnegative();
const safeIsoTimestamp = z.string().datetime({ offset: true });
const evidenceSource = z.enum([
  "REPOSITORY_SOURCE",
  "GITHUB_API",
  "GITHUB_ACTIONS",
  "VERCEL_API",
  "STAGING_DB_READ_ONLY",
  "STATIC_SCAN",
  "APPLE_CONNECT",
  "GOOGLE_PLAY_CONSOLE",
  "APNS_FCM_PROVIDER",
  "PAYMENT_PROVIDER",
  "STORAGE_PROVIDER",
  "OWNER_APPROVAL",
  "NONE",
  "SELF_ATTESTED",
]);
const externalEvidenceStatus = z.enum([
  "PASSED",
  "DEFERRED_BY_OWNER",
  "NOT_APPROVED",
  "NOT_AUTHORIZED",
  "NOT_CONFIGURED",
  "NOT_IMPLEMENTED",
]);
const criticalMigrationHashesSchema = z
  .record(z.string(), z.string())
  .superRefine((value, context) => {
    const expected = GATE9D_CRITICAL_MIGRATION_HASHES as Readonly<
      Record<string, string>
    >;
    const expectedKeys = Object.keys(expected);
    if (
      Object.keys(value).length !== expectedKeys.length
      || expectedKeys.some((key) => value[key] !== expected[key])
    ) {
      context.addIssue({
        code: "custom",
        message: "Critical migration evidence must match the exact baseline.",
      });
    }
  });
const externalEvidenceItemSchema = z.strictObject({
  evidenceRef: z.string().optional(),
  source: evidenceSource,
  status: externalEvidenceStatus,
  verifiedAt: safeIsoTimestamp.optional(),
});
const finalReleaseEvidenceSchema = z.strictObject({
  gates: z.strictObject({
    aiGates: z.literal("CLOSED"),
    gate9A: z.literal("CLOSED"),
    gate9B: z.literal("CLOSED"),
    gate9C: z.literal("CLOSED"),
    pr100: z.literal("OUT_OF_SCOPE"),
    stage6ProductionRuntime: z.literal("NOT_ACTIVATED"),
    stage6StagingRuntime: z.literal("CLOSED"),
    stage7ExternalValidation: z.enum(["DEFERRED_BY_OWNER", "CLOSED"]),
    stages1Through8: z.literal("CLOSED_WITH_STAGE7_EXTERNAL_DEFERRED"),
  }),
  inventory: z.strictObject({
    androidHermesModules: nonnegativeInteger,
    buildPassed: z.boolean(),
    criticalMigrationHashes: criticalMigrationHashesSchema,
    eslintPassed: z.boolean(),
    expoDoctorPassed: z.boolean(),
    gate9dVersion: z.literal("stage9-gate9d-final-release-closure-v1"),
    iosHermesModules: nonnegativeInteger,
    migration52Present: z.boolean(),
    migrationCount: nonnegativeInteger,
    mobileProductionOriginConfigured: z.boolean(),
    mobileWebModules: nonnegativeInteger,
    nextRouteCount: nonnegativeInteger,
    packageVersion: z.string(),
    prismaSchemaDiff: z.boolean(),
    sourceSha: z.string(),
    testFailures: nonnegativeInteger,
    testSkips: nonnegativeInteger,
    testTodos: nonnegativeInteger,
    testsPassed: z.boolean(),
    typeScriptPassed: z.boolean(),
  }),
  operations: z.strictObject({
    goNoGoMatrixComplete: z.boolean(),
    incidentRunbookComplete: z.boolean(),
    monitoringRunbookComplete: z.boolean(),
    postReleaseObservationPlanComplete: z.boolean(),
    rollbackRunbookComplete: z.boolean(),
  }),
  production: z.strictObject({
    aiProductionActivation: externalEvidenceItemSchema,
    androidPhysicalDevice: externalEvidenceItemSchema,
    apnsFcmProvider: externalEvidenceItemSchema,
    appStoreApproval: externalEvidenceItemSchema,
    geminiProductionSecret: externalEvidenceItemSchema,
    iosPhysicalDevice: externalEvidenceItemSchema,
    mobileProductionOrigin: externalEvidenceItemSchema,
    ownerProductionAuthorization: externalEvidenceItemSchema,
    paymentProvider: externalEvidenceItemSchema,
    playStoreApproval: externalEvidenceItemSchema,
    productionAi: z.literal("DISABLED"),
    productionRuntime: z.literal("NOT_ACTIVATED"),
    storageProvider: externalEvidenceItemSchema,
  }),
  security: z.strictObject({
    clientBundleSecretFindings: nonnegativeInteger,
    dependencyAuditFindings: nonnegativeInteger,
    privacyScanFindings: nonnegativeInteger,
    productionMutationPerformed: z.boolean(),
    productionSecretsChanged: z.boolean(),
    secretScanFindings: nonnegativeInteger,
  }),
  source: z.strictObject({
    authorizedSha: z.string(),
    ciConclusion: z.literal("success"),
    githubDefaultBranch: z.literal("main"),
    githubDefaultBranchHeadSha: z.string(),
    localHeadSha: z.string(),
    repository: z.literal("aswad7022/REZNO"),
    sources: z.array(evidenceSource),
    vercelOrigin: z.string(),
    vercelProjectSlug: z.literal("rezno-staging"),
    vercelSourceRef: z.literal("main"),
    vercelSourceSha: z.string(),
    vercelStatus: z.literal("READY"),
    verifiedAt: safeIsoTimestamp,
  }),
  staging: z.strictObject({
    activeJobs: nonnegativeInteger,
    appliedMigrations: nonnegativeInteger,
    enabledSchedules: nonnegativeInteger,
    failedMigrations: nonnegativeInteger,
    jobTypes: nonnegativeInteger,
    openAlerts: nonnegativeInteger,
    overdueJobs: nonnegativeInteger,
    provider: z.literal("GITHUB_ACTIONS_SCHEDULED_HTTP"),
    rolledBackMigrations: nonnegativeInteger,
    runningAttempts: nonnegativeInteger,
    runningInvocations: nonnegativeInteger,
    runtime: z.literal("ENABLED"),
    schemaDrift: z.literal("ABSENT"),
    staleLeases: nonnegativeInteger,
    totalMigrations: nonnegativeInteger,
    totalSchedules: nonnegativeInteger,
    verifiedAt: safeIsoTimestamp,
  }),
});

async function main() {
  const evidenceFile = process.env.REZNO_STAGE9_GATE9D_EVIDENCE_FILE?.trim();
  if (!evidenceFile) {
    process.stdout.write(`${JSON.stringify({
      findings: ["MISSING_FINAL_RELEASE_INPUT"],
      ok: false,
      reason: "MISSING_FINAL_RELEASE_INPUT",
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 2;
    return;
  }

  try {
    const rawEvidence: unknown = JSON.parse(await readFile(evidenceFile, "utf8"));
    if (containsGate9DSecretLikeEvidence(rawEvidence)) {
      process.stdout.write(`${JSON.stringify({
        findings: ["SECRET_REDACTION_FAILURE"],
        ok: false,
        reason: "SECRET_REDACTION_FAILURE",
        status: "BLOCKED",
      })}\n`);
      process.exitCode = 2;
      return;
    }
    const input = finalReleaseEvidenceSchema.parse(
      rawEvidence,
    ) as Gate9DFinalReleaseClosureInput;
    const result = evaluateGate9DFinalReleaseClosure({
      ...input,
      // Evidence files are untrusted input. Freshness is always evaluated
      // against the verifier process clock, never a caller-supplied value.
      now: new Date(),
    });
    process.stdout.write(`${JSON.stringify({
      externalBlockers: result.externalBlockers,
      findings: result.findings.map((item) => item.code),
      ok: result.ok,
      reason: result.reason,
      status: result.status,
    })}\n`);
    process.exitCode = result.status === "BLOCKED" ? 2 : 0;
  } catch {
    process.stdout.write(`${JSON.stringify({
      findings: ["EVIDENCE_SHAPE_INVALID"],
      ok: false,
      reason: "EVIDENCE_SHAPE_INVALID",
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 2;
  }
}

void main();
