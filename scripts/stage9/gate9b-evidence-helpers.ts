import { execFileSync } from "node:child_process";

import {
  GATE9B_CRITICAL_MIGRATION_HASHES,
  GATE9B_EXPECTED_MIGRATION_COUNT,
  GATE9B_LOCAL_TEST_SOURCE,
  GATE9B_REQUIRED_ADMIN_PERMISSIONS,
  GATE9B_STAGING_DATABASE_NAME,
  GATE9B_STAGING_ORIGIN,
  GATE9B_STAGING_PROJECT,
  STAGE9_GATE9B_BRANCH,
  gate9BDatabaseBindingSha256,
  gate9BDeploymentEvidenceFromEnv,
  gate9BRestorePointEvidenceFromEnv,
  type Gate9BAdminEvidence,
  type Gate9BDatabaseIdentity,
  type Gate9BDeploymentEvidence,
  type Gate9BMigrationEvidence,
  type Gate9BRestorePointEvidence,
} from "../../features/stage9/gate9b";

type Queryable = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type AdminQueryable = {
  adminAccess: {
    findUnique(input: {
      where: { id: string };
      select: {
        expiresAt: true;
        permissions: true;
        role: true;
        status: true;
        userId: true;
      };
    }): Promise<{
      expiresAt: Date | null;
      permissions: readonly string[];
      role: "ADMIN" | "SUPER_ADMIN";
      status: string;
      userId: string;
    } | null>;
  };
  person: {
    findUnique(input: {
      where: { id: string };
      select: {
        authUserId: true;
        deletedAt: true;
        isOnboarded: true;
        status: true;
      };
    }): Promise<{
      authUserId: string | null;
      deletedAt: Date | null;
      isOnboarded: boolean;
      status: string;
    } | null>;
  };
  user: {
    findUnique(input: {
      where: { id: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

const LOCAL_TEST_MIGRATION_MARKER = "accepted-51-51";
const LOCAL_TEST_MIGRATION_MISMATCH_MARKER = "mismatched-50-51";
const LOCAL_TEST_ADMIN_MARKER = "verified";
const LOCAL_TEST_DEPLOYMENT_MARKER = "verified";
const NEON_API_BASE_URL = "https://console.neon.tech/api/v2";
const NEON_ID_RE = /^[a-z0-9-]{1,60}$/iu;
const PRODUCTION_MARKER_RE = /(?:^|[-_.\s])(prod|production|live)(?:[-_.\s]|$)/iu;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA_RE = /^[0-9a-f]{40}$/;

export function snapshotStage9BEnv(env = process.env): Record<string, string | undefined> {
  return { ...env };
}

export async function collectStage9BAdminEvidence(
  database: AdminQueryable,
  env: Record<string, string | undefined>,
  now = new Date(),
): Promise<Gate9BAdminEvidence> {
  const userId = env.REZNO_STAGE9_GATE9B_ADMIN_USER_ID?.trim();
  const personId = env.REZNO_STAGE9_GATE9B_ADMIN_PERSON_ID?.trim();
  const adminAccessId = env.REZNO_STAGE9_GATE9B_ADMIN_ACCESS_ID?.trim();
  if (!userId || !personId || !adminAccessId) return { status: "MISSING" };
  if (!UUID_RE.test(personId) || !UUID_RE.test(adminAccessId)) {
    return { status: "INVALID" };
  }

  if (
    env.NODE_ENV === "test"
    && env.REZNO_STAGE9_GATE9B_ALLOW_LOCAL_TEST_DB === "true"
    && env.REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE === GATE9B_LOCAL_TEST_SOURCE
    && env.REZNO_STAGE9_GATE9B_LOCAL_TEST_ADMIN_EVIDENCE === LOCAL_TEST_ADMIN_MARKER
  ) {
    return {
      permissions: GATE9B_REQUIRED_ADMIN_PERMISSIONS,
      status: "VERIFIED",
    };
  }

  try {
    const [user, person, adminAccess] = await Promise.all([
      database.user.findUnique({ where: { id: userId }, select: { id: true } }),
      database.person.findUnique({
        where: { id: personId },
        select: {
          authUserId: true,
          deletedAt: true,
          isOnboarded: true,
          status: true,
        },
      }),
      database.adminAccess.findUnique({
        where: { id: adminAccessId },
        select: {
          expiresAt: true,
          permissions: true,
          role: true,
          status: true,
          userId: true,
        },
      }),
    ]);
    if (
      !user
      || !person
      || !adminAccess
      || person.authUserId !== userId
      || person.deletedAt
      || person.status !== "ACTIVE"
      || !person.isOnboarded
      || adminAccess.userId !== userId
      || adminAccess.status !== "ACTIVE"
      || (adminAccess.expiresAt && adminAccess.expiresAt.getTime() <= now.getTime())
    ) {
      return { status: "INVALID" };
    }
    return {
      permissions: adminAccess.role === "SUPER_ADMIN"
        ? GATE9B_REQUIRED_ADMIN_PERMISSIONS
        : adminAccess.permissions,
      status: "VERIFIED",
    };
  } catch {
    return { status: "INVALID" };
  }
}

export function localStage9BDeploymentEvidenceFromEnv(
  env: Record<string, string | undefined>,
  now = new Date(),
): Gate9BDeploymentEvidence | undefined {
  if (
    env.NODE_ENV !== "test"
    || env.REZNO_STAGE9_GATE9B_ALLOW_LOCAL_TEST_DB !== "true"
    || env.REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE !== GATE9B_LOCAL_TEST_SOURCE
    || env.REZNO_STAGE9_GATE9B_LOCAL_TEST_DEPLOYMENT_EVIDENCE !== LOCAL_TEST_DEPLOYMENT_MARKER
  ) {
    return undefined;
  }
  const deploymentSha = env.REZNO_STAGE9_GATE9B_DEPLOYMENT_SHA?.trim() ?? "";
  const sourceSha = env.REZNO_STAGE9_GATE9B_DEPLOYMENT_SOURCE_SHA?.trim() ?? "";
  const authorizedSha = env.REZNO_STAGE9_GATE9B_AUTHORIZED_SHA?.trim() ?? deploymentSha;
  const githubHeadSha = env.REZNO_STAGE9_GATE9B_GITHUB_HEAD_SHA?.trim() ?? deploymentSha;
  const localHeadSha = env.REZNO_STAGE9_GATE9B_LOCAL_HEAD_SHA?.trim() ?? deploymentSha;
  const vercelSourceSha = env.REZNO_STAGE9_GATE9B_VERCEL_SOURCE_SHA?.trim() ?? deploymentSha;
  if (
    !SHA_RE.test(deploymentSha)
    || !SHA_RE.test(sourceSha)
    || !SHA_RE.test(authorizedSha)
    || !SHA_RE.test(githubHeadSha)
    || !SHA_RE.test(localHeadSha)
    || !SHA_RE.test(vercelSourceSha)
  ) {
    return undefined;
  }
  return {
    deploymentSha,
    origin: env.REZNO_STAGE9_GATE9B_DEPLOYMENT_ORIGIN?.trim()
      ?? "https://rezno-staging.vercel.app",
    projectSlug: env.REZNO_STAGE9_GATE9B_DEPLOYMENT_PROJECT?.trim()
      ?? GATE9B_STAGING_PROJECT,
    sourceSha,
    status: env.REZNO_STAGE9_GATE9B_DEPLOYMENT_STATUS === "SUCCESS"
      ? "SUCCESS"
      : "READY",
    trustedVerification: {
      authorizedSha,
      githubHeadSha,
      localHeadSha,
      source: GATE9B_LOCAL_TEST_SOURCE,
      vercelProjectSlug: env.REZNO_STAGE9_GATE9B_VERCEL_PROJECT?.trim()
        ?? GATE9B_STAGING_PROJECT,
      vercelSourceSha,
      verifiedAt: env.REZNO_STAGE9_GATE9B_DEPLOYMENT_VERIFIED_AT?.trim()
        ?? now.toISOString(),
    },
  };
}

export async function collectStage9BDeploymentEvidence(
  env: Record<string, string | undefined>,
  options: {
    readonly now?: Date;
    readonly repoRoot?: string;
  } = {},
): Promise<Gate9BDeploymentEvidence | undefined> {
  const now = options.now ?? new Date();
  const localEvidence = localStage9BDeploymentEvidenceFromEnv(env, now);
  if (localEvidence) return localEvidence;

  const base = gate9BDeploymentEvidenceFromEnv(env) ?? undefined;
  if (env.REZNO_STAGE9_GATE9B_ENABLE_REMOTE_DEPLOYMENT_VERIFICATION !== "true") {
    return base;
  }

  const authorizedSha = env.REZNO_STAGE9_GATE9B_AUTHORIZED_SHA?.trim();
  const vercelToken = env.VERCEL_TOKEN?.trim();
  const deploymentId = env.REZNO_STAGE9_GATE9B_VERCEL_DEPLOYMENT_ID?.trim();
  if (!authorizedSha || !SHA_RE.test(authorizedSha) || !vercelToken || !deploymentId) {
    return base;
  }

  const localHeadSha = readLocalGitHead(options.repoRoot ?? process.cwd());
  const githubHeadSha = readGitHubBranchHead();
  const vercel = await readVercelDeploymentMetadata({
    deploymentId,
    teamId: env.VERCEL_TEAM_ID?.trim(),
    token: vercelToken,
  });
  if (!localHeadSha || !githubHeadSha || !vercel) return base;

  const deploymentSha = base?.deploymentSha ?? vercel.sourceSha;
  return {
    deploymentSha,
    origin: vercel.origin,
    projectSlug: vercel.projectSlug,
    sourceSha: base?.sourceSha ?? vercel.sourceSha,
    status: vercel.status,
    trustedVerification: {
      authorizedSha,
      githubHeadSha,
      localHeadSha,
      source: "github-vercel-api",
      vercelProjectSlug: vercel.projectSlug,
      vercelSourceSha: vercel.sourceSha,
      verifiedAt: now.toISOString(),
    },
  };
}

export function localStage9BMigrationEvidenceFromEnv(
  env: Record<string, string | undefined>,
): Gate9BMigrationEvidence | undefined {
  if (
    env.NODE_ENV !== "test"
    || env.REZNO_STAGE9_GATE9B_ALLOW_LOCAL_TEST_DB !== "true"
    || env.REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE !== GATE9B_LOCAL_TEST_SOURCE
  ) {
    return undefined;
  }
  if (env.REZNO_STAGE9_GATE9B_LOCAL_TEST_MIGRATION_EVIDENCE === LOCAL_TEST_MIGRATION_MISMATCH_MARKER) {
    return {
      applied: GATE9B_EXPECTED_MIGRATION_COUNT - 1,
      criticalHashes: GATE9B_CRITICAL_MIGRATION_HASHES,
      failed: 1,
      rolledBack: 0,
      schemaDrift: "ABSENT",
      total: GATE9B_EXPECTED_MIGRATION_COUNT,
    };
  }
  if (env.REZNO_STAGE9_GATE9B_LOCAL_TEST_MIGRATION_EVIDENCE !== LOCAL_TEST_MIGRATION_MARKER) {
    return undefined;
  }
  return {
    applied: GATE9B_EXPECTED_MIGRATION_COUNT,
    criticalHashes: GATE9B_CRITICAL_MIGRATION_HASHES,
    failed: 0,
    rolledBack: 0,
    schemaDrift: "ABSENT",
    total: GATE9B_EXPECTED_MIGRATION_COUNT,
  };
}

export async function collectStage9BMigrationEvidence(
  database: Queryable,
  env: Record<string, string | undefined>,
): Promise<Gate9BMigrationEvidence> {
  const localEvidence = localStage9BMigrationEvidenceFromEnv(env);
  if (localEvidence) return localEvidence;

  const migrations = await database.$queryRaw<Array<{
    applied: bigint;
    failed: bigint;
    rolledBack: bigint;
    total: bigint;
  }>>`
    SELECT count(*)::bigint AS total,
           count(*) FILTER (
             WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
           )::bigint AS applied,
           count(*) FILTER (
             WHERE finished_at IS NULL AND rolled_back_at IS NULL
           )::bigint AS failed,
           count(*) FILTER (
             WHERE rolled_back_at IS NOT NULL
           )::bigint AS "rolledBack"
    FROM "_prisma_migrations"
  `;

  return {
    applied: Number(migrations[0]?.applied ?? -1),
    criticalHashes: GATE9B_CRITICAL_MIGRATION_HASHES,
    failed: Number(migrations[0]?.failed ?? -1),
    rolledBack: Number(migrations[0]?.rolledBack ?? -1),
    schemaDrift: schemaDriftStatusFromEnv(env),
    total: Number(migrations[0]?.total ?? -1),
  };
}

export function localStage9BRestorePointEvidence(input: {
  readonly createdAt: Date;
  readonly databaseBindingSha256: string;
  readonly expiresAt: Date;
  readonly verifiedAt: Date;
}) {
  return {
    createdAt: input.createdAt.toISOString(),
    databaseBindingSha256: input.databaseBindingSha256,
    expiresAt: input.expiresAt.toISOString(),
    providerVerified: true,
    restorePointIdPresent: true,
    source: GATE9B_LOCAL_TEST_SOURCE,
    verifiedAt: input.verifiedAt.toISOString(),
  } as const;
}

export async function collectStage9BRestorePointEvidence(
  env: Record<string, string | undefined>,
  databaseIdentity: Gate9BDatabaseIdentity | undefined,
  now = new Date(),
): Promise<Gate9BRestorePointEvidence> {
  const databaseBindingSha256 = databaseIdentity
    ? gate9BDatabaseBindingSha256(databaseIdentity)
    : undefined;
  if (
    env.NODE_ENV === "test"
    && env.REZNO_STAGE9_GATE9B_ALLOW_LOCAL_TEST_DB === "true"
    && env.REZNO_STAGE9_GATE9B_DATABASE_IDENTITY_SOURCE === GATE9B_LOCAL_TEST_SOURCE
    && env.REZNO_STAGE9_GATE9B_RESTORE_POINT_ID?.trim()
    && env.REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFICATION_SOURCE === GATE9B_LOCAL_TEST_SOURCE
    && databaseBindingSha256
  ) {
    return localStage9BRestorePointEvidence({
      createdAt: new Date(now.getTime() - 60_000),
      databaseBindingSha256,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
      verifiedAt: now,
    });
  }

  const base = gate9BRestorePointEvidenceFromEnv(env);
  if (!databaseIdentity || env.REZNO_STAGE9_GATE9B_RESTORE_POINT_VERIFICATION_SOURCE?.trim() !== "neon-api") {
    return base;
  }

  const verified = await readNeonRestorePointEvidence({
    databaseBindingSha256: gate9BDatabaseBindingSha256(databaseIdentity),
    env,
    now,
  });
  return verified ?? base;
}

export function exitCodeForGate9BValidation(input: {
  readonly externalInputRequired: boolean;
  readonly ok: boolean;
}) {
  if (input.ok) return 0;
  return input.externalInputRequired ? 2 : 1;
}

function schemaDriftStatusFromEnv(
  env: Record<string, string | undefined>,
): Gate9BMigrationEvidence["schemaDrift"] {
  const value = env.REZNO_STAGE9_GATE9B_SCHEMA_DRIFT_STATUS?.trim();
  if (value === "ABSENT" || value === "PRESENT" || value === "UNVERIFIED") {
    return value;
  }
  return "UNVERIFIED";
}

function readLocalGitHead(repoRoot: string) {
  try {
    const value = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return SHA_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

function readGitHubBranchHead() {
  try {
    const value = execFileSync("git", [
      "ls-remote",
      "https://github.com/aswad7022/REZNO.git",
      `refs/heads/${STAGE9_GATE9B_BRANCH}`,
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().split(/\s+/)[0] ?? "";
    return SHA_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

async function readVercelDeploymentMetadata(input: {
  readonly deploymentId: string;
  readonly teamId?: string;
  readonly token: string;
}): Promise<{
  readonly origin: string;
  readonly projectSlug: string;
  readonly sourceSha: string;
  readonly status: "READY" | "SUCCESS" | "PENDING" | "FAILED";
} | null> {
  try {
    const url = new URL(`https://api.vercel.com/v13/deployments/${encodeURIComponent(input.deploymentId)}`);
    if (input.teamId) url.searchParams.set("teamId", input.teamId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${input.token}`,
        },
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("application/json")) return null;
      const text = await response.text();
      if (text.length > 64_000) return null;
      const data = JSON.parse(text) as {
        alias?: unknown;
        aliases?: unknown;
        gitSource?: { sha?: unknown };
        meta?: Record<string, unknown>;
        name?: unknown;
        project?: { name?: unknown };
        readyState?: unknown;
        url?: unknown;
      };
      const projectSlug = typeof data.project?.name === "string"
        ? data.project.name
        : typeof data.name === "string"
          ? data.name
          : "";
      const sourceSha = [
        data.gitSource?.sha,
        data.meta?.githubCommitSha,
        data.meta?.githubCommitRefSha,
      ].find((value): value is string => typeof value === "string" && SHA_RE.test(value));
      const aliases = [
        ...(Array.isArray(data.aliases) ? data.aliases : []),
        ...(Array.isArray(data.alias) ? data.alias : []),
        data.url,
      ].filter((value): value is string => typeof value === "string");
      const hasStagingAlias = aliases.some((alias) => {
        const normalized = alias.startsWith("http") ? alias : `https://${alias}`;
        try {
          return new URL(normalized).origin === GATE9B_STAGING_ORIGIN;
        } catch {
          return false;
        }
      });
      const status = data.readyState === "READY"
        ? "READY"
        : data.readyState === "SUCCESS"
          ? "SUCCESS"
          : data.readyState === "ERROR" || data.readyState === "CANCELED"
            ? "FAILED"
            : "PENDING";
      if (!sourceSha || !hasStagingAlias) return null;
      return {
        origin: GATE9B_STAGING_ORIGIN,
        projectSlug,
        sourceSha,
        status,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

async function readNeonRestorePointEvidence(input: {
  readonly databaseBindingSha256: string;
  readonly env: Record<string, string | undefined>;
  readonly now: Date;
}): Promise<Gate9BRestorePointEvidence | null> {
  const restorePointId = input.env.REZNO_STAGE9_GATE9B_RESTORE_POINT_ID?.trim();
  const projectId = input.env.REZNO_STAGE9_GATE9B_NEON_PROJECT_ID?.trim();
  const branchId = input.env.REZNO_STAGE9_GATE9B_NEON_BRANCH_ID?.trim();
  const token =
    input.env.REZNO_STAGE9_GATE9B_NEON_API_KEY?.trim()
    || input.env.NEON_API_KEY?.trim();
  const expectedHost = input.env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST?.trim().toLowerCase();
  if (
    !restorePointId
    || !projectId
    || !branchId
    || !token
    || !expectedHost
    || !NEON_ID_RE.test(restorePointId)
    || !NEON_ID_RE.test(projectId)
    || !NEON_ID_RE.test(branchId)
  ) {
    return null;
  }

  const baseUrl = neonApiBaseUrl(input.env);
  if (!baseUrl) return null;
  const timeoutMs = neonApiTimeoutMs(input.env);
  const [branchData, databaseData, endpointData, snapshotData] = await Promise.all([
    readNeonJson(baseUrl, ["projects", projectId, "branches", branchId], token, timeoutMs),
    readNeonJson(baseUrl, [
      "projects",
      projectId,
      "branches",
      branchId,
      "databases",
      GATE9B_STAGING_DATABASE_NAME,
    ], token, timeoutMs),
    readNeonJson(baseUrl, ["projects", projectId, "branches", branchId, "endpoints"], token, timeoutMs),
    readNeonJson(baseUrl, ["projects", projectId, "snapshots"], token, timeoutMs),
  ]);
  if (!branchData || !databaseData || !endpointData || !snapshotData) return null;

  const branch = firstRecord(branchData, ["branch"]);
  if (!branch || stringField(branch, "id") !== branchId) return null;
  if (containsProductionMarker(
    projectId,
    stringField(branch, "name"),
    stringField(branch, "project_id"),
  )) {
    return null;
  }
  const branchState = stringField(branch, "current_state") ?? stringField(branch, "state");
  if (branchState && !["ready", "idle", "active"].includes(branchState.toLowerCase())) {
    return null;
  }

  const database = firstRecord(databaseData, ["database"]);
  if (!database || stringField(database, "name") !== GATE9B_STAGING_DATABASE_NAME) {
    return null;
  }
  const databaseBranchId = stringField(database, "branch_id") ?? stringField(database, "branchId");
  if (databaseBranchId && databaseBranchId !== branchId) return null;

  if (!endpointHostMatches(endpointData, expectedHost, branchId)) return null;

  const snapshot = snapshotRecords(snapshotData).find((item) =>
    (stringField(item, "id") ?? stringField(item, "snapshot_id") ?? stringField(item, "snapshotId"))
      === restorePointId
  );
  if (!snapshot) return null;
  if (containsProductionMarker(
    stringField(snapshot, "name"),
    stringField(snapshot, "project_id"),
    stringField(snapshot, "projectId"),
  )) {
    return null;
  }
  const snapshotProjectId = stringField(snapshot, "project_id") ?? stringField(snapshot, "projectId");
  if (snapshotProjectId && snapshotProjectId !== projectId) return null;
  const snapshotBranchId =
    stringField(snapshot, "branch_id")
    ?? stringField(snapshot, "branchId")
    ?? stringField(snapshot, "source_branch_id")
    ?? stringField(snapshot, "sourceBranchId");
  if (snapshotBranchId && snapshotBranchId !== branchId) return null;
  const snapshotDatabase =
    stringField(snapshot, "database_name")
    ?? stringField(snapshot, "databaseName")
    ?? stringField(snapshot, "db_name")
    ?? stringField(snapshot, "dbName");
  if (snapshotDatabase && snapshotDatabase !== GATE9B_STAGING_DATABASE_NAME) return null;
  const snapshotStatus =
    stringField(snapshot, "status")
    ?? stringField(snapshot, "state")
    ?? stringField(snapshot, "current_state")
    ?? stringField(snapshot, "currentState");
  if (
    snapshotStatus
    && !["ready", "success", "completed", "available"].includes(snapshotStatus.toLowerCase())
  ) {
    return null;
  }
  const createdAt =
    stringField(snapshot, "created_at")
    ?? stringField(snapshot, "createdAt")
    ?? stringField(snapshot, "timestamp")
    ?? stringField(snapshot, "source_timestamp")
    ?? stringField(snapshot, "sourceTimestamp");
  const expiresAt =
    stringField(snapshot, "expires_at")
    ?? stringField(snapshot, "expiresAt")
    ?? stringField(snapshot, "expire_at")
    ?? stringField(snapshot, "expireAt");
  if (
    !createdAt
    || !expiresAt
    || Number.isNaN(Date.parse(createdAt))
    || Number.isNaN(Date.parse(expiresAt))
  ) {
    return null;
  }

  return {
    createdAt,
    databaseBindingSha256: input.databaseBindingSha256,
    expiresAt,
    providerVerified: true,
    restorePointIdPresent: true,
    source: "neon-api",
    verifiedAt: input.now.toISOString(),
  };
}

function neonApiBaseUrl(env: Record<string, string | undefined>) {
  const raw = env.NODE_ENV === "test"
    ? env.REZNO_STAGE9_GATE9B_NEON_API_BASE_URL?.trim() || NEON_API_BASE_URL
    : NEON_API_BASE_URL;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && !(env.NODE_ENV === "test" && parsed.protocol === "http:")) {
      return null;
    }
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed;
  } catch {
    return null;
  }
}

async function readNeonJson(
  baseUrl: URL,
  pathSegments: readonly string[],
  token: string,
  timeoutMs: number,
): Promise<unknown | null> {
  try {
    const url = new URL(baseUrl.toString());
    const basePath = url.pathname.replace(/\/+$/u, "");
    url.pathname = `${basePath}/${pathSegments.map(encodeURIComponent).join("/")}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        redirect: "error",
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("application/json")) return null;
      const text = await response.text();
      if (text.length > 64_000) return null;
      return JSON.parse(text) as unknown;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

function neonApiTimeoutMs(env: Record<string, string | undefined>) {
  if (env.NODE_ENV !== "test") return 10_000;
  const parsed = Number.parseInt(env.REZNO_STAGE9_GATE9B_NEON_API_TIMEOUT_MS ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 25 && parsed <= 10_000 ? parsed : 10_000;
}

function firstRecord(input: unknown, preferredKeys: readonly string[]) {
  if (isRecord(input)) {
    for (const key of preferredKeys) {
      const value = input[key];
      if (isRecord(value)) return value;
    }
    return input;
  }
  return null;
}

function snapshotRecords(input: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(input)) return [];
  const candidates = [
    input.snapshots,
    input.project_snapshots,
    input.items,
    input.data,
    input.snapshot,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
    if (isRecord(candidate)) return [candidate];
  }
  return [];
}

function endpointHostMatches(input: unknown, expectedHost: string, branchId: string) {
  if (!isRecord(input)) return false;
  const endpoints = Array.isArray(input.endpoints)
    ? input.endpoints.filter(isRecord)
    : isRecord(input.endpoint)
      ? [input.endpoint]
      : [];
  return endpoints.some((endpoint) => {
    const host =
      stringField(endpoint, "host")
      ?? stringField(endpoint, "hostname")
      ?? stringField(endpoint, "proxy_host")
      ?? stringField(endpoint, "proxyHost");
    if (!host || host.toLowerCase() !== expectedHost || containsProductionMarker(host)) {
      return false;
    }
    const endpointBranchId = stringField(endpoint, "branch_id") ?? stringField(endpoint, "branchId");
    if (endpointBranchId && endpointBranchId !== branchId) return false;
    const state =
      stringField(endpoint, "current_state")
      ?? stringField(endpoint, "currentState")
      ?? stringField(endpoint, "state");
    if (state && !["ready", "idle", "active"].includes(state.toLowerCase())) return false;
    return true;
  });
}

function containsProductionMarker(...values: readonly (string | undefined)[]) {
  return values.some((value) => value !== undefined && PRODUCTION_MARKER_RE.test(value));
}

function stringField(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" ? value.trim() : undefined;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
