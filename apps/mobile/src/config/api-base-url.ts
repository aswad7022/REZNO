const APPROVED_RELEASE_API_ORIGINS = new Set([
  "https://rezno-staging.vercel.app",
]);

export function resolveMobileApiBaseUrl(
  value: unknown,
  isDevelopment: boolean,
) {
  const configured = typeof value === "string" ? value.trim() : "";
  if (!configured) {
    if (isDevelopment) return "http://localhost:3000";
    throw new Error(
      "EXPO_PUBLIC_REZNO_API_BASE_URL is required for a release build.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("EXPO_PUBLIC_REZNO_API_BASE_URL must be a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("EXPO_PUBLIC_REZNO_API_BASE_URL must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      "EXPO_PUBLIC_REZNO_API_BASE_URL must not contain credentials.",
    );
  }
  if (
    parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(
      "EXPO_PUBLIC_REZNO_API_BASE_URL must be an origin without a path, query, or fragment.",
    );
  }
  if (!isDevelopment && parsed.protocol !== "https:") {
    throw new Error(
      "EXPO_PUBLIC_REZNO_API_BASE_URL must use HTTPS for a release build.",
    );
  }
  if (!isDevelopment && parsed.port && parsed.port !== "443") {
    throw new Error(
      "EXPO_PUBLIC_REZNO_API_BASE_URL must use the standard HTTPS port for a release build.",
    );
  }
  if (
    !isDevelopment
    && !APPROVED_RELEASE_API_ORIGINS.has(parsed.origin)
  ) {
    throw new Error(
      "EXPO_PUBLIC_REZNO_API_BASE_URL must use an approved release origin.",
    );
  }

  return parsed.origin;
}
