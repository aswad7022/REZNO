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
import { API_BASE_URL } from "./src/config/api";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getTextDirection,
  labels,
  type MobileLocale,
} from "./src/i18n/labels";
import { MOBILE_TABS, type MobileTabId } from "./src/navigation/tabs";
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
  tag: string;
};

type BookingStep = {
  body: string;
  icon: string;
  title: string;
};

const categories = [
  { icon: "✂", label: "صالونات", tone: "gold" },
  { icon: "🍽", label: "مطاعم", tone: "green" },
  { icon: "⚕", label: "عيادات", tone: "blue" },
  { icon: "💆", label: "سبا", tone: "rose" },
  { icon: "🏋", label: "رياضة", tone: "dark" },
  { icon: "🧰", label: "خدمات", tone: "gold" },
];

const featuredBusinesses: PremiumBusiness[] = [
  {
    category: "صالون وتجميل",
    distance: "1.8 كم",
    id: "noura-salon",
    name: "Noura Beauty Lounge",
    price: "من 25,000 د.ع",
    rating: "4.9",
    tag: "متاح اليوم",
  },
  {
    category: "مطعم وحجوزات",
    distance: "2.4 كم",
    id: "mat3am-gold",
    name: "Mat3am Gold",
    price: "طاولة من 4 أشخاص",
    rating: "4.8",
    tag: "حجز سريع",
  },
  {
    category: "عيادة أسنان",
    distance: "3.1 كم",
    id: "smile-clinic",
    name: "Smile Studio Clinic",
    price: "استشارة من 15,000 د.ع",
    rating: "4.7",
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
  { name: "ليان", role: "خبيرة شعر", time: "متاحة 4:30 م" },
  { name: "سارة", role: "مختصة بشرة", time: "متاحة غداً" },
  { name: "آدم", role: "مدير حجوزات", time: "أقرب وقت 6:00 م" },
];

const services = [
  { duration: "45 دقيقة", name: "قص وتصفيف", price: "25,000 د.ع" },
  { duration: "60 دقيقة", name: "عناية بشرة", price: "35,000 د.ع" },
  { duration: "90 دقيقة", name: "باقة فاخرة", price: "55,000 د.ع" },
];

const timeSlots = ["10:00", "12:30", "14:00", "16:30", "18:00"];

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
          <SimpleBoundaryScreen
            body="مركز الرسائل محفوظ كواجهة أصلية فاخرة. ربط المحادثات الحقيقية يبقى لسبرنت API منفصل."
            eyebrow="الرسائل"
            isRtl={isRtl}
            primary="عرض المحادثات لاحقاً"
            secondary="إشعارات داخلية"
            styles={styles}
            title="تواصل بدون مغادرة الحجز"
          />
        ) : null}

        {activeTab === "business" ? (
          <SimpleBoundaryScreen
            body="تبويب الأعمال يحافظ على نموذج الحساب الموحد. مالك النشاط يرى إدارة أعماله لاحقاً، والعميل يرى مسار إضافة نشاط."
            eyebrow="الأعمال"
            isRtl={isRtl}
            primary="إدارة النشاط لاحقاً"
            secondary="إضافة نشاط"
            styles={styles}
            title="أعمالك داخل نفس الحساب"
          />
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

function ScreenHeader({
  isRtl,
  locale,
  onLocaleChange,
  styles,
  text,
}: {
  isRtl: boolean;
  locale: MobileLocale;
  onLocaleChange: (locale: MobileLocale) => void;
  styles: MobileStyles;
  text: (typeof labels)[MobileLocale];
}) {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>R</Text>
        </View>
        <View style={styles.brandCopy}>
          <Text style={[styles.brandName, isRtl && styles.rtlText]}>REZNO</Text>
          <Text style={[styles.brandTagline, isRtl && styles.rtlText]}>
            {text.appTagline}
          </Text>
        </View>
      </View>

      <View style={styles.localeRow}>
        {SUPPORTED_LOCALES.map((item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: item === locale }}
            key={item}
            onPress={() => onLocaleChange(item)}
            style={[
              styles.localeButton,
              item === locale && styles.localeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.localeButtonText,
                item === locale && styles.localeButtonTextActive,
              ]}
            >
              {item.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
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
      <HeroCard isRtl={isRtl} styles={styles} />
      <SearchBar isRtl={isRtl} styles={styles} />
      <CategoryGrid styles={styles} />
      <PromoCard isRtl={isRtl} styles={styles} />
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
        <Pressable accessibilityRole="button" style={styles.ghostButton}>
          <Text style={styles.ghostButtonText}>استكشف السوق</Text>
        </Pressable>
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
      <View style={styles.filterButton}>
        <Text style={styles.filterText}>⚙</Text>
      </View>
    </View>
  );
}

function CategoryGrid({ styles }: { styles: MobileStyles }) {
  return (
    <View style={styles.categoryGrid}>
      {categories.map((category) => (
        <View key={category.label} style={styles.categoryCard}>
          <Text style={styles.categoryIcon}>{category.icon}</Text>
          <Text style={styles.categoryLabel}>{category.label}</Text>
        </View>
      ))}
    </View>
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

function SectionHeader({
  action,
  isRtl,
  styles,
  title,
}: {
  action?: string;
  isRtl: boolean;
  styles: MobileStyles;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>
        {title}
      </Text>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
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
        <View style={styles.businessFooter}>
          <Text style={styles.priceText}>{business.price}</Text>
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
        <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
          خريطة وقائمة
        </Text>
        <Text style={[styles.mapTitle, isRtl && styles.rtlText]}>
          اكتشف الأعمال القريبة بدون إضافة SDK خرائط
        </Text>
        <View style={styles.chipRow}>
          {["الأقرب", "الأعلى تقييماً", "متاح اليوم"].map((chip) => (
            <Text key={chip} style={styles.filterChip}>
              {chip}
            </Text>
          ))}
        </View>
      </View>
      <SearchBar isRtl={isRtl} styles={styles} />
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
      <View style={styles.screenCard}>
        <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
          {text.tabs.marketplace}
        </Text>
        <Text style={[styles.screenTitle, isRtl && styles.rtlText]}>
          {text.marketplaceLoading}
        </Text>
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View style={styles.screenCard}>
        <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
          {text.marketplaceErrorTitle}
        </Text>
        <Text style={[styles.screenDescription, isRtl && styles.rtlText]}>
          {state.message}
        </Text>
        <PrimaryButton label={text.marketplaceRetry} onPress={onRetry} styles={styles} />
      </View>
    );
  }

  if (state.businesses.length === 0) {
    return (
      <View style={styles.screenCard}>
        <Text style={[styles.screenTitle, isRtl && styles.rtlText]}>
          {text.marketplaceEmptyTitle}
        </Text>
        <Text style={[styles.screenDescription, isRtl && styles.rtlText]}>
          {text.marketplaceEmptyBody}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.businessList}>
      {state.businesses.map((business) => (
        <View key={business.id} style={styles.businessCard}>
          <View style={styles.businessBody}>
            <Text style={[styles.businessName, isRtl && styles.rtlText]}>
              {business.name}
            </Text>
            <Text style={[styles.businessMeta, isRtl && styles.rtlText]}>
              {[business.categoryName, business.city, business.branch.locationLabel]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <View style={styles.businessFooter}>
              <Text style={styles.priceText}>
                ★ {business.averageRating?.toFixed(1) ?? "-"} ·{" "}
                {business.reviewCount} {text.marketplaceReviews}
              </Text>
              <Text style={styles.tagText}>
                {business.startingPrice
                  ? `${text.marketplaceStartingFrom} ${business.startingPrice}`
                  : `${business.serviceCount} ${text.marketplaceServices}`}
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
      {services.map((service) => (
        <ServiceRow isRtl={isRtl} key={service.name} service={service} styles={styles} />
      ))}

      <SectionHeader isRtl={isRtl} styles={styles} title="اختر المختص" />
      {staffMembers.map((staff) => (
        <StaffRow isRtl={isRtl} key={staff.name} staff={staff} styles={styles} />
      ))}

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
      <MyBookingCard isRtl={isRtl} styles={styles} />
    </>
  );
}

function ServiceRow({
  isRtl,
  service,
  styles,
}: {
  isRtl: boolean;
  service: { duration: string; name: string; price: string };
  styles: MobileStyles;
}) {
  return (
    <View style={styles.rowCard}>
      <View style={styles.rowIcon}>
        <Text style={styles.rowIconText}>✦</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
          {service.name}
        </Text>
        <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
          {service.duration}
        </Text>
      </View>
      <Text style={styles.rowPrice}>{service.price}</Text>
    </View>
  );
}

function StaffRow({
  isRtl,
  staff,
  styles,
}: {
  isRtl: boolean;
  staff: { name: string; role: string; time: string };
  styles: MobileStyles;
}) {
  return (
    <View style={styles.rowCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{staff.name.charAt(0)}</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, isRtl && styles.rtlText]}>
          {staff.name}
        </Text>
        <Text style={[styles.rowMeta, isRtl && styles.rtlText]}>
          {staff.role} · {staff.time}
        </Text>
      </View>
      <Text style={styles.selectText}>اختيار</Text>
    </View>
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
        ملخص وطريقة الدفع
      </Text>
      <Text style={[styles.paymentTitle, isRtl && styles.rtlText]}>
        قص وتصفيف · ليان · اليوم 4:30 م
      </Text>
      <Text style={[styles.paymentBody, isRtl && styles.rtlText]}>
        طريقة تجريبية للعرض فقط: الدفع عند الحضور. لا يوجد تكامل دفع حقيقي في
        هذه المرحلة.
      </Text>
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
      <Text style={styles.confirmationIcon}>✓</Text>
      <Text style={[styles.confirmationTitle, isRtl && styles.rtlText]}>
        تم تجهيز شاشة التأكيد
      </Text>
      <Text style={[styles.confirmationBody, isRtl && styles.rtlText]}>
        تعرض رقم حجز وهمي وحالة واضحة بدون إنشاء حجز أو إرسال إشعارات.
      </Text>
    </View>
  );
}

function MyBookingCard({
  isRtl,
  styles,
}: {
  isRtl: boolean;
  styles: MobileStyles;
}) {
  return (
    <View style={styles.myBookingCard}>
      <Text style={[styles.myBookingStatus, isRtl && styles.rtlText]}>
        حجز قادم
      </Text>
      <Text style={[styles.myBookingTitle, isRtl && styles.rtlText]}>
        Noura Beauty Lounge
      </Text>
      <Text style={[styles.myBookingMeta, isRtl && styles.rtlText]}>
        الخميس · 4:30 م · قص وتصفيف
      </Text>
      <View style={styles.bookingActions}>
        <Text style={styles.editAction}>تعديل</Text>
        <Text style={styles.cancelAction}>إلغاء</Text>
      </View>
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
      <SimpleBoundaryScreen
        body="واجهة الحساب تعرض اللغة، حالة التكامل، وروابط مستقبلية بدون تخزين أسرار أو تسجيل دخول حقيقي."
        eyebrow="الحساب"
        isRtl={isRtl}
        primary="ربط تسجيل الدخول لاحقاً"
        secondary="إعدادات الحساب"
        styles={styles}
        title="حساب REZNO الموحد"
      />
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

function SimpleBoundaryScreen({
  body,
  eyebrow,
  isRtl,
  primary,
  secondary,
  styles,
  title,
}: {
  body: string;
  eyebrow: string;
  isRtl: boolean;
  primary: string;
  secondary: string;
  styles: MobileStyles;
  title: string;
}) {
  return (
    <View style={styles.screenCard}>
      <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
        {eyebrow}
      </Text>
      <Text style={[styles.screenTitle, isRtl && styles.rtlText]}>
        {title}
      </Text>
      <Text style={[styles.screenDescription, isRtl && styles.rtlText]}>
        {body}
      </Text>
      <View style={styles.actionStack}>
        <PrimaryButton disabled label={primary} styles={styles} />
        <Pressable accessibilityRole="button" style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{secondary}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PrimaryButton({
  disabled,
  label,
  onPress,
  styles,
}: {
  disabled?: boolean;
  label: string;
  onPress?: () => void;
  styles: MobileStyles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.disabledButton]}
    >
      <Text
        style={[
          styles.primaryButtonText,
          disabled && styles.disabledButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function BottomTabBar({
  activeTab,
  onTabPress,
  styles,
  text,
}: {
  activeTab: MobileTabId;
  onTabPress: (tabId: MobileTabId) => void;
  styles: MobileStyles;
  text: (typeof labels)[MobileLocale];
}) {
  return (
    <View style={styles.tabBar}>
      {MOBILE_TABS.map((tab) => {
        const active = tab.id === activeTab;
        const isCenterAction = tab.id === "bookings";

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={tab.id}
            onPress={() => onTabPress(tab.id)}
            style={[
              styles.tabButton,
              active && styles.tabButtonActive,
              isCenterAction && styles.centerTabButton,
            ]}
          >
            <Text
              style={[
                styles.tabIcon,
                active && styles.tabIconActive,
                isCenterAction && styles.centerTabIcon,
              ]}
            >
              {isCenterAction ? "+" : tab.icon}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.tabLabel, active && styles.tabLabelActive]}
            >
              {text.tabs[tab.id]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type MobileStyles = ReturnType<typeof createStyles>;

const createStyles = (theme: MobileTheme) =>
  StyleSheet.create({
    actionStack: {
      gap: theme.spacing.sm,
      marginTop: 18,
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
      gap: 16,
      marginTop: 14,
    },
    bookingSummaryCard: {
      backgroundColor: theme.colors.hero,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.xl,
      borderWidth: 1,
      padding: 22,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: theme.isDark ? 0.28 : 0.09,
      shadowRadius: 26,
    },
    brandCopy: {
      flex: 1,
    },
    brandName: {
      color: theme.colors.foreground,
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: 1,
    },
    brandRow: {
      alignItems: "center",
      flexDirection: "row",
      flex: 1,
      gap: 12,
    },
    brandTagline: {
      color: theme.colors.mutedForeground,
      fontSize: 12,
      marginTop: 2,
    },
    businessBody: {
      gap: 12,
      padding: 16,
    },
    businessCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      overflow: "hidden",
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: theme.isDark ? 0.24 : 0.08,
      shadowRadius: 24,
    },
    businessCopy: {
      flex: 1,
    },
    businessFooter: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    businessHero: {
      backgroundColor: theme.colors.heroMuted,
      height: 108,
      justifyContent: "space-between",
      padding: 14,
    },
    businessInitial: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: theme.colors.gold,
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    businessInitialText: {
      color: theme.colors.foregroundInverse,
      fontSize: 22,
      fontWeight: "900",
    },
    businessList: {
      gap: 14,
    },
    businessMeta: {
      color: theme.colors.mutedForeground,
      fontSize: 13,
      marginTop: 4,
    },
    businessName: {
      color: theme.colors.foreground,
      fontSize: 18,
      fontWeight: "900",
    },
    businessTitleRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
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
    categoryCard: {
      alignItems: "center",
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: 22,
      borderWidth: 1,
      flexBasis: "30%",
      flexGrow: 1,
      gap: 8,
      padding: 14,
    },
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    categoryIcon: {
      fontSize: 24,
    },
    categoryLabel: {
      color: theme.colors.foreground,
      fontSize: 12,
      fontWeight: "900",
    },
    centerTabButton: {
      backgroundColor: theme.colors.gold,
      borderRadius: 28,
      transform: [{ translateY: -14 }],
    },
    centerTabIcon: {
      color: theme.colors.foregroundInverse,
      fontSize: 28,
      lineHeight: 30,
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
      lineHeight: 21,
      marginTop: 8,
    },
    confirmationCard: {
      alignItems: "center",
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      padding: 22,
    },
    confirmationIcon: {
      color: theme.colors.success,
      fontSize: 34,
      fontWeight: "900",
    },
    confirmationTitle: {
      color: theme.colors.foreground,
      fontSize: 19,
      fontWeight: "900",
      marginTop: 8,
    },
    content: {
      gap: theme.spacing.md,
      paddingBottom: 132,
      paddingHorizontal: 18,
    },
    disabledButton: {
      backgroundColor: theme.colors.disabled,
      shadowOpacity: 0,
    },
    disabledButtonText: {
      color: theme.colors.disabledText,
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
      borderRadius: 18,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    favoriteText: {
      color: theme.colors.gold,
      fontSize: 20,
      fontWeight: "900",
    },
    filterButton: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: 18,
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
    filterText: {
      color: theme.colors.foregroundInverse,
      fontSize: 15,
      fontWeight: "900",
    },
    ghostButton: {
      alignItems: "center",
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.control,
      borderWidth: 1,
      flex: 1,
      paddingVertical: 14,
    },
    ghostButtonText: {
      color: theme.colors.gold,
      fontSize: 14,
      fontWeight: "900",
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      paddingBottom: 12,
      paddingHorizontal: 18,
      paddingTop: 18,
    },
    heroActions: {
      flexDirection: "row",
      gap: 12,
      marginTop: 20,
    },
    heroBody: {
      color: theme.colors.mutedForeground,
      fontSize: 15,
      lineHeight: 23,
      marginTop: 10,
    },
    heroCard: {
      backgroundColor: theme.colors.hero,
      borderColor: theme.colors.border,
      borderRadius: 32,
      borderWidth: 1,
      overflow: "hidden",
      padding: 22,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 18, width: 0 },
      shadowOpacity: theme.isDark ? 0.34 : 0.12,
      shadowRadius: 30,
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
      height: 130,
      opacity: 0.8,
      position: "absolute",
      right: -34,
      top: -44,
      width: 130,
    },
    heroTitle: {
      color: theme.colors.foreground,
      fontSize: 31,
      fontWeight: "900",
      lineHeight: 38,
      marginTop: 8,
    },
    integrationBody: {
      color: theme.colors.warning,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
    },
    integrationCard: {
      backgroundColor: theme.colors.warningSoft,
      borderColor: theme.colors.warning,
      borderRadius: 24,
      borderWidth: 1,
      padding: 18,
    },
    integrationTitle: {
      color: theme.colors.warning,
      fontSize: 16,
      fontWeight: "900",
    },
    localeButton: {
      backgroundColor: theme.colors.muted,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    localeButtonActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
    },
    localeButtonText: {
      color: theme.colors.mutedForeground,
      fontSize: 11,
      fontWeight: "800",
    },
    localeButtonTextActive: {
      color: theme.colors.foregroundInverse,
    },
    localeRow: {
      flexDirection: "row",
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
      borderRadius: 18,
      height: 44,
      justifyContent: "center",
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.32 : 0.14,
      shadowRadius: 14,
      width: 44,
    },
    logoText: {
      color: theme.colors.foregroundInverse,
      fontSize: 22,
      fontWeight: "900",
    },
    mapHeaderCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      padding: 18,
    },
    mapTitle: {
      color: theme.colors.foreground,
      fontSize: 22,
      fontWeight: "900",
      lineHeight: 29,
      marginTop: 8,
    },
    myBookingCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      padding: 18,
    },
    myBookingMeta: {
      color: theme.colors.mutedForeground,
      fontSize: 14,
      marginTop: 6,
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
      marginTop: 4,
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
      padding: 18,
    },
    paymentTitle: {
      color: theme.colors.foreground,
      fontSize: 18,
      fontWeight: "900",
      marginTop: 6,
    },
    priceText: {
      color: theme.colors.deepGold,
      fontSize: 13,
      fontWeight: "900",
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: theme.radii.control,
      flex: 1,
      paddingVertical: 14,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.26 : 0.14,
      shadowRadius: 18,
    },
    primaryButtonText: {
      color: theme.colors.foregroundInverse,
      fontSize: 14,
      fontWeight: "900",
    },
    promoBadge: {
      alignItems: "center",
      backgroundColor: theme.colors.foreground,
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    promoBadgeText: {
      color: theme.colors.gold,
      fontWeight: "900",
    },
    promoBody: {
      color: theme.colors.mutedForeground,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 6,
      maxWidth: 230,
    },
    promoCard: {
      alignItems: "center",
      backgroundColor: theme.colors.accentMuted,
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 18,
    },
    promoTitle: {
      color: theme.colors.foreground,
      fontSize: 18,
      fontWeight: "900",
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
      padding: 14,
    },
    rowCopy: {
      flex: 1,
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
      fontWeight: "900",
    },
    rtlText: {
      textAlign: "right",
      writingDirection: "rtl",
    },
    screenCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.xl,
      borderWidth: 1,
      padding: 20,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: theme.isDark ? 0.3 : 0.08,
      shadowRadius: 26,
    },
    screenDescription: {
      color: theme.colors.mutedForeground,
      fontSize: 15,
      lineHeight: 23,
      marginTop: 10,
    },
    screenEyebrow: {
      color: theme.colors.gold,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    screenTitle: {
      color: theme.colors.foreground,
      fontSize: 25,
      fontWeight: "900",
      lineHeight: 31,
      marginTop: 8,
    },
    searchBar: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    searchIcon: {
      color: theme.colors.gold,
      fontSize: 20,
      fontWeight: "900",
    },
    searchPlaceholder: {
      color: theme.colors.mutedForeground,
      flex: 1,
      fontSize: 14,
      fontWeight: "700",
    },
    secondaryButton: {
      alignItems: "center",
      backgroundColor: theme.colors.muted,
      borderRadius: theme.radii.control,
      paddingVertical: 14,
    },
    secondaryButtonText: {
      color: theme.colors.foreground,
      fontSize: 14,
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
      justifyContent: "space-between",
    },
    sectionTitle: {
      color: theme.colors.foreground,
      fontSize: 20,
      fontWeight: "900",
    },
    selectText: {
      color: theme.colors.gold,
      fontSize: 13,
      fontWeight: "900",
    },
    shell: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    stepBody: {
      color: theme.colors.mutedForeground,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 5,
    },
    stepCard: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: 20,
      borderWidth: 1,
      flexBasis: "47%",
      flexGrow: 1,
      padding: 14,
    },
    stepGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
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
      borderRadius: 30,
      borderWidth: 1,
      bottom: 24,
      elevation: 20,
      flexDirection: "row",
      height: 88,
      left: 12,
      padding: 8,
      position: "absolute",
      right: 12,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: theme.isDark ? 0.36 : 0.14,
      shadowRadius: 26,
      zIndex: 20,
    },
    tabButton: {
      alignItems: "center",
      borderRadius: 22,
      flex: 1,
      gap: 3,
      justifyContent: "center",
      minHeight: 58,
      paddingHorizontal: 3,
    },
    tabButtonActive: {
      backgroundColor: theme.colors.goldSoft,
    },
    tabIcon: {
      color: theme.colors.mutedForeground,
      fontSize: 18,
    },
    tabIconActive: {
      color: theme.colors.gold,
    },
    tabLabel: {
      color: theme.colors.mutedForeground,
      fontSize: 10,
      fontWeight: "800",
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
      gap: 10,
    },
    timeSlot: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    timeSlotActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
    },
    timeSlotText: {
      color: theme.colors.foreground,
      fontSize: 14,
      fontWeight: "900",
    },
    timeSlotTextActive: {
      color: theme.colors.foregroundInverse,
    },
  });
