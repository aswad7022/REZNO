const protocolPattern = /^[a-z][a-z\d+\-.]*:/i;

export function getSafeInternalPath(
  value: string | null | undefined,
  fallback: string,
): string {
  const path = value?.trim();

  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/\\") ||
    protocolPattern.test(path)
  ) {
    return fallback;
  }

  return path;
}

export function getSignInPath(nextPath: string | null | undefined): string {
  const next = getSafeInternalPath(nextPath, "");
  const query = new URLSearchParams({ mode: "signin" });

  if (next) {
    query.set("next", next);
  }

  return `/register?${query.toString()}`;
}
