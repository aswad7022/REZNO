import type { MobileTabId } from "../navigation/tabs";

export type MobileLocale = "en" | "ar" | "ckb";

export const DEFAULT_LOCALE: MobileLocale = "ar";

export const SUPPORTED_LOCALES: MobileLocale[] = ["ar", "en", "ckb"];

type MobileLabels = {
  apiBaseUrl: string;
  appTagline: string;
  integrationBoundary: string;
  integrationBoundaryBody: string;
  nativeFoundation: string;
  nativeFoundationBody: string;
  tabs: Record<MobileTabId, string>;
};

export const labels: Record<MobileLocale, MobileLabels> = {
  ar: {
    apiBaseUrl: "رابط واجهة REZNO",
    appTagline: "تطبيق الحجز وإدارة الأعمال",
    integrationBoundary: "حدود التكامل",
    integrationBoundaryBody:
      "هذا الأساس لا يغير مصادقة الويب أو منطق الحجز. تسجيل الدخول الحقيقي مع Better Auth يحتاج موافقة منفصلة.",
    nativeFoundation: "أساس تطبيق موبايل حقيقي",
    nativeFoundationBody:
      "هذه نسخة Expo Native وليست WebView. الشاشات الحالية تحدد هيكل التطبيق والتنقل قبل ربط واجهات REZNO الخلفية.",
    tabs: {
      account: "الحساب",
      bookings: "الحجوزات",
      business: "الأعمال",
      customerHome: "الرئيسية",
      marketplace: "السوق",
      messages: "الرسائل",
    },
  },
  en: {
    apiBaseUrl: "REZNO API URL",
    appTagline: "Booking and business management",
    integrationBoundary: "Integration boundary",
    integrationBoundaryBody:
      "This foundation does not change web authentication or booking logic. Real Better Auth mobile integration needs separate approval.",
    nativeFoundation: "Real native mobile foundation",
    nativeFoundationBody:
      "This is an Expo Native app, not a WebView shell. The current screens define the app structure and navigation before REZNO backend APIs are connected.",
    tabs: {
      account: "Account",
      bookings: "Bookings",
      business: "Business",
      customerHome: "Home",
      marketplace: "Market",
      messages: "Messages",
    },
  },
  ckb: {
    apiBaseUrl: "بەستەری API ـی REZNO",
    appTagline: "حجزکردن و بەڕێوەبردنی کار",
    integrationBoundary: "سنووری پەیوەستکردن",
    integrationBoundaryBody:
      "ئەم بناغەیە دەستکاری چوونەژوورەوەی وێب یان لۆجیکی حجز ناکات. پەیوەستکردنی ڕاستەقینەی Better Auth بۆ مۆبایل پێویستی بە ڕەزامەندی جیاواز هەیە.",
    nativeFoundation: "بناغەی ئەپی مۆبایلی ڕاستەقینە",
    nativeFoundationBody:
      "ئەمە ئەپی Expo Native ـە، نەک WebView. شاشەکانی ئێستا پێکهاتە و گەڕانی ئەپ دیاری دەکەن پێش پەیوەستکردنی API ـەکانی REZNO.",
    tabs: {
      account: "هەژمار",
      bookings: "حجزەکان",
      business: "کارەکان",
      customerHome: "سەرەکی",
      marketplace: "بازاڕ",
      messages: "نامەکان",
    },
  },
};

export function getTextDirection(locale: MobileLocale) {
  return locale === "en" ? "ltr" : "rtl";
}
