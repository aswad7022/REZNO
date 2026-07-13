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
  if (!isDevelopment && parsed.protocol !== "https:") {
    throw new Error(
      "EXPO_PUBLIC_REZNO_API_BASE_URL must use HTTPS for a release build.",
    );
  }

  return configured.replace(/\/+$/, "");
}
