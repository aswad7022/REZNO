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

export function isReservedBusinessSlug(slug: string): boolean {
  return reservedBusinessSlugs.has(slug);
}
