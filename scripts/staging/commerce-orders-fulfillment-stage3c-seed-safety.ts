export const COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_ENV =
  "COMMERCE_ORDERS_FULFILLMENT_STAGE3C_SEED_CONFIRM";
export const COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_TOKEN =
  "REZNO_COMMERCE_ORDERS_FULFILLMENT_STAGE3C_STAGING_ONLY";

export class CommerceOrdersFulfillmentStage3cSeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceOrdersFulfillmentStage3cSeedSafetyError";
  }
}

export function validateCommerceOrdersFulfillmentStage3cSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (
    environment[COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_ENV] !==
    COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_TOKEN
  ) {
    throw new CommerceOrdersFulfillmentStage3cSeedSafetyError(
      `Set ${COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_ENV} to the documented staging-only token.`,
    );
  }
  const raw = environment.DATABASE_URL;
  if (!raw) throw new CommerceOrdersFulfillmentStage3cSeedSafetyError("DATABASE_URL is required.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CommerceOrdersFulfillmentStage3cSeedSafetyError("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new CommerceOrdersFulfillmentStage3cSeedSafetyError("Only PostgreSQL staging targets are allowed.");
  }
  const target = `${url.hostname}${url.pathname}`.toLowerCase();
  if (/(^|[^a-z])(prod|production|live)([^a-z]|$)/.test(target)) {
    throw new CommerceOrdersFulfillmentStage3cSeedSafetyError("Production-like database targets are forbidden.");
  }
  if (!/(^|[^a-z])(stage|staging)([^a-z]|$)/.test(target)) {
    throw new CommerceOrdersFulfillmentStage3cSeedSafetyError("The database hostname or database name must contain a staging marker.");
  }
  return { databaseUrl: raw };
}
