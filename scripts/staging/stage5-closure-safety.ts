import type { PrismaClient } from "@prisma/client";

export const STAGE5_CLOSURE_CONFIRMATION = "REZNO_STAGE5_GATE5D_STAGING_ONLY";

type SafetyClient = Pick<PrismaClient, "$queryRaw">;

export async function assertStage5ClosureStaging(
  prisma: SafetyClient,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (
    environment.NODE_ENV === "production" ||
    environment.REZNO_ENV !== "staging" ||
    environment.REZNO_STAGE5_GATE5D_CONFIRM !== STAGE5_CLOSURE_CONFIRMATION
  ) {
    throw new Error(
      "Gate 5D fixture requires the exact staging environment and confirmation marker.",
    );
  }
  const [database] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (
    database?.database !== "rezno_staging" ||
    /prod(?:uction)?|live/i.test(database?.database ?? "")
  ) {
    throw new Error("Gate 5D fixture requires the exact rezno_staging database.");
  }
  const [migrations] = await prisma.$queryRaw<
    Array<{ applied: bigint; failed: bigint; rolledBack: bigint; total: bigint }>
  >`
    SELECT
      count(*)::bigint AS total,
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
  if (
    migrations?.total !== BigInt(42) ||
    migrations.applied !== BigInt(42) ||
    migrations.failed !== BigInt(0) ||
    migrations.rolledBack !== BigInt(0)
  ) {
    throw new Error("Gate 5D fixture requires an exact healthy 42/42 migration state.");
  }
  return {
    database: "rezno_staging" as const,
    migrations: "42/42" as const,
    rolledBack: 0 as const,
  };
}
