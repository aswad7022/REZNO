export const RESTAURANT_QA_CONFIRMATION_ENV = "RESTAURANT_QA_SEED_CONFIRM";
export const RESTAURANT_QA_CONFIRMATION_TOKEN = "REZNO_RESTAURANT_QA_STAGING_ONLY";

export class RestaurantQaSeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestaurantQaSeedSafetyError";
  }
}

export function validateRestaurantQaSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (environment[RESTAURANT_QA_CONFIRMATION_ENV] !== RESTAURANT_QA_CONFIRMATION_TOKEN) {
    throw new RestaurantQaSeedSafetyError(
      `Set ${RESTAURANT_QA_CONFIRMATION_ENV} to the documented staging-only token.`,
    );
  }
  const raw = environment.DATABASE_URL;
  if (!raw) throw new RestaurantQaSeedSafetyError("DATABASE_URL is required.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RestaurantQaSeedSafetyError("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new RestaurantQaSeedSafetyError("Only PostgreSQL staging targets are allowed.");
  }
  const target = `${url.hostname}${url.pathname}`.toLowerCase();
  if (/(^|[^a-z])(prod|production|live)([^a-z]|$)/.test(target)) {
    throw new RestaurantQaSeedSafetyError("Production-like database targets are forbidden.");
  }
  if (!/(^|[^a-z])(stage|staging)([^a-z]|$)/.test(target)) {
    throw new RestaurantQaSeedSafetyError(
      "The database hostname or database name must contain a staging marker.",
    );
  }
  return { databaseUrl: raw };
}
