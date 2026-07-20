import { isSafePublicImageUrl } from "@/lib/security/public-image-url";

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/u;

export function safeLegacyMediaReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 2_048 || CONTROL_CHARACTERS.test(candidate)) return null;
  if (!isSafePublicImageUrl(candidate)) return null;
  if (candidate.startsWith("/")) return candidate;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  return url.toString();
}

export function legacyMediaOrNull(value: unknown, canonicalHistoryExists: boolean) {
  return canonicalHistoryExists ? null : safeLegacyMediaReference(value);
}
