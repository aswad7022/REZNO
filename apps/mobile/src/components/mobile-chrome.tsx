import {
  Image,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import {
  labels,
  type MobileLocale,
} from "../i18n/labels";
import type { MobileTabId } from "../navigation/tabs";
import {
  DISPLAY_MAX_FONT_SIZE_MULTIPLIER,
  LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER,
} from "../layout/responsive-metrics";
import { SHARED_TOP_HEADER_LAYOUT } from "../layout/screen-contracts";
import { LayoutText as Text } from "./layout-text";
import {
  PremiumEntrance,
  PremiumPressable,
} from "./premium-motion";

export const TOUCH_HIT_SLOP = { bottom: 8, left: 8, right: 8, top: 8 };

export type MobileAppTabId =
  | MobileTabId
  | "activity"
  | "favorites"
  | "orders"
  | "quickBooking"
  | "reznoAi"
  | "serviceDiscovery";

type BottomNavTabId =
  | "customerHome"
  | "marketplace"
  | "reznoAi"
  | "activity"
  | "account";

type BottomNavTab = {
  id: BottomNavTabId;
  icon: ImageSourcePropType;
  label: Record<MobileLocale, string>;
};

/* eslint-disable @typescript-eslint/no-require-imports -- React Native bundles static image assets through require(). */
const BOTTOM_NAV_TABS: BottomNavTab[] = [
  {
    id: "customerHome",
    icon: require("../../assets/icons/nav/home.png"),
    label: { ar: "الرئيسية", ckb: "سەرەکی", en: "Home" },
  },
  {
    id: "marketplace",
    icon: require("../../assets/icons/categories/services.png"),
    label: { ar: "السوق", ckb: "بازاڕ", en: "Market" },
  },
  {
    id: "reznoAi",
    icon: require("../../assets/icons/common/star-rating.png"),
    label: { ar: "REZNO AI", ckb: "REZNO AI", en: "REZNO AI" },
  },
  {
    id: "activity",
    icon: require("../../assets/icons/common/calendar.png"),
    label: { ar: "نشاطي", ckb: "چالاکی", en: "Activity" },
  },
  {
    id: "account",
    icon: require("../../assets/icons/nav/account.png"),
    label: { ar: "الحساب", ckb: "هەژمار", en: "Account" },
  },
];

const HEADER_BACK_ICONS = {
  ltr: require("../../assets/icons/common/back-arrow-ltr.png") as ImageSourcePropType,
  rtl: require("../../assets/icons/common/back-arrow-rtl.png") as ImageSourcePropType,
};
/* eslint-enable @typescript-eslint/no-require-imports */

const BOTTOM_NAV_A11Y: Record<
  MobileLocale,
  {
    activeHint: string;
    activityHint: string;
    aiLabel: string;
    openHint: (label: string) => string;
    tabLabel: (label: string) => string;
  }
> = {
  ar: {
    activeHint: "هذا هو التبويب المفتوح حالياً.",
    activityHint: "يفتح قائمة نشاطي.",
    aiLabel: "REZNO AI، ميزة ذكاء اصطناعي قريباً",
    openHint: (label) => `يفتح تبويب ${label}.`,
    tabLabel: (label) => `تبويب ${label}`,
  },
  ckb: {
    activeHint: "ئەم تابە ئێستا کراوەتەوە.",
    activityHint: "لیستی چالاکییەکانم دەکاتەوە.",
    aiLabel: "REZNO AI، تایبەتمەندی زیرەکی دەستکرد بەم زووانە",
    openHint: (label) => `تابی ${label} دەکاتەوە.`,
    tabLabel: (label) => `تابی ${label}`,
  },
  en: {
    activeHint: "This tab is currently open.",
    activityHint: "Opens the My activity menu.",
    aiLabel: "REZNO AI, artificial intelligence feature coming soon",
    openHint: (label) => `Opens the ${label} tab.`,
    tabLabel: (label) => `${label} tab`,
  },
};

type MobileChromeStyles = {
  brandCopy: StyleProp<ViewStyle>;
  brandName: StyleProp<TextStyle>;
  brandRow: StyleProp<ViewStyle>;
  brandTagline: StyleProp<TextStyle>;
  centerTabActiveIndicator: StyleProp<ViewStyle>;
  centerTabButton: StyleProp<ViewStyle>;
  centerTabButtonActive: StyleProp<ViewStyle>;
  centerTabHalo: StyleProp<ViewStyle>;
  centerTabIconImage: StyleProp<ImageStyle>;
  centerTabInner: StyleProp<ViewStyle>;
  centerTabLabel: StyleProp<TextStyle>;
  disabledButton: StyleProp<ViewStyle>;
  disabledButtonText: StyleProp<TextStyle>;
  exploreCompassIcon: StyleProp<ViewStyle>;
  exploreCompassIconActive: StyleProp<ViewStyle>;
  exploreCompassNeedle: StyleProp<ViewStyle>;
  exploreCompassNeedleActive: StyleProp<ViewStyle>;
  header: StyleProp<ViewStyle>;
  headerBackButton: StyleProp<ViewStyle>;
  headerBackIcon: StyleProp<ImageStyle>;
  headerPageCopy: StyleProp<ViewStyle>;
  headerPageSubtitle: StyleProp<TextStyle>;
  headerPageTitle: StyleProp<TextStyle>;
  headerSpacer: StyleProp<ViewStyle>;
  localeButton: StyleProp<ViewStyle>;
  localeButtonActive: StyleProp<ViewStyle>;
  localeButtonPressed: StyleProp<ViewStyle>;
  localeButtonText: StyleProp<TextStyle>;
  localeButtonTextActive: StyleProp<TextStyle>;
  localeRow: StyleProp<ViewStyle>;
  logoMark: StyleProp<ViewStyle>;
  logoText: StyleProp<TextStyle>;
  primaryButton: StyleProp<ViewStyle>;
  primaryButtonPressed: StyleProp<ViewStyle>;
  primaryButtonText: StyleProp<TextStyle>;
  rtlText: StyleProp<TextStyle>;
  tabActiveIndicator: StyleProp<ViewStyle>;
  tabActiveIndicatorVisible: StyleProp<ViewStyle>;
  tabBar: StyleProp<ViewStyle>;
  tabButton: StyleProp<ViewStyle>;
  tabButtonActive: StyleProp<ViewStyle>;
  tabButtonPressed: StyleProp<ViewStyle>;
  tabIcon: StyleProp<TextStyle>;
  tabIconActive: StyleProp<TextStyle>;
  tabIconImage: StyleProp<ImageStyle>;
  tabIconImageActive: StyleProp<ImageStyle>;
  tabLabel: StyleProp<TextStyle>;
  tabLabelActive: StyleProp<TextStyle>;
  visualOnlyButton: StyleProp<ViewStyle>;
};

type MobileText = (typeof labels)[MobileLocale];

export function ScreenHeader({
  backLabel = "Back",
  isRtl,
  onBack,
  pageSubtitle,
  pageTitle,
  styles,
  text,
}: {
  backLabel?: string;
  isRtl: boolean;
  locale?: MobileLocale;
  onLocaleChange?: (locale: MobileLocale) => void;
  onBack?: () => void;
  pageSubtitle?: string;
  pageTitle?: string;
  styles: MobileChromeStyles;
  text: MobileText;
}) {
  if (pageTitle) {
    return (
      <View style={styles.header}>
        {onBack ? (
          <PremiumPressable
            accessibilityLabel={backLabel}
            accessibilityRole="button"
            hitSlop={TOUCH_HIT_SLOP}
            onPress={onBack}
            style={styles.headerBackButton}
          >
            <Image
              accessible={false}
              alt=""
              resizeMode="contain"
              source={isRtl ? HEADER_BACK_ICONS.rtl : HEADER_BACK_ICONS.ltr}
              style={styles.headerBackIcon}
            />
          </PremiumPressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <View style={styles.headerPageCopy}>
          <Text
            maxFontSizeMultiplier={LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER}
            numberOfLines={SHARED_TOP_HEADER_LAYOUT.titleMaxLines}
            style={[styles.headerPageTitle, isRtl && styles.rtlText]}
          >
            {pageTitle}
          </Text>
          {pageSubtitle ? (
            <Text
              maxFontSizeMultiplier={LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER}
              numberOfLines={2}
              style={[styles.headerPageSubtitle, isRtl && styles.rtlText]}
            >
              {pageSubtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerSpacer} />
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>⌾</Text>
        </View>
        <View style={styles.brandCopy}>
          <Text
            maxFontSizeMultiplier={DISPLAY_MAX_FONT_SIZE_MULTIPLIER}
            numberOfLines={1}
            style={[styles.brandName, isRtl && styles.rtlText]}
          >
            بغداد
          </Text>
          <Text
            maxFontSizeMultiplier={LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER}
            numberOfLines={2}
            style={[styles.brandTagline, isRtl && styles.rtlText]}
          >
            {text.appTagline}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function PrimaryButton({
  disabled,
  label,
  onPress,
  styles,
}: {
  disabled?: boolean;
  label: string;
  onPress?: () => void;
  styles: MobileChromeStyles;
}) {
  const isVisualOnly = !onPress;
  const accessibilityDisabled = Boolean(disabled || isVisualOnly);

  return (
    <PremiumPressable
      accessibilityHint={
        isVisualOnly
          ? "زر بصري فقط في هذه المعاينة ولا ينفذ إجراء حقيقياً."
          : "ينفذ الإجراء المعروض."
      }
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: accessibilityDisabled }}
      disabled={accessibilityDisabled}
      hitSlop={TOUCH_HIT_SLOP}
      onPress={onPress}
      scaleTo={0.975}
      style={[
        styles.primaryButton,
        isVisualOnly && styles.visualOnlyButton,
        disabled && styles.disabledButton,
      ]}
    >
      <Text
        maxFontSizeMultiplier={LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER}
        style={[
          styles.primaryButtonText,
          disabled && styles.disabledButtonText,
        ]}
      >
        {label}
      </Text>
    </PremiumPressable>
  );
}

export function BottomTabBar({
  activeTab,
  activityMenuOpen,
  locale,
  onTabPress,
  styles,
}: {
  activeTab: MobileAppTabId;
  activityMenuOpen: boolean;
  locale: MobileLocale;
  onTabPress: (tabId: MobileAppTabId) => void;
  styles: MobileChromeStyles;
}) {
  const visibleTabs =
    locale === "en" ? BOTTOM_NAV_TABS : [...BOTTOM_NAV_TABS].reverse();

  return (
    <View style={styles.tabBar}>
      {visibleTabs.map((tab) => {
        const activityDestinationActive =
          activeTab === "bookings" ||
          activeTab === "favorites" ||
          activeTab === "orders";
        const active =
          tab.id === "activity"
            ? activityMenuOpen || activityDestinationActive
            : tab.id === activeTab;
        const isCenterAction = tab.id === "reznoAi";
        const label = tab.label[locale];
        const accessibilityCopy = BOTTOM_NAV_A11Y[locale];

        return (
          <PremiumPressable
            accessibilityHint={
              active
                ? accessibilityCopy.activeHint
                : tab.id === "activity"
                  ? accessibilityCopy.activityHint
                : accessibilityCopy.openHint(label)
            }
            accessibilityLabel={
              isCenterAction
                ? accessibilityCopy.aiLabel
                : accessibilityCopy.tabLabel(label)
            }
            accessibilityRole={tab.id === "activity" ? "button" : "tab"}
            accessibilityState={{ selected: active }}
            hitSlop={TOUCH_HIT_SLOP}
            key={tab.id}
            onPress={() => onTabPress(tab.id)}
            scaleTo={isCenterAction ? 0.94 : 0.97}
            style={[
              styles.tabButton,
              active && styles.tabButtonActive,
              isCenterAction && styles.centerTabButton,
              isCenterAction && active && styles.centerTabButtonActive,
            ]}
          >
            <PremiumEntrance
              distance={active ? 2 : 0}
              key={`${tab.id}-${active ? "active" : "idle"}`}
              style={{ alignItems: "center" }}
            >
              {isCenterAction ? (
                <>
                  <View style={styles.centerTabHalo}>
                    <View style={styles.centerTabInner}>
                      <Image
                        accessible={false}
                        alt=""
                        resizeMode="contain"
                        source={tab.icon}
                        style={styles.centerTabIconImage}
                      />
                    </View>
                  </View>
                  <Text
                    maxFontSizeMultiplier={LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER}
                    numberOfLines={1}
                    style={styles.centerTabLabel}
                  >
                    {label}
                  </Text>
                </>
              ) : (
                <Image
                  accessible={false}
                  alt=""
                  resizeMode="contain"
                  source={tab.icon}
                  style={[
                    styles.tabIconImage,
                    active && styles.tabIconImageActive,
                  ]}
                />
              )}
              {!isCenterAction ? (
                <Text
                  maxFontSizeMultiplier={LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER}
                  numberOfLines={1}
                  style={[styles.tabLabel, active && styles.tabLabelActive]}
                >
                  {label}
                </Text>
              ) : null}
            </PremiumEntrance>
            <View
              style={[
                styles.tabActiveIndicator,
                active && styles.tabActiveIndicatorVisible,
                isCenterAction && styles.centerTabActiveIndicator,
              ]}
            />
          </PremiumPressable>
        );
      })}
    </View>
  );
}
