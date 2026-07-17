export const COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_ENV =
  "COMMERCE_PRODUCTS_INVENTORY_STAGE3B_SEED_CONFIRM";
export const COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_TOKEN =
  "REZNO_COMMERCE_PRODUCTS_INVENTORY_STAGE3B_STAGING_ONLY";

export class CommerceProductsInventoryStage3bSeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceProductsInventoryStage3bSeedSafetyError";
  }
}

export function validateCommerceProductsInventoryStage3bSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (
    environment[COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_ENV] !==
    COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_TOKEN
  ) {
    throw new CommerceProductsInventoryStage3bSeedSafetyError(
      `Set ${COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_ENV} to the documented staging-only token.`,
    );
  }
  const raw = environment.DATABASE_URL;
  if (!raw) throw new CommerceProductsInventoryStage3bSeedSafetyError("DATABASE_URL is required.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CommerceProductsInventoryStage3bSeedSafetyError("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new CommerceProductsInventoryStage3bSeedSafetyError("Only PostgreSQL staging targets are allowed.");
  }
  const target = `${url.hostname}${url.pathname}`.toLowerCase();
  if (/(^|[^a-z])(prod|production|live)([^a-z]|$)/.test(target)) {
    throw new CommerceProductsInventoryStage3bSeedSafetyError("Production-like database targets are forbidden.");
  }
  if (!/(^|[^a-z])(stage|staging)([^a-z]|$)/.test(target)) {
    throw new CommerceProductsInventoryStage3bSeedSafetyError("The database hostname or database name must contain a staging marker.");
  }
  return { databaseUrl: raw };
}
