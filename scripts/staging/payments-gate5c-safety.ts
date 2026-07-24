import type { PrismaClient } from "@prisma/client";

export const PAYMENTS_GATE5C_CONFIRMATION = "REZNO_PAYMENTS_GATE5C_STAGING_ONLY";

type SafetyClient = Pick<PrismaClient, "$queryRaw">;

export async function assertPaymentsGate5cStaging(
  prisma: SafetyClient,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const expectedMigrations = environment.REZNO_STAGE6_GATE6C_SUCCESSOR === "true"
    ? BigInt(48)
    : BigInt(42);
  if (
    environment.NODE_ENV === "production" ||
    environment.REZNO_ENV !== "staging" ||
    environment.REZNO_PAYMENTS_GATE5C_CONFIRM !== PAYMENTS_GATE5C_CONFIRMATION
  ) {
    throw new Error("Gate 5C fixture requires the exact staging environment and confirmation marker.");
  }
  const [database] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (database?.database !== "rezno_staging" || /prod(?:uction)?|live/i.test(database?.database ?? "")) {
    throw new Error("Gate 5C fixture requires the exact rezno_staging database.");
  }
  const [migrations] = await prisma.$queryRaw<Array<{ applied: bigint; failed: bigint; total: bigint }>>`
    SELECT
      count(*)::bigint AS total,
      count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::bigint AS applied,
      count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::bigint AS failed
    FROM "_prisma_migrations"
  `;
  if (
    migrations?.total !== expectedMigrations ||
    migrations.applied !== expectedMigrations ||
    migrations.failed !== BigInt(0)
  ) {
    throw new Error(
      `Gate 5C fixture requires an exact healthy ${expectedMigrations}/${expectedMigrations} migration state.`,
    );
  }
  return {
    database: "rezno_staging" as const,
    migrations: `${expectedMigrations}/${expectedMigrations}`,
  };
}
