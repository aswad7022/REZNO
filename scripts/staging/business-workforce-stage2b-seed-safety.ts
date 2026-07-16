export const BUSINESS_WORKFORCE_STAGE2B_CONFIRMATION_ENV =
  "BUSINESS_WORKFORCE_STAGE2B_SEED_CONFIRM";
export const BUSINESS_WORKFORCE_STAGE2B_CONFIRMATION_TOKEN =
  "REZNO_BUSINESS_WORKFORCE_STAGE2B_STAGING_ONLY";

export class BusinessWorkforceStage2bSeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessWorkforceStage2bSeedSafetyError";
  }
}

export function validateBusinessWorkforceStage2bSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (
    environment[BUSINESS_WORKFORCE_STAGE2B_CONFIRMATION_ENV] !==
    BUSINESS_WORKFORCE_STAGE2B_CONFIRMATION_TOKEN
  ) {
    throw new BusinessWorkforceStage2bSeedSafetyError(
      `Set ${BUSINESS_WORKFORCE_STAGE2B_CONFIRMATION_ENV} to the documented staging-only token.`,
    );
  }
  const raw = environment.DATABASE_URL;
  if (!raw) throw new BusinessWorkforceStage2bSeedSafetyError("DATABASE_URL is required.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BusinessWorkforceStage2bSeedSafetyError("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new BusinessWorkforceStage2bSeedSafetyError("Only PostgreSQL staging targets are allowed.");
  }
  const target = `${url.hostname}${url.pathname}`.toLowerCase();
  if (/(^|[^a-z])(prod|production|live)([^a-z]|$)/.test(target)) {
    throw new BusinessWorkforceStage2bSeedSafetyError("Production-like database targets are forbidden.");
  }
  if (!/(^|[^a-z])(stage|staging)([^a-z]|$)/.test(target)) {
    throw new BusinessWorkforceStage2bSeedSafetyError("The database hostname or database name must contain a staging marker.");
  }
  return { databaseUrl: raw };
}
