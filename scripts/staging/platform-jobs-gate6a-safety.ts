import type { PrismaClient } from "@prisma/client";

export const PLATFORM_JOBS_GATE6A_CONFIRMATION = "REZNO_STAGE6_GATE6A_STAGING_ONLY";

type SafetyClient = Pick<PrismaClient, "$queryRaw">;

export async function assertPlatformJobsGate6aStaging(
  prisma: SafetyClient,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (
    environment.NODE_ENV === "production"
    || environment.REZNO_ENV !== "staging"
    || environment.REZNO_STAGE6_GATE6A_CONFIRM !== PLATFORM_JOBS_GATE6A_CONFIRMATION
  ) throw new Error("Gate 6A fixture requires the exact staging environment and confirmation marker.");

  const [connection] = await prisma.$queryRaw<Array<{ database: string; encrypted: boolean; user: string }>>`
    SELECT current_database() AS database,
           current_user AS user,
           COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS encrypted
  `;
  if (connection?.database !== "rezno_staging" || /prod(?:uction)?|live/i.test(connection?.database ?? "")) {
    throw new Error("Gate 6A fixture requires the exact rezno_staging database.");
  }
  if (!connection.encrypted && environment.REZNO_STAGE6_GATE6A_ALLOW_LOCAL_UNENCRYPTED !== "true") {
    throw new Error("Gate 6A staging requires an encrypted PostgreSQL connection.");
  }
  const [migrations] = await prisma.$queryRaw<Array<{ applied: bigint; failed: bigint; rolledBack: bigint; total: bigint }>>`
    SELECT count(*)::bigint AS total,
           count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::bigint AS applied,
           count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::bigint AS failed,
           count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::bigint AS "rolledBack"
    FROM "_prisma_migrations"
  `;
  if (
    migrations?.total !== BigInt(43)
    || migrations.applied !== BigInt(43)
    || migrations.failed !== BigInt(0)
    || migrations.rolledBack !== BigInt(0)
  ) throw new Error("Gate 6A fixture requires an exact healthy 43/43 migration state.");

  return {
    database: "rezno_staging" as const,
    encrypted: connection.encrypted,
    migrations: "43/43" as const,
    role: connection.user,
    rolledBack: 0 as const,
  };
}
