export const BUSINESS_OPERATIONS_STAGE2D_CONFIRMATION_ENV =
  "BUSINESS_OPERATIONS_STAGE2D_CLOSURE_SEED_CONFIRM";
export const BUSINESS_OPERATIONS_STAGE2D_CONFIRMATION_TOKEN =
  "REZNO_BUSINESS_OPERATIONS_STAGE2D_CLOSURE_STAGING_ONLY";

export class BusinessOperationsStage2dSeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessOperationsStage2dSeedSafetyError";
  }
}

export function validateBusinessOperationsStage2dSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (
    environment[BUSINESS_OPERATIONS_STAGE2D_CONFIRMATION_ENV] !==
    BUSINESS_OPERATIONS_STAGE2D_CONFIRMATION_TOKEN
  ) {
    throw new BusinessOperationsStage2dSeedSafetyError(
      `Set ${BUSINESS_OPERATIONS_STAGE2D_CONFIRMATION_ENV} to the documented staging-only token.`,
    );
  }
  const raw = environment.DATABASE_URL;
  if (!raw) {
    throw new BusinessOperationsStage2dSeedSafetyError("DATABASE_URL is required.");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BusinessOperationsStage2dSeedSafetyError(
      "DATABASE_URL must be a valid PostgreSQL URL.",
    );
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new BusinessOperationsStage2dSeedSafetyError(
      "Only PostgreSQL staging targets are allowed.",
    );
  }
  const target = `${url.hostname}${url.pathname}`.toLowerCase();
  if (/(^|[^a-z])(prod|production|live)([^a-z]|$)/.test(target)) {
    throw new BusinessOperationsStage2dSeedSafetyError(
      "Production-like database targets are forbidden.",
    );
  }
  if (!/(^|[^a-z])(stage|staging)([^a-z]|$)/.test(target)) {
    throw new BusinessOperationsStage2dSeedSafetyError(
      "The database hostname or database name must contain a staging marker.",
    );
  }
  return { databaseUrl: raw };
}
