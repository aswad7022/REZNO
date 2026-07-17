function vercelDeploymentOrigin(value: string | undefined) {
  const hostname = value?.trim();
  if (!hostname) return undefined;
  try {
    const url = new URL(hostname.includes("://") ? hostname : `https://${hostname}`);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".vercel.app") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function buildAuthTrustedOrigins(
  environment: Readonly<Record<string, string | undefined>>,
) {
  return [...new Set([
    environment.BETTER_AUTH_URL,
    "rezno://",
    vercelDeploymentOrigin(environment.VERCEL_URL),
    vercelDeploymentOrigin(environment.VERCEL_BRANCH_URL),
    environment.NODE_ENV === "development" ? "http://localhost:3000" : undefined,
    environment.NODE_ENV === "development" ? "exp://" : undefined,
    environment.NODE_ENV === "development" ? "exp://**" : undefined,
  ].filter((origin): origin is string => Boolean(origin)))];
}
