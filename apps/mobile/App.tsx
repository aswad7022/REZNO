import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import {
  I18nManager,
  Image,
  Platform,
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

type BookingStep = {
  body: string;
  icon: string;
  title: string;
};

type MobileThemeMode = "system" | "light" | "dark";

const mobileTypography = {
  displayFamily: Platform.select({
    android: "sans-serif-medium",
    default: undefined,
  }),
  uiFamily: Platform.select({
    android: "sans-serif",
    default: undefined,
  }),
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

const categories = [
  {
    badge: "الأكثر حجزاً",
    count: "128 نشاط",
    icon: mobileIconAssets.categories.salon,
    label: "صالونات",
    tone: "gold",
  },
  {
    badge: "متاح اليوم",
    count: "42 مطعم",
    icon: mobileIconAssets.categories.restaurant,
    label: "مطاعم",
    tone: "green",
  },
  {
    badge: "قريب منك",
    count: "31 عيادة",
    icon: mobileIconAssets.categories.clinic,
    label: "عيادات",
    tone: "blue",
  },
  {
    badge: "فاخر",
    count: "18 سبا",
    icon: mobileIconAssets.categories.spa,
    label: "سبا",
    tone: "rose",
  },
  {
    badge: "صباحي",
    count: "27 مركز",
    icon: mobileIconAssets.categories.gym,
    label: "رياضة",
    tone: "dark",
  },
  {
    badge: "سريع",
    count: "64 خدمة",
    icon: mobileIconAssets.categories.services,
    label: "خدمات",
    tone: "gold",
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

const bookingSteps: BookingStep[] = [
  {
    body: "اختيار الخدمة المناسبة من قائمة واضحة مع السعر والمدة.",
    icon: "01",
    title: "اختر الخدمة",
  },
  {
    body: "اختيار الموظف أو ترك REZNO يقترح المتاحين.",
    icon: "02",
    title: "اختر المختص",
  },
  {
    body: "تحديد اليوم والوقت من شرائح سهلة اللمس.",
    icon: "03",
    title: "حدد الموعد",
  },
  {
    body: "مراجعة الملخص والتأكيد بدون إضافة أي منطق دفع حقيقي.",
    icon: "04",
    title: "تأكيد الحجز",
  },
];

const staffMembers = [
  { name: "ليان", role: "خبيرة شعر", time: "متاحة 4:30 م", topRated: true },
  { name: "سارة", role: "مختصة بشرة", time: "متاحة غداً", topRated: false },
  { name: "آدم", role: "مدير حجوزات", time: "أقرب وقت 6:00 م", topRated: false },
];

const services = [
  { duration: "45 دقيقة", name: "قص وتصفيف", price: "25,000 د.ع", tag: "الأكثر طلباً" },
  { duration: "60 دقيقة", name: "عناية بشرة", price: "35,000 د.ع", tag: "عناية فاخرة" },
  { duration: "90 دقيقة", name: "باقة فاخرة", price: "55,000 د.ع", tag: "VIP" },
];

const timeSlots = ["10:00", "12:30", "14:00", "16:30", "18:00"];

const dateOptions = [
  { day: "اليوم", label: "06", meta: "متاح" },
  { day: "غداً", label: "07", meta: "6 أوقات" },
  { day: "الأربعاء", label: "08", meta: "مزدحم" },
  { day: "الخميس", label: "09", meta: "أفضل" },
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

const bookingTimeline = [
  { label: "تم اختيار الخدمة", time: "10:24 ص" },
  { label: "تم تثبيت الوقت", time: "10:26 ص" },
  { label: "جاهز للتأكيد", time: "الآن" },
];

const bookingStatusCards = [
  {
    action: "تعديل الموعد",
    business: "Noura Beauty Lounge",
    meta: "الخميس · 4:30 م · قص وتصفيف",
    status: "upcoming",
    statusLabel: "قادم",
  },
  {
    action: "عرض الإيصال",
    business: "Mat3am Gold",
    meta: "الأحد الماضي · طاولة عائلية · مكتمل",
    status: "completed",
    statusLabel: "مكتمل",
  },
  {
    action: "إعادة الحجز",
    business: "Smile Studio Clinic",
    meta: "الثلاثاء · استشارة · تم الإلغاء",
    status: "cancelled",
    statusLabel: "ملغي",
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
  const colorScheme = useColorScheme();
  const [locale, setLocale] = useState<MobileLocale>(DEFAULT_LOCALE);
  const [activeTab, setActiveTab] = useState<MobileAppTabId>("customerHome");
  const [selectedBusiness, setSelectedBusiness] =
    useState<PremiumBusiness | null>(null);
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

    if (tabId === "marketplace" && marketplaceState.status === "idle") {
      loadMarketplace();
    }

    setActiveTab(tabId);
  };

  const handleEnterApp = () => {
    setShowOnboarding(false);
  };

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
        {selectedBusiness ? (
          <SalonDetailScreen
            business={selectedBusiness}
            isRtl={isRtl}
            onBack={() => setSelectedBusiness(null)}
            styles={styles}
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
          <BookingFlowScreen isRtl={isRtl} styles={styles} />
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
      <View style={styles.locationPill}>
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.locationPin}
          style={styles.locationIconImage}
        />
        <Text style={styles.locationText}>بغداد</Text>
      </View>
      <Text style={[styles.heroEyebrow, isRtl && styles.rtlText]}>
        ما الخدمة التي تبحث عنها اليوم؟
      </Text>
      <Text style={[styles.heroTitle, isRtl && styles.rtlText]}>
        مرحباً علي
      </Text>
      <Text style={[styles.heroBody, isRtl && styles.rtlText]}>
        اكتشف أفضل الخدمات القريبة منك واحجز بثقة من REZNO.
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
    <>
      <View style={styles.categoryRail}>
        {categories.slice(0, 4).map((category, index) => (
          <View
            key={category.label}
            style={[
              styles.categoryRailCard,
              index === 0 && styles.categoryRailCardActive,
              category.tone === "green" && styles.categoryRailCardGreen,
              category.tone === "blue" && styles.categoryRailCardBlue,
              category.tone === "rose" && styles.categoryRailCardRose,
              category.tone === "dark" && styles.categoryRailCardPurple,
            ]}
          >
            <View
              style={[
                styles.categoryRailIconTile,
                index === 0 && styles.categoryRailIconTileActive,
              ]}
            >
              <Image
                alt=""
                resizeMode="contain"
                source={category.icon}
                style={[
                  styles.categoryRailIconImage,
                  index === 0 && styles.categoryRailIconImageActive,
                ]}
              />
            </View>
            <Text
              style={[
                styles.categoryRailLabel,
                index === 0 && styles.categoryRailLabelActive,
              ]}
            >
              {category.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.categoryGrid}>
        {categories.map((category, index) => (
          <View
            key={category.label}
            style={[
              styles.categoryCard,
              index === 0 && styles.categoryCardActive,
              category.tone === "green" && styles.categoryCardGreen,
              category.tone === "blue" && styles.categoryCardBlue,
              category.tone === "rose" && styles.categoryCardRose,
              category.tone === "dark" && styles.categoryCardPurple,
            ]}
          >
            <View style={styles.categoryTopRow}>
              <View
                style={[
                  styles.categoryIconTile,
                  index === 0 && styles.categoryIconTileActive,
                ]}
              >
                <Image
                  alt=""
                  resizeMode="contain"
                  source={category.icon}
                  style={styles.categoryIconImage}
                />
              </View>
              <Text style={styles.categoryBadge}>{category.badge}</Text>
            </View>
            <Text style={styles.categoryLabel}>{category.label}</Text>
            <Text style={styles.categoryCount}>{category.count}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

function PromoCard({ isRtl, styles }: { isRtl: boolean; styles: MobileStyles }) {
  return (
    <View style={styles.promoCard}>
      <View>
        <Text style={[styles.promoTitle, isRtl && styles.rtlText]}>
          باقة نهاية الأسبوع
        </Text>
        <Text style={[styles.promoBody, isRtl && styles.rtlText]}>
          اكتشف خدمات متاحة اليوم مع تأكيد سريع من النشاط.
        </Text>
      </View>
      <View style={styles.promoBadge}>
        <Text style={styles.promoBadgeText}>VIP</Text>
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
      <View style={styles.businessMediaGlow} />
      <View style={styles.businessMediaPanel} />
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
  styles,
}: {
  business: PremiumBusiness;
  isRtl: boolean;
  onBack: () => void;
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
            <View style={styles.salonServiceMedia}>
              <BusinessMedia
                badge={index === 0 ? "رائج" : service.tag}
                styles={styles}
              />
            </View>
            <View style={styles.rowCopy}>
              <Text style={[styles.salonServiceName, isRtl && styles.rtlText]}>
                {index === 0 ? "قص شعر" : service.name}
              </Text>
              <Text style={[styles.salonServiceMeta, isRtl && styles.rtlText]}>
                {service.duration}
              </Text>
              <Text style={styles.salonServicePrice}>
                {index === 0 ? "250 TL" : service.price}
              </Text>
            </View>
            <View style={styles.salonServiceAdd}>
              <Text style={styles.salonServiceAddText}>+</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.salonBottomCta}>
        <PrimaryButton label="احجز الآن" styles={styles} />
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

function BookingFlowScreen({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <>
      <View style={styles.bookingSummaryCard}>
        <View style={styles.bookingHeroAccent} />
        <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
          رحلة الحجز
        </Text>
        <Text style={[styles.screenTitle, isRtl && styles.rtlText]}>
          تجربة حجز واضحة من الخدمة إلى التأكيد
        </Text>
        <Text style={[styles.screenDescription, isRtl && styles.rtlText]}>
          هذه واجهة عرض فقط. لا تضيف دفعاً أو تغير منطق الحجز الحقيقي.
        </Text>
      </View>

      <SelectedServiceCard isRtl={isRtl} styles={styles} />

      <View style={styles.stepGrid}>
        {bookingSteps.map((step) => (
          <View key={step.title} style={styles.stepCard}>
            <Text style={styles.stepIcon}>{step.icon}</Text>
            <Text style={[styles.stepTitle, isRtl && styles.rtlText]}>
              {step.title}
            </Text>
            <Text style={[styles.stepBody, isRtl && styles.rtlText]}>
              {step.body}
            </Text>
          </View>
        ))}
      </View>

      <SectionHeader isRtl={isRtl} styles={styles} title="اختر الخدمة" />
      {services.map((service, index) => (
        <ServiceRow
          isRtl={isRtl}
          key={service.name}
          selected={index === 0}
          service={service}
          styles={styles}
        />
      ))}

      <SectionHeader isRtl={isRtl} styles={styles} title="اختر المختص" />
      {staffMembers.map((staff, index) => (
        <StaffRow
          isRtl={isRtl}
          key={staff.name}
          selected={index === 0}
          staff={staff}
          styles={styles}
        />
      ))}

      <SectionHeader isRtl={isRtl} styles={styles} title="اختر اليوم" />
      <View style={styles.dateStrip}>
        {dateOptions.map((date, index) => (
          <View
            key={date.day}
            style={[styles.datePill, index === 0 && styles.datePillActive]}
          >
            <Text
              style={[
                styles.dateDay,
                index === 0 && styles.dateDayActive,
              ]}
            >
              {date.day}
            </Text>
            <Text
              style={[
                styles.dateLabel,
                index === 0 && styles.dateLabelActive,
              ]}
            >
              {date.label}
            </Text>
            <Text
              style={[
                styles.dateMeta,
                index === 0 && styles.dateMetaActive,
              ]}
            >
              {date.meta}
            </Text>
          </View>
        ))}
      </View>

      <SectionHeader isRtl={isRtl} styles={styles} title="اختر الوقت" />
      <View style={styles.timeGrid}>
        {timeSlots.map((slot, index) => (
          <View
            key={slot}
            style={[styles.timeSlot, index === 3 && styles.timeSlotActive]}
          >
            <Image
              alt=""
              resizeMode="contain"
              source={mobileIconAssets.common.clock}
              style={[
                styles.timeSlotIconImage,
                index === 3 && styles.timeSlotIconImageActive,
              ]}
            />
            <Text
              style={[
                styles.timeSlotText,
                index === 3 && styles.timeSlotTextActive,
              ]}
            >
              {slot}
            </Text>
          </View>
        ))}
      </View>

      <BookingSummaryCard isRtl={isRtl} styles={styles} />
      <ConfirmationCard isRtl={isRtl} styles={styles} />
      <BookingReceiptCard isRtl={isRtl} styles={styles} />
      <BookingTimelineCard isRtl={isRtl} styles={styles} />
      <PolicySupportCard isRtl={isRtl} styles={styles} />
      <BookingStatusBoard isRtl={isRtl} styles={styles} />
      <BookingsEmptyState isRtl={isRtl} styles={styles} />
    </>
  );
}

function SelectedServiceCard({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.selectedServiceCard}>
      <View style={styles.selectedServiceIcon}>
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.calendar}
          style={styles.selectedServiceIconImage}
        />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.selectedServiceTitle, isRtl && styles.rtlText]}>
          قص وتصفيف فاخر
        </Text>
        <Text style={[styles.selectedServiceMeta, isRtl && styles.rtlText]}>
          Noura Beauty Lounge · ليان · اليوم 4:30 م
        </Text>
      </View>
      <View style={styles.statusBadge}>
        <Text style={styles.statusBadgeText}>مختار</Text>
      </View>
    </View>
  );
}

function ServiceRow({
  isRtl,
  selected,
  service,
  styles,
}: {
  isRtl: boolean;
  selected?: boolean;
  service: { duration: string; name: string; price: string; tag: string };
  styles: MobileStyles;
}) {
  return (
    <View style={[styles.rowCard, selected && styles.rowCardSelected]}>
      <View style={styles.rowIcon}>
        <Text style={styles.rowIconText}>✦</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
          {service.name}
        </Text>
        <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
          {service.duration} · {service.tag}
        </Text>
      </View>
      <View style={styles.servicePriceBlock}>
        <Text style={styles.rowPrice}>{service.price}</Text>
        {selected ? <Text style={styles.selectText}>مختارة</Text> : null}
      </View>
    </View>
  );
}

function StaffRow({
  isRtl,
  selected,
  staff,
  styles,
}: {
  isRtl: boolean;
  selected?: boolean;
  staff: { name: string; role: string; time: string; topRated: boolean };
  styles: MobileStyles;
}) {
  return (
    <View style={[styles.rowCard, selected && styles.rowCardSelected]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{staff.name.charAt(0)}</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
          {staff.name}
        </Text>
        <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
          {staff.role} · {staff.time}
          {staff.topRated ? " · الأعلى تقييماً" : ""}
        </Text>
      </View>
      <Text style={styles.selectText}>{selected ? "مختارة" : "اختيار"}</Text>
    </View>
  );
}

function BookingsEmptyState({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <PremiumStateCard
      body="عند ربط الحساب الحقيقي ستظهر هنا الحجوزات القادمة والسابقة. حالياً هذه بطاقة عرض آمنة فقط."
      icon="⌛"
      isRtl={isRtl}
      label="حجوزاتي"
      styles={styles}
      title="لا توجد حجوزات حقيقية بعد"
    />
  );
}

function BookingSummaryCard({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.paymentCard}>
      <View style={styles.paymentHeaderRow}>
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.paymentCard}
          style={styles.paymentIconImage}
        />
        <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
          ملخص الحجز
        </Text>
      </View>
      <Text style={[styles.paymentTitle, isRtl && styles.rtlText]}>
        قص وتصفيف فاخر · ليان · اليوم 4:30 م
      </Text>
      <Text style={[styles.paymentBody, isRtl && styles.rtlText]}>
        الدفع عند الحضور كعنصر عرض فقط. لا يوجد تكامل دفع حقيقي أو إنشاء حجز
        في هذه المرحلة.
      </Text>
      <View style={styles.summaryGrid}>
        <SummaryItem label="النشاط" value="Noura Beauty Lounge" styles={styles} />
        <SummaryItem label="المختص" value="ليان" styles={styles} />
        <SummaryItem label="الموقع" value="بغداد · الكرادة" styles={styles} />
        <SummaryItem label="الطريقة" value="الدفع في المكان" styles={styles} />
      </View>
    </View>
  );
}

function ConfirmationCard({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.confirmationCard}>
      <View style={styles.confirmationIconWrap}>
        <Image
          alt=""
          resizeMode="contain"
          source={mobileIconAssets.common.checkSuccess}
          style={styles.confirmationIconImage}
        />
      </View>
      <Text style={[styles.confirmationTitle, isRtl && styles.rtlText]}>
        تم تجهيز تأكيد الحجز
      </Text>
      <Text style={[styles.confirmationBody, isRtl && styles.rtlText]}>
        رقم التأكيد التجريبي RZ-2406-183. لا يتم إنشاء حجز حقيقي أو إرسال
        إشعارات.
      </Text>
      <View style={styles.confirmationActions}>
        <Text style={styles.receiptAction}>إضافة للتقويم</Text>
        <Text style={styles.receiptAction}>مشاركة الإيصال</Text>
      </View>
    </View>
  );
}

function BookingReceiptCard({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.receiptCard}>
      <View style={styles.receiptHeader}>
        <View>
          <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
            إيصال الحجز
          </Text>
          <Text style={[styles.receiptTitle, isRtl && styles.rtlText]}>
            RZ-2406-183
          </Text>
        </View>
        <Text style={styles.receiptStatus}>مؤكد</Text>
      </View>
      <View style={styles.receiptLine} />
      <SummaryItem label="الخدمة" value="قص وتصفيف فاخر" styles={styles} />
      <SummaryItem label="التاريخ" value="الخميس، 06 يوليو" styles={styles} />
      <SummaryItem label="الوقت" value="4:30 م" styles={styles} />
      <SummaryItem label="الإجمالي" value="25,000 د.ع" styles={styles} />
    </View>
  );
}

function BookingTimelineCard({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.timelineCard}>
      <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
        مسار الحجز
      </Text>
      <Text style={[styles.timelineTitle, isRtl && styles.rtlText]}>
        خطوات واضحة حتى الوصول
      </Text>
      {bookingTimeline.map((item, index) => (
        <View key={item.label} style={styles.timelineItem}>
          <View style={styles.timelineDot}>
            <Text style={styles.timelineDotText}>{index + 1}</Text>
          </View>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
              {item.label}
            </Text>
            <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
              {item.time}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function PolicySupportCard({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.policyCard}>
      <Text style={[styles.integrationTitle, isRtl && styles.rtlText]}>
        سياسة آمنة للعرض
      </Text>
      <Text style={[styles.integrationBody, isRtl && styles.rtlText]}>
        أزرار التعديل والإلغاء والدعم في هذه الشاشة عناصر بصرية فقط. لا توجد
        عمليات حقيقية على الحجوزات.
      </Text>
      <View style={styles.supportRow}>
        <Text style={styles.supportPill}>مساعدة</Text>
        <Text style={styles.supportPill}>سياسة الإلغاء</Text>
        <Text style={styles.supportPill}>تواصل مع النشاط</Text>
      </View>
    </View>
  );
}

function BookingStatusBoard({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.statusBoard}>
      <SectionHeader isRtl={isRtl} styles={styles} title="حجوزاتي" />
      {bookingStatusCards.map((booking) => (
        <View key={booking.business} style={styles.statusBookingCard}>
          <View style={styles.statusBookingHeader}>
            <Text
              style={[
                styles.statusChip,
                booking.status === "completed" && styles.statusChipCompleted,
                booking.status === "cancelled" && styles.statusChipCancelled,
              ]}
            >
              {booking.statusLabel}
            </Text>
            <Text style={styles.receiptAction}>{booking.action}</Text>
          </View>
          <Text style={[styles.myBookingTitle, isRtl && styles.rtlText]}>
            {booking.business}
          </Text>
          <Text style={[styles.myBookingMeta, isRtl && styles.rtlText]}>
            {booking.meta}
          </Text>
          <View style={styles.bookingActions}>
            <Text style={styles.editAction}>عرض التفاصيل</Text>
            <Text style={styles.cancelAction}>إلغاء بصري</Text>
          </View>
        </View>
      ))}
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
      fontSize: 13,
      fontWeight: "900",
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
      fontSize: 24,
      fontWeight: "900",
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
      fontSize: 12,
      fontWeight: "800",
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
      fontSize: 18,
      fontWeight: "900",
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
    brandCopy: {
      flex: 1,
      minWidth: 0,
    },
    brandName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiFamily,
      fontSize: 15,
      flexShrink: 1,
      fontWeight: "800",
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
      fontFamily: mobileTypography.uiFamily,
      fontSize: 9,
      flexShrink: 1,
      fontWeight: "500",
      lineHeight: 12,
      marginTop: 1,
    },
    businessBody: {
      gap: 9,
      padding: 12,
    },
    businessCard: {
      ...createMobileSurface(theme, {
        radius: 30,
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
      borderTopColor: theme.colors.border,
      borderTopWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      justifyContent: "space-between",
      paddingTop: 10,
    },
    businessHero: {
      backgroundColor: "#050608",
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      height: 102,
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
      bottom: 18,
      height: 24,
      left: 74,
      position: "absolute",
      width: 24,
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
      height: 140,
      left: -30,
      opacity: theme.isDark ? 0.96 : 0.7,
      position: "absolute",
      top: -54,
      width: 140,
    },
    businessMediaPanel: {
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      borderColor: "rgba(255, 193, 58, 0.22)",
      borderRadius: 28,
      borderWidth: 1,
      bottom: 14,
      height: 54,
      left: 28,
      position: "absolute",
      transform: [{ rotate: "-8deg" }],
      width: 98,
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
      fontSize: 19,
      fontWeight: "900",
    },
    businessList: {
      gap: 18,
    },
    businessMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiFamily,
      fontSize: 11,
      flexShrink: 1,
      lineHeight: 15,
      marginTop: 3,
    },
    businessMetric: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: theme.radii.pill,
      color: theme.colors.foreground,
      fontSize: 10,
      fontWeight: "800",
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
      fontFamily: mobileTypography.uiFamily,
      fontSize: 14,
      flexShrink: 1,
      fontWeight: "800",
      letterSpacing: -0.3,
      lineHeight: 18,
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
      fontSize: 9,
      fontWeight: "900",
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
      fontSize: 11,
      fontWeight: "900",
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
      fontSize: 22,
      fontWeight: "900",
    },
    cancelAction: {
      color: theme.colors.danger,
      fontSize: 13,
      fontWeight: "900",
    },
    cardShadow: {
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 22,
    },
    cardBody: {
      color: theme.colors.mutedForeground,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 22,
      marginTop: 8,
    },
    cardTitle: {
      color: theme.colors.foreground,
      fontSize: 17,
      fontWeight: "900",
    },
    categoryBadge: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      color: theme.colors.deepGold,
      fontSize: 10,
      fontWeight: "900",
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
      fontFamily: mobileTypography.uiFamily,
      fontSize: 11,
      fontWeight: "600",
      textAlign: "center",
    },
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
    },
    categoryIcon: {
      color: "#ffffff",
      fontSize: 24,
      fontWeight: "900",
      lineHeight: 28,
    },
    categoryIconImage: {
      height: 28,
      tintColor: "#ffffff",
      width: 28,
    },
    categoryIconTile: {
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.16)",
      borderColor: "rgba(255, 255, 255, 0.2)",
      borderRadius: 18,
      borderWidth: 1,
      height: 54,
      justifyContent: "center",
      width: 54,
    },
    categoryIconTileActive: {
      backgroundColor: "rgba(255, 255, 255, 0.22)",
      borderColor: "rgba(255, 255, 255, 0.34)",
    },
    categoryLabel: {
      color: "#ffffff",
      fontFamily: mobileTypography.uiFamily,
      fontSize: 14,
      fontWeight: "700",
      textAlign: "center",
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
      fontSize: 19,
      fontWeight: "900",
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
      fontFamily: mobileTypography.uiFamily,
      fontSize: 11,
      fontWeight: "700",
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
      borderRadius: 30,
      flex: 0,
      height: 60,
      marginHorizontal: 8,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.32 : 0.12,
      shadowRadius: 16,
      transform: [{ translateY: -12 }],
      width: 60,
    },
    centerTabButtonActive: {
      backgroundColor: "#174d3b",
      transform: [{ translateY: -13 }, { scale: 1.02 }],
    },
    centerTabActiveIndicator: {
      backgroundColor: "transparent",
    },
    centerTabIcon: {
      color: theme.colors.foreground,
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
      fontSize: 28,
      fontWeight: "900",
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
      fontFamily: mobileTypography.displayFamily,
      fontSize: 21,
      fontWeight: "800",
      lineHeight: 27,
      marginTop: 12,
      textAlign: "center",
    },
    content: {
      gap: 20,
      paddingBottom: 128,
      paddingHorizontal: 20,
    },
    immersiveContent: {
      paddingHorizontal: 0,
      paddingTop: 0,
    },
    dataOwnershipNote: {
      color: theme.colors.success,
      fontSize: 12,
      fontWeight: "800",
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
      fontSize: 12,
      fontWeight: "900",
    },
    dateDayActive: {
      color: theme.colors.foregroundInverse,
    },
    dateLabel: {
      color: theme.colors.foreground,
      fontSize: 24,
      fontWeight: "900",
      marginTop: 2,
    },
    dateLabelActive: {
      color: theme.colors.foregroundInverse,
    },
    dateMeta: {
      color: theme.colors.mutedForeground,
      fontSize: 11,
      fontWeight: "800",
      marginTop: 3,
    },
    dateMetaActive: {
      color: theme.colors.foregroundInverse,
    },
    datePill: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 22,
      borderWidth: 1,
      flexGrow: 1,
      minWidth: 82,
      padding: 12,
      paddingVertical: 14,
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
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },
    detailServicePrice: {
      color: theme.colors.deepGold,
      fontSize: 13,
      fontWeight: "900",
    },
    detailServiceTitle: {
      color: theme.colors.foreground,
      fontSize: 15,
      flexShrink: 1,
      fontWeight: "900",
      lineHeight: 20,
    },
    detailStat: {
      backgroundColor: theme.colors.cardElevated,
      borderRadius: theme.radii.pill,
      color: theme.colors.foreground,
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 26,
      fontWeight: "900",
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
        radius: 32,
        tone: "elevated",
      }),
      borderColor: theme.colors.border,
      gap: 0,
      padding: 0,
      ...createMobileShadow(theme, {
        darkOpacity: 0.28,
        height: 12,
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
      fontSize: 18,
      fontWeight: "900",
    },
    discoveryTitle: {
      color: theme.colors.foreground,
      fontSize: 25,
      fontWeight: "900",
      letterSpacing: -0.4,
      lineHeight: 32,
      marginTop: 7,
    },
    editAction: {
      color: theme.colors.gold,
      fontSize: 13,
      fontWeight: "900",
    },
    favoriteButton: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 20,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      position: "absolute",
      right: 12,
      top: 12,
      width: 40,
    },
    favoriteText: {
      color: theme.colors.gold,
      fontSize: 20,
      fontWeight: "900",
    },
    favoriteIconImage: {
      height: 22,
      tintColor: theme.colors.gold,
      width: 22,
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
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 15,
      fontWeight: "900",
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
      fontSize: 14,
      fontWeight: "900",
    },
    header: {
      alignItems: "center",
      backgroundColor: theme.colors.background,
      flexDirection: "row",
      gap: 8,
      paddingBottom: 8,
      paddingHorizontal: 20,
      paddingTop: 28,
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
      fontSize: 17,
      fontWeight: "900",
    },
    heroActions: {
      gap: 12,
      marginTop: 24,
    },
    heroBody: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiFamily,
      fontSize: 19,
      fontWeight: "500",
      lineHeight: 27,
      marginTop: 8,
    },
    heroCard: {
      backgroundColor: "transparent",
      overflow: "hidden",
      paddingHorizontal: 4,
      paddingTop: 8,
    },
    heroEyebrow: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiFamily,
      fontSize: 17,
      fontWeight: "600",
      letterSpacing: 0,
      marginTop: 12,
    },
    heroGlow: {
      display: "none",
    },
    heroTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.displayFamily,
      fontSize: 36,
      fontWeight: "800",
      letterSpacing: -0.7,
      lineHeight: 44,
      marginTop: 4,
    },
    homeBusinessCardSlot: {
      flexBasis: "31%",
      flexGrow: 1,
      minWidth: 0,
    },
    homeBusinessGrid: {
      flexDirection: "row",
      gap: 14,
    },
    integrationBody: {
      color: theme.colors.warning,
      flexShrink: 1,
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
      fontSize: 16,
      fontWeight: "900",
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
      fontSize: 8,
      fontWeight: "800",
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
      fontSize: 10,
    },
    locationIconImage: {
      height: 14,
      tintColor: theme.colors.success,
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
      paddingHorizontal: 22,
      paddingVertical: 10,
    },
    locationText: {
      color: theme.colors.foreground,
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 18,
      fontWeight: "900",
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
      fontSize: 22,
      fontWeight: "900",
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
      fontSize: 14,
      fontWeight: "800",
      lineHeight: 21,
    },
    chatBubbleTextCustomer: {
      color: theme.colors.foregroundInverse,
    },
    chatBubbleTime: {
      color: theme.colors.mutedForeground,
      fontSize: 10,
      fontWeight: "800",
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
      fontSize: 20,
      fontWeight: "900",
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
      fontSize: 16,
      fontWeight: "900",
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
      fontSize: 11,
      fontWeight: "900",
      lineHeight: 15,
      marginTop: 6,
    },
    marketplaceMode: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: theme.radii.pill,
      color: theme.colors.mutedForeground,
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 12,
      fontWeight: "900",
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
      fontFamily: mobileTypography.uiFamily,
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
      fontSize: 22,
      fontWeight: "900",
    },
    messageHeroIconImage: {
      height: 24,
      tintColor: theme.colors.foregroundInverse,
      width: 24,
    },
    messageHeroTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.displayFamily,
      fontSize: 27,
      fontWeight: "800",
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
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
    },
    myBookingStatus: {
      color: theme.colors.success,
      fontSize: 12,
      fontWeight: "900",
    },
    myBookingTitle: {
      color: theme.colors.foreground,
      fontSize: 19,
      fontWeight: "900",
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
      fontSize: 16,
      fontWeight: "900",
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
      fontSize: 11,
      fontWeight: "900",
      lineHeight: 15,
      marginTop: 8,
      overflow: "hidden",
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    notificationTime: {
      color: theme.colors.mutedForeground,
      fontSize: 11,
      fontWeight: "800",
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
      fontSize: 26,
      fontWeight: "800",
      lineHeight: 40,
      marginTop: 28,
      textAlign: "center",
    },
    onboardingBrand: {
      color: theme.colors.foreground,
      fontSize: 44,
      fontWeight: "900",
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
      fontSize: 11,
      fontWeight: "900",
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
      fontSize: 132,
      fontWeight: "900",
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
      fontSize: 19,
      fontWeight: "900",
    },
    onboardingScreen: {
      backgroundColor: theme.colors.hero,
      flex: 1,
      paddingHorizontal: 0,
    },
    onboardingSlogan: {
      color: theme.colors.gold,
      fontSize: 31,
      fontWeight: "500",
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
      fontSize: 30,
      fontWeight: "900",
      lineHeight: 37,
      marginTop: 24,
    },
    ownerActionText: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      color: theme.colors.deepGold,
      fontSize: 11,
      fontWeight: "900",
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
      fontSize: 13,
      lineHeight: 20,
      marginTop: 4,
    },
    ownerBusinessName: {
      color: theme.colors.foreground,
      fontSize: 21,
      flexShrink: 1,
      fontWeight: "900",
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
      fontSize: 16,
      fontWeight: "900",
    },
    ownerHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    ownerHeroBody: {
      color: theme.colors.mutedForeground,
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
      fontSize: 20,
      fontWeight: "900",
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
      fontSize: 22,
      fontWeight: "900",
    },
    ownerMetricRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    ownerMetricValue: {
      color: theme.colors.deepGold,
      fontSize: 13,
      fontWeight: "900",
    },
    ownerMutedActionText: {
      color: theme.colors.mutedForeground,
      fontSize: 11,
      fontWeight: "900",
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
      fontSize: 11,
      fontWeight: "800",
      marginTop: 6,
    },
    ownerOverviewGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    ownerOverviewLabel: {
      color: theme.colors.foreground,
      fontSize: 13,
      fontWeight: "900",
      marginTop: 6,
    },
    ownerOverviewValue: {
      color: theme.colors.deepGold,
      fontSize: 26,
      fontWeight: "900",
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
      fontSize: 22,
      fontWeight: "900",
    },
    ownerQuickText: {
      color: theme.colors.foreground,
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 11,
      fontWeight: "900",
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
      fontSize: 12,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    paymentBody: {
      color: theme.colors.mutedForeground,
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
      fontFamily: mobileTypography.uiFamily,
      fontSize: 18,
      fontWeight: "700",
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
      fontSize: 13,
      fontWeight: "900",
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
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 19,
      marginTop: 6,
    },
    preferenceChevron: {
      color: theme.colors.gold,
      fontSize: 20,
      fontWeight: "900",
    },
    preferenceCopy: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    preferenceGroupTitle: {
      color: theme.colors.deepGold,
      fontSize: 13,
      fontWeight: "900",
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
      fontSize: 12,
      fontWeight: "800",
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
      fontSize: 12,
      fontWeight: "900",
      marginTop: 4,
    },
    profileStatMeta: {
      color: theme.colors.mutedForeground,
      fontSize: 10,
      fontWeight: "700",
      marginTop: 3,
    },
    profileStatsGrid: {
      flexDirection: "row",
      gap: 8,
      marginTop: 18,
    },
    profileStatValue: {
      color: theme.colors.deepGold,
      fontSize: 18,
      fontWeight: "900",
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
      borderRadius: theme.radii.control,
      flex: 1,
      minHeight: 56,
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
      fontFamily: mobileTypography.uiFamily,
      fontSize: 17,
      fontWeight: "700",
    },
    promoBadge: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.accent,
      borderRadius: 28,
      borderWidth: 1,
      height: 56,
      justifyContent: "center",
      width: 56,
    },
    promoBadgeText: {
      color: theme.colors.foregroundInverse,
      fontWeight: "900",
    },
    promoBody: {
      color: theme.colors.foreground,
      fontSize: 16,
      fontWeight: "700",
      lineHeight: 24,
      marginTop: 8,
      maxWidth: 230,
    },
    promoCard: {
      alignItems: "center",
      backgroundColor: "#0c251d",
      borderColor: "#163e31",
      borderRadius: 34,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 142,
      padding: 22,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 20, width: 0 },
      shadowOpacity: theme.isDark ? 0.34 : 0.1,
      shadowRadius: 30,
    },
    promoTitle: {
      color: theme.colors.gold,
      fontSize: 29,
      fontWeight: "900",
      lineHeight: 36,
    },
    quickReplyChip: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      color: theme.colors.deepGold,
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 16,
      fontWeight: "900",
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
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 12,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    receiptTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.displayFamily,
      fontSize: 24,
      fontWeight: "800",
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
      fontSize: 15,
      fontWeight: "700",
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
      fontSize: 26,
      fontWeight: "900",
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
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 18,
      fontWeight: "900",
    },
    rowMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiFamily,
      fontSize: 13,
      flexShrink: 1,
      lineHeight: 19,
      marginTop: 4,
    },
    rowPrice: {
      color: theme.colors.deepGold,
      fontSize: 13,
      fontWeight: "900",
    },
    rowTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiFamily,
      fontSize: 15,
      flexShrink: 1,
      fontWeight: "700",
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
      fontSize: 18,
      fontWeight: "900",
    },
    selectedServiceIconImage: {
      height: 24,
      tintColor: theme.colors.foregroundInverse,
      width: 24,
    },
    selectedServiceMeta: {
      color: theme.colors.mutedForeground,
      fontSize: 12,
      marginTop: 4,
    },
    selectedServiceTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiFamily,
      fontSize: 16,
      fontWeight: "700",
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
      fontFamily: mobileTypography.uiFamily,
      fontSize: 12,
      fontWeight: "500",
      lineHeight: 18,
      marginTop: 5,
    },
    serviceName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.uiFamily,
      fontSize: 15,
      fontWeight: "700",
      lineHeight: 21,
    },
    servicePrice: {
      color: theme.colors.deepGold,
      fontSize: 13,
      fontWeight: "900",
    },
    safeActionText: {
      color: theme.colors.deepGold,
      fontSize: 12,
      fontWeight: "900",
      lineHeight: 17,
      marginTop: 10,
    },
    screenDescription: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiFamily,
      flexShrink: 1,
      fontSize: 16,
      lineHeight: 24,
      marginTop: 10,
    },
    screenEyebrow: {
      color: theme.colors.gold,
      fontFamily: mobileTypography.uiFamily,
      flexShrink: 1,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.5,
      lineHeight: 16,
      textTransform: "uppercase",
    },
    screenTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.displayFamily,
      flexShrink: 1,
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: -0.4,
      lineHeight: 35,
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
      gap: 14,
      justifyContent: "space-between",
      marginTop: 28,
    },
    salonActionIcon: {
      color: theme.colors.foreground,
      fontSize: 26,
      fontWeight: "900",
      lineHeight: 30,
    },
    salonActionIconImage: {
      height: 28,
      tintColor: theme.colors.foreground,
      width: 28,
    },
    salonActionLabel: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiFamily,
      fontSize: 13,
      fontWeight: "600",
      marginTop: 8,
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
      minHeight: 92,
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
      fontSize: 43,
      fontWeight: "700",
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
      fontSize: 34,
      fontWeight: "900",
      lineHeight: 36,
      marginTop: -5,
    },
    salonHero: {
      backgroundColor: "#05080c",
      height: 330,
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
    salonHeroPattern: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 70,
      justifyContent: "center",
      left: 0,
      opacity: 0.9,
      position: "absolute",
      right: 0,
      top: 0,
    },
    salonHeroStage: {
      backgroundColor: "rgba(91, 48, 29, 0.42)",
      bottom: 0,
      height: 130,
      left: 0,
      overflow: "hidden",
      position: "absolute",
      right: 0,
    },
    salonInfoCard: {
      backgroundColor: theme.colors.background,
      gap: 0,
      paddingHorizontal: 28,
      paddingTop: 22,
    },
    salonLikes: {
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.gold,
      fontSize: 16,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    salonMeta: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiFamily,
      fontSize: 18,
      fontWeight: "500",
      lineHeight: 25,
      marginTop: 8,
    },
    salonName: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.displayFamily,
      flexShrink: 1,
      fontSize: 40,
      fontWeight: "800",
      letterSpacing: -0.8,
      lineHeight: 50,
    },
    salonRatingRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      marginTop: 22,
    },
    salonRatingStar: {
      color: theme.colors.gold,
      fontSize: 23,
      fontWeight: "900",
    },
    salonRatingStarImage: {
      height: 22,
      tintColor: theme.colors.gold,
      width: 22,
    },
    salonRatingText: {
      color: theme.colors.foreground,
      fontSize: 20,
      fontWeight: "800",
    },
    salonRoundButton: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 31,
      borderWidth: 1,
      height: 62,
      justifyContent: "center",
      width: 62,
    },
    salonRoundButtonText: {
      color: theme.colors.foreground,
      fontSize: 32,
      fontWeight: "900",
      lineHeight: 34,
    },
    salonRoundButtonIcon: {
      height: 30,
      tintColor: theme.colors.foreground,
      width: 30,
    },
    salonServiceAdd: {
      alignItems: "center",
      borderColor: theme.colors.gold,
      borderRadius: 27,
      borderWidth: 2,
      height: 54,
      justifyContent: "center",
      width: 54,
    },
    salonServiceAddText: {
      color: theme.colors.gold,
      fontSize: 30,
      fontWeight: "900",
      lineHeight: 32,
    },
    salonServiceMedia: {
      borderRadius: 20,
      height: 84,
      overflow: "hidden",
      width: 130,
    },
    salonServiceMeta: {
      color: theme.colors.mutedForeground,
      fontSize: 15,
      fontWeight: "800",
      lineHeight: 21,
      marginTop: 10,
    },
    salonServiceName: {
      color: theme.colors.foreground,
      fontSize: 28,
      fontWeight: "900",
      lineHeight: 36,
    },
    salonServicePrice: {
      color: theme.colors.foreground,
      fontSize: 20,
      fontWeight: "900",
      marginTop: 8,
    },
    salonServiceRow: {
      alignItems: "center",
      flexDirection: "row-reverse",
      gap: 18,
      justifyContent: "space-between",
    },
    salonServicesList: {
      gap: 34,
      paddingHorizontal: 28,
      paddingTop: 34,
    },
    salonTabs: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 34,
    },
    salonTabText: {
      color: theme.colors.mutedForeground,
      fontSize: 15,
      fontWeight: "900",
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
      borderRadius: 38,
      height: 430,
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
      flexGrow: 1,
      fontSize: 15,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 18,
      paddingVertical: 13,
      textAlign: "center",
    },
    searchMapChipActive: {
      backgroundColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      color: theme.colors.foregroundInverse,
      flexGrow: 1,
      fontSize: 16,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 24,
      paddingVertical: 14,
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
      borderRadius: 34,
      borderWidth: 1,
      height: 68,
      justifyContent: "center",
      width: 68,
    },
    searchMapFilterIcon: {
      color: theme.colors.foreground,
      fontSize: 26,
      fontWeight: "900",
      lineHeight: 28,
      transform: [{ rotate: "90deg" }],
    },
    searchMapFilterIconImage: {
      height: 26,
      tintColor: theme.colors.foreground,
      width: 26,
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
      gap: 16,
      justifyContent: "center",
      minWidth: 60,
    },
    searchResultCard: {
      alignItems: "center",
      backgroundColor: "#f4f6f8",
      borderRadius: 28,
      flexDirection: "row-reverse",
      gap: 18,
      paddingVertical: 12,
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
      fontSize: 15,
      fontWeight: "800",
    },
    searchResultHeart: {
      color: "#111827",
      fontSize: 38,
      fontWeight: "900",
      lineHeight: 40,
    },
    searchResultHeartImage: {
      height: 36,
      tintColor: "#111827",
      width: 36,
    },
    searchResultMedia: {
      borderRadius: 20,
      height: 96,
      overflow: "hidden",
      width: 128,
    },
    searchResultMeta: {
      color: "#6b7280",
      fontSize: 16,
      fontWeight: "700",
      lineHeight: 22,
      marginTop: 4,
    },
    searchResultName: {
      color: "#101827",
      fontSize: 28,
      fontWeight: "900",
      letterSpacing: -0.6,
      lineHeight: 34,
    },
    searchResultPrice: {
      color: "#101827",
      fontSize: 17,
      fontWeight: "900",
      marginTop: 8,
    },
    searchResultRating: {
      color: "#101827",
      fontSize: 17,
      fontWeight: "900",
    },
    searchResultReviews: {
      color: "#101827",
      fontSize: 17,
      fontWeight: "800",
    },
    searchResultShare: {
      color: "#6b7280",
      fontSize: 28,
      fontWeight: "900",
      lineHeight: 30,
    },
    searchResultShareImage: {
      height: 26,
      tintColor: "#6b7280",
      width: 26,
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
      gap: 14,
      marginTop: -42,
      padding: 26,
      paddingTop: 42,
    },
    searchResultsTitle: {
      color: "#101827",
      fontFamily: mobileTypography.displayFamily,
      fontSize: 28,
      fontWeight: "800",
      lineHeight: 36,
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
      fontSize: 17,
      fontWeight: "900",
    },
    searchActionRow: {
      flexDirection: "row",
      gap: 10,
    },
    searchActionText: {
      color: theme.colors.foreground,
      fontSize: 12,
      fontWeight: "900",
    },
    searchBar: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 30,
      borderWidth: 1,
      flexDirection: "row",
      gap: 14,
      minHeight: 64,
      paddingHorizontal: 18,
      paddingVertical: 16,
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
      fontSize: 28,
      fontWeight: "900",
    },
    searchIconImage: {
      height: 28,
      tintColor: theme.colors.mutedForeground,
      width: 28,
    },
    searchPlaceholder: {
      color: theme.colors.mutedForeground,
      fontFamily: mobileTypography.uiFamily,
      flex: 1,
      fontSize: 16,
      fontWeight: "500",
      lineHeight: 22,
      minWidth: 0,
    },
    searchChip: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.deepGold,
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 13,
      fontWeight: "900",
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
      fontSize: 14,
      fontWeight: "900",
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
      fontSize: 13,
      fontWeight: "900",
    },
    sectionAction: {
      color: theme.colors.gold,
      fontSize: 13,
      fontWeight: "900",
    },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      paddingHorizontal: 2,
    },
    sectionTitle: {
      color: theme.colors.foreground,
      fontFamily: mobileTypography.displayFamily,
      fontSize: 21,
      fontWeight: "800",
      letterSpacing: -0.2,
    },
    selectText: {
      color: theme.colors.gold,
      fontSize: 13,
      fontWeight: "900",
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
      fontSize: 18,
      fontWeight: "900",
    },
    shell: {
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
      fontFamily: mobileTypography.uiFamily,
      fontSize: 11,
      fontWeight: "700",
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
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 26,
      fontWeight: "900",
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
      alignItems: "flex-start",
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
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 17,
      maxWidth: "42%",
    },
    summaryValue: {
      color: theme.colors.foreground,
      flexShrink: 1,
      fontSize: 13,
      fontWeight: "900",
      lineHeight: 18,
      maxWidth: "58%",
      textAlign: "right",
    },
    supportPill: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.warning,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      color: theme.colors.warning,
      fontSize: 12,
      fontWeight: "900",
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
      fontSize: 18,
      fontWeight: "900",
    },
    stepTitle: {
      color: theme.colors.foreground,
      fontSize: 15,
      fontWeight: "900",
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
      fontFamily: mobileTypography.uiFamily,
      fontSize: 10,
      fontWeight: "700",
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
      fontSize: 12,
      fontWeight: "900",
    },
    verifiedBadge: {
      backgroundColor: "#3b82f6",
      borderRadius: 16,
      color: "#ffffff",
      fontSize: 16,
      fontWeight: "900",
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
      fontFamily: mobileTypography.uiFamily,
      fontSize: 14,
      fontWeight: "700",
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
      fontSize: 12,
      fontWeight: "900",
    },
    timelineItem: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
    },
    timelineTitle: {
      color: theme.colors.foreground,
      fontSize: 20,
      fontWeight: "900",
      marginTop: 4,
    },
    unreadBadge: {
      backgroundColor: theme.colors.gold,
      borderRadius: 999,
      color: theme.colors.foregroundInverse,
      fontSize: 11,
      fontWeight: "900",
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
      fontSize: 15,
      fontWeight: "900",
    },
    voiceIconImage: {
      height: 18,
      tintColor: theme.colors.gold,
      width: 18,
    },
    visualOnlyButton: {
      opacity: 0.96,
      shadowOpacity: theme.isDark ? 0.16 : 0.06,
    },
  });
