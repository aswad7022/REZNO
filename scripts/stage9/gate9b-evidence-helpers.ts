import {
  GATE9B_CRITICAL_MIGRATION_HASHES,
  GATE9B_EXPECTED_MIGRATION_COUNT,
  GATE9B_LOCAL_TEST_SOURCE,
  type Gate9BMigrationEvidence,
} from "../../features/stage9/gate9b";

type Queryable = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

const LOCAL_TEST_MIGRATION_MARKER = "accepted-51-51";
const LOCAL_TEST_MIGRATION_MISMATCH_MARKER = "mismatched-50-51";

export function snapshotStage9BEnv(env = process.env): Record<string, string | undefined> {
  return { ...env };
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
