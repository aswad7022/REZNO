export const locales = ["ar", "ckb", "en"] as const;
export const defaultLocale = "ar";
export const localeCookieName = "REZNO_LOCALE";

export type AppLocale = (typeof locales)[number];

export function isAppLocale(value: string | undefined): value is AppLocale {
  return locales.some((locale) => locale === value);
}

export function getLocaleDirection(locale: AppLocale): "rtl" | "ltr" {
  return locale === "en" ? "ltr" : "rtl";
}
