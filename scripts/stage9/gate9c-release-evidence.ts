import { readFile } from "node:fs/promises";
import { z } from "zod";

import {
  evaluateGate9CReleaseCandidate,
  type Gate9CReleaseCandidateInput,
} from "../../features/stage9/gate9c";

const nonnegativeInteger = z.number().int().nonnegative();
const releaseEvidenceSchema = z.strictObject({
  build: z.strictObject({
    auditFindings: nonnegativeInteger,
    buildPassed: z.boolean(),
    cancelledTests: nonnegativeInteger,
    eslintPassed: z.boolean(),
    mobileAndroidModules: nonnegativeInteger,
    mobileIosModules: nonnegativeInteger,
    mobileProductionOriginConfigured: z.boolean(),
    mobileWebModules: nonnegativeInteger,
    nextRouteCount: nonnegativeInteger,
    prismaSchemaDiff: z.boolean(),
    secretFindings: nonnegativeInteger,
    skippedTests: nonnegativeInteger,
    sourceSha: z.string(),
    testsPassed: z.boolean(),
    todoTests: nonnegativeInteger,
    typeScriptPassed: z.boolean(),
  }).optional(),
  database: z.strictObject({
    activeJobs: nonnegativeInteger,
    appliedMigrations: nonnegativeInteger,
    criticalMigrationHashes: z.record(z.string(), z.string()),
    enabledSchedules: nonnegativeInteger,
    failedMigrations: nonnegativeInteger,
    jobTypes: nonnegativeInteger,
    openAlerts: nonnegativeInteger,
    overdueJobs: nonnegativeInteger,
    rolledBackMigrations: nonnegativeInteger,
    runningAttempts: nonnegativeInteger,
    runningInvocations: nonnegativeInteger,
    runtime: z.literal("ENABLED"),
    schemaDrift: z.literal("ABSENT"),
    staleLeases: nonnegativeInteger,
    totalMigrations: nonnegativeInteger,
    totalSchedules: nonnegativeInteger,
    verifiedAt: z.string(),
  }).optional(),
  deployment: z.strictObject({
    authorizedSha: z.string(),
    githubDefaultBranch: z.literal("main"),
    githubDefaultBranchHeadSha: z.string(),
    localHeadSha: z.string(),
    origin: z.string(),
    projectSlug: z.string(),
    sourceRef: z.literal("main"),
    sourceSha: z.string(),
    status: z.literal("READY"),
    verifiedAt: z.string(),
  }).optional(),
  environment: z.strictObject({
    BETTER_AUTH_URL: z.string().optional(),
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NODE_ENV: z.string().optional(),
    REZNO_AI_ENABLED: z.string().optional(),
    REZNO_AI_GEMINI_ENABLED: z.string().optional(),
    REZNO_AI_KILL_SWITCH: z.string().optional(),
    REZNO_DEPLOYMENT_ENV: z.string().optional(),
    REZNO_PAYMENT_PROVIDER: z.string().optional(),
    REZNO_PLATFORM_RUNTIME_URL: z.string().optional(),
    REZNO_PUSH_RECEIPT_PROVIDERS: z.string().optional(),
    REZNO_STORAGE_PROVIDER: z.string().optional(),
    VERCEL_ENV: z.string().optional(),
  }),
  secretConfiguration: z.strictObject({
    authSecretConfigured: z.boolean(),
    databaseUrlConfigured: z.boolean(),
    geminiCredentialConfigured: z.boolean(),
  }).optional(),
});

async function main() {
  const evidenceFile = process.env.REZNO_STAGE9_GATE9C_EVIDENCE_FILE?.trim();
  if (!evidenceFile) {
    process.stdout.write(`${JSON.stringify({
      findings: ["MISSING_RELEASE_INPUT"],
      ok: false,
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 2;
    return;
  }

  try {
    const input = releaseEvidenceSchema.parse(
      JSON.parse(await readFile(evidenceFile, "utf8")),
    ) as Gate9CReleaseCandidateInput;
    const result = evaluateGate9CReleaseCandidate({
      ...input,
      // Evidence files are untrusted input. Freshness is always evaluated
      // against the verifier process clock, never a caller-supplied value.
      now: new Date(),
    });
    process.stdout.write(`${JSON.stringify({
      deferredProductionBlockers: result.deferredProductionBlockers,
      findings: result.findings.map((item) => item.code),
      ok: result.ok,
      productionStatus: result.productionStatus,
      status: result.status,
    })}\n`);
    process.exitCode = result.ok ? 0 : 2;
  } catch {
    process.stdout.write(`${JSON.stringify({
      findings: ["BUILD_EVIDENCE_INVALID"],
      ok: false,
      status: "BLOCKED",
    })}\n`);
    process.exitCode = 2;
  }
}

void main();
