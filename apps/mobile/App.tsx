import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useCallback, useMemo, useState } from "react";
import {
  I18nManager,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ImageSourcePropType,
} from "react-native";

import { fetchMobileMarketplace } from "./src/api/marketplace";
import {
  BottomTabBar,
  type MobileAppTabId,
  PrimaryButton,
  ScreenHeader,
  TOUCH_HIT_SLOP,
} from "./src/components/mobile-chrome";
import {
  PremiumStateCard,
  SectionHeader,
  SummaryItem,
} from "./src/components/screen-composition";
import { API_BASE_URL } from "./src/config/api";
import {
  DEFAULT_LOCALE,
  getTextDirection,
  labels,
  type MobileLocale,
} from "./src/i18n/labels";
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
import type { MobileMarketplaceBusiness } from "./src/types/marketplace";

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
  id: string;
  label: string;
  meta: string;
};

type BookingListFilter = "upcoming" | "past" | "cancelled";

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

type HomeCategoryTone =
  | "blue"
  | "gold"
  | "green"
  | "neutral"
  | "purple"
  | "rose";

type HomeCategory =
  | {
      icon: ImageSourcePropType;
      label: string;
      mark?: never;
      tone: HomeCategoryTone;
    }
  | {
      icon?: never;
      label: string;
      mark: "book" | "car" | "more";
      tone: HomeCategoryTone;
    };

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
    clinic: require("./assets/icons/categories/clinic.png") as ImageSourcePropType,
    gym: require("./assets/icons/categories/gym.png") as ImageSourcePropType,
    restaurant: require("./assets/icons/categories/restaurant.png") as ImageSourcePropType,
    salon: require("./assets/icons/categories/salon.png") as ImageSourcePropType,
    services: require("./assets/icons/categories/services.png") as ImageSourcePropType,
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

const categories: HomeCategory[] = [
  {
    icon: mobileIconAssets.categories.salon,
    label: "صالون",
    tone: "rose",
  },
  {
    icon: mobileIconAssets.categories.restaurant,
    label: "مطاعم",
    tone: "gold",
  },
  {
    icon: mobileIconAssets.categories.clinic,
    label: "عيادات",
    tone: "blue",
  },
  {
    icon: mobileIconAssets.categories.gym,
    label: "رياضة",
    tone: "green",
  },
  {
    icon: mobileIconAssets.categories.spa,
    label: "سبا",
    tone: "purple",
  },
  {
    label: "تعليم",
    mark: "book",
    tone: "blue",
  },
  {
    label: "سيارات",
    mark: "car",
    tone: "gold",
  },
  {
    label: "المزيد",
    mark: "more",
    tone: "neutral",
  },
];

const featuredBusinesses: PremiumBusiness[] = [
  {
    category: "صالون وتجميل",
    distance: "1.8 كم",
    id: "noura-salon",
    name: "Noura Beauty Lounge",
    price: "من 25,000 د.ع",
    rating: "4.9",
    reviewCount: "128 تقييم",
    status: "مفتوح الآن",
    tag: "متاح اليوم",
  },
  {
    category: "مطعم وحجوزات",
    distance: "2.4 كم",
    id: "mat3am-gold",
    name: "Mat3am Gold",
    price: "طاولة من 4 أشخاص",
    rating: "4.8",
    reviewCount: "96 تقييم",
    status: "حجز سريع",
    tag: "حجز سريع",
  },
  {
    category: "عيادة أسنان",
    distance: "3.1 كم",
    id: "smile-clinic",
    name: "Smile Studio Clinic",
    price: "استشارة من 15,000 د.ع",
    rating: "4.7",
    reviewCount: "74 تقييم",
    status: "الأقرب",
    tag: "مختصون",
  },
];

const services = [
  { duration: "45 دقيقة", name: "قص وتصفيف", price: "25,000 د.ع", tag: "الأكثر طلباً" },
  { duration: "60 دقيقة", name: "عناية بشرة", price: "35,000 د.ع", tag: "عناية فاخرة" },
  { duration: "90 دقيقة", name: "باقة فاخرة", price: "55,000 د.ع", tag: "VIP" },
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
  { day: "اليوم", id: "today", label: "06", meta: "متاح" },
  { day: "غداً", id: "tomorrow", label: "07", meta: "6 أوقات" },
  { day: "الأربعاء", id: "wed", label: "08", meta: "محدود" },
  { day: "الخميس", id: "thu", label: "09", meta: "أفضل" },
];

const bookingTimeOptions: BookingTimeOption[] = [
  { id: "0900", label: "09:00", state: "available" },
  { id: "0930", label: "09:30", state: "available" },
  { id: "1000", label: "10:00", state: "limited" },
  { id: "1030", label: "10:30", state: "available" },
  { id: "1100", label: "11:00", state: "booked" },
  { id: "1130", label: "11:30", state: "available" },
  { id: "1200", label: "12:00", state: "limited" },
  { id: "1230", label: "12:30", state: "available" },
  { id: "1500", label: "15:00", state: "available" },
  { id: "1530", label: "15:30", state: "limited" },
  { id: "1600", label: "16:00", state: "available" },
  { id: "1630", label: "16:30", state: "available" },
  { id: "1700", label: "17:00", state: "booked" },
  { id: "1730", label: "17:30", state: "available" },
  { id: "1800", label: "18:00", state: "limited" },
  { id: "1830", label: "18:30", state: "available" },
];

const paymentMethodOptions: BookingPaymentOption[] = [
  {
    id: "apple-pay",
    label: "Apple Pay",
    meta: "زر بصري فقط بدون تكامل دفع",
  },
  {
    id: "card",
    label: "بطاقة الائتمان / مدى",
    meta: "لا يتم إدخال أو حفظ بيانات بطاقة",
  },
  {
    id: "bank",
    label: "تحويل بنكي",
    meta: "تعليمات دفع تجريبية فقط",
  },
  {
    id: "venue",
    label: "الدفع في الموقع",
    meta: "تأكيد بصري بدون تحصيل",
  },
];

const onboardingHighlights = [
  "حجوزات",
  "رسائل",
  "أعمال",
];

const accountActions = [
  { label: "تسجيل الدخول", tone: "primary" },
  { label: "إنشاء حساب", tone: "secondary" },
];

const bookingFilterTabs: { id: BookingListFilter; label: string }[] = [
  { id: "upcoming", label: "القادمة" },
  { id: "past", label: "السابقة" },
  { id: "cancelled", label: "ملغاة" },
];

const visualBookingStatusLabels: Record<VisualBookingStatus, string> = {
  cancelled: "ملغى",
  completed: "مكتمل",
  confirmed: "مؤكد",
  pending: "قيد الانتظار",
};

const demoManagedBookings: VisualBooking[] = [
  {
    businessName: "Noura Beauty Lounge",
    category: "صالون وتجميل",
    date: "اليوم 06",
    id: "noura-2406",
    paymentMethod: "الدفع في الموقع",
    price: "25,000 د.ع",
    reference: "REZNO-2406",
    serviceName: "قص وتصفيف فاخر",
    staff: "أحمد",
    status: "confirmed",
    statusLabel: "مؤكد",
    time: "15:00",
  },
  {
    businessName: "Mat3am Gold",
    category: "مطعم وحجوزات",
    date: "غداً 07",
    id: "mat3am-2407",
    paymentMethod: "حسب العرض البصري",
    price: "حسب العرض البصري",
    reference: "REZNO-2407",
    serviceName: "طاولة لـ 4 أشخاص",
    staff: "بدون تفضيل",
    status: "pending",
    statusLabel: "قيد الانتظار",
    time: "20:30",
  },
  {
    businessName: "Smile Studio Clinic",
    category: "عيادة أسنان",
    date: "أمس",
    id: "smile-2405",
    paymentMethod: "بطاقة الائتمان / مدى",
    price: "15,000 د.ع",
    reference: "REZNO-2405",
    serviceName: "استشارة أسنان",
    staff: "يوسف",
    status: "completed",
    statusLabel: "مكتمل",
    time: "11:30",
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
  { label: "العربية", meta: "الواجهة الأساسية", selected: true },
  { label: "English", meta: "Available visually", selected: false },
  { label: "کوردی", meta: "پشتیوانی کراوە", selected: false },
];

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
  const [selectedBusiness, setSelectedBusiness] =
    useState<PremiumBusiness | null>(null);
  const [bookingFlowStep, setBookingFlowStep] =
    useState<BookingFlowStepId | null>(null);
  const [selectedBookingService] = useState(services[0]);
  const [selectedStaff, setSelectedStaff] = useState<BookingStaffOption>(
    bookingStaffOptions[0],
  );
  const [selectedDate, setSelectedDate] = useState<BookingDateOption>(
    bookingDateOptions[0],
  );
  const [selectedTime, setSelectedTime] = useState<BookingTimeOption>(
    bookingTimeOptions[11],
  );
  const [selectedPayment, setSelectedPayment] = useState<BookingPaymentOption>(
    paymentMethodOptions[3],
  );
  const [bookingFilter, setBookingFilter] =
    useState<BookingListFilter>("upcoming");
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
  const confirmedVisualBooking = useMemo<VisualBooking>(
    () => ({
      businessName: selectedBusiness?.name ?? "Noura Beauty Lounge",
      category: selectedBusiness?.category ?? "صالون وتجميل",
      date: `${selectedDate.day} ${selectedDate.label}`,
      id: "visual-confirmed-booking",
      paymentMethod: selectedPayment.label,
      price: selectedBookingService.price,
      reference: "REZNO-2406",
      serviceName: selectedBookingService.name,
      staff: selectedStaff.name,
      status: "confirmed",
      statusLabel: "مؤكد",
      time: selectedTime.label,
    }),
    [
      selectedBookingService.name,
      selectedBookingService.price,
      selectedBusiness?.category,
      selectedBusiness?.name,
      selectedDate.day,
      selectedDate.label,
      selectedPayment.label,
      selectedStaff.name,
      selectedTime.label,
    ],
  );
  const managedBookings = useMemo<VisualBooking[]>(
    () => {
      const visualBookingFeed = [
        confirmedVisualBooking,
        ...demoManagedBookings.filter(
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
    [confirmedVisualBooking, visualCancelledBookingIds],
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
    setSelectedBusiness(null);
    setBookingFlowStep(null);
    setSelectedBookingId(null);
    setBookingManagementPanel(null);

    if (tabId === "marketplace" && marketplaceState.status === "idle") {
      loadMarketplace();
    }

    setActiveTab(tabId);
  };

  const handleEnterApp = () => {
    setShowOnboarding(false);
  };

  const handleStartBookingFlow = () => {
    setSelectedStaff(bookingStaffOptions[0]);
    setSelectedDate(bookingDateOptions[0]);
    setSelectedTime(bookingTimeOptions[11]);
    setSelectedPayment(paymentMethodOptions[3]);
    setBookingFlowStep("staff");
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

  const handleOpenBooking = (booking: VisualBooking) => {
    setSelectedBookingId(booking.id);
    setBookingManagementPanel(null);
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
      <SafeAreaView style={styles.shell}>
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
      {!selectedBusiness && activeTab !== "marketplace" ? (
        <ScreenHeader
          isRtl={isRtl}
          locale={locale}
          onLocaleChange={setLocale}
          styles={styles}
          text={text}
        />
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          (selectedBusiness || activeTab === "marketplace") &&
            styles.immersiveContent,
        ]}
        showsVerticalScrollIndicator={false}
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
            business={selectedBusiness}
            date={selectedDate}
            isRtl={isRtl}
            onBack={handleBookingBack}
            onConfirm={() => setBookingFlowStep("confirmation")}
            onDateSelect={setSelectedDate}
            onPaymentSelect={setSelectedPayment}
            onReturnHome={handleReturnHome}
            onStaffSelect={setSelectedStaff}
            onStepChange={setBookingFlowStep}
            onTimeSelect={setSelectedTime}
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
          <CustomerHomeScreen
            isRtl={isRtl}
            onOpenBusiness={setSelectedBusiness}
            onOpenMarketplace={() => handleTabPress("marketplace")}
            styles={styles}
          />
        ) : null}

        {!selectedBusiness && activeTab === "favorites" ? (
          <FavoritesScreen
            isRtl={isRtl}
            onOpenBusiness={setSelectedBusiness}
            onOpenMarketplace={() => handleTabPress("marketplace")}
            styles={styles}
          />
        ) : null}

        {!selectedBusiness && activeTab === "marketplace" ? (
          <SearchMapScreen
            isRtl={isRtl}
            onOpenBusiness={setSelectedBusiness}
            onRetry={loadMarketplace}
            state={marketplaceState}
            styles={styles}
            text={text}
          />
        ) : null}

        {!selectedBusiness && activeTab === "quickBooking" ? (
          <QuickBookingEntryScreen
            isRtl={isRtl}
            onOpenMarketplace={() => handleTabPress("marketplace")}
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
            onOpenBooking={handleOpenBooking}
            onReturnHome={handleReturnHome}
            onSelectFilter={setBookingFilter}
            selectedBooking={selectedManagedBooking}
            styles={styles}
          />
        ) : null}

        {!selectedBusiness && activeTab === "messages" ? (
          <MessagesNotificationsPreviewScreen isRtl={isRtl} styles={styles} />
        ) : null}

        {!selectedBusiness && activeTab === "business" ? (
          <BusinessOwnerPreviewScreen isRtl={isRtl} styles={styles} />
        ) : null}

        {!selectedBusiness && activeTab === "account" ? (
          <AccountScreen
            isRtl={isRtl}
            onThemeModeChange={setThemeMode}
            styles={styles}
            text={text}
            themeMode={themeMode}
          />
        ) : null}
      </ScrollView>

      <BottomTabBar
        activeTab={activeTab}
        locale={locale}
        onTabPress={handleTabPress}
        styles={styles}
      />
    </SafeAreaView>
  );
}

function CustomerHomeScreen({
  isRtl,
  onOpenBusiness,
  onOpenMarketplace,
  styles,
}: {
  isRtl: boolean;
  onOpenBusiness: (business: PremiumBusiness) => void;
  onOpenMarketplace: () => void;
  styles: MobileStyles;
}) {
  return (
    <>
      <HeroCard isRtl={isRtl} styles={styles} />
      <SearchDiscoveryPanel
        isRtl={isRtl}
        onOpenMarketplace={onOpenMarketplace}
        styles={styles}
      />
      <CategoryGrid styles={styles} />
      <SectionHeader
        action="عرض الكل"
        isRtl={isRtl}
        styles={styles}
        title="قريب منك"
      />
      <View style={styles.homeBusinessGrid}>
        {featuredBusinesses.map((business) => (
          <View key={business.id} style={styles.homeBusinessCardSlot}>
            <PremiumBusinessCard
              business={business}
              isRtl={isRtl}
              onPress={() => onOpenBusiness(business)}
              styles={styles}
            />
          </View>
        ))}
      </View>
      <PromoCard isRtl={isRtl} styles={styles} />
    </>
  );
}

function FavoritesScreen({
  isRtl,
  onOpenBusiness,
  onOpenMarketplace,
  styles,
}: {
  isRtl: boolean;
  onOpenBusiness: (business: PremiumBusiness) => void;
  onOpenMarketplace: () => void;
  styles: MobileStyles;
}) {
  return (
    <>
      <PremiumStateCard
        body="مساحة مرئية آمنة للمفضلة. لا تضيف حفظاً أو مزامنة أو استدعاءات API حالياً."
        cta="استكشف السوق"
        icon="♡"
        isRtl={isRtl}
        label="المفضلة"
        onPress={onOpenMarketplace}
        styles={styles}
        title="أماكنك المفضلة ستكون هنا"
      />
      <SectionHeader
        action="معاينة"
        isRtl={isRtl}
        styles={styles}
        title="اقتراحات قريبة"
      />
      <View style={styles.homeBusinessGrid}>
        {featuredBusinesses.slice(0, 2).map((business) => (
          <View key={business.id} style={styles.homeBusinessCardSlot}>
            <PremiumBusinessCard
              business={business}
              isRtl={isRtl}
              onPress={() => onOpenBusiness(business)}
              styles={styles}
            />
          </View>
        ))}
      </View>
    </>
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
  return (
    <View style={styles.onboardingCard}>
      <View style={styles.onboardingGlow} />
      <View style={styles.onboardingPattern}>
        <View
          style={[
            styles.onboardingPatternLine,
            styles.onboardingPatternLineStart,
          ]}
        />
        <View style={styles.onboardingPatternLineTall} />
        <View
          style={[
            styles.onboardingPatternLine,
            styles.onboardingPatternLineEnd,
          ]}
        />
        <View style={styles.onboardingPatternArc} />
      </View>

      <View style={styles.onboardingLogo}>
        <Text style={styles.onboardingLogoText}>R</Text>
      </View>
      <Text style={[styles.onboardingBrand, isRtl && styles.rtlText]}>
        REZNO
      </Text>
      <Text style={[styles.onboardingSlogan, isRtl && styles.rtlText]}>
        Book Everything
      </Text>
      <Text style={[styles.onboardingBody, isRtl && styles.rtlText]}>
        احجز أي خدمة في أي وقت وبسهولة وثقة
      </Text>
      <View style={styles.onboardingHighlights}>
        {onboardingHighlights.map((item) => (
          <Text key={item} style={styles.onboardingHighlight}>
            {item}
          </Text>
        ))}
      </View>
      <View style={styles.onboardingActions}>
        <PrimaryButton label="ابدأ الآن" onPress={onStart} styles={styles} />
        <Pressable
          accessibilityRole="button"
          onPress={onStart}
          style={({ pressed }) => [
            styles.onboardingSecondary,
            pressed && styles.softButtonPressed,
          ]}
        >
          <Text style={styles.onboardingSecondaryText}>تسجيل الدخول</Text>
        </Pressable>
      </View>
    </View>
  );
}

function HeroCard({ isRtl, styles }: { isRtl: boolean; styles: MobileStyles }) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroGlow} />
      <View style={styles.heroTopRow}>
        <View style={styles.locationPill}>
          <Image
            alt=""
            resizeMode="contain"
            source={mobileIconAssets.common.locationPin}
            style={styles.locationIconImage}
          />
          <Text style={styles.locationText}>بغداد</Text>
        </View>
        <View style={styles.heroProfileBadge}>
          <Text style={styles.heroProfileText}>ع</Text>
          <View style={styles.heroProfileStatusDot} />
        </View>
      </View>
      <Text style={[styles.heroTitle, isRtl && styles.rtlText]}>
        مرحباً علي
      </Text>
      <Text style={[styles.heroEyebrow, isRtl && styles.rtlText]}>
        ما الخدمة التي تبحث عنها اليوم؟
      </Text>
    </View>
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
        ابحث عن خدمة، مطعم، عيادة...
      </Text>
      <View style={styles.voiceButton}>
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.locationPin}
          style={styles.voiceIconImage}
        />
      </View>
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

function CategoryGrid({ styles }: { styles: MobileStyles }) {
  return (
    <View style={styles.categoryGrid}>
      {categories.map((category) => (
        <View key={category.label} style={styles.categoryItem}>
          <View
            style={[
              styles.categoryIconTile,
              category.tone === "green" && styles.categoryIconTileGreen,
              category.tone === "blue" && styles.categoryIconTileBlue,
              category.tone === "rose" && styles.categoryIconTileRose,
              category.tone === "purple" && styles.categoryIconTilePurple,
              category.tone === "gold" && styles.categoryIconTileGold,
              category.tone === "neutral" && styles.categoryIconTileNeutral,
            ]}
          >
            {"icon" in category ? (
              <Image
                alt=""
                resizeMode="contain"
                source={category.icon}
                style={styles.categoryIconImage}
              />
            ) : (
              <CategoryFallbackMark mark={category.mark} styles={styles} />
            )}
          </View>
          <Text style={styles.categoryLabel}>{category.label}</Text>
        </View>
      ))}
    </View>
  );
}

function CategoryFallbackMark({
  mark,
  styles,
}: {
  mark: "book" | "car" | "more";
  styles: MobileStyles;
}) {
  if (mark === "book") {
    return (
      <View style={styles.categoryBookMark}>
        <View style={styles.categoryBookPage}>
          <View style={styles.categoryBookLine} />
          <View style={styles.categoryBookLineShort} />
          <View style={styles.categoryBookLine} />
        </View>
        <View style={styles.categoryBookPageRight} />
      </View>
    );
  }

  if (mark === "car") {
    return (
      <View style={styles.categoryCarMark}>
        <View style={styles.categoryCarRoof} />
        <View style={styles.categoryCarBody}>
          <View style={styles.categoryCarLight} />
          <View style={styles.categoryCarLight} />
        </View>
        <View style={styles.categoryCarWheelRow}>
          <View style={styles.categoryCarWheel} />
          <View style={styles.categoryCarWheel} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.categoryMoreMark}>
      <View style={styles.categoryMoreDot} />
      <View style={styles.categoryMoreDot} />
      <View style={styles.categoryMoreDot} />
    </View>
  );
}

function PromoCard({ isRtl, styles }: { isRtl: boolean; styles: MobileStyles }) {
  return (
    <View style={styles.promoCard}>
      <View>
        <Text style={[styles.promoTitle, isRtl && styles.rtlText]}>
          خصم 15%
        </Text>
        <Text style={[styles.promoBody, isRtl && styles.rtlText]}>
          على حجوزات التجميل
        </Text>
        <View style={styles.promoCoupon}>
          <Text style={styles.promoCouponText}>REZNO15</Text>
        </View>
      </View>
      <View style={styles.promoBadge}>
        <View style={styles.promoGiftBox}>
          <View style={styles.promoGiftRibbonVertical} />
          <View style={styles.promoGiftRibbonHorizontal} />
        </View>
      </View>
    </View>
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
      <View style={styles.businessMediaGlow} />
      <View style={styles.businessMediaVignette} />
      <View style={styles.businessMediaWallGlow} />
      <View style={styles.businessMediaLightRail}>
        <View style={styles.businessMediaLightLine} />
        <View style={styles.businessMediaLightLineShort} />
        <View style={styles.businessMediaLightLine} />
      </View>
      <View style={styles.businessMediaGoldArc} />
      <View style={styles.businessMediaFloor} />
      <View style={styles.businessMediaPanel} />
      <View style={styles.businessMediaFrame}>
        <View style={styles.businessMediaFrameInner} />
      </View>
      <View style={styles.businessMediaCounter} />
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

function PremiumBusinessCard({
  business,
  isRtl,
  onPress,
  styles,
}: {
  business: PremiumBusiness;
  isRtl: boolean;
  onPress?: () => void;
  styles: MobileStyles;
}) {
  const content = (
    <>
      <View style={styles.businessHero}>
        <BusinessMedia
          badge={business.status}
          initial={business.name.charAt(0)}
          styles={styles}
        />
      </View>
      <View style={styles.businessBody}>
        <View style={styles.businessTitleRow}>
          <View style={styles.businessCopy}>
            <Text style={[styles.businessName, isRtl && styles.rtlText]}>
              {business.name}
            </Text>
            <Text style={[styles.businessMeta, isRtl && styles.rtlText]}>
              {business.category} · {business.distance}
            </Text>
          </View>
          <View style={styles.ratingPill}>
            <Image
              alt=""
              resizeMode="contain"
              source={mobileIconAssets.common.starRating}
              style={styles.ratingIconImage}
            />
            <Text style={styles.ratingText}>{business.rating}</Text>
          </View>
        </View>
        <View style={styles.businessMetricsRow}>
          <Text style={styles.businessMetric}>{business.reviewCount}</Text>
          <Text style={styles.businessMetric}>{business.price}</Text>
        </View>
        <View style={styles.businessFooter}>
          <Text style={styles.priceText}>{business.distance}</Text>
          <Text style={styles.tagText}>{business.tag}</Text>
        </View>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityHint="يفتح شاشة تفاصيل النشاط المرئية بدون تنفيذ حجز حقيقي."
        accessibilityLabel={`فتح تفاصيل ${business.name}`}
        accessibilityRole="button"
        hitSlop={TOUCH_HIT_SLOP}
        onPress={onPress}
        style={({ pressed }) => [
          styles.businessCard,
          pressed && styles.businessCardPressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={styles.businessCard}>
      {content}
    </View>
  );
}

function SearchMapScreen({
  isRtl,
  onOpenBusiness,
  onRetry,
  state,
  styles,
  text,
}: {
  isRtl: boolean;
  onOpenBusiness: (business: PremiumBusiness) => void;
  onRetry: () => void;
  state: MarketplaceState;
  styles: MobileStyles;
  text: (typeof labels)[MobileLocale];
}) {
  return (
    <>
      <View style={styles.searchMapScreen}>
        <View style={styles.searchMapTopRow}>
          <SearchBar isRtl={isRtl} styles={styles} />
          <View style={styles.searchMapFilterButton}>
            <Image
              alt=""
              resizeMode="contain"
              source={mobileIconAssets.common.filter}
              style={styles.searchMapFilterIconImage}
            />
          </View>
        </View>

        <View style={styles.searchMapChipRow}>
          <Text style={styles.searchMapChipActive}>القرب</Text>
          <Text style={styles.searchMapChip}>الأعلى تقييماً</Text>
          <Text style={styles.searchMapChip}>جميع الفئات</Text>
        </View>

        <SearchMapCanvas styles={styles} />
      </View>

      <View style={styles.searchResultsSheet}>
        <Text style={[styles.searchResultsTitle, isRtl && styles.rtlText]}>
          نتائج بالقرب منك
        </Text>
        {featuredBusinesses.map((business, index) => (
          <SearchMapResultCard
            business={business}
            index={index}
            isRtl={isRtl}
            key={business.id}
            onPress={() => onOpenBusiness(business)}
            styles={styles}
          />
        ))}
      </View>

      <SearchMapApiStatus
        isRtl={isRtl}
        onRetry={onRetry}
        state={state}
        styles={styles}
        text={text}
      />
    </>
  );
}

function SearchMapCanvas({ styles }: { styles: MobileStyles }) {
  return (
    <View style={styles.searchMapCanvas}>
      <View style={[styles.mapRoad, styles.mapRoadOne]} />
      <View style={[styles.mapRoad, styles.mapRoadTwo]} />
      <View style={[styles.mapRoad, styles.mapRoadThree]} />
      <View style={styles.mapPulseOuter}>
        <View style={styles.mapPulseMiddle}>
          <View style={styles.mapPulseCore} />
        </View>
      </View>
      <View style={[styles.mapPin, styles.mapPinGreen, styles.mapPinOne]}>
        <View style={styles.mapPinDot} />
      </View>
      <View style={[styles.mapPin, styles.mapPinGold, styles.mapPinTwo]}>
        <View style={styles.mapPinDot} />
      </View>
      <View style={[styles.mapPin, styles.mapPinRose, styles.mapPinThree]}>
        <View style={styles.mapPinDot} />
      </View>
      <View style={[styles.mapPin, styles.mapPinPurple, styles.mapPinFour]}>
        <View style={styles.mapPinDot} />
      </View>
      <View style={[styles.mapBusinessPin, styles.mapBusinessPinOne]}>
        <BusinessMedia badge="متاح" styles={styles} />
      </View>
      <View style={[styles.mapBusinessPin, styles.mapBusinessPinTwo]}>
        <BusinessMedia badge="قريب" styles={styles} />
      </View>
      <View style={[styles.mapBusinessPin, styles.mapBusinessPinThree]}>
        <BusinessMedia badge="VIP" styles={styles} />
      </View>
    </View>
  );
}

function SearchMapResultCard({
  business,
  index,
  isRtl,
  onPress,
  styles,
}: {
  business: PremiumBusiness;
  index: number;
  isRtl: boolean;
  onPress: () => void;
  styles: MobileStyles;
}) {
  return (
    <Pressable
      accessibilityHint="يفتح شاشة تفاصيل النشاط المرئية بدون تنفيذ إجراء حقيقي."
      accessibilityLabel={`فتح تفاصيل ${business.name}`}
      accessibilityRole="button"
      hitSlop={TOUCH_HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.searchResultCard,
        pressed && styles.searchResultCardPressed,
      ]}
    >
      <View style={styles.searchResultMedia}>
        <BusinessMedia badge={business.tag} styles={styles} />
      </View>
      <View style={styles.searchResultCopy}>
        <Text style={[styles.searchResultName, isRtl && styles.rtlText]}>
          {business.name}
        </Text>
        <Text style={[styles.searchResultMeta, isRtl && styles.rtlText]}>
          {business.category} · {business.status}
        </Text>
        <View style={styles.searchResultStats}>
          <Image
            alt=""
            resizeMode="contain"
            source={mobileIconAssets.common.starRating}
            style={styles.searchResultStarImage}
          />
          <Text style={styles.searchResultRating}>{business.rating}</Text>
          <Text style={styles.searchResultReviews}>
            ({business.reviewCount.replace(" تقييم", "")})
          </Text>
        </View>
        <Text style={styles.searchResultPrice}>{business.price}</Text>
      </View>
      <View style={styles.searchResultActions}>
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.heart}
          style={styles.searchResultHeartImage}
        />
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.share}
          style={styles.searchResultShareImage}
        />
        <Text style={styles.searchResultDistance}>
          {index === 0 ? "0.6 كم" : business.distance}
        </Text>
      </View>
    </Pressable>
  );
}

function SearchMapApiStatus({
  isRtl,
  onRetry,
  state,
  styles,
  text,
}: {
  isRtl: boolean;
  onRetry: () => void;
  state: MarketplaceState;
  styles: MobileStyles;
  text: (typeof labels)[MobileLocale];
}) {
  if (state.status === "error") {
    return (
      <PremiumStateCard
        body={state.message}
        cta={text.marketplaceRetry}
        icon="!"
        isRtl={isRtl}
        label={text.marketplaceErrorTitle}
        onPress={onRetry}
        styles={styles}
        title="تعذر تحميل السوق الحقيقي"
        tone="warning"
      />
    );
  }

  if (state.status === "loaded") {
    return (
      <View style={styles.searchMapBoundaryCard}>
        <Text style={[styles.boundaryPill, isRtl && styles.rtlText]}>
          بيانات السوق
        </Text>
        <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
          تم الحفاظ على مسار السوق الحالي
        </Text>
        <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
          {state.businesses.length} نشاط من API متاح بدون تغيير منطق الجلب.
        </Text>
      </View>
    );
  }

  return null;
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
  onStartBooking: () => void;
  styles: MobileStyles;
}) {
  return (
    <>
      <View style={styles.salonHero}>
        <View style={styles.salonHeroPattern}>
          <View style={styles.salonHeroLineTall} />
          <View style={styles.salonHeroLine} />
          <View style={styles.salonHeroLineTall} />
          <View style={styles.salonHeroLine} />
        </View>
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
          <VisualIconButton
            iconSource={mobileIconAssets.common.share}
            label="مشاركة"
            styles={styles}
          />
        </View>
        <View style={styles.salonHeroCenterpiece}>
          <View style={styles.salonHeroOrb}>
            <Text style={styles.salonHeroOrbText}>R</Text>
          </View>
          <Text style={[styles.salonHeroKicker, isRtl && styles.rtlText]}>
            تجربة صالون فاخرة
          </Text>
          <Text style={[styles.salonHeroCaption, isRtl && styles.rtlText]}>
            خدمات مختارة وحجز واضح بخطوات آمنة
          </Text>
        </View>
        <View style={styles.salonHeroStage}>
          <BusinessMedia badge={business.status} styles={styles} />
        </View>
      </View>

      <View style={styles.salonInfoCard}>
        <View style={styles.salonTitleRow}>
          <View style={styles.rowCopy}>
            <View style={styles.salonVerifiedRow}>
              <Text style={[styles.salonName, isRtl && styles.rtlText]}>
                {business.name}
              </Text>
              <Image
                alt=""
                resizeMode="contain"
                source={mobileIconAssets.common.checkSuccess}
                style={styles.verifiedBadgeImage}
              />
            </View>
            <Text style={[styles.salonMeta, isRtl && styles.rtlText]}>
              اسطنبول · {business.category} · {business.distance}
            </Text>
          </View>
          <Text style={styles.salonLikes}>❤ 128</Text>
        </View>
        <View style={styles.salonRatingRow}>
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
            label="واتساب"
            styles={styles}
          />
        </View>

        <View style={styles.salonTabs}>
          {["نبذة", "التقييمات", "العروض", "الصور", "الخدمات"].map(
            (tab, index) => (
              <Text
                key={tab}
                style={[
                  styles.salonTabText,
                  index === 4 && styles.salonTabTextActive,
                ]}
              >
                {tab}
              </Text>
            ),
          )}
        </View>
      </View>

      <View style={styles.salonServicesList}>
        {services.map((service, index) => (
          <View key={service.name} style={styles.salonServiceRow}>
            <View style={styles.salonServiceMain}>
              <View style={styles.salonServiceMedia}>
                <BusinessMedia
                  badge={index === 0 ? "رائج" : service.tag}
                  styles={styles}
                />
              </View>
              <View style={styles.salonServiceCopy}>
                <Text style={[styles.salonServiceName, isRtl && styles.rtlText]}>
                  {index === 0 ? "قص شعر" : service.name}
                </Text>
                <Text style={[styles.salonServiceMeta, isRtl && styles.rtlText]}>
                  {service.duration} · عرض مرئي
                </Text>
              </View>
            </View>
            <View style={styles.salonServiceActionBlock}>
              <Text style={styles.salonServicePrice}>
                {index === 0 ? "250 TL" : service.price}
              </Text>
              <View style={styles.salonServiceAdd}>
                <Text style={styles.salonServiceAddText}>+</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.salonBottomCta}>
        <PrimaryButton
          label="احجز الآن"
          onPress={onStartBooking}
          styles={styles}
        />
        <View style={styles.salonCtaArrow}>
          <Text style={styles.salonCtaArrowText}>‹</Text>
        </View>
      </View>
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
  business,
  date,
  isRtl,
  onBack,
  onConfirm,
  onDateSelect,
  onPaymentSelect,
  onReturnHome,
  onStaffSelect,
  onStepChange,
  onTimeSelect,
  onViewBookings,
  payment,
  service,
  staff,
  step,
  styles,
  time,
}: {
  business: PremiumBusiness;
  date: BookingDateOption;
  isRtl: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onDateSelect: (date: BookingDateOption) => void;
  onPaymentSelect: (payment: BookingPaymentOption) => void;
  onReturnHome: () => void;
  onStaffSelect: (staff: BookingStaffOption) => void;
  onStepChange: (step: BookingFlowStepId) => void;
  onTimeSelect: (time: BookingTimeOption) => void;
  onViewBookings: () => void;
  payment: BookingPaymentOption;
  service: (typeof services)[number];
  staff: BookingStaffOption;
  step: BookingFlowStepId;
  styles: MobileStyles;
  time: BookingTimeOption;
}) {
  if (step === "staff") {
    return (
      <StaffSelectionStep
        business={business}
        isRtl={isRtl}
        onBack={onBack}
        onNext={() => onStepChange("datetime")}
        onStaffSelect={onStaffSelect}
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
        business={business}
        date={date}
        isRtl={isRtl}
        onBack={onBack}
        onConfirm={onConfirm}
        onPaymentSelect={onPaymentSelect}
        payment={payment}
        service={service}
        staff={staff}
        styles={styles}
        time={time}
      />
    );
  }

  return (
    <BookingConfirmationStep
      business={business}
      date={date}
      isRtl={isRtl}
      onReturnHome={onReturnHome}
      onViewBookings={onViewBookings}
      payment={payment}
      service={service}
      staff={staff}
      styles={styles}
      time={time}
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
  business,
  date,
  isRtl,
  payment,
  service,
  staff,
  styles,
  time,
}: {
  business: PremiumBusiness;
  date: BookingDateOption;
  isRtl: boolean;
  payment?: BookingPaymentOption;
  service: (typeof services)[number];
  staff: BookingStaffOption;
  styles: MobileStyles;
  time?: BookingTimeOption;
}) {
  return (
    <View style={styles.bookingMiniSummary}>
      <SummaryItem
        label="النشاط"
        styles={styles}
        value={business.name}
      />
      <SummaryItem
        label="الخدمة"
        styles={styles}
        value={`${service.name} · ${service.price}`}
      />
      <SummaryItem label="المختص" styles={styles} value={staff.name} />
      <SummaryItem
        label="الموعد"
        styles={styles}
        value={`${date.day} ${date.label}${time ? ` · ${time.label}` : ""}`}
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
  business,
  isRtl,
  onBack,
  onNext,
  onStaffSelect,
  selectedStaff,
  service,
  styles,
}: {
  business: PremiumBusiness;
  isRtl: boolean;
  onBack: () => void;
  onNext: () => void;
  onStaffSelect: (staff: BookingStaffOption) => void;
  selectedStaff: BookingStaffOption;
  service: (typeof services)[number];
  styles: MobileStyles;
}) {
  return (
    <View style={styles.bookingStepScreen}>
      <BookingFlowHeader
        isRtl={isRtl}
        onBack={onBack}
        stepLabel="الخطوة 01"
        styles={styles}
        subtitle="اختر مختصاً أو اترك REZNO يختار أقرب وقت مناسب."
        title="اختر المختص"
      />

      <View style={styles.bookingSearchField}>
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.search}
          style={styles.bookingSearchIconImage}
        />
        <Text style={[styles.bookingSearchPlaceholder, isRtl && styles.rtlText]}>
          ابحث عن مختص أو اختر بدون تفضيل
        </Text>
      </View>

      <View style={styles.bookingOptionList}>
        {bookingStaffOptions.map((staff) => {
          const selected = staff.id === selectedStaff.id;
          const staffIdentity = (
            <View
              style={[
                styles.staffIdentityBlock,
                isRtl && styles.staffIdentityBlockRtl,
              ]}
            >
              <View style={styles.staffAvatar}>
                <Text style={styles.staffAvatarText}>
                  {staff.id === "any" ? "R" : staff.name.charAt(0)}
                </Text>
              </View>
              <Text style={[styles.staffNameText, isRtl && styles.rtlText]}>
                {staff.name}
              </Text>
            </View>
          );
          const staffDetails = (
            <View
              style={[
                styles.staffDetailsBlock,
                isRtl && styles.staffDetailsBlockRtl,
              ]}
            >
              <View
                style={[
                  styles.staffRatingPill,
                  isRtl && styles.staffRatingPillRtl,
                ]}
              >
                <Image
                  alt=""
                  resizeMode="contain"
                  source={mobileIconAssets.common.starRating}
                  style={styles.staffRatingIconImage}
                />
                <Text style={styles.staffRatingText}>{staff.rating}</Text>
              </View>
              <Text style={[styles.staffRoleText, isRtl && styles.rtlText]}>
                {staff.role}
              </Text>
              <Text style={[styles.staffExperience, isRtl && styles.rtlText]}>
                {staff.experience}
              </Text>
            </View>
          );
          const selectionIndicator = (
            <View
              style={[
                styles.staffSelectionIndicator,
                selected && styles.staffSelectionIndicatorActive,
              ]}
            >
              <View
                style={[
                  styles.bookingRadio,
                  selected && styles.bookingRadioActive,
                ]}
              >
                {selected ? <View style={styles.bookingRadioDot} /> : null}
              </View>
            </View>
          );

          return (
            <Pressable
              accessibilityHint="يحدد المختص محلياً فقط ولا يرسل أي طلب."
              accessibilityLabel={`اختيار ${staff.name}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={staff.id}
              onPress={() => onStaffSelect(staff)}
              style={({ pressed }) => [
                styles.staffSelectionCard,
                selected && styles.staffSelectionCardActive,
                pressed && styles.softButtonPressed,
              ]}
            >
              {isRtl ? (
                <>
                  {selectionIndicator}
                  {staffDetails}
                  {staffIdentity}
                </>
              ) : (
                <>
                  {staffIdentity}
                  {staffDetails}
                  {selectionIndicator}
                </>
              )}
            </Pressable>
          );
        })}
      </View>

      <BookingMiniSummary
        business={business}
        date={bookingDateOptions[0]}
        isRtl={isRtl}
        service={service}
        staff={selectedStaff}
        styles={styles}
      />

      <View style={styles.bookingBottomAction}>
        <PrimaryButton label="التالي" onPress={onNext} styles={styles} />
      </View>
    </View>
  );
}

function DateTimeSelectionStep({
  date,
  isRtl,
  onBack,
  onDateSelect,
  onNext,
  onTimeSelect,
  styles,
  time,
}: {
  date: BookingDateOption;
  isRtl: boolean;
  onBack: () => void;
  onDateSelect: (date: BookingDateOption) => void;
  onNext: () => void;
  onTimeSelect: (time: BookingTimeOption) => void;
  styles: MobileStyles;
  time: BookingTimeOption;
}) {
  return (
    <View style={styles.bookingStepScreen}>
      <BookingFlowHeader
        isRtl={isRtl}
        onBack={onBack}
        stepLabel="الخطوة 02"
        styles={styles}
        subtitle="الأوقات هنا عرض محلي فقط، ولا يتم فحص التوفر الحقيقي."
        title="اختر التاريخ والوقت"
      />

      <View style={styles.bookingDateRail}>
        {bookingDateOptions.map((item) => {
          const selected = item.id === date.id;

          return (
            <Pressable
              accessibilityHint="يحدد التاريخ محلياً فقط."
              accessibilityLabel={`اختيار ${item.day} ${item.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={item.id}
              onPress={() => onDateSelect(item)}
              style={({ pressed }) => [
                styles.datePill,
                selected && styles.datePillActive,
                pressed && styles.softButtonPressed,
              ]}
            >
              <Text style={[styles.dateDay, selected && styles.dateDayActive]}>
                {item.day}
              </Text>
              <Text
                style={[styles.dateLabel, selected && styles.dateLabelActive]}
              >
                {item.label}
              </Text>
              <Text style={[styles.dateMeta, selected && styles.dateMetaActive]}>
                {item.meta}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.bookingLegendRow}>
        <LegendItem label="متاح" styles={styles} tone="available" />
        <LegendItem label="محدود" styles={styles} tone="limited" />
        <LegendItem label="محجوز" styles={styles} tone="booked" />
      </View>

      <View style={styles.bookingTimeGrid}>
        {bookingTimeOptions.map((item) => {
          const selected = item.id === time.id;
          const booked = item.state === "booked";

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
                styles.bookingTimeSlot,
                item.state === "limited" && styles.bookingTimeSlotLimited,
                booked && styles.bookingTimeSlotBooked,
                selected && styles.bookingTimeSlotActive,
                pressed && !booked && styles.softButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.timeSlotText,
                  selected && styles.timeSlotTextActive,
                  booked && styles.bookingTimeSlotTextMuted,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.bookingBottomAction}>
        <PrimaryButton label="التالي" onPress={onNext} styles={styles} />
      </View>
    </View>
  );
}

function LegendItem({
  label,
  styles,
  tone,
}: {
  label: string;
  styles: MobileStyles;
  tone: "available" | "booked" | "limited";
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendDot,
          tone === "limited" && styles.legendDotLimited,
          tone === "booked" && styles.legendDotBooked,
        ]}
      />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function PaymentMethodStep({
  business,
  date,
  isRtl,
  onBack,
  onConfirm,
  onPaymentSelect,
  payment,
  service,
  staff,
  styles,
  time,
}: {
  business: PremiumBusiness;
  date: BookingDateOption;
  isRtl: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onPaymentSelect: (payment: BookingPaymentOption) => void;
  payment: BookingPaymentOption;
  service: (typeof services)[number];
  staff: BookingStaffOption;
  styles: MobileStyles;
  time: BookingTimeOption;
}) {
  return (
    <View style={styles.bookingStepScreen}>
      <BookingFlowHeader
        isRtl={isRtl}
        onBack={onBack}
        stepLabel="الخطوة 03"
        styles={styles}
        subtitle="اختيار طريقة الدفع مرئي فقط ولا يضيف أي تكامل دفع."
        title="طريقة الدفع"
      />

      <View style={styles.paymentOptionList}>
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
                styles.paymentMethodCard,
                selected && styles.paymentMethodCardActive,
                pressed && styles.softButtonPressed,
              ]}
            >
              <View style={styles.paymentMethodIcon}>
                <Image
                  alt=""
                  resizeMode="contain"
                  source={mobileIconAssets.common.paymentCard}
                  style={styles.paymentMethodIconImage}
                />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
                  {item.label}
                </Text>
                <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
                  {item.meta}
                </Text>
              </View>
              <View
                style={[
                  styles.bookingRadio,
                  selected && styles.bookingRadioActive,
                ]}
              >
                {selected ? <View style={styles.bookingRadioDot} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <BookingMiniSummary
        business={business}
        date={date}
        isRtl={isRtl}
        payment={payment}
        service={service}
        staff={staff}
        styles={styles}
        time={time}
      />

      <View style={styles.securePaymentCard}>
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.checkSuccess}
          style={styles.securePaymentIconImage}
        />
        <Text style={[styles.securePaymentText, isRtl && styles.rtlText]}>
          عملية دفع آمنة ومشفرة — عرض بصري فقط بدون أي معالجة حقيقية.
        </Text>
      </View>

      <View style={styles.bookingBottomAction}>
        <PrimaryButton
          label={payment.id === "venue" ? "تأكيد الحجز" : "ادفع الآن"}
          onPress={onConfirm}
          styles={styles}
        />
      </View>
    </View>
  );
}

function BookingConfirmationStep({
  business,
  date,
  isRtl,
  onReturnHome,
  onViewBookings,
  payment,
  service,
  staff,
  styles,
  time,
}: {
  business: PremiumBusiness;
  date: BookingDateOption;
  isRtl: boolean;
  onReturnHome: () => void;
  onViewBookings: () => void;
  payment: BookingPaymentOption;
  service: (typeof services)[number];
  staff: BookingStaffOption;
  styles: MobileStyles;
  time: BookingTimeOption;
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
        business={business}
        date={date}
        isRtl={isRtl}
        payment={payment}
        service={service}
        staff={staff}
        styles={styles}
        time={time}
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
  onOpenBooking,
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
  onOpenBooking: (booking: VisualBooking) => void;
  onReturnHome: () => void;
  onSelectFilter: (filter: BookingListFilter) => void;
  selectedBooking: VisualBooking | null;
  styles: MobileStyles;
}) {
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
    if (filter === "upcoming") {
      return booking.status === "confirmed" || booking.status === "pending";
    }

    if (filter === "past") {
      return booking.status === "completed";
    }

    return booking.status === "cancelled";
  });

  return (
    <View style={styles.bookingsScreen}>
      <View style={styles.bookingsTopRow}>
        <View style={styles.rowCopy}>
          <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
            إدارة الحجز
          </Text>
          <Text style={[styles.screenTitle, isRtl && styles.rtlText]}>
            حجوزاتي
          </Text>
          <Text style={[styles.screenDescription, isRtl && styles.rtlText]}>
            بطاقات عرض محلية لإدارة الحجوزات بصرياً بدون أي تعديل حقيقي.
          </Text>
        </View>
        <View style={styles.bookingsBell}>
          <Image
            alt=""
            resizeMode="contain"
            source={mobileIconAssets.common.notificationBell}
            style={styles.bookingsBellIcon}
          />
        </View>
      </View>

      <View style={styles.bookingsSegmentedTabs}>
        {bookingFilterTabs.map((tab) => {
          const selected = tab.id === filter;

          return (
            <Pressable
              accessibilityHint="يغير فلتر حجوزاتي محلياً فقط."
              accessibilityLabel={`عرض الحجوزات ${tab.label}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={tab.id}
              onPress={() => onSelectFilter(tab.id)}
              style={({ pressed }) => [
                styles.bookingsSegment,
                selected && styles.bookingsSegmentActive,
                pressed && styles.softButtonPressed,
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
            </Pressable>
          );
        })}
      </View>

      <View style={styles.bookingsList}>
        {filteredBookings.length > 0 ? (
          filteredBookings.map((booking) => (
            <BookingCard
              booking={booking}
              isRtl={isRtl}
              key={booking.id}
              onCancelBooking={onCancelBooking}
              onEditBooking={onEditBooking}
              onOpenBooking={onOpenBooking}
              styles={styles}
            />
          ))
        ) : (
          <PremiumStateCard
            body="لا توجد بطاقات في هذا التصنيف حالياً. أي تغيير هنا مرئي فقط ولا يقرأ بيانات حقيقية."
            icon="0"
            isRtl={isRtl}
            label="حالة فارغة"
            styles={styles}
            title="لا توجد حجوزات هنا"
          />
        )}
      </View>
    </View>
  );
}

function BookingCard({
  booking,
  isRtl,
  onCancelBooking,
  onEditBooking,
  onOpenBooking,
  styles,
}: {
  booking: VisualBooking;
  isRtl: boolean;
  onCancelBooking: (booking: VisualBooking) => void;
  onEditBooking: (booking: VisualBooking) => void;
  onOpenBooking: (booking: VisualBooking) => void;
  styles: MobileStyles;
}) {
  const cancelled = booking.status === "cancelled";
  const statusPill = (
    <Text
      style={[
        styles.managedStatusPill,
        booking.status === "pending" && styles.managedStatusPillWarning,
        booking.status === "completed" && styles.managedStatusPillSuccess,
        cancelled && styles.managedStatusPillCancelled,
      ]}
    >
      {booking.statusLabel}
    </Text>
  );
  const bookingTitle = (
    <Text style={[styles.managedBookingTitle, isRtl && styles.rtlText]}>
      {booking.businessName}
    </Text>
  );

  return (
    <Pressable
      accessibilityHint="يفتح تفاصيل حجز مرئي فقط."
      accessibilityLabel={`عرض حجز ${booking.businessName}`}
      accessibilityRole="button"
      onPress={() => onOpenBooking(booking)}
      style={({ pressed }) => [
        styles.managedBookingCard,
        pressed && styles.softButtonPressed,
      ]}
    >
      <View style={styles.managedBookingHeader}>
        <View style={styles.managedBookingMedia}>
          <BusinessMedia badge={booking.statusLabel} styles={styles} />
        </View>
        <View style={styles.managedBookingCopy}>
          <View style={styles.managedBookingTitleRow}>
            {isRtl ? (
              <>
                {statusPill}
                {bookingTitle}
              </>
            ) : (
              <>
                {bookingTitle}
                {statusPill}
              </>
            )}
          </View>
          <Text style={[styles.managedBookingMeta, isRtl && styles.rtlText]}>
            {booking.serviceName} · {booking.category}
          </Text>
          <View
            style={[
              styles.managedBookingInfoGrid,
              isRtl && styles.managedBookingInfoGridRtl,
            ]}
          >
            <BookingInfoPill
              iconSource={mobileIconAssets.common.calendar}
              isRtl={isRtl}
              label={`${booking.date} · ${booking.time}`}
              styles={styles}
            />
            <BookingInfoPill
              iconSource={mobileIconAssets.common.paymentCard}
              isRtl={isRtl}
              label={booking.price}
              styles={styles}
            />
          </View>
          <Text style={[styles.managedBookingMeta, isRtl && styles.rtlText]}>
            المختص: {booking.staff}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.managedBookingActions,
          isRtl && styles.managedBookingActionsRtl,
        ]}
      >
        <BookingActionButton
          label="عرض"
          onPress={() => onOpenBooking(booking)}
          styles={styles}
          tone="primary"
        />
        <BookingActionButton
          label="تعديل"
          onPress={() => onEditBooking(booking)}
          styles={styles}
          tone="neutral"
        />
        <BookingActionButton
          disabled={cancelled}
          label="إلغاء"
          onPress={() => onCancelBooking(booking)}
          styles={styles}
          tone="danger"
        />
      </View>
    </Pressable>
  );
}

function BookingInfoPill({
  iconSource,
  isRtl,
  label,
  styles,
}: {
  iconSource: ImageSourcePropType;
  isRtl: boolean;
  label: string;
  styles: MobileStyles;
}) {
  return (
    <View style={[styles.bookingInfoPill, isRtl && styles.bookingInfoPillRtl]}>
      <Image
        alt=""
        resizeMode="contain"
        source={iconSource}
        style={styles.bookingInfoPillIcon}
      />
      <Text style={[styles.bookingInfoPillText, isRtl && styles.rtlText]}>
        {label}
      </Text>
    </View>
  );
}

function BookingActionButton({
  disabled,
  label,
  onPress,
  styles,
  tone,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  styles: MobileStyles;
  tone: "danger" | "neutral" | "primary";
}) {
  return (
    <Pressable
      accessibilityHint="إجراء إدارة مرئي فقط ولا يغير حجزاً حقيقياً."
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={TOUCH_HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bookingActionButton,
        tone === "primary" && styles.bookingActionButtonPrimary,
        tone === "danger" && styles.bookingActionButtonDanger,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.softButtonPressed,
      ]}
    >
      <Text
        style={[
          styles.bookingActionButtonText,
          tone === "primary" && styles.bookingActionButtonTextPrimary,
          tone === "danger" && styles.bookingActionButtonTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
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
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
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
          <Text style={styles.messageSafetyBadge}>معاينة آمنة</Text>
        </View>
        <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
          الرسائل والإشعارات
        </Text>
        <Text style={[styles.messageHeroTitle, isRtl && styles.rtlText]}>
          تواصل واضح حول كل حجز بدون منطق إرسال حقيقي
        </Text>
        <Text style={[styles.messageHeroBody, isRtl && styles.rtlText]}>
          هذه واجهة عرض فقط. لا توجد إشعارات دفع، صلاحيات جهاز، WebSocket، أو
          إرسال رسائل عبر API.
        </Text>
      </View>

      <NotificationsCenterPreview isRtl={isRtl} styles={styles} />
      <ConversationListPreview isRtl={isRtl} styles={styles} />
      <MessageDetailPreview isRtl={isRtl} styles={styles} />
      <NotificationPreferencesPreview isRtl={isRtl} styles={styles} />
    </>
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
  onThemeModeChange,
  styles,
  text,
  themeMode,
}: {
  isRtl: boolean;
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
          {languagePreferenceRows.map((row) => (
            <View key={row.label} style={styles.accountPreferenceRow}>
              <View
                style={[
                  styles.accountPreferenceDot,
                  row.selected && styles.accountPreferenceDotActive,
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
                {row.selected ? "✓" : "›"}
              </Text>
            </View>
          ))}
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
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    bookingBackIconImage: {
      height: 22,
      tintColor: theme.colors.foreground,
      width: 22,
    },
    bookingBottomAction: {
      marginTop: 10,
      paddingBottom: 112,
    },
    bookingDateRail: {
      flexDirection: "row",
      gap: 9,
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
      backgroundColor: theme.colors.card,
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
      paddingBottom: 112,
    },
    bookingSearchField: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
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
      flexDirection: "row",
      gap: 14,
    },
    bookingStepScreen: {
      gap: 16,
      paddingBottom: 124,
      paddingHorizontal: 20,
      paddingTop: 38,
    },
    bookingTimeGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    bookingTimeSlot: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexGrow: 1,
      minWidth: 74,
      paddingHorizontal: 14,
      paddingVertical: 12,
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
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 38,
      minWidth: 82,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    bookingActionButtonDanger: {
      backgroundColor: theme.colors.dangerSoft,
      borderColor: theme.colors.danger,
    },
    bookingActionButtonPrimary: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
    },
    bookingActionButtonText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 12,
      textAlign: "center",
    },
    bookingActionButtonTextDanger: {
      color: theme.colors.danger,
    },
    bookingActionButtonTextPrimary: {
      color: theme.colors.foregroundInverse,
    },
    bookingDetailActions: {
      gap: 12,
      paddingBottom: 120,
    },
    bookingDetailHero: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
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
      borderColor: "rgba(255, 193, 58, 0.2)",
      borderRadius: 24,
      borderWidth: 1,
      flexShrink: 0,
      height: 116,
      overflow: "hidden",
      width: 124,
    },
    bookingDetailScreen: {
      gap: 16,
      paddingBottom: 124,
      paddingHorizontal: 20,
      paddingTop: 38,
    },
    bookingDetailSummary: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 28,
      borderWidth: 1,
      gap: 9,
      padding: 16,
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
    bookingsBell: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 22,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    bookingsBellIcon: {
      height: 22,
      tintColor: theme.colors.gold,
      width: 22,
    },
    bookingsList: {
      gap: 12,
      paddingBottom: 118,
    },
    bookingsScreen: {
      gap: 16,
      paddingBottom: 132,
      paddingHorizontal: 20,
      paddingTop: 34,
    },
    bookingsSegment: {
      alignItems: "center",
      borderRadius: theme.radii.pill,
      flex: 1,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    bookingsSegmentActive: {
      backgroundColor: theme.colors.gold,
    },
    bookingsSegmentText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      textAlign: "center",
    },
    bookingsSegmentTextActive: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiSemiBold,
    },
    bookingsSegmentedTabs: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      padding: 4,
    },
    bookingsTopRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
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
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginTop: 10,
    },
    managedBookingActionsRtl: {
      flexDirection: "row-reverse",
    },
    managedBookingCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 26,
      borderWidth: 1,
      padding: 12,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: theme.isDark ? 0.26 : 0.09,
      shadowRadius: 26,
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
      gap: 7,
      marginTop: 8,
    },
    managedBookingInfoGridRtl: {
      flexDirection: "row-reverse",
    },
    managedBookingMedia: {
      borderColor: "rgba(255, 193, 58, 0.18)",
      borderRadius: 20,
      borderWidth: 1,
      flexShrink: 0,
      height: 88,
      overflow: "hidden",
      width: 102,
    },
    managedBookingMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },
    managedBookingTitle: {
      color: theme.colors.foreground,
      flexShrink: 1,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 18.5,
      lineHeight: 25,
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
      gap: 7,
      padding: 12,
      paddingTop: 10,
    },
    businessCard: {
      ...createMobileSurface(theme, {
        radius: 28,
        tone: "elevated",
      }),
      borderColor: theme.colors.border,
      flex: 1,
      overflow: "hidden",
      ...createMobileShadow(theme, {
        darkOpacity: 0.42,
        height: 20,
        lightOpacity: 0.12,
        radius: 32,
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
    businessFooter: {
      alignItems: "flex-start",
      borderTopColor: theme.colors.goldSoft,
      borderTopWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      justifyContent: "space-between",
      paddingTop: 9,
    },
    businessMediaBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "#050608",
    },
    businessHero: {
      backgroundColor: "#050608",
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      height: 108,
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
      backgroundColor: "rgba(255, 193, 58, 0.88)",
      borderRadius: 999,
      bottom: 27,
      height: 16,
      left: 84,
      position: "absolute",
      width: 16,
    },
    businessMediaChairBack: {
      backgroundColor: "rgba(255, 193, 58, 0.12)",
      borderColor: "rgba(255, 193, 58, 0.56)",
      borderRadius: 18,
      borderWidth: 1,
      bottom: 30,
      height: 42,
      left: 46,
      position: "absolute",
      width: 46,
    },
    businessMediaChairSeat: {
      backgroundColor: "rgba(255, 193, 58, 0.38)",
      borderRadius: 999,
      bottom: 22,
      height: 13,
      left: 34,
      position: "absolute",
      width: 76,
    },
    businessMediaCounter: {
      backgroundColor: "rgba(18, 10, 6, 0.82)",
      borderTopColor: "rgba(255, 193, 58, 0.24)",
      borderTopWidth: 1,
      bottom: 0,
      height: 26,
      left: 0,
      position: "absolute",
      right: 0,
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
    businessMediaFloor: {
      backgroundColor: "rgba(61, 33, 20, 0.52)",
      bottom: 0,
      height: 42,
      left: 0,
      position: "absolute",
      right: 0,
    },
    businessMediaFrame: {
      backgroundColor: "rgba(255, 248, 236, 0.04)",
      borderColor: "rgba(255, 193, 58, 0.32)",
      borderRadius: 20,
      borderWidth: 1,
      bottom: 32,
      height: 46,
      position: "absolute",
      right: 20,
      transform: [{ rotate: "5deg" }],
      width: 54,
    },
    businessMediaFrameInner: {
      borderColor: "rgba(255, 193, 58, 0.28)",
      borderRadius: 15,
      borderWidth: 1,
      bottom: 7,
      left: 7,
      position: "absolute",
      right: 7,
      top: 7,
    },
    businessMediaGoldArc: {
      borderColor: "rgba(255, 193, 58, 0.18)",
      borderRadius: 999,
      borderTopWidth: 1,
      height: 130,
      left: -18,
      position: "absolute",
      top: 18,
      transform: [{ rotate: "-12deg" }],
      width: 210,
    },
    businessMediaGlow: {
      backgroundColor: "rgba(255, 193, 58, 0.2)",
      borderRadius: 999,
      height: 150,
      left: -36,
      opacity: theme.isDark ? 0.96 : 0.7,
      position: "absolute",
      top: -60,
      width: 150,
    },
    businessMediaLightLine: {
      backgroundColor: "rgba(255, 193, 58, 0.28)",
      borderRadius: 999,
      height: 80,
      width: 2,
    },
    businessMediaLightLineShort: {
      backgroundColor: "rgba(255, 193, 58, 0.2)",
      borderRadius: 999,
      height: 56,
      width: 2,
    },
    businessMediaLightRail: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 30,
      left: 20,
      opacity: 0.9,
      position: "absolute",
      top: 0,
    },
    businessMediaPanel: {
      backgroundColor: "rgba(255, 248, 236, 0.045)",
      borderColor: "rgba(255, 193, 58, 0.2)",
      borderRadius: 22,
      borderWidth: 1,
      bottom: 26,
      height: 52,
      left: 32,
      position: "absolute",
      transform: [{ rotate: "-4deg" }],
      width: 108,
    },
    businessMediaVignette: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(0, 0, 0, 0.14)",
    },
    businessMediaWallGlow: {
      backgroundColor: "rgba(255, 248, 236, 0.08)",
      borderRadius: 999,
      height: 88,
      opacity: 0.7,
      position: "absolute",
      right: -24,
      top: -28,
      width: 88,
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
      fontSize: 10.5,
      flexShrink: 1,
      lineHeight: 16,
      marginTop: 3,
    },
    businessMetric: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
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
      fontSize: 13.5,
      flexShrink: 1,
      letterSpacing: -0.3,
      lineHeight: 19,
    },
    businessStatusBadge: {
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      left: 12,
      paddingHorizontal: 8,
      paddingVertical: 5,
      position: "absolute",
      top: 12,
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
      rowGap: 20,
    },
    categoryIcon: {
      color: "#ffffff",
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 24,
      lineHeight: 28,
    },
    categoryIconImage: {
      height: 32,
      tintColor: "#ffffff",
      width: 32,
    },
    categoryIconTile: {
      alignItems: "center",
      backgroundColor: "#394657",
      borderColor: "rgba(255, 255, 255, 0.08)",
      borderRadius: 20,
      borderWidth: 0,
      height: 64,
      justifyContent: "center",
      shadowColor: "#000000",
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.32 : 0.08,
      shadowRadius: 18,
      width: 64,
    },
    categoryIconTileBlue: {
      backgroundColor: "#3ca6d3",
    },
    categoryIconTileGold: {
      backgroundColor: "#f59e0b",
    },
    categoryIconTileGreen: {
      backgroundColor: "#22a66f",
    },
    categoryIconTileNeutral: {
      backgroundColor: "#364152",
    },
    categoryIconTilePurple: {
      backgroundColor: "#7c3aed",
    },
    categoryIconTileRose: {
      backgroundColor: "#d94676",
    },
    categoryItem: {
      alignItems: "center",
      flexBasis: "24%",
      gap: 7,
      minWidth: 72,
    },
    categoryLabel: {
      color: "#ffffff",
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    categoryBookLine: {
      backgroundColor: "#ffffff",
      borderRadius: 999,
      height: 2,
      opacity: 0.92,
      width: 12,
    },
    categoryBookLineShort: {
      backgroundColor: "#ffffff",
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
      backgroundColor: "#ffffff",
      borderBottomLeftRadius: 4,
      borderTopLeftRadius: 9,
      gap: 3,
      height: 30,
      justifyContent: "center",
      paddingHorizontal: 5,
      width: 18,
    },
    categoryBookPageRight: {
      backgroundColor: "#ffffff",
      borderBottomRightRadius: 4,
      borderTopRightRadius: 9,
      height: 30,
      width: 18,
    },
    categoryCarBody: {
      alignItems: "center",
      backgroundColor: "#ffffff",
      borderRadius: 6,
      flexDirection: "row",
      height: 15,
      justifyContent: "space-between",
      paddingHorizontal: 6,
      width: 38,
    },
    categoryCarLight: {
      backgroundColor: "rgba(245, 158, 11, 0.55)",
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
      backgroundColor: "#ffffff",
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
      height: 12,
      marginBottom: -2,
      width: 27,
    },
    categoryCarWheel: {
      backgroundColor: "#ffffff",
      borderColor: "rgba(0, 0, 0, 0.16)",
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
      backgroundColor: "#ffffff",
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
      backgroundColor: "#153f31",
      borderColor: theme.colors.gold,
      borderWidth: 3,
      borderRadius: 32,
      flex: 0,
      height: 64,
      marginHorizontal: 8,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.32 : 0.12,
      shadowRadius: 16,
      transform: [{ translateY: -14 }],
      width: 64,
    },
    centerTabButtonActive: {
      backgroundColor: "#174d3b",
      transform: [{ translateY: -15 }, { scale: 1.02 }],
    },
    centerTabActiveIndicator: {
      backgroundColor: "transparent",
    },
    centerTabIcon: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 28,
      lineHeight: 30,
    },
    centerTabIconImage: {
      height: 32,
      tintColor: theme.colors.foreground,
      width: 32,
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
      paddingBottom: 170,
      paddingHorizontal: 20,
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
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 24,
      borderWidth: 1,
      flexGrow: 1,
      minWidth: 78,
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
      borderRadius: 20,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36,
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
      overflow: "hidden",
      paddingHorizontal: 4,
      paddingTop: 4,
      paddingBottom: 2,
    },
    heroEyebrow: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 16,
      letterSpacing: 0,
      lineHeight: 24,
      marginTop: 3,
    },
    heroGlow: {
      display: "none",
    },
    heroProfileBadge: {
      alignItems: "center",
      backgroundColor: "#14201a",
      borderColor: theme.colors.gold,
      borderRadius: 30,
      borderWidth: 2,
      height: 60,
      justifyContent: "center",
      position: "relative",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.22 : 0.08,
      shadowRadius: 14,
      width: 60,
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
      color: theme.colors.cream,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 28,
      lineHeight: 36,
    },
    heroTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 34,
      letterSpacing: -0.6,
      lineHeight: 42,
      marginTop: 14,
    },
    heroTopRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
    },
    homeBusinessCardSlot: {
      flexBasis: "31%",
      flexGrow: 1,
      minWidth: 0,
    },
    homeBusinessGrid: {
      flexDirection: "row",
      gap: 12,
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
      height: 14,
      tintColor: theme.colors.gold,
      width: 14,
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
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
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
      gap: 14,
      marginTop: 96,
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
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 26,
      lineHeight: 40,
      marginTop: 28,
      textAlign: "center",
    },
    onboardingBrand: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 44,
      letterSpacing: 2,
      marginTop: 24,
      textAlign: "center",
    },
    onboardingBrandRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    onboardingCard: {
      backgroundColor: theme.colors.hero,
      borderRadius: 0,
      flex: 1,
      overflow: "hidden",
      paddingHorizontal: 28,
      paddingVertical: 28,
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
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 11,
      overflow: "hidden",
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    onboardingHighlights: {
      alignSelf: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 22,
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
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiBold,
      fontSize: 132,
      lineHeight: 142,
    },
    onboardingSecondary: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderColor: "#5f6b7a",
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 56,
      paddingVertical: 15,
    },
    onboardingSecondaryText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 19,
    },
    onboardingScreen: {
      backgroundColor: theme.colors.hero,
      flex: 1,
      paddingHorizontal: 0,
    },
    onboardingSlogan: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 31,
      lineHeight: 38,
      marginTop: 16,
      textAlign: "center",
    },
    onboardingPattern: {
      bottom: 0,
      left: 0,
      opacity: 0.9,
      position: "absolute",
      right: 0,
      top: 0,
    },
    onboardingPatternArc: {
      borderColor: "rgba(255, 193, 58, 0.32)",
      borderRadius: 240,
      borderTopWidth: 3,
      height: 220,
      left: -44,
      position: "absolute",
      right: -44,
      top: 82,
      transform: [{ rotate: "-8deg" }],
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
      backgroundColor: "rgba(255, 193, 58, 0.16)",
      borderColor: "rgba(255, 193, 58, 0.5)",
      borderRadius: 34,
      borderWidth: 1,
      height: 68,
      justifyContent: "center",
      width: 68,
    },
    promoBadgeText: {
      color: theme.colors.foregroundInverse,
    },
    promoBody: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 15,
      lineHeight: 23,
      marginTop: 4,
      maxWidth: 230,
    },
    promoCard: {
      alignItems: "center",
      backgroundColor: "#0b2019",
      borderColor: "#183c31",
      borderRadius: 34,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 132,
      padding: 22,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 20, width: 0 },
      shadowOpacity: theme.isDark ? 0.34 : 0.1,
      shadowRadius: 30,
    },
    promoTitle: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 31,
      lineHeight: 38,
    },
    promoCoupon: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.cream,
      borderRadius: theme.radii.pill,
      marginTop: 16,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    promoCouponText: {
      color: theme.colors.foregroundInverse,
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
      backgroundColor: theme.colors.hero,
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
    mapBusinessPin: {
      backgroundColor: "#07090d",
      borderColor: "#ffffff",
      borderRadius: 45,
      borderWidth: 6,
      height: 90,
      overflow: "hidden",
      position: "absolute",
      width: 90,
      ...createMobileShadow(theme, {
        darkOpacity: 0.25,
        height: 8,
        lightOpacity: 0.08,
        radius: 18,
      }),
    },
    mapBusinessPinOne: {
      left: "28%",
      top: "16%",
    },
    mapBusinessPinTwo: {
      right: "27%",
      top: "33%",
    },
    mapBusinessPinThree: {
      bottom: "8%",
      right: "22%",
    },
    mapPin: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderColor: "#ffffff",
      borderRadius: 25,
      borderWidth: 6,
      height: 50,
      justifyContent: "center",
      position: "absolute",
      width: 50,
    },
    mapPinDot: {
      backgroundColor: "#ffffff",
      borderRadius: 8,
      height: 16,
      width: 16,
    },
    mapPinFour: {
      right: "10%",
      top: "22%",
    },
    mapPinGold: {
      backgroundColor: "#f59e0b",
    },
    mapPinGreen: {
      backgroundColor: "#10b981",
    },
    mapPinOne: {
      left: "8%",
      top: "40%",
    },
    mapPinPurple: {
      backgroundColor: "#7c3aed",
    },
    mapPinRose: {
      backgroundColor: "#ec4899",
    },
    mapPinThree: {
      bottom: "18%",
      right: "8%",
    },
    mapPinTwo: {
      bottom: "30%",
      left: "22%",
    },
    mapPulseCore: {
      backgroundColor: "#1473f9",
      borderRadius: 22,
      height: 44,
      width: 44,
    },
    mapPulseMiddle: {
      alignItems: "center",
      backgroundColor: "rgba(20, 115, 249, 0.46)",
      borderRadius: 76,
      height: 104,
      justifyContent: "center",
      width: 104,
    },
    mapPulseOuter: {
      alignItems: "center",
      backgroundColor: "rgba(20, 115, 249, 0.24)",
      borderRadius: 88,
      height: 150,
      justifyContent: "center",
      left: "43%",
      marginLeft: -75,
      marginTop: -75,
      position: "absolute",
      top: "57%",
      width: 150,
    },
    mapRoad: {
      backgroundColor: "rgba(119, 151, 166, 0.42)",
      borderRadius: 999,
      height: 5,
      left: -50,
      position: "absolute",
      width: "125%",
    },
    mapRoadOne: {
      top: 46,
      transform: [{ rotate: "-25deg" }],
    },
    mapRoadThree: {
      bottom: 62,
      transform: [{ rotate: "16deg" }],
    },
    mapRoadTwo: {
      top: 142,
      transform: [{ rotate: "25deg" }],
    },
    salonActionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      justifyContent: "space-between",
      marginTop: 24,
    },
    salonActionIcon: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 26,
      lineHeight: 30,
    },
    salonActionIconImage: {
      height: 24,
      tintColor: theme.colors.foreground,
      width: 24,
    },
    salonActionLabel: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 12,
      marginTop: 7,
    },
    salonActionTile: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 26,
      borderWidth: 1,
      flexBasis: "22%",
      flexGrow: 1,
      justifyContent: "center",
      minHeight: 86,
      padding: 12,
    },
    salonBackButton: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 28,
      borderWidth: 1,
      height: 58,
      justifyContent: "center",
      left: 30,
      position: "absolute",
      top: 34,
      width: 58,
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
      tintColor: theme.colors.foreground,
      width: 28,
    },
    salonBottomCta: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: 999,
      flexDirection: "row",
      gap: 12,
      marginHorizontal: 28,
      marginBottom: 112,
      marginTop: 6,
      padding: 10,
      paddingLeft: 18,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: theme.isDark ? 0.28 : 0.12,
      shadowRadius: 24,
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
      backgroundColor: "#05080c",
      height: 344,
      marginHorizontal: -20,
      overflow: "hidden",
      position: "relative",
    },
    salonHeroActions: {
      flexDirection: "row",
      gap: 14,
      position: "absolute",
      right: 30,
      top: 34,
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
      backgroundColor: "rgba(5, 8, 12, 0.54)",
      borderColor: "rgba(255, 193, 58, 0.18)",
      borderRadius: 30,
      borderWidth: 1,
      gap: 3,
      marginTop: 78,
      paddingHorizontal: 24,
      paddingVertical: 18,
      zIndex: 1,
    },
    salonHeroKicker: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      fontSize: 20,
      lineHeight: 28,
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
      backgroundColor: "rgba(255, 193, 58, 0.18)",
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
      gap: 62,
      justifyContent: "center",
      left: 0,
      opacity: 0.82,
      position: "absolute",
      right: 0,
      top: 0,
    },
    salonHeroStage: {
      backgroundColor: "rgba(91, 48, 29, 0.36)",
      borderTopColor: "rgba(255, 193, 58, 0.16)",
      borderTopWidth: 1,
      bottom: 0,
      height: 140,
      left: 0,
      overflow: "hidden",
      position: "absolute",
      right: 0,
    },
    salonInfoCard: {
      backgroundColor: theme.colors.background,
      gap: 0,
      paddingHorizontal: 28,
      paddingTop: 20,
    },
    salonLikes: {
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 16,
      overflow: "hidden",
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    salonMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 16,
      lineHeight: 24,
      marginTop: 6,
    },
    salonName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.kufiBold,
      flexShrink: 1,
      fontSize: 36,
      letterSpacing: -0.7,
      lineHeight: 46,
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
      height: 22,
      tintColor: theme.colors.gold,
      width: 22,
    },
    salonRatingText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 18,
    },
    salonRoundButton: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 31,
      borderWidth: 1,
      height: 58,
      justifyContent: "center",
      width: 58,
    },
    salonRoundButtonText: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 32,
      lineHeight: 34,
    },
    salonRoundButtonIcon: {
      height: 28,
      tintColor: theme.colors.foreground,
      width: 28,
    },
    salonServiceAdd: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.accent,
      borderRadius: 22,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    salonServiceAddText: {
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 28,
      lineHeight: 30,
    },
    salonServiceActionBlock: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: 24,
      borderWidth: 1,
      flexDirection: "row-reverse",
      flexShrink: 0,
      gap: 10,
      justifyContent: "center",
      minHeight: 52,
      minWidth: 126,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    salonServiceCopy: {
      alignItems: "flex-end",
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    salonServiceMain: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row-reverse",
      gap: 12,
      minWidth: 0,
    },
    salonServiceMedia: {
      borderColor: "rgba(255, 193, 58, 0.18)",
      borderRadius: 18,
      borderWidth: 1,
      height: 58,
      overflow: "hidden",
      width: 76,
    },
    salonServiceMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
    },
    salonServiceName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 19,
      lineHeight: 27,
    },
    salonServicePrice: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 15,
      lineHeight: 21,
      textAlign: "center",
    },
    salonServiceRow: {
      alignItems: "center",
      flexDirection: "row-reverse",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 28,
      borderWidth: 1,
      gap: 10,
      justifyContent: "space-between",
      padding: 10,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.16 : 0.05,
      shadowRadius: 18,
    },
    salonServicesList: {
      gap: 10,
      paddingHorizontal: 28,
      paddingTop: 22,
    },
    salonTabs: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 34,
    },
    salonTabText: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiMedium,
      fontSize: 15,
      paddingBottom: 14,
    },
    salonTabTextActive: {
      borderBottomColor: theme.colors.gold,
      borderBottomWidth: 5,
      color: theme.colors.gold,
    },
    salonTitleRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 16,
      justifyContent: "space-between",
    },
    salonVerifiedRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "flex-end",
    },
    searchMapBoundaryCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      marginHorizontal: 20,
      padding: 18,
    },
    searchMapCanvas: {
      backgroundColor: "#dceaf0",
      borderRadius: 36,
      height: 410,
      marginTop: 18,
      overflow: "hidden",
      position: "relative",
    },
    searchMapChip: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiMedium,
      flexGrow: 1,
      fontSize: 14,
      overflow: "hidden",
      paddingHorizontal: 18,
      paddingVertical: 12,
      textAlign: "center",
    },
    searchMapChipActive: {
      backgroundColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      color: theme.colors.foregroundInverse,
      fontFamily: mobileTypography.uiMedium,
      flexGrow: 1,
      fontSize: 15,
      overflow: "hidden",
      paddingHorizontal: 24,
      paddingVertical: 13,
      textAlign: "center",
    },
    searchMapChipRow: {
      flexDirection: "row-reverse",
      gap: 12,
      marginTop: 20,
    },
    searchMapFilterButton: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 30,
      borderWidth: 1,
      height: 60,
      justifyContent: "center",
      width: 60,
    },
    searchMapFilterIcon: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 26,
      lineHeight: 28,
      transform: [{ rotate: "90deg" }],
    },
    searchMapFilterIconImage: {
      height: 23,
      tintColor: theme.colors.foreground,
      width: 23,
    },
    searchMapScreen: {
      backgroundColor: theme.colors.background,
      paddingHorizontal: 20,
      paddingTop: 14,
    },
    searchMapTopRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    searchResultActions: {
      alignItems: "center",
      gap: 13,
      justifyContent: "center",
      minWidth: 54,
    },
    searchResultCard: {
      alignItems: "center",
      backgroundColor: "#f4f6f8",
      borderRadius: 26,
      flexDirection: "row-reverse",
      gap: 16,
      paddingVertical: 11,
    },
    searchResultCardPressed: {
      opacity: 0.9,
      transform: [{ translateY: 1 }],
    },
    searchResultCopy: {
      flex: 1,
      minWidth: 0,
    },
    searchResultDistance: {
      color: "#6b7280",
      fontFamily: mobileTypography.uiRegular,
      fontSize: 15,
    },
    searchResultHeart: {
      color: "#111827",
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 38,
      lineHeight: 40,
    },
    searchResultHeartImage: {
      height: 30,
      tintColor: "#111827",
      width: 30,
    },
    searchResultMedia: {
      borderRadius: 20,
      height: 88,
      overflow: "hidden",
      width: 116,
    },
    searchResultMeta: {
      color: "#6b7280",
      fontFamily: mobileTypography.uiRegular,
      fontSize: 16,
      lineHeight: 22,
      marginTop: 4,
    },
    searchResultName: {
      color: "#101827",
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 24,
      letterSpacing: -0.4,
      lineHeight: 31,
    },
    searchResultPrice: {
      color: "#101827",
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 17,
      marginTop: 8,
    },
    searchResultRating: {
      color: "#101827",
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 17,
    },
    searchResultReviews: {
      color: "#101827",
      fontFamily: mobileTypography.uiRegular,
      fontSize: 17,
    },
    searchResultShare: {
      color: "#6b7280",
      fontFamily: mobileTypography.uiSemiBold,
      fontSize: 28,
      lineHeight: 30,
    },
    searchResultShareImage: {
      height: 23,
      tintColor: "#6b7280",
      width: 23,
    },
    searchResultStarImage: {
      height: 17,
      tintColor: theme.colors.deepGold,
      width: 17,
    },
    searchResultStats: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginTop: 10,
    },
    searchResultsSheet: {
      backgroundColor: "#f4f6f8",
      borderTopLeftRadius: 42,
      borderTopRightRadius: 42,
      gap: 12,
      marginTop: -42,
      padding: 24,
      paddingTop: 40,
    },
    searchResultsTitle: {
      color: "#101827",
      fontFamily: mobileTypography.kufiBold,
      fontSize: 27,
      lineHeight: 35,
      marginBottom: 6,
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
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 32,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 62,
      paddingHorizontal: 18,
      paddingVertical: 15,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: theme.isDark ? 0.28 : 0.08,
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
      height: 28,
      tintColor: theme.colors.mutedForeground,
      width: 28,
    },
    searchPlaceholder: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiRegular,
      flex: 1,
      fontSize: 16,
      lineHeight: 22,
      minWidth: 0,
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
      backgroundColor: theme.colors.nav,
      borderColor: theme.colors.border,
      borderRadius: 0,
      borderWidth: 1,
      bottom: 0,
      elevation: 24,
      flexDirection: "row",
      height: 92,
      left: 0,
      paddingBottom: 14,
      paddingHorizontal: 18,
      paddingTop: 8,
      position: "absolute",
      right: 0,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: -10, width: 0 },
      shadowOpacity: theme.isDark ? 0.54 : 0.16,
      shadowRadius: 28,
      zIndex: 20,
    },
    tabActiveIndicator: {
      backgroundColor: "transparent",
      borderRadius: 999,
      height: 3,
      marginTop: 2,
      width: 18,
    },
    tabActiveIndicatorVisible: {
      backgroundColor: theme.colors.gold,
      width: 24,
    },
    tabButton: {
      alignItems: "center",
      borderRadius: 22,
      flex: 1,
      gap: 4,
      justifyContent: "center",
      minHeight: 54,
      paddingHorizontal: 2,
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
      height: 22,
      tintColor: theme.colors.foreground,
      width: 22,
    },
    tabIconImageActive: {
      tintColor: theme.colors.gold,
    },
    tabLabel: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiRegular,
      fontSize: 10,
      lineHeight: 13,
      maxWidth: 64,
      minWidth: 48,
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
      borderColor: theme.colors.cardElevated,
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
      tintColor: theme.colors.foregroundInverse,
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
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: 26,
      borderWidth: 1,
      flexDirection: "row",
      gap: 14,
      padding: 17,
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
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: 18,
      borderWidth: 1,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    paymentMethodIconImage: {
      height: 22,
      tintColor: theme.colors.deepGold,
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
      flexDirection: "row",
      gap: 12,
      padding: 16,
    },
    securePaymentIconImage: {
      height: 22,
      tintColor: theme.colors.success,
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
    staffAvatar: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: 23,
      borderWidth: 1,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    staffAvatarText: {
      color: theme.colors.deepGold,
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
      alignItems: "flex-end",
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
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
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
      backgroundColor: theme.colors.cardElevated,
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
