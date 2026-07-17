export const COMMERCE_ADMIN_STAGE3D_CONFIRMATION_ENV =
  "COMMERCE_ADMIN_STAGE3D_SEED_CONFIRM";
export const COMMERCE_ADMIN_STAGE3D_CONFIRMATION_TOKEN =
  "REZNO_COMMERCE_ADMIN_STAGE3D_STAGING_ONLY";

export class CommerceAdminStage3dSeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceAdminStage3dSeedSafetyError";
  }
}

export function validateCommerceAdminStage3dSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (
    environment[COMMERCE_ADMIN_STAGE3D_CONFIRMATION_ENV] !==
    COMMERCE_ADMIN_STAGE3D_CONFIRMATION_TOKEN
  ) {
    throw new CommerceAdminStage3dSeedSafetyError(
      `Set ${COMMERCE_ADMIN_STAGE3D_CONFIRMATION_ENV} to the documented staging-only token.`,
    );
  }
  const raw = environment.DATABASE_URL;
  if (!raw) throw new CommerceAdminStage3dSeedSafetyError("DATABASE_URL is required.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CommerceAdminStage3dSeedSafetyError("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new CommerceAdminStage3dSeedSafetyError("Only PostgreSQL staging targets are allowed.");
  }
  const target = `${url.hostname}${url.pathname}`.toLowerCase();
  if (/(^|[^a-z])(prod|production|live)([^a-z]|$)/.test(target)) {
    throw new CommerceAdminStage3dSeedSafetyError("Production-like database targets are forbidden.");
  }
  if (!/(^|[^a-z])(stage|staging)([^a-z]|$)/.test(target)) {
    throw new CommerceAdminStage3dSeedSafetyError(
      "The database hostname or database name must contain a staging marker.",
    );
  }
  return { databaseUrl: raw };
}
