import { getSafeInternalPath } from "@/lib/navigation/safe-redirect";

export function getSafeBusinessReturnPath(value: string | null | undefined) {
  const path = getSafeInternalPath(value, "/business");

  if (
    path === "/business" ||
    path.startsWith("/business/") ||
    path.startsWith("/business?")
  ) {
    return path;
  }

  return "/business";
}
