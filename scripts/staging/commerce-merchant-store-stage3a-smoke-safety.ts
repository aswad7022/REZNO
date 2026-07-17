export const COMMERCE_STAGE3A_SMOKE_CONFIRMATION =
  "REZNO_COMMERCE_MERCHANT_STORE_STAGE3A_STAGING_SMOKE_ONLY";

export function assertCommerceStage3aSmokeSafety(input: {
  authBaseUrl: string;
  baseUrl: string;
  confirmation: string | undefined;
  database: string;
  vercelEnvironment: string | undefined;
}) {
  if (input.confirmation !== COMMERCE_STAGE3A_SMOKE_CONFIRMATION) {
    throw new Error("Stage 3A staging smoke confirmation is missing or invalid.");
  }
  if (input.database !== "rezno_staging") {
    throw new Error("Stage 3A staging smoke requires the exact rezno_staging database.");
  }
  if (input.vercelEnvironment !== "preview") {
    throw new Error("Stage 3A staging smoke may run only from a Vercel preview build.");
  }

  const preview = safeUrl(input.baseUrl, "Stage 3A preview URL");
  if (
    preview.protocol !== "https:" ||
    !/^rezno-staging-[a-z0-9]+-rafidedu\.vercel\.app$/.test(preview.hostname)
  ) {
    throw new Error("Stage 3A staging smoke requires an exact rezno-staging preview URL.");
  }

  const auth = safeUrl(input.authBaseUrl, "Stage 3A auth URL");
  if (auth.protocol !== "https:" || auth.hostname !== "rezno-staging.vercel.app") {
    throw new Error("Stage 3A staging smoke requires the exact staging auth origin.");
  }
}

function safeUrl(value: string, label: string) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} is invalid.`);
  }
}
