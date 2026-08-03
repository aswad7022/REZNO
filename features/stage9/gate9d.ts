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

export const STAGE9_GATE9D_BASE_SHA =
  "d5a01deafeb19dbc72529dc15d20bc9ef7df9377" as const;
export const STAGE9_GATE9D_BRANCH =
  "codex/stage9-gate9d-final-release-closure" as const;
export const STAGE9_GATE9D_VERSION =
  "stage9-gate9d-final-release-closure-v1" as const;

export const GATE9D_STAGING_ORIGIN = GATE9B_STAGING_ORIGIN;
export const GATE9D_STAGING_PROJECT = GATE9B_STAGING_PROJECT;
export const GATE9D_EXPECTED_MIGRATION_COUNT =
  GATE9A_EXPECTED_MIGRATION_COUNT;
export const GATE9D_CRITICAL_MIGRATION_HASHES =
  GATE9A_CRITICAL_MIGRATION_HASHES;
export const GATE9D_EXPECTED_SCHEDULE_COUNT =
  GATE9B_ALLOWED_STAGING_SCHEDULES.length;
export const GATE9D_EXPECTED_JOB_TYPE_COUNT =
  GATE9B_EXPECTED_JOB_TYPES.length;

export const GATE9D_REQUIRED_EXTERNAL_BLOCKERS = [
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
] as const;

export type Gate9DExternalBlocker =
  typeof GATE9D_REQUIRED_EXTERNAL_BLOCKERS[number];

export type Gate9DFindingCode =
  | "MISSING_FINAL_RELEASE_INPUT"
  | "EVIDENCE_SHAPE_INVALID"
  | "SECRET_REDACTION_FAILURE"
  | "SELF_ATTESTED_EVIDENCE"
  | "SOURCE_PROVENANCE_INVALID"
  | "SOURCE_PROVENANCE_STALE"
  | "RELEASE_INVENTORY_INVALID"
  | "MIGRATION_BASELINE_MISMATCH"
  | "STAGING_RUNTIME_NOT_STABLE"
  | "GATE_CLOSURE_INVALID"
  | "PRODUCTION_BOUNDARY_VIOLATION"
  | "EXTERNAL_EVIDENCE_INVALID"
  | "SECURITY_SCAN_FAILED"
  | "RUNBOOKS_INCOMPLETE";

export type Gate9DFinding = {
  readonly code: Gate9DFindingCode;
  readonly name: string;
  readonly message: string;
};

export type Gate9DEvidenceSource =
  | "REPOSITORY_SOURCE"
  | "GITHUB_API"
  | "GITHUB_ACTIONS"
  | "VERCEL_API"
  | "STAGING_DB_READ_ONLY"
  | "STATIC_SCAN"
  | "APPLE_CONNECT"
  | "GOOGLE_PLAY_CONSOLE"
  | "APNS_FCM_PROVIDER"
  | "PAYMENT_PROVIDER"
  | "STORAGE_PROVIDER"
  | "OWNER_APPROVAL"
  | "NONE"
  | "SELF_ATTESTED";

const GATE9D_EVIDENCE_SOURCES = new Set<Gate9DEvidenceSource>([
  "APNS_FCM_PROVIDER",
  "APPLE_CONNECT",
  "GITHUB_ACTIONS",
  "GITHUB_API",
  "GOOGLE_PLAY_CONSOLE",
  "NONE",
  "OWNER_APPROVAL",
  "PAYMENT_PROVIDER",
  "REPOSITORY_SOURCE",
  "SELF_ATTESTED",
  "STATIC_SCAN",
  "STAGING_DB_READ_ONLY",
  "STORAGE_PROVIDER",
  "VERCEL_API",
]);

export type Gate9DSourceProvenanceEvidence = {
  readonly authorizedSha: string;
  readonly ciConclusion: "success";
  readonly githubDefaultBranch: "main";
  readonly githubDefaultBranchHeadSha: string;
  readonly localHeadSha: string;
  readonly repository: "aswad7022/REZNO";
  readonly sources: readonly Gate9DEvidenceSource[];
  readonly vercelOrigin: string;
  readonly vercelProjectSlug: "rezno-staging";
  readonly vercelSourceRef: "main";
  readonly vercelSourceSha: string;
  readonly vercelStatus: "READY";
  readonly verifiedAt: string;
};

export type Gate9DReleaseInventoryEvidence = {
  readonly buildPassed: boolean;
  readonly criticalMigrationHashes: Readonly<Record<string, string>>;
  readonly expoDoctorPassed: boolean;
  readonly gate9dVersion: typeof STAGE9_GATE9D_VERSION;
  readonly iosHermesModules: number;
  readonly androidHermesModules: number;
  readonly migrationCount: number;
  readonly migration52Present: boolean;
  readonly mobileProductionOriginConfigured: boolean;
  readonly mobileWebModules: number;
  readonly nextRouteCount: number;
  readonly packageVersion: string;
  readonly prismaSchemaDiff: boolean;
  readonly sourceSha: string;
  readonly testFailures: number;
  readonly testSkips: number;
  readonly testTodos: number;
  readonly testsPassed: boolean;
  readonly typeScriptPassed: boolean;
  readonly eslintPassed: boolean;
};

export type Gate9DStagingRuntimeEvidence = {
  readonly activeJobs: number;
  readonly appliedMigrations: number;
  readonly enabledSchedules: number;
  readonly failedMigrations: number;
  readonly jobTypes: number;
  readonly openAlerts: number;
  readonly overdueJobs: number;
  readonly provider: "GITHUB_ACTIONS_SCHEDULED_HTTP";
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

export type Gate9DGateClosureEvidence = {
  readonly aiGates: "CLOSED";
  readonly gate9A: "CLOSED";
  readonly gate9B: "CLOSED";
  readonly gate9C: "CLOSED";
  readonly pr100: "OUT_OF_SCOPE";
  readonly stage6ProductionRuntime: "NOT_ACTIVATED";
  readonly stage6StagingRuntime: "CLOSED";
  readonly stage7ExternalValidation: "DEFERRED_BY_OWNER" | "CLOSED";
  readonly stages1Through8: "CLOSED_WITH_STAGE7_EXTERNAL_DEFERRED";
};

export type Gate9DExternalEvidenceStatus =
  | "PASSED"
  | "DEFERRED_BY_OWNER"
  | "NOT_APPROVED"
  | "NOT_AUTHORIZED"
  | "NOT_CONFIGURED"
  | "NOT_IMPLEMENTED";

const GATE9D_EXTERNAL_EVIDENCE_STATUSES =
  new Set<Gate9DExternalEvidenceStatus>([
    "DEFERRED_BY_OWNER",
    "NOT_APPROVED",
    "NOT_AUTHORIZED",
    "NOT_CONFIGURED",
    "NOT_IMPLEMENTED",
    "PASSED",
  ]);

export type Gate9DExternalEvidenceItem = {
  readonly evidenceRef?: string;
  readonly source: Gate9DEvidenceSource;
  readonly status: Gate9DExternalEvidenceStatus;
  readonly verifiedAt?: string;
};

export type Gate9DProductionBoundaryEvidence = {
  readonly aiProductionActivation: Gate9DExternalEvidenceItem;
  readonly androidPhysicalDevice: Gate9DExternalEvidenceItem;
  readonly apnsFcmProvider: Gate9DExternalEvidenceItem;
  readonly appStoreApproval: Gate9DExternalEvidenceItem;
  readonly geminiProductionSecret: Gate9DExternalEvidenceItem;
  readonly iosPhysicalDevice: Gate9DExternalEvidenceItem;
  readonly mobileProductionOrigin: Gate9DExternalEvidenceItem;
  readonly ownerProductionAuthorization: Gate9DExternalEvidenceItem;
  readonly paymentProvider: Gate9DExternalEvidenceItem;
  readonly playStoreApproval: Gate9DExternalEvidenceItem;
  readonly productionAi: "DISABLED";
  readonly productionRuntime: "NOT_ACTIVATED";
  readonly storageProvider: Gate9DExternalEvidenceItem;
};

export type Gate9DSecurityPrivacyEvidence = {
  readonly clientBundleSecretFindings: number;
  readonly dependencyAuditFindings: number;
  readonly privacyScanFindings: number;
  readonly productionMutationPerformed: boolean;
  readonly productionSecretsChanged: boolean;
  readonly secretScanFindings: number;
};

export type Gate9DOperationsEvidence = {
  readonly goNoGoMatrixComplete: boolean;
  readonly incidentRunbookComplete: boolean;
  readonly monitoringRunbookComplete: boolean;
  readonly postReleaseObservationPlanComplete: boolean;
  readonly rollbackRunbookComplete: boolean;
};

export type Gate9DFinalReleaseClosureInput = {
  readonly gates: Gate9DGateClosureEvidence;
  readonly inventory: Gate9DReleaseInventoryEvidence;
  readonly operations: Gate9DOperationsEvidence;
  readonly production: Gate9DProductionBoundaryEvidence;
  readonly security: Gate9DSecurityPrivacyEvidence;
  readonly source: Gate9DSourceProvenanceEvidence;
  readonly staging: Gate9DStagingRuntimeEvidence;
  readonly now?: Date;
};

export type Gate9DFinalReleaseClosureResult = {
  readonly externalBlockers: readonly Gate9DExternalBlocker[];
  readonly findings: readonly Gate9DFinding[];
  readonly ok: boolean;
  readonly reason:
    | Gate9DFindingCode
    | "EXTERNAL_VALIDATION_REQUIRED"
    | "READY";
  readonly status:
    | "READY_FOR_INDEPENDENT_FINAL_RELEASE_REVIEW"
    | "EXTERNAL_VALIDATION_REQUIRED"
    | "BLOCKED";
};

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_EVIDENCE_AGE_MS = 30 * 60 * 1000;
const SAFE_EVIDENCE_REF = /^(?:https:\/\/github\.com\/aswad7022\/REZNO\/(?:pull|actions|issues)\/[0-9][0-9A-Za-z_/#?=&.-]*|eas-build:[0-9a-f-]+|store-review:[A-Za-z0-9_.:-]+|provider-evidence:[A-Za-z0-9_.:-]+)$/u;
const SECRET_LIKE_EVIDENCE_KEY =
  /(?:^|[_-])(?:api[_-]?key|authorization|client[_-]?secret|cookie|database[_-]?url|jwt|password|passwd|private[_-]?key|session|token)(?:$|[_-])|(?:accessToken|authToken|clientSecret|databaseUrl|idToken|privateKey|refreshToken)/iu;
const SECRET_LIKE_EVIDENCE_VALUE =
  /(?:postgres(?:ql)?:\/\/[^\s:/]+:[^@\s]+@|mysql:\/\/[^\s:/]+:[^@\s]+@|mongodb(?:\+srv)?:\/\/[^\s:/]+:[^@\s]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|authorization|client[_-]?secret|cookie|database[_-]?url|password|session|token)\s*[:=]\s*\S+|bearer\s+\S+|(?:gh[opurs]_|vercel_|sk-|AIza)[a-z0-9._-]{8,}|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)/iu;

const INPUT_KEYS = new Set([
  "gates",
  "inventory",
  "now",
  "operations",
  "production",
  "security",
  "source",
  "staging",
]);
const SOURCE_KEYS = new Set([
  "authorizedSha",
  "ciConclusion",
  "githubDefaultBranch",
  "githubDefaultBranchHeadSha",
  "localHeadSha",
  "repository",
  "sources",
  "vercelOrigin",
  "vercelProjectSlug",
  "vercelSourceRef",
  "vercelSourceSha",
  "vercelStatus",
  "verifiedAt",
]);
const INVENTORY_KEYS = new Set([
  "androidHermesModules",
  "buildPassed",
  "criticalMigrationHashes",
  "eslintPassed",
  "expoDoctorPassed",
  "gate9dVersion",
  "iosHermesModules",
  "migration52Present",
  "migrationCount",
  "mobileProductionOriginConfigured",
  "mobileWebModules",
  "nextRouteCount",
  "packageVersion",
  "prismaSchemaDiff",
  "sourceSha",
  "testFailures",
  "testSkips",
  "testTodos",
  "testsPassed",
  "typeScriptPassed",
]);
const STAGING_KEYS = new Set([
  "activeJobs",
  "appliedMigrations",
  "enabledSchedules",
  "failedMigrations",
  "jobTypes",
  "openAlerts",
  "overdueJobs",
  "provider",
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
const GATES_KEYS = new Set([
  "aiGates",
  "gate9A",
  "gate9B",
  "gate9C",
  "pr100",
  "stage6ProductionRuntime",
  "stage6StagingRuntime",
  "stage7ExternalValidation",
  "stages1Through8",
]);
const EXTERNAL_ITEM_KEYS = new Set([
  "evidenceRef",
  "source",
  "status",
  "verifiedAt",
]);
const PRODUCTION_KEYS = new Set([
  "aiProductionActivation",
  "androidPhysicalDevice",
  "apnsFcmProvider",
  "appStoreApproval",
  "geminiProductionSecret",
  "iosPhysicalDevice",
  "mobileProductionOrigin",
  "ownerProductionAuthorization",
  "paymentProvider",
  "playStoreApproval",
  "productionAi",
  "productionRuntime",
  "storageProvider",
]);
const SECURITY_KEYS = new Set([
  "clientBundleSecretFindings",
  "dependencyAuditFindings",
  "privacyScanFindings",
  "productionMutationPerformed",
  "productionSecretsChanged",
  "secretScanFindings",
]);
const OPERATIONS_KEYS = new Set([
  "goNoGoMatrixComplete",
  "incidentRunbookComplete",
  "monitoringRunbookComplete",
  "postReleaseObservationPlanComplete",
  "rollbackRunbookComplete",
]);
const CRITICAL_MIGRATION_KEYS = new Set(
  Object.keys(GATE9D_CRITICAL_MIGRATION_HASHES),
);

function finding(
  code: Gate9DFindingCode,
  name: string,
  message: string,
): Gate9DFinding {
  return { code, name, message };
}

function uniqueFindings(findings: readonly Gate9DFinding[]) {
  return [...new Map(
    findings.map((item) => [`${item.code}:${item.name}`, item] as const),
  ).values()];
}

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

export function containsGate9DSecretLikeEvidence(value: unknown): boolean {
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

export function hasExactGate9DEvidenceShape(value: unknown): boolean {
  if (!hasOnlyKnownKeys(value, INPUT_KEYS)) return false;
  const input = value as Record<string, unknown>;
  if (
    input.now !== undefined
    && (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime()))
  ) {
    return false;
  }
  if (!hasOnlyKnownKeys(input.source, SOURCE_KEYS)) return false;
  if (!hasOnlyKnownKeys(input.inventory, INVENTORY_KEYS)) return false;
  if (!hasOnlyKnownKeys(input.staging, STAGING_KEYS)) return false;
  if (!hasOnlyKnownKeys(input.gates, GATES_KEYS)) return false;
  if (!hasOnlyKnownKeys(input.production, PRODUCTION_KEYS)) return false;
  if (!hasOnlyKnownKeys(input.security, SECURITY_KEYS)) return false;
  if (!hasOnlyKnownKeys(input.operations, OPERATIONS_KEYS)) return false;
  const inventory = input.inventory as Record<string, unknown>;
  if (
    !hasOnlyKnownKeys(
      inventory.criticalMigrationHashes,
      CRITICAL_MIGRATION_KEYS,
    )
  ) {
    return false;
  }
  const production = input.production as Record<string, unknown>;
  for (const key of PRODUCTION_KEYS) {
    const item = production[key];
    if (key === "productionAi" || key === "productionRuntime") continue;
    if (!hasOnlyKnownKeys(item, EXTERNAL_ITEM_KEYS)) return false;
  }
  return true;
}

function validEvidenceTime(value: string | undefined, now: Date) {
  if (!value) return false;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime())
    && instant.getTime() <= now.getTime()
    && now.getTime() - instant.getTime() <= MAX_EVIDENCE_AGE_MS;
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

function expectedMigrationHashesMatch(
  hashes: Readonly<Record<string, string>>,
) {
  const expected = Object.entries(GATE9D_CRITICAL_MIGRATION_HASHES);
  return Object.keys(hashes).length === expected.length
    && expected.every(([migration, hash]) => hashes[migration] === hash);
}

function validateSource(
  source: Gate9DSourceProvenanceEvidence | undefined,
  now: Date,
) {
  if (!source) {
    return [finding(
      "MISSING_FINAL_RELEASE_INPUT",
      "source",
      "Trusted GitHub, Vercel, CI, and local source provenance is required.",
    )];
  }
  const findings: Gate9DFinding[] = [];
  const requiredSources: readonly Gate9DEvidenceSource[] = [
    "REPOSITORY_SOURCE",
    "GITHUB_API",
    "GITHUB_ACTIONS",
    "VERCEL_API",
  ];
  const sourceList = Array.isArray(source.sources) ? source.sources : [];
  if (
    source.repository !== "aswad7022/REZNO"
    || source.githubDefaultBranch !== "main"
    || source.vercelProjectSlug !== GATE9D_STAGING_PROJECT
    || source.vercelSourceRef !== "main"
    || source.vercelStatus !== "READY"
    || source.ciConclusion !== "success"
    || !exactHttpsOrigin(source.vercelOrigin, GATE9D_STAGING_ORIGIN)
    || !Array.isArray(source.sources)
    || sourceList.some((item) => !GATE9D_EVIDENCE_SOURCES.has(item))
    || requiredSources.some((item) => !sourceList.includes(item))
  ) {
    findings.push(finding(
      "SOURCE_PROVENANCE_INVALID",
      "source",
      "Final release evidence must bind repository, GitHub Actions, Vercel staging, main, and the approved alias.",
    ));
  }
  if (sourceList.includes("SELF_ATTESTED")) {
    findings.push(finding(
      "SELF_ATTESTED_EVIDENCE",
      "source",
      "Self-attested source evidence cannot authorize final release closure.",
    ));
  }
  const shas = [
    source.authorizedSha,
    source.githubDefaultBranchHeadSha,
    source.localHeadSha,
    source.vercelSourceSha,
  ];
  if (shas.some((sha) => !SHA_PATTERN.test(sha)) || new Set(shas).size !== 1) {
    findings.push(finding(
      "SOURCE_PROVENANCE_INVALID",
      "sourceSha",
      "Authorized, local, GitHub main, and Vercel source SHAs must be the same complete commit.",
    ));
  }
  if (!validEvidenceTime(source.verifiedAt, now)) {
    findings.push(finding(
      "SOURCE_PROVENANCE_STALE",
      "sourceVerifiedAt",
      "Source provenance evidence must be current and not future-dated.",
    ));
  }
  return findings;
}

function validateInventory(
  inventory: Gate9DReleaseInventoryEvidence | undefined,
  expectedSha: string | undefined,
) {
  if (!inventory) {
    return [finding(
      "MISSING_FINAL_RELEASE_INPUT",
      "inventory",
      "Release inventory, versions, builds, tests, and migration baseline are required.",
    )];
  }
  const findings: Gate9DFinding[] = [];
  if (
    inventory.gate9dVersion !== STAGE9_GATE9D_VERSION
    || inventory.sourceSha !== expectedSha
    || !SHA_PATTERN.test(inventory.sourceSha)
    || !inventory.testsPassed
    || inventory.testFailures !== 0
    || inventory.testSkips !== 0
    || inventory.testTodos !== 0
    || !inventory.typeScriptPassed
    || !inventory.eslintPassed
    || !inventory.buildPassed
    || !inventory.expoDoctorPassed
    || inventory.mobileProductionOriginConfigured
    || inventory.prismaSchemaDiff
    || inventory.nextRouteCount > GATE9A_PERFORMANCE_BUDGETS.nextRouteCount
    || inventory.iosHermesModules > GATE9A_PERFORMANCE_BUDGETS.mobileExpoModuleCount
    || inventory.androidHermesModules > GATE9A_PERFORMANCE_BUDGETS.mobileExpoModuleCount
    || inventory.mobileWebModules > GATE9A_PERFORMANCE_BUDGETS.mobileExpoModuleCount
  ) {
    findings.push(finding(
      "RELEASE_INVENTORY_INVALID",
      "inventory",
      "Release inventory must match the reviewed source and all build, test, type, lint, and budget evidence must pass.",
    ));
  }
  if (
    inventory.migrationCount !== GATE9D_EXPECTED_MIGRATION_COUNT
    || inventory.migration52Present
    || !expectedMigrationHashesMatch(inventory.criticalMigrationHashes)
  ) {
    findings.push(finding(
      "MIGRATION_BASELINE_MISMATCH",
      "inventoryMigrations",
      "Gate 9D requires the accepted 51-migration baseline, no Migration 52, and exact critical hashes.",
    ));
  }
  return findings;
}

function validateStaging(
  staging: Gate9DStagingRuntimeEvidence | undefined,
  now: Date,
) {
  if (!staging) {
    return [finding(
      "MISSING_FINAL_RELEASE_INPUT",
      "staging",
      "Fresh read-only staging runtime and database evidence is required.",
    )];
  }
  const findings: Gate9DFinding[] = [];
  if (
    staging.totalMigrations !== GATE9D_EXPECTED_MIGRATION_COUNT
    || staging.appliedMigrations !== GATE9D_EXPECTED_MIGRATION_COUNT
    || staging.failedMigrations !== 0
    || staging.rolledBackMigrations !== 0
    || staging.schemaDrift !== "ABSENT"
  ) {
    findings.push(finding(
      "MIGRATION_BASELINE_MISMATCH",
      "stagingMigrations",
      "Staging must remain on the accepted 51/51 migration baseline without drift.",
    ));
  }
  if (
    staging.runtime !== "ENABLED"
    || staging.provider !== "GITHUB_ACTIONS_SCHEDULED_HTTP"
    || staging.totalSchedules !== GATE9D_EXPECTED_SCHEDULE_COUNT
    || staging.enabledSchedules !== GATE9D_EXPECTED_SCHEDULE_COUNT
    || staging.jobTypes !== GATE9D_EXPECTED_JOB_TYPE_COUNT
    || staging.activeJobs !== 0
    || staging.overdueJobs !== 0
    || staging.openAlerts !== 0
    || staging.runningAttempts !== 0
    || staging.runningInvocations !== 0
    || staging.staleLeases !== 0
  ) {
    findings.push(finding(
      "STAGING_RUNTIME_NOT_STABLE",
      "stagingRuntime",
      "Staging runtime must be enabled, fully scheduled, idle, alert-free, and without stale leases.",
    ));
  }
  if (!validEvidenceTime(staging.verifiedAt, now)) {
    findings.push(finding(
      "SOURCE_PROVENANCE_STALE",
      "stagingVerifiedAt",
      "Staging evidence must be current and not future-dated.",
    ));
  }
  return findings;
}

function validateGates(gates: Gate9DGateClosureEvidence | undefined) {
  if (!gates) {
    return [finding(
      "MISSING_FINAL_RELEASE_INPUT",
      "gates",
      "Prior gate closure state is required.",
    )];
  }
  if (
    gates.gate9A !== "CLOSED"
    || gates.gate9B !== "CLOSED"
    || gates.gate9C !== "CLOSED"
    || gates.aiGates !== "CLOSED"
    || gates.stage6StagingRuntime !== "CLOSED"
    || gates.stage6ProductionRuntime !== "NOT_ACTIVATED"
    || gates.stages1Through8 !== "CLOSED_WITH_STAGE7_EXTERNAL_DEFERRED"
    || gates.pr100 !== "OUT_OF_SCOPE"
    || !["DEFERRED_BY_OWNER", "CLOSED"].includes(gates.stage7ExternalValidation)
  ) {
    return [finding(
      "GATE_CLOSURE_INVALID",
      "gates",
      "Gate 9D requires Gates 9A-9C and AI Gates A-D closed, PR #100 out of scope, and production runtime not activated.",
    )];
  }
  return [];
}

function externalStatusFor(
  production: Gate9DProductionBoundaryEvidence,
  blocker: Gate9DExternalBlocker,
): Gate9DExternalEvidenceItem | undefined {
  const map: Record<Gate9DExternalBlocker, Gate9DExternalEvidenceItem | undefined> = {
    AI_PRODUCTION_ACTIVATION_DECISION: production.aiProductionActivation,
    APNS_FCM_PROVIDER_EVIDENCE: production.apnsFcmProvider,
    APP_STORE_APPROVAL: production.appStoreApproval,
    GEMINI_PRODUCTION_SECRET_DECISION: production.geminiProductionSecret,
    MOBILE_PRODUCTION_API_ORIGIN: production.mobileProductionOrigin,
    OWNER_PRODUCTION_AUTHORIZATION: production.ownerProductionAuthorization,
    PAYMENT_PROVIDER_ADAPTER: production.paymentProvider,
    PLAY_STORE_APPROVAL: production.playStoreApproval,
    STAGE7_PHYSICAL_ANDROID_DEVICE_EVIDENCE: production.androidPhysicalDevice,
    STAGE7_PHYSICAL_IOS_DEVICE_EVIDENCE: production.iosPhysicalDevice,
    STORAGE_PROVIDER_ADAPTER: production.storageProvider,
  };
  return map[blocker];
}

function validateExternalItem(
  item: Gate9DExternalEvidenceItem | undefined,
  blocker: Gate9DExternalBlocker,
  now: Date,
) {
  const findings: Gate9DFinding[] = [];
  if (!item || !isPlainRecord(item)) {
    findings.push(finding(
      "EXTERNAL_EVIDENCE_INVALID",
      blocker,
      "External evidence must use the Gate 9D production-boundary schema.",
    ));
    return findings;
  }
  if (
    !GATE9D_EVIDENCE_SOURCES.has(item.source)
    || !GATE9D_EXTERNAL_EVIDENCE_STATUSES.has(item.status)
  ) {
    findings.push(finding(
      "EXTERNAL_EVIDENCE_INVALID",
      blocker,
      "External evidence must use recognized Gate 9D status and source values.",
    ));
    return findings;
  }
  if (item.source === "SELF_ATTESTED") {
    findings.push(finding(
      "SELF_ATTESTED_EVIDENCE",
      blocker,
      "Self-attested external evidence cannot close Gate 9D.",
    ));
  }
  if (item.status === "PASSED") {
    if (
      item.source === "NONE"
      || item.source === "SELF_ATTESTED"
      || !item.evidenceRef
      || !SAFE_EVIDENCE_REF.test(item.evidenceRef)
      || !validEvidenceTime(item.verifiedAt, now)
    ) {
      findings.push(finding(
        "EXTERNAL_EVIDENCE_INVALID",
        blocker,
        "Passed external evidence must come from a trusted source, include a safe reference, and be current.",
      ));
    }
  }
  return findings;
}

function validateProductionBoundary(
  production: Gate9DProductionBoundaryEvidence | undefined,
  now: Date,
) {
  if (!production) {
    return [finding(
      "MISSING_FINAL_RELEASE_INPUT",
      "production",
      "Production boundary and external validation evidence is required.",
    )];
  }
  const findings: Gate9DFinding[] = [];
  if (
    production.productionRuntime !== "NOT_ACTIVATED"
    || production.productionAi !== "DISABLED"
  ) {
    findings.push(finding(
      "PRODUCTION_BOUNDARY_VIOLATION",
      "productionBoundary",
      "Gate 9D cannot perform or accept production runtime or AI activation.",
    ));
  }
  for (const blocker of GATE9D_REQUIRED_EXTERNAL_BLOCKERS) {
    findings.push(...validateExternalItem(
      externalStatusFor(production, blocker),
      blocker,
      now,
    ));
  }
  return findings;
}

function validateSecurity(security: Gate9DSecurityPrivacyEvidence | undefined) {
  if (!security) {
    return [finding(
      "MISSING_FINAL_RELEASE_INPUT",
      "security",
      "Security, privacy, audit, and mutation-boundary evidence is required.",
    )];
  }
  const findings: Gate9DFinding[] = [];
  if (
    security.secretScanFindings !== 0
    || security.clientBundleSecretFindings !== 0
    || security.privacyScanFindings !== 0
    || security.dependencyAuditFindings !== 0
  ) {
    findings.push(finding(
      "SECURITY_SCAN_FAILED",
      "securityScans",
      "Gate 9D requires zero audit, privacy, source secret, and client-bundle secret findings.",
    ));
  }
  if (security.productionMutationPerformed || security.productionSecretsChanged) {
    findings.push(finding(
      "PRODUCTION_BOUNDARY_VIOLATION",
      "productionMutations",
      "Gate 9D author implementation must not mutate production or change production secrets.",
    ));
  }
  return findings;
}

function validateOperations(operations: Gate9DOperationsEvidence | undefined) {
  if (!operations) {
    return [finding(
      "MISSING_FINAL_RELEASE_INPUT",
      "operations",
      "Go/no-go, monitoring, incident, rollback, and observation runbooks are required.",
    )];
  }
  if (
    !operations.goNoGoMatrixComplete
    || !operations.rollbackRunbookComplete
    || !operations.incidentRunbookComplete
    || !operations.monitoringRunbookComplete
    || !operations.postReleaseObservationPlanComplete
  ) {
    return [finding(
      "RUNBOOKS_INCOMPLETE",
      "operations",
      "Final release closure requires complete go/no-go, rollback, incident, monitoring, and observation runbooks.",
    )];
  }
  return [];
}

export function evaluateGate9DFinalReleaseClosure(
  input: Gate9DFinalReleaseClosureInput,
): Gate9DFinalReleaseClosureResult {
  const runtimeInput = (
    isPlainRecord(input) ? input : {}
  ) as Partial<Gate9DFinalReleaseClosureInput>;
  const now = runtimeInput.now instanceof Date
    && Number.isFinite(runtimeInput.now.getTime())
    ? runtimeInput.now
    : new Date();
  const shapeFindings = hasExactGate9DEvidenceShape(input) ? [] : [
    finding(
      "EVIDENCE_SHAPE_INVALID",
      "evidenceShape",
      "Final release evidence contains an unknown field or invalid object shape.",
    ),
  ];
  const secretFindings = containsGate9DSecretLikeEvidence(input) ? [
    finding(
      "SECRET_REDACTION_FAILURE",
      "evidence",
      "Final release evidence contains secret-like material and must be rejected.",
    ),
  ] : [];
  const findings = uniqueFindings([
    ...secretFindings,
    ...shapeFindings,
    ...validateSource(runtimeInput.source, now),
    ...validateInventory(
      runtimeInput.inventory,
      runtimeInput.source?.authorizedSha,
    ),
    ...validateStaging(runtimeInput.staging, now),
    ...validateGates(runtimeInput.gates),
    ...validateProductionBoundary(runtimeInput.production, now),
    ...validateSecurity(runtimeInput.security),
    ...validateOperations(runtimeInput.operations),
  ]);
  const externalBlockers = runtimeInput.production
    ? GATE9D_REQUIRED_EXTERNAL_BLOCKERS.filter((blocker) =>
      externalStatusFor(runtimeInput.production!, blocker)?.status !== "PASSED"
    )
    : [...GATE9D_REQUIRED_EXTERNAL_BLOCKERS];
  if (findings.length > 0) {
    return {
      externalBlockers,
      findings,
      ok: false,
      reason: findings[0]!.code,
      status: "BLOCKED",
    };
  }
  if (externalBlockers.length > 0) {
    return {
      externalBlockers,
      findings: [],
      ok: true,
      reason: "EXTERNAL_VALIDATION_REQUIRED",
      status: "EXTERNAL_VALIDATION_REQUIRED",
    };
  }
  return {
    externalBlockers: [],
    findings: [],
    ok: true,
    reason: "READY",
    status: "READY_FOR_INDEPENDENT_FINAL_RELEASE_REVIEW",
  };
}

export class Gate9DFinalReleaseClosureError extends Error {
  constructor(readonly code: Gate9DFindingCode) {
    super("Gate 9D final release evidence failed closed.");
    this.name = "Gate9DFinalReleaseClosureError";
  }
}

export function assertGate9DFinalReleaseClosure(
  input: Gate9DFinalReleaseClosureInput,
) {
  const result = evaluateGate9DFinalReleaseClosure(input);
  if (result.status === "BLOCKED") {
    throw new Gate9DFinalReleaseClosureError(result.reason as Gate9DFindingCode);
  }
  return result;
}
