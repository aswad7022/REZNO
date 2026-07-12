import { useMemo } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from "react-native";

import { labels, type MobileLocale } from "../i18n/labels";
import {
  PremiumEntrance,
  PremiumPressable,
} from "../components/premium-motion";
import type { MobileTheme } from "../theme/tokens";
import type {
  MobileBusinessVertical,
  MobileMarketplaceBusiness,
} from "../types/marketplace";

const HOME_FONT = {
  kufiBold: "NotoKufiArabic-Bold",
  kufiRegular: "NotoKufiArabic-Regular",
  uiBold: "NotoSansArabicUI-Bold",
  uiMedium: "NotoSansArabicUI-Medium",
  uiRegular: "NotoSansArabicUI-Regular",
  uiSemiBold: "NotoSansArabicUI-SemiBold",
} as const;

const HOME_LAYOUT = {
  businessSectionLimit: 6,
  categoryGap: 9,
  compactBreakpoint: 380,
  maxBusinessCardWidth: 181,
  minBusinessCardWidth: 154,
  standardBreakpoint: 430,
} as const;

type HomeCopy = {
  bookNow: string;
  categories: [string, string, string, string, string, string, string, string];
  changeLocation: string;
  city: string;
  couponAccessibility: string;
  distanceUnavailable: string;
  greeting: string;
  heroTitle: string;
  heroTitleLines: 1 | 2;
  messages: string;
  nearYou: string;
  newOnRezno: string;
  notificationAccessibility: string;
  promoBody: string;
  promoHeadline: string;
  priceUnavailable: string;
  recommendations: string;
  retryAccessibility: string;
  searchAccessibility: string;
  searchPlaceholder: string;
  viewAll: string;
};

const HOME_COPY: Record<MobileLocale, HomeCopy> = {
  ar: {
    bookNow: "احجز الآن",
    categories: [
      "صالون",
      "مطاعم",
      "عيادات",
      "رياضة",
      "سبا",
      "تعليم",
      "سيارات",
      "المزيد",
    ],
    changeLocation: "تغيير الموقع",
    city: "بغداد",
    couponAccessibility: "رمز الخصم REZNO15",
    distanceUnavailable: "المسافة غير متاحة",
    greeting: "مرحباً علي",
    heroTitle: "ما الخدمة التي تحتاجها اليوم؟",
    heroTitleLines: 1,
    messages: "الرسائل",
    nearYou: "قريب منك",
    newOnRezno: "جديد على ريزنو",
    notificationAccessibility: "الإشعارات",
    promoBody: "على حجوزات التجميل",
    promoHeadline: "خصم 15%",
    priceUnavailable: "السعر عند الحجز",
    recommendations: "توصياتنا لك ✧",
    retryAccessibility: "إعادة تحميل الأنشطة القريبة",
    searchAccessibility: "فتح البحث في خدمات REZNO",
    searchPlaceholder: "ابحث عن مطعم، عيادة، صالون...",
    viewAll: "عرض الكل",
  },
  en: {
    bookNow: "Book now",
    categories: [
      "Salon",
      "Restaurants",
      "Clinics",
      "Fitness",
      "Spa",
      "Education",
      "Cars",
      "More",
    ],
    changeLocation: "Change location",
    city: "Baghdad",
    couponAccessibility: "Discount code REZNO15",
    distanceUnavailable: "Distance unavailable",
    greeting: "Welcome Ali",
    heroTitle: "What service\ndo you need today?",
    heroTitleLines: 2,
    messages: "Messages",
    nearYou: "Near you",
    newOnRezno: "New on REZNO",
    notificationAccessibility: "Notifications",
    promoBody: "on beauty bookings",
    promoHeadline: "15% off",
    priceUnavailable: "Price on booking",
    recommendations: "Recommendations for you",
    retryAccessibility: "Reload nearby businesses",
    searchAccessibility: "Open REZNO service search",
    searchPlaceholder: "Search restaurants, clinics, salons...",
    viewAll: "View all",
  },
  ckb: {
    bookNow: "ئێستا حجز بکە",
    categories: [
      "سالۆن",
      "چێشتخانە",
      "کلینیک",
      "وەرزش",
      "سپا",
      "فێرکردن",
      "ئۆتۆمبێل",
      "زیاتر",
    ],
    changeLocation: "شوێن بگۆڕە",
    city: "بەغدا",
    couponAccessibility: "کۆدی داشکاندن REZNO15",
    distanceUnavailable: "دووری بەردەست نییە",
    greeting: "بەخێربێیت عەلی",
    heroTitle: "چ خزمەتگوزارییەک\nئەمڕۆ پێویستە؟",
    heroTitleLines: 2,
    messages: "نامەکان",
    nearYou: "لە نزیک تۆ",
    newOnRezno: "نوێ لە ریزنۆ",
    notificationAccessibility: "ئاگادارکردنەوەکان",
    promoBody: "لەسەر حجزەکانی جوانکاری",
    promoHeadline: "15% داشکاندن",
    priceUnavailable: "نرخ لە کاتی حجزدا",
    recommendations: "پێشنیارەکانمان بۆ تۆ",
    retryAccessibility: "کارە نزیکەکان دووبارە بار بکە",
    searchAccessibility: "گەڕانی خزمەتگوزارییەکانی REZNO بکەرەوە",
    searchPlaceholder: "بگەڕێ بۆ چێشتخانە، کلینیک، سالۆن...",
    viewAll: "هەمووی ببینە",
  },
};

type CategoryKind =
  | "car"
  | "clinic"
  | "education"
  | "gym"
  | "more"
  | "restaurant"
  | "salon"
  | "spa";

type HomeCategory = {
  icon?: ImageSourcePropType;
  kind: CategoryKind;
};

/* eslint-disable @typescript-eslint/no-require-imports -- Expo bundles these existing local image assets statically. */
const HOME_ICONS = {
  bell: require("../../assets/icons/common/notification-bell.png") as ImageSourcePropType,
  filter: require("../../assets/icons/common/filter.png") as ImageSourcePropType,
  heart: require("../../assets/icons/common/heart.png") as ImageSourcePropType,
  location: require("../../assets/icons/common/location-pin.png") as ImageSourcePropType,
  message: require("../../assets/icons/common/message.png") as ImageSourcePropType,
  profile: require("../../assets/icons/nav/account.png") as ImageSourcePropType,
  search: require("../../assets/icons/common/search.png") as ImageSourcePropType,
  star: require("../../assets/icons/common/star-rating.png") as ImageSourcePropType,
};

const HOME_CATEGORIES: HomeCategory[] = [
  {
    icon: require("../../assets/icons/categories/salon.png") as ImageSourcePropType,
    kind: "salon",
  },
  {
    icon: require("../../assets/icons/categories/restaurant.png") as ImageSourcePropType,
    kind: "restaurant",
  },
  {
    icon: require("../../assets/icons/categories/clinic.png") as ImageSourcePropType,
    kind: "clinic",
  },
  {
    icon: require("../../assets/icons/categories/gym.png") as ImageSourcePropType,
    kind: "gym",
  },
  {
    icon: require("../../assets/icons/categories/spa.png") as ImageSourcePropType,
    kind: "spa",
  },
  { kind: "education" },
  { kind: "car" },
  { kind: "more" },
];

const HOME_CATEGORY_PHYSICAL_ORDER = [0, 1, 2, 3, 7, 5, 6, 4] as const;
/* eslint-enable @typescript-eslint/no-require-imports */

export type HomeBusiness = {
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

export type HomeMarketplaceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; businesses: MobileMarketplaceBusiness[] }
  | { status: "error"; message: string };

type HomeBusinessSections = {
  nearby: HomeBusiness[];
  newOnRezno: HomeBusiness[];
  recommendations: HomeBusiness[];
};

type ReznoHomeScreenProps = {
  isRtl: boolean;
  locale: MobileLocale;
  marketplaceState: HomeMarketplaceState;
  onOpenBusiness: (business: HomeBusiness) => void;
  onOpenMarketplace: () => void;
  onRetry: () => void;
  theme: MobileTheme;
};

export function ReznoHomeScreen({
  isRtl,
  locale,
  marketplaceState,
  onOpenBusiness,
  onOpenMarketplace,
  onRetry,
  theme,
}: ReznoHomeScreenProps) {
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const copy = HOME_COPY[locale];
  const stateCopy = labels[locale];
  const pagePadding =
    width < HOME_LAYOUT.compactBreakpoint
      ? 14
      : width >= HOME_LAYOUT.standardBreakpoint
        ? 20
        : 16;
  const categoryWidth = Math.max(
    66,
    (width - pagePadding * 2 - HOME_LAYOUT.categoryGap * 3) / 4,
  );
  const categoryHeight = Math.max(
    68,
    Math.min(78, categoryWidth * 0.9),
  );
  const businessCardWidth = Math.min(
    HOME_LAYOUT.maxBusinessCardWidth,
    Math.max(HOME_LAYOUT.minBusinessCardWidth, Math.round(width * 0.42)),
  );
  const heroTitleSize =
    width < 380 ? 20 : width >= 430 ? 24 : width >= 400 ? 23 : 22;
  const businessSections = useMemo(
    () => deriveHomeBusinessSections(marketplaceState, locale, copy),
    [copy, locale, marketplaceState],
  );
  const dataSections = [
    {
      businesses: businessSections.recommendations,
      key: "recommendations",
      title: copy.recommendations,
    },
    {
      businesses: businessSections.nearby,
      key: "nearby",
      title: copy.nearYou,
    },
    {
      businesses: businessSections.newOnRezno,
      key: "new-on-rezno",
      title: copy.newOnRezno,
    },
  ];
  return (
    <View style={styles.screen}>
      <PremiumEntrance style={{ paddingHorizontal: pagePadding }}>
        <HeroSection
          copy={copy}
          isRtl={isRtl}
          styles={styles}
          titleSize={heroTitleSize}
        />
      </PremiumEntrance>

      <PremiumEntrance
        delay={70}
        distance={8}
        style={[styles.pageSection, { paddingHorizontal: pagePadding }]}
      >
        <SearchControl
          copy={copy}
          isRtl={isRtl}
          onPress={onOpenMarketplace}
          styles={styles}
        />
      </PremiumEntrance>

      <PremiumEntrance
        delay={140}
        distance={8}
        style={{ paddingHorizontal: pagePadding }}
      >
        <PromoBanner copy={copy} isRtl={isRtl} styles={styles} />
      </PremiumEntrance>

      <View
        style={[
          styles.categoryGrid,
          {
            gap: HOME_LAYOUT.categoryGap,
            paddingHorizontal: pagePadding,
          },
        ]}
      >
        {HOME_CATEGORY_PHYSICAL_ORDER.map((categoryIndex) => {
          const category = HOME_CATEGORIES[categoryIndex];

          return (
            <PremiumEntrance
              delay={210 + categoryIndex * 45}
              distance={8}
              key={category.kind}
              style={{ width: categoryWidth }}
            >
              <CategoryCard
                category={category}
                height={categoryHeight}
                label={copy.categories[categoryIndex]}
                onPress={onOpenMarketplace}
                styles={styles}
                width={categoryWidth}
              />
            </PremiumEntrance>
          );
        })}
      </View>

      {dataSections.map((section, index) => (
        <View key={section.key} style={styles.marketplaceSectionBlock}>
          <SectionHeader
            action={copy.viewAll}
            isRtl={isRtl}
            onPress={onOpenMarketplace}
            pagePadding={pagePadding}
            styles={styles}
            title={section.title}
          />
          <MarketplaceSection
            businessCardWidth={businessCardWidth}
            businesses={section.businesses}
            copy={copy}
            isRtl={isRtl}
            isPrimary={index === 0}
            onOpenBusiness={onOpenBusiness}
            onRetry={onRetry}
            pagePadding={pagePadding}
            sectionLabel={section.title}
            state={marketplaceState}
            stateCopy={stateCopy}
            styles={styles}
          />
        </View>
      ))}
    </View>
  );
}

function HeroSection({
  copy,
  isRtl,
  styles,
  titleSize,
}: {
  copy: HomeCopy;
  isRtl: boolean;
  styles: HomeStyles;
  titleSize: number;
}) {
  return (
    <View style={styles.heroSection}>
      <View style={styles.heroTopRow}>
        <View style={styles.heroActionGroup}>
          <HeroQuickAction
            icon={HOME_ICONS.message}
            label={copy.messages}
            styles={styles}
          />
          <HeroQuickAction
            icon={HOME_ICONS.bell}
            label={copy.notificationAccessibility}
            styles={styles}
          />
        </View>

        <View style={styles.heroIdentity}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            numberOfLines={1}
            style={[
              styles.heroGreeting,
              isRtl ? styles.rtlText : styles.ltrText,
            ]}
          >
            {copy.greeting}
          </Text>
          <View
            accessibilityLabel={copy.greeting}
            accessible
            style={styles.profileButton}
          >
            <Image
              accessible={false}
              alt=""
              resizeMode="contain"
              source={HOME_ICONS.profile}
              style={styles.profileIcon}
            />
          </View>
        </View>
      </View>

      <View style={styles.heroLowerRow}>
        <View
          accessibilityLabel={`${copy.city}. ${copy.changeLocation}`}
          accessible
          style={[styles.locationCard, !isRtl && styles.locationCardLtr]}
        >
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={HOME_ICONS.location}
            style={styles.locationCardIcon}
          />
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.88}
            numberOfLines={1}
            style={[
              styles.locationCardText,
              isRtl ? styles.rtlText : styles.ltrText,
            ]}
          >
            {copy.city}
          </Text>
          <Text style={styles.locationCardChevron}>⌄</Text>
        </View>

        <View style={styles.heroTitleWrap}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.96}
            numberOfLines={copy.heroTitleLines}
            style={[
              styles.heroTitle,
              { fontSize: titleSize, lineHeight: titleSize + 4 },
              isRtl ? styles.rtlText : styles.ltrText,
            ]}
          >
            {copy.heroTitle}
          </Text>
        </View>
      </View>
    </View>
  );
}

function HeroQuickAction({
  icon,
  label,
  styles,
}: {
  icon: ImageSourcePropType;
  label: string;
  styles: HomeStyles;
}) {
  return (
    <PremiumPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      scaleTo={0.96}
      style={styles.heroActionItem}
    >
      <View style={styles.heroActionButton}>
        <Image
          accessible={false}
          alt=""
          resizeMode="contain"
          source={icon}
          style={styles.heroActionIcon}
        />
        <View style={styles.heroActionDot} />
      </View>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        numberOfLines={1}
        style={styles.heroActionLabel}
      >
        {label}
      </Text>
    </PremiumPressable>
  );
}

function SearchControl({
  copy,
  isRtl,
  onPress,
  styles,
}: {
  copy: HomeCopy;
  isRtl: boolean;
  onPress: () => void;
  styles: HomeStyles;
}) {
  return (
    <PremiumPressable
      accessibilityLabel={copy.searchAccessibility}
      accessibilityRole="button"
      onPress={onPress}
      scaleTo={0.985}
      style={styles.searchControl}
    >
      <Image
        accessible={false}
        alt=""
        resizeMode="contain"
        source={HOME_ICONS.search}
        style={styles.searchIcon}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.searchPlaceholder,
          isRtl ? styles.rtlText : styles.ltrText,
        ]}
      >
        {copy.searchPlaceholder}
      </Text>
      <View
        accessible={false}
        style={styles.filterButton}
      >
        <Image
          accessible={false}
          alt=""
          resizeMode="contain"
          source={HOME_ICONS.filter}
          style={styles.filterIcon}
        />
      </View>
    </PremiumPressable>
  );
}

function CategoryCard({
  category,
  height,
  label,
  onPress,
  styles,
  width,
}: {
  category: HomeCategory;
  height: number;
  label: string;
  onPress: () => void;
  styles: HomeStyles;
  width: number;
}) {
  return (
    <PremiumPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      scaleTo={0.97}
      style={[
        styles.categoryCard,
        { height, width },
      ]}
    >
      {category.icon ? (
        <Image
          accessible={false}
          alt=""
          resizeMode="contain"
          source={category.icon}
          style={styles.categoryIcon}
        />
      ) : (
        <CategoryMark kind={category.kind} styles={styles} />
      )}
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={styles.categoryLabel}
      >
        {label}
      </Text>
    </PremiumPressable>
  );
}

function CategoryMark({
  kind,
  styles,
}: {
  kind: CategoryKind;
  styles: HomeStyles;
}) {
  if (kind === "education") {
    return (
      <View style={styles.bookMark}>
        <View style={[styles.bookPage, styles.bookPageLeft]} />
        <View style={[styles.bookPage, styles.bookPageRight]} />
        <View style={styles.bookSpine} />
      </View>
    );
  }

  if (kind === "car") {
    return (
      <View style={styles.carMark}>
        <View style={styles.carRoof} />
        <View style={styles.carBody}>
          <View style={styles.carLight} />
          <View style={styles.carLight} />
        </View>
        <View style={styles.carWheels}>
          <View style={styles.carWheel} />
          <View style={styles.carWheel} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.moreMark}>
      <View style={styles.moreDot} />
      <View style={styles.moreDot} />
      <View style={styles.moreDot} />
    </View>
  );
}

function SectionHeader({
  action,
  isRtl,
  onPress,
  pagePadding,
  styles,
  title,
}: {
  action: string;
  isRtl: boolean;
  onPress: () => void;
  pagePadding: number;
  styles: HomeStyles;
  title: string;
}) {
  const titleNode = (
    <Text
      adjustsFontSizeToFit
      minimumFontScale={0.85}
      numberOfLines={1}
      style={[
        styles.sectionTitle,
        isRtl ? styles.rtlText : styles.ltrText,
      ]}
    >
      {title}
    </Text>
  );
  const actionNode = (
    <Pressable
      accessibilityLabel={`${title}: ${action}`}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sectionAction,
        isRtl && styles.sectionActionRtl,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.sectionActionText}>{action}</Text>
      <Text style={styles.sectionChevron}>{isRtl ? "‹" : "›"}</Text>
    </Pressable>
  );

  return (
    <View
      style={[
        styles.sectionHeader,
        isRtl && styles.sectionHeaderRtl,
        { paddingHorizontal: pagePadding },
      ]}
    >
      {titleNode}
      {actionNode}
    </View>
  );
}

function MarketplaceSection({
  businessCardWidth,
  businesses,
  copy,
  isRtl,
  isPrimary,
  onOpenBusiness,
  onRetry,
  pagePadding,
  sectionLabel,
  state,
  stateCopy,
  styles,
}: {
  businessCardWidth: number;
  businesses: HomeBusiness[];
  copy: HomeCopy;
  isRtl: boolean;
  isPrimary: boolean;
  onOpenBusiness: (business: HomeBusiness) => void;
  onRetry: () => void;
  pagePadding: number;
  sectionLabel: string;
  state: HomeMarketplaceState;
  stateCopy: (typeof labels)[MobileLocale];
  styles: HomeStyles;
}) {
  if (state.status === "error") {
    if (!isPrimary) {
      return (
        <MarketplaceSectionPlaceholder
          isRtl={isRtl}
          message={stateCopy.marketplaceErrorTitle}
          pagePadding={pagePadding}
          sectionLabel={sectionLabel}
          styles={styles}
        />
      );
    }

    return (
      <MarketplaceFeedback
        action={stateCopy.marketplaceRetry}
        body={state.message}
        isRtl={isRtl}
        onPress={onRetry}
        pagePadding={pagePadding}
        styles={styles}
        title={stateCopy.marketplaceErrorTitle}
      />
    );
  }

  if (state.status === "loaded" && businesses.length === 0) {
    return (
      <MarketplaceSectionPlaceholder
        isRtl={isRtl}
        message={stateCopy.marketplaceEmptyTitle}
        pagePadding={pagePadding}
        sectionLabel={sectionLabel}
        styles={styles}
      />
    );
  }

  const loading = state.status === "idle" || state.status === "loading";

  if (loading) {
    return (
      <MarketplaceSectionSkeleton
        loadingLabel={stateCopy.marketplaceLoading}
        pagePadding={pagePadding}
        sectionLabel={sectionLabel}
        styles={styles}
      />
    );
  }

  return (
    <ScrollView
      accessibilityLabel={sectionLabel}
      contentContainerStyle={[
        styles.businessRailContent,
        { paddingHorizontal: pagePadding },
      ]}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {businesses.map((business) => (
        <BusinessCard
          business={business}
          copy={copy}
          isRtl={isRtl}
          key={business.id}
          onPress={() => onOpenBusiness(business)}
          styles={styles}
          width={businessCardWidth}
        />
      ))}
    </ScrollView>
  );
}

function MarketplaceSectionPlaceholder({
  isRtl,
  message,
  pagePadding,
  sectionLabel,
  styles,
}: {
  isRtl: boolean;
  message: string;
  pagePadding: number;
  sectionLabel: string;
  styles: HomeStyles;
}) {
  return (
    <View
      accessibilityLabel={`${sectionLabel}. ${message}`}
      accessible
      style={[
        styles.marketplacePlaceholderOuter,
        { paddingHorizontal: pagePadding },
      ]}
    >
      <View style={styles.marketplacePlaceholder}>
        <Text
          numberOfLines={2}
          style={[
            styles.marketplacePlaceholderText,
            isRtl ? styles.rtlText : styles.ltrText,
          ]}
        >
          {message}
        </Text>
      </View>
    </View>
  );
}

function MarketplaceFeedback({
  action,
  body,
  isRtl,
  onPress,
  pagePadding,
  styles,
  title,
}: {
  action: string;
  body: string;
  isRtl: boolean;
  onPress: () => void;
  pagePadding: number;
  styles: HomeStyles;
  title: string;
}) {
  return (
    <View style={[styles.feedbackOuter, { paddingHorizontal: pagePadding }]}>
      <View
        style={[styles.feedbackCard, isRtl && styles.feedbackCardRtl]}
      >
        <Text
          style={[
            styles.feedbackTitle,
            isRtl ? styles.rtlText : styles.ltrText,
          ]}
        >
          {title}
        </Text>
        <Text
          numberOfLines={2}
          style={[
            styles.feedbackBody,
            isRtl ? styles.rtlText : styles.ltrText,
          ]}
        >
          {body}
        </Text>
        <Pressable
          accessibilityLabel={action}
          accessibilityRole="button"
          hitSlop={5}
          onPress={onPress}
          style={({ pressed }) => [
            styles.feedbackButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.feedbackButtonText}>{action}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BusinessCard({
  business,
  copy,
  isRtl,
  onPress,
  styles,
  width,
}: {
  business: HomeBusiness;
  copy: HomeCopy;
  isRtl: boolean;
  onPress: () => void;
  styles: HomeStyles;
  width: number;
}) {
  const businessNameIsLtr = /[A-Za-z]/.test(business.name);
  const categoryIsLtr = /[A-Za-z]/.test(business.category);
  const distanceIsLtr = /[A-Za-z]/.test(business.distance);
  const artworkVariant = getStableArtworkVariant(business.id);

  return (
    <PremiumPressable
      accessibilityHint={copy.bookNow}
      accessibilityLabel={`${business.name}, ${business.category}, ${business.status}, ${business.rating}, ${business.price}, ${business.distance}, ${copy.bookNow}`}
      accessibilityRole="button"
      onPress={onPress}
      scaleTo={0.985}
      style={[
        styles.businessCard,
        { width },
      ]}
    >
      <View style={styles.businessArtworkFrame}>
        <BusinessArtwork styles={styles} variant={artworkVariant} />
        <View style={styles.ratingPill}>
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={HOME_ICONS.star}
            style={styles.ratingIcon}
          />
          <Text style={styles.ratingValue}>{business.rating}</Text>
        </View>
        <View accessible={false} style={styles.favoriteButton}>
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={HOME_ICONS.heart}
            style={styles.favoriteIcon}
          />
        </View>
      </View>

      <View style={styles.businessBody}>
        <Text
          numberOfLines={2}
          style={[
            styles.businessName,
            businessNameIsLtr
              ? styles.businessNameLtr
              : isRtl
                ? styles.rtlText
                : styles.ltrText,
          ]}
        >
          {business.name}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.businessCategory,
            categoryIsLtr
              ? styles.ltrText
              : isRtl
                ? styles.rtlText
                : styles.ltrText,
          ]}
        >
          {business.category}
        </Text>
        <View style={styles.businessMetaRow}>
          <View style={styles.distanceGroup}>
            <Image
              accessible={false}
              alt=""
              resizeMode="contain"
              source={HOME_ICONS.location}
              style={styles.distanceIcon}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.distanceText,
                distanceIsLtr
                  ? styles.ltrText
                  : isRtl
                    ? styles.rtlText
                    : styles.ltrText,
              ]}
            >
              {business.distance}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={[
              styles.businessPrice,
              isRtl ? styles.rtlText : styles.ltrText,
            ]}
          >
            {business.price}
          </Text>
        </View>
        <View style={styles.bookingButton}>
          <Text style={[styles.bookingButtonText, isRtl && styles.rtlText]}>
            {copy.bookNow}
          </Text>
        </View>
      </View>
    </PremiumPressable>
  );
}

function BusinessArtwork({
  styles,
  variant,
}: {
  styles: HomeStyles;
  variant: number;
}) {
  return (
    <View
      style={[
        styles.businessArtwork,
        variant === 1 && styles.businessArtworkWarm,
      ]}
    >
      <View style={styles.artworkCeilingGlow} />
      <View style={styles.artworkBackWall} />
      <View style={styles.artworkArches}>
        <View
          style={[styles.artworkArch, variant === 2 && styles.artworkArchWide]}
        />
        <View style={styles.artworkArch} />
        <View
          style={[styles.artworkArch, variant === 0 && styles.artworkArchWide]}
        />
      </View>
      <View style={styles.artworkCounter} />
      <View style={styles.artworkFloorLine} />
    </View>
  );
}

function MarketplaceSectionSkeleton({
  loadingLabel,
  pagePadding,
  sectionLabel,
  styles,
}: {
  loadingLabel: string;
  pagePadding: number;
  sectionLabel: string;
  styles: HomeStyles;
}) {
  return (
    <View
      accessibilityLabel={`${sectionLabel}. ${loadingLabel}`}
      accessible
      style={[
        styles.marketplacePlaceholderOuter,
        { paddingHorizontal: pagePadding },
      ]}
    >
      <View style={styles.marketplacePlaceholder}>
        <View style={[styles.skeletonLine, styles.skeletonLineTitle]} />
        <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
      </View>
    </View>
  );
}

function PromoBanner({
  copy,
  isRtl,
  styles,
}: {
  copy: HomeCopy;
  isRtl: boolean;
  styles: HomeStyles;
}) {
  return (
    <View style={styles.promoBanner}>
      <View accessible={false} style={styles.promoArtwork}>
        <View style={styles.promoArtGlow} />
        <View style={styles.promoSparkOne} />
        <View style={styles.promoSparkTwo} />
        <View style={styles.promoSparkThree} />
        <View style={styles.ticketShape}>
          <View style={styles.ticketInset} />
          <Text style={styles.ticketPercent}>15%</Text>
        </View>
        <View style={styles.giftWrap}>
          <View style={styles.giftBowRow}>
            <View style={[styles.giftBow, styles.giftBowLeft]} />
            <View style={[styles.giftBow, styles.giftBowRight]} />
          </View>
          <View style={styles.giftLid}>
            <View style={styles.giftRibbonVertical} />
          </View>
          <View style={styles.giftBox}>
            <View style={styles.giftRibbonHorizontal} />
            <View style={styles.giftRibbonVertical} />
          </View>
        </View>
      </View>

      <View style={[styles.promoCopy, isRtl && styles.promoCopyRtl]}>
        <Text
          style={[
            styles.promoHeadline,
            isRtl ? styles.rtlText : styles.ltrText,
          ]}
        >
          {copy.promoHeadline}
        </Text>
        <Text
          style={[
            styles.promoBody,
            isRtl ? styles.rtlText : styles.ltrText,
          ]}
        >
          {copy.promoBody}
        </Text>
        <View
          accessibilityLabel={copy.couponAccessibility}
          accessible
          style={[styles.couponPill, isRtl && styles.couponPillRtl]}
        >
          <View style={styles.couponCodeSegment}>
            <Text style={styles.couponCode}>REZNO15</Text>
          </View>
          <View style={styles.couponCopySegment}>
            <View style={styles.copyMark}>
              <View style={styles.copySheetBack} />
              <View style={styles.copySheetFront} />
            </View>
          </View>
        </View>
      </View>

      <View accessible={false} style={styles.promoPagination}>
        <View style={[styles.promoPaginationDot, styles.promoPaginationDotActive]} />
        <View style={styles.promoPaginationDot} />
        <View style={styles.promoPaginationDot} />
      </View>
    </View>
  );
}

function deriveHomeBusinessSections(
  state: HomeMarketplaceState,
  locale: MobileLocale,
  copy: HomeCopy,
): HomeBusinessSections {
  if (state.status !== "loaded" || state.businesses.length === 0) {
    return {
      nearby: [],
      newOnRezno: [],
      recommendations: [],
    };
  }

  const sourceOrder = new Map(
    state.businesses.map((business, index) => [business.id, index]),
  );
  const recommendations = [...state.businesses]
    .sort((left, right) => {
      const ratingDifference =
        (right.averageRating ?? -1) - (left.averageRating ?? -1);

      if (ratingDifference !== 0) return ratingDifference;
      if (right.reviewCount !== left.reviewCount) {
        return right.reviewCount - left.reviewCount;
      }
      if (right.serviceCount !== left.serviceCount) {
        return right.serviceCount - left.serviceCount;
      }

      return compareStableText(left.id, right.id);
    })
    .slice(0, HOME_LAYOUT.businessSectionLimit);
  const nearby = [...state.businesses]
    .sort((left, right) => {
      const leftDistance = getValidDistanceKm(left);
      const rightDistance = getValidDistanceKm(right);

      if (leftDistance === null && rightDistance !== null) return 1;
      if (leftDistance !== null && rightDistance === null) return -1;
      if (
        leftDistance !== null &&
        rightDistance !== null &&
        leftDistance !== rightDistance
      ) {
        return leftDistance - rightDistance;
      }

      return (
        (sourceOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (sourceOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .slice(0, HOME_LAYOUT.businessSectionLimit);
  const stableBusinesses = [...state.businesses].sort((left, right) =>
    compareStableText(left.id, right.id),
  );
  const rotationOffset = stableBusinesses.length > 1 ? 1 : 0;
  const newOnRezno = [
    ...stableBusinesses.slice(rotationOffset),
    ...stableBusinesses.slice(0, rotationOffset),
  ]
    .slice(0, HOME_LAYOUT.businessSectionLimit);
  const mapBusiness = (business: MobileMarketplaceBusiness) =>
    mapMarketplaceBusiness(business, locale, copy);

  return {
    nearby: nearby.map(mapBusiness),
    newOnRezno: newOnRezno.map(mapBusiness),
    recommendations: recommendations.map(mapBusiness),
  };
}

function compareStableText(left: string, right: string) {
  if (left === right) return 0;

  return left < right ? -1 : 1;
}

function getValidDistanceKm(business: MobileMarketplaceBusiness) {
  return business.distanceKm !== null &&
    Number.isFinite(business.distanceKm) &&
    business.distanceKm >= 0
    ? business.distanceKm
    : null;
}

function getStableArtworkVariant(id: string) {
  let hash = 0;

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 3;
  }

  return hash;
}

function mapMarketplaceBusiness(
  business: MobileMarketplaceBusiness,
  locale: MobileLocale,
  copy: HomeCopy,
): HomeBusiness {
  const category =
    business.categoryName ?? localizeVertical(business.vertical, locale);
  const distanceKm = getValidDistanceKm(business);
  const distance =
    distanceKm === null
      ? copy.distanceUnavailable
      : formatDistance(distanceKm, locale);
  const priceValue = business.startingPrice ?? business.matchingServicePrice;
  const price = priceValue
    ? formatPrice(priceValue, locale)
    : copy.priceUnavailable;
  const rating =
    business.averageRating === null
      ? "—"
      : business.averageRating.toFixed(1);
  const status =
    business.serviceCount > 0
      ? `${business.serviceCount} ${labels[locale].marketplaceServices}`
      : category;

  return {
    category,
    distance,
    id: business.id,
    name: business.name,
    price,
    rating,
    reviewCount: String(business.reviewCount),
    status,
    tag: status,
  };
}

function formatDistance(distanceKm: number, locale: MobileLocale) {
  const distance = new Intl.NumberFormat(locale === "en" ? "en" : "ar-IQ", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(distanceKm);

  if (locale === "en") {
    return `${distance} km`;
  }

  return `${distance} كم`;
}

function formatPrice(price: string, locale: MobileLocale) {
  const numericPrice = Number(price);
  const displayPrice = Number.isFinite(numericPrice)
    ? new Intl.NumberFormat(locale === "en" ? "en" : "ar-IQ", {
        maximumFractionDigits: 0,
      }).format(numericPrice)
    : price;

  if (locale === "en") {
    return `From ${displayPrice} IQD`;
  }

  if (locale === "ckb") {
    return `لە ${displayPrice} د.ع`;
  }

  return `يبدأ من ${displayPrice} د.ع`;
}

function localizeVertical(
  vertical: MobileBusinessVertical,
  locale: MobileLocale,
) {
  const categories: Record<
    MobileLocale,
    Partial<Record<MobileBusinessVertical, string>>
  > = {
    ar: {
      BARBER: "حلاقة",
      BEAUTY: "صالون وتجميل",
      CAFE: "مقهى",
      CLINIC: "عيادة",
      CONSULTANT: "استشارات",
      DENTIST: "عيادة أسنان",
      GYM: "رياضة ولياقة",
      OTHER: "خدمات",
      RESTAURANT: "مطاعم ومشويات",
      SPA: "سبا وعناية",
    },
    ckb: {
      BARBER: "سەرتاشخانە",
      BEAUTY: "سالۆن و جوانکاری",
      CAFE: "قاوەخانە",
      CLINIC: "کلینیک",
      CONSULTANT: "ڕاوێژکاری",
      DENTIST: "کلینیکی ددان",
      GYM: "وەرزش و لەشجوانی",
      OTHER: "خزمەتگوزاری",
      RESTAURANT: "چێشتخانە",
      SPA: "سپا و چاودێری",
    },
    en: {
      BARBER: "Barber",
      BEAUTY: "Beauty salon",
      CAFE: "Cafe",
      CLINIC: "Clinic",
      CONSULTANT: "Consulting",
      DENTIST: "Dental clinic",
      GYM: "Fitness",
      OTHER: "Services",
      RESTAURANT: "Restaurant",
      SPA: "Spa and care",
    },
  };

  return categories[locale][vertical] ?? categories[locale].OTHER ?? "Services";
}

const createStyles = (theme: MobileTheme) => {
  const palette = theme.isDark
    ? {
        background: "#060f0e",
        border: "rgba(204, 156, 71, 0.26)",
        card: "#141b18",
        cardDeep: "#0b1918",
        cream: "#e8e0d4",
        emerald: "#0f3b2b",
        emeraldText: "#62caa2",
        gold: "#d6a34b",
        goldBright: "#edb64f",
        muted: "#aaa9a3",
      }
    : {
        background: theme.colors.background,
        border: "rgba(143, 95, 19, 0.25)",
        card: theme.colors.card,
        cardDeep: theme.colors.heroMuted,
        cream: theme.colors.foreground,
        emerald: theme.colors.successSoft,
        emeraldText: theme.colors.success,
        gold: theme.colors.deepGold,
        goldBright: theme.colors.gold,
        muted: theme.colors.mutedForeground,
      };

  return StyleSheet.create({
    artworkArch: {
      borderColor: "rgba(224, 178, 91, 0.3)",
      borderRadius: 28,
      borderWidth: 1,
      height: 62,
      width: 34,
    },
    artworkArches: {
      alignItems: "flex-end",
      bottom: 21,
      flexDirection: "row",
      gap: 7,
      left: 15,
      position: "absolute",
      right: 15,
    },
    artworkArchWide: {
      height: 70,
      width: 42,
    },
    artworkBackWall: {
      backgroundColor: "rgba(5, 9, 8, 0.48)",
      bottom: 19,
      height: 52,
      left: 0,
      position: "absolute",
      right: 0,
    },
    artworkCeilingGlow: {
      backgroundColor: "rgba(198, 139, 55, 0.18)",
      borderRadius: 80,
      height: 76,
      left: "24%",
      position: "absolute",
      top: -43,
      width: 88,
    },
    artworkCounter: {
      backgroundColor: "rgba(49, 55, 44, 0.88)",
      borderColor: "rgba(221, 174, 89, 0.22)",
      borderRadius: 4,
      borderWidth: 1,
      bottom: 13,
      height: 19,
      left: "19%",
      position: "absolute",
      width: "62%",
    },
    artworkFloorLine: {
      backgroundColor: "rgba(215, 171, 83, 0.18)",
      bottom: 8,
      height: 1,
      left: 10,
      position: "absolute",
      right: 10,
    },
    bookingButton: {
      alignItems: "center",
      borderColor: palette.gold,
      borderRadius: 10,
      borderWidth: 1,
      height: 34,
      justifyContent: "center",
      marginTop: 6,
      width: "100%",
    },
    bookingButtonText: {
      color: palette.goldBright,
      fontFamily: HOME_FONT.uiSemiBold,
      fontSize: 12,
      lineHeight: 17,
      textAlign: "center",
    },
    bookMark: {
      height: 27,
      position: "relative",
      width: 36,
    },
    bookPage: {
      borderColor: palette.goldBright,
      borderTopLeftRadius: 7,
      borderTopRightRadius: 7,
      borderWidth: 1.8,
      bottom: 1,
      position: "absolute",
      top: 1,
      width: 17,
    },
    bookPageLeft: {
      left: 1,
      transform: [{ skewY: "5deg" }],
    },
    bookPageRight: {
      right: 1,
      transform: [{ skewY: "-5deg" }],
    },
    bookSpine: {
      backgroundColor: palette.goldBright,
      bottom: 0,
      left: 17.5,
      position: "absolute",
      top: 2,
      width: 1,
    },
    businessArtwork: {
      aspectRatio: 1.5,
      backgroundColor: "#101613",
      borderBottomColor: "rgba(204, 156, 71, 0.15)",
      borderBottomWidth: 1,
      overflow: "hidden",
      position: "relative",
      width: "100%",
    },
    businessArtworkWarm: {
      backgroundColor: "#1a1510",
    },
    businessArtworkFrame: {
      position: "relative",
      width: "100%",
    },
    businessBody: {
      paddingBottom: 9,
      paddingHorizontal: 9,
      paddingTop: 8,
    },
    businessCard: {
      backgroundColor: palette.cardDeep,
      borderColor: palette.border,
      borderRadius: 17,
      borderWidth: 1,
      flexShrink: 0,
      minHeight: 240,
      overflow: "hidden",
      shadowColor: "#000000",
      shadowOffset: { height: 7, width: 0 },
      shadowOpacity: theme.isDark ? 0.28 : 0.08,
      shadowRadius: 12,
    },
    businessCardPressed: {
      opacity: 0.9,
      transform: [{ translateY: 1 }],
    },
    businessCategory: {
      color: palette.muted,
      fontFamily: HOME_FONT.uiRegular,
      fontSize: 10.5,
      lineHeight: 15,
      marginTop: 2,
    },
    businessMetaRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      justifyContent: "space-between",
      marginTop: 5,
      minHeight: 16,
    },
    businessName: {
      color: palette.cream,
      flex: 1,
      flexShrink: 1,
      fontFamily: HOME_FONT.uiSemiBold,
      fontSize: 14,
      lineHeight: 18,
      minHeight: 36,
      minWidth: 0,
    },
    businessNameLtr: {
      textAlign: "left",
      writingDirection: "ltr",
    },
    businessPrice: {
      color: palette.muted,
      flex: 1,
      flexShrink: 1,
      fontFamily: HOME_FONT.uiRegular,
      fontSize: 9,
      lineHeight: 13,
      minWidth: 0,
    },
    businessRailContent: {
      direction: "ltr",
      flexDirection: "row",
      gap: 8,
      paddingBottom: 3,
    },
    carBody: {
      alignItems: "center",
      borderColor: palette.goldBright,
      borderRadius: 5,
      borderWidth: 1.8,
      bottom: 4,
      flexDirection: "row",
      height: 18,
      justifyContent: "space-between",
      left: 1,
      paddingHorizontal: 5,
      position: "absolute",
      right: 1,
    },
    carLight: {
      backgroundColor: palette.goldBright,
      borderRadius: 2,
      height: 3,
      width: 4,
    },
    carMark: {
      height: 28,
      position: "relative",
      width: 36,
    },
    carRoof: {
      borderColor: palette.goldBright,
      borderRadius: 9,
      borderWidth: 1.8,
      height: 17,
      left: 6,
      position: "absolute",
      right: 6,
      top: 1,
    },
    carWheel: {
      backgroundColor: palette.card,
      borderColor: palette.goldBright,
      borderRadius: 4,
      borderWidth: 1.5,
      height: 7,
      width: 7,
    },
    carWheels: {
      bottom: 0,
      flexDirection: "row",
      justifyContent: "space-between",
      left: 6,
      position: "absolute",
      right: 6,
    },
    categoryCard: {
      alignItems: "center",
      backgroundColor: palette.card,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexShrink: 0,
      justifyContent: "center",
      paddingHorizontal: 5,
      paddingVertical: 6,
      shadowColor: "#000000",
      shadowOffset: { height: 5, width: 0 },
      shadowOpacity: theme.isDark ? 0.18 : 0.05,
      shadowRadius: 8,
    },
    categoryCardPressed: {
      backgroundColor: palette.cardDeep,
      opacity: 0.9,
      transform: [{ translateY: 1 }],
    },
    categoryGrid: {
      direction: "ltr",
      flexDirection: "row",
      flexWrap: "wrap",
    },
    categoryIcon: {
      height: 29,
      marginBottom: 4,
      tintColor: palette.goldBright,
      width: 29,
    },
    categoryLabel: {
      color: palette.cream,
      fontFamily: HOME_FONT.uiMedium,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      width: "100%",
    },
    copyMark: {
      height: 16,
      position: "relative",
      width: 16,
    },
    copySheetBack: {
      borderColor: palette.goldBright,
      borderRadius: 2,
      borderWidth: 1,
      height: 9,
      left: 1,
      position: "absolute",
      top: 1,
      width: 9,
    },
    copySheetFront: {
      backgroundColor: "rgba(255, 255, 255, 0.16)",
      borderColor: palette.goldBright,
      borderRadius: 2,
      borderWidth: 1,
      bottom: 1,
      height: 10,
      position: "absolute",
      right: 1,
      width: 10,
    },
    couponCode: {
      color: "#2a1d08",
      fontFamily: HOME_FONT.uiBold,
      fontSize: 11.5,
      lineHeight: 16,
      textAlign: "center",
      writingDirection: "ltr",
    },
    couponCodeSegment: {
      alignItems: "center",
      backgroundColor: "#e6bb6c",
      height: 28,
      justifyContent: "center",
      paddingHorizontal: 11,
    },
    couponCopySegment: {
      alignItems: "center",
      backgroundColor: "rgba(4, 12, 9, 0.82)",
      height: 28,
      justifyContent: "center",
      width: 34,
    },
    couponPill: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: "rgba(4, 12, 9, 0.82)",
      borderColor: "rgba(230, 187, 108, 0.36)",
      borderRadius: 9,
      borderWidth: 1,
      flexDirection: "row",
      marginTop: 9,
      minHeight: 28,
      overflow: "hidden",
    },
    couponPillRtl: {
      alignSelf: "flex-end",
    },
    distanceGroup: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 0,
      gap: 3,
      maxWidth: "46%",
    },
    distanceIcon: {
      height: 12,
      tintColor: palette.gold,
      width: 12,
    },
    distanceText: {
      color: palette.muted,
      flexShrink: 1,
      fontFamily: HOME_FONT.uiRegular,
      fontSize: 9.5,
      lineHeight: 14,
    },
    favoriteButton: {
      alignItems: "center",
      backgroundColor: "rgba(4, 9, 8, 0.82)",
      borderColor: "rgba(232, 224, 212, 0.34)",
      borderRadius: 15,
      borderWidth: 1,
      height: 30,
      justifyContent: "center",
      position: "absolute",
      right: 8,
      top: 8,
      width: 30,
    },
    favoriteIcon: {
      height: 16,
      tintColor: palette.cream,
      width: 16,
    },
    feedbackBody: {
      color: palette.muted,
      flex: 1,
      fontFamily: HOME_FONT.uiRegular,
      fontSize: 11.5,
      lineHeight: 17,
    },
    feedbackButton: {
      alignItems: "center",
      borderColor: palette.gold,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 35,
      minWidth: 90,
      paddingHorizontal: 10,
    },
    feedbackButtonText: {
      color: palette.goldBright,
      fontFamily: HOME_FONT.uiSemiBold,
      fontSize: 12,
      lineHeight: 18,
    },
    feedbackCard: {
      alignItems: "center",
      backgroundColor: palette.cardDeep,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: 72,
      padding: 9,
    },
    feedbackCardRtl: {
      flexDirection: "row-reverse",
    },
    feedbackOuter: {
      width: "100%",
    },
    feedbackTitle: {
      color: palette.cream,
      fontFamily: HOME_FONT.uiSemiBold,
      fontSize: 14,
      lineHeight: 20,
      maxWidth: 82,
    },
    giftBow: {
      borderColor: palette.goldBright,
      borderRadius: 9,
      borderWidth: 2,
      height: 17,
      width: 22,
    },
    giftBowLeft: {
      marginRight: -3,
      transform: [{ rotate: "25deg" }],
    },
    giftBowRight: {
      marginLeft: -3,
      transform: [{ rotate: "-25deg" }],
    },
    giftBowRow: {
      flexDirection: "row",
      left: 8,
      position: "absolute",
      top: 0,
      zIndex: 3,
    },
    giftBox: {
      backgroundColor: "#0b0d0a",
      borderColor: "rgba(237, 182, 79, 0.48)",
      borderRadius: 3,
      borderWidth: 1,
      bottom: 0,
      height: 38,
      left: 5,
      overflow: "hidden",
      position: "absolute",
      width: 50,
    },
    giftLid: {
      backgroundColor: "#16150f",
      borderColor: "rgba(237, 182, 79, 0.58)",
      borderRadius: 3,
      borderWidth: 1,
      height: 10,
      left: 2,
      overflow: "hidden",
      position: "absolute",
      top: 19,
      width: 56,
      zIndex: 2,
    },
    giftRibbonHorizontal: {
      backgroundColor: palette.gold,
      height: 7,
      left: 0,
      position: "absolute",
      right: 0,
      top: 13,
    },
    giftRibbonVertical: {
      backgroundColor: palette.goldBright,
      bottom: 0,
      left: 22,
      position: "absolute",
      top: 0,
      width: 8,
    },
    giftWrap: {
      bottom: 5,
      height: 66,
      position: "absolute",
      right: 0,
      width: 60,
      zIndex: 4,
    },
    filterButton: {
      alignItems: "center",
      backgroundColor: palette.goldBright,
      borderColor: "rgba(255, 237, 194, 0.58)",
      borderRadius: 23,
      borderWidth: 1,
      height: 46,
      justifyContent: "center",
      shadowColor: palette.gold,
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: 0.28,
      shadowRadius: 7,
      width: 46,
    },
    filterIcon: {
      height: 21,
      tintColor: "#1a1c16",
      width: 21,
    },
    heroActionButton: {
      alignItems: "center",
      backgroundColor: "rgba(10, 16, 14, 0.72)",
      borderColor: palette.border,
      borderRadius: 15,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      position: "relative",
      width: 44,
    },
    heroActionDot: {
      backgroundColor: palette.goldBright,
      borderColor: palette.background,
      borderRadius: 4,
      borderWidth: 1,
      height: 8,
      position: "absolute",
      right: -2,
      top: -2,
      width: 8,
    },
    heroActionGroup: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 11,
    },
    heroActionIcon: {
      height: 22,
      tintColor: palette.cream,
      width: 22,
    },
    heroActionItem: {
      alignItems: "center",
      justifyContent: "flex-start",
      minWidth: 48,
      width: 52,
    },
    heroActionLabel: {
      color: palette.cream,
      fontFamily: HOME_FONT.uiRegular,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 4,
      textAlign: "center",
      width: 60,
    },
    heroGreeting: {
      color: palette.cream,
      fontFamily: HOME_FONT.kufiBold,
      fontSize: 20,
      lineHeight: 28,
    },
    heroIdentity: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 1,
      gap: 10,
      marginTop: 3,
    },
    heroLowerRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    heroSection: {
      gap: 16,
      width: "100%",
    },
    heroTitle: {
      color: theme.isDark ? "#efd2a5" : palette.cream,
      fontFamily: HOME_FONT.uiMedium,
      width: "100%",
    },
    heroTitleWrap: {
      flex: 1,
      minWidth: 0,
      position: "relative",
    },
    heroTopRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
      width: "100%",
    },
    locationCard: {
      alignItems: "center",
      backgroundColor: "rgba(9, 15, 13, 0.72)",
      borderColor: palette.border,
      borderRadius: 13,
      borderWidth: 1,
      flexDirection: "row",
      flexShrink: 0,
      gap: 5,
      height: 46,
      maxWidth: 98,
      minWidth: 88,
      paddingHorizontal: 7,
      width: "25%",
    },
    locationCardLtr: {
      maxWidth: 118,
      minWidth: 112,
      width: "31%",
    },
    locationCardChevron: {
      color: palette.goldBright,
      fontFamily: HOME_FONT.uiMedium,
      fontSize: 15,
      lineHeight: 16,
      marginTop: -3,
    },
    locationCardIcon: {
      height: 18,
      tintColor: palette.goldBright,
      width: 18,
    },
    locationCardText: {
      color: palette.cream,
      flex: 1,
      fontFamily: HOME_FONT.uiMedium,
      fontSize: 13.5,
      lineHeight: 19,
      minWidth: 0,
    },
    ltrText: {
      textAlign: "left",
      writingDirection: "ltr",
    },
    marketplaceSectionBlock: {
      gap: 7,
      width: "100%",
    },
    marketplacePlaceholder: {
      backgroundColor: palette.cardDeep,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: 13,
      paddingVertical: 9,
    },
    marketplacePlaceholderOuter: {
      width: "100%",
    },
    marketplacePlaceholderText: {
      color: palette.muted,
      fontFamily: HOME_FONT.uiMedium,
      fontSize: 12,
      lineHeight: 18,
    },
    moreDot: {
      backgroundColor: palette.goldBright,
      borderRadius: 3,
      height: 5,
      width: 5,
    },
    moreMark: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      height: 27,
      justifyContent: "center",
      width: 36,
    },
    pageSection: {
      width: "100%",
    },
    pressed: {
      opacity: 0.76,
    },
    profileButton: {
      alignItems: "center",
      backgroundColor: "rgba(10, 16, 14, 0.8)",
      borderColor: palette.goldBright,
      borderRadius: 27,
      borderWidth: 1.5,
      height: 54,
      justifyContent: "center",
      width: 54,
    },
    profileIcon: {
      height: 38,
      tintColor: palette.goldBright,
      width: 38,
    },
    promoArtwork: {
      alignItems: "center",
      flexBasis: "44%",
      height: 115,
      justifyContent: "center",
      maxWidth: 150,
      minWidth: 112,
      position: "relative",
    },
    promoArtGlow: {
      backgroundColor: "rgba(214, 163, 75, 0.1)",
      borderRadius: 60,
      height: 112,
      position: "absolute",
      right: -8,
      top: 3,
      width: 112,
    },
    promoBanner: {
      alignItems: "center",
      backgroundColor: theme.isDark ? "#0b241b" : theme.colors.card,
      borderColor: palette.border,
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 145,
      overflow: "hidden",
      paddingBottom: 18,
      paddingHorizontal: 14,
      paddingTop: 12,
      shadowColor: "#000000",
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.22 : 0.07,
      shadowRadius: 14,
    },
    promoBody: {
      color: palette.cream,
      fontFamily: HOME_FONT.uiRegular,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 1,
      width: "100%",
    },
    promoCopy: {
      flex: 1,
      minWidth: 0,
    },
    promoCopyRtl: {
      alignItems: "flex-end",
    },
    promoHeadline: {
      color: palette.goldBright,
      fontFamily: HOME_FONT.kufiBold,
      fontSize: 24,
      lineHeight: 33,
      width: "100%",
    },
    promoPagination: {
      alignItems: "center",
      bottom: 5,
      flexDirection: "row",
      gap: 6,
      left: "50%",
      justifyContent: "center",
      marginLeft: -20,
      position: "absolute",
      width: 40,
    },
    promoPaginationDot: {
      backgroundColor: "rgba(170, 169, 163, 0.48)",
      borderRadius: 4,
      height: 7,
      width: 7,
    },
    promoPaginationDotActive: {
      backgroundColor: palette.goldBright,
    },
    promoSparkOne: {
      backgroundColor: palette.goldBright,
      borderRadius: 3,
      height: 5,
      position: "absolute",
      right: 13,
      top: 13,
      width: 5,
    },
    promoSparkThree: {
      backgroundColor: "rgba(237, 182, 79, 0.66)",
      borderRadius: 2,
      bottom: 25,
      height: 4,
      left: 8,
      position: "absolute",
      width: 4,
    },
    promoSparkTwo: {
      backgroundColor: palette.goldBright,
      borderRadius: 2,
      height: 4,
      left: 16,
      position: "absolute",
      top: 10,
      transform: [{ rotate: "45deg" }],
      width: 4,
    },
    ratingIcon: {
      height: 10,
      tintColor: palette.goldBright,
      width: 10,
    },
    ratingPill: {
      alignItems: "center",
      backgroundColor: "rgba(5, 11, 9, 0.72)",
      borderColor: "rgba(204, 156, 71, 0.24)",
      borderRadius: 6,
      borderWidth: 1,
      flexDirection: "row",
      bottom: 8,
      gap: 2,
      height: 22,
      left: 8,
      paddingHorizontal: 5,
      position: "absolute",
    },
    ratingValue: {
      color: palette.cream,
      fontFamily: HOME_FONT.uiMedium,
      fontSize: 10,
      lineHeight: 13,
      writingDirection: "ltr",
    },
    rtlText: {
      textAlign: "right",
      writingDirection: "rtl",
    },
    screen: {
      backgroundColor: palette.background,
      direction: "ltr",
      gap: 13,
      paddingBottom: 10,
      paddingTop: 4,
      width: "100%",
    },
    searchControl: {
      alignItems: "center",
      backgroundColor: palette.cardDeep,
      borderColor: palette.border,
      borderRadius: 31,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      height: 62,
      paddingLeft: 16,
      paddingRight: 6,
      shadowColor: "#000000",
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: theme.isDark ? 0.18 : 0.06,
      shadowRadius: 10,
    },
    searchIcon: {
      height: 22,
      tintColor: palette.goldBright,
      width: 22,
    },
    searchPlaceholder: {
      color: palette.muted,
      flex: 1,
      fontFamily: HOME_FONT.uiRegular,
      fontSize: 14,
      lineHeight: 21,
      minWidth: 0,
    },
    sectionAction: {
      alignItems: "center",
      flexDirection: "row",
      flexShrink: 0,
      gap: 4,
      minHeight: 28,
    },
    sectionActionRtl: {
      flexDirection: "row-reverse",
    },
    sectionActionText: {
      color: palette.goldBright,
      fontFamily: HOME_FONT.uiMedium,
      fontSize: 11,
      lineHeight: 16,
    },
    sectionChevron: {
      color: palette.goldBright,
      fontFamily: HOME_FONT.uiRegular,
      fontSize: 18,
      lineHeight: 19,
    },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      marginTop: 2,
      width: "100%",
    },
    sectionHeaderRtl: {
      flexDirection: "row-reverse",
    },
    sectionTitle: {
      color: palette.cream,
      flexShrink: 1,
      fontFamily: HOME_FONT.kufiBold,
      fontSize: 17,
      lineHeight: 23,
      minWidth: 0,
    },
    skeletonButton: {
      backgroundColor: "rgba(150, 151, 143, 0.08)",
      borderColor: "rgba(204, 156, 71, 0.12)",
    },
    skeletonLine: {
      backgroundColor: "rgba(150, 151, 143, 0.11)",
      borderRadius: 4,
      height: 10,
    },
    skeletonLineMeta: {
      marginTop: 13,
      width: "72%",
    },
    skeletonLineShort: {
      marginTop: 9,
      width: "48%",
    },
    skeletonLineTitle: {
      height: 14,
      width: "76%",
    },
    skeletonSurface: {
      backgroundColor: "rgba(150, 151, 143, 0.08)",
    },
    ticketPercent: {
      color: "#261a07",
      fontFamily: HOME_FONT.uiBold,
      fontSize: 23,
      lineHeight: 29,
      textAlign: "center",
    },
    ticketShape: {
      alignItems: "center",
      backgroundColor: palette.goldBright,
      borderRadius: 7,
      height: 56,
      justifyContent: "center",
      left: 2,
      position: "absolute",
      top: 27,
      transform: [{ rotate: "-10deg" }],
      width: 82,
      zIndex: 2,
    },
    ticketInset: {
      borderColor: "rgba(79, 51, 7, 0.56)",
      borderRadius: 5,
      borderWidth: 1,
      bottom: 5,
      left: 5,
      position: "absolute",
      right: 5,
      top: 5,
    },
  });
};

type HomeStyles = ReturnType<typeof createStyles>;
