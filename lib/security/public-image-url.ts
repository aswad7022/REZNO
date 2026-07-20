const PRIVATE_HOST_SUFFIXES = [
  ".home",
  ".internal",
  ".lan",
  ".local",
  ".localhost",
] as const;

function normalizedHostname(url: URL) {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

/**
 * Allows stable same-origin media paths and bounded HTTPS legacy locations with
 * a public-looking DNS hostname. Remote legacy locations are always rendered
 * without server-side optimization.
 */
export function isSafePublicImageUrl(value: string) {
  if (!value || value.length > 2048) return false;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return true;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const hostname = normalizedHostname(url);
  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.startsWith("[") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return false;
  }
  return true;
}

export function safePublicImageUrlOrNull(
  value: string | null | undefined,
) {
  return value && isSafePublicImageUrl(value) ? value : null;
}
