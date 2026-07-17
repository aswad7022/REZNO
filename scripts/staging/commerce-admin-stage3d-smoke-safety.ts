export const COMMERCE_ADMIN_STAGE3D_SMOKE_CONFIRMATION =
  "REZNO_COMMERCE_ADMIN_STAGE3D_AUTHENTICATED_STAGING_ONLY";

export function assertCommerceAdminStage3dSmokeSafety(input: {
  authBaseUrl: string;
  baseUrl: string;
  confirmation: string | undefined;
  database: string;
  vercelEnvironment: string | undefined;
}) {
  if (input.confirmation !== COMMERCE_ADMIN_STAGE3D_SMOKE_CONFIRMATION) {
    throw new Error("The exact Stage 3D authenticated-smoke confirmation is required.");
  }
  if (input.database !== "rezno_staging") {
    throw new Error("The Stage 3D smoke requires the exact rezno_staging database.");
  }
  if (input.vercelEnvironment !== "preview") {
    throw new Error("The Stage 3D smoke is restricted to a Vercel preview deployment.");
  }
  let base: URL;
  let auth: URL;
  try {
    base = new URL(input.baseUrl);
    auth = new URL(input.authBaseUrl);
  } catch {
    throw new Error("Valid staging preview and authentication URLs are required.");
  }
  if (base.protocol !== "https:" || !base.hostname.endsWith(".vercel.app")) {
    throw new Error("The Stage 3D smoke target must be an HTTPS Vercel preview.");
  }
  if (base.origin !== auth.origin) {
    throw new Error("The authentication origin must equal the Stage 3D preview origin.");
  }
}
