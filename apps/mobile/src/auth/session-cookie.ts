import * as SecureStore from "expo-secure-store";

const COOKIE_STORAGE_KEY = "rezno_cookie";

type StoredCookie = { expires?: string | null; value?: string };

export function readMobileSessionCookie() {
  const stored = SecureStore.getItem(COOKIE_STORAGE_KEY);
  if (!stored) return "";
  let parsed: Record<string, StoredCookie>;
  try {
    parsed = JSON.parse(stored) as Record<string, StoredCookie>;
  } catch {
    return "";
  }
  const now = Date.now();
  return Object.entries(parsed)
    .filter(([, value]) => {
      if (!value?.value) return false;
      if (!value.expires) return true;
      const expires = new Date(value.expires).getTime();
      return Number.isFinite(expires) && expires > now;
    })
    .map(([name, value]) => `${name}=${value.value}`)
    .join("; ");
}
