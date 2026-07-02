"use server";

import { cookies } from "next/headers";

import {
  isAppLocale,
  localeCookieName,
  type AppLocale,
} from "@/i18n/config";

export async function setLocale(locale: AppLocale): Promise<void> {
  if (!isAppLocale(locale)) {
    throw new Error("Unsupported locale.");
  }

  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, locale, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
