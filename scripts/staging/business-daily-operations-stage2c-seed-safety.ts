export const BUSINESS_DAILY_OPERATIONS_STAGE2C_CONFIRMATION_ENV =
  "BUSINESS_DAILY_OPERATIONS_STAGE2C_SEED_CONFIRM";
export const BUSINESS_DAILY_OPERATIONS_STAGE2C_CONFIRMATION_TOKEN =
  "REZNO_BUSINESS_DAILY_OPERATIONS_STAGE2C_STAGING_ONLY";

export class BusinessDailyOperationsStage2cSeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessDailyOperationsStage2cSeedSafetyError";
  }
}

export function validateBusinessDailyOperationsStage2cSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (
    environment[BUSINESS_DAILY_OPERATIONS_STAGE2C_CONFIRMATION_ENV] !==
    BUSINESS_DAILY_OPERATIONS_STAGE2C_CONFIRMATION_TOKEN
  ) {
    throw new BusinessDailyOperationsStage2cSeedSafetyError(
      `Set ${BUSINESS_DAILY_OPERATIONS_STAGE2C_CONFIRMATION_ENV} to the documented staging-only token.`,
    );
  }
  const raw = environment.DATABASE_URL;
  if (!raw) {
    throw new BusinessDailyOperationsStage2cSeedSafetyError("DATABASE_URL is required.");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BusinessDailyOperationsStage2cSeedSafetyError(
      "DATABASE_URL must be a valid PostgreSQL URL.",
    );
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new BusinessDailyOperationsStage2cSeedSafetyError(
      "Only PostgreSQL staging targets are allowed.",
    );
  }
  const target = `${url.hostname}${url.pathname}`.toLowerCase();
  if (/(^|[^a-z])(prod|production|live)([^a-z]|$)/.test(target)) {
    throw new BusinessDailyOperationsStage2cSeedSafetyError(
      "Production-like database targets are forbidden.",
    );
  }
  if (!/(^|[^a-z])(stage|staging)([^a-z]|$)/.test(target)) {
    throw new BusinessDailyOperationsStage2cSeedSafetyError(
      "The database hostname or database name must contain a staging marker.",
    );
  }
  return { databaseUrl: raw };
}
