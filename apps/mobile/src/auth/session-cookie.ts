import * as SecureStore from "expo-secure-store";

import {
  mergeMobileSessionCookies,
  type StoredMobileCookies,
} from "./session-cookie-state";

const COOKIE_STORAGE_KEY = "rezno_cookie";

export function readMobileSessionCookie() {
  const parsed = readStoredCookies();
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

export async function persistMobileSessionCookies(setCookieHeader: string) {
  const next = mergeMobileSessionCookies(
    readStoredCookies(),
    setCookieHeader,
  );
  await SecureStore.setItemAsync(COOKIE_STORAGE_KEY, JSON.stringify(next));
}

function readStoredCookies(): StoredMobileCookies {
  const stored = SecureStore.getItem(COOKIE_STORAGE_KEY);
  if (!stored) return {};

  try {
    return JSON.parse(stored) as StoredMobileCookies;
  } catch {
    return {};
  }
}
