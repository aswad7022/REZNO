export const COMMERCE_MERCHANT_STORE_STAGE3A_CONFIRMATION_ENV =
  "COMMERCE_MERCHANT_STORE_STAGE3A_SEED_CONFIRM";
export const COMMERCE_MERCHANT_STORE_STAGE3A_CONFIRMATION_TOKEN =
  "REZNO_COMMERCE_MERCHANT_STORE_STAGE3A_STAGING_ONLY";

export class CommerceMerchantStoreStage3aSeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceMerchantStoreStage3aSeedSafetyError";
  }
}

export function validateCommerceMerchantStoreStage3aSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (
    environment[COMMERCE_MERCHANT_STORE_STAGE3A_CONFIRMATION_ENV] !==
    COMMERCE_MERCHANT_STORE_STAGE3A_CONFIRMATION_TOKEN
  ) {
    throw new CommerceMerchantStoreStage3aSeedSafetyError(
      `Set ${COMMERCE_MERCHANT_STORE_STAGE3A_CONFIRMATION_ENV} to the documented staging-only token.`,
    );
  }
  const raw = environment.DATABASE_URL;
  if (!raw) {
    throw new CommerceMerchantStoreStage3aSeedSafetyError("DATABASE_URL is required.");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CommerceMerchantStoreStage3aSeedSafetyError(
      "DATABASE_URL must be a valid PostgreSQL URL.",
    );
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new CommerceMerchantStoreStage3aSeedSafetyError(
      "Only PostgreSQL staging targets are allowed.",
    );
  }
  const target = `${url.hostname}${url.pathname}`.toLowerCase();
  if (/(^|[^a-z])(prod|production|live)([^a-z]|$)/.test(target)) {
    throw new CommerceMerchantStoreStage3aSeedSafetyError(
      "Production-like database targets are forbidden.",
    );
  }
  if (!/(^|[^a-z])(stage|staging)([^a-z]|$)/.test(target)) {
    throw new CommerceMerchantStoreStage3aSeedSafetyError(
      "The database hostname or database name must contain a staging marker.",
    );
  }
  return { databaseUrl: raw };
}
