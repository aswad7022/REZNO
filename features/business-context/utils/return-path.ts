export function getSafeBusinessReturnPath(value: string | null | undefined) {
  if (!value || value.startsWith("//")) return "/business";

  if (
    value === "/business" ||
    value.startsWith("/business/") ||
    value.startsWith("/business?")
  ) {
    return value;
  }

  return "/business";
}
