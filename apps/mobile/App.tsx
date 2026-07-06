import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import {
  I18nManager,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { fetchMobileMarketplace } from "./src/api/marketplace";
import {
  BottomTabBar,
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
import type { MobileTabId } from "./src/navigation/tabs";
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

const categories = [
  { badge: "الأكثر حجزاً", count: "128 نشاط", icon: "✂", label: "صالونات", tone: "gold" },
  { badge: "متاح اليوم", count: "42 مطعم", icon: "🍽", label: "مطاعم", tone: "green" },
  { badge: "قريب منك", count: "31 عيادة", icon: "⚕", label: "عيادات", tone: "blue" },
  { badge: "فاخر", count: "18 سبا", icon: "💆", label: "سبا", tone: "rose" },
  { badge: "صباحي", count: "27 مركز", icon: "🏋", label: "رياضة", tone: "dark" },
  { badge: "سريع", count: "64 خدمة", icon: "🧰", label: "خدمات", tone: "gold" },
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

const businessTabs = ["الخدمات", "التقييمات", "حول"];

const onboardingHighlights = [
  "حجوزات",
  "رسائل",
  "أعمال",
];

const accountActions = [
  { label: "تسجيل الدخول", tone: "primary" },
  { label: "إنشاء حساب", tone: "secondary" },
];

const searchSuggestions = [
  "قص شعر اليوم",
  "مطعم عائلي قريب",
  "طبيب أسنان",
];

const recentSearches = [
  "صالون نسائي",
  "حجز طاولة",
  "عيادة قريبة",
];

const popularSearches = [
  "الأقرب",
  "الأعلى تقييماً",
  "متاح اليوم",
  "عروض",
];

const filterChips = [
  { label: "الأقرب", selected: true },
  { label: "الأعلى تقييماً", selected: false },
  { label: "متاح اليوم", selected: true },
  { label: "السعر", selected: false },
  { label: "للنساء", selected: false },
  { label: "للعوائل", selected: false },
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
  { label: "حسب النظام", meta: "يتبع إعدادات الجهاز", selected: true },
  { label: "فاتح", meta: "كريمي وهادئ", selected: false },
  { label: "داكن", meta: "أسود فاخر مع ذهب", selected: false },
];

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
  const [activeTab, setActiveTab] = useState<MobileTabId>("customerHome");
  const [marketplaceState, setMarketplaceState] = useState<MarketplaceState>({
    status: "idle",
  });
  const theme = colorScheme === "light" ? lightMobileTheme : darkMobileTheme;
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

  const handleTabPress = (tabId: MobileTabId) => {
    if (tabId === "marketplace" && marketplaceState.status === "idle") {
      loadMarketplace();
    }

    setActiveTab(tabId);
  };

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style={theme.isDark ? "light" : "dark"} />
      <ScreenHeader
        isRtl={isRtl}
        locale={locale}
        onLocaleChange={setLocale}
        styles={styles}
        text={text}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "customerHome" ? (
          <CustomerHomeScreen isRtl={isRtl} styles={styles} />
        ) : null}

        {activeTab === "marketplace" ? (
          <MarketplaceScreen
            isRtl={isRtl}
            onRetry={loadMarketplace}
            state={marketplaceState}
            styles={styles}
            text={text}
          />
        ) : null}

        {activeTab === "bookings" ? (
          <BookingFlowScreen isRtl={isRtl} styles={styles} />
        ) : null}

        {activeTab === "messages" ? (
          <MessagesNotificationsPreviewScreen isRtl={isRtl} styles={styles} />
        ) : null}

        {activeTab === "business" ? (
          <BusinessOwnerPreviewScreen isRtl={isRtl} styles={styles} />
        ) : null}

        {activeTab === "account" ? (
          <AccountScreen isRtl={isRtl} styles={styles} text={text} />
        ) : null}
      </ScrollView>

      <BottomTabBar
        activeTab={activeTab}
        onTabPress={handleTabPress}
        styles={styles}
        text={text}
      />
    </SafeAreaView>
  );
}

function CustomerHomeScreen({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <>
      <WelcomeOnboardingCard isRtl={isRtl} styles={styles} />
      <HeroCard isRtl={isRtl} styles={styles} />
      <SearchDiscoveryPanel isRtl={isRtl} styles={styles} />
      <CategoryGrid styles={styles} />
      <PromoCard isRtl={isRtl} styles={styles} />
      <BusinessDetailShowcase isRtl={isRtl} styles={styles} />
      <SectionHeader
        action="عرض الكل"
        isRtl={isRtl}
        styles={styles}
        title="قريب منك"
      />
      <View style={styles.businessList}>
        {featuredBusinesses.map((business) => (
          <PremiumBusinessCard
            business={business}
            isRtl={isRtl}
            key={business.id}
            styles={styles}
          />
        ))}
      </View>
    </>
  );
}

function WelcomeOnboardingCard({
  isRtl,
  styles,
}: {
  isRtl: boolean;
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
        <PrimaryButton label="ابدأ الآن" styles={styles} />
        <Pressable
          accessibilityRole="button"
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

function BusinessDetailShowcase({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.detailCard}>
      <View style={styles.detailHero}>
        <View style={styles.detailHeroGlow} />
        <View style={styles.detailTopRow}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>مفتوح الآن</Text>
          </View>
          <View style={styles.iconActionRow}>
            <View style={styles.iconAction}>
              <Text style={styles.iconActionText}>↗</Text>
            </View>
            <View style={styles.iconAction}>
              <Text style={styles.iconActionText}>♡</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.detailTitle, isRtl && styles.rtlText]}>
          Noura Beauty Lounge
        </Text>
        <Text style={[styles.detailMeta, isRtl && styles.rtlText]}>
          صالون وتجميل · بغداد، الكرادة · 1.8 كم
        </Text>
        <View style={styles.detailStatsRow}>
          <Text style={styles.detailStat}>★ 4.9</Text>
          <Text style={styles.detailStat}>128 تقييم</Text>
          <Text style={styles.detailStat}>من 25,000 د.ع</Text>
        </View>
      </View>

      <View style={styles.detailTabs}>
        {businessTabs.map((tab, index) => (
          <View
            key={tab}
            style={[styles.detailTab, index === 0 && styles.detailTabActive]}
          >
            <Text
              style={[
                styles.detailTabText,
                index === 0 && styles.detailTabTextActive,
              ]}
            >
              {tab}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.detailServiceCard}>
        <View>
          <Text style={[styles.detailServiceTitle, isRtl && styles.rtlText]}>
            قص وتصفيف فاخر
          </Text>
          <Text style={[styles.detailServiceMeta, isRtl && styles.rtlText]}>
            45 دقيقة · مع ليان · تأكيد سريع
          </Text>
        </View>
        <Text style={styles.detailServicePrice}>25,000 د.ع</Text>
      </View>

      <View style={styles.detailCtaRow}>
        <PrimaryButton label="احجز الآن" styles={styles} />
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.secondaryIconButton,
            pressed && styles.softButtonPressed,
          ]}
        >
          <Text style={styles.secondaryIconButtonText}>مراجعات</Text>
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
        <Text style={styles.locationDot}>●</Text>
        <Text style={styles.locationText}>بغداد · الكرادة</Text>
      </View>
      <Text style={[styles.heroEyebrow, isRtl && styles.rtlText]}>
        One Platform. Every Booking.
      </Text>
      <Text style={[styles.heroTitle, isRtl && styles.rtlText]}>
        احجز أفضل الخدمات حولك بتجربة فاخرة وسريعة
      </Text>
      <Text style={[styles.heroBody, isRtl && styles.rtlText]}>
        صالونات، مطاعم، عيادات، وخدمات يومية في تطبيق واحد مصمم للموبايل.
      </Text>
      <View style={styles.heroActions}>
        <PrimaryButton label="ابدأ الحجز" styles={styles} />
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.ghostButton,
            pressed && styles.outlineButtonPressed,
          ]}
        >
          <Text style={styles.ghostButtonText}>استكشف السوق</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SearchDiscoveryPanel({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.discoveryCard}>
      <View style={styles.discoveryHeaderRow}>
        <View>
          <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
            اكتشف بسرعة
          </Text>
          <Text style={[styles.discoveryTitle, isRtl && styles.rtlText]}>
            ماذا تريد أن تحجز اليوم؟
          </Text>
        </View>
        <View style={styles.discoveryLocationButton}>
          <Text style={styles.discoveryLocationText}>⌖</Text>
        </View>
      </View>

      <SearchBar isRtl={isRtl} styles={styles} />

      <View style={styles.searchActionRow}>
        <View style={styles.searchActionButton}>
          <Text style={styles.searchActionIcon}>⌕</Text>
          <Text style={styles.searchActionText}>بحث</Text>
        </View>
        <View style={styles.searchActionButton}>
          <Text style={styles.searchActionIcon}>◌</Text>
          <Text style={styles.searchActionText}>صوت</Text>
        </View>
        <View style={styles.searchActionButton}>
          <Text style={styles.searchActionIcon}>≡</Text>
          <Text style={styles.searchActionText}>فلترة</Text>
        </View>
      </View>

      <SearchChipSection
        chips={searchSuggestions}
        isRtl={isRtl}
        styles={styles}
        title="اقتراحات ذكية"
      />
      <SearchChipSection
        chips={recentSearches}
        isRtl={isRtl}
        muted
        styles={styles}
        title="آخر عمليات البحث"
      />
      <SearchChipSection
        chips={popularSearches}
        isRtl={isRtl}
        styles={styles}
        title="الأكثر رواجاً"
      />
    </View>
  );
}

function SearchChipSection({
  chips,
  isRtl,
  muted,
  styles,
  title,
}: {
  chips: string[];
  isRtl: boolean;
  muted?: boolean;
  styles: MobileStyles;
  title: string;
}) {
  return (
    <View style={styles.searchChipSection}>
      <Text style={[styles.searchChipTitle, isRtl && styles.rtlText]}>
        {title}
      </Text>
      <View style={styles.searchChipRow}>
        {chips.map((chip) => (
          <Text
            key={chip}
            style={[styles.searchChip, muted && styles.searchChipMuted]}
          >
            {chip}
          </Text>
        ))}
      </View>
    </View>
  );
}

function SearchBar({ isRtl, styles }: { isRtl: boolean; styles: MobileStyles }) {
  return (
    <View style={styles.searchBar}>
      <Text style={styles.searchIcon}>⌕</Text>
      <Text style={[styles.searchPlaceholder, isRtl && styles.rtlText]}>
        ابحث عن خدمة، مطعم، عيادة...
      </Text>
      <View style={styles.voiceButton}>
        <Text style={styles.voiceText}>◌</Text>
      </View>
      <View style={styles.filterButton}>
        <Text style={styles.filterText}>⚙</Text>
      </View>
    </View>
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
            <Text style={styles.categoryRailIcon}>{category.icon}</Text>
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
              <Text style={styles.categoryIcon}>{category.icon}</Text>
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

function PremiumBusinessCard({
  business,
  isRtl,
  styles,
}: {
  business: PremiumBusiness;
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.businessCard}>
      <View style={styles.businessHero}>
        <View style={styles.businessArtLineOne} />
        <View style={styles.businessArtLineTwo} />
        <View style={styles.businessArtCircle} />
        <View style={styles.businessStatusBadge}>
          <Text style={styles.businessStatusText}>{business.status}</Text>
        </View>
        <View style={styles.businessInitial}>
          <Text style={styles.businessInitialText}>{business.name.charAt(0)}</Text>
        </View>
        <View style={styles.favoriteButton}>
          <Text style={styles.favoriteText}>♡</Text>
        </View>
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
            <Text style={styles.ratingText}>★ {business.rating}</Text>
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
    </View>
  );
}

function MarketplaceScreen({
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
  return (
    <>
      <View style={styles.mapHeaderCard}>
        <View style={styles.marketplaceModeRow}>
          <Text style={styles.marketplaceModeActive}>قائمة</Text>
          <Text style={styles.marketplaceMode}>خريطة</Text>
        </View>
        <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
          سوق REZNO
        </Text>
        <Text style={[styles.mapTitle, isRtl && styles.rtlText]}>
          اكتشف الأعمال والخدمات حسب قربك واهتماماتك
        </Text>
        <PremiumFilterChips styles={styles} />
      </View>
      <SearchDiscoveryPanel isRtl={isRtl} styles={styles} />
      <RecommendedDiscoverySection isRtl={isRtl} styles={styles} />
      <MarketplaceStateView
        isRtl={isRtl}
        onRetry={onRetry}
        state={state}
        styles={styles}
        text={text}
      />
    </>
  );
}

function PremiumFilterChips({ styles }: { styles: MobileStyles }) {
  return (
    <View style={styles.filterChipWrap}>
      {filterChips.map((chip) => (
        <Pressable
          accessibilityHint="فلتر بصري فقط ولا يغير نتائج السوق حالياً."
          accessibilityLabel={`فلتر ${chip.label}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: true, selected: chip.selected }}
          disabled
          hitSlop={TOUCH_HIT_SLOP}
          key={chip.label}
          style={[
            styles.filterChipButton,
            chip.selected && styles.filterChipButtonSelected,
          ]}
        >
          <Text
            style={[
              styles.filterChipText,
              chip.selected && styles.filterChipTextSelected,
            ]}
          >
            {chip.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function RecommendedDiscoverySection({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.recommendedCard}>
      <SectionHeader
        action="عرض المزيد"
        isRtl={isRtl}
        styles={styles}
        title="مقترح لك"
      />
      <View style={styles.recommendedList}>
        {featuredBusinesses.slice(0, 2).map((business) => (
          <View key={business.id} style={styles.recommendedItem}>
            <View style={styles.recommendedIcon}>
              <Text style={styles.recommendedIconText}>
                {business.name.charAt(0)}
              </Text>
            </View>
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
                {business.name}
              </Text>
              <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
                {business.category} · {business.distance} · ★ {business.rating}
              </Text>
            </View>
            <Text style={styles.tagText}>{business.tag}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MarketplaceStateView({
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
  if (state.status === "idle" || state.status === "loading") {
    return (
      <PremiumStateCard
        body="نجهز قائمة الأعمال القريبة مع الحفاظ على نفس مسار API الحالي."
        icon="⌁"
        isRtl={isRtl}
        label={text.tabs.marketplace}
        styles={styles}
        title={text.marketplaceLoading}
      />
    );
  }

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
        title="تعذر تحميل السوق"
        tone="warning"
      />
    );
  }

  if (state.businesses.length === 0) {
    return (
      <PremiumStateCard
        body={text.marketplaceEmptyBody}
        icon="◇"
        isRtl={isRtl}
        label={text.tabs.marketplace}
        styles={styles}
        title={text.marketplaceEmptyTitle}
      />
    );
  }

  return (
    <View style={styles.businessList}>
      {state.businesses.map((business) => (
        <View key={business.id} style={styles.businessCard}>
          <View style={styles.businessHeroCompact}>
            <View style={styles.businessArtLineOne} />
            <View style={styles.businessArtLineTwo} />
            <View style={styles.businessArtCircle} />
            <View style={styles.businessStatusBadge}>
              <Text style={styles.businessStatusText}>
                {business.serviceCount > 0 ? "حجز متاح" : "قيد الإعداد"}
              </Text>
            </View>
            <View style={styles.favoriteButton}>
              <Text style={styles.favoriteText}>♡</Text>
            </View>
          </View>
          <View style={styles.businessBody}>
            <View style={styles.businessTitleRow}>
              <View style={styles.businessCopy}>
                <Text style={[styles.businessName, isRtl && styles.rtlText]}>
                  {business.name}
                </Text>
                <Text style={[styles.businessMeta, isRtl && styles.rtlText]}>
                  {[
                    business.categoryName,
                    business.city,
                    business.branch.locationLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <View style={styles.ratingPill}>
                <Text style={styles.ratingText}>
                  ★ {business.averageRating?.toFixed(1) ?? "-"}
                </Text>
              </View>
            </View>
            <View style={styles.businessMetricsRow}>
              <Text style={styles.businessMetric}>
                {business.reviewCount} {text.marketplaceReviews}
              </Text>
              <Text style={styles.businessMetric}>
                {business.serviceCount} {text.marketplaceServices}
              </Text>
            </View>
            <View style={styles.businessFooter}>
              <Text style={styles.priceText}>
                {business.startingPrice
                  ? `${text.marketplaceStartingFrom} ${business.startingPrice}`
                  : text.marketplaceEmptyTitle}
              </Text>
              <Text style={styles.tagText}>
                {business.branch.locationLabel ?? "قريب منك"}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </View>
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
        <Text style={styles.selectedServiceIconText}>✦</Text>
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
      <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
        ملخص الحجز
      </Text>
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
        <Text style={styles.confirmationIcon}>✓</Text>
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
            <Text style={styles.messageHeroIconText}>✉</Text>
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
            <Text style={styles.notificationIconText}>
              {item.tone === "success"
                ? "✓"
                : item.tone === "message"
                  ? "↩"
                  : "•"}
            </Text>
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
  styles,
  text,
}: {
  isRtl: boolean;
  styles: MobileStyles;
  text: (typeof labels)[MobileLocale];
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
          صفوف بصرية فقط لتوضيح تجربة التفضيلات المستقبلية بدون حفظ دائم أو
          صلاحيات جهاز.
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
          {themePreferenceRows.map((row) => (
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
      fontSize: 24,
      flexShrink: 1,
      fontWeight: "900",
      letterSpacing: 1.6,
    },
    brandRow: {
      alignItems: "center",
      flexDirection: "row",
      flex: 1,
      gap: 12,
    },
    brandTagline: {
      color: theme.colors.mutedForeground,
      fontSize: 11,
      flexShrink: 1,
      fontWeight: "800",
      lineHeight: 15,
      marginTop: 2,
    },
    businessBody: {
      gap: 14,
      padding: 18,
    },
    businessCard: {
      ...createMobileSurface(theme, {
        radius: 30,
        tone: "elevated",
      }),
      borderColor: theme.colors.border,
      overflow: "hidden",
      ...createMobileShadow(theme, {
        darkOpacity: 0.42,
        height: 20,
        lightOpacity: 0.12,
        radius: 32,
      }),
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
      gap: 10,
      justifyContent: "space-between",
      paddingTop: 14,
    },
    businessHero: {
      backgroundColor: "#050608",
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      height: 118,
      justifyContent: "space-between",
      overflow: "hidden",
      padding: 16,
    },
    businessHeroCompact: {
      backgroundColor: "#050608",
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      height: 104,
      justifyContent: "space-between",
      overflow: "hidden",
      padding: 16,
    },
    businessArtCircle: {
      backgroundColor: "rgba(255, 193, 58, 0.82)",
      borderRadius: 999,
      bottom: 24,
      height: 20,
      left: 54,
      position: "absolute",
      width: 20,
    },
    businessArtLineOne: {
      backgroundColor: "rgba(255, 193, 58, 0.42)",
      borderRadius: 999,
      bottom: 16,
      height: 76,
      left: 24,
      position: "absolute",
      width: 4,
    },
    businessArtLineTwo: {
      borderColor: "rgba(255, 193, 58, 0.55)",
      borderRadius: 22,
      borderWidth: 2,
      bottom: 22,
      height: 48,
      left: 54,
      position: "absolute",
      width: 48,
    },
    businessInitial: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.accent,
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.34 : 0.12,
      shadowRadius: 16,
      width: 48,
    },
    businessInitialText: {
      color: theme.colors.foregroundInverse,
      fontSize: 22,
      fontWeight: "900",
    },
    businessList: {
      gap: 18,
    },
    businessMeta: {
      color: theme.colors.mutedForeground,
      fontSize: 13,
      flexShrink: 1,
      lineHeight: 19,
      marginTop: 4,
    },
    businessMetric: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: theme.radii.pill,
      color: theme.colors.foreground,
      fontSize: 12,
      fontWeight: "800",
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    businessMetricsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    businessName: {
      color: theme.colors.foreground,
      fontSize: 20,
      flexShrink: 1,
      fontWeight: "900",
      letterSpacing: -0.3,
      lineHeight: 25,
    },
    businessStatusBadge: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    businessStatusText: {
      color: theme.colors.success,
      fontSize: 11,
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
      borderRadius: 28,
      borderWidth: 0,
      flexBasis: "30%",
      flexGrow: 1,
      gap: 10,
      minHeight: 118,
      paddingHorizontal: 12,
      paddingVertical: 18,
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
      fontSize: 11,
      fontWeight: "800",
      textAlign: "center",
    },
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
    },
    categoryIcon: {
      color: "#ffffff",
      fontSize: 30,
      fontWeight: "900",
    },
    categoryLabel: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "900",
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
      fontSize: 22,
    },
    categoryRailLabel: {
      color: theme.colors.foreground,
      fontSize: 11,
      fontWeight: "900",
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
      borderWidth: 5,
      borderRadius: 38,
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: theme.isDark ? 0.48 : 0.16,
      shadowRadius: 22,
      transform: [{ translateY: -22 }],
    },
    centerTabButtonActive: {
      backgroundColor: "#174d3b",
      transform: [{ translateY: -24 }, { scale: 1.04 }],
    },
    centerTabActiveIndicator: {
      backgroundColor: "transparent",
    },
    centerTabIcon: {
      color: theme.colors.foreground,
      fontSize: 36,
      lineHeight: 38,
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
      fontSize: 21,
      fontWeight: "900",
      lineHeight: 27,
      marginTop: 12,
      textAlign: "center",
    },
    content: {
      gap: 24,
      paddingBottom: 178,
      paddingHorizontal: 20,
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
        radius: 34,
        tone: "elevated",
      }),
      borderColor: theme.colors.border,
      gap: 22,
      padding: 22,
      ...createMobileShadow(theme, {
        darkOpacity: 0.4,
        height: 18,
        lightOpacity: 0.12,
        radius: 32,
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
      alignSelf: "flex-end",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 20,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    favoriteText: {
      color: theme.colors.gold,
      fontSize: 20,
      fontWeight: "900",
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
      borderBottomColor: theme.colors.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      paddingBottom: 18,
      paddingHorizontal: 22,
      paddingTop: 18,
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
      fontSize: 17,
      fontWeight: "700",
      lineHeight: 26,
      marginTop: 12,
    },
    heroCard: {
      backgroundColor: theme.colors.hero,
      borderColor: theme.colors.border,
      borderRadius: 36,
      borderWidth: 1,
      overflow: "hidden",
      padding: 26,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 26, width: 0 },
      shadowOpacity: theme.isDark ? 0.44 : 0.14,
      shadowRadius: 42,
    },
    heroEyebrow: {
      color: theme.colors.deepGold,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.8,
      marginTop: 18,
      textTransform: "uppercase",
    },
    heroGlow: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 999,
      height: 190,
      opacity: theme.isDark ? 0.42 : 0.8,
      position: "absolute",
      right: -64,
      top: -68,
      width: 190,
    },
    heroTitle: {
      color: theme.colors.foreground,
      fontSize: 33,
      fontWeight: "900",
      letterSpacing: -0.5,
      lineHeight: 41,
      marginTop: 12,
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
      minWidth: 42,
      paddingHorizontal: 10,
      paddingVertical: 7,
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
      fontSize: 11,
      fontWeight: "800",
      lineHeight: 14,
    },
    localeButtonTextActive: {
      color: theme.colors.foregroundInverse,
    },
    localeRow: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 0,
      gap: 6,
    },
    locationDot: {
      color: theme.colors.success,
      fontSize: 10,
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
      paddingHorizontal: 12,
      paddingVertical: 8,
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
      borderRadius: 24,
      height: 50,
      justifyContent: "center",
      shadowColor: theme.colors.deepGold,
      shadowOffset: { height: 12, width: 0 },
      shadowOpacity: theme.isDark ? 0.48 : 0.14,
      shadowRadius: 20,
      width: 50,
    },
    logoText: {
      color: theme.colors.foregroundInverse,
      fontSize: 24,
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
    messageHeroTitle: {
      color: theme.colors.foreground,
      fontSize: 27,
      fontWeight: "900",
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
      borderColor: theme.colors.border,
      borderRadius: 42,
      borderWidth: 1,
      minHeight: 720,
      overflow: "hidden",
      paddingHorizontal: 28,
      paddingVertical: 34,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 30, width: 0 },
      shadowOpacity: theme.isDark ? 0.52 : 0.16,
      shadowRadius: 44,
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
    paymentTitle: {
      color: theme.colors.foreground,
      fontSize: 18,
      fontWeight: "900",
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
      fontSize: 17,
      fontWeight: "900",
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
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: 0.3,
      marginTop: 4,
    },
    ratingPill: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
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
      fontSize: 15,
      flexShrink: 1,
      fontWeight: "900",
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
    selectedServiceMeta: {
      color: theme.colors.mutedForeground,
      fontSize: 12,
      marginTop: 4,
    },
    selectedServiceTitle: {
      color: theme.colors.foreground,
      fontSize: 16,
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
      flexShrink: 1,
      fontSize: 16,
      lineHeight: 24,
      marginTop: 10,
    },
    screenEyebrow: {
      color: theme.colors.gold,
      flexShrink: 1,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.5,
      lineHeight: 16,
      textTransform: "uppercase",
    },
    screenTitle: {
      color: theme.colors.foreground,
      flexShrink: 1,
      fontSize: 28,
      fontWeight: "900",
      letterSpacing: -0.4,
      lineHeight: 35,
      marginTop: 8,
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
    searchIcon: {
      color: theme.colors.mutedForeground,
      fontSize: 28,
      fontWeight: "900",
    },
    searchPlaceholder: {
      color: theme.colors.mutedForeground,
      flex: 1,
      fontSize: 16,
      fontWeight: "800",
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
      fontSize: 21,
      fontWeight: "900",
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
      fontSize: 11,
      fontWeight: "900",
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
      height: 118,
      left: 0,
      paddingBottom: 22,
      paddingHorizontal: 14,
      paddingTop: 14,
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
      borderRadius: 24,
      flex: 1,
      gap: 6,
      justifyContent: "center",
      minHeight: 66,
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
      fontSize: 25,
    },
    tabIconActive: {
      color: theme.colors.gold,
    },
    tabLabel: {
      color: theme.colors.foreground,
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 16,
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
    timeSlotText: {
      color: theme.colors.foreground,
      fontSize: 14,
      fontWeight: "900",
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
    visualOnlyButton: {
      opacity: 0.96,
      shadowOpacity: theme.isDark ? 0.16 : 0.06,
    },
  });
