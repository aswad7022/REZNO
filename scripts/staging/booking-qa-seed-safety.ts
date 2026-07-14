export const BOOKING_QA_CONFIRMATION_ENV = "BOOKING_QA_SEED_CONFIRM";
export const BOOKING_QA_CONFIRMATION_TOKEN =
  "REZNO_BOOKING_QA_STAGING_ONLY";

export class BookingQaSeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingQaSeedSafetyError";
  }
}

export function validateBookingQaSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (
    environment[BOOKING_QA_CONFIRMATION_ENV] !==
    BOOKING_QA_CONFIRMATION_TOKEN
  ) {
    throw new BookingQaSeedSafetyError(
      `Set ${BOOKING_QA_CONFIRMATION_ENV} to the documented staging-only token.`,
    );
  }
  const raw = environment.DATABASE_URL;
  if (!raw) {
    throw new BookingQaSeedSafetyError("DATABASE_URL is required.");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BookingQaSeedSafetyError("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new BookingQaSeedSafetyError("Only PostgreSQL staging targets are allowed.");
  }
  const target = `${url.hostname}${url.pathname}`.toLowerCase();
  if (/(^|[^a-z])(prod|production|live)([^a-z]|$)/.test(target)) {
    throw new BookingQaSeedSafetyError("Production-like database targets are forbidden.");
  }
  if (!/(^|[^a-z])(stage|staging)([^a-z]|$)/.test(target)) {
    throw new BookingQaSeedSafetyError(
      "The database hostname or database name must contain a staging marker.",
    );
  }
  return { databaseUrl: raw };
}
