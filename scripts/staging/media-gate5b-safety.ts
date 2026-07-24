import type { PrismaClient } from "@prisma/client";

export const MEDIA_GATE5B_CONFIRMATION = "REZNO_MEDIA_GATE5B_STAGING_ONLY";
const STORAGE_MEDIA_GATE6B_CONFIRMATION = "REZNO_STAGE6_GATE6B_STAGING_ONLY";
const COMMUNICATIONS_PAYMENT_GATE6C_CONFIRMATION =
  "REZNO_STAGE6_GATE6C_STAGING_ONLY";
const GATE5B_MIGRATIONS = BigInt(42);
const GATE6B_SUCCESSOR_MIGRATIONS = BigInt(47);
const GATE6C_SUCCESSOR_MIGRATIONS = BigInt(48);

type SafetyClient = Pick<PrismaClient, "$queryRaw">;

export async function assertMediaGate5bStaging(
  prisma: SafetyClient,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (environment.NODE_ENV === "production"
    || environment.REZNO_ENV !== "staging"
    || environment.REZNO_MEDIA_GATE5B_CONFIRM !== MEDIA_GATE5B_CONFIRMATION) {
    throw new Error("Gate 5B fixture requires the exact staging environment and confirmation marker.");
  }
  const [database] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (database?.database !== "rezno_staging" || /prod(?:uction)?|live/i.test(database?.database ?? "")) {
    throw new Error("Gate 5B fixture requires the exact rezno_staging database.");
  }
  const [migrations] = await prisma.$queryRaw<Array<{
    applied: bigint;
    failed: bigint;
    total: bigint;
  }>>`
    SELECT
      count(*)::bigint AS total,
      count(*) FILTER (
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      )::bigint AS applied,
      count(*) FILTER (
        WHERE finished_at IS NULL AND rolled_back_at IS NULL
      )::bigint AS failed
    FROM "_prisma_migrations"
  `;
  const gate6bSuccessor =
    environment.REZNO_STAGE6_GATE6B_CONFIRM === STORAGE_MEDIA_GATE6B_CONFIRMATION;
  const gate6cSuccessor =
    environment.REZNO_STAGE6_GATE6C_SUCCESSOR === "true"
    && environment.REZNO_STAGE6_GATE6C_CONFIRM
      === COMMUNICATIONS_PAYMENT_GATE6C_CONFIRMATION;
  const expectedMigrations = gate6cSuccessor
    ? GATE6C_SUCCESSOR_MIGRATIONS
    : gate6bSuccessor
      ? GATE6B_SUCCESSOR_MIGRATIONS
      : GATE5B_MIGRATIONS;
  if (migrations?.total !== expectedMigrations
    || migrations.applied !== expectedMigrations
    || migrations.failed !== BigInt(0)) {
    throw new Error(
      `Gate 5B fixture requires the exact healthy ${expectedMigrations}/${expectedMigrations} migration state.`,
    );
  }
  return {
    database: "rezno_staging" as const,
    migrations: gate6cSuccessor
      ? "48/48" as const
      : gate6bSuccessor
        ? "47/47" as const
        : "42/42" as const,
  };
}
