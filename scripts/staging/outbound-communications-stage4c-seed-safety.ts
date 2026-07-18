export const OUTBOUND_STAGE4C_FIXTURE = "rezno-qa-outbound-communications-stage4c";

export class OutboundStage4cSafetyError extends Error {}

export function validateOutboundStage4cEnvironment(environment: NodeJS.ProcessEnv) {
  if (environment.REZNO_STAGE4C_QA_CONFIRM !== OUTBOUND_STAGE4C_FIXTURE) {
    throw new OutboundStage4cSafetyError("Gate 4C staging fixture requires the exact confirmation marker.");
  }
  if (environment.NODE_ENV === "production" || environment.REZNO_ENV !== "staging") {
    throw new OutboundStage4cSafetyError("Gate 4C fixture requires an explicit non-production staging runtime.");
  }
  const raw = environment.DATABASE_URL;
  if (!raw) throw new OutboundStage4cSafetyError("DATABASE_URL is required.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OutboundStage4cSafetyError("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new OutboundStage4cSafetyError("Only PostgreSQL staging targets are allowed.");
  }
  const database = url.pathname.replace(/^\//, "").toLowerCase();
  if (database !== "rezno_staging" || /prod(?:uction)?|live/i.test(`${database}:${environment.REZNO_ENV}`)) {
    throw new OutboundStage4cSafetyError("The exact rezno_staging database is required.");
  }
  return { database: "rezno_staging" as const };
}
