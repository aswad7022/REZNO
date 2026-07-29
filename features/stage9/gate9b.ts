import { createHash } from "node:crypto";

import {
  GATE9A_CRITICAL_MIGRATION_HASHES,
  GATE9A_EXPECTED_MIGRATION_COUNT,
} from "@/features/stage9/gate9a";

export const STAGE9_GATE9B_BASE_SHA =
  "032e8fe756d5ffbc67f079a2d53cb47e2f3b782d" as const;

export const STAGE9_GATE9B_BRANCH =
  "feat/stage9-staging-runtime-activation" as const;

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
  { name: "REZNO_STAGE9_GATE9B_RESTORE_POINT_ID", secret: false },
  { name: GATE9B_RUNTIME_URL_VARIABLE, secret: false },
] as const;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const SECRET_LIKE =
  /(?:postgres(?:ql)?:\/\/|password\s*[:=]|authorization\s*[:=]|bearer\s+[a-z0-9._-]+|cookie\s*[:=]|token\s*[:=]|api[_-]?key\s*[:=]|gho_[a-z0-9_]+|ghp_[a-z0-9_]+|vercel_[a-z0-9_]+|sk-[a-z0-9_-]+)/iu;

export type Gate9BFindingCode =
  | "MISSING_EXTERNAL_INPUT"
  | "INVALID_DATABASE_URL"
  | "INVALID_DATABASE_IDENTITY"
  | "INVALID_STAGING_ORIGIN"
  | "INVALID_RUNTIME_URL"
  | "PRODUCTION_TARGET_FORBIDDEN"
  | "UNSAFE_PROVIDER_CONFIGURED"
  | "AI_MUST_REMAIN_DISABLED"
  | "DEPLOYMENT_SHA_MISMATCH"
  | "DEPLOYMENT_NOT_READY"
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

  const runtimeUrl = env.REZNO_PLATFORM_RUNTIME_URL?.trim();
  if (runtimeUrl !== undefined && runtimeUrl !== GATE9B_STAGING_ORIGIN) {
    findings.push(finding(
      "INVALID_RUNTIME_URL",
      "REZNO_PLATFORM_RUNTIME_URL",
      "error",
      "The platform runtime URL must be the approved staging origin.",
    ));
  }

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
    findings,
    ok: findings.every((item) => item.severity !== "error"),
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
  const local = confirmations.allowLocalTest === true && LOOPBACK_HOSTS.has(host);
  if (local) {
    if (sslmode && sslmode !== "disable") {
      throw new Gate9BValidationError("INVALID_DATABASE_IDENTITY", "DATABASE_URL");
    }
  } else {
    if (!host.endsWith(".neon.tech") || host.includes("-pooler.") || sslmode !== "verify-full") {
      throw new Gate9BValidationError("INVALID_DATABASE_IDENTITY", "DATABASE_URL");
    }
    if (!confirmations.expectedHost || confirmations.expectedHost.toLowerCase() !== host) {
      throw new Gate9BValidationError(
        "MISSING_EXTERNAL_INPUT",
        "REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST",
      );
    }
    if (!confirmations.expectedRole || confirmations.expectedRole !== role) {
      throw new Gate9BValidationError(
        "MISSING_EXTERNAL_INPUT",
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

export function validateGate9BDeploymentEvidence(
  evidence: Gate9BDeploymentEvidence,
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
  return { externalInputRequired: false, findings, ok: findings.length === 0 };
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
  return { externalInputRequired: false, findings, ok: findings.length === 0 };
}

export function gate9BOutputContainsSecretLikeValue(value: unknown) {
  return SECRET_LIKE.test(JSON.stringify(value));
}

function providerAllowed(value: string | undefined, allowed: readonly string[]) {
  return value === undefined || value.trim().length === 0 || allowed.includes(value);
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
