import {
  GATE9A_CRITICAL_MIGRATION_HASHES,
  GATE9A_EXPECTED_MIGRATION_COUNT,
  GATE9A_PERFORMANCE_BUDGETS,
} from "@/features/stage9/gate9a";
import {
  GATE9B_ALLOWED_STAGING_SCHEDULES,
  GATE9B_EXPECTED_JOB_TYPES,
  GATE9B_STAGING_ORIGIN,
  GATE9B_STAGING_PROJECT,
} from "@/features/stage9/gate9b";

export const STAGE9_GATE9C_BASE_SHA =
  "c20ba5720e55bdb8676c29cd901ab83916da88fb" as const;
export const STAGE9_GATE9C_BRANCH =
  "codex/stage9-gate9c-release-candidate-hardening" as const;
export const STAGE9_GATE9C_VERSION =
  "stage9-gate9c-release-candidate-hardening-v1" as const;

export const GATE9C_STAGING_ORIGIN = GATE9B_STAGING_ORIGIN;
export const GATE9C_STAGING_PROJECT = GATE9B_STAGING_PROJECT;
export const GATE9C_EXPECTED_MIGRATION_COUNT =
  GATE9A_EXPECTED_MIGRATION_COUNT;
export const GATE9C_CRITICAL_MIGRATION_HASHES =
  GATE9A_CRITICAL_MIGRATION_HASHES;
export const GATE9C_EXPECTED_SCHEDULE_COUNT =
  GATE9B_ALLOWED_STAGING_SCHEDULES.length;
export const GATE9C_EXPECTED_JOB_TYPE_COUNT =
  GATE9B_EXPECTED_JOB_TYPES.length;

export const GATE9C_DEFERRED_PRODUCTION_BLOCKERS = [
  "STAGE7_PHYSICAL_DEVICE_EVIDENCE",
  "APNS_FCM_PROVIDER_EVIDENCE",
  "PAYMENT_PROVIDER_ADAPTER",
  "STORAGE_PROVIDER_ADAPTER",
  "MOBILE_PRODUCTION_API_ORIGIN",
] as const;

export type Gate9CFindingCode =
  | "MISSING_RELEASE_INPUT"
  | "EVIDENCE_SHAPE_INVALID"
  | "INVALID_RELEASE_ENVIRONMENT"
  | "INVALID_RELEASE_ORIGIN"
  | "UNSAFE_PROVIDER_POSTURE"
  | "AI_RUNTIME_MUST_REMAIN_DISABLED"
  | "DEPLOYMENT_EVIDENCE_INVALID"
  | "DEPLOYMENT_SHA_MISMATCH"
  | "DEPLOYMENT_EVIDENCE_STALE"
  | "DATABASE_EVIDENCE_INVALID"
  | "DATABASE_EVIDENCE_STALE"
  | "RUNTIME_NOT_STABLE"
  | "MIGRATION_BASELINE_MISMATCH"
  | "BUILD_EVIDENCE_INVALID"
  | "UNAPPROVED_MOBILE_PRODUCTION_ORIGIN"
  | "PERFORMANCE_BUDGET_EXCEEDED"
  | "SECURITY_SCAN_FAILED"
  | "SECRET_REDACTION_FAILURE";

export type Gate9CFinding = {
  readonly code: Gate9CFindingCode;
  readonly name: string;
  readonly message: string;
};

export type Gate9CDeploymentEvidence = {
  readonly authorizedSha: string;
  readonly githubDefaultBranch: "main";
  readonly githubDefaultBranchHeadSha: string;
  readonly localHeadSha: string;
  readonly origin: string;
  readonly projectSlug: string;
  readonly sourceRef: "main";
  readonly sourceSha: string;
  readonly status: "READY";
  readonly verifiedAt: string;
};

export type Gate9CDatabaseEvidence = {
  readonly activeJobs: number;
  readonly appliedMigrations: number;
  readonly criticalMigrationHashes: Readonly<Record<string, string>>;
  readonly enabledSchedules: number;
  readonly failedMigrations: number;
  readonly jobTypes: number;
  readonly openAlerts: number;
  readonly overdueJobs: number;
  readonly rolledBackMigrations: number;
  readonly runningAttempts: number;
  readonly runningInvocations: number;
  readonly runtime: "ENABLED";
  readonly schemaDrift: "ABSENT";
  readonly staleLeases: number;
  readonly totalMigrations: number;
  readonly totalSchedules: number;
  readonly verifiedAt: string;
};

export type Gate9CBuildEvidence = {
  readonly auditFindings: number;
  readonly buildPassed: boolean;
  readonly cancelledTests: number;
  readonly eslintPassed: boolean;
  readonly mobileAndroidModules: number;
  readonly mobileIosModules: number;
  readonly mobileProductionOriginConfigured: boolean;
  readonly mobileWebModules: number;
  readonly nextRouteCount: number;
  readonly prismaSchemaDiff: boolean;
  readonly secretFindings: number;
  readonly skippedTests: number;
  readonly sourceSha: string;
  readonly testsPassed: boolean;
  readonly todoTests: number;
  readonly typeScriptPassed: boolean;
};

export type Gate9CReleaseCandidateInput = {
  readonly build?: Gate9CBuildEvidence;
  readonly database?: Gate9CDatabaseEvidence;
  readonly deployment?: Gate9CDeploymentEvidence;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly now?: Date;
  readonly secretConfiguration?: {
    readonly authSecretConfigured: boolean;
    readonly databaseUrlConfigured: boolean;
    readonly geminiCredentialConfigured: boolean;
  };
};

export type Gate9CReleaseCandidateResult = {
  readonly deferredProductionBlockers: typeof GATE9C_DEFERRED_PRODUCTION_BLOCKERS;
  readonly findings: readonly Gate9CFinding[];
  readonly ok: boolean;
  readonly productionStatus: "EXTERNAL_INPUT_REQUIRED";
  readonly reason: Gate9CFindingCode | "READY";
  readonly status: "READY_FOR_STAGING_RELEASE_CANDIDATE" | "BLOCKED";
};

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_EVIDENCE_AGE_MS = 30 * 60 * 1000;
const SECRET_LIKE =
  /(?:postgres(?:ql)?:\/\/|password\s*[:=]|authorization\s*[:=]|bearer\s+[a-z0-9._-]+|cookie\s*[:=]|token\s*[:=]|api[_-]?key\s*[:=]|gh[op]_[a-z0-9_]+|vercel_[a-z0-9_]+|sk-[a-z0-9_-]+)/iu;
const SECRET_LIKE_EVIDENCE_KEY =
  /(?:^|[_-])(?:api[_-]?key|auth[_-]?secret|authorization|client[_-]?secret|cookie|database[_-]?url|password|passwd|private[_-]?key|session|token)(?:$|[_-])/iu;
const SECRET_LIKE_EVIDENCE_VALUE =
  /(?:postgres(?:ql)?:\/\/[^\s:/]+:[^@\s]+@|mysql:\/\/[^\s:/]+:[^@\s]+@|mongodb(?:\+srv)?:\/\/[^\s:/]+:[^@\s]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|authorization|client[_-]?secret|cookie|database[_-]?url|password|session|token)\s*[:=]\s*\S+|bearer\s+\S+|(?:gh[opurs]_|vercel_|sk-|AIza)[a-z0-9._-]{8,}|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)/iu;

export function containsGate9CSecretLikeEvidence(value: unknown): boolean {
  const visited = new WeakSet<object>();

  function inspect(candidate: unknown): boolean {
    if (typeof candidate === "string") {
      return SECRET_LIKE_EVIDENCE_VALUE.test(candidate);
    }
    if (candidate === null || typeof candidate !== "object") return false;
    if (visited.has(candidate)) return false;
    visited.add(candidate);
    if (Array.isArray(candidate)) return candidate.some(inspect);
    return Object.entries(candidate).some(
      ([key, nested]) => SECRET_LIKE_EVIDENCE_KEY.test(key) || inspect(nested),
    );
  }

  return inspect(value);
}

const RELEASE_INPUT_KEYS = new Set([
  "build",
  "database",
  "deployment",
  "environment",
  "now",
  "secretConfiguration",
]);
const BUILD_EVIDENCE_KEYS = new Set([
  "auditFindings",
  "buildPassed",
  "cancelledTests",
  "eslintPassed",
  "mobileAndroidModules",
  "mobileIosModules",
  "mobileProductionOriginConfigured",
  "mobileWebModules",
  "nextRouteCount",
  "prismaSchemaDiff",
  "secretFindings",
  "skippedTests",
  "sourceSha",
  "testsPassed",
  "todoTests",
  "typeScriptPassed",
]);
const DATABASE_EVIDENCE_KEYS = new Set([
  "activeJobs",
  "appliedMigrations",
  "criticalMigrationHashes",
  "enabledSchedules",
  "failedMigrations",
  "jobTypes",
  "openAlerts",
  "overdueJobs",
  "rolledBackMigrations",
  "runningAttempts",
  "runningInvocations",
  "runtime",
  "schemaDrift",
  "staleLeases",
  "totalMigrations",
  "totalSchedules",
  "verifiedAt",
]);
const DEPLOYMENT_EVIDENCE_KEYS = new Set([
  "authorizedSha",
  "githubDefaultBranch",
  "githubDefaultBranchHeadSha",
  "localHeadSha",
  "origin",
  "projectSlug",
  "sourceRef",
  "sourceSha",
  "status",
  "verifiedAt",
]);
const ENVIRONMENT_EVIDENCE_KEYS = new Set([
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "NODE_ENV",
  "REZNO_AI_ENABLED",
  "REZNO_AI_GEMINI_ENABLED",
  "REZNO_AI_KILL_SWITCH",
  "REZNO_DEPLOYMENT_ENV",
  "REZNO_PAYMENT_PROVIDER",
  "REZNO_PLATFORM_RUNTIME_URL",
  "REZNO_PUSH_RECEIPT_PROVIDERS",
  "REZNO_STORAGE_PROVIDER",
  "VERCEL_ENV",
]);
const SECRET_CONFIGURATION_KEYS = new Set([
  "authSecretConfigured",
  "databaseUrlConfigured",
  "geminiCredentialConfigured",
]);
const CRITICAL_MIGRATION_KEYS = new Set(
  Object.keys(GATE9C_CRITICAL_MIGRATION_HASHES),
);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKnownKeys(value: unknown, knownKeys: ReadonlySet<string>) {
  return isPlainRecord(value)
    && Object.keys(value).every((key) => knownKeys.has(key));
}

export function hasExactGate9CEvidenceShape(value: unknown): boolean {
  if (!hasOnlyKnownKeys(value, RELEASE_INPUT_KEYS)) return false;
  const input = value as Record<string, unknown>;
  if (!hasOnlyKnownKeys(input.environment, ENVIRONMENT_EVIDENCE_KEYS)) {
    return false;
  }
  if (
    input.now !== undefined
    && (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime()))
  ) {
    return false;
  }
  if (
    input.build !== undefined
    && !hasOnlyKnownKeys(input.build, BUILD_EVIDENCE_KEYS)
  ) {
    return false;
  }
  if (
    input.deployment !== undefined
    && !hasOnlyKnownKeys(input.deployment, DEPLOYMENT_EVIDENCE_KEYS)
  ) {
    return false;
  }
  if (input.database !== undefined) {
    if (!hasOnlyKnownKeys(input.database, DATABASE_EVIDENCE_KEYS)) return false;
    const database = input.database as Record<string, unknown>;
    if (
      !hasOnlyKnownKeys(
        database.criticalMigrationHashes,
        CRITICAL_MIGRATION_KEYS,
      )
    ) {
      return false;
    }
  }
  return input.secretConfiguration === undefined
    || hasOnlyKnownKeys(input.secretConfiguration, SECRET_CONFIGURATION_KEYS);
}

function finding(
  code: Gate9CFindingCode,
  name: string,
  message: string,
): Gate9CFinding {
  return { code, name, message };
}

function exactHttpsOrigin(value: string | undefined, expected: string) {
  if (!value || value.trim() !== value || value !== expected) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && parsed.origin === expected
      && parsed.pathname === "/"
      && parsed.username.length === 0
      && parsed.password.length === 0
      && parsed.search.length === 0
      && parsed.hash.length === 0;
  } catch {
    return false;
  }
}

function validEvidenceTime(value: string, now: Date) {
  const instant = new Date(value);
  return Number.isFinite(instant.getTime())
    && instant.getTime() <= now.getTime()
    && now.getTime() - instant.getTime() <= MAX_EVIDENCE_AGE_MS;
}

function uniqueFindings(findings: readonly Gate9CFinding[]) {
  return [...new Map(
    findings.map((item) => [`${item.code}:${item.name}`, item] as const),
  ).values()];
}

export function validateGate9CEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  secretConfiguration: Gate9CReleaseCandidateInput["secretConfiguration"],
) {
  const findings: Gate9CFinding[] = [];
  if (environment.NODE_ENV !== "production") {
    findings.push(finding(
      "INVALID_RELEASE_ENVIRONMENT",
      "NODE_ENV",
      "The release candidate must use the production application runtime.",
    ));
  }
  if (environment.REZNO_DEPLOYMENT_ENV !== "staging") {
    findings.push(finding(
      "INVALID_RELEASE_ENVIRONMENT",
      "REZNO_DEPLOYMENT_ENV",
      "Gate 9C authorizes only the staging release-candidate target.",
    ));
  }
  if (environment.VERCEL_ENV !== "production") {
    findings.push(finding(
      "INVALID_RELEASE_ENVIRONMENT",
      "VERCEL_ENV",
      "The staging project must use its production deployment environment.",
    ));
  }
  for (const name of [
    "BETTER_AUTH_URL",
    "NEXT_PUBLIC_APP_URL",
    "REZNO_PLATFORM_RUNTIME_URL",
  ] as const) {
    if (!exactHttpsOrigin(environment[name], GATE9C_STAGING_ORIGIN)) {
      findings.push(finding(
        "INVALID_RELEASE_ORIGIN",
        name,
        `${name} must be the exact approved staging HTTPS origin.`,
      ));
    }
  }
  if (
    environment.REZNO_PAYMENT_PROVIDER !== "NOT_CONFIGURED"
    || environment.REZNO_STORAGE_PROVIDER !== "NOT_CONFIGURED"
    || ![undefined, "", "NOT_CONFIGURED"].includes(environment.REZNO_PUSH_RECEIPT_PROVIDERS)
  ) {
    findings.push(finding(
      "UNSAFE_PROVIDER_POSTURE",
      "providers",
      "External providers must remain fail-closed until Gate 9D supplies independent provider evidence.",
    ));
  }
  if (
    environment.REZNO_AI_ENABLED !== "false"
    || environment.REZNO_AI_GEMINI_ENABLED !== "false"
    || environment.REZNO_AI_KILL_SWITCH !== "true"
    || secretConfiguration?.geminiCredentialConfigured === true
  ) {
    findings.push(finding(
      "AI_RUNTIME_MUST_REMAIN_DISABLED",
      "ai",
      "AI must remain disabled with the kill switch engaged for the Gate 9C release candidate.",
    ));
  }
  if (
    secretConfiguration?.authSecretConfigured !== true
    || secretConfiguration?.databaseUrlConfigured !== true
  ) {
    findings.push(finding(
      "MISSING_RELEASE_INPUT",
      "serverSecrets",
      "The staging database and authentication secrets must be configured in the approved secret store.",
    ));
  }
  return findings;
}

export function validateGate9CDeploymentEvidence(
  evidence: Gate9CDeploymentEvidence | undefined,
  now = new Date(),
) {
  if (!evidence) {
    return [finding(
      "MISSING_RELEASE_INPUT",
      "deployment",
      "Trusted GitHub and Vercel deployment evidence is required.",
    )];
  }
  const findings: Gate9CFinding[] = [];
  if (
    evidence.githubDefaultBranch !== "main"
    || evidence.sourceRef !== "main"
    || evidence.projectSlug !== GATE9C_STAGING_PROJECT
    || evidence.status !== "READY"
    || !exactHttpsOrigin(evidence.origin, GATE9C_STAGING_ORIGIN)
  ) {
    findings.push(finding(
      "DEPLOYMENT_EVIDENCE_INVALID",
      "deployment",
      "The deployment must be the ready rezno-staging main deployment on the approved alias.",
    ));
  }
  const shas = [
    evidence.authorizedSha,
    evidence.githubDefaultBranchHeadSha,
    evidence.localHeadSha,
    evidence.sourceSha,
  ];
  if (shas.some((sha) => !SHA_PATTERN.test(sha))) {
    findings.push(finding(
      "DEPLOYMENT_EVIDENCE_INVALID",
      "deploymentSha",
      "Deployment evidence must contain complete lowercase Git commit identifiers.",
    ));
  } else if (new Set(shas).size !== 1) {
    findings.push(finding(
      "DEPLOYMENT_SHA_MISMATCH",
      "deploymentSha",
      "GitHub, local, authorized, and Vercel source commits must match.",
    ));
  }
  if (!validEvidenceTime(evidence.verifiedAt, now)) {
    findings.push(finding(
      "DEPLOYMENT_EVIDENCE_STALE",
      "deploymentVerifiedAt",
      "Deployment evidence must be current and must not be future-dated.",
    ));
  }
  return findings;
}

export function validateGate9CDatabaseEvidence(
  evidence: Gate9CDatabaseEvidence | undefined,
  now = new Date(),
) {
  if (!evidence) {
    return [finding(
      "MISSING_RELEASE_INPUT",
      "database",
      "Read-only staging database evidence is required.",
    )];
  }
  const findings: Gate9CFinding[] = [];
  const expectedMigrationHashes = Object.entries(
    GATE9C_CRITICAL_MIGRATION_HASHES,
  );
  if (
    evidence.totalMigrations !== GATE9C_EXPECTED_MIGRATION_COUNT
    || evidence.appliedMigrations !== GATE9C_EXPECTED_MIGRATION_COUNT
    || evidence.failedMigrations !== 0
    || evidence.rolledBackMigrations !== 0
    || evidence.schemaDrift !== "ABSENT"
    || Object.keys(evidence.criticalMigrationHashes).length
      !== expectedMigrationHashes.length
    || expectedMigrationHashes.some(
      ([migration, hash]) => evidence.criticalMigrationHashes[migration] !== hash,
    )
  ) {
    findings.push(finding(
      "MIGRATION_BASELINE_MISMATCH",
      "migrations",
      "The release candidate requires the accepted healthy 51/51 migration baseline without drift.",
    ));
  }
  if (
    evidence.runtime !== "ENABLED"
    || evidence.enabledSchedules !== GATE9C_EXPECTED_SCHEDULE_COUNT
    || evidence.totalSchedules !== GATE9C_EXPECTED_SCHEDULE_COUNT
    || evidence.jobTypes !== GATE9C_EXPECTED_JOB_TYPE_COUNT
    || evidence.activeJobs !== 0
    || evidence.overdueJobs !== 0
    || evidence.openAlerts !== 0
    || evidence.runningAttempts !== 0
    || evidence.runningInvocations !== 0
    || evidence.staleLeases !== 0
  ) {
    findings.push(finding(
      "RUNTIME_NOT_STABLE",
      "platformRuntime",
      "The staging runtime must be enabled, fully scheduled, idle, and alert-free.",
    ));
  }
  if (!validEvidenceTime(evidence.verifiedAt, now)) {
    findings.push(finding(
      "DATABASE_EVIDENCE_STALE",
      "databaseVerifiedAt",
      "Database and runtime evidence must be current and must not be future-dated.",
    ));
  }
  return findings;
}

export function validateGate9CBuildEvidence(
  evidence: Gate9CBuildEvidence | undefined,
  expectedSha: string | undefined,
) {
  if (!evidence) {
    return [finding(
      "MISSING_RELEASE_INPUT",
      "build",
      "Build, test, audit, and bundle evidence is required.",
    )];
  }
  const findings: Gate9CFinding[] = [];
  if (
    !evidence.testsPassed
    || !evidence.typeScriptPassed
    || !evidence.eslintPassed
    || !evidence.buildPassed
    || evidence.prismaSchemaDiff
    || evidence.skippedTests !== 0
    || evidence.todoTests !== 0
    || evidence.cancelledTests !== 0
    || !SHA_PATTERN.test(evidence.sourceSha)
    || evidence.sourceSha !== expectedSha
  ) {
    findings.push(finding(
      "BUILD_EVIDENCE_INVALID",
      "build",
      "Tests, types, lint, build, Prisma, and source provenance must all pass on the deployed commit.",
    ));
  }
  if (evidence.mobileProductionOriginConfigured) {
    findings.push(finding(
      "UNAPPROVED_MOBILE_PRODUCTION_ORIGIN",
      "mobileProductionOrigin",
      "The mobile production API origin must remain unconfigured until the owner supplies the approved production origin in Gate 9D.",
    ));
  }
  if (
    evidence.nextRouteCount > GATE9A_PERFORMANCE_BUDGETS.nextRouteCount
    || evidence.mobileIosModules > GATE9A_PERFORMANCE_BUDGETS.mobileExpoModuleCount
    || evidence.mobileAndroidModules > GATE9A_PERFORMANCE_BUDGETS.mobileExpoModuleCount
    || evidence.mobileWebModules > GATE9A_PERFORMANCE_BUDGETS.mobileExpoModuleCount
  ) {
    findings.push(finding(
      "PERFORMANCE_BUDGET_EXCEEDED",
      "buildBudgets",
      "Web routes or mobile bundles exceed the approved Stage 9 budgets.",
    ));
  }
  if (evidence.auditFindings !== 0 || evidence.secretFindings !== 0) {
    findings.push(finding(
      "SECURITY_SCAN_FAILED",
      "securityScans",
      "Production dependency audits and secret scans must have zero findings.",
    ));
  }
  return findings;
}

export function evaluateGate9CReleaseCandidate(
  input: Gate9CReleaseCandidateInput,
): Gate9CReleaseCandidateResult {
  const runtimeInput = (
    isPlainRecord(input) ? input : {}
  ) as Partial<Gate9CReleaseCandidateInput>;
  const now = runtimeInput.now instanceof Date
    && Number.isFinite(runtimeInput.now.getTime())
    ? runtimeInput.now
    : new Date();
  const environment = isPlainRecord(runtimeInput.environment)
    ? runtimeInput.environment as Readonly<Record<string, string | undefined>>
    : {};
  const findings = uniqueFindings([
    ...(hasExactGate9CEvidenceShape(input) ? [] : [finding(
      "EVIDENCE_SHAPE_INVALID",
      "evidenceShape",
      "Release evidence contains an unknown field or invalid object shape.",
    )]),
    ...validateGate9CEnvironment(
      environment,
      isPlainRecord(runtimeInput.secretConfiguration)
        ? runtimeInput.secretConfiguration as NonNullable<
          Gate9CReleaseCandidateInput["secretConfiguration"]
        >
        : undefined,
    ),
    ...validateGate9CDeploymentEvidence(runtimeInput.deployment, now),
    ...validateGate9CDatabaseEvidence(runtimeInput.database, now),
    ...validateGate9CBuildEvidence(
      runtimeInput.build,
      runtimeInput.deployment?.sourceSha,
    ),
  ]);
  if (containsGate9CSecretLikeEvidence(input)) {
    findings.push(finding(
      "SECRET_REDACTION_FAILURE",
      "evidence",
      "Release evidence contains secret-like material and must be rejected.",
    ));
  }
  if (findings.some((item) => SECRET_LIKE.test(item.message))) {
    findings.push(finding(
      "SECRET_REDACTION_FAILURE",
      "findings",
      "Release evidence contains a secret-like diagnostic and must be rejected.",
    ));
  }
  return {
    deferredProductionBlockers: GATE9C_DEFERRED_PRODUCTION_BLOCKERS,
    findings,
    ok: findings.length === 0,
    productionStatus: "EXTERNAL_INPUT_REQUIRED",
    reason: findings[0]?.code ?? "READY",
    status: findings.length === 0
      ? "READY_FOR_STAGING_RELEASE_CANDIDATE"
      : "BLOCKED",
  };
}

export class Gate9CReleaseCandidateError extends Error {
  constructor(readonly code: Gate9CFindingCode) {
    super("Gate 9C release-candidate validation failed closed.");
    this.name = "Gate9CReleaseCandidateError";
  }
}

export function assertGate9CReleaseCandidate(
  input: Gate9CReleaseCandidateInput,
) {
  const result = evaluateGate9CReleaseCandidate(input);
  if (!result.ok) {
    throw new Gate9CReleaseCandidateError(result.reason as Gate9CFindingCode);
  }
  return result;
}
