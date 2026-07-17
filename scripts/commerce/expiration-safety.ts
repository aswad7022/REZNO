export const COMMERCE_EXPIRATION_CONFIRMATION = "EXPIRE_PENDING_COMMERCE_ORDERS";

export function validateCommerceExpirationEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (environment.COMMERCE_EXPIRATION_CONFIRM !== COMMERCE_EXPIRATION_CONFIRMATION) {
    throw new Error("Pending Order expiration confirmation is missing or invalid.");
  }
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  let target: URL;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (target.protocol !== "postgresql:" && target.protocol !== "postgres:") {
    throw new Error("Pending Order expiration requires a PostgreSQL target.");
  }
  if (decodeURIComponent(target.pathname).replace(/^\//, "") !== "rezno_staging") {
    throw new Error("Pending Order expiration requires the exact rezno_staging database.");
  }
}
