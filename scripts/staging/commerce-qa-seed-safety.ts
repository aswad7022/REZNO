export const COMMERCE_QA_CONFIRMATION_ENV = "COMMERCE_QA_SEED_CONFIRM";
export const COMMERCE_QA_CONFIRMATION_TOKEN = "REZNO_QA_COMMERCE_STAGING_ONLY";

const DATABASE_URL_ENV = "DATABASE_URL";
const STAGING_MARKER = /(?:^|[^a-z0-9])(?:staging|stage)(?:[^a-z0-9]|$)/i;
const PRODUCTION_MARKER = /(?:^|[^a-z0-9])(?:production|prod|live)(?:[^a-z0-9]|$)/i;

export class CommerceQaSeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceQaSeedSafetyError";
  }
}

export function validateCommerceQaSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): { databaseUrl: string } {
  const databaseUrl = environment[DATABASE_URL_ENV];
  if (!databaseUrl) {
    throw new CommerceQaSeedSafetyError(
      `STAGING COMMERCE QA SEED BLOCKER: ${DATABASE_URL_ENV} is required.`,
    );
  }

  if (environment[COMMERCE_QA_CONFIRMATION_ENV] !== COMMERCE_QA_CONFIRMATION_TOKEN) {
    throw new CommerceQaSeedSafetyError(
      `STAGING COMMERCE QA SEED BLOCKER: ${COMMERCE_QA_CONFIRMATION_ENV} must exactly equal ${COMMERCE_QA_CONFIRMATION_TOKEN}.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new CommerceQaSeedSafetyError(
      `STAGING COMMERCE QA SEED BLOCKER: ${DATABASE_URL_ENV} must be a valid PostgreSQL URL.`,
    );
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new CommerceQaSeedSafetyError(
      "STAGING COMMERCE QA SEED BLOCKER: only PostgreSQL targets are allowed.",
    );
  }

  const targetFingerprint = buildTargetFingerprint(parsed);
  if (PRODUCTION_MARKER.test(targetFingerprint)) {
    throw new CommerceQaSeedSafetyError(
      "STAGING COMMERCE QA SEED BLOCKER: the database target has a production-like marker.",
    );
  }
  if (!STAGING_MARKER.test(targetFingerprint)) {
    throw new CommerceQaSeedSafetyError(
      "STAGING COMMERCE QA SEED BLOCKER: the database target needs an explicit stage/staging marker.",
    );
  }

  return { databaseUrl };
}

function buildTargetFingerprint(parsed: URL): string {
  const databasePath = safelyDecode(parsed.pathname);

  // Deliberately exclude credentials and every query parameter. Only the
  // actual host or database pathname can prove that this target was provisioned
  // with an explicit staging identity; `?schema=staging` or a similar no-op
  // marker must never make an otherwise neutral target writable.
  return [parsed.hostname, databasePath].join(" ").toLocaleLowerCase();
}

function safelyDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
