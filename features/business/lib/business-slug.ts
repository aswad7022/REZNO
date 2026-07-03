export const reservedBusinessSlugs = new Set([
  "admin",
  "api",
  "book",
  "business",
  "businesses",
  "customer",
  "login",
  "manifest.webmanifest",
  "marketplace",
  "offline",
  "onboarding",
  "register",
  "settings",
]);

const businessSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidBusinessSlug(slug: string): boolean {
  return (
    slug.length >= 5 &&
    slug.length <= 80 &&
    businessSlugPattern.test(slug)
  );
}

export function isReservedBusinessSlug(slug: string): boolean {
  return reservedBusinessSlugs.has(slug);
}

export function getPublicBusinessPath(
  slug: string | null | undefined,
  fallback = "/marketplace",
): string {
  const normalized = slug?.trim().toLowerCase();
  return normalized && isValidBusinessSlug(normalized)
    ? `/${normalized}`
    : fallback;
}
