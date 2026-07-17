export const COMMERCE_PRODUCTS_INVENTORY_STAGE3B_SMOKE_CONFIRMATION =
  "REZNO_COMMERCE_PRODUCTS_INVENTORY_STAGE3B_STAGING_SMOKE_ONLY";

export function assertCommerceProductsInventoryStage3bSmokeSafety(input: {
  authBaseUrl: string;
  baseUrl: string;
  confirmation: string | undefined;
  database: string;
  vercelEnvironment: string | undefined;
}) {
  if (input.confirmation !== COMMERCE_PRODUCTS_INVENTORY_STAGE3B_SMOKE_CONFIRMATION) {
    throw new Error("Stage 3B staging smoke confirmation is missing or invalid.");
  }
  if (input.database !== "rezno_staging") {
    throw new Error("Stage 3B staging smoke requires the exact rezno_staging database.");
  }
  if (input.vercelEnvironment !== "preview") {
    throw new Error("Stage 3B staging smoke may run only against a Vercel preview build.");
  }

  const preview = safeUrl(input.baseUrl, "Stage 3B preview URL");
  if (
    preview.protocol !== "https:" ||
    !/^rezno-staging-[a-z0-9]+-rafidedu\.vercel\.app$/.test(preview.hostname)
  ) {
    throw new Error("Stage 3B staging smoke requires an exact rezno-staging preview URL.");
  }

  const auth = safeUrl(input.authBaseUrl, "Stage 3B auth URL");
  if (auth.protocol !== "https:" || auth.hostname !== "rezno-staging.vercel.app") {
    throw new Error("Stage 3B staging smoke requires the exact staging auth origin.");
  }
}

function safeUrl(value: string, label: string) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} is invalid.`);
  }
}
