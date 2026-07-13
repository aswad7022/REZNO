import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  I18nManager,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from "react-native";

import { fetchMobileMarketplace } from "./src/api/marketplace";
import { commerceApi } from "./src/api/commerce";
import { commerceNotificationOrderDestination } from "./src/commerce/notification-navigation";
import {
  BottomTabBar,
  type MobileAppTabId,
  PrimaryButton,
  ScreenHeader,
  TOUCH_HIT_SLOP,
} from "./src/components/mobile-chrome";
import { ActivityLauncher } from "./src/components/activity-launcher";
import {
  SectionHeader,
  SummaryItem,
} from "./src/components/screen-composition";
import {
  PremiumEntrance,
  PremiumPressable,
} from "./src/components/premium-motion";
import { API_BASE_URL } from "./src/config/api";
import {
  DEFAULT_LOCALE,
  getTextDirection,
  labels,
  type MobileLocale,
} from "./src/i18n/labels";
import { commerceCopy, formatCommerceDate } from "./src/i18n/commerce";
import {
  createMobileShadow,
  createMobileSurface,
  mobileRadii,
} from "./src/design/primitives";
import {
  darkMobileTheme,
  lightMobileTheme,
  type MobileTheme,
} from "./src/theme/tokens";
import { ReznoHomeScreen } from "./src/screens/rezno-home-screen";
import { ReznoAiComingSoonScreen } from "./src/screens/rezno-ai-coming-soon-screen";
import { CommerceMarketScreen } from "./src/screens/commerce-market-screen";
import { ReznoNearbySearchScreen } from "./src/screens/rezno-nearby-search-screen";
import type { MobileMarketplaceBusiness } from "./src/types/marketplace";
import type { CommerceNotification } from "./src/types/commerce";

I18nManager.allowRTL(true);

type MarketplaceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; businesses: MobileMarketplaceBusiness[] }
  | { status: "error"; message: string };

type PremiumBusiness = {
  category: string;
  distance: string;
  id: string;
  name: string;
  price: string;
  rating: string;
  reviewCount: string;
  status: string;
  tag: string;
};

type BookingFlowStepId = "staff" | "datetime" | "payment" | "confirmation";

type BookingMethodId = "rezno-pick" | "manual";

type BookingPaymentMethodId =
  | "apple-pay"
  | "bank-transfer"
  | "card"
  | "pay-on-site";

type BookingServiceOption = {
  duration: string;
  name: string;
  price: string;
  tag: string;
};

type BookingDraft = {
  bookingMethod: BookingMethodId;
  businessName: string;
  dateLabel: string;
  paymentMethod: BookingPaymentMethodId;
  selectedDateId: string;
  selectedTimeId: string;
  serviceName: string;
  servicePrice: string;
  specialistName: string;
  timeLabel: string;
};

type BookingStaffOption = {
  experience: string;
  id: string;
  name: string;
  rating: string;
  role: string;
};

type BookingDateOption = {
  day: string;
  id: string;
  label: string;
  meta: string;
};

type BookingTimeOption = {
  id: string;
  label: string;
  state: "available" | "limited" | "booked";
};

type BookingPaymentOption = {
  id: BookingPaymentMethodId;
  label: string;
  meta: string;
};

type BookingListFilter = "all" | "upcoming" | "completed" | "cancelled";

type BookingManagementPanel = "cancel" | "edit" | null;

type VisualBookingStatus = "cancelled" | "completed" | "confirmed" | "pending";

type VisualBooking = {
  businessName: string;
  category: string;
  date: string;
  id: string;
  paymentMethod: string;
  price: string;
  reference: string;
  serviceName: string;
  staff: string;
  status: VisualBookingStatus;
  statusLabel: string;
  time: string;
};

type MobileThemeMode = "system" | "light" | "dark";

type DevMenuPreferencesModule = {
  getPreferencesAsync(): Promise<{ showFloatingActionButton?: boolean }>;
  setPreferencesAsync(settings: {
    showFloatingActionButton: boolean;
  }): Promise<void>;
};

const DEV_MENU_PREFERENCES = __DEV__
  ? requireOptionalNativeModule<DevMenuPreferencesModule>("DevMenuPreferences")
  : null;

const mobileTypography = {
  kufiBold: "NotoKufiArabic-Bold",
  kufiRegular: "NotoKufiArabic-Regular",
  uiBold: "NotoSansArabicUI-Bold",
  uiMedium: "NotoSansArabicUI-Medium",
  uiRegular: "NotoSansArabicUI-Regular",
  uiSemiBold: "NotoSansArabicUI-SemiBold",
};

/* eslint-disable @typescript-eslint/no-require-imports -- React Native bundles static image assets through require(). */
const mobileIconAssets = {
  categories: {
    salon: require("./assets/icons/categories/salon.png") as ImageSourcePropType,
    spa: require("./assets/icons/categories/spa.png") as ImageSourcePropType,
  },
  common: {
    backArrowLtr: require("./assets/icons/common/back-arrow-ltr.png") as ImageSourcePropType,
    backArrowRtl: require("./assets/icons/common/back-arrow-rtl.png") as ImageSourcePropType,
    calendar: require("./assets/icons/common/calendar.png") as ImageSourcePropType,
    checkSuccess: require("./assets/icons/common/check-success.png") as ImageSourcePropType,
    clock: require("./assets/icons/common/clock.png") as ImageSourcePropType,
    filter: require("./assets/icons/common/filter.png") as ImageSourcePropType,
    heart: require("./assets/icons/common/heart.png") as ImageSourcePropType,
    locationPin: require("./assets/icons/common/location-pin.png") as ImageSourcePropType,
    message: require("./assets/icons/common/message.png") as ImageSourcePropType,
    notificationBell: require("./assets/icons/common/notification-bell.png") as ImageSourcePropType,
    paymentCard: require("./assets/icons/common/payment-card.png") as ImageSourcePropType,
    phoneCall: require("./assets/icons/common/phone-call.png") as ImageSourcePropType,
    search: require("./assets/icons/common/search.png") as ImageSourcePropType,
    share: require("./assets/icons/common/share.png") as ImageSourcePropType,
    starRating: require("./assets/icons/common/star-rating.png") as ImageSourcePropType,
    whatsappGeneric: require("./assets/icons/common/whatsapp-generic.png") as ImageSourcePropType,
  },
};
/* eslint-enable @typescript-eslint/no-require-imports */

const services: BookingServiceOption[] = [
  { duration: "45 دقيقة", name: "قص وتصفيف", price: "25,000 د.ع", tag: "الأكثر طلباً" },
  { duration: "60 دقيقة", name: "عناية بشرة", price: "35,000 د.ع", tag: "عناية فاخرة" },
  { duration: "90 دقيقة", name: "باقة فاخرة", price: "55,000 د.ع", tag: "VIP" },
];

const salonReferenceServices: BookingServiceOption[] = [
  {
    duration: "30 دقيقة",
    name: "قص شعر",
    price: "250 TL",
    tag: "رائج",
  },
  {
    duration: "45 دقيقة",
    name: "حلاقة + دقن",
    price: "350 TL",
    tag: "مميز",
  },
  {
    duration: "20 دقيقة",
    name: "تشذيب بارز",
    price: "150 TL",
    tag: "سريع",
  },
];

const bookingStaffOptions: BookingStaffOption[] = [
  {
    experience: "اختيار تلقائي حسب أقرب وقت متاح",
    id: "any",
    name: "بدون تفضيل",
    rating: "4.9",
    role: "REZNO يختار المختص المناسب",
  },
  {
    experience: "خبرة 6 سنوات · قص وتصفيف",
    id: "ahmad",
    name: "أحمد",
    rating: "4.9",
    role: "خبير شعر",
  },
  {
    experience: "خبرة 5 سنوات · عناية وتلوين",
    id: "mohammad",
    name: "محمد",
    rating: "4.8",
    role: "مختص تجميل",
  },
  {
    experience: "خبرة 7 سنوات · باقات فاخرة",
    id: "yusuf",
    name: "يوسف",
    rating: "4.7",
    role: "خبير خدمات",
  },
  {
    experience: "خبرة 4 سنوات · حجوزات سريعة",
    id: "ali",
    name: "علي",
    rating: "4.9",
    role: "مختص حجوزات",
  },
];

const bookingDateOptions: BookingDateOption[] = [
  { day: "اليوم", id: "today", label: "09", meta: "متاح" },
  { day: "غداً", id: "tomorrow", label: "10", meta: "متاح" },
  { day: "الجمعة", id: "fri", label: "11", meta: "مزدحم" },
  { day: "السبت", id: "sat", label: "12", meta: "متاح" },
  { day: "الأحد", id: "sun", label: "13", meta: "غير متاح" },
];

const bookingTimeOptions: BookingTimeOption[] = [
  { id: "1000", label: "10:00 ص", state: "available" },
  { id: "1030", label: "10:30 ص", state: "available" },
  { id: "1100", label: "11:00 ص", state: "limited" },
  { id: "1200", label: "12:00 م", state: "available" },
  { id: "1330", label: "1:30 م", state: "booked" },
  { id: "1400", label: "2:00 م", state: "available" },
  { id: "1600", label: "4:00 م", state: "available" },
  { id: "1630", label: "4:30 م", state: "available" },
  { id: "1700", label: "5:00 م", state: "limited" },
  { id: "1800", label: "6:00 م", state: "available" },
];

const paymentMethodOptions: BookingPaymentOption[] = [
  {
    id: "apple-pay",
    label: "Apple Pay",
    meta: "( قريباً )",
  },
  {
    id: "card",
    label: "بطاقة الائتمان",
    meta: "( قريباً )",
  },
  {
    id: "bank-transfer",
    label: "تحويل بنكي",
    meta: "تعليمات دفع تجريبية فقط",
  },
  {
    id: "pay-on-site",
    label: "الدفع في الموقع",
    meta: "تأكيد بصري بدون تحصيل",
  },
];

const formatBookingDateLabel = (date: BookingDateOption) =>
  `${date.day} ${date.label}`;

const createInitialBookingDraft = (): BookingDraft => ({
  bookingMethod: "rezno-pick",
  businessName: "Noura Beauty Lounge",
  dateLabel: formatBookingDateLabel(bookingDateOptions[0]),
  paymentMethod: "pay-on-site",
  selectedDateId: bookingDateOptions[0].id,
  selectedTimeId: bookingTimeOptions[7].id,
  serviceName: salonReferenceServices[0].name,
  servicePrice: salonReferenceServices[0].price,
  specialistName: bookingStaffOptions[0].name,
  timeLabel: bookingTimeOptions[7].label,
});

const resolveDraftService = (draft: BookingDraft): BookingServiceOption => {
  const matchingService =
    salonReferenceServices.find(
      (service) =>
        service.name === draft.serviceName &&
        service.price === draft.servicePrice,
    ) ?? services.find((service) => service.name === draft.serviceName);

  return {
    ...(matchingService ?? salonReferenceServices[0]),
    name: draft.serviceName,
    price: draft.servicePrice,
  };
};

const resolveDraftStaff = (draft: BookingDraft) =>
  bookingStaffOptions.find((staff) => staff.name === draft.specialistName) ??
  bookingStaffOptions[0];

const resolveDraftDate = (draft: BookingDraft) =>
  bookingDateOptions.find((date) => date.id === draft.selectedDateId) ??
  bookingDateOptions.find(
    (date) => formatBookingDateLabel(date) === draft.dateLabel,
  ) ??
  bookingDateOptions[0];

const resolveDraftTime = (draft: BookingDraft) =>
  bookingTimeOptions.find((time) => time.id === draft.selectedTimeId) ??
  bookingTimeOptions.find(
    (time) => time.label === draft.timeLabel && time.state !== "booked",
  ) ??
  bookingTimeOptions[7];

const resolveDraftPayment = (draft: BookingDraft) =>
  paymentMethodOptions.find((payment) => payment.id === draft.paymentMethod) ??
  paymentMethodOptions[3];

const onboardingHighlights = [
  { icon: mobileIconAssets.common.starRating, label: "عروض" },
  { icon: mobileIconAssets.common.message, label: "رسائل" },
  { icon: mobileIconAssets.categories.salon, label: "أعمال" },
];

const accountActions = [
  { label: "تسجيل الدخول", tone: "primary" },
  { label: "إنشاء حساب", tone: "secondary" },
];

const bookingFilterTabs: { id: BookingListFilter; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "upcoming", label: "القادمة" },
  { id: "completed", label: "المكتملة" },
  { id: "cancelled", label: "ملغاة" },
];

const visualBookingStatusLabels: Record<VisualBookingStatus, string> = {
  cancelled: "ملغى",
  completed: "مكتمل",
  confirmed: "مؤكد",
  pending: "قيد الانتظار",
};

const SHOW_BOOKINGS_VISUAL_QA_FIXTURES = true;

const bookingVisualQaFixtures: VisualBooking[] = [
  {
    businessName: "Noura Beauty Lounge",
    category: "صالون وتجميل",
    date: "الأحد، 9 يونيو 2025",
    id: "visual-confirmed-booking",
    paymentMethod: "الدفع في الموقع",
    price: "250 TL",
    reference: "REZNO-2406",
    serviceName: "قص شعر",
    staff: "سارة أحمد",
    status: "confirmed",
    statusLabel: "مؤكد",
    time: "4:30 م",
  },
  {
    businessName: "Mat3am Gold",
    category: "مطعم",
    date: "السبت، 7 يونيو 2025",
    id: "mat3am-2407",
    paymentMethod: "حسب العرض البصري",
    price: "400 TL",
    reference: "REZNO-2407",
    serviceName: "طاولة لـ 4 أشخاص",
    staff: "عائلي",
    status: "pending",
    statusLabel: "قيد الانتظار",
    time: "8:30 م",
  },
  {
    businessName: "REZNO Gym",
    category: "رياضة",
    date: "الخميس، 1 مايو 2025",
    id: "rezno-gym-2405",
    paymentMethod: "بطاقة الائتمان / مدى",
    price: "150 TL",
    reference: "REZNO-2405",
    serviceName: "اشتراك شهري",
    staff: "",
    status: "completed",
    statusLabel: "مكتمل",
    time: "10:00 ص",
  },
];

const businessOverviewCards = [
  { label: "حجوزات اليوم", value: "18", detail: "+4 عن أمس" },
  { label: "إيراد اليوم", value: "420K", detail: "د.ع تجريبي" },
  { label: "طلبات معلقة", value: "5", detail: "تحتاج مراجعة" },
  { label: "تقييم العملاء", value: "4.9", detail: "128 تقييم" },
];

const businessQuickActions = [
  { icon: "+", label: "إضافة خدمة" },
  { icon: "👥", label: "إدارة الفريق" },
  { icon: "◷", label: "التقويم" },
  { icon: "⚙", label: "الإعدادات" },
];

const ownerBookingsPreview = [
  {
    customer: "زهراء",
    initials: "ز",
    service: "قص وتصفيف",
    status: "مؤكد",
    time: "4:30 م",
  },
  {
    customer: "علي",
    initials: "ع",
    service: "عناية بشرة",
    status: "ينتظر",
    time: "5:15 م",
  },
  {
    customer: "نور",
    initials: "ن",
    service: "باقة فاخرة",
    status: "قادم",
    time: "6:00 م",
  },
];

const topServicesPreview = [
  { name: "قص وتصفيف", percent: "86%", value: 86 },
  { name: "عناية بشرة", percent: "64%", value: 64 },
  { name: "باقة فاخرة", percent: "48%", value: 48 },
];

const staffAvailabilityPreview = [
  { capacity: "80%", name: "ليان", status: "متاحة" },
  { capacity: "55%", name: "سارة", status: "مشغولة جزئياً" },
  { capacity: "30%", name: "آدم", status: "إدارة الحجوزات" },
];

const weeklyBusinessBars = [42, 58, 37, 72, 64, 88, 76];

const notificationPreviewItems = [
  {
    body: "تم تأكيد حجز قص وتصفيف فاخر اليوم 4:30 م.",
    status: "غير مقروء",
    time: "الآن",
    title: "تم تأكيد الحجز",
    tone: "success",
  },
  {
    body: "موعدك في Noura Beauty Lounge يبدأ بعد ساعتين.",
    status: "تذكير",
    time: "قبل 12 دقيقة",
    title: "تذكير قريب",
    tone: "gold",
  },
  {
    body: "النشاط رد على استفسارك حول تغيير الوقت.",
    status: "رد جديد",
    time: "قبل 28 دقيقة",
    title: "رد من النشاط",
    tone: "message",
  },
  {
    body: "باقة عناية جديدة متاحة للحجز هذا الأسبوع.",
    status: "مقروء",
    time: "أمس",
    title: "تحديث خدمة",
    tone: "muted",
  },
];

const conversationPreviewItems = [
  {
    initials: "N",
    lastMessage: "نقدر نثبت موعدك اليوم 4:30 م.",
    name: "Noura Beauty Lounge",
    status: "نشط",
    time: "2 د",
    unread: "2",
  },
  {
    initials: "M",
    lastMessage: "تم استلام طلب الطاولة بنجاح.",
    name: "Mat3am Gold",
    status: "متابعة",
    time: "24 د",
    unread: "1",
  },
  {
    initials: "S",
    lastMessage: "يمكنك إرسال صورة الحالة قبل الزيارة.",
    name: "Smile Studio Clinic",
    status: "مقروء",
    time: "أمس",
    unread: "",
  },
];

const messageBubblePreview = [
  {
    body: "مرحباً، هل يمكن تثبيت الموعد اليوم؟",
    from: "customer",
    time: "4:02 م",
  },
  {
    body: "نعم، الموعد متاح مع ليان الساعة 4:30 م.",
    from: "business",
    time: "4:04 م",
  },
  {
    body: "رائع، أحتاج تذكير فقط قبل الموعد.",
    from: "customer",
    time: "4:05 م",
  },
];

const quickReplyPreview = [
  "تمام",
  "أحتاج تغيير الوقت",
  "أرسل الموقع",
];

const notificationPreferenceRows = [
  { enabled: true, label: "تذكيرات الحجز" },
  { enabled: true, label: "ردود الأعمال" },
  { enabled: false, label: "العروض" },
  { enabled: true, label: "تحديثات النظام" },
];

const profileOverviewStats = [
  { label: "الحجوزات", value: "12", meta: "عرض تجريبي" },
  { label: "الأعمال", value: "2", meta: "عضويات مرئية" },
  { label: "النقاط", value: "VIP", meta: "حالة مستقبلية" },
];

const languagePreferenceRows = [
  { label: "العربية", locale: "ar", meta: "الواجهة الأساسية" },
  { label: "English", locale: "en", meta: "Available visually" },
  { label: "کوردی", locale: "ckb", meta: "پشتیوانی کراوە" },
] as const;

const themePreferenceRows = [
  { label: "حسب النظام", meta: "يتبع إعدادات الجهاز", mode: "system" },
  { label: "فاتح", meta: "كريمي وهادئ", mode: "light" },
  { label: "داكن", meta: "أسود فاخر مع ذهب", mode: "dark" },
] as const;

const accountNotificationRows = [
  { enabled: true, label: "تذكيرات الحجز", meta: "قبل الموعد بوقت مناسب" },
  { enabled: true, label: "رسائل الأعمال", meta: "ردود وتحديثات الحجز" },
  { enabled: false, label: "العروض", meta: "مرئية فقط ولا تطلب صلاحيات" },
];

const privacySecurityRows = [
  {
    body: "بيانات الحساب والجلسات ستدار لاحقاً عبر تكامل auth معتمد.",
    label: "أمان الجلسة",
  },
  {
    body: "ملكية البيانات والخصوصية واضحة قبل أي مزامنة حقيقية.",
    label: "خصوصية البيانات",
  },
];

const helpFaqRows = [
  "كيف أتابع حجزي؟",
  "كيف أضيف عملي لاحقاً؟",
  "متى تتوفر إعدادات الحساب الحقيقية؟",
];

const accountManagementActions = [
  { label: "إدارة الحساب لاحقاً", tone: "secondary" },
  { label: "مركز المساعدة", tone: "primary" },
];

export default function App() {
  /* eslint-disable @typescript-eslint/no-require-imports -- Expo Font loads local TTF assets through static require(). */
  const [fontsLoaded] = useFonts({
    [mobileTypography.kufiBold]: require("./assets/fonts/NotoKufiArabic-Bold.ttf"),
    [mobileTypography.kufiRegular]: require("./assets/fonts/NotoKufiArabic-Regular.ttf"),
    [mobileTypography.uiBold]: require("./assets/fonts/NotoSansArabicUI-Bold.ttf"),
    [mobileTypography.uiMedium]: require("./assets/fonts/NotoSansArabicUI-Medium.ttf"),
    [mobileTypography.uiRegular]: require("./assets/fonts/NotoSansArabicUI-Regular.ttf"),
    [mobileTypography.uiSemiBold]: require("./assets/fonts/NotoSansArabicUI-SemiBold.ttf"),
  });
  /* eslint-enable @typescript-eslint/no-require-imports */
  const colorScheme = useColorScheme();
  const [locale, setLocale] = useState<MobileLocale>(DEFAULT_LOCALE);
  const [activeTab, setActiveTab] = useState<MobileAppTabId>("customerHome");
  const [activityMenuOpen, setActivityMenuOpen] = useState(false);
  const [selectedBusiness, setSelectedBusiness] =
    useState<PremiumBusiness | null>(null);
  const [bookingFlowStep, setBookingFlowStep] =
    useState<BookingFlowStepId | null>(null);
  const [bookingDraft, setBookingDraft] = useState<BookingDraft>(
    createInitialBookingDraft,
  );
  const [bookingFilter, setBookingFilter] =
    useState<BookingListFilter>("all");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    null,
  );
  const [bookingManagementPanel, setBookingManagementPanel] =
    useState<BookingManagementPanel>(null);
  const [visualCancelledBookingIds, setVisualCancelledBookingIds] = useState<
    string[]
  >([]);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [themeMode, setThemeMode] = useState<MobileThemeMode>("dark");
  const [notificationOrderId, setNotificationOrderId] = useState<string | null>(null);
  const [marketplaceState, setMarketplaceState] = useState<MarketplaceState>({
    status: "idle",
  });
  const effectiveThemeMode =
    themeMode === "system" ? colorScheme ?? "dark" : themeMode;
  const theme =
    effectiveThemeMode === "light" ? lightMobileTheme : darkMobileTheme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const text = labels[locale];
  const isRtl = getTextDirection(locale) === "rtl";

  useEffect(() => {
    if ((!showOnboarding && activeTab !== "bookings") || !DEV_MENU_PREFERENCES) {
      return;
    }

    let cancelled = false;
    let originalFabVisibility: boolean | undefined;
    const hideFabTask = DEV_MENU_PREFERENCES.getPreferencesAsync()
      .then((preferences) => {
        if (cancelled) return;

        originalFabVisibility =
          preferences.showFloatingActionButton ?? true;
        return DEV_MENU_PREFERENCES.setPreferencesAsync({
          showFloatingActionButton: false,
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      void hideFabTask.finally(() => {
        if (originalFabVisibility === undefined) return;

        void DEV_MENU_PREFERENCES.setPreferencesAsync({
          showFloatingActionButton: originalFabVisibility,
        });
      });
    };
  }, [activeTab, showOnboarding]);
  const selectedBookingService = useMemo(
    () => resolveDraftService(bookingDraft),
    [bookingDraft],
  );
  const selectedStaff = useMemo(
    () => resolveDraftStaff(bookingDraft),
    [bookingDraft],
  );
  const selectedDate = useMemo(
    () => resolveDraftDate(bookingDraft),
    [bookingDraft],
  );
  const selectedTime = useMemo(
    () => resolveDraftTime(bookingDraft),
    [bookingDraft],
  );
  const selectedPayment = useMemo(
    () => resolveDraftPayment(bookingDraft),
    [bookingDraft],
  );
  const confirmedVisualBooking = useMemo<VisualBooking>(
    () => ({
      businessName: bookingDraft.businessName,
      category: selectedBusiness?.category ?? "صالون وتجميل",
      date: bookingDraft.dateLabel,
      id: "visual-confirmed-booking",
      paymentMethod: selectedPayment.label,
      price: bookingDraft.servicePrice,
      reference: "REZNO-2406",
      serviceName: bookingDraft.serviceName,
      staff: bookingDraft.specialistName,
      status: "confirmed",
      statusLabel: "مؤكد",
      time: bookingDraft.timeLabel,
    }),
    [
      bookingDraft.businessName,
      bookingDraft.dateLabel,
      bookingDraft.serviceName,
      bookingDraft.servicePrice,
      bookingDraft.specialistName,
      bookingDraft.timeLabel,
      selectedBusiness?.category,
      selectedPayment.label,
    ],
  );
  const managedBookings = useMemo<VisualBooking[]>(
    () => {
      const initialDraft = createInitialBookingDraft();
      const bookingDraftIsUnchanged =
        bookingDraft.businessName === initialDraft.businessName &&
        bookingDraft.dateLabel === initialDraft.dateLabel &&
        bookingDraft.serviceName === initialDraft.serviceName &&
        bookingDraft.servicePrice === initialDraft.servicePrice &&
        bookingDraft.specialistName === initialDraft.specialistName &&
        bookingDraft.timeLabel === initialDraft.timeLabel;
      const visualFixtures =
        __DEV__ && SHOW_BOOKINGS_VISUAL_QA_FIXTURES
          ? bookingVisualQaFixtures
          : [];
      const visualBookingFeed = bookingDraftIsUnchanged && visualFixtures.length
        ? visualFixtures
        : [
        confirmedVisualBooking,
        ...visualFixtures.filter(
          (booking) =>
            booking.id !== confirmedVisualBooking.id &&
            booking.businessName !== confirmedVisualBooking.businessName &&
            !(
              booking.businessName === confirmedVisualBooking.businessName &&
              booking.serviceName === confirmedVisualBooking.serviceName
            ),
        ),
      ];

      return visualBookingFeed.map((booking) => {
        if (!visualCancelledBookingIds.includes(booking.id)) {
          return booking;
        }

        return {
          ...booking,
          status: "cancelled",
          statusLabel: visualBookingStatusLabels.cancelled,
        };
      });
    },
    [
      bookingDraft.businessName,
      bookingDraft.dateLabel,
      bookingDraft.serviceName,
      bookingDraft.servicePrice,
      bookingDraft.specialistName,
      bookingDraft.timeLabel,
      confirmedVisualBooking,
      visualCancelledBookingIds,
    ],
  );
  const selectedManagedBooking = selectedBookingId
    ? managedBookings.find((booking) => booking.id === selectedBookingId) ??
      null
    : null;

  const loadMarketplace = useCallback(() => {
    setMarketplaceState({ status: "loading" });

    fetchMobileMarketplace({ limit: 10 })
      .then((response) => {
        setMarketplaceState({
          status: "loaded",
          businesses: response.data.businesses,
        });
      })
      .catch((error: unknown) => {
        setMarketplaceState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load marketplace.",
        });
      });
  }, []);

  const handleTabPress = (tabId: MobileAppTabId) => {
    if (tabId === "activity") {
      setActivityMenuOpen((current) => !current);
      return;
    }

    setActivityMenuOpen(false);
    setSelectedBusiness(null);
    setBookingFlowStep(null);
    setSelectedBookingId(null);
    setBookingManagementPanel(null);
    setNotificationOrderId(null);

    if (tabId === "serviceDiscovery" && marketplaceState.status === "idle") {
      loadMarketplace();
    }

    setActiveTab(tabId);
  };

  const handleEnterApp = () => {
    if (marketplaceState.status === "idle") {
      loadMarketplace();
    }

    setShowOnboarding(false);
  };

  const updateBookingDraft = (updates: Partial<BookingDraft>) => {
    setBookingDraft((currentDraft) => ({
      ...currentDraft,
      ...updates,
    }));
  };

  const handleStartBookingFlow = (service?: BookingServiceOption) => {
    const selectedService = service ?? selectedBookingService;
    const initialDraft = createInitialBookingDraft();

    setBookingDraft({
      ...initialDraft,
      businessName:
        selectedBusiness?.name || initialDraft.businessName,
      serviceName: selectedService.name,
      servicePrice: selectedService.price,
    });
    setBookingFlowStep("staff");
  };

  const handleBookingMethodSelect = (bookingMethod: BookingMethodId) => {
    updateBookingDraft({
      bookingMethod,
      specialistName:
        bookingMethod === "rezno-pick"
          ? bookingStaffOptions[0].name
          : selectedStaff.id === "any"
            ? bookingStaffOptions[1].name
            : selectedStaff.name,
    });
  };

  const handleStaffSelect = (staff: BookingStaffOption) => {
    updateBookingDraft({
      bookingMethod: "manual",
      specialistName: staff.name,
    });
  };

  const handleSuggestedTimeSelect = (timeLabel: string) => {
    const matchingTime = bookingTimeOptions.find(
      (time) => time.label === timeLabel && time.state !== "booked",
    );

    updateBookingDraft({
      selectedTimeId: matchingTime?.id ?? bookingDraft.selectedTimeId,
      timeLabel,
    });
  };

  const handleDateSelect = (date: BookingDateOption) => {
    updateBookingDraft({
      dateLabel: formatBookingDateLabel(date),
      selectedDateId: date.id,
    });
  };

  const handleTimeSelect = (time: BookingTimeOption) => {
    updateBookingDraft({
      selectedTimeId: time.id,
      timeLabel: time.label,
    });
  };

  const handlePaymentSelect = (payment: BookingPaymentOption) => {
    updateBookingDraft({
      paymentMethod: payment.id,
    });
  };

  const handleBookingBack = () => {
    if (bookingFlowStep === "staff") {
      setBookingFlowStep(null);
      return;
    }

    if (bookingFlowStep === "datetime") {
      setBookingFlowStep("staff");
      return;
    }

    if (bookingFlowStep === "payment") {
      setBookingFlowStep("datetime");
      return;
    }

    if (bookingFlowStep === "confirmation") {
      setBookingFlowStep("payment");
    }
  };

  const handleReturnHome = () => {
    setSelectedBusiness(null);
    setBookingFlowStep(null);
    setSelectedBookingId(null);
    setBookingManagementPanel(null);
    setActiveTab("customerHome");
  };

  const handleViewBookings = () => {
    setSelectedBusiness(null);
    setBookingFlowStep(null);
    setBookingFilter("upcoming");
    setSelectedBookingId(confirmedVisualBooking.id);
    setBookingManagementPanel(null);
    setActiveTab("bookings");
  };

  const handleBackToBookings = () => {
    setSelectedBookingId(null);
    setBookingManagementPanel(null);
  };

  const handleConfirmVisualCancel = (booking: VisualBooking) => {
    setVisualCancelledBookingIds((currentIds) =>
      currentIds.includes(booking.id)
        ? currentIds
        : [...currentIds, booking.id],
    );
    setBookingFilter("cancelled");
    setBookingManagementPanel(null);
  };

  if (!fontsLoaded) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar style={theme.isDark ? "light" : "dark"} />
        <View style={styles.fontLoadingScreen} />
      </SafeAreaView>
    );
  }

  if (showOnboarding) {
    return (
      <SafeAreaView style={[styles.shell, styles.onboardingSafeArea]}>
        <StatusBar style="light" />
        <View style={styles.onboardingScreen}>
          <WelcomeOnboardingCard
            isRtl={isRtl}
            onStart={handleEnterApp}
            styles={styles}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style={theme.isDark ? "light" : "dark"} />
      {!selectedBusiness &&
      activeTab !== "marketplace" &&
      activeTab !== "serviceDiscovery" &&
      activeTab !== "customerHome" &&
      activeTab !== "bookings" &&
      activeTab !== "orders" &&
      activeTab !== "favorites" &&
      activeTab !== "reznoAi" ? (
        <ScreenHeader
          isRtl={isRtl}
          locale={locale}
          onLocaleChange={setLocale}
          styles={styles}
          text={text}
        />
      ) : null}

      {!selectedBusiness && activeTab === "serviceDiscovery" ? (
        <ReznoNearbySearchScreen
          isRtl={isRtl}
          locale={locale}
          onOpenBusiness={(business) => setSelectedBusiness(business)}
          onRetry={loadMarketplace}
          state={marketplaceState}
          theme={theme}
        />
      ) : (
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.content,
            activeTab === "customerHome" &&
              !selectedBusiness &&
              styles.homeContent,
            selectedBusiness && styles.immersiveContent,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.appScroll}
        >
        {selectedBusiness && !bookingFlowStep ? (
          <SalonDetailScreen
            business={selectedBusiness}
            isRtl={isRtl}
            onBack={() => {
              setBookingFlowStep(null);
              setSelectedBusiness(null);
            }}
            onStartBooking={handleStartBookingFlow}
            styles={styles}
          />
        ) : null}

        {selectedBusiness && bookingFlowStep ? (
          <BookingStepScreen
            date={selectedDate}
            draft={bookingDraft}
            isRtl={isRtl}
            onBack={handleBookingBack}
            onBookingMethodSelect={handleBookingMethodSelect}
            onConfirm={() => setBookingFlowStep("confirmation")}
            onDateSelect={handleDateSelect}
            onPaymentSelect={handlePaymentSelect}
            onReturnHome={handleReturnHome}
            onStaffSelect={handleStaffSelect}
            onStepChange={setBookingFlowStep}
            onSuggestedTimeSelect={handleSuggestedTimeSelect}
            onTimeSelect={handleTimeSelect}
            onViewBookings={handleViewBookings}
            payment={selectedPayment}
            service={selectedBookingService}
            staff={selectedStaff}
            step={bookingFlowStep}
            styles={styles}
            time={selectedTime}
          />
        ) : null}

        {!selectedBusiness && activeTab === "customerHome" ? (
          <ReznoHomeScreen
            isRtl={isRtl}
            locale={locale}
            marketplaceState={marketplaceState}
            onOpenBusiness={setSelectedBusiness}
            onOpenMessages={() => handleTabPress("messages")}
            onOpenNotifications={() => handleTabPress("messages")}
            onOpenServiceDiscovery={() => handleTabPress("serviceDiscovery")}
            onRetry={loadMarketplace}
            theme={theme}
          />
        ) : null}

        {!selectedBusiness && activeTab === "marketplace" ? (
          <CommerceMarketScreen
            entryPoint="market"
            isRtl={isRtl}
            locale={locale}
            onOpenAccount={() => handleTabPress("account")}
            theme={theme}
          />
        ) : null}

        {!selectedBusiness && activeTab === "reznoAi" ? (
          <ReznoAiComingSoonScreen
            isRtl={isRtl}
            locale={locale}
            theme={theme}
          />
        ) : null}

        {!selectedBusiness && activeTab === "favorites" ? (
          <CommerceMarketScreen
            entryPoint="favorites"
            isRtl={isRtl}
            locale={locale}
            onOpenAccount={() => handleTabPress("account")}
            theme={theme}
          />
        ) : null}

        {!selectedBusiness && activeTab === "quickBooking" ? (
          <QuickBookingEntryScreen
            isRtl={isRtl}
            onOpenMarketplace={() => handleTabPress("serviceDiscovery")}
            styles={styles}
          />
        ) : null}

        {!selectedBusiness && activeTab === "bookings" ? (
          <MyBookingsScreen
            bookings={managedBookings}
            filter={bookingFilter}
            isRtl={isRtl}
            managementPanel={bookingManagementPanel}
            onBackToList={handleBackToBookings}
            onCancelBooking={(booking) => {
              setSelectedBookingId(booking.id);
              setBookingManagementPanel("cancel");
            }}
            onClosePanel={() => setBookingManagementPanel(null)}
            onConfirmCancel={handleConfirmVisualCancel}
            onEditBooking={(booking) => {
              setSelectedBookingId(booking.id);
              setBookingManagementPanel("edit");
            }}
            onReturnHome={handleReturnHome}
            onSelectFilter={setBookingFilter}
            selectedBooking={selectedManagedBooking}
            styles={styles}
          />
        ) : null}

        {!selectedBusiness && activeTab === "orders" ? (
          <CommerceMarketScreen
            entryPoint="orders"
            initialOrderId={notificationOrderId ?? undefined}
            isRtl={isRtl}
            locale={locale}
            onOpenAccount={() => handleTabPress("account")}
            onExit={notificationOrderId ? () => {
              setNotificationOrderId(null);
              setActiveTab("messages");
            } : undefined}
            theme={theme}
          />
        ) : null}

        {!selectedBusiness && activeTab === "messages" ? (
          <MessagesNotificationsPreviewScreen
            isRtl={isRtl}
            locale={locale}
            onOpenCommerceOrder={(orderId) => {
              setNotificationOrderId(orderId);
              setActiveTab("orders");
            }}
            styles={styles}
          />
        ) : null}

        {!selectedBusiness && activeTab === "business" ? (
          <BusinessOwnerPreviewScreen isRtl={isRtl} styles={styles} />
        ) : null}

        {!selectedBusiness && activeTab === "account" ? (
          <AccountScreen
            isRtl={isRtl}
            locale={locale}
            onLocaleChange={setLocale}
            onThemeModeChange={setThemeMode}
            styles={styles}
            text={text}
            themeMode={themeMode}
          />
        ) : null}
        </ScrollView>
      )}

      <BottomTabBar
        activeTab={activeTab}
        activityMenuOpen={activityMenuOpen}
        locale={locale}
        onTabPress={handleTabPress}
        styles={styles}
      />
      <ActivityLauncher
        isRtl={isRtl}
        locale={locale}
        onClose={() => setActivityMenuOpen(false)}
        onNavigate={handleTabPress}
        theme={theme}
        visible={activityMenuOpen}
      />
    </SafeAreaView>
  );
}

function QuickBookingEntryScreen({
  isRtl,
  onOpenMarketplace,
  styles,
}: {
  isRtl: boolean;
  onOpenMarketplace: () => void;
  styles: MobileStyles;
}) {
  return (
    <>
      <View style={styles.quickBookingHero}>
        <View style={styles.quickBookingGlow} />
        <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
          إضافة حجز سريع
        </Text>
        <Text style={[styles.quickBookingTitle, isRtl && styles.rtlText]}>
          ابدأ من البحث أو اختر خدمة قريبة
        </Text>
        <Text style={[styles.quickBookingBody, isRtl && styles.rtlText]}>
          هذه بوابة مرئية آمنة فقط. لا تنشئ حجزاً ولا تغيّر الدفع أو التأكيد.
        </Text>
        <View style={styles.quickBookingActionRow}>
          <PrimaryButton
            label="فتح السوق"
            onPress={onOpenMarketplace}
            styles={styles}
          />
          <PrimaryButton label="اقتراح سريع" styles={styles} />
        </View>
      </View>
      <SearchDiscoveryPanel
        isRtl={isRtl}
        onOpenMarketplace={onOpenMarketplace}
        styles={styles}
      />
      <SectionHeader
        action="اختيار بصري"
        isRtl={isRtl}
        styles={styles}
        title="خدمات شائعة"
      />
      <View style={styles.serviceGrid}>
        {services.slice(0, 3).map((service, index) => (
          <View
            key={service.name}
            style={[styles.serviceCard, index === 0 && styles.serviceCardActive]}
          >
            <View>
              <Text style={[styles.serviceName, isRtl && styles.rtlText]}>
                {service.name}
              </Text>
              <Text style={[styles.serviceMeta, isRtl && styles.rtlText]}>
                {service.duration} · {service.tag}
              </Text>
            </View>
            <Text style={styles.servicePrice}>{service.price}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

function WelcomeOnboardingCard({
  isRtl,
  onStart,
  styles,
}: {
  isRtl: boolean;
  onStart: () => void;
  styles: MobileStyles;
}) {
  const { height, width } = useWindowDimensions();
  const compact = height < 760 || width < 375;

  return (
    <ScrollView
      bounces={false}
      contentContainerStyle={[
        styles.onboardingCard,
        compact && styles.onboardingCardCompact,
      ]}
      showsVerticalScrollIndicator={false}
      style={styles.onboardingScroll}
    >
      <View pointerEvents="none" style={styles.onboardingPattern}>
        <View style={styles.onboardingAmbientGlow} />
        <View style={[styles.onboardingArc, styles.onboardingArcPrimary]} />
        <View style={[styles.onboardingArc, styles.onboardingArcSecondary]} />
        <View style={[styles.onboardingArc, styles.onboardingArcTertiary]} />
      </View>

      <PremiumEntrance
        delay={70}
        distance={16}
        style={styles.onboardingLogoSection}
      >
        <View style={styles.onboardingLogoGlow} />
        <Text
          accessibilityLabel="REZNO"
          style={[
            styles.onboardingLogoText,
            compact && styles.onboardingLogoTextCompact,
          ]}
        >
          R
        </Text>
        <Text style={styles.onboardingBrand}>REZNO</Text>
        <View style={styles.onboardingSloganRow}>
          <View style={styles.onboardingSloganLine} />
          <Text style={styles.onboardingSlogan}>Book Everything</Text>
          <View style={styles.onboardingSloganLine} />
        </View>
      </PremiumEntrance>

      <View style={styles.onboardingValueSection}>
        <PremiumEntrance
          delay={300}
          distance={10}
          style={styles.onboardingMotionCentered}
        >
          <Text
            numberOfLines={2}
            style={[styles.onboardingBody, isRtl && styles.rtlText]}
          >
            {"احجز أي خدمة في أي وقت\nوبسهولة وثقة"}
          </Text>
        </PremiumEntrance>
        <View style={styles.onboardingHighlights}>
          {onboardingHighlights.map((item, index) => (
            <PremiumEntrance
              delay={390 + index * 70}
              distance={10}
              key={item.label}
              style={styles.onboardingHighlightMotionItem}
            >
              <View style={styles.onboardingHighlight}>
                <Image
                  accessible={false}
                  alt=""
                  resizeMode="contain"
                  source={item.icon}
                  style={styles.onboardingHighlightIcon}
                />
                <Text style={styles.onboardingHighlightLabel}>
                  {item.label}
                </Text>
              </View>
            </PremiumEntrance>
          ))}
        </View>
      </View>

      <PremiumEntrance
        delay={620}
        distance={10}
        style={styles.onboardingActions}
      >
        <PremiumPressable
          accessibilityHint="يفتح تجربة REZNO الرئيسية."
          accessibilityLabel="ابدأ الآن"
          accessibilityRole="button"
          onPress={onStart}
          scaleTo={0.975}
          style={styles.onboardingPrimary}
        >
          <View style={styles.onboardingPrimaryHighlight} />
          <View style={styles.onboardingPrimaryShade} />
          <Text style={styles.onboardingPrimaryText}>ابدأ الآن</Text>
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={mobileIconAssets.common.backArrowRtl}
            style={styles.onboardingPrimaryArrow}
          />
        </PremiumPressable>
        <PremiumPressable
          accessibilityHint="يفتح تجربة تسجيل الدخول الحالية."
          accessibilityLabel="تسجيل الدخول"
          accessibilityRole="button"
          onPress={onStart}
          scaleTo={0.98}
          style={styles.onboardingSecondary}
        >
          <Text style={styles.onboardingSecondaryText}>تسجيل الدخول</Text>
        </PremiumPressable>
        <View style={styles.onboardingFooterBrand}>
          <View style={styles.onboardingFooterLine} />
          <View style={styles.onboardingFooterDot} />
          <Text style={styles.onboardingFooterText}>REZNO</Text>
          <View style={styles.onboardingFooterDot} />
          <View style={styles.onboardingFooterLine} />
        </View>
      </PremiumEntrance>
    </ScrollView>
  );
}

function SearchDiscoveryPanel({
  isRtl,
  onOpenMarketplace,
  styles,
}: {
  isRtl: boolean;
  onOpenMarketplace?: () => void;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.discoveryCard}>
      <SearchBar
        isRtl={isRtl}
        onOpenMarketplace={onOpenMarketplace}
        styles={styles}
      />
    </View>
  );
}

function SearchBar({
  isRtl,
  onOpenMarketplace,
  styles,
}: {
  isRtl: boolean;
  onOpenMarketplace?: () => void;
  styles: MobileStyles;
}) {
  return (
    <Pressable
      accessibilityHint="يفتح تجربة السوق والبحث الحالية بدون تغيير منطق API."
      accessibilityLabel="فتح البحث والسوق"
      accessibilityRole="button"
      accessibilityState={{ disabled: !onOpenMarketplace }}
      disabled={!onOpenMarketplace}
      hitSlop={TOUCH_HIT_SLOP}
      onPress={onOpenMarketplace}
      style={({ pressed }) => [
        styles.searchBar,
        pressed && styles.searchBarPressed,
      ]}
    >
      <Image
        alt=""
        resizeMode="contain"
        source={mobileIconAssets.common.search}
        style={styles.searchIconImage}
      />
      <Text style={[styles.searchPlaceholder, isRtl && styles.rtlText]}>
        ابحث عن مطعم، عيادة، صالون...
      </Text>
      <View style={styles.filterButton}>
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.filter}
          style={styles.filterIconImage}
        />
      </View>
    </Pressable>
  );
}

function BusinessMedia({
  badge,
  initial,
  styles,
}: {
  badge: string;
  initial?: string;
  styles: MobileStyles;
}) {
  return (
    <>
      <View style={styles.businessMediaBackdrop} />
      <View style={styles.businessMediaPhotoShade} />
      <View style={styles.businessMediaGlow} />
      <View style={styles.businessMediaWarmGlow} />
      <View style={styles.businessMediaLightRail}>
        <View style={styles.businessMediaLightLine} />
        <View style={styles.businessMediaLightLineShort} />
        <View style={styles.businessMediaLightLine} />
      </View>
      <View style={styles.businessMediaVenueArchRow}>
        <View style={styles.businessMediaVenueArch} />
        <View style={styles.businessMediaVenueArch} />
        <View style={styles.businessMediaVenueArchSmall} />
      </View>
      <View style={styles.businessMediaPanel} />
      <View style={styles.businessMediaChairBack} />
      <View style={styles.businessMediaChairSeat} />
      <View style={styles.businessMediaAccent} />
      <View style={styles.businessMediaCutout} />
      <View style={styles.businessStatusBadge}>
        <Text style={styles.businessStatusText}>{badge}</Text>
      </View>
      {initial ? (
        <View style={styles.businessInitial}>
          <Text style={styles.businessInitialText}>{initial}</Text>
        </View>
      ) : null}
      <View style={styles.favoriteButton}>
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.heart}
          style={styles.favoriteIconImage}
        />
      </View>
    </>
  );
}

function SalonDetailScreen({
  business,
  isRtl,
  onBack,
  onStartBooking,
  styles,
}: {
  business: PremiumBusiness;
  isRtl: boolean;
  onBack: () => void;
  onStartBooking: (service?: BookingServiceOption) => void;
  styles: MobileStyles;
}) {
  const [selectedServiceName, setSelectedServiceName] = useState(
    salonReferenceServices[0].name,
  );
  const selectedService =
    salonReferenceServices.find(
      (service) => service.name === selectedServiceName,
    ) ?? salonReferenceServices[0];

  return (
    <View style={styles.salonDetailScreen}>
      <View style={styles.salonHero}>
        <View style={styles.salonHeroStage}>
          <SalonHeroMedia styles={styles} />
        </View>
        <View style={styles.salonHeroOverlay} />
        <View style={styles.salonHeroPattern}>
          <View style={styles.salonHeroLineTall} />
          <View style={styles.salonHeroLine} />
          <View style={styles.salonHeroLineTall} />
          <View style={styles.salonHeroLine} />
        </View>
        <View style={[styles.salonFrameCorner, styles.salonFrameCornerTopLeft]} />
        <View style={[styles.salonFrameCorner, styles.salonFrameCornerTopRight]} />
        <Pressable
          accessibilityHint="يعود إلى الشاشة السابقة."
          accessibilityLabel="رجوع"
          accessibilityRole="button"
          hitSlop={TOUCH_HIT_SLOP}
          onPress={onBack}
          style={({ pressed }) => [
            styles.salonBackButton,
            pressed && styles.iconButtonPressed,
          ]}
        >
          <Image
            alt="رجوع"
            resizeMode="contain"
            source={
              isRtl
                ? mobileIconAssets.common.backArrowRtl
                : mobileIconAssets.common.backArrowLtr
            }
            style={styles.salonBackIconImage}
          />
        </Pressable>
        <View style={styles.salonHeroActions}>
          <VisualIconButton
            iconSource={mobileIconAssets.common.heart}
            label="مفضلة"
            styles={styles}
          />
        </View>
      </View>

      <View style={styles.salonInfoCard}>
        <View
          style={[styles.salonFrameCorner, styles.salonFrameCornerCardLeft]}
        />
        <View
          style={[styles.salonFrameCorner, styles.salonFrameCornerCardRight]}
        />
        <View style={styles.salonTitleRow}>
          <View style={styles.salonMetricsBlock}>
            <View style={styles.salonRatingBlock}>
              <Image
                alt=""
                resizeMode="contain"
                source={mobileIconAssets.common.starRating}
                style={styles.salonRatingStarImage}
              />
              <Text style={styles.salonRatingText}>
                {business.rating} ({business.reviewCount.replace(" تقييم", "")})
              </Text>
            </View>
            <View style={styles.salonLikes}>
              <Text style={styles.salonLikesHeart}>❤</Text>
              <Text style={styles.salonLikesText}>128</Text>
            </View>
          </View>

          <View style={styles.salonIdentityBlock}>
            <View style={styles.salonVerifiedRow}>
              <Text style={[styles.salonName, isRtl && styles.rtlText]}>
                صالون فيجن
              </Text>
              <Image
                alt=""
                resizeMode="contain"
                source={mobileIconAssets.common.checkSuccess}
                style={styles.verifiedBadgeImage}
              />
            </View>
            <Text style={[styles.salonMeta, isRtl && styles.rtlText]}>
              اسطنبول · صالون · رجال
            </Text>
          </View>
        </View>

        <View style={styles.salonActionGrid}>
          <VisualActionTile
            iconSource={mobileIconAssets.common.phoneCall}
            label="اتصال"
            styles={styles}
          />
          <VisualActionTile
            iconSource={mobileIconAssets.common.share}
            label="مشاركة"
            styles={styles}
          />
          <VisualActionTile
            iconSource={mobileIconAssets.common.locationPin}
            label="الموقع"
            styles={styles}
          />
          <VisualActionTile
            iconSource={mobileIconAssets.common.whatsappGeneric}
            label="مراسلة"
            styles={styles}
          />
        </View>

        <View style={styles.salonTabs}>
          {["الخدمات", "الصور", "الموظفون", "التقييمات", "نبذة"].map(
            (tab, index) => (
              <Text
                key={tab}
                style={[
                  styles.salonTabText,
                  index === 0 && styles.salonTabTextActive,
                ]}
              >
                {tab}
              </Text>
            ),
          )}
        </View>

        <View style={styles.salonServicesList}>
          {salonReferenceServices.map((service) => {
            const selected = service.name === selectedService.name;

            return (
            <Pressable
              accessibilityHint="يحدد الخدمة محلياً لتظهر في خطوات الحجز التالية."
              accessibilityLabel={`اختيار خدمة ${service.name}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={service.name}
              onPress={() => setSelectedServiceName(service.name)}
              style={({ pressed }) => [
                styles.salonServiceRow,
                selected && styles.salonServiceRowSelected,
                pressed && styles.softButtonPressed,
              ]}
            >
              <View style={styles.salonServiceAdd}>
                <Text style={styles.salonServiceAddText}>
                  {selected ? "✓" : "+"}
                </Text>
              </View>

              <View style={styles.salonServiceCopy}>
                <Text style={[styles.salonServiceName, isRtl && styles.rtlText]}>
                  {service.name}
                </Text>
                <Text style={[styles.salonServiceMeta, isRtl && styles.rtlText]}>
                  {service.duration}
                </Text>
                <Text style={[styles.salonServicePrice, isRtl && styles.rtlText]}>
                  {service.price}
                </Text>
              </View>

              <View style={styles.salonServiceMedia}>
                <BusinessMedia badge={service.tag} styles={styles} />
              </View>
            </Pressable>
            );
          })}
        </View>

        <View style={styles.salonBottomCta}>
          <Pressable
            accessibilityHint="ينتقل إلى تدفق الحجز المرئي الحالي."
            accessibilityLabel="احجز الآن"
            accessibilityRole="button"
            hitSlop={TOUCH_HIT_SLOP}
            onPress={() => onStartBooking(selectedService)}
            style={({ pressed }) => [
              styles.salonReferenceCta,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.salonReferenceCtaText}>احجز الآن</Text>
            <View style={styles.salonReferenceCtaArrowWrap}>
              <Text style={styles.salonReferenceCtaArrow}>→</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.salonBottomSpacer} />
    </View>
  );
}

function SalonHeroMedia({ styles }: { styles: MobileStyles }) {
  return (
    <>
      <View style={styles.salonHeroPhotoBackdrop} />
      <View style={styles.salonHeroPhotoGlow} />
      <View style={styles.salonHeroWallPanel} />
      <View style={[styles.salonHeroGoldStrip, styles.salonHeroGoldStripOne]} />
      <View style={[styles.salonHeroGoldStrip, styles.salonHeroGoldStripTwo]} />
      <View style={styles.salonHeroMirrorRail}>
        <View style={styles.salonHeroMirrorLarge} />
        <View style={styles.salonHeroMirrorLarge} />
        <View style={styles.salonHeroMirrorSmall} />
      </View>
      <View style={styles.salonHeroBottleShelf}>
        <View style={styles.salonHeroBottleTall} />
        <View style={styles.salonHeroBottleSmall} />
        <View style={styles.salonHeroBottleTall} />
        <View style={styles.salonHeroBottleSmall} />
      </View>
      <View style={styles.salonHeroCounter} />
      <View style={styles.salonHeroChairOne} />
      <View style={styles.salonHeroChairTwo} />
      <View style={styles.salonHeroChairThree} />
      <View style={styles.salonHeroLampOne} />
      <View style={styles.salonHeroLampTwo} />
    </>
  );
}

function VisualIconButton({
  iconSource,
  label,
  styles,
  symbol,
}: {
  iconSource?: ImageSourcePropType;
  label: string;
  styles: MobileStyles;
  symbol?: string;
}) {
  return (
    <Pressable
      accessibilityHint="زر بصري فقط ولا ينفذ إجراء حقيقياً."
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      disabled
      hitSlop={TOUCH_HIT_SLOP}
      style={styles.salonRoundButton}
    >
      {iconSource ? (
        <Image
          alt={label}
          resizeMode="contain"
          source={iconSource}
          style={styles.salonRoundButtonIcon}
        />
      ) : (
        <Text style={styles.salonRoundButtonText}>{symbol}</Text>
      )}
    </Pressable>
  );
}

function VisualActionTile({
  iconSource,
  label,
  styles,
  symbol,
}: {
  iconSource?: ImageSourcePropType;
  label: string;
  styles: MobileStyles;
  symbol?: string;
}) {
  return (
    <Pressable
      accessibilityHint="إجراء بصري فقط في هذه المعاينة."
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      disabled
      hitSlop={TOUCH_HIT_SLOP}
      style={styles.salonActionTile}
    >
      {iconSource ? (
        <Image
          alt=""
          resizeMode="contain"
          source={iconSource}
          style={styles.salonActionIconImage}
        />
      ) : (
        <Text style={styles.salonActionIcon}>{symbol}</Text>
      )}
      <Text style={styles.salonActionLabel}>{label}</Text>
    </Pressable>
  );
}

function BookingStepScreen({
  date,
  draft,
  isRtl,
  onBack,
  onBookingMethodSelect,
  onConfirm,
  onDateSelect,
  onPaymentSelect,
  onReturnHome,
  onStaffSelect,
  onStepChange,
  onSuggestedTimeSelect,
  onTimeSelect,
  onViewBookings,
  payment,
  service,
  staff,
  step,
  styles,
  time,
}: {
  date: BookingDateOption;
  draft: BookingDraft;
  isRtl: boolean;
  onBack: () => void;
  onBookingMethodSelect: (method: BookingMethodId) => void;
  onConfirm: () => void;
  onDateSelect: (date: BookingDateOption) => void;
  onPaymentSelect: (payment: BookingPaymentOption) => void;
  onReturnHome: () => void;
  onStaffSelect: (staff: BookingStaffOption) => void;
  onStepChange: (step: BookingFlowStepId) => void;
  onSuggestedTimeSelect: (timeLabel: string) => void;
  onTimeSelect: (time: BookingTimeOption) => void;
  onViewBookings: () => void;
  payment: BookingPaymentOption;
  service: BookingServiceOption;
  staff: BookingStaffOption;
  step: BookingFlowStepId;
  styles: MobileStyles;
  time: BookingTimeOption;
}) {
  if (step === "staff") {
    return (
      <StaffSelectionStep
        draft={draft}
        isRtl={isRtl}
        onBack={onBack}
        onBookingMethodSelect={onBookingMethodSelect}
        onNext={() => onStepChange("datetime")}
        onStaffSelect={onStaffSelect}
        onSuggestedTimeSelect={onSuggestedTimeSelect}
        selectedStaff={staff}
        service={service}
        styles={styles}
      />
    );
  }

  if (step === "datetime") {
    return (
      <DateTimeSelectionStep
        date={date}
        draft={draft}
        isRtl={isRtl}
        onBack={onBack}
        onDateSelect={onDateSelect}
        onNext={() => onStepChange("payment")}
        onTimeSelect={onTimeSelect}
        styles={styles}
        time={time}
      />
    );
  }

  if (step === "payment") {
    return (
      <PaymentMethodStep
        draft={draft}
        isRtl={isRtl}
        onBack={onBack}
        onConfirm={onConfirm}
        onPaymentSelect={onPaymentSelect}
        payment={payment}
        styles={styles}
      />
    );
  }

  return (
    <BookingConfirmationStep
      draft={draft}
      isRtl={isRtl}
      onReturnHome={onReturnHome}
      onViewBookings={onViewBookings}
      payment={payment}
      styles={styles}
    />
  );
}

function BookingFlowHeader({
  isRtl,
  onBack,
  stepLabel,
  styles,
  subtitle,
  title,
}: {
  isRtl: boolean;
  onBack?: () => void;
  stepLabel: string;
  styles: MobileStyles;
  subtitle: string;
  title: string;
}) {
  return (
    <View style={styles.bookingStepHeader}>
      {onBack ? (
        <Pressable
          accessibilityHint="يعود إلى الخطوة السابقة في تدفق الحجز المرئي."
          accessibilityLabel="رجوع"
          accessibilityRole="button"
          hitSlop={TOUCH_HIT_SLOP}
          onPress={onBack}
          style={({ pressed }) => [
            styles.bookingBackButton,
            pressed && styles.iconButtonPressed,
          ]}
        >
          <Image
            alt="رجوع"
            resizeMode="contain"
            source={
              isRtl
                ? mobileIconAssets.common.backArrowRtl
                : mobileIconAssets.common.backArrowLtr
            }
            style={styles.bookingBackIconImage}
          />
        </Pressable>
      ) : null}
      <View style={styles.rowCopy}>
        <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
          {stepLabel}
        </Text>
        <Text style={[styles.screenTitle, isRtl && styles.rtlText]}>
          {title}
        </Text>
        <Text style={[styles.screenDescription, isRtl && styles.rtlText]}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function BookingMiniSummary({
  draft,
  isRtl,
  payment,
  styles,
}: {
  draft: BookingDraft;
  isRtl: boolean;
  payment?: BookingPaymentOption;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.bookingMiniSummary}>
      <SummaryItem
        label="النشاط"
        styles={styles}
        value={draft.businessName}
      />
      <SummaryItem
        label="الخدمة"
        styles={styles}
        value={`${draft.serviceName} · ${draft.servicePrice}`}
      />
      <SummaryItem label="المختص" styles={styles} value={draft.specialistName} />
      <SummaryItem
        label="الموعد"
        styles={styles}
        value={`${draft.dateLabel} · ${draft.timeLabel}`}
      />
      {payment ? (
        <Text style={[styles.securePaymentNote, isRtl && styles.rtlText]}>
          {payment.label} · عملية دفع آمنة ومشفرة بصرياً فقط
        </Text>
      ) : null}
    </View>
  );
}

function StaffSelectionStep({
  draft,
  isRtl,
  onBack,
  onBookingMethodSelect,
  onNext,
  onStaffSelect,
  onSuggestedTimeSelect,
  selectedStaff,
  service,
  styles,
}: {
  draft: BookingDraft;
  isRtl: boolean;
  onBack: () => void;
  onBookingMethodSelect: (method: BookingMethodId) => void;
  onNext: () => void;
  onStaffSelect: (staff: BookingStaffOption) => void;
  onSuggestedTimeSelect: (timeLabel: string) => void;
  selectedStaff: BookingStaffOption;
  service: BookingServiceOption;
  styles: MobileStyles;
}) {
  const [selectedFilter, setSelectedFilter] = useState("الأعلى تقييماً");
  const summaryBusinessName = draft.businessName || "Noura Beauty Lounge";
  const availableSpecialists = bookingStaffOptions.filter(
    (staff) => staff.id !== "any",
  );
  const selectedSpecialist =
    availableSpecialists.find(
      (staff) => staff.name === draft.specialistName,
    ) ??
    availableSpecialists.find((staff) => staff.id === selectedStaff.id) ??
    availableSpecialists[0];
  const bookingMethods = [
    {
      description: "أفضل مختص حسب التقييم والخبرة وأقرب وقت متاح",
      icon: "✧",
      id: "rezno-pick" as const,
      metric: "★ 4.9",
      title: "يختار لي REZNO",
    },
    {
      description: "استعرض المختصين المتاحين واختر الأنسب",
      icon: "♙",
      id: "manual" as const,
      title: "أختار بنفسي",
    },
  ];
  const quickFilters = ["الأعلى تقييماً", "رجال", "نساء", "الأقرب توفر"];
  const timeSlots = ["6:00 م", "4:30 م", "5:00 م", "5:00 م", "4:00 م"];

  return (
    <View style={styles.staffReferenceScreen}>
      <View style={styles.staffReferenceGlow} />
      <View style={styles.staffReferenceFrameTop} />
      <View style={styles.staffReferenceHeader}>
        <Pressable
          accessibilityHint="يعود إلى صفحة الصالون السابقة."
          accessibilityLabel="رجوع"
          accessibilityRole="button"
          hitSlop={TOUCH_HIT_SLOP}
          onPress={onBack}
          style={({ pressed }) => [
            styles.staffReferenceBackButton,
            pressed && styles.iconButtonPressed,
          ]}
        >
          <Image
            alt="رجوع"
            resizeMode="contain"
            source={
              isRtl
                ? mobileIconAssets.common.backArrowRtl
                : mobileIconAssets.common.backArrowLtr
            }
            style={styles.staffReferenceBackIcon}
          />
        </Pressable>
        <View style={styles.staffReferenceProgressBlock}>
          <Text style={styles.staffReferenceStepText}>02 من 04</Text>
          <View style={styles.staffReferenceProgressTrack}>
            {[0, 1, 2, 3].map((item) => (
              <View
                key={item}
                style={[
                  styles.staffReferenceProgressSegment,
                  item < 2 && styles.staffReferenceProgressSegmentActive,
                ]}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.staffReferenceHeroCopy}>
        <Text style={[styles.staffReferenceTitle, isRtl && styles.rtlText]}>
          اختر طريقة الحجز
        </Text>
        <Text style={[styles.staffReferenceSubtitle, isRtl && styles.rtlText]}>
          اختر مختصاً أو دع REZNO يختار الأنسب لك
        </Text>
      </View>

      <View style={styles.staffReferenceSummaryCard}>
        <View style={styles.staffReferenceSummaryMedia}>
          <BusinessMedia badge="مؤكد" styles={styles} />
        </View>
        <View style={styles.staffReferenceSummaryCopy}>
          <Text style={[styles.staffReferenceBusinessName, isRtl && styles.rtlText]}>
            {summaryBusinessName}
          </Text>
          <Text style={[styles.staffReferenceSummaryMeta, isRtl && styles.rtlText]}>
            {draft.serviceName || service.name} ✂
          </Text>
          <Text style={[styles.staffReferenceSummaryMeta, isRtl && styles.rtlText]}>
            {draft.servicePrice || service.price} ◇
          </Text>
          <Text style={[styles.staffReferenceSummaryMuted, isRtl && styles.rtlText]}>
            {draft.dateLabel} • {draft.timeLabel || "الوقت يحدد لاحقاً"}
          </Text>
        </View>
        <Pressable
          accessibilityHint="زر تعديل بصري فقط في هذه المرحلة."
          accessibilityLabel="تعديل ملخص الحجز"
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.staffReferenceEditButton}
        >
          <Text style={styles.staffReferenceEditText}>تعديل ✎</Text>
        </Pressable>
      </View>

      <Text style={[styles.staffReferenceSectionTitle, isRtl && styles.rtlText]}>
        اختر طريقة الحجز
      </Text>
      <View style={styles.staffReferenceMethodGrid}>
        {bookingMethods.map((method) => {
          const selected = draft.bookingMethod === method.id;

          return (
            <Pressable
              accessibilityHint="اختيار بصري محلي لطريقة الحجز."
              accessibilityLabel={`طريقة الحجز ${method.title}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={method.id}
              onPress={() => onBookingMethodSelect(method.id)}
              style={({ pressed }) => [
                styles.staffReferenceMethodCard,
                selected && styles.staffReferenceMethodCardActive,
                pressed && styles.softButtonPressed,
              ]}
            >
              {selected ? (
                <View style={styles.staffReferenceCheckBadge}>
                  <Text style={styles.staffReferenceCheckText}>✓</Text>
                </View>
              ) : null}
              <View style={styles.staffReferenceMethodIcon}>
                <Text style={styles.staffReferenceMethodIconText}>
                  {method.icon}
                </Text>
              </View>
              <Text style={[styles.staffReferenceMethodTitle, isRtl && styles.rtlText]}>
                {method.title}
              </Text>
              <Text style={[styles.staffReferenceMethodDescription, isRtl && styles.rtlText]}>
                {method.description}
              </Text>
              {method.metric ? (
                <View style={styles.staffReferenceMethodMetric}>
                  <Text style={styles.staffReferenceMethodMetricText}>
                    {method.metric}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.staffReferenceSectionTitle, isRtl && styles.rtlText]}>
        تصفية سريعة
      </Text>
      <View style={styles.staffReferenceFilterRow}>
        {quickFilters.map((filter) => {
          const selected = selectedFilter === filter;

          return (
            <Pressable
              accessibilityHint="يغير فلتر العرض محلياً فقط."
              accessibilityLabel={`فلتر ${filter}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={filter}
              onPress={() => setSelectedFilter(filter)}
              style={({ pressed }) => [
                styles.staffReferenceFilterChip,
                selected && styles.staffReferenceFilterChipActive,
                pressed && styles.softButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.staffReferenceFilterText,
                  selected && styles.staffReferenceFilterTextActive,
                ]}
              >
                {filter} {filter === "الأعلى تقييماً" ? "☆" : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.staffReferenceSectionTitle, isRtl && styles.rtlText]}>
        المختصون المتاحون
      </Text>
      <View style={styles.staffReferenceSpecialistRail}>
        {availableSpecialists.map((staffOption) => {
          const selected = staffOption.id === selectedSpecialist.id;

          return (
            <Pressable
              accessibilityHint="يحدد المختص محلياً فقط ولا يرسل أي طلب."
              accessibilityLabel={`اختيار ${staffOption.name}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={staffOption.id}
              onPress={() => {
                onStaffSelect(staffOption);
              }}
              style={({ pressed }) => [
                styles.staffReferenceSpecialistCard,
                selected && styles.staffReferenceSpecialistCardActive,
                pressed && styles.softButtonPressed,
              ]}
            >
              {selected ? (
                <View style={styles.staffReferenceSelectedDot}>
                  <Text style={styles.staffReferenceSelectedDotText}>✓</Text>
                </View>
              ) : null}
              <View style={styles.staffReferenceAvatar}>
                <Text style={styles.staffReferenceAvatarText}>
                  {staffOption.name.charAt(0)}
                </Text>
              </View>
              <Text style={[styles.staffReferenceSpecialistName, isRtl && styles.rtlText]}>
                {staffOption.name}
              </Text>
              <Text style={[styles.staffReferenceSpecialistRole, isRtl && styles.rtlText]}>
                {staffOption.role}
              </Text>
              <Text style={styles.staffReferenceSpecialistRating}>
                ★ {staffOption.rating}
              </Text>
              <Text style={styles.staffReferenceAvailability}>● متاح اليوم</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.staffReferenceDetailCard}>
        <View style={styles.staffReferenceDetailRating}>
          <Text style={styles.staffReferenceDetailRatingText}>
            ★ {selectedSpecialist.rating}
          </Text>
        </View>
        <View style={styles.staffReferenceDetailTop}>
          <View style={styles.staffReferenceDetailAvatar}>
            <Text style={styles.staffReferenceDetailAvatarText}>
              {selectedSpecialist.name.charAt(0)}
            </Text>
          </View>
          <View style={styles.staffReferenceDetailCopy}>
            <View style={styles.staffReferenceDetailNameRow}>
              <Text style={[styles.staffReferenceDetailName, isRtl && styles.rtlText]}>
                {selectedSpecialist.name}
              </Text>
              <Image
                alt=""
                resizeMode="contain"
                source={mobileIconAssets.common.checkSuccess}
                style={styles.staffReferenceVerifiedIcon}
              />
            </View>
            <Text style={[styles.staffReferenceDetailRole, isRtl && styles.rtlText]}>
              {selectedSpecialist.role}
            </Text>
          </View>
        </View>
        <Text style={[styles.staffReferenceDetailMeta, isRtl && styles.rtlText]}>
          خبرة 6 سنوات • قص وتصفيف • عناية وتلوين
        </Text>
        <View style={styles.staffReferenceAvailabilityRow}>
          <Text style={styles.staffReferenceCalendarMark}>▣</Text>
          <Text style={styles.staffReferenceAvailabilityStrong}>اقتراحات سريعة</Text>
        </View>
        <View style={styles.staffReferenceTimeRow}>
          {timeSlots.map((slot, index) => {
            const selected = draft.timeLabel === slot;

            return (
              <Pressable
                accessibilityHint="يحدد وقتاً محلياً للعرض فقط."
                accessibilityLabel={`اختيار ${slot}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={`${slot}-${index}`}
                onPress={() => onSuggestedTimeSelect(slot)}
                style={({ pressed }) => [
                  styles.staffReferenceTimeChip,
                  selected && styles.staffReferenceTimeChipActive,
                  pressed && styles.softButtonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.staffReferenceTimeText,
                    selected && styles.staffReferenceTimeTextActive,
                  ]}
                >
                  {slot}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.staffReferenceBottomAction}>
        <Pressable
          accessibilityHint="ينتقل إلى الخطوة التالية في تدفق الحجز المرئي الحالي."
          accessibilityLabel="التالي"
          accessibilityRole="button"
          hitSlop={TOUCH_HIT_SLOP}
          onPress={onNext}
          style={({ pressed }) => [
            styles.staffReferenceCta,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.staffReferenceCtaText}>التالي</Text>
          <Text style={styles.staffReferenceCtaArrow}>←</Text>
        </Pressable>
        <Text style={styles.staffReferenceTrustNote}>▧ بياناتك محمية وآمنة</Text>
      </View>
    </View>
  );
}

function DateTimeSelectionStep({
  date,
  draft,
  isRtl,
  onBack,
  onDateSelect,
  onNext,
  onTimeSelect,
  styles,
  time,
}: {
  date: BookingDateOption;
  draft: BookingDraft;
  isRtl: boolean;
  onBack: () => void;
  onDateSelect: (date: BookingDateOption) => void;
  onNext: () => void;
  onTimeSelect: (time: BookingTimeOption) => void;
  styles: MobileStyles;
  time: BookingTimeOption;
}) {
  const [selectedPeriod, setSelectedPeriod] = useState("الأقرب");
  const periodFilters = ["الأقرب", "الصباح", "الظهيرة", "المساء"];
  const compactCalendarDays = ["09", "10", "11", "12", "13", "14", "15"];
  const displayBusinessName = draft.businessName || "Noura Beauty Lounge";
  const displayStaffName = draft.specialistName || bookingStaffOptions[0].name;
  const selectedDateSummary = `${date.day}، ${date.label} يوليو`;
  const suggestedTimeLabel =
    bookingTimeOptions.some((option) => option.label === draft.timeLabel)
      ? draft.timeLabel
      : bookingTimeOptions[7].label;

  return (
    <View style={styles.dateTimeReferenceScreen}>
      <View style={styles.staffReferenceGlow} />
      <View style={styles.staffReferenceFrameTop} />
      <View style={styles.staffReferenceHeader}>
        <Pressable
          accessibilityHint="يعود إلى اختيار طريقة الحجز."
          accessibilityLabel="رجوع"
          accessibilityRole="button"
          hitSlop={TOUCH_HIT_SLOP}
          onPress={onBack}
          style={({ pressed }) => [
            styles.staffReferenceBackButton,
            pressed && styles.iconButtonPressed,
          ]}
        >
          <Image
            alt="رجوع"
            resizeMode="contain"
            source={
              isRtl
                ? mobileIconAssets.common.backArrowRtl
                : mobileIconAssets.common.backArrowLtr
            }
            style={styles.staffReferenceBackIcon}
          />
        </Pressable>
        <View style={styles.staffReferenceProgressBlock}>
          <Text style={styles.staffReferenceStepText}>03 من 04</Text>
          <View style={styles.staffReferenceProgressTrack}>
            {[0, 1, 2, 3].map((item) => (
              <View
                key={item}
                style={[
                  styles.staffReferenceProgressSegment,
                  item < 3 && styles.staffReferenceProgressSegmentActive,
                ]}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.staffReferenceHeroCopy}>
        <Text style={[styles.staffReferenceTitle, isRtl && styles.rtlText]}>
          اختر التاريخ والوقت
        </Text>
        <Text style={[styles.staffReferenceSubtitle, isRtl && styles.rtlText]}>
          حدد اليوم والوقت المناسبين لإكمال الحجز
        </Text>
      </View>

      <View style={styles.dateTimeSummaryCard}>
        <View style={styles.dateTimeSummaryMedia}>
          <BusinessMedia badge="مختار" styles={styles} />
        </View>
        <View style={styles.dateTimeSummaryCopy}>
          <Text style={[styles.staffReferenceBusinessName, isRtl && styles.rtlText]}>
            {displayBusinessName}
          </Text>
          <Text style={[styles.staffReferenceSummaryMeta, isRtl && styles.rtlText]}>
            {draft.serviceName} • {displayStaffName}
          </Text>
          <Text style={[styles.staffReferenceSummaryMeta, isRtl && styles.rtlText]}>
            {draft.servicePrice}
          </Text>
          <Text style={[styles.staffReferenceSummaryMuted, isRtl && styles.rtlText]}>
            اقتراح سريع: {suggestedTimeLabel}
          </Text>
        </View>
        <Pressable
          accessibilityHint="زر تعديل بصري فقط في هذه المرحلة."
          accessibilityLabel="تعديل ملخص الموعد"
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.dateTimeEditButton}
        >
          <Text style={styles.staffReferenceEditText}>تعديل</Text>
        </Pressable>
      </View>

      <Text style={[styles.staffReferenceSectionTitle, isRtl && styles.rtlText]}>
        اختر اليوم
      </Text>
      <View style={styles.dateTimeDateRail}>
        {bookingDateOptions.map((item) => {
          const selected = item.id === date.id;
          const disabled = item.meta === "غير متاح";

          return (
            <Pressable
              accessibilityHint={
                disabled
                  ? "هذا اليوم غير متاح بصرياً في هذه المرحلة."
                  : "يحدد التاريخ محلياً فقط."
              }
              accessibilityLabel={`اختيار ${item.day} ${item.label}`}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              key={item.id}
              onPress={() => onDateSelect(item)}
              style={({ pressed }) => [
                styles.dateTimeDateCard,
                item.meta === "مزدحم" && styles.dateTimeDateCardBusy,
                disabled && styles.dateTimeDateCardDisabled,
                selected && styles.dateTimeDateCardActive,
                pressed && !disabled && styles.softButtonPressed,
              ]}
            >
              <Text style={[styles.dateTimeDateDay, selected && styles.dateTimeDateTextActive]}>
                {item.day}
              </Text>
              <Text
                style={[
                  styles.dateTimeDateNumber,
                  selected && styles.dateTimeDateNumberActive,
                  disabled && styles.dateTimeDateDisabledText,
                ]}
              >
                {item.label}
              </Text>
              <Text
                style={[
                  styles.dateTimeDateMeta,
                  selected && styles.dateTimeDateTextActive,
                  disabled && styles.dateTimeDateDisabledText,
                ]}
              >
                {item.meta}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.dateTimeCalendarCard}>
        <View style={styles.dateTimeCalendarHeader}>
          <Text style={styles.dateTimeCalendarTitle}>يوليو 2026</Text>
          <Text style={styles.dateTimeCalendarMeta}>اختيار محلي للعرض فقط</Text>
        </View>
        <View style={styles.dateTimeCalendarGrid}>
          {compactCalendarDays.map((day) => {
            const active = day === date.label;

            return (
              <View
                key={day}
                style={[
                  styles.dateTimeCalendarDay,
                  active && styles.dateTimeCalendarDayActive,
                ]}
              >
                <Text
                  style={[
                    styles.dateTimeCalendarDayText,
                    active && styles.dateTimeCalendarDayTextActive,
                  ]}
                >
                  {day}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <Text style={[styles.staffReferenceSectionTitle, isRtl && styles.rtlText]}>
        الأوقات المتاحة
      </Text>
      <View style={styles.dateTimePeriodRow}>
        {periodFilters.map((filter) => {
          const selected = selectedPeriod === filter;

          return (
            <Pressable
              accessibilityHint="يغير فلتر الأوقات محلياً فقط."
              accessibilityLabel={`فلتر ${filter}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={filter}
              onPress={() => setSelectedPeriod(filter)}
              style={({ pressed }) => [
                styles.dateTimePeriodChip,
                selected && styles.dateTimePeriodChipActive,
                pressed && styles.softButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.dateTimePeriodText,
                  selected && styles.dateTimePeriodTextActive,
                ]}
              >
                {filter}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.dateTimeSlotGrid}>
        {bookingTimeOptions.map((item) => {
          const selected = item.id === time.id;
          const booked = item.state === "booked";
          const suggested = item.label === suggestedTimeLabel;

          return (
            <Pressable
              accessibilityHint={
                booked
                  ? "هذا الوقت محجوز بصرياً ولا يمكن اختياره."
                  : "يحدد الوقت محلياً فقط."
              }
              accessibilityLabel={`اختيار وقت ${item.label}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: booked, selected }}
              disabled={booked}
              key={item.id}
              onPress={() => onTimeSelect(item)}
              style={({ pressed }) => [
                styles.dateTimeSlot,
                suggested && styles.dateTimeSlotSuggested,
                item.state === "limited" && styles.dateTimeSlotLimited,
                booked && styles.dateTimeSlotDisabled,
                selected && styles.dateTimeSlotActive,
                pressed && !booked && styles.softButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.dateTimeSlotText,
                  suggested && styles.dateTimeSlotSuggestedText,
                  selected && styles.dateTimeSlotTextActive,
                  booked && styles.dateTimeSlotTextDisabled,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.dateTimeSelectedCard}>
        <View style={styles.dateTimeSelectedAccent} />
        <View style={styles.dateTimeSelectedCopy}>
          <Text style={[styles.dateTimeSelectedLabel, isRtl && styles.rtlText]}>
            موعدك المختار
          </Text>
          <Text style={[styles.dateTimeSelectedValue, isRtl && styles.rtlText]}>
            {selectedDateSummary} • {time.label}
          </Text>
          <Text style={[styles.dateTimeSelectedMeta, isRtl && styles.rtlText]}>
            مع {displayStaffName}
          </Text>
        </View>
      </View>

      <View style={styles.dateTimeBottomAction}>
        <Pressable
          accessibilityHint="ينتقل إلى مراجعة الدفع في تدفق الحجز المرئي."
          accessibilityLabel="التالي"
          accessibilityRole="button"
          hitSlop={TOUCH_HIT_SLOP}
          onPress={onNext}
          style={({ pressed }) => [
            styles.staffReferenceCta,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.staffReferenceCtaText}>التالي</Text>
          <Text style={styles.staffReferenceCtaArrow}>←</Text>
        </Pressable>
        <Text style={styles.staffReferenceTrustNote}>▧ بياناتك محمية وآمنة</Text>
      </View>
    </View>
  );
}

function PaymentMethodStep({
  draft,
  isRtl,
  onBack,
  onConfirm,
  onPaymentSelect,
  payment,
  styles,
}: {
  draft: BookingDraft;
  isRtl: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onPaymentSelect: (payment: BookingPaymentOption) => void;
  payment: BookingPaymentOption;
  styles: MobileStyles;
}) {
  const displayBusinessName = draft.businessName || "Noura Beauty Lounge";
  const displayStaffName =
    draft.bookingMethod === "rezno-pick"
      ? draft.specialistName || "REZNO يختار"
      : draft.specialistName;
  const paymentIconContent: Record<string, string> = {
    "apple-pay": "Pay",
    "bank-transfer": "▥",
    card: "▰",
    "pay-on-site": "▣",
  };
  const paymentSummaryRows = [
    {
      icon: mobileIconAssets.categories.spa,
      label: "النشاط",
      value: displayBusinessName,
    },
    {
      icon: mobileIconAssets.categories.salon,
      label: "الخدمة",
      value: `${draft.serviceName} • ${draft.servicePrice}`,
    },
    {
      iconText: "♙",
      label: "المختص",
      value: displayStaffName,
    },
    {
      icon: mobileIconAssets.common.calendar,
      label: "الموعد",
      value: `${draft.dateLabel} • ${draft.timeLabel}`,
    },
  ];

  return (
    <View style={styles.paymentReferenceScreen}>
      <View style={styles.staffReferenceGlow} />
      <View style={styles.paymentReferenceHeader}>
        <Pressable
          accessibilityHint="يعود إلى اختيار التاريخ والوقت."
          accessibilityLabel="رجوع"
          accessibilityRole="button"
          hitSlop={TOUCH_HIT_SLOP}
          onPress={onBack}
          style={({ pressed }) => [
            styles.paymentReferenceBackButton,
            pressed && styles.iconButtonPressed,
          ]}
        >
          <Image
            alt="رجوع"
            resizeMode="contain"
            source={mobileIconAssets.common.backArrowRtl}
            style={styles.paymentReferenceBackIcon}
          />
        </Pressable>
        <View style={styles.paymentReferenceProgressBlock}>
          <Text style={styles.paymentReferenceStepText}>04 من 04</Text>
          <View style={styles.staffReferenceProgressTrack}>
            {[0, 1, 2, 3].map((item) => (
              <View
                key={item}
                style={[
                  styles.staffReferenceProgressSegment,
                  item < 4 && styles.staffReferenceProgressSegmentActive,
                ]}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.paymentReferenceHeroCopy}>
        <Text style={[styles.paymentReferenceTitle, isRtl && styles.rtlText]}>
          طريقة الدفع
        </Text>
        <Text style={[styles.paymentReferenceSubtitle, isRtl && styles.rtlText]}>
          اختر طريقة الدفع المناسبة. لا يتم تحصيل أي مبلغ إلا وفق الطريقة المحددة.
        </Text>
      </View>

      <View style={styles.paymentReferenceList}>
        {paymentMethodOptions.map((item) => {
          const selected = item.id === payment.id;

          return (
            <Pressable
              accessibilityHint="يحدد طريقة دفع محلية فقط ولا يفتح أي بوابة دفع."
              accessibilityLabel={`اختيار ${item.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={item.id}
              onPress={() => onPaymentSelect(item)}
              style={({ pressed }) => [
                styles.paymentReferenceMethodCard,
                selected && styles.paymentReferenceMethodCardActive,
                pressed && styles.softButtonPressed,
              ]}
            >
              <View style={styles.paymentReferenceRadio}>
                {selected ? <View style={styles.paymentReferenceRadioDot} /> : null}
              </View>

              <View style={styles.paymentReferenceMethodCopy}>
                <Text style={[styles.paymentReferenceMethodTitle, isRtl && styles.rtlText]}>
                  {item.label}
                </Text>
                <Text style={[styles.paymentReferenceMethodMeta, isRtl && styles.rtlText]}>
                  {item.meta}
                </Text>
              </View>

              <View style={styles.paymentReferenceIconBox}>
                {item.id === "card" ? (
                  <Image
                    alt=""
                    resizeMode="contain"
                    source={mobileIconAssets.common.paymentCard}
                    style={styles.paymentReferenceIconImage}
                  />
                ) : (
                  <Text style={styles.paymentReferenceIconText}>
                    {paymentIconContent[item.id] ?? "▣"}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.paymentSummaryCard}>
        <View style={styles.paymentSummaryTitleRow}>
          <Text style={styles.paymentSummaryTitle}>ملخص الحجز</Text>
          <Text style={styles.paymentSummaryTitleIcon}>☷</Text>
        </View>
        <View style={styles.paymentSummaryRows}>
          {paymentSummaryRows.map((row) => (
            <View key={row.label} style={styles.paymentSummaryRow}>
              <Text style={styles.paymentSummaryLabel}>{row.label}</Text>
              <Text style={[styles.paymentSummaryValue, isRtl && styles.rtlText]}>
                {row.value}
              </Text>
              <View style={styles.paymentSummaryIconBox}>
                {row.icon ? (
                  <Image
                    alt=""
                    resizeMode="contain"
                    source={row.icon}
                    style={styles.paymentSummaryIconImage}
                  />
                ) : (
                  <Text style={styles.paymentSummaryIconText}>{row.iconText}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.paymentReferenceTrustBar}>
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.checkSuccess}
          style={styles.paymentReferenceTrustIcon}
        />
        <Text style={[styles.paymentReferenceTrustText, isRtl && styles.rtlText]}>
          الدفع في الموقع • عملية دفع آمنة ومشفرة بصرياً فقط
        </Text>
      </View>

      <View style={styles.paymentReferenceBottomAction}>
        <Pressable
          accessibilityHint="ينتقل إلى شاشة التأكيد المحلية بدون أي معالجة دفع حقيقية."
          accessibilityLabel="تأكيد الحجز"
          accessibilityRole="button"
          hitSlop={TOUCH_HIT_SLOP}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.paymentReferenceCta,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.paymentReferenceCtaText}>
            {payment.id === "pay-on-site" ? "تأكيد الحجز" : "ادفع الآن"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function BookingConfirmationStep({
  draft,
  isRtl,
  onReturnHome,
  onViewBookings,
  payment,
  styles,
}: {
  draft: BookingDraft;
  isRtl: boolean;
  onReturnHome: () => void;
  onViewBookings: () => void;
  payment: BookingPaymentOption;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.bookingStepScreen}>
      <View style={styles.confirmationHeroCard}>
        <View style={styles.confettiLayer}>
          <View style={styles.confettiDotGold} />
          <View style={styles.confettiDotRose} />
          <View style={styles.confettiDotBlue} />
        </View>
        <View style={styles.confirmationSuccessIcon}>
          <Image
            alt=""
            resizeMode="contain"
            source={mobileIconAssets.common.checkSuccess}
            style={styles.confirmationSuccessIconImage}
          />
        </View>
        <Text style={[styles.screenTitle, isRtl && styles.rtlText]}>
          تم تأكيد الحجز!
        </Text>
        <Text style={[styles.screenDescription, isRtl && styles.rtlText]}>
          تم إعداد ملخص الحجز بصرياً. لا يوجد حجز حقيقي أو إشعار أو بريد مرسل.
        </Text>
        <Text style={styles.confirmationReference}>REZNO-2406</Text>
      </View>

      <BookingMiniSummary
        draft={draft}
        isRtl={isRtl}
        payment={payment}
        styles={styles}
      />

      <View style={styles.bookingReceiptActions}>
        <PrimaryButton label="عرض الحجز" onPress={onViewBookings} styles={styles} />
        <Pressable
          accessibilityHint="يعود إلى الشاشة الرئيسية دون إنشاء حجز حقيقي."
          accessibilityLabel="العودة للرئيسية"
          accessibilityRole="button"
          hitSlop={TOUCH_HIT_SLOP}
          onPress={onReturnHome}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.softButtonPressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>العودة للرئيسية</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MyBookingsScreen({
  bookings,
  filter,
  isRtl,
  managementPanel,
  onBackToList,
  onCancelBooking,
  onClosePanel,
  onConfirmCancel,
  onEditBooking,
  onReturnHome,
  onSelectFilter,
  selectedBooking,
  styles,
}: {
  bookings: VisualBooking[];
  filter: BookingListFilter;
  isRtl: boolean;
  managementPanel: BookingManagementPanel;
  onBackToList: () => void;
  onCancelBooking: (booking: VisualBooking) => void;
  onClosePanel: () => void;
  onConfirmCancel: (booking: VisualBooking) => void;
  onEditBooking: (booking: VisualBooking) => void;
  onReturnHome: () => void;
  onSelectFilter: (filter: BookingListFilter) => void;
  selectedBooking: VisualBooking | null;
  styles: MobileStyles;
}) {
  const { width } = useWindowDimensions();

  if (selectedBooking) {
    return (
      <BookingDetailScreen
        booking={selectedBooking}
        isRtl={isRtl}
        managementPanel={managementPanel}
        onBack={onBackToList}
        onCancelBooking={onCancelBooking}
        onClosePanel={onClosePanel}
        onConfirmCancel={onConfirmCancel}
        onEditBooking={onEditBooking}
        onReturnHome={onReturnHome}
        styles={styles}
      />
    );
  }

  const filteredBookings = bookings.filter((booking) => {
    if (filter === "all") {
      return true;
    }

    if (filter === "upcoming") {
      return booking.status === "confirmed" || booking.status === "pending";
    }

    if (filter === "completed") {
      return booking.status === "completed";
    }

    return booking.status === "cancelled";
  });
  const upcomingBookings = bookings.filter(
    (booking) => booking.status === "confirmed" || booking.status === "pending",
  );
  const completedBookings = bookings.filter(
    (booking) => booking.status === "completed",
  );
  const cancelledBookings = bookings.filter(
    (booking) => booking.status === "cancelled",
  );
  const imageWidth = width < 380 ? 94 : width < 410 ? 108 : 122;
  const bookingSections = [
    {
      bookings: upcomingBookings,
      count: upcomingBookings.length,
      id: "upcoming" as const,
      subtitle: `لديك ${upcomingBookings.length === 2 ? "حجزين" : `${upcomingBookings.length} حجوزات`} قادمة`,
      title: "القادمة",
    },
    {
      bookings: completedBookings,
      count: completedBookings.length,
      id: "completed" as const,
      subtitle: "حجوزات تمت بنجاح",
      title: "المكتملة",
    },
    {
      bookings: cancelledBookings,
      count: cancelledBookings.length,
      id: "cancelled" as const,
      subtitle: "حجوزات أُلغيت محلياً",
      title: "ملغاة",
    },
  ].filter((section) => section.bookings.length > 0);

  return (
    <View style={styles.bookingsScreen}>
      <View style={styles.bookingsHeader}>
        <PremiumPressable
          accessibilityLabel="الإشعارات"
          accessibilityRole="button"
          hitSlop={TOUCH_HIT_SLOP}
          scaleTo={0.94}
          style={styles.bookingsHeaderAction}
        >
          <Image
            alt=""
            resizeMode="contain"
            source={mobileIconAssets.common.notificationBell}
            style={styles.bookingsHeaderActionIcon}
          />
          <View style={styles.bookingsNotificationBadge}>
            <Text style={styles.bookingsNotificationBadgeText}>2</Text>
          </View>
        </PremiumPressable>

        <View style={styles.bookingsHeaderCopy}>
          <Text style={styles.bookingsHeaderTitle}>
            حجوزاتي
          </Text>
          <Text style={styles.bookingsHeaderSubtitle}>
            إدارة ومتابعة جميع حجوزاتك
          </Text>
        </View>

        <PremiumPressable
          accessibilityLabel="التقويم"
          accessibilityRole="button"
          hitSlop={TOUCH_HIT_SLOP}
          scaleTo={0.94}
          style={styles.bookingsHeaderAction}
        >
          <Image
            alt=""
            resizeMode="contain"
            source={mobileIconAssets.common.calendar}
            style={styles.bookingsHeaderActionIconGold}
          />
        </PremiumPressable>
      </View>

      <View style={styles.bookingsSegmentedTabs}>
        {bookingFilterTabs.map((tab) => {
          const selected = tab.id === filter;

          return (
            <PremiumPressable
              accessibilityHint="يغير فلتر حجوزاتي محلياً فقط."
              accessibilityLabel={`عرض الحجوزات ${tab.label}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={tab.id}
              onPress={() => onSelectFilter(tab.id)}
              scaleTo={0.97}
              style={[
                styles.bookingsSegment,
                selected && styles.bookingsSegmentActive,
              ]}
            >
              <Text
                style={[
                  styles.bookingsSegmentText,
                  selected && styles.bookingsSegmentTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </PremiumPressable>
          );
        })}
      </View>

      <View style={styles.bookingsList}>
        {filter === "all" && bookingSections.length > 0 ? (
          bookingSections.map((section, sectionIndex) => (
            <PremiumEntrance
              delay={sectionIndex * 70}
              distance={8}
              key={section.id}
              style={styles.bookingSection}
            >
              <BookingsSectionHeader
                count={section.count}
                id={section.id}
                styles={styles}
                subtitle={section.subtitle}
                title={section.title}
              />
              <View style={styles.bookingSectionCards}>
                {section.bookings.map((booking) => (
                  <BookingCard
                    booking={booking}
                    imageWidth={imageWidth}
                    key={booking.id}
                    onCancelBooking={onCancelBooking}
                    onEditBooking={onEditBooking}
                    styles={styles}
                  />
                ))}
              </View>
            </PremiumEntrance>
          ))
        ) : filteredBookings.length > 0 ? (
          filteredBookings.map((booking, index) => (
            <PremiumEntrance
              delay={index * 55}
              distance={8}
              key={booking.id}
            >
              <BookingCard
                booking={booking}
                imageWidth={imageWidth}
                onCancelBooking={onCancelBooking}
                onEditBooking={onEditBooking}
                styles={styles}
              />
            </PremiumEntrance>
          ))
        ) : (
          <BookingsEmptyState filter={filter} styles={styles} />
        )}
      </View>
    </View>
  );
}

function BookingsSectionHeader({
  count,
  id,
  styles,
  subtitle,
  title,
}: {
  count: number;
  id: "cancelled" | "completed" | "upcoming";
  styles: MobileStyles;
  subtitle: string;
  title: string;
}) {
  const completed = id === "completed";
  const cancelled = id === "cancelled";

  return (
    <View style={styles.bookingSectionHeader}>
      <View style={styles.bookingSectionDivider} />
      <View style={styles.bookingSectionHeaderCopy}>
        <View style={styles.bookingSectionTitleRow}>
          <View
            style={[
              styles.bookingSectionIcon,
              completed && styles.bookingSectionIconSuccess,
              cancelled && styles.bookingSectionIconDanger,
            ]}
          >
            {completed ? (
              <Text style={styles.bookingSectionCheck}>✓</Text>
            ) : cancelled ? (
              <Text style={styles.bookingSectionCancel}>×</Text>
            ) : (
              <Image
                alt=""
                resizeMode="contain"
                source={mobileIconAssets.common.calendar}
                style={styles.bookingSectionCalendarIcon}
              />
            )}
          </View>
          <Text style={styles.bookingSectionTitle}>{title}</Text>
          <View
            style={[
              styles.bookingSectionCount,
              completed && styles.bookingSectionCountSuccess,
              cancelled && styles.bookingSectionCountDanger,
            ]}
          >
            <Text
              style={[
                styles.bookingSectionCountText,
                completed && styles.bookingSectionCountTextSuccess,
                cancelled && styles.bookingSectionCountTextDanger,
              ]}
            >
              {count}
            </Text>
          </View>
        </View>
        <Text style={styles.bookingSectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function BookingCard({
  booking,
  imageWidth,
  onCancelBooking,
  onEditBooking,
  styles,
}: {
  booking: VisualBooking;
  imageWidth: number;
  onCancelBooking: (booking: VisualBooking) => void;
  onEditBooking: (booking: VisualBooking) => void;
  styles: MobileStyles;
}) {
  const cancelled = booking.status === "cancelled";
  const completed = booking.status === "completed";
  const restaurant = booking.businessName === "Mat3am Gold";
  const artworkKind = restaurant
    ? "restaurant"
    : completed
      ? "gym"
      : booking.category.includes("عيادة")
        ? "clinic"
        : "salon";

  return (
    <View
      accessibilityLabel={`حجز ${booking.businessName}، ${booking.statusLabel}`}
      style={styles.managedBookingCard}
    >
      <View style={styles.bookingCardPhysicalRow}>
        <View style={[styles.bookingCardMediaColumn, { width: imageWidth }]}>
          <BookingBusinessArtwork
            businessName={booking.businessName}
            kind={artworkKind}
            status={booking.status}
            statusLabel={booking.statusLabel}
            styles={styles}
          />
          <Text style={styles.bookingCardPrice}>{booking.price}</Text>
        </View>

        <View style={styles.bookingCardDetails}>
          <View style={styles.bookingCardTitleRow}>
            <PremiumPressable
              accessibilityLabel="المزيد من خيارات الحجز"
              accessibilityRole="button"
              hitSlop={TOUCH_HIT_SLOP}
              scaleTo={0.94}
              style={styles.bookingOverflowButton}
            >
              <Text style={styles.bookingOverflowText}>⋮</Text>
            </PremiumPressable>
            <Text
              numberOfLines={2}
              style={styles.managedBookingTitle}
            >
              {booking.businessName}
            </Text>
          </View>

          <Text
            numberOfLines={2}
            style={[styles.managedBookingMeta, styles.bookingCardContentInset]}
          >
            {booking.serviceName} · {booking.category}
          </Text>

          <View
            style={[styles.bookingDateTimeRow, styles.bookingCardContentInset]}
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.84}
              numberOfLines={1}
              style={styles.bookingDateText}
            >
              {booking.date}
            </Text>
            <View style={styles.bookingTimePill}>
              <Image
                alt=""
                resizeMode="contain"
                source={mobileIconAssets.common.clock}
                style={styles.bookingTimeIcon}
              />
              <Text style={styles.bookingTimeText}>{booking.time}</Text>
            </View>
          </View>

          {!completed && !cancelled ? (
            <View
              style={[styles.bookingMetadataRow, styles.bookingCardContentInset]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.bookingMetadataText,
                  restaurant && styles.bookingMetadataTextFull,
                ]}
              >
                {restaurant
                  ? booking.paymentMethod
                  : `مع: ${booking.staff}`}
              </Text>
              {!restaurant ? (
                <View style={styles.bookingStaffAvatar}>
                  <Text style={styles.bookingStaffAvatarText}>س</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {!completed && !cancelled ? (
            <View style={styles.managedBookingActions}>
              <BookingActionButton
                compact
                icon={booking.status === "pending" ? "cancel" : "edit"}
                label={booking.status === "pending" ? "إلغاء الحجز" : "تعديل"}
                onPress={() =>
                  booking.status === "pending"
                    ? onCancelBooking(booking)
                    : onEditBooking(booking)
                }
                styles={styles}
                tone={booking.status === "pending" ? "danger" : "primary"}
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function BookingBusinessArtwork({
  businessName,
  kind,
  status,
  statusLabel,
  styles,
}: {
  businessName: string;
  kind: "clinic" | "gym" | "restaurant" | "salon";
  status: VisualBookingStatus;
  statusLabel: string;
  styles: MobileStyles;
}) {
  return (
    <View
      style={[
        styles.bookingArtwork,
        kind === "restaurant" && styles.bookingArtworkRestaurant,
        kind === "gym" && styles.bookingArtworkGym,
        kind === "clinic" && styles.bookingArtworkClinic,
      ]}
    >
      <View style={styles.bookingArtworkGlow} />
      <View style={styles.bookingArtworkCeiling}>
        <View style={styles.bookingArtworkLight} />
        <View style={styles.bookingArtworkLight} />
        <View style={styles.bookingArtworkLight} />
      </View>
      <View style={styles.bookingArtworkWallPanels}>
        <View style={styles.bookingArtworkWallPanel} />
        <View style={styles.bookingArtworkWallPanel} />
        <View style={styles.bookingArtworkWallPanel} />
      </View>
      <View style={styles.bookingArtworkFloor} />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.65}
        numberOfLines={2}
        style={styles.bookingArtworkBrand}
      >
        {businessName}
      </Text>
      <View
        style={[
          styles.bookingArtworkStatus,
          status === "pending" && styles.bookingArtworkStatusPending,
          status === "cancelled" && styles.bookingArtworkStatusCancelled,
        ]}
      >
        <Text
          style={[
            styles.bookingArtworkStatusText,
            status === "pending" && styles.bookingArtworkStatusTextPending,
            status === "cancelled" && styles.bookingArtworkStatusTextCancelled,
          ]}
        >
          {statusLabel}
        </Text>
      </View>
    </View>
  );
}

function BookingActionButton({
  compact = false,
  icon,
  label,
  onPress,
  styles,
  tone,
}: {
  compact?: boolean;
  icon?: "cancel" | "edit";
  label: string;
  onPress: () => void;
  styles: MobileStyles;
  tone: "danger" | "neutral" | "primary";
}) {
  return (
    <PremiumPressable
      accessibilityHint="إجراء إدارة مرئي فقط ولا يغير حجزاً حقيقياً."
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={TOUCH_HIT_SLOP}
      onPress={onPress}
      scaleTo={0.97}
      style={[
        styles.bookingActionButton,
        icon === "edit" && styles.bookingActionButtonEdit,
        tone === "primary" && styles.bookingActionButtonPrimary,
        tone === "danger" && styles.bookingActionButtonDanger,
        compact && styles.bookingActionButtonCompact,
      ]}
    >
      {icon ? (
        <BookingActionGlyph icon={icon} styles={styles} tone={tone} />
      ) : null}
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        numberOfLines={1}
        style={[
          styles.bookingActionButtonText,
          tone === "primary" && styles.bookingActionButtonTextPrimary,
          tone === "danger" && styles.bookingActionButtonTextDanger,
        ]}
      >
        {label}
      </Text>
    </PremiumPressable>
  );
}

function BookingActionGlyph({
  icon,
  styles,
  tone,
}: {
  icon: "cancel" | "edit";
  styles: MobileStyles;
  tone: "danger" | "neutral" | "primary";
}) {
  return (
    <Text
      style={[
        styles.bookingActionGlyphText,
        tone === "primary" && styles.bookingActionGlyphTextPrimary,
        tone === "danger" && styles.bookingActionGlyphTextDanger,
      ]}
    >
      {icon === "edit" ? "✎" : "×"}
    </Text>
  );
}

function BookingsEmptyState({
  filter,
  styles,
}: {
  filter: BookingListFilter;
  styles: MobileStyles;
}) {
  const labelsByFilter: Record<BookingListFilter, string> = {
    all: "لا توجد حجوزات حالياً",
    cancelled: "لا توجد حجوزات ملغاة",
    completed: "لا توجد حجوزات مكتملة",
    upcoming: "لا توجد حجوزات قادمة",
  };

  return (
    <PremiumEntrance distance={8} style={styles.bookingsEmptyState}>
      <View style={styles.bookingsEmptyIcon}>
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.calendar}
          style={styles.bookingsEmptyIconImage}
        />
      </View>
      <Text style={styles.bookingsEmptyTitle}>{labelsByFilter[filter]}</Text>
      <Text style={styles.bookingsEmptyBody}>
        ستظهر حجوزاتك هنا فور إضافتها، ويمكنك العودة للاستكشاف في أي وقت.
      </Text>
    </PremiumEntrance>
  );
}

function BookingDetailScreen({
  booking,
  isRtl,
  managementPanel,
  onBack,
  onCancelBooking,
  onClosePanel,
  onConfirmCancel,
  onEditBooking,
  onReturnHome,
  styles,
}: {
  booking: VisualBooking;
  isRtl: boolean;
  managementPanel: BookingManagementPanel;
  onBack: () => void;
  onCancelBooking: (booking: VisualBooking) => void;
  onClosePanel: () => void;
  onConfirmCancel: (booking: VisualBooking) => void;
  onEditBooking: (booking: VisualBooking) => void;
  onReturnHome: () => void;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.bookingDetailScreen}>
      <BookingFlowHeader
        isRtl={isRtl}
        onBack={onBack}
        stepLabel="عرض الحجز"
        styles={styles}
        subtitle="واجهة عرض فقط، لا يوجد حجز حقيقي في هذه المرحلة."
        title="تفاصيل الحجز"
      />

      <View style={styles.bookingDetailHero}>
        <View style={styles.bookingDetailHeroMedia}>
          <BusinessMedia badge={booking.statusLabel} styles={styles} />
        </View>
        <View style={styles.bookingDetailHeroCopy}>
          <Text style={[styles.managedBookingTitle, isRtl && styles.rtlText]}>
            {booking.businessName}
          </Text>
          <Text style={[styles.managedBookingMeta, isRtl && styles.rtlText]}>
            {booking.category} · {booking.reference}
          </Text>
          <Text
            style={[
              styles.managedStatusPill,
              booking.status === "pending" && styles.managedStatusPillWarning,
              booking.status === "completed" && styles.managedStatusPillSuccess,
              booking.status === "cancelled" && styles.managedStatusPillCancelled,
              styles.bookingDetailStatusPill,
            ]}
          >
            {booking.statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.bookingDetailSummary}>
        <SummaryItem label="النشاط" styles={styles} value={booking.businessName} />
        <SummaryItem label="الخدمة" styles={styles} value={booking.serviceName} />
        <SummaryItem label="المختص" styles={styles} value={booking.staff} />
        <SummaryItem
          label="الموعد"
          styles={styles}
          value={`${booking.date} · ${booking.time}`}
        />
        <SummaryItem
          label="طريقة الدفع"
          styles={styles}
          value={booking.paymentMethod}
        />
        <SummaryItem label="الإجمالي" styles={styles} value={booking.price} />
        <SummaryItem label="المرجع" styles={styles} value={booking.reference} />
      </View>

      <View
        style={[
          styles.safeManagementNote,
          isRtl && styles.safeManagementNoteRtl,
        ]}
      >
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.checkSuccess}
          style={styles.safeManagementIcon}
        />
        <Text style={[styles.securePaymentText, isRtl && styles.rtlText]}>
          واجهة عرض فقط، لا يوجد حجز حقيقي ولا يتم إرسال تعديل أو إلغاء.
        </Text>
      </View>

      <View style={styles.bookingDetailActions}>
        <PrimaryButton
          label="تعديل الحجز"
          onPress={() => onEditBooking(booking)}
          styles={styles}
        />
        <Pressable
          accessibilityHint="يفتح تأكيد إلغاء بصري فقط."
          accessibilityLabel="إلغاء الحجز"
          accessibilityRole="button"
          disabled={booking.status === "cancelled"}
          hitSlop={TOUCH_HIT_SLOP}
          onPress={() => onCancelBooking(booking)}
          style={({ pressed }) => [
            styles.cancelBookingButton,
            booking.status === "cancelled" && styles.disabledButton,
            pressed && booking.status !== "cancelled" && styles.softButtonPressed,
          ]}
        >
          <Text style={styles.cancelBookingButtonText}>إلغاء الحجز</Text>
        </Pressable>
        <Pressable
          accessibilityHint="يعود إلى الرئيسية دون تغيير أي بيانات."
          accessibilityLabel="العودة للرئيسية"
          accessibilityRole="button"
          hitSlop={TOUCH_HIT_SLOP}
          onPress={onReturnHome}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.softButtonPressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>العودة للرئيسية</Text>
        </Pressable>
      </View>

      {managementPanel ? (
        <BookingManagementPanelCard
          booking={booking}
          isRtl={isRtl}
          mode={managementPanel}
          onClose={onClosePanel}
          onConfirmCancel={onConfirmCancel}
          styles={styles}
        />
      ) : null}
    </View>
  );
}

function BookingManagementPanelCard({
  booking,
  isRtl,
  mode,
  onClose,
  onConfirmCancel,
  styles,
}: {
  booking: VisualBooking;
  isRtl: boolean;
  mode: Exclude<BookingManagementPanel, null>;
  onClose: () => void;
  onConfirmCancel: (booking: VisualBooking) => void;
  styles: MobileStyles;
}) {
  if (mode === "edit") {
    return (
      <View style={styles.managementPanel}>
        <Text style={[styles.managementPanelTitle, isRtl && styles.rtlText]}>
          تعديل الحجز
        </Text>
        <Text style={[styles.managementPanelBody, isRtl && styles.rtlText]}>
          يمكنك تعديل الخدمة أو الوقت بصرياً في هذه المعاينة فقط. لا يتم حفظ أي
          تغيير ولا يتم إرسال أي طلب.
        </Text>
        <View
          style={[
            styles.managementPanelActions,
            isRtl && styles.managementPanelActionsRtl,
          ]}
        >
          <BookingActionButton
            label="تغيير الوقت"
            onPress={onClose}
            styles={styles}
            tone="neutral"
          />
          <BookingActionButton
            label="تغيير المختص"
            onPress={onClose}
            styles={styles}
            tone="neutral"
          />
          <BookingActionButton
            label="إغلاق"
            onPress={onClose}
            styles={styles}
            tone="primary"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.managementPanel}>
      <Text style={[styles.managementPanelTitle, isRtl && styles.rtlText]}>
        إلغاء الحجز؟
      </Text>
      <Text style={[styles.managementPanelBody, isRtl && styles.rtlText]}>
        هذا إجراء بصري فقط ولا يلغي أي حجز حقيقي. سيظهر هذا الحجز كملغى داخل
        المعاينة المحلية فقط.
      </Text>
      <View
        style={[
          styles.managementPanelActions,
          isRtl && styles.managementPanelActionsRtl,
        ]}
      >
        <BookingActionButton
          label="تراجع"
          onPress={onClose}
          styles={styles}
          tone="neutral"
        />
        <BookingActionButton
          label="إلغاء الحجز"
          onPress={() => onConfirmCancel(booking)}
          styles={styles}
          tone="danger"
        />
      </View>
    </View>
  );
}

function MessagesNotificationsPreviewScreen({
  isRtl,
  locale,
  onOpenCommerceOrder,
  styles,
}: {
  isRtl: boolean;
  locale: MobileLocale;
  onOpenCommerceOrder: (orderId: string) => void;
  styles: MobileStyles;
}) {
  const heroCopy = locale === "en"
    ? {
        badge: "Safe preview",
        body: "Order notifications below use the real read-only API. Messages remain a preview; Push, device permissions, WebSocket, and send APIs are not enabled.",
        eyebrow: "Messages and notifications",
        title: "Clear order updates without enabling outbound messaging",
      }
    : locale === "ckb"
      ? {
          badge: "پێشبینینی پارێزراو",
          body: "ئاگادارکردنەوەکانی داواکاری لە API ـی ڕاستەقینەی تەنها خوێندنەوەوە دێن. پەیامەکان هێشتا پێشبینینن؛ Push و WebSocket و API ـی ناردن چالاک نین.",
          eyebrow: "پەیام و ئاگادارکردنەوەکان",
          title: "نوێکارییە ڕوونەکانی داواکاری بەبێ ناردنی پەیام",
        }
      : {
          badge: "معاينة آمنة",
          body: "إشعارات الطلبات أدناه تأتي من واجهة القراءة الحقيقية. تبقى الرسائل معاينة فقط؛ ولا توجد إشعارات دفع أو WebSocket أو واجهة إرسال.",
          eyebrow: "الرسائل والإشعارات",
          title: "تحديثات طلب واضحة بدون تفعيل إرسال الرسائل",
        };

  return (
    <>
      <View style={styles.messageHeroCard}>
        <View style={styles.messageHeroGlow} />
        <View style={styles.messageHeroTopRow}>
          <View style={styles.messageHeroIcon}>
            <Image
              alt=""
              resizeMode="contain"
              source={mobileIconAssets.common.message}
              style={styles.messageHeroIconImage}
            />
          </View>
          <Text style={styles.messageSafetyBadge}>{heroCopy.badge}</Text>
        </View>
        <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
          {heroCopy.eyebrow}
        </Text>
        <Text style={[styles.messageHeroTitle, isRtl && styles.rtlText]}>
          {heroCopy.title}
        </Text>
        <Text style={[styles.messageHeroBody, isRtl && styles.rtlText]}>
          {heroCopy.body}
        </Text>
      </View>

      <CommerceNotificationsCenter
        isRtl={isRtl}
        locale={locale}
        onOpenOrder={onOpenCommerceOrder}
        styles={styles}
      />
      {locale === "ar" ? (
        <>
          <NotificationsCenterPreview isRtl={isRtl} styles={styles} />
          <ConversationListPreview isRtl={isRtl} styles={styles} />
          <MessageDetailPreview isRtl={isRtl} styles={styles} />
          <NotificationPreferencesPreview isRtl={isRtl} styles={styles} />
        </>
      ) : null}
    </>
  );
}

function CommerceNotificationsCenter({
  isRtl,
  locale,
  onOpenOrder,
  styles,
}: {
  isRtl: boolean;
  locale: MobileLocale;
  onOpenOrder: (orderId: string) => void;
  styles: MobileStyles;
}) {
  const copy = commerceCopy[locale];
  const [items, setItems] = useState<CommerceNotification[]>([]);
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const load = useCallback(() => {
    setState("loading");
    void commerceApi.listNotifications()
      .then((result) => {
        setItems(result.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <View style={styles.notificationPanel}>
      <SectionHeader isRtl={isRtl} styles={styles} title={copy.notifications} />
      {state === "loading" ? <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>{copy.loading}</Text> : null}
      {state === "error" ? (
        <Pressable accessibilityRole="button" onPress={load} style={styles.notificationCard}>
          <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>{copy.sessionRequired}</Text>
          <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>{copy.retry}</Text>
        </Pressable>
      ) : null}
      {state === "ready" && items.length === 0 ? (
        <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>{copy.noNotifications}</Text>
      ) : null}
      {items.map((item) => {
        const orderId = commerceNotificationOrderDestination(item);
        const content = (
          <>
            <View style={styles.notificationIcon}>
              <Image alt="" resizeMode="contain" source={mobileIconAssets.common.notificationBell} style={styles.notificationIconImage} />
            </View>
            <View style={styles.rowCopy}>
              <View style={styles.notificationTitleRow}>
                <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>{item.title}</Text>
                <Text style={styles.notificationTime}>{formatCommerceDate(item.createdAt, locale)}</Text>
              </View>
              <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>{item.body}</Text>
            </View>
          </>
        );
        return orderId ? (
          <Pressable
            accessibilityLabel={item.title}
            accessibilityRole="button"
            key={item.id}
            onPress={() => onOpenOrder(orderId)}
            style={styles.notificationCard}
          >
            {content}
          </Pressable>
        ) : <View key={item.id} style={styles.notificationCard}>{content}</View>;
      })}
    </View>
  );
}

function NotificationsCenterPreview({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.notificationPanel}>
      <SectionHeader
        action="إدارة"
        isRtl={isRtl}
        styles={styles}
        title="مركز الإشعارات"
      />
      {notificationPreviewItems.map((item, index) => (
        <View
          key={item.title}
          style={[
            styles.notificationCard,
            index === 0 && styles.notificationCardUnread,
          ]}
        >
          <View style={styles.notificationIcon}>
            <Image
              alt=""
              resizeMode="contain"
              source={
                item.tone === "success"
                  ? mobileIconAssets.common.checkSuccess
                  : item.tone === "message"
                    ? mobileIconAssets.common.message
                    : mobileIconAssets.common.notificationBell
              }
              style={styles.notificationIconImage}
            />
          </View>
          <View style={styles.rowCopy}>
            <View style={styles.notificationTitleRow}>
              <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
                {item.title}
              </Text>
              <Text style={styles.notificationTime}>{item.time}</Text>
            </View>
            <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
              {item.body}
            </Text>
            <Text style={styles.notificationStatusChip}>{item.status}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ConversationListPreview({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.conversationPanel}>
      <SectionHeader isRtl={isRtl} styles={styles} title="المحادثات" />
      {conversationPreviewItems.map((conversation) => (
        <View key={conversation.name} style={styles.conversationRow}>
          <View style={styles.conversationAvatar}>
            <Text style={styles.conversationAvatarText}>
              {conversation.initials}
            </Text>
          </View>
          <View style={styles.rowCopy}>
            <View style={styles.notificationTitleRow}>
              <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
                {conversation.name}
              </Text>
              <Text style={styles.notificationTime}>{conversation.time}</Text>
            </View>
            <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
              {conversation.lastMessage}
            </Text>
            <Text style={styles.conversationStatus}>{conversation.status}</Text>
          </View>
          {conversation.unread ? (
            <Text style={styles.unreadBadge}>{conversation.unread}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function MessageDetailPreview({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.chatPanel}>
      <View style={styles.chatHeader}>
        <View>
          <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
            محادثة الحجز
          </Text>
          <Text style={[styles.chatTitle, isRtl && styles.rtlText]}>
            Noura Beauty Lounge
          </Text>
        </View>
        <Text style={styles.messageSafetyBadge}>بدون إرسال</Text>
      </View>
      {messageBubblePreview.map((message) => (
        <View
          key={`${message.from}-${message.time}`}
          style={[
            styles.chatBubble,
            message.from === "customer" && styles.chatBubbleCustomer,
          ]}
        >
          <Text
            style={[
              styles.chatBubbleText,
              message.from === "customer" && styles.chatBubbleTextCustomer,
              isRtl && styles.rtlText,
            ]}
          >
            {message.body}
          </Text>
          <Text
            style={[
              styles.chatBubbleTime,
              message.from === "customer" && styles.chatBubbleTimeCustomer,
            ]}
          >
            {message.time}
          </Text>
        </View>
      ))}
      <View style={styles.quickReplyRow}>
        {quickReplyPreview.map((reply) => (
          <Text key={reply} style={styles.quickReplyChip}>
            {reply}
          </Text>
        ))}
      </View>
      <View style={styles.messagePlaceholderRow}>
        <Text style={styles.messagePlaceholderChip}>مرفق</Text>
        <Text style={styles.messagePlaceholderChip}>موقع</Text>
        <Text style={styles.messagePlaceholderChip}>دفع بصري</Text>
      </View>
    </View>
  );
}

function NotificationPreferencesPreview({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.preferencesPanel}>
      <SectionHeader isRtl={isRtl} styles={styles} title="تفضيلات الإشعارات" />
      {notificationPreferenceRows.map((row) => (
        <View key={row.label} style={styles.preferenceRow}>
          <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
            {row.label}
          </Text>
          <View
            style={[
              styles.preferenceToggle,
              row.enabled && styles.preferenceToggleActive,
            ]}
          >
            <View
              style={[
                styles.preferenceKnob,
                row.enabled && styles.preferenceKnobActive,
              ]}
            />
          </View>
        </View>
      ))}
      <Text style={[styles.preferenceNote, isRtl && styles.rtlText]}>
        المفاتيح بصرية فقط ولا تحفظ أي إعدادات أو تطلب صلاحيات جهاز.
      </Text>
    </View>
  );
}

function BusinessOwnerPreviewScreen({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <>
      <View style={styles.ownerHeroCard}>
        <View style={styles.ownerHeroGlow} />
        <View style={styles.ownerHeaderRow}>
          <View style={styles.ownerLogo}>
            <Text style={styles.ownerLogoText}>N</Text>
          </View>
          <View style={styles.rowCopy}>
            <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
              لوحة مالك النشاط
            </Text>
            <Text style={[styles.ownerBusinessName, isRtl && styles.rtlText]}>
              Noura Beauty Lounge
            </Text>
            <Text style={[styles.ownerBusinessMeta, isRtl && styles.rtlText]}>
              صالون وتجميل · بغداد، الكرادة
            </Text>
          </View>
          <Text style={styles.ownerVerifiedBadge}>موثق</Text>
        </View>
        <Text style={[styles.ownerHeroBody, isRtl && styles.rtlText]}>
          معاينة تشغيلية ثابتة لمالك النشاط. لا تعرض بيانات حقيقية ولا تنفذ أي
          تعديل على الخدمات أو الحجوزات.
        </Text>
      </View>

      <View style={styles.ownerOverviewGrid}>
        {businessOverviewCards.map((card) => (
          <View key={card.label} style={styles.ownerOverviewCard}>
            <Text style={styles.ownerOverviewValue}>{card.value}</Text>
            <Text style={[styles.ownerOverviewLabel, isRtl && styles.rtlText]}>
              {card.label}
            </Text>
            <Text style={styles.ownerOverviewDetail}>{card.detail}</Text>
          </View>
        ))}
      </View>

      <View style={styles.ownerQuickActionsCard}>
        <SectionHeader isRtl={isRtl} styles={styles} title="إجراءات سريعة" />
        <View style={styles.ownerQuickGrid}>
          {businessQuickActions.map((action) => (
            <View key={action.label} style={styles.ownerQuickAction}>
              <Text style={styles.ownerQuickIcon}>{action.icon}</Text>
              <Text style={styles.ownerQuickText}>{action.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <TodayBookingsPreview isRtl={isRtl} styles={styles} />
      <ServicesStaffPreview isRtl={isRtl} styles={styles} />
      <BusinessInsightsPreview isRtl={isRtl} styles={styles} />

      <View style={styles.ownerSafetyCard}>
        <Text style={[styles.integrationTitle, isRtl && styles.rtlText]}>
          حد أمان الأعمال
        </Text>
        <Text style={[styles.integrationBody, isRtl && styles.rtlText]}>
          هذه لوحة معاينة فقط. قبول الحجوزات، تعديل الخدمات، إدارة الموظفين،
          والتحليلات الحقيقية تحتاج سبرنت صلاحيات ومنطق أعمال منفصل.
        </Text>
      </View>
    </>
  );
}

function TodayBookingsPreview({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.ownerPanelCard}>
      <SectionHeader
        action="فتح التقويم"
        isRtl={isRtl}
        styles={styles}
        title="حجوزات اليوم"
      />
      {ownerBookingsPreview.map((booking) => (
        <View key={`${booking.customer}-${booking.time}`} style={styles.ownerBookingRow}>
          <View style={styles.ownerCustomerAvatar}>
            <Text style={styles.ownerCustomerInitial}>{booking.initials}</Text>
          </View>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
              {booking.customer} · {booking.service}
            </Text>
            <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
              {booking.time}
            </Text>
          </View>
          <View style={styles.ownerBookingActions}>
            <Text style={styles.ownerStatusChip}>{booking.status}</Text>
            <Text style={styles.ownerActionText}>قبول بصري</Text>
            <Text style={styles.ownerMutedActionText}>إعادة جدولة</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ServicesStaffPreview({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.ownerTwoColumn}>
      <View style={styles.ownerPanelCard}>
        <SectionHeader isRtl={isRtl} styles={styles} title="أفضل الخدمات" />
        {topServicesPreview.map((service) => (
          <View key={service.name} style={styles.ownerMetricRow}>
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
                {service.name}
              </Text>
              <View style={styles.ownerProgressTrack}>
                <View
                  style={[
                    styles.ownerProgressFill,
                    { width: `${service.value}%` as `${number}%` },
                  ]}
                />
              </View>
            </View>
            <Text style={styles.ownerMetricValue}>{service.percent}</Text>
          </View>
        ))}
      </View>

      <View style={styles.ownerPanelCard}>
        <SectionHeader isRtl={isRtl} styles={styles} title="توفر الفريق" />
        {staffAvailabilityPreview.map((staff) => (
          <View key={staff.name} style={styles.ownerStaffRow}>
            <View style={styles.ownerCustomerAvatar}>
              <Text style={styles.ownerCustomerInitial}>
                {staff.name.charAt(0)}
              </Text>
            </View>
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
                {staff.name}
              </Text>
              <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
                {staff.status} · {staff.capacity}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function BusinessInsightsPreview({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.ownerInsightsCard}>
      <View style={styles.ownerInsightsHeader}>
        <View>
          <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
            مؤشرات الأسبوع
          </Text>
          <Text style={[styles.ownerInsightsTitle, isRtl && styles.rtlText]}>
            نمو حجوزات تجريبي
          </Text>
        </View>
        <Text style={styles.ownerVerifiedBadge}>+18%</Text>
      </View>
      <View style={styles.ownerBarsRow}>
        {weeklyBusinessBars.map((height, index) => (
          <View key={`${height}-${index}`} style={styles.ownerBarTrack}>
            <View style={[styles.ownerBarFill, { height }]} />
          </View>
        ))}
      </View>
      <Text style={[styles.ownerBusinessMeta, isRtl && styles.rtlText]}>
        الخدمة الأعلى طلباً: قص وتصفيف · لا يوجد اتصال API تحليلات.
      </Text>
    </View>
  );
}

function AccountScreen({
  isRtl,
  locale,
  onLocaleChange,
  onThemeModeChange,
  styles,
  text,
  themeMode,
}: {
  isRtl: boolean;
  locale: MobileLocale;
  onLocaleChange: (locale: MobileLocale) => void;
  onThemeModeChange: (mode: MobileThemeMode) => void;
  styles: MobileStyles;
  text: (typeof labels)[MobileLocale];
  themeMode: MobileThemeMode;
}) {
  return (
    <>
      <View style={styles.accountHeroCard}>
        <View style={styles.profileHeroTopRow}>
          <View style={styles.accountAvatar}>
            <Text style={styles.accountAvatarText}>ر</Text>
          </View>
          <View style={styles.profileStatusStack}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>حساب آمن</Text>
            </View>
            <Text style={[styles.profileMembershipText, isRtl && styles.rtlText]}>
              عضو REZNO الموحد
            </Text>
          </View>
        </View>
        <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
          الملف الشخصي
        </Text>
        <Text style={[styles.screenTitle, isRtl && styles.rtlText]}>
          إعداداتك وتجربتك في مكان واحد
        </Text>
        <Text style={[styles.screenDescription, isRtl && styles.rtlText]}>
          معاينة آمنة لحساب العميل والتفضيلات. لا توجد قراءة مستخدم حقيقية أو
          تغيير جلسة في هذه المرحلة.
        </Text>
        <View style={styles.profileStatsGrid}>
          {profileOverviewStats.map((stat) => (
            <View key={stat.label} style={styles.profileStatCard}>
              <Text style={[styles.profileStatValue, isRtl && styles.rtlText]}>
                {stat.value}
              </Text>
              <Text style={[styles.profileStatLabel, isRtl && styles.rtlText]}>
                {stat.label}
              </Text>
              <Text style={[styles.profileStatMeta, isRtl && styles.rtlText]}>
                {stat.meta}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.accountActionRow}>
          {accountActions.map((action) => (
            <Pressable
              accessibilityRole="button"
              disabled
              key={action.label}
              style={[
                styles.accountActionButton,
                action.tone === "primary" && styles.accountActionButtonPrimary,
              ]}
            >
              <Text
                style={[
                  styles.accountActionText,
                  action.tone === "primary" && styles.accountActionTextPrimary,
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.settingsCard}>
        <Text style={[styles.cardTitle, isRtl && styles.rtlText]}>
          اللغة والمظهر
        </Text>
        <Text style={[styles.cardBody, isRtl && styles.rtlText]}>
          يمكن تبديل النمط محلياً بدون حفظ دائم أو صلاحيات جهاز. الوضع الداكن
          هو الافتراضي لتجربة REZNO الفاخرة.
        </Text>
        <View style={styles.preferencesGroup}>
          <Text style={[styles.preferenceGroupTitle, isRtl && styles.rtlText]}>
            اللغة
          </Text>
          {languagePreferenceRows.map((row) => {
            const selected = row.locale === locale;

            return (
              <Pressable
                accessibilityHint="يغير لغة واجهة المعاينة فقط."
                accessibilityLabel={`اختيار اللغة ${row.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                hitSlop={TOUCH_HIT_SLOP}
                key={row.locale}
                onPress={() => onLocaleChange(row.locale)}
                style={({ pressed }) => [
                  styles.accountPreferenceRow,
                  pressed && styles.softButtonPressed,
                ]}
              >
                <View
                  style={[
                    styles.accountPreferenceDot,
                    selected && styles.accountPreferenceDotActive,
                  ]}
                />
                <View style={styles.preferenceCopy}>
                  <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
                    {row.label}
                  </Text>
                  <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
                    {row.meta}
                  </Text>
                </View>
                <Text style={styles.preferenceChevron}>
                  {selected ? "✓" : "›"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.preferencesGroup}>
          <Text style={[styles.preferenceGroupTitle, isRtl && styles.rtlText]}>
            النمط
          </Text>
          {themePreferenceRows.map((row) => {
            const selected = row.mode === themeMode;

            return (
              <Pressable
                accessibilityHint="يغير نمط ألوان التطبيق داخل هذه المعاينة فقط."
                accessibilityLabel={`اختيار النمط ${row.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                hitSlop={TOUCH_HIT_SLOP}
                key={row.label}
                onPress={() => onThemeModeChange(row.mode)}
                style={({ pressed }) => [
                  styles.accountPreferenceRow,
                  pressed && styles.softButtonPressed,
                ]}
              >
                <View
                  style={[
                    styles.accountPreferenceDot,
                    selected && styles.accountPreferenceDotActive,
                  ]}
                />
                <View style={styles.preferenceCopy}>
                  <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
                    {row.label}
                  </Text>
                  <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
                    {row.meta}
                  </Text>
                </View>
                <Text style={styles.preferenceChevron}>
                  {selected ? "✓" : "›"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.preferencesPanel}>
        <SectionHeader isRtl={isRtl} styles={styles} title="تفضيلات الإشعارات" />
        {accountNotificationRows.map((row) => (
          <View key={row.label} style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
                {row.label}
              </Text>
              <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
                {row.meta}
              </Text>
            </View>
            <View
              style={[
                styles.preferenceToggle,
                row.enabled && styles.preferenceToggleActive,
              ]}
            >
              <View
                style={[
                  styles.preferenceKnob,
                  row.enabled && styles.preferenceKnobActive,
                ]}
              />
            </View>
          </View>
        ))}
        <Text style={[styles.preferenceNote, isRtl && styles.rtlText]}>
          المفاتيح بصرية فقط ولا تطلب إذن إشعارات أو تحفظ تفضيلات.
        </Text>
      </View>

      <View style={styles.privacyCard}>
        <Text style={[styles.cardTitle, isRtl && styles.rtlText]}>
          الأمان والخصوصية
        </Text>
        <Text style={[styles.cardBody, isRtl && styles.rtlText]}>
          بطاقات توضح اتجاه الخصوصية بدون كشف بيانات أو رموز أو جلسات.
        </Text>
        <View style={styles.privacyGrid}>
          {privacySecurityRows.map((row) => (
            <View key={row.label} style={styles.privacyMiniCard}>
              <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
                {row.label}
              </Text>
              <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
                {row.body}
              </Text>
              <Text style={[styles.safeActionText, isRtl && styles.rtlText]}>
                إدارة لاحقاً
              </Text>
            </View>
          ))}
        </View>
        <Text style={[styles.dataOwnershipNote, isRtl && styles.rtlText]}>
          سيبقى المستخدم مالكاً لبياناته، وإجراءات التصدير أو الحذف تحتاج
          سبرنت صلاحيات معتمد قبل أي تنفيذ حقيقي.
        </Text>
      </View>

      <View style={styles.supportCard}>
        <View style={styles.supportHeaderRow}>
          <View style={styles.supportHeaderCopy}>
            <Text style={[styles.cardTitle, isRtl && styles.rtlText]}>
              المساعدة والدعم
            </Text>
            <Text style={[styles.cardBody, isRtl && styles.rtlText]}>
              مركز مساعدة بصري فقط، بدون رسائل أو تذاكر دعم حقيقية.
            </Text>
          </View>
          <View style={styles.supportIconBubble}>
            <Text style={styles.supportIconText}>?</Text>
          </View>
        </View>
        {helpFaqRows.map((row) => (
          <View key={row} style={styles.faqRow}>
            <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
              {row}
            </Text>
            <Text style={styles.preferenceChevron}>›</Text>
          </View>
        ))}
        <View style={styles.accountActionRow}>
          {accountManagementActions.map((action) => (
            <Pressable
              accessibilityRole="button"
              disabled
              key={action.label}
              style={[
                styles.accountActionButton,
                action.tone === "primary" && styles.accountActionButtonPrimary,
              ]}
            >
              <Text
                style={[
                  styles.accountActionText,
                  action.tone === "primary" && styles.accountActionTextPrimary,
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.integrationCard}>
        <Text style={[styles.integrationTitle, isRtl && styles.rtlText]}>
          {text.integrationBoundary}
        </Text>
        <Text style={[styles.integrationBody, isRtl && styles.rtlText]}>
          {text.integrationBoundaryBody}
        </Text>
        <Text style={[styles.apiText, isRtl && styles.rtlText]}>
          {text.apiBaseUrl}: {API_BASE_URL}
        </Text>
      </View>
    </>
  );
}

type MobileStyles = ReturnType<typeof createStyles>;

const createStyles = (theme: MobileTheme) =>
  StyleSheet.create({
    actionStack: {
      gap: theme.spacing.sm,
      marginTop: 18,
    },
    appScroll: {
      flex: 1,
    },
    accountActionButton: {
      alignItems: "center",
      backgroundColor: theme.colors.muted,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: theme.radii.control,
      flex: 1,
      justifyContent: "center",
      minHeight: 48,
      minWidth: 126,
      opacity: 0.92,
      paddingHorizontal: 12,
      paddingVertical: 14,
    },
    accountActionButtonPrimary: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      opacity: 1,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.22 : 0.1,
      shadowRadius: 14,
    },
    accountActionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 18,
    },
    accountActionText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center",
    },
    accountActionTextPrimary: {
      color: theme.colors.foregroundInverse,
    },
    accountAvatar: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: 26,
      height: 52,
      justifyContent: "center",
      marginBottom: 14,
      width: 52,
    },
    accountAvatarText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiBold,
      fontSize: 24,
    },
    accountHeroCard: {
      backgroundColor: theme.colors.hero,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.xl,
      borderWidth: 1,
      overflow: "hidden",
      padding: 28,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 26, width: 0 },
      shadowOpacity: theme.isDark ? 0.38 : 0.13,
      shadowRadius: 38,
    },
    accountPreferenceDot: {
      backgroundColor: theme.colors.muted,
      borderColor: theme.colors.border,
      borderRadius: 999,
      borderWidth: 1,
      height: 14,
      width: 14,
    },
    accountPreferenceDotActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: theme.isDark ? 0.22 : 0.1,
      shadowRadius: 6,
    },
    accountPreferenceRow: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: mobileRadii.compactCard,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 14,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.16 : 0.05,
      shadowRadius: 16,
    },
    apiText: {
      color: theme.colors.warning,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 12,
      marginTop: 12,
    },
    avatar: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 22,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    avatarText: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiBold,
      fontSize: 18,
    },
    bookingActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
      marginTop: 18,
    },
    bookingReceiptActionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 14,
    },
    bookingHeroAccent: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 999,
      height: 92,
      opacity: 0.85,
      position: "absolute",
      right: -26,
      top: -34,
      width: 92,
    },
    bookingSummaryCard: {
      backgroundColor: theme.colors.hero,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.xl,
      borderWidth: 1,
      overflow: "hidden",
      padding: 28,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 24, width: 0 },
      shadowOpacity: theme.isDark ? 0.36 : 0.12,
      shadowRadius: 36,
    },
    bookingBackButton: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    bookingBackIconImage: {
      height: 22,
      tintColor: theme.colors.deepGold,
      width: 22,
    },
    bookingBottomAction: {
      marginTop: 10,
      paddingBottom: 144,
    },
    bookingDateRail: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
      rowGap: 10,
    },
    bookingLegendRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "center",
      marginTop: -4,
    },
    bookingMiniSummary: {
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.94)"
        : theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 28,
      borderWidth: 1,
      gap: 9,
      padding: 16,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.18 : 0.06,
      shadowRadius: 20,
    },
    bookingOptionList: {
      gap: 12,
    },
    bookingRadio: {
      alignItems: "center",
      borderColor: theme.colors.border,
      borderRadius: 12,
      borderWidth: 2,
      height: 24,
      justifyContent: "center",
      width: 24,
    },
    bookingRadioActive: {
      borderColor: theme.colors.gold,
    },
    bookingRadioDot: {
      backgroundColor: theme.colors.gold,
      borderRadius: 7,
      height: 14,
      width: 14,
    },
    bookingReceiptActions: {
      gap: 12,
      paddingBottom: 148,
    },
    bookingSearchField: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(9, 24, 21, 0.96)"
        : "rgba(255, 253, 248, 0.98)",
      borderColor: theme.colors.goldSoft,
      borderRadius: 30,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 56,
      paddingHorizontal: 18,
    },
    bookingSearchIconImage: {
      height: 22,
      tintColor: theme.colors.mutedForeground,
      width: 22,
    },
    bookingSearchPlaceholder: {
      color: theme.colors.mutedForeground,
      flex: 1,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 14,
      lineHeight: 20,
    },
    bookingStepHeader: {
      alignItems: "flex-start",
      backgroundColor: theme.isDark
        ? "rgba(7, 24, 19, 0.92)"
        : "rgba(255, 253, 248, 0.98)",
      borderColor: theme.colors.goldSoft,
      borderRadius: 28,
      borderWidth: 1,
      flexDirection: "row",
      gap: 14,
      padding: 14,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.24 : 0.08,
      shadowRadius: 22,
    },
    bookingStepScreen: {
      gap: 16,
      paddingBottom: 152,
      paddingHorizontal: 20,
      paddingTop: 30,
    },
    bookingTimeGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    bookingTimeSlot: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(11, 31, 25, 0.9)"
        : theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexGrow: 1,
      minWidth: 78,
      paddingHorizontal: 14,
      paddingVertical: 12,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: theme.isDark ? 0.14 : 0.04,
      shadowRadius: 12,
    },
    bookingTimeSlotActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: theme.isDark ? 0.24 : 0.12,
      shadowRadius: 12,
    },
    bookingTimeSlotBooked: {
      backgroundColor: theme.colors.muted,
      borderColor: theme.colors.border,
      opacity: 0.5,
    },
    bookingTimeSlotLimited: {
      borderColor: theme.colors.warning,
    },
    bookingTimeSlotTextMuted: {
      color: theme.colors.mutedForeground,
    },
    bookingActionButton: {
      alignItems: "center",
      backgroundColor: "rgba(10, 16, 18, 0.82)",
      borderColor: "rgba(170, 176, 179, 0.32)",
      borderRadius: 12,
      borderWidth: 1,
      flex: 1,
      flexDirection: "row-reverse",
      gap: 8,
      justifyContent: "center",
      height: 48,
      minWidth: 0,
      paddingHorizontal: 4,
      paddingVertical: 9,
    },
    bookingActionButtonCompact: {
      flex: 0,
      maxWidth: "100%",
      minWidth: 118,
      paddingHorizontal: 14,
    },
    bookingActionButtonDanger: {
      backgroundColor: "rgba(83, 17, 27, 0.16)",
      borderColor: "#ff5969",
    },
    bookingActionButtonEdit: {
      flexDirection: "row",
    },
    bookingActionButtonPrimary: {
      borderColor: theme.colors.gold,
      backgroundColor: "rgba(202, 151, 58, 0.08)",
    },
    bookingActionButtonText: {
      color: "#d9d9d5",
      fontFamily: mobileTypography.uiMedium,
      flexShrink: 1,
      fontSize: 12.5,
      lineHeight: 18,
      textAlign: "center",
    },
    bookingActionButtonTextDanger: {
      color: "#ff6675",
    },
    bookingActionButtonTextPrimary: {
      color: theme.colors.gold,
    },
    bookingActionGlyphText: {
      color: "#d9d9d5",
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 19,
      lineHeight: 20,
    },
    bookingActionGlyphTextDanger: {
      color: "#ff6675",
    },
    bookingActionGlyphTextPrimary: {
      color: theme.colors.gold,
    },
    bookingArtwork: {
      backgroundColor: "#17140f",
      borderColor: "rgba(220, 171, 75, 0.35)",
      borderRadius: 15,
      borderWidth: 1,
      height: 132,
      overflow: "hidden",
      position: "relative",
      width: "100%",
    },
    bookingArtworkCeiling: {
      flexDirection: "row",
      gap: 12,
      left: 12,
      position: "absolute",
      right: 12,
      top: 10,
    },
    bookingArtworkClinic: {
      backgroundColor: "#24231f",
    },
    bookingArtworkFloor: {
      backgroundColor: "rgba(54, 38, 20, 0.82)",
      bottom: -20,
      height: 60,
      left: -10,
      position: "absolute",
      right: -10,
      transform: [{ skewX: "-12deg" }],
    },
    bookingArtworkGlow: {
      backgroundColor: "rgba(231, 177, 71, 0.16)",
      borderRadius: 70,
      height: 120,
      left: -36,
      position: "absolute",
      top: 17,
      width: 120,
    },
    bookingArtworkGym: {
      backgroundColor: "#111613",
    },
    bookingArtworkBrand: {
      bottom: 35,
      color: "#e8b85e",
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
      left: 8,
      lineHeight: 17,
      position: "absolute",
      right: 8,
      textAlign: "center",
    },
    bookingArtworkLight: {
      backgroundColor: "#f2cb7e",
      borderRadius: 2,
      height: 3,
      opacity: 0.82,
      width: 14,
    },
    bookingArtworkRestaurant: {
      backgroundColor: "#16120d",
    },
    bookingArtworkStatus: {
      backgroundColor: "rgba(10, 94, 57, 0.86)",
      borderColor: "#28d57b",
      borderRadius: 10,
      borderWidth: 1,
      left: 7,
      paddingHorizontal: 8,
      paddingVertical: 4,
      position: "absolute",
      top: 7,
    },
    bookingArtworkStatusCancelled: {
      backgroundColor: "rgba(92, 20, 30, 0.88)",
      borderColor: "#ff5969",
    },
    bookingArtworkStatusPending: {
      backgroundColor: "rgba(66, 46, 12, 0.92)",
      borderColor: theme.colors.gold,
    },
    bookingArtworkStatusText: {
      color: "#d4ffe3",
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 10,
      lineHeight: 14,
    },
    bookingArtworkStatusTextCancelled: {
      color: "#ffadb5",
    },
    bookingArtworkStatusTextPending: {
      color: "#f2c560",
    },
    bookingArtworkWallPanel: {
      backgroundColor: "rgba(121, 88, 40, 0.26)",
      borderColor: "rgba(238, 188, 86, 0.22)",
      borderRadius: 3,
      borderWidth: 1,
      flex: 1,
    },
    bookingArtworkWallPanels: {
      bottom: 28,
      flexDirection: "row",
      gap: 4,
      left: 8,
      position: "absolute",
      right: 8,
      top: 26,
    },
    bookingDetailActions: {
      gap: 12,
      paddingBottom: 148,
    },
    bookingDetailHero: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(7, 24, 19, 0.96)"
        : theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 30,
      borderWidth: 1,
      flexDirection: "row",
      gap: 14,
      overflow: "hidden",
      padding: 16,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 20, width: 0 },
      shadowOpacity: theme.isDark ? 0.34 : 0.12,
      shadowRadius: 30,
    },
    bookingDetailHeroCopy: {
      alignItems: "flex-end",
      flex: 1,
      gap: 8,
      minWidth: 0,
    },
    bookingDetailHeroMedia: {
      borderRadius: 24,
      flexShrink: 0,
      height: 112,
      overflow: "hidden",
      width: 116,
    },
    bookingDetailScreen: {
      gap: 16,
      paddingBottom: 152,
      paddingHorizontal: 20,
      paddingTop: 30,
    },
    bookingDetailSummary: {
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.94)"
        : theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 28,
      borderWidth: 1,
      gap: 9,
      padding: 16,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.2 : 0.06,
      shadowRadius: 20,
    },
    bookingInfoPill: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    bookingInfoPillRtl: {
      flexDirection: "row-reverse",
    },
    bookingInfoPillIcon: {
      height: 13,
      tintColor: theme.colors.gold,
      width: 13,
    },
    bookingInfoPillText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 10,
      lineHeight: 15,
    },
    bookingDetailStatusPill: {
      alignSelf: "flex-end",
      textAlign: "center",
    },
    bookingCardDetails: {
      alignItems: "flex-end",
      direction: "rtl",
      flex: 1,
      minWidth: 0,
      width: "100%",
    },
    bookingCardContentInset: {
      paddingRight: 27,
    },
    bookingCardMediaColumn: {
      alignItems: "stretch",
      flexShrink: 0,
    },
    bookingCardPhysicalRow: {
      alignItems: "stretch",
      direction: "ltr",
      flexDirection: "row",
      gap: 11,
      width: "100%",
    },
    bookingCardPrice: {
      color: "#39d47d",
      fontFamily: mobileTypography.uiBold,
      fontSize: 16,
      lineHeight: 22,
      marginTop: 8,
      textAlign: "left",
      writingDirection: "ltr",
    },
    bookingCardTitleRow: {
      alignItems: "flex-start",
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 5,
      width: "100%",
    },
    bookingDateText: {
      color: "#a9aaae",
      direction: "rtl",
      flex: 1,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      minWidth: 0,
      textAlign: "right",
      writingDirection: "rtl",
    },
    bookingDateTimeRow: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row",
      gap: 7,
      marginTop: 10,
      width: "100%",
    },
    bookingMetadataRow: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 7,
      justifyContent: "flex-start",
      marginTop: 8,
      minHeight: 25,
      width: "100%",
    },
    bookingMetadataText: {
      color: "#c4c4c1",
      direction: "rtl",
      flexShrink: 1,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "right",
      writingDirection: "rtl",
    },
    bookingMetadataTextFull: {
      alignSelf: "stretch",
      direction: "ltr",
      flex: 1,
      textAlign: "right",
      width: "100%",
    },
    bookingOverflowButton: {
      alignItems: "center",
      flexShrink: 0,
      height: 28,
      justifyContent: "center",
      width: 22,
    },
    bookingOverflowText: {
      color: "#f4f2eb",
      fontFamily: mobileTypography.uiBold,
      fontSize: 24,
      lineHeight: 25,
      textAlign: "center",
    },
    bookingSection: {
      gap: 10,
      width: "100%",
    },
    bookingSectionCalendarIcon: {
      height: 18,
      tintColor: theme.colors.gold,
      width: 18,
    },
    bookingSectionCancel: {
      color: "#ff7380",
      fontFamily: mobileTypography.uiBold,
      fontSize: 18,
      lineHeight: 19,
    },
    bookingSectionCards: {
      gap: 12,
    },
    bookingSectionCheck: {
      color: "#07140e",
      fontFamily: mobileTypography.uiBold,
      fontSize: 14,
      lineHeight: 16,
    },
    bookingSectionCount: {
      alignItems: "center",
      backgroundColor: "#f0bb4f",
      borderRadius: 11,
      height: 22,
      justifyContent: "center",
      minWidth: 22,
      paddingHorizontal: 5,
    },
    bookingSectionCountDanger: {
      backgroundColor: "rgba(151, 37, 51, 0.42)",
    },
    bookingSectionCountSuccess: {
      backgroundColor: "rgba(17, 102, 60, 0.66)",
    },
    bookingSectionCountText: {
      color: "#181105",
      fontFamily: mobileTypography.uiBold,
      fontSize: 11,
      lineHeight: 14,
    },
    bookingSectionCountTextDanger: {
      color: "#ff8994",
    },
    bookingSectionCountTextSuccess: {
      color: "#43df88",
    },
    bookingSectionDivider: {
      backgroundColor: "rgba(202, 151, 58, 0.2)",
      flex: 1,
      height: 1,
      marginRight: 12,
    },
    bookingSectionHeader: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row",
      width: "100%",
    },
    bookingSectionHeaderCopy: {
      alignItems: "flex-end",
      flexShrink: 0,
    },
    bookingSectionIcon: {
      alignItems: "center",
      height: 24,
      justifyContent: "center",
      width: 24,
    },
    bookingSectionIconDanger: {
      backgroundColor: "rgba(151, 37, 51, 0.16)",
      borderRadius: 12,
    },
    bookingSectionIconSuccess: {
      backgroundColor: "#35d47d",
      borderRadius: 12,
    },
    bookingSectionSubtitle: {
      color: "#989a9d",
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 2,
      textAlign: "right",
      writingDirection: "rtl",
    },
    bookingSectionTitle: {
      color: "#f3f0e8",
      fontFamily: mobileTypography.kufiBold,
      fontSize: 18,
      lineHeight: 25,
    },
    bookingSectionTitleRow: {
      alignItems: "center",
      flexDirection: "row-reverse",
      gap: 7,
    },
    bookingStaffAvatar: {
      alignItems: "center",
      backgroundColor: "#745239",
      borderColor: "rgba(223, 181, 100, 0.62)",
      borderRadius: 13,
      borderWidth: 1,
      height: 26,
      justifyContent: "center",
      width: 26,
    },
    bookingStaffAvatarText: {
      color: "#f4dfbd",
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 11,
    },
    bookingTimeIcon: {
      height: 13,
      tintColor: theme.colors.gold,
      width: 13,
    },
    bookingTimePill: {
      alignItems: "center",
      backgroundColor: "rgba(19, 23, 23, 0.92)",
      borderColor: "rgba(202, 151, 58, 0.34)",
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: "row-reverse",
      flexShrink: 0,
      gap: 5,
      minHeight: 31,
      paddingHorizontal: 8,
    },
    bookingTimeText: {
      color: "#e7b34e",
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      lineHeight: 17,
      writingDirection: "rtl",
    },
    bookingsEmptyBody: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 13,
      lineHeight: 21,
      maxWidth: 270,
      textAlign: "center",
      writingDirection: "rtl",
    },
    bookingsEmptyIcon: {
      alignItems: "center",
      backgroundColor: "rgba(202, 151, 58, 0.1)",
      borderColor: "rgba(202, 151, 58, 0.38)",
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    bookingsEmptyIconImage: {
      height: 23,
      tintColor: theme.colors.gold,
      width: 23,
    },
    bookingsEmptyState: {
      alignItems: "center",
      backgroundColor: "rgba(10, 19, 18, 0.94)",
      borderColor: "rgba(202, 151, 58, 0.28)",
      borderRadius: 20,
      borderWidth: 1,
      gap: 9,
      justifyContent: "center",
      minHeight: 205,
      padding: 24,
    },
    bookingsEmptyTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 18,
      lineHeight: 25,
      textAlign: "center",
    },
    bookingsHeader: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row",
      justifyContent: "space-between",
      width: "100%",
    },
    bookingsHeaderAction: {
      alignItems: "center",
      backgroundColor: "rgba(9, 15, 15, 0.92)",
      borderColor: "rgba(202, 151, 58, 0.5)",
      borderRadius: 14,
      borderWidth: 1,
      height: 46,
      justifyContent: "center",
      position: "relative",
      width: 46,
    },
    bookingsHeaderActionIcon: {
      height: 22,
      tintColor: "#f4f1e9",
      width: 22,
    },
    bookingsHeaderActionIconGold: {
      height: 23,
      tintColor: theme.colors.gold,
      width: 23,
    },
    bookingsHeaderCopy: {
      alignItems: "center",
      flex: 1,
      paddingHorizontal: 10,
    },
    bookingsHeaderSubtitle: {
      color: "#a5a5a2",
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 1,
      textAlign: "center",
      writingDirection: "rtl",
    },
    bookingsHeaderTitle: {
      color: "#f5f1e8",
      fontFamily: mobileTypography.kufiBold,
      fontSize: 25,
      lineHeight: 32,
      paddingBottom: 1,
      paddingTop: 2,
      textAlign: "center",
      writingDirection: "rtl",
    },
    bookingsList: {
      gap: 18,
      paddingBottom: 170,
    },
    bookingsNotificationBadge: {
      alignItems: "center",
      backgroundColor: "#f2bd4f",
      borderColor: "#17120a",
      borderRadius: 9,
      borderWidth: 1,
      height: 18,
      justifyContent: "center",
      minWidth: 18,
      paddingHorizontal: 3,
      position: "absolute",
      right: -5,
      top: -5,
    },
    bookingsNotificationBadgeText: {
      color: "#171005",
      fontFamily: mobileTypography.uiBold,
      fontSize: 10,
      lineHeight: 13,
    },
    bookingsScreen: {
      gap: 15,
      paddingBottom: 0,
      paddingTop: 8,
      width: "100%",
    },
    bookingsSegment: {
      alignItems: "center",
      borderRadius: 14,
      flex: 1,
      justifyContent: "center",
      minHeight: 43,
      minWidth: 0,
      paddingHorizontal: 4,
      paddingVertical: 8,
    },
    bookingsSegmentActive: {
      backgroundColor: "#e5b657",
      shadowColor: "#c89435",
      shadowOffset: { height: 4, width: 0 },
      shadowOpacity: 0.26,
      shadowRadius: 8,
    },
    bookingsSegmentText: {
      color: "#a9a9a7",
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12.5,
      lineHeight: 18,
      textAlign: "center",
      writingDirection: "rtl",
    },
    bookingsSegmentTextActive: {
      color: "#201608",
      fontFamily: mobileTypography.uiSemiBold,
    },
    bookingsSegmentedTabs: {
      backgroundColor: "rgba(8, 14, 15, 0.94)",
      borderColor: "rgba(202, 151, 58, 0.42)",
      borderRadius: 18,
      borderWidth: 1,
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 2,
      padding: 4,
    },
    cancelBookingButton: {
      alignItems: "center",
      backgroundColor: theme.colors.dangerSoft,
      borderColor: theme.colors.danger,
      borderRadius: theme.radii.control,
      borderWidth: 1,
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    cancelBookingButtonText: {
      color: theme.colors.danger,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 14,
      textAlign: "center",
    },
    managedBookingActions: {
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 10,
      marginTop: 10,
      width: "100%",
    },
    managedBookingCard: {
      backgroundColor: theme.isDark
        ? "rgba(8, 15, 16, 0.98)"
        : theme.colors.cardElevated,
      borderColor: "rgba(202, 151, 58, 0.34)",
      borderRadius: 20,
      borderWidth: 1,
      padding: 11,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.24 : 0.08,
      shadowRadius: 18,
    },
    managedBookingHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
    },
    managedBookingCopy: {
      alignItems: "flex-end",
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    managedBookingInfoGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 7,
    },
    managedBookingInfoGridRtl: {
      flexDirection: "row-reverse",
    },
    managedBookingMedia: {
      borderRadius: 20,
      flexShrink: 0,
      height: 92,
      overflow: "hidden",
      width: 104,
    },
    managedBookingMeta: {
      alignSelf: "stretch",
      color: "#a9aaad",
      direction: "ltr",
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12.5,
      lineHeight: 19,
      marginTop: 5,
      textAlign: "right",
      width: "100%",
      writingDirection: "rtl",
    },
    managedBookingTitle: {
      alignSelf: "stretch",
      color: "#f4f2ec",
      flex: 1,
      flexShrink: 1,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 17,
      lineHeight: 23,
      textAlign: "right",
      width: "100%",
      writingDirection: "ltr",
    },
    managedBookingTitleRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      width: "100%",
    },
    managedStatusPill: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.deepGold,
      flexShrink: 0,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    managedStatusPillCancelled: {
      backgroundColor: theme.colors.dangerSoft,
      borderColor: theme.colors.danger,
      color: theme.colors.danger,
    },
    managedStatusPillSuccess: {
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
      color: theme.colors.success,
    },
    managedStatusPillWarning: {
      backgroundColor: theme.colors.warningSoft,
      borderColor: theme.colors.warning,
      color: theme.colors.warning,
    },
    managementPanel: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 12,
      padding: 18,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: theme.isDark ? 0.3 : 0.1,
      shadowRadius: 28,
    },
    managementPanelActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 4,
    },
    managementPanelActionsRtl: {
      flexDirection: "row-reverse",
    },
    managementPanelBody: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 13,
      lineHeight: 21,
    },
    managementPanelTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 19,
      lineHeight: 26,
    },
    safeManagementIcon: {
      height: 22,
      tintColor: theme.colors.success,
      width: 22,
    },
    safeManagementNote: {
      alignItems: "center",
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 16,
    },
    safeManagementNoteRtl: {
      flexDirection: "row-reverse",
    },
    brandCopy: {
      flex: 1,
      minWidth: 0,
    },
    brandName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiBold,
      fontSize: 15,
      flexShrink: 1,
      letterSpacing: -0.1,
    },
    brandRow: {
      alignItems: "center",
      flexDirection: "row",
      flex: 1,
      gap: 9,
    },
    brandTagline: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 9,
      flexShrink: 1,
      lineHeight: 12,
      marginTop: 1,
    },
    businessBody: {
      gap: 8,
      padding: 12,
      paddingTop: 11,
    },
    businessCard: {
      backgroundColor: theme.isDark
        ? "rgba(7, 24, 19, 0.96)"
        : "rgba(255, 250, 239, 0.98)",
      borderColor: theme.isDark
        ? "rgba(235, 178, 80, 0.36)"
        : "rgba(199, 138, 18, 0.28)",
      borderRadius: 17,
      borderWidth: 1,
      flex: 1,
      overflow: "hidden",
      ...createMobileShadow(theme, {
        darkOpacity: 0.36,
        height: 18,
        lightOpacity: 0.12,
        radius: 24,
      }),
    },
    businessCardPressed: {
      opacity: 0.92,
      transform: [{ translateY: 1 }, { scale: 0.99 }],
    },
    businessCopy: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    businessCta: {
      alignItems: "center",
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      justifyContent: "center",
      marginTop: 3,
      minHeight: 35,
      paddingHorizontal: 10,
    },
    businessCtaText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    businessDetailsDot: {
      color: theme.isDark ? "rgba(255, 248, 236, 0.44)" : "#9a7a39",
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      lineHeight: 18,
    },
    businessDetailsLine: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
    },
    businessDistanceGroup: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
    },
    businessDistanceIcon: {
      height: 12,
      tintColor: theme.colors.gold,
      width: 12,
    },
    businessFooter: {
      alignItems: "flex-start",
      borderTopColor: theme.colors.border,
      borderTopWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      justifyContent: "space-between",
      paddingTop: 10,
    },
    businessMediaBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "#050806",
    },
    businessMediaPhotoShade: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(0, 0, 0, 0.28)",
      borderRadius: 16,
      bottom: 6,
      left: 6,
      right: 6,
      top: 6,
    },
    businessHero: {
      backgroundColor: "#050907",
      borderBottomColor: "rgba(235, 178, 80, 0.2)",
      borderBottomWidth: 1,
      height: 120,
      justifyContent: "space-between",
      overflow: "hidden",
      padding: 12,
      position: "relative",
    },
    businessHeroCompact: {
      backgroundColor: "#050608",
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      height: 104,
      justifyContent: "space-between",
      overflow: "hidden",
      padding: 12,
      position: "relative",
    },
    businessMediaAccent: {
      backgroundColor: "rgba(255, 193, 58, 0.92)",
      borderRadius: 999,
      bottom: 24,
      height: 16,
      left: 80,
      position: "absolute",
      width: 16,
    },
    businessMediaChairBack: {
      backgroundColor: "rgba(12, 17, 15, 0.58)",
      borderColor: "rgba(255, 193, 58, 0.38)",
      borderRadius: 20,
      borderWidth: 1,
      bottom: 28,
      height: 50,
      left: 42,
      position: "absolute",
      width: 52,
    },
    businessMediaChairSeat: {
      backgroundColor: "rgba(255, 193, 58, 0.28)",
      borderRadius: 999,
      bottom: 18,
      height: 14,
      left: 27,
      position: "absolute",
      width: 80,
    },
    businessMediaCutout: {
      borderColor: "rgba(255, 248, 236, 0.18)",
      borderRadius: 999,
      borderWidth: 1,
      bottom: -34,
      height: 94,
      position: "absolute",
      right: -26,
      transform: [{ rotate: "-16deg" }],
      width: 94,
    },
    businessMediaGlow: {
      backgroundColor: "rgba(255, 193, 58, 0.18)",
      borderRadius: 999,
      height: 170,
      left: -44,
      opacity: theme.isDark ? 0.96 : 0.7,
      position: "absolute",
      top: -74,
      width: 170,
    },
    businessMediaWarmGlow: {
      backgroundColor: "rgba(10, 82, 55, 0.28)",
      borderRadius: 999,
      bottom: -58,
      height: 150,
      position: "absolute",
      right: -54,
      width: 150,
    },
    businessMediaLightLine: {
      backgroundColor: "rgba(255, 193, 58, 0.44)",
      borderRadius: 999,
      height: 96,
      width: 3,
    },
    businessMediaLightLineShort: {
      backgroundColor: "rgba(255, 193, 58, 0.3)",
      borderRadius: 999,
      height: 68,
      width: 3,
    },
    businessMediaLightRail: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 27,
      left: 22,
      opacity: 0.9,
      position: "absolute",
      top: 0,
    },
    businessMediaPanel: {
      backgroundColor: "rgba(7, 13, 12, 0.62)",
      borderColor: "rgba(255, 193, 58, 0.18)",
      borderRadius: 18,
      borderWidth: 1,
      bottom: 18,
      height: 56,
      left: 38,
      position: "absolute",
      transform: [{ rotate: "-4deg" }],
      width: 92,
    },
    businessMediaVenueArch: {
      backgroundColor: "rgba(255, 193, 58, 0.07)",
      borderColor: "rgba(255, 193, 58, 0.32)",
      borderRadius: 20,
      borderWidth: 1,
      height: 48,
      width: 34,
    },
    businessMediaVenueArchRow: {
      bottom: 29,
      flexDirection: "row",
      gap: 12,
      position: "absolute",
      right: 14,
    },
    businessMediaVenueArchSmall: {
      backgroundColor: "rgba(255, 193, 58, 0.05)",
      borderColor: "rgba(255, 193, 58, 0.24)",
      borderRadius: 18,
      borderWidth: 1,
      height: 42,
      width: 30,
    },
    businessInitial: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.accent,
      borderRadius: 24,
      borderWidth: 1,
      bottom: 12,
      height: 42,
      justifyContent: "center",
      left: 12,
      position: "absolute",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.34 : 0.12,
      shadowRadius: 16,
      width: 42,
    },
    businessInitialText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiBold,
      fontSize: 19,
    },
    businessList: {
      gap: 18,
    },
    businessMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 11,
      flexShrink: 1,
      lineHeight: 16,
      marginTop: 3,
    },
    businessMetric: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: theme.radii.pill,
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 9,
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    businessMetricsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
    },
    businessName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
      flexShrink: 1,
      letterSpacing: -0.3,
      lineHeight: 19,
    },
    businessStatusBadge: {
      backgroundColor: "rgba(10, 110, 76, 0.78)",
      borderColor: theme.colors.success,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      left: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
      position: "absolute",
      top: 10,
    },
    businessStatusText: {
      color: theme.colors.success,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 9,
    },
    businessTitleRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      justifyContent: "space-between",
    },
    boundaryPill: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    boundaryPillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 14,
    },
    boundaryIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      marginBottom: 12,
      width: 48,
    },
    boundaryIconText: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiBold,
      fontSize: 22,
    },
    cancelAction: {
      color: theme.colors.danger,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
    },
    cardShadow: {
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 22,
    },
    cardBody: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 8,
    },
    cardTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 17,
    },
    categoryBadge: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 10,
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    categoryCard: {
      alignItems: "center",
      backgroundColor: "#d94676",
      borderColor: "transparent",
      borderRadius: 26,
      borderWidth: 0,
      flexBasis: "30%",
      flexGrow: 1,
      gap: 10,
      minHeight: 112,
      paddingHorizontal: 12,
      paddingVertical: 16,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.34 : 0.08,
      shadowRadius: 22,
    },
    categoryCardActive: {
      backgroundColor: "#f59e0b",
      borderColor: "transparent",
      transform: [{ translateY: -1 }],
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: theme.isDark ? 0.36 : 0.12,
      shadowRadius: 24,
    },
    categoryCardBlue: {
      backgroundColor: "#38a9d3",
    },
    categoryCardGreen: {
      backgroundColor: "#24a66f",
    },
    categoryCardPurple: {
      backgroundColor: "#7c3aed",
    },
    categoryCardRose: {
      backgroundColor: "#db4779",
    },
    categoryCount: {
      color: "rgba(255, 255, 255, 0.74)",
      fontFamily: mobileTypography.uiRegular,
      fontSize: 11,
      textAlign: "center",
    },
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginTop: 2,
      rowGap: 12,
    },
    categoryIcon: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 24,
      lineHeight: 28,
    },
    categoryIconImage: {
      height: 39,
      tintColor: theme.colors.gold,
      width: 39,
    },
    categoryIconTile: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "transparent"
        : "rgba(255, 193, 58, 0.08)",
      borderColor: "transparent",
      borderRadius: 16,
      borderWidth: 0,
      height: 50,
      justifyContent: "center",
      width: 50,
    },
    categoryIconTileBlue: {
      backgroundColor: "rgba(255, 193, 58, 0.06)",
    },
    categoryIconTileGold: {
      backgroundColor: "rgba(255, 193, 58, 0.06)",
    },
    categoryIconTileGreen: {
      backgroundColor: "rgba(255, 193, 58, 0.06)",
    },
    categoryIconTileNeutral: {
      backgroundColor: "rgba(255, 193, 58, 0.06)",
    },
    categoryIconTilePurple: {
      backgroundColor: "rgba(255, 193, 58, 0.06)",
    },
    categoryIconTileRose: {
      backgroundColor: "rgba(255, 193, 58, 0.06)",
    },
    categoryItem: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(9, 25, 20, 0.9)"
        : "rgba(255, 253, 248, 0.98)",
      borderColor: theme.isDark
        ? "rgba(235, 178, 80, 0.25)"
        : "rgba(184, 117, 11, 0.24)",
      borderRadius: 14,
      borderWidth: 1,
      flexBasis: "23.4%",
      gap: 6,
      justifyContent: "center",
      minHeight: 112,
      minWidth: 0,
      paddingHorizontal: 5,
      paddingVertical: 13,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.16 : 0.08,
      shadowRadius: 16,
    },
    categoryLabel: {
      color: theme.isDark ? theme.colors.cream : theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    categoryBookLine: {
      backgroundColor: theme.colors.gold,
      borderRadius: 999,
      height: 2,
      opacity: 0.92,
      width: 12,
    },
    categoryBookLineShort: {
      backgroundColor: theme.colors.gold,
      borderRadius: 999,
      height: 2,
      opacity: 0.92,
      width: 9,
    },
    categoryBookMark: {
      flexDirection: "row",
      gap: 3,
    },
    categoryBookPage: {
      backgroundColor: "rgba(255, 193, 58, 0.1)",
      borderColor: theme.colors.gold,
      borderBottomLeftRadius: 4,
      borderTopLeftRadius: 9,
      borderWidth: 1,
      gap: 3,
      height: 30,
      justifyContent: "center",
      paddingHorizontal: 5,
      width: 18,
    },
    categoryBookPageRight: {
      backgroundColor: "rgba(255, 193, 58, 0.1)",
      borderColor: theme.colors.gold,
      borderBottomRightRadius: 4,
      borderTopRightRadius: 9,
      borderWidth: 1,
      height: 30,
      width: 18,
    },
    categoryCarBody: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderColor: theme.colors.gold,
      borderRadius: 6,
      borderWidth: 2,
      flexDirection: "row",
      height: 15,
      justifyContent: "space-between",
      paddingHorizontal: 6,
      width: 38,
    },
    categoryCarLight: {
      backgroundColor: theme.colors.gold,
      borderRadius: 3,
      height: 4,
      width: 4,
    },
    categoryCarMark: {
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 3,
    },
    categoryCarRoof: {
      backgroundColor: "transparent",
      borderColor: theme.colors.gold,
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
      borderWidth: 2,
      height: 12,
      marginBottom: -2,
      width: 27,
    },
    categoryCarWheel: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      borderRadius: 5,
      borderWidth: 1,
      height: 9,
      width: 9,
    },
    categoryCarWheelRow: {
      flexDirection: "row",
      gap: 16,
      marginTop: -2,
    },
    categoryMoreDot: {
      backgroundColor: theme.colors.gold,
      borderRadius: 4,
      height: 8,
      width: 8,
    },
    categoryMoreMark: {
      flexDirection: "row",
      gap: 6,
    },
    categoryRail: {
      flexDirection: "row",
      gap: 10,
    },
    categoryRailCard: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 24,
      borderWidth: 1,
      flex: 1,
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 13,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: theme.isDark ? 0.12 : 0.04,
      shadowRadius: 12,
    },
    categoryRailCardActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      transform: [{ translateY: -1 }],
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.26 : 0.12,
      shadowRadius: 16,
    },
    categoryRailIcon: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 19,
      lineHeight: 22,
    },
    categoryRailIconImage: {
      height: 26,
      tintColor: theme.colors.foreground,
      width: 26,
    },
    categoryRailIconImageActive: {
      tintColor: theme.colors.foregroundInverse,
    },
    categoryRailIconTile: {
      alignItems: "center",
      backgroundColor: theme.colors.muted,
      borderColor: theme.colors.border,
      borderRadius: 16,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    categoryRailIconTileActive: {
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      borderColor: "rgba(255, 255, 255, 0.32)",
    },
    categoryRailCardActiveIcon: {
      color: theme.colors.foregroundInverse,
    },
    categoryRailLabel: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 11,
    },
    categoryRailLabelActive: {
      color: theme.colors.foregroundInverse,
    },
    categoryTopRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      width: "100%",
    },
    centerTabButton: {
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      borderRadius: 30,
      flex: 1,
      height: 66,
      marginHorizontal: 0,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.4 : 0.12,
      shadowRadius: 18,
      transform: [{ translateY: -4 }],
    },
    centerTabButtonActive: {
      backgroundColor: "transparent",
      transform: [{ translateY: -5 }, { scale: 1.02 }],
    },
    centerTabActiveIndicator: {
      backgroundColor: "transparent",
      height: 0,
      marginTop: 0,
      width: 0,
    },
    centerTabIconImage: {
      height: 26,
      tintColor: theme.colors.foregroundInverse,
      width: 26,
    },
    centerTabHalo: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "#d6a34b"
        : "rgba(246, 195, 67, 0.96)",
      borderColor: theme.isDark
        ? "rgba(255, 246, 205, 0.7)"
        : "rgba(184, 117, 11, 0.28)",
      borderRadius: 25,
      borderWidth: 2,
      height: 50,
      justifyContent: "center",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.44 : 0.14,
      shadowRadius: 18,
      width: 50,
    },
    centerTabInner: {
      alignItems: "center",
      backgroundColor: theme.isDark ? "#edb64f" : "#f7c24a",
      borderColor: theme.isDark
        ? "rgba(255, 248, 220, 0.28)"
        : "rgba(255, 253, 248, 0.56)",
      borderRadius: 21,
      borderWidth: 1,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    centerTabLabel: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 9,
      lineHeight: 11,
      marginTop: 1,
      maxWidth: 62,
      textAlign: "center",
    },
    exploreCompassIcon: {
      alignItems: "center",
      borderColor: theme.colors.mutedForeground,
      borderRadius: 10,
      borderWidth: 1.5,
      height: 20,
      justifyContent: "center",
      width: 20,
    },
    exploreCompassIconActive: {
      borderColor: theme.colors.gold,
    },
    exploreCompassNeedle: {
      backgroundColor: theme.colors.mutedForeground,
      borderRadius: 999,
      height: 10,
      transform: [{ rotate: "45deg" }],
      width: 2.5,
    },
    exploreCompassNeedleActive: {
      backgroundColor: theme.colors.gold,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 14,
    },
    confirmationBody: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 10,
      textAlign: "center",
    },
    confirmationCard: {
      alignItems: "center",
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
      borderRadius: theme.radii.xl,
      borderWidth: 1,
      padding: 26,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 20, width: 0 },
      shadowOpacity: theme.isDark ? 0.26 : 0.1,
      shadowRadius: 30,
    },
    confirmationActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "center",
      marginTop: 16,
    },
    confirmationIcon: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 28,
    },
    confirmationIconImage: {
      height: 30,
      tintColor: theme.colors.foregroundInverse,
      width: 30,
    },
    confirmationIconWrap: {
      alignItems: "center",
      backgroundColor: theme.colors.success,
      borderColor: theme.colors.cardElevated,
      borderRadius: 34,
      borderWidth: 3,
      height: 68,
      justifyContent: "center",
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.24 : 0.08,
      shadowRadius: 18,
      width: 68,
    },
    confirmationTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 21,
      lineHeight: 27,
      marginTop: 12,
      textAlign: "center",
    },
    content: {
      gap: 18,
      paddingBottom: 24,
      paddingHorizontal: 20,
    },
    homeContent: {
      gap: 0,
      paddingBottom: 0,
      paddingHorizontal: 0,
    },
    immersiveContent: {
      paddingHorizontal: 0,
      paddingTop: 0,
    },
    dataOwnershipNote: {
      color: theme.colors.success,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 19,
    },
    disabledButton: {
      backgroundColor: theme.colors.disabled,
      borderColor: theme.colors.disabledText,
      opacity: 0.82,
      shadowOpacity: 0,
    },
    disabledButtonText: {
      color: theme.colors.disabledText,
      opacity: 0.92,
    },
    dateDay: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
    },
    dateDayActive: {
      color: theme.colors.foregroundInverse,
    },
    dateLabel: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 23,
      marginTop: 2,
    },
    dateLabelActive: {
      color: theme.colors.foregroundInverse,
    },
    dateMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      marginTop: 3,
    },
    dateMetaActive: {
      color: theme.colors.foregroundInverse,
    },
    datePill: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(11, 31, 25, 0.9)"
        : theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 24,
      borderWidth: 1,
      flexGrow: 1,
      minWidth: 76,
      padding: 11,
      paddingVertical: 13,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: theme.isDark ? 0.1 : 0.04,
      shadowRadius: 12,
    },
    datePillActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      transform: [{ translateY: -1 }],
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: theme.isDark ? 0.28 : 0.14,
      shadowRadius: 12,
    },
    dateStrip: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    detailCard: {
      ...createMobileSurface(theme, {
        radius: theme.radii.xl,
        tone: "elevated",
      }),
      overflow: "hidden",
      ...createMobileShadow(theme, {
        darkOpacity: 0.3,
        height: 18,
        lightOpacity: 0.1,
        radius: 28,
      }),
    },
    detailCtaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      padding: 20,
      paddingTop: 0,
    },
    detailHero: {
      backgroundColor: theme.colors.heroMuted,
      borderBottomColor: theme.colors.goldSoft,
      borderBottomWidth: 1,
      overflow: "hidden",
      padding: 24,
    },
    detailHeroGlow: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 999,
      height: 150,
      opacity: 0.85,
      position: "absolute",
      right: -42,
      top: -52,
      width: 150,
    },
    detailMeta: {
      color: theme.colors.mutedForeground,
      flexShrink: 1,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 7,
    },
    detailServiceCard: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.gold,
      borderRadius: mobileRadii.listCard,
      borderWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      justifyContent: "space-between",
      margin: 20,
      padding: 18,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.22 : 0.08,
      shadowRadius: 22,
    },
    detailServiceMeta: {
      color: theme.colors.mutedForeground,
      flexShrink: 1,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },
    detailServicePrice: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
    },
    detailServiceTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 15,
      flexShrink: 1,
      lineHeight: 20,
    },
    detailStat: {
      backgroundColor: theme.colors.cardElevated,
      borderRadius: theme.radii.pill,
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    detailStatsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 16,
    },
    detailTab: {
      alignItems: "center",
      borderRadius: theme.radii.pill,
      flex: 1,
      paddingVertical: 10,
    },
    detailTabActive: {
      backgroundColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 4, width: 0 },
      shadowOpacity: theme.isDark ? 0.2 : 0.08,
      shadowRadius: 8,
    },
    detailTabText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
    },
    detailTabTextActive: {
      color: theme.colors.foregroundInverse,
    },
    detailTabs: {
      backgroundColor: theme.colors.muted,
      borderRadius: theme.radii.pill,
      flexDirection: "row",
      gap: 4,
      margin: 20,
      padding: 4,
    },
    detailTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 26,
      lineHeight: 32,
      marginTop: 42,
    },
    detailTopRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "space-between",
    },
    discoveryCard: {
      ...createMobileSurface(theme, {
        radius: 34,
        tone: "elevated",
      }),
      borderColor: theme.colors.border,
      gap: 0,
      padding: 0,
      ...createMobileShadow(theme, {
      darkOpacity: 0.34,
      height: 14,
        lightOpacity: 0.12,
        radius: 22,
      }),
    },
    discoveryHeaderRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 14,
      justifyContent: "space-between",
    },
    discoveryLocationButton: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.accent,
      borderRadius: 24,
      borderWidth: 1,
      height: 46,
      justifyContent: "center",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.34 : 0.12,
      shadowRadius: 18,
      width: 46,
    },
    discoveryLocationText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 18,
    },
    discoveryTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 25,
      letterSpacing: -0.4,
      lineHeight: 32,
      marginTop: 7,
    },
    editAction: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
    },
    favoriteButton: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 20,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      position: "absolute",
      right: 12,
      top: 12,
      width: 36,
    },
    favoriteText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 20,
    },
    favoriteIconImage: {
      height: 19,
      tintColor: theme.colors.gold,
      width: 19,
    },
    faqRow: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 14,
    },
    filterButton: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.accent,
      borderRadius: 27,
      borderWidth: 1,
      height: 52,
      justifyContent: "center",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.28 : 0.1,
      shadowRadius: 14,
      width: 52,
    },
    filterChip: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    filterChipSelected: {
      backgroundColor: theme.colors.gold,
      color: theme.colors.foregroundInverse,
    },
    filterChipButton: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 38,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    filterChipButtonSelected: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: theme.isDark ? 0.25 : 0.12,
      shadowRadius: 12,
      transform: [{ translateY: -1 }],
    },
    filterChipText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      textAlign: "center",
    },
    filterChipTextSelected: {
      color: theme.colors.foregroundInverse,
    },
    filterChipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 16,
    },
    filterText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 15,
    },
    filterIconImage: {
      height: 18,
      tintColor: theme.colors.foregroundInverse,
      width: 18,
    },
    ghostButton: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderColor: "#5f6b7a",
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 56,
      paddingVertical: 15,
    },
    ghostButtonText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 14,
    },
    header: {
      alignItems: "center",
      backgroundColor: theme.colors.background,
      flexDirection: "row",
      gap: 8,
      paddingBottom: 10,
      paddingHorizontal: 20,
      paddingTop: 24,
    },
    iconAction: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderRadius: 18,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    iconActionRow: {
      flexDirection: "row",
      gap: 8,
    },
    iconActionText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 17,
    },
    heroActions: {
      gap: 12,
      marginTop: 24,
    },
    heroBody: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 16,
      lineHeight: 24,
      marginTop: 8,
    },
    heroCard: {
      backgroundColor: "transparent",
      marginBottom: 2,
      overflow: "hidden",
      paddingHorizontal: 4,
      paddingTop: 4,
      paddingBottom: 2,
    },
    heroEyebrow: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 15,
      letterSpacing: 0,
      lineHeight: 22,
      marginTop: 2,
    },
    heroGlow: {
      display: "none",
    },
    heroProfileBadge: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(8, 22, 18, 0.94)"
        : "rgba(255, 250, 239, 0.94)",
      borderColor: theme.colors.gold,
      borderRadius: 27,
      borderWidth: 2,
      height: 54,
      justifyContent: "center",
      position: "relative",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.22 : 0.08,
      shadowRadius: 14,
      width: 54,
    },
    heroProfileStatusDot: {
      backgroundColor: theme.colors.success,
      borderColor: theme.colors.background,
      borderRadius: 8,
      borderWidth: 2,
      bottom: 3,
      height: 16,
      position: "absolute",
      right: 1,
      width: 16,
    },
    heroProfileText: {
      color: theme.isDark ? theme.colors.cream : theme.colors.deepGold,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 25,
      lineHeight: 32,
    },
    heroTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 34,
      letterSpacing: -0.6,
      lineHeight: 40,
    },
    heroTopRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
    },
    homeGreetingBlock: {
      alignItems: "flex-end",
      marginTop: 20,
    },
    homeBusinessCardSlot: {
      flexBasis: "31%",
      flexGrow: 1,
      minWidth: 0,
    },
    homeBusinessGrid: {
      flexDirection: "row",
      gap: 10,
    },
    homeBottomSpacer: {
      height: 220,
    },
    homeRecommendationBadge: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 10,
      lineHeight: 15,
      textAlign: "right",
    },
    homeRecommendationCard: {
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.92)"
        : "rgba(255, 253, 248, 0.98)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.24)"
        : "rgba(184, 117, 11, 0.22)",
      borderRadius: 22,
      borderWidth: 1,
      flex: 1,
      minWidth: 0,
      overflow: "hidden",
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.24 : 0.1,
      shadowRadius: 22,
    },
    homeRecommendationCopy: {
      gap: 5,
      padding: 13,
    },
    homeRecommendationGrid: {
      flexDirection: "row",
      gap: 10,
    },
    homeRecommendationMedia: {
      backgroundColor: "#050907",
      borderBottomColor: theme.isDark
        ? "rgba(255, 193, 58, 0.16)"
        : "rgba(184, 117, 11, 0.16)",
      borderBottomWidth: 1,
      height: 92,
      overflow: "hidden",
      position: "relative",
    },
    homeRecommendationMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 11,
      lineHeight: 16,
      textAlign: "right",
    },
    homeRecommendationNote: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      lineHeight: 17,
      marginTop: 2,
      textAlign: "right",
    },
    homeRecommendationPrice: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 3,
      textAlign: "right",
    },
    homeRecommendationRating: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 10,
      lineHeight: 15,
      overflow: "hidden",
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    homeRecommendationTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "right",
    },
    homeRecommendationTopRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    homeSectionAction: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
      lineHeight: 18,
      minWidth: 64,
      textAlign: "left",
    },
    homeSectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 14,
      justifyContent: "space-between",
      paddingHorizontal: 4,
      paddingTop: 2,
    },
    homeSectionTitle: {
      color: theme.colors.foreground,
      flex: 1,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 22,
      letterSpacing: -0.2,
      lineHeight: 30,
      textAlign: "right",
    },
    hiddenText: {
      opacity: 0,
    },
    homeLocaleOption: {
      alignItems: "center",
      borderRadius: 18,
      height: 34,
      justifyContent: "center",
      minWidth: 36,
      paddingHorizontal: 8,
    },
    homeLocaleOptionActive: {
      backgroundColor: "rgba(255, 193, 58, 0.16)",
      borderColor: "rgba(255, 193, 58, 0.46)",
      borderWidth: 1,
    },
    homeLocaleSegment: {
      alignItems: "center",
      backgroundColor: "rgba(5, 13, 12, 0.86)",
      borderColor: "rgba(255, 193, 58, 0.18)",
      borderRadius: 21,
      borderWidth: 1,
      flexDirection: "row",
      gap: 2,
      padding: 3,
    },
    homeLocaleText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 10,
      lineHeight: 14,
    },
    homeLocaleTextActive: {
      color: theme.colors.gold,
    },
    homeThemeOption: {
      alignItems: "center",
      borderRadius: 18,
      height: 34,
      justifyContent: "center",
      minWidth: 48,
      paddingHorizontal: 9,
    },
    homeThemeOptionActive: {
      backgroundColor: theme.isDark
        ? "rgba(255, 193, 58, 0.16)"
        : "rgba(246, 195, 67, 0.28)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.46)"
        : "rgba(184, 117, 11, 0.34)",
      borderWidth: 1,
    },
    homeThemeSegment: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(5, 13, 12, 0.86)"
        : "rgba(255, 250, 239, 0.82)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.18)"
        : "rgba(199, 138, 18, 0.2)",
      borderRadius: 21,
      borderWidth: 1,
      flexDirection: "row",
      gap: 2,
      padding: 3,
    },
    homeThemeText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      lineHeight: 15,
    },
    homeThemeTextActive: {
      color: theme.colors.gold,
    },
    homeLocationBlock: {
      alignItems: "center",
      flexDirection: "row",
      gap: 9,
      minWidth: 112,
    },
    homeLocationChevron: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 18,
      lineHeight: 18,
      marginTop: -4,
    },
    homeLocationCopy: {
      alignItems: "flex-start",
      gap: 2,
    },
    homeLocationMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 11,
      lineHeight: 15,
    },
    homeLocationTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
    },
    homeNotificationButton: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(8, 22, 18, 0.78)"
        : "rgba(255, 250, 239, 0.78)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.12)"
        : "rgba(199, 138, 18, 0.18)",
      borderRadius: 18,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      position: "relative",
      width: 36,
    },
    homeNotificationDot: {
      backgroundColor: theme.colors.gold,
      borderRadius: 4,
      height: 8,
      position: "absolute",
      right: 8,
      top: 8,
      width: 8,
    },
    homeNotificationIcon: {
      height: 20,
      tintColor: theme.colors.foreground,
      width: 20,
    },
    homeReferenceGlow: {
      backgroundColor: theme.isDark
        ? "rgba(8, 91, 58, 0.34)"
        : "rgba(255, 213, 104, 0.22)",
      borderRadius: 180,
      height: 260,
      position: "absolute",
      right: -110,
      top: -85,
      width: 260,
    },
    homeReferenceScreen: {
      gap: 15,
      overflow: "hidden",
      paddingTop: 14,
      position: "relative",
    },
    homeTopControls: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    newReznoCard: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.9)"
        : "rgba(255, 250, 239, 0.88)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.22)"
        : "rgba(199, 138, 18, 0.2)",
      borderRadius: 20,
      borderWidth: 1,
      flex: 1,
      flexDirection: "row-reverse",
      gap: 12,
      minWidth: 160,
      padding: 14,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.18 : 0.06,
      shadowRadius: 18,
    },
    newReznoCopy: {
      alignItems: "flex-end",
      flex: 1,
      minWidth: 0,
    },
    newReznoGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    newReznoIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: 18,
      borderWidth: 1,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    newReznoIconText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiBold,
      fontSize: 16,
      lineHeight: 20,
    },
    newReznoLabel: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      lineHeight: 16,
    },
    newReznoMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 11,
      lineHeight: 17,
      marginTop: 3,
      textAlign: "right",
    },
    newReznoTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 2,
      textAlign: "right",
    },
    integrationBody: {
      color: theme.colors.warning,
      flexShrink: 1,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
    },
    integrationCard: {
      backgroundColor: theme.colors.warningSoft,
      borderColor: theme.colors.warning,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      padding: 20,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.18 : 0.06,
      shadowRadius: 20,
    },
    integrationTitle: {
      color: theme.colors.warning,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 16,
      lineHeight: 22,
    },
    localeButton: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      justifyContent: "center",
      minWidth: 29,
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    localeButtonActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: theme.isDark ? 0.28 : 0.08,
      shadowRadius: 12,
    },
    localeButtonPressed: {
      opacity: 0.84,
      transform: [{ scale: 0.97 }],
    },
    localeButtonText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 8,
      lineHeight: 11,
    },
    localeButtonTextActive: {
      color: theme.colors.foregroundInverse,
    },
    localeRow: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 0,
      gap: 4,
    },
    locationDot: {
      color: theme.colors.success,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 10,
    },
    locationIconImage: {
      height: 30,
      tintColor: theme.colors.gold,
      width: 30,
    },
    locationPill: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderWidth: 1,
      borderRadius: theme.radii.pill,
      flexDirection: "row",
      gap: 7,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    locationText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 16,
      lineHeight: 22,
    },
    logoMark: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.accent,
      borderWidth: 1,
      borderRadius: 17,
      height: 34,
      justifyContent: "center",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: theme.isDark ? 0.26 : 0.1,
      shadowRadius: 10,
      width: 34,
    },
    logoText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiBold,
      fontSize: 18,
    },
    mapHeaderCard: {
      backgroundColor: theme.colors.hero,
      borderColor: theme.colors.border,
      borderRadius: 34,
      borderWidth: 1,
      overflow: "hidden",
      padding: 24,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 22, width: 0 },
      shadowOpacity: theme.isDark ? 0.38 : 0.12,
      shadowRadius: 34,
    },
    mapTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 22,
      lineHeight: 29,
      marginTop: 8,
    },
    chatBubble: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 22,
      borderWidth: 1,
      maxWidth: "82%",
      padding: 12,
    },
    chatBubbleCustomer: {
      alignSelf: "flex-end",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
    },
    chatBubbleText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 14,
      lineHeight: 21,
    },
    chatBubbleTextCustomer: {
      color: theme.colors.foregroundInverse,
    },
    chatBubbleTime: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 10,
      marginTop: 6,
    },
    chatBubbleTimeCustomer: {
      color: theme.colors.foregroundInverse,
      opacity: 0.75,
    },
    chatHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    chatPanel: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 14,
      padding: 20,
    },
    chatTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 20,
      marginTop: 4,
    },
    conversationAvatar: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 22,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    conversationAvatarText: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiBold,
      fontSize: 16,
    },
    conversationPanel: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 14,
      padding: 20,
    },
    conversationRow: {
      alignItems: "flex-start",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 14,
    },
    conversationStatus: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      lineHeight: 15,
      marginTop: 6,
    },
    marketplaceMode: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: theme.radii.pill,
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    marketplaceModeActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      borderWidth: 1,
      borderRadius: theme.radii.pill,
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    marketplaceModeRow: {
      flexDirection: "row",
      gap: 8,
      justifyContent: "flex-start",
      marginBottom: 12,
    },
    messageHeroBody: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 15,
      lineHeight: 23,
      marginTop: 10,
    },
    messageHeroCard: {
      backgroundColor: theme.colors.hero,
      borderColor: theme.isDark ? theme.colors.goldSoft : theme.colors.gold,
      borderRadius: theme.radii.xl,
      borderWidth: 1,
      overflow: "hidden",
      padding: 24,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 20, width: 0 },
      shadowOpacity: theme.isDark ? 0.36 : 0.13,
      shadowRadius: 32,
    },
    messageHeroGlow: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 999,
      height: 150,
      opacity: 0.85,
      position: "absolute",
      right: -48,
      top: -52,
      width: 150,
    },
    messageHeroIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    messageHeroIconText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiBold,
      fontSize: 22,
    },
    messageHeroIconImage: {
      height: 24,
      tintColor: theme.colors.foregroundInverse,
      width: 24,
    },
    messageHeroTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 27,
      lineHeight: 34,
      marginTop: 20,
    },
    messageHeroTopRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    messagePlaceholderChip: {
      backgroundColor: theme.colors.muted,
      borderRadius: theme.radii.pill,
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    messagePlaceholderRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 2,
    },
    messageSafetyBadge: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    myBookingCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      padding: 20,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.2 : 0.07,
      shadowRadius: 22,
    },
    myBookingMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
    },
    myBookingStatus: {
      color: theme.colors.success,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
    },
    myBookingTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 19,
      lineHeight: 25,
      marginTop: 8,
    },
    notificationCard: {
      alignItems: "flex-start",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 14,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.12 : 0.04,
      shadowRadius: 14,
    },
    notificationCardUnread: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
    },
    notificationIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    notificationIconText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiBold,
      fontSize: 16,
    },
    notificationIconImage: {
      height: 20,
      tintColor: theme.colors.foregroundInverse,
      width: 20,
    },
    notificationPanel: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 16,
      padding: 22,
    },
    notificationStatusChip: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      lineHeight: 15,
      marginTop: 8,
      overflow: "hidden",
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    notificationTime: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
    },
    notificationTitleRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "space-between",
    },
    onboardingActions: {
      gap: 12,
      marginTop: 34,
    },
    categoryRailCardBlue: {
      borderColor: "#38a9d3",
    },
    categoryRailCardGreen: {
      borderColor: "#24a66f",
    },
    categoryRailCardPurple: {
      borderColor: "#7c3aed",
    },
    categoryRailCardRose: {
      borderColor: "#db4779",
    },
    onboardingBody: {
      color: "#f4f0e8",
      fontFamily: mobileTypography.uiRegular,
      fontSize: 20,
      lineHeight: 31,
      textAlign: "center",
      writingDirection: "rtl",
    },
    onboardingBrand: {
      color: "#e2b45c",
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 36,
      letterSpacing: 9,
      lineHeight: 44,
      marginTop: 8,
      textAlign: "center",
      writingDirection: "ltr",
    },
    onboardingBrandRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    onboardingCard: {
      backgroundColor: "#05090b",
      borderRadius: 0,
      flexGrow: 1,
      justifyContent: "space-between",
      minHeight: "100%",
      overflow: "hidden",
      paddingBottom: 22,
      paddingHorizontal: 28,
      paddingTop: 44,
    },
    onboardingCardCompact: {
      paddingBottom: 16,
      paddingHorizontal: 20,
      paddingTop: 24,
    },
    onboardingGlow: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 999,
      height: 260,
      opacity: 0.34,
      position: "absolute",
      right: -94,
      top: 130,
      width: 260,
    },
    onboardingHighlight: {
      alignItems: "center",
      backgroundColor: "rgba(12, 16, 19, 0.9)",
      borderColor: "rgba(226, 180, 92, 0.2)",
      borderRadius: 22,
      borderWidth: 1,
      flex: 1,
      gap: 10,
      justifyContent: "center",
      minHeight: 104,
      paddingHorizontal: 8,
      paddingVertical: 12,
    },
    onboardingHighlightIcon: {
      height: 31,
      tintColor: "#d9a64d",
      width: 31,
    },
    onboardingHighlightLabel: {
      color: "#ece7df",
      fontFamily: mobileTypography.uiMedium,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      writingDirection: "rtl",
    },
    onboardingHighlightMotionItem: {
      flex: 1,
    },
    onboardingHighlights: {
      alignSelf: "center",
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 10,
      marginTop: 26,
      width: "100%",
    },
    onboardingLogoGlow: {
      backgroundColor: "rgba(226, 180, 92, 0.04)",
      borderRadius: 80,
      height: 160,
      position: "absolute",
      top: -24,
      width: 160,
    },
    onboardingMotionCentered: {
      alignItems: "center",
      width: "100%",
    },
    onboardingLogoSection: {
      alignItems: "center",
      alignSelf: "center",
      position: "relative",
      width: "100%",
    },
    onboardingLogo: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: "transparent",
      height: 156,
      justifyContent: "center",
      marginTop: 78,
      width: 156,
    },
    onboardingLogoText: {
      color: "#e5b55a",
      fontFamily: mobileTypography.uiBold,
      fontSize: 88,
      lineHeight: 100,
      textAlign: "center",
      textShadowColor: "rgba(229, 181, 90, 0.34)",
      textShadowOffset: { height: 2, width: 0 },
      textShadowRadius: 12,
    },
    onboardingLogoTextCompact: {
      fontSize: 76,
      lineHeight: 86,
    },
    onboardingFooterBrand: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row",
      gap: 9,
      marginTop: 20,
      paddingHorizontal: 4,
    },
    onboardingFooterDot: {
      backgroundColor: "#d8a950",
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    onboardingFooterLine: {
      backgroundColor: "rgba(216, 169, 80, 0.42)",
      flex: 1,
      height: 1,
    },
    onboardingFooterText: {
      color: "#c99238",
      fontFamily: mobileTypography.uiMedium,
      fontSize: 13,
      letterSpacing: 5,
      lineHeight: 18,
      writingDirection: "ltr",
    },
    onboardingPrimary: {
      alignItems: "center",
      backgroundColor: "#d5a044",
      borderColor: "rgba(255, 223, 157, 0.72)",
      borderRadius: 24,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 62,
      overflow: "hidden",
      paddingHorizontal: 58,
      shadowColor: "#d5a044",
      shadowOffset: { height: 5, width: 0 },
      shadowOpacity: 0.22,
      shadowRadius: 12,
    },
    onboardingPrimaryArrow: {
      height: 24,
      position: "absolute",
      right: 24,
      tintColor: "#171106",
      width: 24,
    },
    onboardingPrimaryHighlight: {
      backgroundColor: "rgba(255, 229, 177, 0.3)",
      height: "54%",
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    onboardingPrimaryShade: {
      backgroundColor: "rgba(120, 72, 7, 0.09)",
      bottom: 0,
      height: "46%",
      left: 0,
      position: "absolute",
      right: 0,
    },
    onboardingPrimaryText: {
      color: "#171106",
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 20,
      lineHeight: 28,
      textAlign: "center",
      writingDirection: "rtl",
    },
    onboardingSecondary: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderColor: "rgba(226, 180, 92, 0.82)",
      borderRadius: 24,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 58,
      paddingVertical: 14,
    },
    onboardingSecondaryText: {
      color: "#e7b760",
      fontFamily: mobileTypography.uiMedium,
      fontSize: 19,
      lineHeight: 26,
      writingDirection: "rtl",
    },
    onboardingSafeArea: {
      backgroundColor: "#05090b",
    },
    onboardingScroll: {
      backgroundColor: "#05090b",
      flex: 1,
    },
    onboardingScreen: {
      backgroundColor: "#05090b",
      flex: 1,
      paddingHorizontal: 0,
    },
    onboardingSlogan: {
      color: "#d9a64d",
      fontFamily: mobileTypography.uiRegular,
      fontSize: 18,
      letterSpacing: 3.2,
      lineHeight: 24,
      textAlign: "center",
      writingDirection: "ltr",
    },
    onboardingSloganLine: {
      backgroundColor: "rgba(217, 166, 77, 0.7)",
      height: 1,
      width: 34,
    },
    onboardingSloganRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "center",
      marginTop: 4,
    },
    onboardingValueSection: {
      alignItems: "center",
      marginTop: 34,
      width: "100%",
    },
    onboardingPattern: {
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    onboardingArc: {
      borderColor: "rgba(218, 166, 74, 0.18)",
      borderRadius: 500,
      borderWidth: 1,
      position: "absolute",
    },
    onboardingArcPrimary: {
      height: 680,
      left: -470,
      top: 110,
      transform: [{ rotate: "-18deg" }],
      width: 760,
    },
    onboardingArcSecondary: {
      height: 720,
      right: -540,
      top: -260,
      transform: [{ rotate: "18deg" }],
      width: 820,
    },
    onboardingArcTertiary: {
      bottom: -500,
      height: 700,
      right: -310,
      transform: [{ rotate: "-24deg" }],
      width: 760,
    },
    onboardingAmbientGlow: {
      backgroundColor: "rgba(225, 178, 89, 0.035)",
      borderRadius: 210,
      height: 420,
      left: -120,
      position: "absolute",
      top: 120,
      width: 420,
    },
    onboardingPatternLine: {
      backgroundColor: "rgba(255, 193, 58, 0.22)",
      borderRadius: 999,
      height: "100%",
      position: "absolute",
      top: 0,
      width: 3,
    },
    onboardingPatternLineEnd: {
      right: "18%",
    },
    onboardingPatternLineStart: {
      left: "18%",
    },
    onboardingPatternLineTall: {
      backgroundColor: "rgba(255, 193, 58, 0.28)",
      borderRadius: 999,
      height: "100%",
      left: "52%",
      position: "absolute",
      top: 0,
      width: 3,
    },
    onboardingTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 30,
      lineHeight: 37,
      marginTop: 24,
    },
    ownerActionText: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 11,
      overflow: "hidden",
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    ownerBarFill: {
      alignSelf: "stretch",
      backgroundColor: theme.colors.gold,
      borderRadius: 999,
      minHeight: 18,
    },
    ownerBarsRow: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 8,
      height: 96,
      marginTop: 18,
    },
    ownerBarTrack: {
      backgroundColor: theme.colors.muted,
      borderRadius: 999,
      flex: 1,
      justifyContent: "flex-end",
      overflow: "hidden",
    },
    ownerBookingActions: {
      alignItems: "flex-end",
      gap: 5,
    },
    ownerBookingRow: {
      alignItems: "flex-start",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 24,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 16,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.14 : 0.04,
      shadowRadius: 14,
    },
    ownerBusinessMeta: {
      color: theme.colors.mutedForeground,
      flexShrink: 1,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 4,
    },
    ownerBusinessName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 21,
      flexShrink: 1,
      lineHeight: 27,
      marginTop: 4,
    },
    ownerCustomerAvatar: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 21,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    ownerCustomerInitial: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiBold,
      fontSize: 16,
    },
    ownerHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    ownerHeroBody: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 16,
    },
    ownerHeroCard: {
      backgroundColor: theme.colors.hero,
      borderColor: theme.isDark ? theme.colors.goldSoft : theme.colors.gold,
      borderRadius: theme.radii.xl,
      borderWidth: 1,
      overflow: "hidden",
      padding: 26,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 24, width: 0 },
      shadowOpacity: theme.isDark ? 0.4 : 0.14,
      shadowRadius: 36,
    },
    ownerHeroGlow: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 999,
      height: 150,
      opacity: 0.85,
      position: "absolute",
      right: -46,
      top: -54,
      width: 150,
    },
    ownerInsightsCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      padding: 20,
    },
    ownerInsightsHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    ownerInsightsTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 20,
      marginTop: 4,
    },
    ownerLogo: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    ownerLogoText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiBold,
      fontSize: 22,
    },
    ownerMetricRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    ownerMetricValue: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
    },
    ownerMutedActionText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 11,
    },
    ownerOverviewCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 22,
      borderWidth: 1,
      flexBasis: "47%",
      flexGrow: 1,
      padding: 16,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.16 : 0.05,
      shadowRadius: 16,
    },
    ownerOverviewDetail: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 11,
      marginTop: 6,
    },
    ownerOverviewGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    ownerOverviewLabel: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 13,
      marginTop: 6,
    },
    ownerOverviewValue: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiBold,
      fontSize: 26,
    },
    ownerPanelCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 14,
      padding: 20,
    },
    ownerProgressFill: {
      backgroundColor: theme.colors.gold,
      borderRadius: 999,
      height: 8,
    },
    ownerProgressTrack: {
      backgroundColor: theme.colors.muted,
      borderRadius: 999,
      height: 8,
      marginTop: 8,
      overflow: "hidden",
    },
    ownerQuickAction: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 22,
      borderWidth: 1,
      flexBasis: "47%",
      flexGrow: 1,
      gap: 8,
      padding: 16,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.12 : 0.04,
      shadowRadius: 14,
    },
    ownerQuickActionsCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 16,
      padding: 20,
    },
    ownerQuickGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    ownerQuickIcon: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 22,
    },
    ownerQuickText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 12,
      textAlign: "center",
    },
    ownerSafetyCard: {
      backgroundColor: theme.colors.warningSoft,
      borderColor: theme.colors.warning,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      padding: 20,
    },
    ownerStaffRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    ownerStatusChip: {
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.success,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      overflow: "hidden",
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    ownerTwoColumn: {
      gap: 14,
    },
    ownerVerifiedBadge: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    paymentBody: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
    },
    paymentCard: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      padding: 22,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.22 : 0.1,
      shadowRadius: 22,
    },
    paymentHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    paymentIconImage: {
      height: 20,
      tintColor: theme.colors.gold,
      width: 20,
    },
    paymentTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 18,
      marginTop: 6,
    },
    policyCard: {
      backgroundColor: theme.colors.warningSoft,
      borderColor: theme.colors.warning,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      padding: 18,
    },
    priceText: {
      color: theme.colors.deepGold,
      flexShrink: 1,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
    },
    privacyCard: {
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
      borderRadius: 24,
      borderWidth: 1,
      gap: 14,
      padding: 18,
    },
    privacyGrid: {
      gap: 10,
      marginTop: 4,
    },
    privacyMiniCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: 18,
      borderWidth: 1,
      padding: 14,
    },
    preferenceKnob: {
      backgroundColor: theme.colors.mutedForeground,
      borderRadius: 999,
      height: 18,
      width: 18,
    },
    preferenceKnobActive: {
      alignSelf: "flex-end",
      backgroundColor: theme.colors.foregroundInverse,
    },
    preferenceNote: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 19,
      marginTop: 6,
    },
    preferenceChevron: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 20,
    },
    preferenceCopy: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    preferenceGroupTitle: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
    },
    preferencesGroup: {
      gap: 10,
      marginTop: 16,
    },
    preferenceRow: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      padding: 14,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 7, width: 0 },
      shadowOpacity: theme.isDark ? 0.12 : 0.04,
      shadowRadius: 12,
    },
    preferencesPanel: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 16,
      padding: 22,
    },
    preferenceToggle: {
      backgroundColor: theme.colors.muted,
      borderRadius: 999,
      justifyContent: "center",
      padding: 3,
      width: 44,
    },
    preferenceToggleActive: {
      backgroundColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 4, width: 0 },
      shadowOpacity: theme.isDark ? 0.2 : 0.08,
      shadowRadius: 8,
    },
    profileHeroTopRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      marginBottom: 14,
    },
    profileMembershipText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      marginTop: 6,
    },
    profileStatCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 20,
      borderWidth: 1,
      flex: 1,
      padding: 14,
    },
    profileStatLabel: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      marginTop: 4,
    },
    profileStatMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 10,
      marginTop: 3,
    },
    profileStatsGrid: {
      flexDirection: "row",
      gap: 8,
      marginTop: 18,
    },
    profileStatValue: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 18,
    },
    profileStatusStack: {
      alignItems: "flex-end",
      flex: 1,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.accent,
      borderTopColor: theme.colors.accent,
      borderWidth: 1,
      borderRadius: theme.radii.pill,
      flex: 1,
      minHeight: 58,
      justifyContent: "center",
      paddingVertical: 16,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.5 : 0.18,
      shadowRadius: 24,
    },
    primaryButtonPressed: {
      opacity: 0.9,
      shadowOpacity: theme.isDark ? 0.28 : 0.12,
      transform: [{ translateY: 1 }, { scale: 0.985 }],
    },
    primaryButtonText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 18,
    },
    promoBadge: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(255, 193, 58, 0.13)"
        : "rgba(255, 246, 219, 0.96)",
      borderColor: theme.isDark
        ? "rgba(255, 221, 135, 0.68)"
        : "rgba(184, 117, 11, 0.34)",
      borderRadius: 44,
      borderWidth: 1,
      height: 88,
      justifyContent: "center",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.28 : 0.1,
      shadowRadius: 18,
      width: 88,
    },
    promoBadgeText: {
      color: theme.colors.foregroundInverse,
    },
    promoBody: {
      color: theme.isDark ? theme.colors.foreground : "#30281d",
      fontFamily: mobileTypography.uiRegular,
      fontSize: 15,
      lineHeight: 23,
      marginTop: 4,
      maxWidth: 230,
    },
    promoCard: {
      alignItems: "center",
      backgroundColor: theme.isDark ? "#06281f" : "#fff6de",
      borderColor: theme.isDark
        ? "rgba(55, 122, 90, 0.72)"
        : "rgba(184, 117, 11, 0.28)",
      borderRadius: 21,
      borderWidth: 1,
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      minHeight: 130,
      overflow: "hidden",
      paddingHorizontal: 24,
      paddingVertical: 18,
      position: "relative",
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 20, width: 0 },
      shadowOpacity: theme.isDark ? 0.34 : 0.14,
      shadowRadius: 30,
    },
    promoTitle: {
      color: theme.isDark ? theme.colors.gold : theme.colors.deepGold,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 30,
      lineHeight: 36,
    },
    promoCopy: {
      alignItems: "flex-end",
      flex: 1,
      minWidth: 0,
    },
    promoGlow: {
      backgroundColor: theme.isDark
        ? "rgba(18, 142, 88, 0.38)"
        : "rgba(18, 142, 88, 0.12)",
      borderRadius: 140,
      height: 210,
      position: "absolute",
      left: -76,
      top: -72,
      width: 210,
    },
    promoGoldGlow: {
      backgroundColor: theme.isDark
        ? "rgba(255, 193, 58, 0.18)"
        : "rgba(246, 195, 67, 0.26)",
      borderRadius: 120,
      height: 154,
      position: "absolute",
      right: -22,
      top: -16,
      width: 154,
    },
    promoPatternLine: {
      backgroundColor: theme.isDark
        ? "rgba(255, 255, 255, 0.05)"
        : "rgba(184, 117, 11, 0.08)",
      height: 1,
      position: "absolute",
      right: 42,
      top: 26,
      transform: [{ rotate: "-36deg" }],
      width: 190,
    },
    promoPatternLineAlt: {
      backgroundColor: theme.isDark
        ? "rgba(255, 193, 58, 0.09)"
        : "rgba(18, 142, 88, 0.08)",
      height: 1,
      position: "absolute",
      right: 22,
      top: 76,
      transform: [{ rotate: "-36deg" }],
      width: 170,
    },
    promoTicket: {
      alignItems: "center",
      backgroundColor: "#f6c35a",
      borderRadius: 13,
      height: 42,
      justifyContent: "center",
      position: "relative",
      transform: [{ rotate: "-12deg" }],
      width: 58,
    },
    promoTicketCutLeft: {
      backgroundColor: theme.isDark ? "#08281f" : "#fff6de",
      borderRadius: 8,
      height: 14,
      left: -7,
      position: "absolute",
      width: 14,
    },
    promoTicketCutRight: {
      backgroundColor: theme.isDark ? "#08281f" : "#fff6de",
      borderRadius: 8,
      height: 14,
      position: "absolute",
      right: -7,
      width: 14,
    },
    promoTicketText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiBold,
      fontSize: 22,
      lineHeight: 28,
    },
    promoCoupon: {
      alignSelf: "flex-end",
      backgroundColor: theme.isDark ? theme.colors.cream : "#ffffff",
      borderColor: theme.isDark ? "transparent" : "rgba(184, 117, 11, 0.16)",
      borderWidth: 1,
      borderRadius: theme.radii.pill,
      marginTop: 16,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    promoCouponText: {
      color: theme.isDark ? theme.colors.foregroundInverse : theme.colors.foreground,
      fontFamily: mobileTypography.uiBold,
      fontSize: 13,
    },
    promoGiftBox: {
      backgroundColor: theme.colors.cream,
      borderColor: theme.colors.gold,
      borderRadius: 10,
      borderWidth: 1,
      height: 34,
      overflow: "hidden",
      position: "relative",
      transform: [{ rotate: "-8deg" }],
      width: 38,
    },
    promoGiftRibbonHorizontal: {
      backgroundColor: theme.colors.gold,
      height: 8,
      left: 0,
      position: "absolute",
      right: 0,
      top: 10,
    },
    promoGiftRibbonVertical: {
      backgroundColor: theme.colors.gold,
      bottom: 0,
      left: 15,
      position: "absolute",
      top: 0,
      width: 8,
    },
    quickReplyChip: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    quickReplyRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 4,
    },
    recommendedCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 14,
      padding: 18,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.14 : 0.05,
      shadowRadius: 18,
    },
    recommendedIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    recommendedIconText: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 16,
    },
    recommendedItem: {
      alignItems: "flex-start",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 14,
    },
    recommendedList: {
      gap: 10,
    },
    receiptAction: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 7,
      textAlign: "center",
    },
    receiptCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 14,
      padding: 20,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: theme.isDark ? 0.26 : 0.09,
      shadowRadius: 26,
    },
    receiptHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      justifyContent: "space-between",
    },
    receiptLine: {
      borderColor: theme.colors.goldSoft,
      borderStyle: "dashed",
      borderTopWidth: 1,
      marginVertical: 4,
    },
    receiptStatus: {
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.success,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    receiptTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 24,
      letterSpacing: 0.3,
      marginTop: 4,
    },
    quickBookingActionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 20,
    },
    quickBookingBody: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 15,
      lineHeight: 23,
      marginTop: 9,
    },
    quickBookingGlow: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 999,
      height: 150,
      opacity: theme.isDark ? 0.9 : 0.55,
      position: "absolute",
      right: -46,
      top: -60,
      width: 150,
    },
    quickBookingHero: {
      backgroundColor: theme.isDark
        ? "rgba(7, 24, 19, 0.96)"
        : theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.xl,
      borderWidth: 1,
      overflow: "hidden",
      padding: 24,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 20, width: 0 },
      shadowOpacity: theme.isDark ? 0.34 : 0.1,
      shadowRadius: 32,
    },
    quickBookingTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 26,
      letterSpacing: -0.4,
      lineHeight: 33,
      marginTop: 8,
    },
    ratingPill: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    ratingIconImage: {
      height: 13,
      tintColor: theme.colors.deepGold,
      width: 13,
    },
    ratingText: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 12,
    },
    rowCard: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 15,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.12 : 0.04,
      shadowRadius: 14,
    },
    rowCardSelected: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.24 : 0.11,
      shadowRadius: 18,
      transform: [{ translateY: -1 }],
    },
    rowCopy: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    rowIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    rowIconText: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 18,
    },
    rowMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 13,
      flexShrink: 1,
      lineHeight: 19,
      marginTop: 4,
    },
    rowPrice: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
    },
    rowTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 15,
      flexShrink: 1,
      lineHeight: 20,
    },
    rtlText: {
      textAlign: "right",
      writingDirection: "rtl",
    },
    screenCard: {
      ...createMobileSurface(theme, { radius: theme.radii.xl }),
      padding: 20,
      ...createMobileShadow(theme, {
        darkOpacity: 0.3,
        height: 16,
        lightOpacity: 0.08,
        radius: 26,
      }),
    },
    selectedServiceCard: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      padding: 18,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.22 : 0.08,
      shadowRadius: 22,
      transform: [{ translateY: -1 }],
    },
    selectedServiceIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: 22,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    selectedServiceIconText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 18,
    },
    selectedServiceIconImage: {
      height: 24,
      tintColor: theme.colors.foregroundInverse,
      width: 24,
    },
    selectedServiceMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      marginTop: 4,
    },
    selectedServiceTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 16,
    },
    serviceCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 22,
      borderWidth: 1,
      flexGrow: 1,
      gap: 12,
      minWidth: 120,
      padding: 16,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.14 : 0.05,
      shadowRadius: 16,
    },
    serviceCardActive: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
    },
    serviceGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    serviceMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },
    serviceName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 15,
      lineHeight: 21,
    },
    servicePrice: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
    },
    safeActionText: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 10,
    },
    screenDescription: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      flexShrink: 1,
      fontSize: 15,
      lineHeight: 23,
      marginTop: 8,
    },
    screenEyebrow: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiMedium,
      flexShrink: 1,
      fontSize: 12,
      letterSpacing: 0.2,
      lineHeight: 16,
    },
    screenTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      flexShrink: 1,
      fontSize: 29,
      letterSpacing: -0.3,
      lineHeight: 37,
      marginTop: 8,
    },
    iconButtonPressed: {
      opacity: 0.86,
      transform: [{ translateY: 1 }, { scale: 0.97 }],
    },
    salonActionGrid: {
      flexDirection: "row-reverse",
      gap: 14,
      justifyContent: "space-between",
      marginTop: 14,
    },
    salonActionIcon: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 26,
      lineHeight: 30,
    },
    salonActionIconImage: {
      height: 29,
      tintColor: theme.colors.gold,
      width: 29,
    },
    salonActionLabel: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 10,
    },
    salonActionTile: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(11, 31, 25, 0.82)"
        : "rgba(255, 254, 248, 0.92)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.54)"
        : "rgba(196, 137, 32, 0.44)",
      borderRadius: 24,
      borderWidth: 1,
      elevation: theme.isDark ? 3 : 2,
      flex: 1,
      justifyContent: "center",
      minHeight: 104,
      paddingHorizontal: 10,
      paddingVertical: 16,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.18 : 0.08,
      shadowRadius: 18,
    },
    salonBackButton: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(5, 12, 10, 0.68)"
        : "rgba(255, 253, 247, 0.9)",
      borderColor: theme.colors.gold,
      borderRadius: 34,
      borderWidth: 1,
      height: 68,
      justifyContent: "center",
      position: "absolute",
      right: 30,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.28 : 0.12,
      shadowRadius: 18,
      top: 66,
      width: 68,
      zIndex: 2,
    },
    salonBackIcon: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 43,
      lineHeight: 45,
      marginTop: -4,
    },
    salonBackIconImage: {
      height: 28,
      tintColor: theme.isDark ? theme.colors.gold : theme.colors.foreground,
      width: 28,
    },
    salonDetailScreen: {
      backgroundColor: theme.isDark ? "#020805" : "#fff8ea",
      paddingBottom: 0,
      position: "relative",
    },
    salonBottomCta: {
      marginTop: 20,
      paddingBottom: 4,
    },
    salonBottomSpacer: {
      height: 150,
    },
    salonCtaArrow: {
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.7)",
      borderRadius: 25,
      height: 50,
      justifyContent: "center",
      width: 50,
    },
    salonCtaArrowText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 34,
      lineHeight: 36,
      marginTop: -5,
    },
    salonHero: {
      backgroundColor: theme.isDark ? "#020806" : "#fff7e8",
      height: 392,
      marginHorizontal: 0,
      overflow: "hidden",
      position: "relative",
    },
    salonHeroActions: {
      flexDirection: "row",
      gap: 14,
      left: 30,
      position: "absolute",
      top: 66,
      zIndex: 2,
    },
    salonHeroCaption: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
      maxWidth: 230,
      textAlign: "center",
    },
    salonHeroCenterpiece: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: theme.isDark
        ? "rgba(5, 14, 11, 0.72)"
        : "rgba(255, 253, 248, 0.72)",
      borderColor: theme.colors.goldSoft,
      borderRadius: 30,
      borderWidth: 1,
      gap: 3,
      marginTop: 92,
      paddingHorizontal: 24,
      paddingVertical: 18,
      zIndex: 1,
    },
    salonHeroKicker: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 19,
      lineHeight: 27,
      marginTop: 8,
      textAlign: "center",
    },
    salonHeroLine: {
      backgroundColor: "rgba(255, 193, 58, 0.32)",
      borderRadius: 999,
      height: 82,
      width: 4,
    },
    salonHeroLineTall: {
      backgroundColor: "rgba(255, 193, 58, 0.22)",
      borderRadius: 999,
      height: 210,
      width: 5,
    },
    salonHeroOrb: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: 28,
      borderWidth: 1,
      height: 56,
      justifyContent: "center",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.26 : 0.1,
      shadowRadius: 18,
      width: 56,
    },
    salonHeroOrbText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiBold,
      fontSize: 28,
      lineHeight: 34,
    },
    salonHeroPattern: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 86,
      justifyContent: "center",
      left: 0,
      opacity: theme.isDark ? 0.7 : 0.42,
      position: "absolute",
      right: 0,
      top: 0,
      zIndex: 2,
    },
    salonHeroChairOne: {
      backgroundColor: theme.isDark
        ? "rgba(6, 9, 8, 0.82)"
        : "rgba(44, 39, 34, 0.38)",
      borderColor: "rgba(255, 193, 58, 0.36)",
      borderRadius: 28,
      borderWidth: 1,
      bottom: 44,
      height: 72,
      position: "absolute",
      right: 110,
      transform: [{ rotate: "-3deg" }],
      width: 82,
    },
    salonHeroChairTwo: {
      backgroundColor: theme.isDark
        ? "rgba(6, 9, 8, 0.72)"
        : "rgba(44, 39, 34, 0.3)",
      borderColor: "rgba(255, 193, 58, 0.28)",
      borderRadius: 26,
      borderWidth: 1,
      bottom: 38,
      height: 62,
      position: "absolute",
      right: 212,
      transform: [{ rotate: "4deg" }],
      width: 74,
    },
    salonHeroChairThree: {
      backgroundColor: theme.isDark
        ? "rgba(8, 12, 10, 0.66)"
        : "rgba(50, 43, 36, 0.24)",
      borderColor: "rgba(255, 193, 58, 0.24)",
      borderRadius: 22,
      borderWidth: 1,
      bottom: 50,
      height: 54,
      left: 54,
      position: "absolute",
      transform: [{ rotate: "5deg" }],
      width: 66,
    },
    salonHeroBottleShelf: {
      alignItems: "flex-end",
      bottom: 104,
      flexDirection: "row",
      gap: 9,
      left: 26,
      position: "absolute",
    },
    salonHeroBottleSmall: {
      backgroundColor: "rgba(255, 193, 58, 0.54)",
      borderRadius: 5,
      height: 30,
      width: 9,
    },
    salonHeroBottleTall: {
      backgroundColor: "rgba(255, 193, 58, 0.66)",
      borderRadius: 6,
      height: 46,
      width: 11,
    },
    salonHeroCounter: {
      backgroundColor: theme.isDark
        ? "rgba(15, 8, 4, 0.72)"
        : "rgba(255, 245, 224, 0.72)",
      borderTopColor: "rgba(255, 193, 58, 0.36)",
      borderTopWidth: 1,
      bottom: 0,
      height: 86,
      left: 0,
      position: "absolute",
      right: 0,
    },
    salonHeroGoldStrip: {
      backgroundColor: "rgba(255, 193, 58, 0.5)",
      borderRadius: 999,
      height: 146,
      opacity: theme.isDark ? 0.62 : 0.42,
      position: "absolute",
      top: 74,
      width: 3,
    },
    salonHeroGoldStripOne: {
      left: 156,
    },
    salonHeroGoldStripTwo: {
      right: 90,
    },
    salonHeroLampOne: {
      backgroundColor: theme.colors.gold,
      borderRadius: 999,
      height: 12,
      left: 92,
      position: "absolute",
      top: 118,
      width: 12,
    },
    salonHeroLampTwo: {
      backgroundColor: theme.colors.gold,
      borderRadius: 999,
      height: 10,
      position: "absolute",
      right: 168,
      top: 96,
      width: 10,
    },
    salonHeroMirrorLarge: {
      backgroundColor: theme.isDark
        ? "rgba(255, 193, 58, 0.06)"
        : "rgba(255, 255, 255, 0.5)",
      borderColor: "rgba(255, 193, 58, 0.5)",
      borderRadius: 26,
      borderWidth: 1,
      height: 156,
      width: 88,
    },
    salonHeroMirrorRail: {
      bottom: 86,
      flexDirection: "row-reverse",
      gap: 28,
      position: "absolute",
      right: 32,
    },
    salonHeroMirrorSmall: {
      backgroundColor: theme.isDark
        ? "rgba(255, 193, 58, 0.05)"
        : "rgba(255, 255, 255, 0.42)",
      borderColor: "rgba(255, 193, 58, 0.34)",
      borderRadius: 22,
      borderWidth: 1,
      height: 128,
      width: 74,
    },
    salonHeroOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: theme.isDark
        ? "rgba(0, 8, 6, 0.18)"
        : "rgba(255, 250, 239, 0.16)",
      zIndex: 1,
    },
    salonHeroPhotoBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: theme.isDark ? "#060806" : "#fff3dc",
    },
    salonHeroPhotoGlow: {
      backgroundColor: theme.isDark
        ? "rgba(255, 193, 58, 0.18)"
        : "rgba(255, 193, 58, 0.22)",
      borderRadius: 999,
      height: 280,
      position: "absolute",
      right: -54,
      top: -64,
      width: 280,
    },
    salonHeroWallPanel: {
      backgroundColor: theme.isDark
        ? "rgba(255, 193, 58, 0.045)"
        : "rgba(255, 255, 255, 0.36)",
      borderColor: "rgba(255, 193, 58, 0.18)",
      borderRadius: 38,
      borderWidth: 1,
      height: 206,
      left: 22,
      position: "absolute",
      right: 22,
      top: 86,
    },
    salonHeroStage: {
      ...StyleSheet.absoluteFill,
      backgroundColor: theme.isDark ? "#050b08" : "#fff8ea",
      overflow: "hidden",
    },
    salonFrameCorner: {
      borderColor: theme.colors.gold,
      borderRadius: 24,
      borderWidth: 1,
      height: 86,
      opacity: theme.isDark ? 0.36 : 0.28,
      position: "absolute",
      width: 86,
      zIndex: 2,
    },
    salonFrameCornerCardLeft: {
      borderRightWidth: 0,
      bottom: 26,
      left: -40,
      opacity: theme.isDark ? 0.28 : 0.22,
    },
    salonFrameCornerCardRight: {
      borderLeftWidth: 0,
      bottom: 26,
      opacity: theme.isDark ? 0.28 : 0.22,
      right: -40,
    },
    salonFrameCornerTopLeft: {
      borderBottomWidth: 0,
      borderRightWidth: 0,
      left: -22,
      top: 18,
    },
    salonFrameCornerTopRight: {
      borderBottomWidth: 0,
      borderLeftWidth: 0,
      right: -22,
      top: 18,
    },
    salonInfoCard: {
      backgroundColor: theme.isDark
        ? "rgba(3, 14, 10, 0.96)"
        : "rgba(255, 253, 247, 0.96)",
      borderColor: theme.colors.goldSoft,
      borderTopLeftRadius: 48,
      borderTopRightRadius: 48,
      borderWidth: 1,
      gap: 0,
      marginHorizontal: 20,
      marginTop: -76,
      overflow: "hidden",
      paddingBottom: 26,
      paddingHorizontal: 22,
      paddingTop: 30,
      position: "relative",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: theme.isDark ? 0.26 : 0.13,
      shadowRadius: 28,
    },
    salonLikes: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: theme.isDark
        ? "rgba(255, 193, 58, 0.1)"
        : "rgba(255, 247, 229, 0.92)",
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 9,
      height: 50,
      marginTop: 12,
      overflow: "hidden",
      paddingHorizontal: 18,
    },
    salonLikesHeart: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 22,
      lineHeight: 28,
    },
    salonLikesText: {
      color: theme.isDark ? theme.colors.gold : theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 22,
      lineHeight: 28,
    },
    salonMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 17,
      lineHeight: 25,
      marginTop: 6,
      textAlign: "right",
    },
    salonName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      flexShrink: 1,
      fontSize: 32,
      letterSpacing: -0.7,
      lineHeight: 42,
      textAlign: "right",
    },
    salonIdentityBlock: {
      alignItems: "flex-end",
      maxWidth: "62%",
      minWidth: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    salonMetricsBlock: {
      alignItems: "flex-start",
      left: 0,
      minWidth: 124,
      position: "absolute",
      top: 4,
    },
    salonRatingBlock: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    salonRatingRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
    },
    salonRatingStar: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 23,
    },
    salonRatingStarImage: {
      height: 28,
      tintColor: theme.colors.gold,
      width: 28,
    },
    salonRatingText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 23,
      lineHeight: 31,
    },
    salonRoundButton: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(5, 12, 10, 0.7)"
        : "rgba(255, 253, 247, 0.92)",
      borderColor: theme.colors.gold,
      borderRadius: 34,
      borderWidth: 1,
      height: 68,
      justifyContent: "center",
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.24 : 0.12,
      shadowRadius: 18,
      width: 68,
    },
    salonRoundButtonText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 32,
      lineHeight: 34,
    },
    salonRoundButtonIcon: {
      height: 30,
      tintColor: theme.isDark ? theme.colors.gold : theme.colors.foreground,
      width: 30,
    },
    salonServiceAdd: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderColor: theme.colors.gold,
      borderRadius: 28,
      borderWidth: 1,
      flexShrink: 0,
      height: 56,
      justifyContent: "center",
      width: 56,
    },
    salonServiceAddText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 36,
      lineHeight: 39,
      marginTop: -3,
    },
    salonServiceActionBlock: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(255, 193, 58, 0.12)"
        : theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: 24,
      borderWidth: 1,
      flexShrink: 0,
      gap: 8,
      justifyContent: "center",
      minWidth: 82,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    salonServiceCopy: {
      alignItems: "flex-end",
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
      paddingHorizontal: 4,
    },
    salonServiceMain: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: 12,
      minWidth: 0,
    },
    salonServiceMedia: {
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.38)"
        : "rgba(196, 137, 32, 0.28)",
      borderRadius: 18,
      borderWidth: 1,
      flexShrink: 0,
      height: 88,
      overflow: "hidden",
      width: 116,
    },
    salonServiceMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 17,
      lineHeight: 24,
      marginTop: 8,
      textAlign: "right",
    },
    salonServiceName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 22,
      lineHeight: 30,
      textAlign: "right",
    },
    salonServicePrice: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 21,
      lineHeight: 28,
      marginTop: 4,
      textAlign: "right",
    },
    salonServiceRow: {
      alignItems: "center",
      flexDirection: "row",
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.78)"
        : "rgba(255, 255, 251, 0.92)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.48)"
        : "rgba(196, 137, 32, 0.36)",
      borderRadius: 24,
      borderWidth: 1,
      elevation: theme.isDark ? 3 : 2,
      gap: 16,
      justifyContent: "space-between",
      padding: 12,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.2 : 0.08,
      shadowRadius: 22,
    },
    salonServiceRowSelected: {
      borderColor: theme.colors.gold,
      shadowOpacity: theme.isDark ? 0.28 : 0.12,
    },
    salonServicesList: {
      gap: 14,
      paddingBottom: 4,
      paddingHorizontal: 0,
      paddingTop: 20,
    },
    salonTabs: {
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      marginTop: 32,
    },
    salonTabText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 16,
      lineHeight: 23,
      paddingBottom: 16,
      textAlign: "center",
    },
    salonTabTextActive: {
      borderBottomColor: theme.colors.gold,
      borderBottomWidth: 4,
      color: theme.colors.gold,
    },
    salonTitleRow: {
      minHeight: 112,
      position: "relative",
      width: "100%",
    },
    salonVerifiedRow: {
      alignItems: "center",
      flexDirection: "row-reverse",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "flex-end",
    },
    salonReferenceCta: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      minHeight: 70,
      justifyContent: "center",
      overflow: "hidden",
      position: "relative",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: theme.isDark ? 0.32 : 0.16,
      shadowRadius: 26,
    },
    salonReferenceCtaArrow: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 36,
      lineHeight: 40,
      textAlign: "center",
    },
    salonReferenceCtaArrowWrap: {
      alignItems: "center",
      bottom: 0,
      justifyContent: "center",
      left: 26,
      position: "absolute",
      top: 0,
      width: 42,
      zIndex: 1,
    },
    salonReferenceCtaText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 24,
      lineHeight: 32,
      textAlign: "center",
    },
    searchActionButton: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 22,
      borderWidth: 1,
      flex: 1,
      gap: 6,
      justifyContent: "center",
      minHeight: 68,
      paddingVertical: 13,
    },
    searchActionIcon: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 17,
    },
    searchActionRow: {
      flexDirection: "row",
      gap: 10,
    },
    searchActionText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 12,
    },
    searchBar: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(9, 24, 21, 0.96)"
        : "rgba(255, 253, 248, 0.98)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.13)"
        : "rgba(184, 117, 11, 0.24)",
      borderRadius: 34,
      borderWidth: 1,
      flexDirection: "row",
      gap: 13,
      minHeight: 66,
      paddingHorizontal: 16,
      paddingVertical: 7,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: theme.isDark ? 0.34 : 0.12,
      shadowRadius: 24,
    },
    searchBarPressed: {
      borderColor: theme.colors.gold,
      opacity: 0.92,
      transform: [{ translateY: 1 }],
    },
    searchIcon: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 28,
    },
    searchIconImage: {
      height: 27,
      tintColor: theme.colors.gold,
      width: 27,
    },
    searchPlaceholder: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      flex: 1,
      fontSize: 15,
      lineHeight: 22,
      minWidth: 0,
      textAlign: "right",
    },
    searchChip: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    searchChipMuted: {
      backgroundColor: theme.colors.muted,
      borderColor: theme.colors.border,
      color: theme.colors.mutedForeground,
    },
    searchChipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    searchChipSection: {
      gap: 8,
    },
    searchChipTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
    },
    secondaryButton: {
      alignItems: "center",
      backgroundColor: theme.colors.muted,
      borderRadius: theme.radii.control,
      paddingVertical: 14,
    },
    softButtonPressed: {
      opacity: 0.88,
      transform: [{ translateY: 1 }, { scale: 0.985 }],
    },
    outlineButtonPressed: {
      backgroundColor: theme.colors.goldSoft,
      opacity: 0.9,
      transform: [{ translateY: 1 }, { scale: 0.985 }],
    },
    secondaryButtonText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 14,
    },
    secondaryIconButton: {
      alignItems: "center",
      backgroundColor: theme.colors.muted,
      borderRadius: theme.radii.control,
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    secondaryIconButtonText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
    },
    sectionAction: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
    },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      paddingHorizontal: 2,
      paddingTop: 4,
    },
    sectionTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 22,
      letterSpacing: -0.2,
      lineHeight: 30,
    },
    selectText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
    },
    servicePriceBlock: {
      alignItems: "flex-end",
      flexShrink: 0,
      gap: 4,
    },
    settingsCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: 24,
      borderWidth: 1,
      padding: 18,
    },
    supportCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 14,
      padding: 20,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.18 : 0.06,
      shadowRadius: 20,
    },
    supportHeaderCopy: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    supportHeaderRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
    },
    supportIconBubble: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: 20,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    supportIconText: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 18,
    },
    shell: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    fontLoadingScreen: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    statusBadge: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    statusBadgeText: {
      color: theme.colors.success,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 11,
    },
    statusBoard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 18,
      padding: 22,
    },
    statusBookingCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 24,
      borderWidth: 1,
      padding: 20,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.16 : 0.05,
      shadowRadius: 18,
    },
    statusBookingHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "space-between",
    },
    statusChip: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    statusChipCancelled: {
      backgroundColor: theme.colors.dangerSoft,
      color: theme.colors.danger,
    },
    statusChipCompleted: {
      backgroundColor: theme.colors.successSoft,
      color: theme.colors.success,
    },
    stateAction: {
      alignSelf: "stretch",
      marginTop: 20,
    },
    stateCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.xl,
      borderWidth: 1,
      minHeight: 260,
      overflow: "hidden",
      padding: 28,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 24, width: 0 },
      shadowOpacity: theme.isDark ? 0.36 : 0.12,
      shadowRadius: 38,
    },
    stateIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: 28,
      borderWidth: 1,
      height: 56,
      justifyContent: "center",
      marginBottom: 14,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.2 : 0.08,
      shadowRadius: 14,
      width: 56,
    },
    stateIconText: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiBold,
      fontSize: 26,
      lineHeight: 30,
      textAlign: "center",
    },
    stateIconTextWarning: {
      color: theme.colors.warning,
    },
    stateIconWarning: {
      borderColor: theme.colors.warning,
      backgroundColor: theme.colors.warningSoft,
    },
    summaryGrid: {
      gap: 11,
      marginTop: 16,
    },
    summaryItem: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    summaryLabel: {
      color: theme.colors.mutedForeground,
      flexShrink: 1,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      lineHeight: 17,
      maxWidth: "42%",
      textAlign: "left",
    },
    summaryValue: {
      color: theme.colors.foreground,
      flexShrink: 1,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 14,
      lineHeight: 19,
      maxWidth: "58%",
      textAlign: "right",
      writingDirection: "rtl",
    },
    supportPill: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.warning,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.warning,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    supportRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 14,
    },
    stepBody: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },
    stepCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 22,
      borderWidth: 1,
      flexBasis: "47%",
      flexGrow: 1,
      padding: 16,
    },
    stepGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    stepIcon: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 18,
    },
    stepTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 15,
      marginTop: 8,
    },
    tabBar: {
      alignItems: "center",
      backgroundColor: theme.isDark ? "#0c1511" : "#fffaf0",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.26)"
        : "rgba(184, 117, 11, 0.22)",
      borderRadius: 20,
      borderWidth: 1,
      direction: "ltr",
      elevation: 18,
      flexDirection: "row",
      flexShrink: 0,
      height: 72,
      marginBottom: 8,
      marginHorizontal: 16,
      paddingBottom: 5,
      paddingHorizontal: 6,
      paddingTop: 5,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: -10, width: 0 },
      shadowOpacity: theme.isDark ? 0.42 : 0.12,
      shadowRadius: 22,
      zIndex: 20,
    },
    tabActiveIndicator: {
      backgroundColor: "transparent",
      borderRadius: 999,
      height: 2,
      marginTop: 2,
      width: 28,
    },
    tabActiveIndicatorVisible: {
      backgroundColor: theme.isDark ? "#edb64f" : theme.colors.deepGold,
      width: 28,
    },
    tabButton: {
      alignItems: "center",
      borderRadius: 22,
      flex: 1,
      gap: 3,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: 0,
    },
    tabButtonActive: {
      backgroundColor: "transparent",
    },
    tabButtonPressed: {
      opacity: 0.88,
      transform: [{ translateY: 1 }, { scale: 0.97 }],
    },
    tabIcon: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 21,
    },
    tabIconActive: {
      color: theme.colors.gold,
    },
    tabIconImage: {
      height: 25,
      tintColor: theme.colors.mutedForeground,
      width: 25,
    },
    tabIconImageActive: {
      tintColor: theme.colors.gold,
    },
    tabLabel: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      lineHeight: 15,
      maxWidth: 60,
      minWidth: 42,
      textAlign: "center",
    },
    tabLabelActive: {
      color: theme.colors.gold,
    },
    tagText: {
      color: theme.colors.success,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
    },
    verifiedBadge: {
      backgroundColor: "#3b82f6",
      borderRadius: 16,
      color: "#ffffff",
      fontFamily: mobileTypography.uiMedium,
      fontSize: 16,
      overflow: "hidden",
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    verifiedBadgeImage: {
      height: 24,
      tintColor: "#3b82f6",
      width: 24,
    },
    timeGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    timeSlot: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexGrow: 1,
      gap: 6,
      minWidth: 86,
      paddingHorizontal: 20,
      paddingVertical: 13,
    },
    timeSlotActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: theme.isDark ? 0.24 : 0.12,
      shadowRadius: 12,
      transform: [{ translateY: -1 }],
    },
    timeSlotIconImage: {
      height: 16,
      tintColor: theme.colors.mutedForeground,
      width: 16,
    },
    timeSlotIconImageActive: {
      tintColor: theme.colors.foregroundInverse,
    },
    timeSlotText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 14,
    },
    timeSlotTextActive: {
      color: theme.colors.foregroundInverse,
    },
    timelineCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 16,
      padding: 20,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.18 : 0.06,
      shadowRadius: 20,
    },
    timelineDot: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.goldSoft,
      borderRadius: 16,
      borderWidth: 1,
      height: 32,
      justifyContent: "center",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 5, width: 0 },
      shadowOpacity: theme.isDark ? 0.22 : 0.1,
      shadowRadius: 10,
      width: 32,
    },
    timelineDotText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiBold,
      fontSize: 12,
    },
    timelineItem: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
    },
    timelineTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 20,
      marginTop: 4,
    },
    unreadBadge: {
      backgroundColor: theme.colors.gold,
      borderRadius: 999,
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    voiceButton: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderRadius: 18,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    voiceText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 15,
    },
    voiceIconImage: {
      height: 18,
      tintColor: theme.colors.gold,
      width: 18,
    },
    confettiDotBlue: {
      backgroundColor: "#38bdf8",
      borderRadius: 5,
      height: 10,
      left: 42,
      position: "absolute",
      top: 72,
      transform: [{ rotate: "18deg" }],
      width: 10,
    },
    confettiDotGold: {
      backgroundColor: theme.colors.gold,
      borderRadius: 6,
      height: 12,
      position: "absolute",
      right: 34,
      top: 20,
      transform: [{ rotate: "28deg" }],
      width: 12,
    },
    confettiDotRose: {
      backgroundColor: "#fb7185",
      borderRadius: 4,
      bottom: 30,
      height: 8,
      position: "absolute",
      right: 86,
      transform: [{ rotate: "-24deg" }],
      width: 8,
    },
    confettiLayer: {
      ...StyleSheet.absoluteFill,
      opacity: 0.92,
    },
    confirmationHeroCard: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(7, 24, 19, 0.96)"
        : theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.xl,
      borderWidth: 1,
      overflow: "hidden",
      padding: 28,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 24, width: 0 },
      shadowOpacity: theme.isDark ? 0.36 : 0.12,
      shadowRadius: 36,
    },
    confirmationReference: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
      marginTop: 18,
      overflow: "hidden",
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    confirmationSuccessIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.success,
      borderColor: theme.isDark ? "rgba(255, 248, 236, 0.78)" : "#ffffff",
      borderRadius: 42,
      borderWidth: 4,
      height: 84,
      justifyContent: "center",
      marginBottom: 16,
      shadowColor: theme.colors.success,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.28 : 0.12,
      shadowRadius: 18,
      width: 84,
    },
    confirmationSuccessIconImage: {
      height: 38,
      tintColor: "#ffffff",
      width: 38,
    },
    legendDot: {
      backgroundColor: theme.colors.success,
      borderRadius: 5,
      height: 10,
      width: 10,
    },
    legendDotBooked: {
      backgroundColor: theme.colors.mutedForeground,
    },
    legendDotLimited: {
      backgroundColor: theme.colors.warning,
    },
    legendItem: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    legendText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
    },
    paymentMethodCard: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.94)"
        : theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 26,
      borderWidth: 1,
      flexDirection: "row-reverse",
      gap: 14,
      padding: 18,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.14 : 0.05,
      shadowRadius: 16,
    },
    paymentMethodCardActive: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOpacity: theme.isDark ? 0.22 : 0.1,
    },
    paymentMethodIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      borderRadius: 18,
      borderWidth: 1,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    paymentMethodIconImage: {
      height: 22,
      tintColor: theme.colors.foregroundInverse,
      width: 22,
    },
    paymentOptionList: {
      gap: 12,
    },
    securePaymentCard: {
      alignItems: "center",
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
      borderRadius: 24,
      borderWidth: 1,
      flexDirection: "row-reverse",
      gap: 12,
      padding: 16,
    },
    securePaymentIconImage: {
      height: 22,
      tintColor: theme.isDark ? theme.colors.success : "#047857",
      width: 22,
    },
    securePaymentNote: {
      color: theme.colors.success,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 6,
    },
    securePaymentText: {
      color: theme.colors.success,
      flex: 1,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      lineHeight: 18,
    },
    staffReferenceScreen: {
      backgroundColor: theme.isDark ? "#020805" : "#fff8ea",
      gap: 16,
      minHeight: "100%",
      overflow: "hidden",
      paddingBottom: 232,
      paddingHorizontal: 22,
      paddingTop: 34,
      position: "relative",
    },
    staffReferenceGlow: {
      backgroundColor: theme.isDark
        ? "rgba(12, 96, 65, 0.2)"
        : "rgba(255, 193, 58, 0.16)",
      borderRadius: 999,
      height: 220,
      left: -90,
      position: "absolute",
      top: 32,
      width: 220,
    },
    staffReferenceFrameTop: {
      borderColor: theme.colors.gold,
      borderRadius: 34,
      borderWidth: 1,
      height: 94,
      opacity: theme.isDark ? 0.16 : 0.1,
      position: "absolute",
      right: -42,
      top: 64,
      width: 94,
    },
    staffReferenceHeader: {
      alignItems: "center",
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      zIndex: 1,
    },
    staffReferenceBackButton: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(5, 12, 10, 0.68)"
        : "rgba(255, 253, 247, 0.9)",
      borderColor: theme.colors.goldSoft,
      borderRadius: 27,
      borderWidth: 1,
      height: 54,
      justifyContent: "center",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.16 : 0.08,
      shadowRadius: 16,
      width: 54,
    },
    staffReferenceBackIcon: {
      height: 23,
      tintColor: theme.colors.gold,
      width: 23,
    },
    staffReferenceProgressBlock: {
      alignItems: "flex-start",
      gap: 8,
    },
    staffReferenceStepText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 16,
      lineHeight: 22,
    },
    staffReferenceProgressTrack: {
      flexDirection: "row-reverse",
      gap: 6,
    },
    staffReferenceProgressSegment: {
      backgroundColor: theme.colors.border,
      borderRadius: 999,
      height: 5,
      opacity: 0.72,
      width: 26,
    },
    staffReferenceProgressSegmentActive: {
      backgroundColor: theme.colors.gold,
      opacity: 1,
      width: 34,
    },
    staffReferenceHeroCopy: {
      alignItems: "flex-end",
      gap: 4,
      marginTop: 4,
    },
    staffReferenceTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 28,
      letterSpacing: -0.3,
      lineHeight: 38,
      textAlign: "right",
    },
    staffReferenceSubtitle: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 14,
      lineHeight: 22,
      textAlign: "right",
    },
    staffReferenceSummaryCard: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.78)"
        : "rgba(255, 255, 251, 0.92)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.42)"
        : "rgba(196, 137, 32, 0.28)",
      borderRadius: 28,
      borderWidth: 1,
      flexDirection: "row",
      gap: 14,
      padding: 14,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.18 : 0.08,
      shadowRadius: 22,
    },
    staffReferenceSummaryMedia: {
      borderColor: theme.colors.goldSoft,
      borderRadius: 18,
      borderWidth: 1,
      height: 94,
      overflow: "hidden",
      width: 138,
    },
    staffReferenceSummaryCopy: {
      alignItems: "flex-end",
      flex: 1,
      gap: 5,
      minWidth: 0,
    },
    staffReferenceBusinessName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 20,
      lineHeight: 28,
      textAlign: "right",
    },
    staffReferenceSummaryMeta: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 15,
      lineHeight: 23,
      textAlign: "right",
    },
    staffReferenceSummaryMuted: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 13,
      lineHeight: 20,
      textAlign: "right",
    },
    staffReferenceEditButton: {
      alignItems: "center",
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      bottom: 14,
      left: 14,
      minWidth: 118,
      paddingHorizontal: 14,
      paddingVertical: 8,
      position: "absolute",
    },
    staffReferenceEditText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
      lineHeight: 19,
    },
    staffReferenceSectionTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 18,
      lineHeight: 26,
      marginTop: 2,
      textAlign: "right",
    },
    staffReferenceMethodGrid: {
      flexDirection: "row",
      gap: 14,
    },
    staffReferenceMethodCard: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(9, 25, 20, 0.76)"
        : "rgba(255, 253, 248, 0.84)",
      borderColor: theme.colors.goldSoft,
      borderRadius: 26,
      borderWidth: 1,
      flex: 1,
      minHeight: 158,
      padding: 16,
      position: "relative",
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.14 : 0.04,
      shadowRadius: 16,
    },
    staffReferenceMethodCardActive: {
      backgroundColor: theme.isDark
        ? "rgba(16, 45, 34, 0.86)"
        : "rgba(255, 229, 158, 0.5)",
      borderColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOpacity: theme.isDark ? 0.24 : 0.12,
      shadowRadius: 22,
    },
    staffReferenceCheckBadge: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: 14,
      height: 28,
      justifyContent: "center",
      position: "absolute",
      right: 12,
      top: 12,
      width: 28,
    },
    staffReferenceCheckText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiBold,
      fontSize: 15,
    },
    staffReferenceMethodIcon: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.goldSoft,
      borderRadius: 26,
      borderWidth: 1,
      height: 52,
      justifyContent: "center",
      marginBottom: 12,
      width: 52,
    },
    staffReferenceMethodIconText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 26,
      lineHeight: 30,
    },
    staffReferenceMethodTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
    },
    staffReferenceMethodDescription: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 19,
      marginTop: 6,
      textAlign: "center",
    },
    staffReferenceMethodMetric: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    staffReferenceMethodMetricText: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
      lineHeight: 18,
    },
    staffReferenceFilterRow: {
      flexDirection: "row-reverse",
      gap: 8,
      justifyContent: "space-between",
    },
    staffReferenceFilterChip: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(9, 25, 20, 0.68)"
        : "rgba(255, 253, 248, 0.92)",
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 46,
      minWidth: 0,
      paddingHorizontal: 8,
      paddingVertical: 10,
    },
    staffReferenceFilterChipActive: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
    },
    staffReferenceFilterText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    staffReferenceFilterTextActive: {
      color: theme.colors.deepGold,
    },
    staffReferenceSpecialistRail: {
      flexDirection: "row-reverse",
      gap: 7,
      justifyContent: "space-between",
      paddingHorizontal: 0,
      paddingVertical: 2,
    },
    staffReferenceSpecialistCard: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.76)"
        : "rgba(255, 255, 251, 0.92)",
      borderColor: theme.colors.goldSoft,
      borderRadius: 24,
      borderWidth: 1,
      flex: 1,
      minHeight: 150,
      minWidth: 0,
      paddingHorizontal: 7,
      paddingVertical: 10,
      position: "relative",
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.16 : 0.05,
      shadowRadius: 18,
    },
    staffReferenceSpecialistCardActive: {
      borderColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOpacity: theme.isDark ? 0.26 : 0.12,
    },
    staffReferenceSelectedDot: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: 13,
      height: 26,
      justifyContent: "center",
      left: 8,
      position: "absolute",
      top: 8,
      width: 26,
      zIndex: 1,
    },
    staffReferenceSelectedDotText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiBold,
      fontSize: 13,
    },
    staffReferenceAvatar: {
      alignItems: "center",
      backgroundColor: theme.isDark ? "#152a25" : "#f4eadb",
      borderColor: theme.colors.goldSoft,
      borderRadius: 33,
      borderWidth: 1,
      height: 56,
      justifyContent: "center",
      marginBottom: 7,
      width: 56,
    },
    staffReferenceAvatarText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 21,
      lineHeight: 29,
    },
    staffReferenceSpecialistName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    staffReferenceSpecialistRole: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 11,
      lineHeight: 16,
      textAlign: "center",
    },
    staffReferenceSpecialistRating: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
    },
    staffReferenceAvailability: {
      color: theme.colors.success,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 10,
      lineHeight: 16,
      marginTop: 3,
    },
    staffReferenceDetailCard: {
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.78)"
        : "rgba(255, 255, 251, 0.92)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.42)"
        : "rgba(196, 137, 32, 0.28)",
      borderRadius: 26,
      borderWidth: 1,
      gap: 9,
      padding: 12,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.18 : 0.08,
      shadowRadius: 22,
    },
    staffReferenceDetailRating: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 11,
      paddingVertical: 4,
    },
    staffReferenceDetailRatingText: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
      lineHeight: 18,
    },
    staffReferenceDetailTop: {
      alignItems: "center",
      flexDirection: "row-reverse",
      gap: 10,
    },
    staffReferenceDetailAvatar: {
      alignItems: "center",
      backgroundColor: theme.isDark ? "#152a25" : "#f4eadb",
      borderColor: theme.colors.gold,
      borderRadius: 34,
      borderWidth: 1,
      height: 68,
      justifyContent: "center",
      width: 68,
    },
    staffReferenceDetailAvatarText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 24,
      lineHeight: 32,
    },
    staffReferenceDetailCopy: {
      alignItems: "flex-end",
      flex: 1,
    },
    staffReferenceDetailNameRow: {
      alignItems: "center",
      flexDirection: "row-reverse",
      gap: 7,
    },
    staffReferenceDetailName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 21,
      lineHeight: 29,
      textAlign: "right",
    },
    staffReferenceVerifiedIcon: {
      height: 18,
      width: 18,
    },
    staffReferenceDetailRole: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 3,
      textAlign: "right",
    },
    staffReferenceDetailMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "right",
    },
    staffReferenceAvailabilityRow: {
      alignItems: "center",
      alignSelf: "flex-end",
      flexDirection: "row-reverse",
      gap: 8,
    },
    staffReferenceCalendarMark: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 16,
    },
    staffReferenceAvailabilityStrong: {
      color: theme.colors.success,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      lineHeight: 18,
    },
    staffReferenceTimeRow: {
      flexDirection: "row-reverse",
      gap: 7,
      justifyContent: "space-between",
    },
    staffReferenceTimeChip: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(9, 25, 20, 0.74)"
        : "rgba(255, 253, 248, 0.92)",
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flex: 1,
      paddingVertical: 8,
    },
    staffReferenceTimeChipActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
    },
    staffReferenceTimeText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      lineHeight: 18,
    },
    staffReferenceTimeTextActive: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiSemiBold,
    },
    staffReferenceBottomAction: {
      gap: 10,
      paddingBottom: 42,
    },
    staffReferenceCta: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      justifyContent: "center",
      minHeight: 62,
      position: "relative",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.3 : 0.14,
      shadowRadius: 24,
    },
    staffReferenceCtaText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 19,
      lineHeight: 28,
      textAlign: "center",
    },
    staffReferenceCtaArrow: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 34,
      left: 28,
      lineHeight: 62,
      position: "absolute",
      textAlign: "center",
      top: 0,
    },
    staffReferenceTrustNote: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    dateTimeReferenceScreen: {
      backgroundColor: theme.isDark ? "#020805" : "#fff8ea",
      gap: 16,
      minHeight: "100%",
      overflow: "hidden",
      paddingBottom: 232,
      paddingHorizontal: 22,
      paddingTop: 34,
      position: "relative",
    },
    dateTimeSummaryCard: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.8)"
        : "rgba(255, 255, 251, 0.94)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.46)"
        : "rgba(196, 137, 32, 0.3)",
      borderRadius: 28,
      borderWidth: 1,
      flexDirection: "row",
      gap: 13,
      padding: 13,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.2 : 0.08,
      shadowRadius: 24,
    },
    dateTimeSummaryMedia: {
      borderColor: theme.colors.goldSoft,
      borderRadius: 18,
      borderWidth: 1,
      height: 88,
      overflow: "hidden",
      width: 126,
    },
    dateTimeSummaryCopy: {
      alignItems: "flex-end",
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    dateTimeEditButton: {
      alignItems: "center",
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      bottom: 12,
      left: 12,
      minWidth: 92,
      paddingHorizontal: 13,
      paddingVertical: 7,
      position: "absolute",
    },
    dateTimeDateRail: {
      flexDirection: "row-reverse",
      gap: 7,
      justifyContent: "space-between",
    },
    dateTimeDateCard: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(9, 25, 20, 0.78)"
        : "rgba(255, 253, 248, 0.92)",
      borderColor: theme.colors.goldSoft,
      borderRadius: 22,
      borderWidth: 1,
      flex: 1,
      gap: 2,
      minHeight: 98,
      minWidth: 0,
      paddingHorizontal: 6,
      paddingVertical: 11,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 9, width: 0 },
      shadowOpacity: theme.isDark ? 0.14 : 0.05,
      shadowRadius: 16,
    },
    dateTimeDateCardActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOpacity: theme.isDark ? 0.28 : 0.16,
      shadowRadius: 22,
    },
    dateTimeDateCardBusy: {
      borderColor: theme.colors.warning,
    },
    dateTimeDateCardDisabled: {
      opacity: 0.46,
    },
    dateTimeDateDay: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      lineHeight: 17,
      textAlign: "center",
    },
    dateTimeDateNumber: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 25,
      lineHeight: 34,
      textAlign: "center",
    },
    dateTimeDateNumberActive: {
      color: theme.colors.foregroundInverse,
    },
    dateTimeDateMeta: {
      color: theme.colors.success,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 10,
      lineHeight: 16,
      textAlign: "center",
    },
    dateTimeDateTextActive: {
      color: theme.colors.foregroundInverse,
    },
    dateTimeDateDisabledText: {
      color: theme.colors.mutedForeground,
    },
    dateTimeCalendarCard: {
      backgroundColor: theme.isDark
        ? "rgba(7, 22, 18, 0.72)"
        : "rgba(255, 251, 242, 0.9)",
      borderColor: theme.colors.goldSoft,
      borderRadius: 24,
      borderWidth: 1,
      gap: 12,
      padding: 14,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.14 : 0.05,
      shadowRadius: 18,
    },
    dateTimeCalendarHeader: {
      alignItems: "flex-end",
      gap: 2,
    },
    dateTimeCalendarTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 17,
      lineHeight: 24,
      textAlign: "right",
    },
    dateTimeCalendarMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "right",
    },
    dateTimeCalendarGrid: {
      flexDirection: "row-reverse",
      gap: 7,
      justifyContent: "space-between",
    },
    dateTimeCalendarDay: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(12, 32, 26, 0.72)"
        : "rgba(255, 255, 251, 0.86)",
      borderColor: theme.colors.border,
      borderRadius: 15,
      borderWidth: 1,
      flex: 1,
      minHeight: 38,
      justifyContent: "center",
    },
    dateTimeCalendarDayActive: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
    },
    dateTimeCalendarDayText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 12,
      lineHeight: 18,
    },
    dateTimeCalendarDayTextActive: {
      color: theme.colors.deepGold,
    },
    dateTimePeriodRow: {
      flexDirection: "row-reverse",
      gap: 8,
      justifyContent: "space-between",
    },
    dateTimePeriodChip: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(9, 25, 20, 0.7)"
        : "rgba(255, 253, 248, 0.92)",
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flex: 1,
      minHeight: 44,
      minWidth: 0,
      justifyContent: "center",
      paddingHorizontal: 8,
      paddingVertical: 9,
    },
    dateTimePeriodChipActive: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
    },
    dateTimePeriodText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    dateTimePeriodTextActive: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
    },
    dateTimeSlotGrid: {
      flexDirection: "row-reverse",
      flexWrap: "wrap",
      gap: 9,
    },
    dateTimeSlot: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(9, 25, 20, 0.74)"
        : "rgba(255, 253, 248, 0.92)",
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexBasis: "31%",
      flexGrow: 1,
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    dateTimeSlotActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOpacity: theme.isDark ? 0.22 : 0.12,
      shadowRadius: 16,
    },
    dateTimeSlotLimited: {
      borderColor: theme.colors.warning,
    },
    dateTimeSlotDisabled: {
      opacity: 0.45,
    },
    dateTimeSlotSuggested: {
      borderColor: theme.colors.success,
    },
    dateTimeSlotText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    dateTimeSlotTextActive: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiSemiBold,
    },
    dateTimeSlotSuggestedText: {
      color: theme.colors.success,
    },
    dateTimeSlotTextDisabled: {
      color: theme.colors.mutedForeground,
    },
    dateTimeSelectedCard: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.78)"
        : "rgba(255, 255, 251, 0.92)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.42)"
        : "rgba(196, 137, 32, 0.28)",
      borderRadius: 24,
      borderWidth: 1,
      flexDirection: "row-reverse",
      gap: 12,
      padding: 14,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.16 : 0.06,
      shadowRadius: 20,
    },
    dateTimeSelectedAccent: {
      backgroundColor: theme.colors.gold,
      borderRadius: 999,
      height: 44,
      width: 5,
    },
    dateTimeSelectedCopy: {
      alignItems: "flex-end",
      flex: 1,
      gap: 2,
    },
    dateTimeSelectedLabel: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "right",
    },
    dateTimeSelectedValue: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 17,
      lineHeight: 25,
      textAlign: "right",
    },
    dateTimeSelectedMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "right",
    },
    dateTimeBottomAction: {
      gap: 10,
      paddingBottom: 42,
    },
    paymentReferenceScreen: {
      backgroundColor: theme.isDark ? "#020805" : "#fff8ea",
      gap: 16,
      minHeight: "100%",
      overflow: "hidden",
      paddingBottom: 228,
      paddingHorizontal: 20,
      paddingTop: 34,
      position: "relative",
    },
    paymentReferenceHeader: {
      alignItems: "center",
      height: 70,
      position: "relative",
      zIndex: 1,
    },
    paymentReferenceBackButton: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(5, 12, 10, 0.72)"
        : "rgba(255, 253, 247, 0.92)",
      borderColor: theme.colors.gold,
      borderRadius: 31,
      borderWidth: 1.5,
      height: 62,
      justifyContent: "center",
      position: "absolute",
      right: 0,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.22 : 0.1,
      shadowRadius: 22,
      top: 0,
      width: 62,
    },
    paymentReferenceBackIcon: {
      height: 32,
      tintColor: theme.colors.gold,
      width: 32,
    },
    paymentReferenceProgressBlock: {
      alignItems: "flex-start",
      gap: 8,
      left: 0,
      position: "absolute",
      top: 7,
    },
    paymentReferenceStepText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiBold,
      fontSize: 17,
      lineHeight: 23,
      textAlign: "left",
    },
    paymentReferenceHeroCopy: {
      alignItems: "flex-end",
      gap: 7,
      marginTop: 4,
    },
    paymentReferenceTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 36,
      letterSpacing: -0.6,
      lineHeight: 48,
      textAlign: "right",
    },
    paymentReferenceSubtitle: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 16,
      lineHeight: 25,
      textAlign: "right",
    },
    paymentReferenceList: {
      gap: 11,
      marginTop: 8,
    },
    paymentReferenceMethodCard: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.78)"
        : "rgba(255, 255, 251, 0.92)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.28)"
        : "rgba(196, 137, 32, 0.22)",
      borderRadius: 26,
      borderWidth: 1,
      flexDirection: "row",
      gap: 16,
      minHeight: 88,
      paddingHorizontal: 16,
      paddingVertical: 14,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.18 : 0.06,
      shadowRadius: 22,
    },
    paymentReferenceMethodCardActive: {
      borderColor: theme.colors.gold,
      borderWidth: 1.5,
      shadowColor: theme.colors.deepGold,
      shadowOpacity: theme.isDark ? 0.3 : 0.16,
      shadowRadius: 26,
    },
    paymentReferenceRadio: {
      alignItems: "center",
      borderColor: theme.colors.mutedForeground,
      borderRadius: 16,
      borderWidth: 2,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    paymentReferenceRadioDot: {
      backgroundColor: theme.colors.gold,
      borderRadius: 11,
      height: 22,
      width: 22,
    },
    paymentReferenceMethodCopy: {
      alignItems: "flex-end",
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    paymentReferenceMethodTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 21,
      lineHeight: 29,
      textAlign: "right",
    },
    paymentReferenceMethodMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 14,
      lineHeight: 22,
      textAlign: "right",
    },
    paymentReferenceIconBox: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(255, 193, 58, 0.08)"
        : "rgba(255, 219, 137, 0.26)",
      borderColor: theme.colors.gold,
      borderRadius: 17,
      borderWidth: 1.3,
      height: 56,
      justifyContent: "center",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.22 : 0.1,
      shadowRadius: 14,
      width: 56,
    },
    paymentReferenceIconImage: {
      height: 28,
      tintColor: theme.colors.gold,
      width: 28,
    },
    paymentReferenceIconText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiBold,
      fontSize: 22,
      lineHeight: 28,
      textAlign: "center",
    },
    paymentSummaryCard: {
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.8)"
        : "rgba(255, 255, 251, 0.94)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.34)"
        : "rgba(196, 137, 32, 0.28)",
      borderRadius: 28,
      borderWidth: 1,
      gap: 16,
      paddingHorizontal: 18,
      paddingVertical: 18,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.2 : 0.08,
      shadowRadius: 24,
    },
    paymentSummaryTitleRow: {
      alignItems: "center",
      flexDirection: "row-reverse",
      gap: 11,
      justifyContent: "flex-start",
    },
    paymentSummaryTitle: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 21,
      lineHeight: 30,
      textAlign: "right",
    },
    paymentSummaryTitleIcon: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiBold,
      fontSize: 22,
      lineHeight: 27,
    },
    paymentSummaryRows: {
      gap: 10,
    },
    paymentSummaryRow: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(5, 18, 15, 0.72)"
        : "rgba(255, 251, 242, 0.9)",
      borderColor: theme.isDark
        ? "rgba(255, 193, 58, 0.24)"
        : "rgba(196, 137, 32, 0.18)",
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row-reverse",
      gap: 13,
      minHeight: 60,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    paymentSummaryLabel: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 14,
      lineHeight: 21,
      minWidth: 78,
      textAlign: "right",
    },
    paymentSummaryValue: {
      color: theme.colors.foreground,
      flex: 1,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 16,
      lineHeight: 24,
      textAlign: "right",
    },
    paymentSummaryIconBox: {
      alignItems: "center",
      borderColor: theme.colors.goldSoft,
      borderRadius: 12,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    paymentSummaryIconImage: {
      height: 23,
      tintColor: theme.colors.gold,
      width: 23,
    },
    paymentSummaryIconText: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 20,
      lineHeight: 24,
    },
    paymentReferenceTrustBar: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(11, 62, 39, 0.44)"
        : "rgba(218, 255, 232, 0.7)",
      borderColor: theme.colors.success,
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row-reverse",
      gap: 10,
      minHeight: 58,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    paymentReferenceTrustIcon: {
      height: 24,
      tintColor: theme.colors.success,
      width: 24,
    },
    paymentReferenceTrustText: {
      color: theme.colors.success,
      flex: 1,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 15,
      lineHeight: 23,
      textAlign: "right",
    },
    paymentReferenceBottomAction: {
      paddingBottom: 42,
    },
    paymentReferenceCta: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      justifyContent: "center",
      minHeight: 64,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.3 : 0.14,
      shadowRadius: 24,
    },
    paymentReferenceCtaText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 22,
      lineHeight: 31,
      textAlign: "center",
    },
    staffAvatar: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      borderRadius: 23,
      borderWidth: 1,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    staffAvatarText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiBold,
      fontSize: 18,
    },
    staffExperience: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 11,
      lineHeight: 17,
    },
    staffDetailsBlock: {
      alignItems: "flex-start",
      flex: 1,
      gap: 5,
      minWidth: 0,
    },
    staffDetailsBlockRtl: {
      alignItems: "flex-start",
    },
    staffIdentityBlock: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 0,
      gap: 8,
      maxWidth: "46%",
    },
    staffIdentityBlockRtl: {
      flexDirection: "row-reverse",
    },
    staffNameText: {
      color: theme.colors.foreground,
      flexShrink: 1,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 17,
      lineHeight: 23,
    },
    staffRatingIconImage: {
      height: 12,
      tintColor: theme.colors.gold,
      width: 12,
    },
    staffRatingPill: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    staffRatingPillRtl: {
      flexDirection: "row-reverse",
    },
    staffRatingText: {
      color: theme.colors.deepGold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 11,
    },
    staffSelectionCard: {
      alignItems: "center",
      backgroundColor: theme.isDark
        ? "rgba(8, 27, 21, 0.94)"
        : theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 26,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      padding: 13,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.16 : 0.06,
      shadowRadius: 18,
    },
    staffSelectionCardActive: {
      backgroundColor: theme.isDark
        ? "rgba(14, 46, 35, 0.96)"
        : theme.colors.cardElevated,
      borderColor: theme.colors.gold,
      shadowColor: theme.colors.deepGold,
      shadowOpacity: theme.isDark ? 0.24 : 0.1,
      shadowRadius: 22,
    },
    staffSelectionIndicator: {
      alignItems: "center",
      backgroundColor: theme.colors.muted,
      borderColor: theme.colors.border,
      borderRadius: 17,
      borderWidth: 1,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    staffSelectionIndicatorActive: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
    },
    staffRoleText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 11,
      lineHeight: 17,
    },
    visualOnlyButton: {
      opacity: 0.96,
      shadowOpacity: theme.isDark ? 0.16 : 0.06,
    },
  });
