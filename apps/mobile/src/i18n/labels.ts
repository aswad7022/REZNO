import type { MobileTabId } from "../navigation/tabs";

export type MobileLocale = "en" | "ar" | "ckb";

export const DEFAULT_LOCALE: MobileLocale = "ar";

export const SUPPORTED_LOCALES: MobileLocale[] = ["ar", "en", "ckb"];

type MobileLabels = {
  apiBaseUrl: string;
  appTagline: string;
  integrationBoundary: string;
  integrationBoundaryBody: string;
  marketplaceEmptyBody: string;
  marketplaceEmptyTitle: string;
  marketplaceErrorTitle: string;
  marketplaceLoading: string;
  marketplaceOpenBusiness: string;
  marketplaceReviews: string;
  marketplaceRetry: string;
  marketplaceServices: string;
  marketplaceStartingFrom: string;
  nativeFoundation: string;
  nativeFoundationBody: string;
  tabs: Record<MobileTabId, string>;
};

export const labels: Record<MobileLocale, MobileLabels> = {
  ar: {
    apiBaseUrl: "رابط واجهة REZNO",
    appTagline: "تطبيق الحجز وإدارة الأعمال",
    integrationBoundary: "تكامل الحساب",
    integrationBoundaryBody:
      "يستخدم تطبيق الموبايل الآن Better Auth نفسه لتسجيل الدخول وإنشاء الحساب، دون تغيير منطق الحجز في الويب.",
    marketplaceEmptyBody:
      "لا توجد أنشطة عامة مطابقة حالياً. جرّب لاحقاً أو غيّر معايير البحث عند توفرها.",
    marketplaceEmptyTitle: "لا توجد نتائج",
    marketplaceErrorTitle: "تعذر تحميل السوق",
    marketplaceLoading: "جاري تحميل بيانات السوق الحقيقية...",
    marketplaceOpenBusiness: "عرض النشاط",
    marketplaceReviews: "تقييم",
    marketplaceRetry: "إعادة المحاولة",
    marketplaceServices: "خدمة",
    marketplaceStartingFrom: "يبدأ من",
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
    integrationBoundary: "Account integration",
    integrationBoundaryBody:
      "The mobile app now uses the existing Better Auth service for sign-in and account creation without changing web booking logic.",
    marketplaceEmptyBody:
      "There are no matching public businesses yet. Try again later or adjust filters when search is available.",
    marketplaceEmptyTitle: "No results yet",
    marketplaceErrorTitle: "Could not load marketplace",
    marketplaceLoading: "Loading real marketplace data...",
    marketplaceOpenBusiness: "View business",
    marketplaceReviews: "reviews",
    marketplaceRetry: "Retry",
    marketplaceServices: "services",
    marketplaceStartingFrom: "From",
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
    integrationBoundary: "پەیوەستکردنی هەژمار",
    integrationBoundaryBody:
      "ئەپەکەی مۆبایل ئێستا Better Auth بەکاردێنێت بۆ چوونەژوورەوە و دروستکردنی هەژمار، بەبێ گۆڕینی لۆجیکی حجز لە وێب.",
    marketplaceEmptyBody:
      "هیچ کارێکی گشتی هاوتا نییە. دواتر هەوڵبدەرەوە یان کاتێک گەڕان بەردەست بوو پاڵێوەکان بگۆڕە.",
    marketplaceEmptyTitle: "هیچ ئەنجامێک نییە",
    marketplaceErrorTitle: "بازاڕ بار نەبوو",
    marketplaceLoading: "داتای ڕاستەقینەی بازاڕ بار دەکرێت...",
    marketplaceOpenBusiness: "کاری پیشان بدە",
    marketplaceReviews: "هەڵسەنگاندن",
    marketplaceRetry: "دووبارە هەوڵبدە",
    marketplaceServices: "خزمەتگوزاری",
    marketplaceStartingFrom: "لە",
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
