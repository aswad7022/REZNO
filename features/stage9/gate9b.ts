import { createHash } from "node:crypto";

import {
  GATE9A_CRITICAL_MIGRATION_HASHES,
  GATE9A_EXPECTED_MIGRATION_COUNT,
} from "@/features/stage9/gate9a";

export const STAGE9_GATE9B_BASE_SHA =
  "032e8fe756d5ffbc67f079a2d53cb47e2f3b782d" as const;

export const STAGE9_GATE9B_BRANCH =
  "feat/stage9-staging-runtime-activation" as const;
export const STAGE9_GATE9B_POST_MERGE_BRANCH = "main" as const;

export const STAGE9_GATE9B_VERSION =
  "stage9-gate9b-staging-runtime-activation-v1" as const;

export const GATE9B_STAGING_PROJECT = "rezno-staging" as const;
export const GATE9B_STAGING_ORIGIN =
  "https://rezno-staging.vercel.app" as const;
export const GATE9B_STAGING_DATABASE_NAME = "rezno_staging" as const;
export const GATE9B_RUNTIME_URL_VARIABLE =
  "REZNO_PLATFORM_RUNTIME_URL" as const;

export const GATE9B_EXPECTED_MIGRATION_COUNT =
  GATE9A_EXPECTED_MIGRATION_COUNT;

export const GATE9B_CRITICAL_MIGRATION_HASHES =
  GATE9A_CRITICAL_MIGRATION_HASHES;

export const GATE9B_EXPECTED_JOB_TYPES = [
  "PLATFORM_HEALTH_PROBE",
  "STORAGE_MAINTENANCE_DISCOVERY",
  "STORAGE_ORPHAN_CLEANUP",
  "STORAGE_ASSET_DELETE_RETRY",
  "STORAGE_RESCAN_DISCOVERY",
  "STORAGE_ASSET_RESCAN",
  "MEDIA_RENDITION_DISCOVERY",
  "MEDIA_RENDITION_GENERATE",
  "MEDIA_RENDITION_CLEANUP_DISCOVERY",
  "MEDIA_RENDITION_DELETE",
  "COMMUNICATION_CAMPAIGN_DISCOVERY",
  "COMMUNICATION_DELIVERY_DISCOVERY",
  "COMMUNICATION_CAMPAIGN_DISPATCH",
  "COMMUNICATION_DELIVERY_DISPATCH",
  "PAYMENT_PROVIDER_EVENT_PROCESS",
  "PAYMENT_RETRY_DISCOVERY",
  "PAYMENT_ATTEMPT_RETRY",
  "PAYMENT_REFUND_RETRY",
  "PAYMENT_RECONCILIATION",
  "SETTLEMENT_STATEMENT_GENERATE",
  "COMMERCE_ORDER_EXPIRY",
  "PLATFORM_OPERATIONS_MONITOR",
  "DISTRIBUTED_RATE_LIMIT_CLEANUP",
] as const;

export const GATE9B_ALLOWED_STAGING_SCHEDULES = [
  "PLATFORM_HEALTH_PROBE",
  "COMMERCE_ORDER_EXPIRY",
  "STORAGE_MAINTENANCE_DISCOVERY",
  "STORAGE_RESCAN_DISCOVERY",
  "MEDIA_RENDITION_DISCOVERY",
  "MEDIA_RENDITION_CLEANUP_DISCOVERY",
  "COMMUNICATION_CAMPAIGN_DISCOVERY",
  "COMMUNICATION_DELIVERY_DISCOVERY",
  "PAYMENT_RETRY_DISCOVERY",
  "PAYMENT_RECONCILIATION",
  "SETTLEMENT_STATEMENT_GENERATE",
  "PLATFORM_OPERATIONS_MONITOR",
  "DISTRIBUTED_RATE_LIMIT_CLEANUP",
] as const;

export const GATE9B_REQUIRED_ADMIN_PERMISSIONS = [
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
] as const;

export const GATE9B_REQUIRED_EXTERNAL_INPUTS = [
  { name: "DATABASE_URL", secret: true },
  { name: "BETTER_AUTH_SECRET", secret: true },
  { name: "BETTER_AUTH_URL", secret: false },
  { name: "REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST", secret: false },
  { name: "REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE", secret: false },
  { name: "REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE", secret: false },
  { name: "REZNO_STAGE9_GATE9B_RESTORE_POINT_ID", secret: false },
  { name: "REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFICATION_SOURCE", secret: false },
  { name: "REZNO_STAGE9_GATE9B_RESTORE_POINT_DATABASE_BINDING_SHA256", secret: false },
  { name: "REZNO_STAGE9_GATE9B_RESTORE_POINT_CREATED_AT", secret: false },
  { name: "REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFIED_AT", secret: false },
  { name: "REZNO_STAGE9_GATE9B_RESTORE_POINT_EXPIRES_AT", secret: false },
  { name: "REZNO_STAGE9_GATE9B_SCHEMA_DRIFT_STATUS", secret: false },
  { name: "REZNO_STAGE9_GATE9B_DEPLOYMENT_SHA", secret: false },
  { name: "REZNO_STAGE9_GATE9B_DEPLOYMENT_SOURCE_SHA", secret: false },
  { name: "REZNO_STAGE9_GATE9B_DEPLOYMENT_PROJECT", secret: false },
  { name: "REZNO_STAGE9_GATE9B_DEPLOYMENT_STATUS", secret: false },
  { name: GATE9B_RUNTIME_URL_VARIABLE, secret: false },
] as const;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
export const GATE9B_LOCAL_TEST_SOURCE = "local-disposable-test" as const;

const TRUSTED_DATABASE_IDENTITY_SOURCES = new Set([
  "neon-api",
  "vercel-neon-integration",
]);
const TRUSTED_RESTORE_POINT_SOURCES = new Set([
  "neon-api",
]);
const RESTORE_POINT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SECRET_LIKE =
  /(?:postgres(?:ql)?:\/\/|password\s*[:=]|authorization\s*[:=]|bearer\s+[a-z0-9._-]+|cookie\s*[:=]|token\s*[:=]|api[_-]?key\s*[:=]|gho_[a-z0-9_]+|ghp_[a-z0-9_]+|vercel_[a-z0-9_]+|sk-[a-z0-9_-]+)/iu;

export type Gate9BFindingCode =
  | "MISSING_EXTERNAL_INPUT"
  | "INVALID_DATABASE_URL"
  | "INVALID_DATABASE_IDENTITY"
  | "INVALID_STAGING_ORIGIN"
  | "INVALID_RUNTIME_URL"
  | "PRODUCTION_TARGET_FORBIDDEN"
  | "UNVERIFIED_DATABASE_IDENTITY"
  | "UNVERIFIED_RESTORE_POINT"
  | "STALE_RESTORE_POINT"
  | "RESTORE_POINT_DATABASE_MISMATCH"
  | "MISSING_DEPLOYMENT_EVIDENCE"
  | "MIGRATION_BASELINE_MISMATCH"
  | "SCHEMA_DRIFT_UNVERIFIED"
  | "SCHEMA_DRIFT_DETECTED"
  | "ADMIN_CONTEXT_REQUIRED"
  | "INVALID_ADMIN_CONTEXT"
  | "PREFLIGHT_EVIDENCE_STALE"
  | "UNSAFE_PROVIDER_CONFIGURED"
  | "AI_MUST_REMAIN_DISABLED"
  | "DEPLOYMENT_SHA_UNVERIFIED"
  | "DEPLOYMENT_SHA_MISMATCH"
  | "POST_MERGE_DEPLOYMENT_REQUIRED"
  | "DEPLOYMENT_NOT_READY"
  | "DEPLOYMENT_EVIDENCE_STALE"
  | "RUNTIME_REGISTRY_MISMATCH"
  | "SCHEDULE_REGISTRY_MISMATCH"
  | "SECRET_VALUE_REDACTION_FAILURE";

export type Gate9BFinding = {
  readonly code: Gate9BFindingCode;
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
};

export type Gate9BValidation = {
  readonly externalInputRequired: boolean;
  readonly findings: readonly Gate9BFinding[];
  readonly ok: boolean;
  readonly reason: Gate9BFindingCode | "READY";
};

export type Gate9BDatabaseIdentity = {
  readonly database: typeof GATE9B_STAGING_DATABASE_NAME;
  readonly directNonPooler: boolean;
  readonly hostSha256: string;
  readonly hostSuffix: string;
  readonly roleSha256: string;
  readonly sslmode: "disable" | "verify-full";
};

export type Gate9BDeploymentEvidence = {
  readonly deploymentSha: string;
  readonly origin: string;
  readonly projectSlug: string;
  readonly sourceSha: string;
  readonly status: "READY" | "SUCCESS" | "PENDING" | "FAILED";
  readonly trustedVerification?: Gate9BDeploymentTrustedVerification;
};

export type Gate9BDeploymentTrustedVerification = {
  readonly authorizedSha: string;
  readonly githubDefaultBranch?: string;
  readonly githubDefaultBranchHeadSha?: string;
  readonly githubHeadSha: string;
  readonly localHeadSha: string;
  readonly mode?: "pre-merge-branch" | "post-merge-default-branch";
  readonly source: "github-vercel-api" | typeof GATE9B_LOCAL_TEST_SOURCE;
  readonly verifiedAt?: string;
  readonly vercelProjectSlug: string;
  readonly vercelSourceRef?: string;
  readonly vercelSourceSha: string;
};

export type Gate9BPostMergeDeploymentTrustedVerification =
  Gate9BDeploymentTrustedVerification & {
    readonly mode: "post-merge-default-branch";
  };

export type Gate9BPostMergeActivationDeploymentEvidence =
  Gate9BDeploymentEvidence & {
    readonly trustedVerification: Gate9BPostMergeDeploymentTrustedVerification;
  };

export type Gate9BMigrationEvidence = {
  readonly applied: number;
  readonly criticalHashes: Readonly<Record<string, string>>;
  readonly failed: number;
  readonly rolledBack: number;
  readonly schemaDrift: "ABSENT" | "PRESENT" | "UNVERIFIED";
  readonly total: number;
};

export type Gate9BRestorePointEvidence = {
  readonly createdAt?: string;
  readonly databaseBindingSha256?: string;
  readonly expiresAt?: string;
  readonly providerVerified?: boolean;
  readonly restorePointIdPresent: boolean;
  readonly source?: string;
  readonly verifiedAt?: string;
};

export type Gate9BAdminEvidence = {
  readonly permissions?: readonly string[];
  readonly status: "MISSING" | "INVALID" | "VERIFIED";
};

export type Gate9BActivationPreconditionInput = {
  readonly adminEvidence?: Gate9BAdminEvidence;
  readonly databaseIdentity?: Gate9BDatabaseIdentity;
  readonly deploymentEvidence?: Gate9BDeploymentEvidence;
  readonly env: Record<string, string | undefined>;
  readonly migrationEvidence?: Gate9BMigrationEvidence;
  readonly now?: Date;
  readonly requireAdmin?: boolean;
  readonly restorePointEvidence?: Gate9BRestorePointEvidence;
};

export type Gate9BActivationContext = {
  readonly adminEvidence?: Gate9BAdminEvidence;
  readonly databaseBindingSha256: string;
  readonly databaseIdentity: Gate9BDatabaseIdentity;
  readonly deploymentSha: string;
  readonly runtimeUrl: typeof GATE9B_STAGING_ORIGIN;
};

export type Gate9BRuntimeSnapshot = {
  readonly enabledScheduleKeys: readonly string[];
  readonly jobTypes: readonly string[];
  readonly providerTruth: {
    readonly ai: "DISABLED";
    readonly communications: "NOT_CONFIGURED";
    readonly payment: "NOT_CONFIGURED" | "DETERMINISTIC_TEST";
    readonly push: "NOT_CONFIGURED";
    readonly storage: "NOT_CONFIGURED" | "DETERMINISTIC_TEST";
  };
  readonly scheduleKeys: readonly string[];
  readonly stage6Runtime:
    | "NOT_ACTIVATED"
    | "STAGING_ACTIVATED_PRODUCTION_NOT_ACTIVATED";
};

export class Gate9BValidationError extends Error {
  constructor(
    readonly code: Gate9BFindingCode,
    readonly name: string,
  ) {
    super("Gate 9B validation failed closed.");
    this.name = "Gate9BValidationError";
  }
}

export function gate9BMissingExternalInputs(
  env: Record<string, string | undefined>,
) {
  return GATE9B_REQUIRED_EXTERNAL_INPUTS.filter((item) => {
    const value = env[item.name];
    return value === undefined || value.trim().length === 0;
  }).map((item) => item.name);
}

export function validateGate9BEnvironment(
  env: Record<string, string | undefined>,
): Gate9BValidation {
  const findings: Gate9BFinding[] = [];
  for (const name of gate9BMissingExternalInputs(env)) {
    findings.push(finding(
      "MISSING_EXTERNAL_INPUT",
      name,
      "error",
      `${name} must be configured before Gate 9B may write to staging.`,
    ));
  }

  findings.push(...validateGate9BRuntimeUrl(env.REZNO_PLATFORM_RUNTIME_URL).findings);

  for (const [name, raw] of [
    ["BETTER_AUTH_URL", env.BETTER_AUTH_URL],
    ["NEXT_PUBLIC_APP_URL", env.NEXT_PUBLIC_APP_URL],
  ] as const) {
    if (raw !== undefined && raw.trim() !== GATE9B_STAGING_ORIGIN) {
      findings.push(finding(
        "INVALID_STAGING_ORIGIN",
        name,
        "error",
        `${name} must match the approved staging origin.`,
      ));
    }
  }

  findings.push(...validateGate9BProviderPosture(env));

  if (findings.some((item) => SECRET_LIKE.test(item.message))) {
    findings.push(finding(
      "SECRET_VALUE_REDACTION_FAILURE",
      "Gate9BValidation",
      "error",
      "A finding message contains a secret-like value.",
    ));
  }

  return {
    externalInputRequired: findings.some((item) => item.code === "MISSING_EXTERNAL_INPUT"),
    findings: dedupeFindings(findings),
    ok: findings.every((item) => item.severity !== "error"),
    reason: reasonFor(findings),
  };
}

export function validateGate9BRuntimeUrl(
  rawRuntimeUrl: string | undefined,
): Gate9BValidation {
  const findings: Gate9BFinding[] = [];
  const runtimeUrl = rawRuntimeUrl?.trim();
  if (runtimeUrl === undefined || runtimeUrl.length === 0) {
    findings.push(finding(
      "MISSING_EXTERNAL_INPUT",
      "REZNO_PLATFORM_RUNTIME_URL",
      "error",
      "The platform runtime URL must be configured before Gate 9B activation.",
    ));
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(runtimeUrl);
    } catch {
      findings.push(finding(
        "INVALID_RUNTIME_URL",
        "REZNO_PLATFORM_RUNTIME_URL",
        "error",
        "The platform runtime URL must be the exact approved staging origin.",
      ));
    }
    if (
      !parsed
      || parsed.protocol !== "https:"
      || parsed.username.length > 0
      || parsed.password.length > 0
      || parsed.search.length > 0
      || parsed.hash.length > 0
      || parsed.origin !== GATE9B_STAGING_ORIGIN
      || runtimeUrl !== GATE9B_STAGING_ORIGIN
    ) {
      findings.push(finding(
        "INVALID_RUNTIME_URL",
        "REZNO_PLATFORM_RUNTIME_URL",
        "error",
        "The platform runtime URL must be HTTPS and match the approved staging origin without credentials, query, or fragment.",
      ));
    }
  }
  return {
    externalInputRequired: findings.some((item) => item.code === "MISSING_EXTERNAL_INPUT"),
    findings: dedupeFindings(findings),
    ok: findings.every((item) => item.severity !== "error"),
    reason: reasonFor(findings),
  };
}

export function validateGate9BProviderPosture(
  env: Record<string, string | undefined>,
): readonly Gate9BFinding[] {
  const findings: Gate9BFinding[] = [];
  if (env.REZNO_AI_ENABLED === "true" || env.REZNO_AI_GEMINI_ENABLED === "true") {
    findings.push(finding(
      "AI_MUST_REMAIN_DISABLED",
      "REZNO_AI_ENABLED",
      "error",
      "Gemini must remain disabled on staging and production during Gate 9B.",
    ));
  }
  if (env.GEMINI_API_KEY !== undefined && env.GEMINI_API_KEY.trim().length > 0) {
    findings.push(finding(
      "AI_MUST_REMAIN_DISABLED",
      "GEMINI_API_KEY",
      "error",
      "Gemini credentials are out of scope for Gate 9B staging activation.",
    ));
  }
  if (
    env.REZNO_PUSH_RECEIPT_PROVIDERS !== undefined
    && env.REZNO_PUSH_RECEIPT_PROVIDERS.trim().length > 0
    && env.REZNO_PUSH_RECEIPT_PROVIDERS !== "NOT_CONFIGURED"
  ) {
    findings.push(finding(
      "UNSAFE_PROVIDER_CONFIGURED",
      "REZNO_PUSH_RECEIPT_PROVIDERS",
      "error",
      "APNs/FCM provider validation remains deferred and must not be activated in Gate 9B.",
    ));
  }
  if (!providerAllowed(env.REZNO_PAYMENT_PROVIDER, ["NOT_CONFIGURED", "DETERMINISTIC_TEST"])) {
    findings.push(finding(
      "UNSAFE_PROVIDER_CONFIGURED",
      "REZNO_PAYMENT_PROVIDER",
      "error",
      "Gate 9B permits only no payment provider or deterministic payment capability.",
    ));
  }
  if (!providerAllowed(env.REZNO_STORAGE_PROVIDER, ["NOT_CONFIGURED", "DETERMINISTIC_TEST"])) {
    findings.push(finding(
      "UNSAFE_PROVIDER_CONFIGURED",
      "REZNO_STORAGE_PROVIDER",
      "error",
      "Gate 9B permits only no storage provider or deterministic storage capability.",
    ));
  }
  return findings;
}

export function parseGate9BStagingDatabaseIdentity(
  databaseUrl: string | undefined,
  confirmations: {
    readonly expectedIdentitySource?: string;
    readonly expectedHost?: string;
    readonly expectedRole?: string;
    readonly allowLocalTest?: boolean;
  } = {},
): Gate9BDatabaseIdentity {
  if (!databaseUrl) {
    throw new Gate9BValidationError("MISSING_EXTERNAL_INPUT", "DATABASE_URL");
  }
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Gate9BValidationError("INVALID_DATABASE_URL", "DATABASE_URL");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Gate9BValidationError("INVALID_DATABASE_URL", "DATABASE_URL");
  }
  if (parsed.pathname !== `/${GATE9B_STAGING_DATABASE_NAME}`) {
    throw new Gate9BValidationError("INVALID_DATABASE_IDENTITY", "DATABASE_URL");
  }
  const host = parsed.hostname.toLowerCase();
  const sslmode = parsed.searchParams.get("sslmode");
  const role = decodeURIComponent(parsed.username);
  const identityMarkers = `${host}/${parsed.pathname}/${role}`.toLowerCase();
  const hasProductionMarker = /\b(prod|production|live)\b/.test(identityMarkers)
    || /(?:^|[-_.])(prod|production|live)(?:[-_.]|$)/.test(identityMarkers);
  const hasStagingMarker = /stag|staging/.test(identityMarkers);
  if (hasProductionMarker || (hasProductionMarker && hasStagingMarker)) {
    throw new Gate9BValidationError("PRODUCTION_TARGET_FORBIDDEN", "DATABASE_URL");
  }
  const local = confirmations.allowLocalTest === true && LOOPBACK_HOSTS.has(host);
  if (local) {
    if (confirmations.expectedIdentitySource !== GATE9B_LOCAL_TEST_SOURCE) {
      throw new Gate9BValidationError(
        "UNVERIFIED_DATABASE_IDENTITY",
        "REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE",
      );
    }
    if (!confirmations.expectedHost) {
      throw new Gate9BValidationError(
        "MISSING_EXTERNAL_INPUT",
        "REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST",
      );
    }
    if (confirmations.expectedHost.toLowerCase() !== host) {
      throw new Gate9BValidationError(
        "INVALID_DATABASE_IDENTITY",
        "REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST",
      );
    }
    if (!confirmations.expectedRole) {
      throw new Gate9BValidationError(
        "MISSING_EXTERNAL_INPUT",
        "REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE",
      );
    }
    if (confirmations.expectedRole !== role) {
      throw new Gate9BValidationError(
        "INVALID_DATABASE_IDENTITY",
        "REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE",
      );
    }
    if (sslmode && sslmode !== "disable") {
      throw new Gate9BValidationError("INVALID_DATABASE_IDENTITY", "DATABASE_URL");
    }
  } else {
    if (!TRUSTED_DATABASE_IDENTITY_SOURCES.has(confirmations.expectedIdentitySource ?? "")) {
      throw new Gate9BValidationError(
        "UNVERIFIED_DATABASE_IDENTITY",
        "REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE",
      );
    }
    if (!host.endsWith(".neon.tech") || host.includes("-pooler.") || sslmode !== "verify-full") {
      throw new Gate9BValidationError("INVALID_DATABASE_IDENTITY", "DATABASE_URL");
    }
    if (!confirmations.expectedHost) {
      throw new Gate9BValidationError(
        "MISSING_EXTERNAL_INPUT",
        "REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST",
      );
    }
    if (confirmations.expectedHost.toLowerCase() !== host) {
      throw new Gate9BValidationError(
        "INVALID_DATABASE_IDENTITY",
        "REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST",
      );
    }
    if (!confirmations.expectedRole) {
      throw new Gate9BValidationError(
        "MISSING_EXTERNAL_INPUT",
        "REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE",
      );
    }
    if (confirmations.expectedRole !== role) {
      throw new Gate9BValidationError(
        "INVALID_DATABASE_IDENTITY",
        "REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE",
      );
    }
  }
  return {
    database: GATE9B_STAGING_DATABASE_NAME,
    directNonPooler: !local,
    hostSha256: sha256(host),
    hostSuffix: local ? "loopback-test" : host.split(".").slice(-3).join("."),
    roleSha256: sha256(role),
    sslmode: local ? "disable" : "verify-full",
  };
}

export function gate9BDatabaseBindingSha256(identity: Gate9BDatabaseIdentity) {
  return sha256([
    identity.database,
    identity.directNonPooler ? "direct" : "loopback",
    identity.hostSha256,
    identity.roleSha256,
    identity.sslmode,
  ].join(":"));
}

export function gate9BDeploymentEvidenceFromEnv(
  env: Record<string, string | undefined>,
): Gate9BDeploymentEvidence | null {
  const deploymentSha = env.REZNO_STAGE9_GATE9B_DEPLOYMENT_SHA?.trim();
  const sourceSha = env.REZNO_STAGE9_GATE9B_DEPLOYMENT_SOURCE_SHA?.trim();
  const projectSlug = env.REZNO_STAGE9_GATE9B_DEPLOYMENT_PROJECT?.trim();
  const status = env.REZNO_STAGE9_GATE9B_DEPLOYMENT_STATUS?.trim();
  if (!deploymentSha || !sourceSha || !projectSlug || !status) return null;
  if (status !== "READY" && status !== "SUCCESS" && status !== "PENDING" && status !== "FAILED") {
    return null;
  }
  return {
    deploymentSha,
    origin: GATE9B_STAGING_ORIGIN,
    projectSlug,
    sourceSha,
    status,
  };
}

export function gate9BRestorePointEvidenceFromEnv(
  env: Record<string, string | undefined>,
): Gate9BRestorePointEvidence {
  return {
    createdAt: env.REZNO_STAGE9_GATE9B_RESTORE_POINT_CREATED_AT?.trim(),
    databaseBindingSha256:
      env.REZNO_STAGE9_GATE9B_RESTORE_POINT_DATABASE_BINDING_SHA256?.trim(),
    expiresAt: env.REZNO_STAGE9_GATE9B_RESTORE_POINT_EXPIRES_AT?.trim(),
    providerVerified: false,
    restorePointIdPresent:
      (env.REZNO_STAGE9_GATE9B_RESTORE_POINT_ID?.trim().length ?? 0) > 0,
    source: env.REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFICATION_SOURCE?.trim(),
    verifiedAt: env.REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFIED_AT?.trim(),
  };
}

export function validateGate9BMigrationEvidence(
  evidence: Gate9BMigrationEvidence | undefined,
): Gate9BValidation {
  const findings: Gate9BFinding[] = [];
  if (!evidence) {
    findings.push(finding(
      "MIGRATION_BASELINE_MISMATCH",
      "migrations",
      "error",
      "Gate 9B requires read-only migration evidence before any write.",
    ));
  } else {
    if (
      evidence.total !== GATE9B_EXPECTED_MIGRATION_COUNT
      || evidence.applied !== GATE9B_EXPECTED_MIGRATION_COUNT
      || evidence.failed !== 0
      || evidence.rolledBack !== 0
    ) {
      findings.push(finding(
        "MIGRATION_BASELINE_MISMATCH",
        "migrations",
        "error",
        "Gate 9B requires exact healthy 51/51 migrations.",
      ));
    }
    for (const [migration, expectedHash] of Object.entries(GATE9B_CRITICAL_MIGRATION_HASHES)) {
      if (evidence.criticalHashes[migration] !== expectedHash) {
        findings.push(finding(
          "MIGRATION_BASELINE_MISMATCH",
          "migrationHashes",
          "error",
          "Gate 9B requires the accepted migration hashes.",
        ));
        break;
      }
    }
    if (evidence.schemaDrift === "PRESENT") {
      findings.push(finding(
        "SCHEMA_DRIFT_DETECTED",
        "schemaDrift",
        "error",
        "Gate 9B refuses activation when schema drift is detected.",
      ));
    }
    if (evidence.schemaDrift === "UNVERIFIED") {
      findings.push(finding(
        "SCHEMA_DRIFT_UNVERIFIED",
        "schemaDrift",
        "error",
        "Gate 9B requires schema drift evidence before activation.",
      ));
    }
  }
  return {
    externalInputRequired: false,
    findings: dedupeFindings(findings),
    ok: findings.every((item) => item.severity !== "error"),
    reason: reasonFor(findings),
  };
}

export function validateGate9BRestorePointEvidence(input: {
  readonly allowLocalTest?: boolean;
  readonly databaseBindingSha256?: string;
  readonly evidence: Gate9BRestorePointEvidence | undefined;
  readonly now?: Date;
}): Gate9BValidation {
  const findings: Gate9BFinding[] = [];
  const now = input.now ?? new Date();
  const evidence = input.evidence;
  if (!evidence || !evidence.restorePointIdPresent) {
    findings.push(finding(
      "MISSING_EXTERNAL_INPUT",
      "REZNO_STAGE9_GATE9B_RESTORE_POINT_ID",
      "error",
      "Gate 9B requires a verified restore point before any staging write.",
    ));
  } else {
    const trustedSource = input.allowLocalTest
      ? evidence.source === GATE9B_LOCAL_TEST_SOURCE && evidence.providerVerified === true
      : TRUSTED_RESTORE_POINT_SOURCES.has(evidence.source ?? "")
        && evidence.providerVerified === true;
    if (!trustedSource) {
      findings.push(finding(
        "UNVERIFIED_RESTORE_POINT",
        "REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFICATION_SOURCE",
        "error",
        "Gate 9B restore point must be verified by the provider before activation.",
      ));
    }
    if (
      !input.databaseBindingSha256
      || evidence.databaseBindingSha256 !== input.databaseBindingSha256
    ) {
      findings.push(finding(
        "RESTORE_POINT_DATABASE_MISMATCH",
        "REZNO_STAGE9_GATE9B_RESTORE_POINT_DATABASE_BINDING_SHA256",
        "error",
        "Gate 9B restore point must be bound to the verified staging database.",
      ));
    }
    const createdAt = parseDate(evidence.createdAt);
    const verifiedAt = parseDate(evidence.verifiedAt);
    const expiresAt = parseDate(evidence.expiresAt);
    if (!createdAt || !verifiedAt || !expiresAt) {
      findings.push(finding(
        "UNVERIFIED_RESTORE_POINT",
        "REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFIED_AT",
        "error",
        "Gate 9B restore point evidence must include valid created, verified, and expiry instants.",
      ));
    } else {
      if (createdAt.getTime() > now.getTime()) {
        findings.push(finding(
          "UNVERIFIED_RESTORE_POINT",
          "REZNO_STAGE9_GATE9B_RESTORE_POINT_CREATED_AT",
          "error",
          "Gate 9B restore point cannot be created in the future.",
        ));
      }
      if (verifiedAt.getTime() < createdAt.getTime()) {
        findings.push(finding(
          "UNVERIFIED_RESTORE_POINT",
          "REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFIED_AT",
          "error",
          "Gate 9B restore point verification must not predate creation.",
        ));
      }
      if (
        expiresAt.getTime() <= now.getTime()
        || now.getTime() - createdAt.getTime() > RESTORE_POINT_MAX_AGE_MS
      ) {
        findings.push(finding(
          "STALE_RESTORE_POINT",
          "REZNO_STAGE9_GATE9B_RESTORE_POINT_EXPIRES_AT",
          "error",
          "Gate 9B restore point evidence is stale.",
        ));
      }
    }
  }
  return {
    externalInputRequired: findings.some((item) => item.code === "MISSING_EXTERNAL_INPUT"),
    findings: dedupeFindings(findings),
    ok: findings.every((item) => item.severity !== "error"),
    reason: reasonFor(findings),
  };
}

export function evaluateGate9BActivationPreconditions(
  input: Gate9BActivationPreconditionInput,
): Gate9BValidation {
  const findings: Gate9BFinding[] = [
    ...validateGate9BEnvironment(input.env).findings,
  ];
  const allowLocalTest = input.env.REZNO_STAGE9_GATE9B_ALLOW_LOCAL_TEST_DB === "true";
  let databaseIdentity = input.databaseIdentity;
  if (!databaseIdentity) {
    try {
      databaseIdentity = parseGate9BStagingDatabaseIdentity(input.env.DATABASE_URL, {
        allowLocalTest,
        expectedHost: input.env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST,
        expectedIdentitySource: input.env.REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE,
        expectedRole: input.env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE,
      });
    } catch (error) {
      const gateError = error as Partial<Gate9BValidationError>;
      findings.push(finding(
        gateError.code ?? "INVALID_DATABASE_IDENTITY",
        gateError.name ?? "DATABASE_URL",
        "error",
        "Gate 9B database identity failed closed.",
      ));
    }
  }
  const databaseBindingSha256 = databaseIdentity
    ? gate9BDatabaseBindingSha256(databaseIdentity)
    : undefined;
  findings.push(...validateGate9BMigrationEvidence(input.migrationEvidence).findings);
  findings.push(...validateGate9BRestorePointEvidence({
    allowLocalTest,
    databaseBindingSha256,
    evidence: input.restorePointEvidence ?? gate9BRestorePointEvidenceFromEnv(input.env),
    now: input.now,
  }).findings);
  const deploymentEvidence =
    input.deploymentEvidence ?? gate9BDeploymentEvidenceFromEnv(input.env);
  if (!deploymentEvidence) {
    findings.push(finding(
      "MISSING_DEPLOYMENT_EVIDENCE",
      "REZNO_STAGE9_GATE9B_DEPLOYMENT_SHA",
      "error",
      "Gate 9B requires deployment evidence before activation.",
    ));
  } else {
    const postMergeFindings = validateGate9BPostMergeActivationDeploymentEvidence(
      deploymentEvidence,
    ).findings;
    const deploymentFindings = validateGate9BDeploymentEvidence(deploymentEvidence, {
      allowLocalTest,
      now: input.now,
    }).findings;
    findings.push(
      ...(deploymentEvidence.trustedVerification ? postMergeFindings : deploymentFindings),
      ...(deploymentEvidence.trustedVerification ? deploymentFindings : postMergeFindings),
    );
  }
  if (input.requireAdmin) {
    if (!input.adminEvidence || input.adminEvidence.status === "MISSING") {
      findings.push(finding(
        "ADMIN_CONTEXT_REQUIRED",
        "REZNO_STAGE9_GATE9B_ADMIN_CONTEXT",
        "error",
        "Gate 9B runtime activation requires a verified current Admin context.",
      ));
    } else if (input.adminEvidence.status !== "VERIFIED") {
      findings.push(finding(
        "INVALID_ADMIN_CONTEXT",
        "REZNO_STAGE9_GATE9B_ADMIN_CONTEXT",
        "error",
        "Gate 9B Admin context failed verification.",
      ));
    } else {
      const missing = GATE9B_REQUIRED_ADMIN_PERMISSIONS.find((permission) =>
        !input.adminEvidence?.permissions?.includes(permission)
      );
      if (missing) {
        findings.push(finding(
          "INVALID_ADMIN_CONTEXT",
          "REZNO_STAGE9_GATE9B_ADMIN_CONTEXT",
          "error",
          "Gate 9B Admin context lacks required activation permissions.",
        ));
      }
    }
  }
  return {
    externalInputRequired: externalInputRequiredFor(findings),
    findings: dedupeFindings(findings),
    ok: findings.every((item) => item.severity !== "error"),
    reason: reasonFor(findings),
  };
}

export function assertGate9BActivationPreconditions(
  input: Gate9BActivationPreconditionInput,
): Gate9BActivationContext {
  const validation = evaluateGate9BActivationPreconditions(input);
  if (!validation.ok) {
    const first = validation.findings.find((item) => item.severity === "error");
    throw new Gate9BValidationError(
      first?.code ?? "PREFLIGHT_EVIDENCE_STALE",
      first?.name ?? "Gate9BActivation",
    );
  }
  const allowLocalTest = input.env.REZNO_STAGE9_GATE9B_ALLOW_LOCAL_TEST_DB === "true";
  const databaseIdentity = input.databaseIdentity ?? parseGate9BStagingDatabaseIdentity(
    input.env.DATABASE_URL,
    {
      allowLocalTest,
      expectedHost: input.env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST,
      expectedIdentitySource: input.env.REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE,
      expectedRole: input.env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE,
    },
  );
  const deploymentEvidence =
    input.deploymentEvidence ?? gate9BDeploymentEvidenceFromEnv(input.env);
  if (!deploymentEvidence) {
    throw new Gate9BValidationError(
      "MISSING_DEPLOYMENT_EVIDENCE",
      "REZNO_STAGE9_GATE9B_DEPLOYMENT_SHA",
    );
  }
  assertGate9BPostMergeActivationDeploymentEvidence(deploymentEvidence);
  return {
    adminEvidence: input.adminEvidence,
    databaseBindingSha256: gate9BDatabaseBindingSha256(databaseIdentity),
    databaseIdentity,
    deploymentSha: deploymentEvidence.deploymentSha,
    runtimeUrl: GATE9B_STAGING_ORIGIN,
  };
}

export function validateGate9BPostMergeActivationDeploymentEvidence(
  evidence: Gate9BDeploymentEvidence,
): Gate9BValidation {
  const findings: Gate9BFinding[] = [];
  if (
    !evidence.trustedVerification
    || evidence.trustedVerification.mode !== "post-merge-default-branch"
  ) {
    findings.push(finding(
      "POST_MERGE_DEPLOYMENT_REQUIRED",
      "deploymentVerificationMode",
      "error",
      "Gate 9B activation requires post-merge default-branch deployment evidence.",
    ));
  }
  return {
    externalInputRequired: false,
    findings,
    ok: findings.length === 0,
    reason: reasonFor(findings),
  };
}

export function assertGate9BPostMergeActivationDeploymentEvidence(
  evidence: Gate9BDeploymentEvidence,
): asserts evidence is Gate9BPostMergeActivationDeploymentEvidence {
  const validation = validateGate9BPostMergeActivationDeploymentEvidence(evidence);
  if (!validation.ok) {
    throw new Gate9BValidationError(
      "POST_MERGE_DEPLOYMENT_REQUIRED",
      "deploymentVerificationMode",
    );
  }
}

export function validateGate9BDeploymentEvidence(
  evidence: Gate9BDeploymentEvidence,
  options: { readonly allowLocalTest?: boolean; readonly now?: Date } = {},
): Gate9BValidation {
  const findings: Gate9BFinding[] = [];
  if (evidence.projectSlug !== GATE9B_STAGING_PROJECT) {
    findings.push(finding(
      evidence.projectSlug === "rezno"
        ? "PRODUCTION_TARGET_FORBIDDEN"
        : "INVALID_STAGING_ORIGIN",
      "projectSlug",
      "error",
      "Gate 9B may deploy only the approved staging Vercel project.",
    ));
  }
  if (evidence.origin !== GATE9B_STAGING_ORIGIN) {
    findings.push(finding(
      "INVALID_STAGING_ORIGIN",
      "origin",
      "error",
      "Gate 9B may target only the approved staging origin.",
    ));
  }
  const shaFields = [
    ["deploymentSha", evidence.deploymentSha],
    ["sourceSha", evidence.sourceSha],
  ] as const;
  for (const [name, value] of shaFields) {
    if (!isFullGitSha(value)) {
      findings.push(finding(
        "DEPLOYMENT_SHA_UNVERIFIED",
        name,
        "error",
        "Gate 9B deployment evidence must contain exact verified Git SHAs.",
      ));
    }
  }
  if (!evidence.trustedVerification) {
    findings.push(finding(
      "DEPLOYMENT_SHA_UNVERIFIED",
      "deploymentVerification",
      "error",
      "Gate 9B deployment SHA must be verified from GitHub, local Git, and Vercel metadata.",
    ));
  } else {
    const trusted = evidence.trustedVerification;
    const trustedShaFields = [
      ["authorizedSha", trusted.authorizedSha],
      ["githubHeadSha", trusted.githubHeadSha],
      ["localHeadSha", trusted.localHeadSha],
      ["vercelSourceSha", trusted.vercelSourceSha],
    ] as const;
    for (const [name, value] of trustedShaFields) {
      if (!isFullGitSha(value)) {
        findings.push(finding(
          "DEPLOYMENT_SHA_UNVERIFIED",
          name,
          "error",
          "Gate 9B trusted deployment verification must contain exact Git SHAs.",
        ));
      }
    }
    if (
      trusted.githubDefaultBranchHeadSha !== undefined
      && !isFullGitSha(trusted.githubDefaultBranchHeadSha)
    ) {
      findings.push(finding(
        "DEPLOYMENT_SHA_UNVERIFIED",
        "githubDefaultBranchHeadSha",
        "error",
        "Gate 9B GitHub default-branch verification must contain an exact Git SHA.",
      ));
    }
    const sourceAllowed = options.allowLocalTest
      ? trusted.source === GATE9B_LOCAL_TEST_SOURCE
      : trusted.source === "github-vercel-api";
    if (!sourceAllowed) {
      findings.push(finding(
        "DEPLOYMENT_SHA_UNVERIFIED",
        "deploymentVerificationSource",
        "error",
        "Gate 9B deployment verification source is not trusted for this environment.",
      ));
    }
    if (trusted.vercelProjectSlug !== GATE9B_STAGING_PROJECT) {
      findings.push(finding(
        trusted.vercelProjectSlug === "rezno"
          ? "PRODUCTION_TARGET_FORBIDDEN"
          : "INVALID_STAGING_ORIGIN",
        "vercelProjectSlug",
        "error",
        "Gate 9B Vercel deployment metadata must belong to the staging project.",
      ));
    }
    const mode = trusted.mode;
    if (mode !== "pre-merge-branch" && mode !== "post-merge-default-branch") {
      findings.push(finding(
        "DEPLOYMENT_SHA_UNVERIFIED",
        "deploymentVerificationMode",
        "error",
        "Gate 9B deployment verification must declare pre-merge or post-merge mode.",
      ));
    }
    if (
      trusted.source === "github-vercel-api"
      && (!trusted.vercelSourceRef || !isSafeGitBranchName(trusted.vercelSourceRef))
    ) {
      findings.push(finding(
        "DEPLOYMENT_SHA_UNVERIFIED",
        "vercelSourceRef",
        "error",
        "Gate 9B Vercel deployment metadata must include a safe Git source ref.",
      ));
    }
    if (
      trusted.githubDefaultBranch !== undefined
      && !isSafeGitBranchName(trusted.githubDefaultBranch)
    ) {
      findings.push(finding(
        "DEPLOYMENT_SHA_UNVERIFIED",
        "githubDefaultBranch",
        "error",
        "Gate 9B GitHub repository metadata must include a safe default branch name.",
      ));
    }
    const verifiedAt = parseDate(trusted.verifiedAt);
    const now = options.now ?? new Date();
    if (!verifiedAt || Math.abs(now.getTime() - verifiedAt.getTime()) > 15 * 60 * 1000) {
      findings.push(finding(
        "DEPLOYMENT_EVIDENCE_STALE",
        "deploymentVerificationVerifiedAt",
        "error",
        "Gate 9B deployment verification must be fresh before activation.",
      ));
    }
    const expected = trusted.authorizedSha;
    if (mode === "post-merge-default-branch") {
      if (
        trusted.githubDefaultBranch !== STAGE9_GATE9B_POST_MERGE_BRANCH
        || trusted.vercelSourceRef !== trusted.githubDefaultBranch
        || trusted.githubDefaultBranchHeadSha !== expected
        || trusted.githubHeadSha !== trusted.githubDefaultBranchHeadSha
      ) {
        findings.push(finding(
          "DEPLOYMENT_SHA_MISMATCH",
          "defaultBranchDeploymentBinding",
          "error",
          "Gate 9B post-merge activation requires GitHub default branch, local Git, Vercel source ref, Vercel source SHA, and authorized SHA to match.",
        ));
      }
    } else if (mode === "pre-merge-branch" && trusted.source === "github-vercel-api") {
      if (trusted.vercelSourceRef !== STAGE9_GATE9B_BRANCH) {
        findings.push(finding(
          "DEPLOYMENT_SHA_MISMATCH",
          "prBranchDeploymentBinding",
          "error",
          "Gate 9B pre-merge verification must remain bound to the reviewed PR branch.",
        ));
      }
    }
    if (
      evidence.deploymentSha !== expected
      || evidence.sourceSha !== expected
      || trusted.githubHeadSha !== expected
      || trusted.localHeadSha !== expected
      || trusted.vercelSourceSha !== expected
    ) {
      findings.push(finding(
        "DEPLOYMENT_SHA_MISMATCH",
        "deploymentSha",
        "error",
        "Gate 9B requires local Git, GitHub, Vercel source, and authorized SHA to match exactly.",
      ));
    }
  }
  if (evidence.deploymentSha !== evidence.sourceSha) {
    findings.push(finding(
      "DEPLOYMENT_SHA_MISMATCH",
      "deploymentSha",
      "error",
      "The staging deployment SHA must match the exact reviewed source SHA.",
    ));
  }
  if (evidence.status !== "READY" && evidence.status !== "SUCCESS") {
    findings.push(finding(
      "DEPLOYMENT_NOT_READY",
      "status",
      "error",
      "The staging deployment must be ready before activation evidence is accepted.",
    ));
  }
  return {
    externalInputRequired: findings.some((item) =>
      item.code === "DEPLOYMENT_SHA_UNVERIFIED"
    ),
    findings,
    ok: findings.length === 0,
    reason: reasonFor(findings),
  };
}

export function evaluateGate9BRuntimeSnapshot(
  snapshot: Gate9BRuntimeSnapshot,
): Gate9BValidation {
  const findings: Gate9BFinding[] = [];
  if (!sameSet(snapshot.jobTypes, GATE9B_EXPECTED_JOB_TYPES)) {
    findings.push(finding(
      "RUNTIME_REGISTRY_MISMATCH",
      "jobTypes",
      "error",
      "Gate 9B requires the accepted 23 platform job types.",
    ));
  }
  if (!sameSet(snapshot.scheduleKeys, GATE9B_ALLOWED_STAGING_SCHEDULES)) {
    findings.push(finding(
      "SCHEDULE_REGISTRY_MISMATCH",
      "scheduleKeys",
      "error",
      "Gate 9B requires the accepted 13 platform schedules.",
    ));
  }
  if (
    snapshot.stage6Runtime === "STAGING_ACTIVATED_PRODUCTION_NOT_ACTIVATED"
    && !sameSet(snapshot.enabledScheduleKeys, GATE9B_ALLOWED_STAGING_SCHEDULES)
  ) {
    findings.push(finding(
      "SCHEDULE_REGISTRY_MISMATCH",
      "enabledScheduleKeys",
      "error",
      "Activated staging runtime must enable only the approved staging schedules.",
    ));
  }
  if (
    snapshot.providerTruth.ai !== "DISABLED"
    || snapshot.providerTruth.push !== "NOT_CONFIGURED"
    || snapshot.providerTruth.communications !== "NOT_CONFIGURED"
  ) {
    findings.push(finding(
      "UNSAFE_PROVIDER_CONFIGURED",
      "providerTruth",
      "error",
      "Gate 9B runtime evidence must keep external providers unconfigured.",
    ));
  }
  return {
    externalInputRequired: false,
    findings,
    ok: findings.length === 0,
    reason: reasonFor(findings),
  };
}

export function gate9BOutputContainsSecretLikeValue(value: unknown) {
  return SECRET_LIKE.test(JSON.stringify(value));
}

function providerAllowed(value: string | undefined, allowed: readonly string[]) {
  return value === undefined || value.trim().length === 0 || allowed.includes(value);
}

function isFullGitSha(value: string) {
  return /^[0-9a-f]{40}$/.test(value);
}

function isSafeGitBranchName(value: string) {
  return /^(?!-)(?!.*(?:\.\.|\/\/|@\{|\\))(?!.*(?:^|\/)\.)(?!.*(?:^|\/)\.\.)(?!.*\/$)[A-Za-z0-9._/-]{1,120}$/.test(value);
}

function externalInputRequiredFor(findings: readonly Gate9BFinding[]) {
  return findings.some((item) =>
    item.code === "MISSING_EXTERNAL_INPUT"
    || item.code === "ADMIN_CONTEXT_REQUIRED"
    || item.code === "DEPLOYMENT_SHA_UNVERIFIED"
    || item.code === "UNVERIFIED_DATABASE_IDENTITY"
    || item.code === "UNVERIFIED_RESTORE_POINT"
  );
}

function sameSet(
  left: readonly string[],
  right: readonly string[],
) {
  return left.length === right.length
    && left.every((item) => right.includes(item as never))
    && right.every((item) => left.includes(item));
}

function finding(
  code: Gate9BFindingCode,
  name: string,
  severity: "error" | "warning",
  message: string,
): Gate9BFinding {
  if (SECRET_LIKE.test(message)) {
    return {
      code: "SECRET_VALUE_REDACTION_FAILURE",
      message: "A Gate 9B finding message contained a secret-like value.",
      name,
      severity: "error",
    };
  }
  return { code, message, name, severity };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function reasonFor(findings: readonly Gate9BFinding[]): Gate9BFindingCode | "READY" {
  return findings.find((item) => item.severity === "error")?.code ?? "READY";
}

function dedupeFindings(findings: readonly Gate9BFinding[]) {
  const seen = new Set<string>();
  return findings.filter((item) => {
    const key = `${item.code}:${item.name}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
