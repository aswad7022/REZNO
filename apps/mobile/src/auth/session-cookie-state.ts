import { parseSetCookieHeader } from "better-auth/cookies";

export type StoredMobileCookie = {
  expires?: string | null;
  value?: string;
};

export type StoredMobileCookies = Record<string, StoredMobileCookie>;

export function mergeMobileSessionCookies(
  current: StoredMobileCookies,
  setCookieHeader: string,
  now = Date.now(),
) {
  const next = { ...current };

  for (const [name, cookie] of parseSetCookieHeader(setCookieHeader)) {
    const maxAge = cookie["max-age"];
    const expires = maxAge === undefined
      ? cookie.expires ?? null
      : new Date(now + maxAge * 1_000);

    if (
      (maxAge !== undefined && maxAge <= 0) ||
      (expires && expires.getTime() <= now)
    ) {
      delete next[name];
      continue;
    }

    next[name] = {
      expires: expires?.toISOString() ?? null,
      value: cookie.value,
    };
  }

  return next;
}
