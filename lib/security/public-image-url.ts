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
 * Allows only bounded HTTPS image locations with a public-looking DNS hostname.
 * Next Image performs its own resolved-address checks; this guard additionally
 * prevents credentials, loopback/private hostnames, and literal IP targets from
 * entering Business-managed image fields.
 */
export function isSafePublicImageUrl(value: string) {
  if (!value || value.length > 2048) return false;
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
