const MANAGED_MEDIA_PATH_PREFIXES = [
  "/media/",
  "/api/media/customer/assets/",
] as const;

export function resolveMobileManagedMediaPaths(value: unknown, apiBaseUrl: string): unknown {
  if (typeof value === "string") {
    if (!MANAGED_MEDIA_PATH_PREFIXES.some((prefix) => value.startsWith(prefix))) return value;
    return new URL(value, trailingSlash(apiBaseUrl)).toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveMobileManagedMediaPaths(item, apiBaseUrl));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    resolveMobileManagedMediaPaths(item, apiBaseUrl),
  ]));
}

function trailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
