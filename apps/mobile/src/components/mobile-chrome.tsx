import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import {
  SUPPORTED_LOCALES,
  labels,
  type MobileLocale,
} from "../i18n/labels";
import type { MobileTabId } from "../navigation/tabs";

export const TOUCH_HIT_SLOP = { bottom: 8, left: 8, right: 8, top: 8 };

export type MobileAppTabId = MobileTabId | "favorites" | "quickBooking";

type BottomNavTabId =
  | "customerHome"
  | "favorites"
  | "quickBooking"
  | "bookings"
  | "account";

type BottomNavTab = {
  id: BottomNavTabId;
  icon: string;
  label: Record<MobileLocale, string>;
};

const BOTTOM_NAV_TABS: BottomNavTab[] = [
  {
    id: "customerHome",
    icon: "⌂",
    label: { ar: "الرئيسية", ckb: "سەرەکی", en: "Home" },
  },
  {
    id: "favorites",
    icon: "♡",
    label: { ar: "المفضلة", ckb: "دڵخوازەکان", en: "Favorites" },
  },
  {
    id: "quickBooking",
    icon: "+",
    label: { ar: "إضافة حجز", ckb: "حجز زیاد بکە", en: "Quick book" },
  },
  {
    id: "bookings",
    icon: "◷",
    label: { ar: "حجوزاتي", ckb: "حجزەکانم", en: "My bookings" },
  },
  {
    id: "account",
    icon: "◉",
    label: { ar: "الحساب", ckb: "هەژمار", en: "Account" },
  },
];

type MobileChromeStyles = {
  brandCopy: StyleProp<ViewStyle>;
  brandName: StyleProp<TextStyle>;
  brandRow: StyleProp<ViewStyle>;
  brandTagline: StyleProp<TextStyle>;
  centerTabActiveIndicator: StyleProp<ViewStyle>;
  centerTabButton: StyleProp<ViewStyle>;
  centerTabButtonActive: StyleProp<ViewStyle>;
  centerTabIcon: StyleProp<TextStyle>;
  disabledButton: StyleProp<ViewStyle>;
  disabledButtonText: StyleProp<TextStyle>;
  header: StyleProp<ViewStyle>;
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
  tabLabel: StyleProp<TextStyle>;
  tabLabelActive: StyleProp<TextStyle>;
  visualOnlyButton: StyleProp<ViewStyle>;
};

type MobileText = (typeof labels)[MobileLocale];

export function ScreenHeader({
  isRtl,
  locale,
  onLocaleChange,
  styles,
  text,
}: {
  isRtl: boolean;
  locale: MobileLocale;
  onLocaleChange: (locale: MobileLocale) => void;
  styles: MobileChromeStyles;
  text: MobileText;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>⌾</Text>
        </View>
        <View style={styles.brandCopy}>
          <Text
            numberOfLines={1}
            style={[styles.brandName, isRtl && styles.rtlText]}
          >
            بغداد
          </Text>
          <Text
            numberOfLines={2}
            style={[styles.brandTagline, isRtl && styles.rtlText]}
          >
            {text.appTagline}
          </Text>
        </View>
      </View>

      <View style={styles.localeRow}>
        {SUPPORTED_LOCALES.map((item) => (
          <Pressable
            accessibilityHint="يغير لغة الواجهة داخل هذه المعاينة فقط."
            accessibilityLabel={`تغيير اللغة إلى ${item.toUpperCase()}`}
            accessibilityRole="button"
            accessibilityState={{ selected: item === locale }}
            hitSlop={TOUCH_HIT_SLOP}
            key={item}
            onPress={() => onLocaleChange(item)}
            style={({ pressed }) => [
              styles.localeButton,
              item === locale && styles.localeButtonActive,
              pressed && styles.localeButtonPressed,
            ]}
          >
            <Text
              numberOfLines={1}
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
    <Pressable
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
      style={({ pressed }) => [
        styles.primaryButton,
        isVisualOnly && styles.visualOnlyButton,
        pressed && !accessibilityDisabled && styles.primaryButtonPressed,
        disabled && styles.disabledButton,
      ]}
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

export function BottomTabBar({
  activeTab,
  locale,
  onTabPress,
  styles,
}: {
  activeTab: MobileAppTabId;
  locale: MobileLocale;
  onTabPress: (tabId: MobileAppTabId) => void;
  styles: MobileChromeStyles;
}) {
  return (
    <View style={styles.tabBar}>
      {BOTTOM_NAV_TABS.map((tab) => {
        const active = tab.id === activeTab;
        const isCenterAction = tab.id === "quickBooking";
        const label = tab.label[locale];

        return (
          <Pressable
            accessibilityHint={
              active
                ? "هذا هو التبويب المفتوح حالياً."
                : isCenterAction
                  ? "يفتح مدخل إضافة حجز سريع بصري وآمن."
                  : `يفتح تبويب ${label}.`
            }
            accessibilityLabel={
              isCenterAction ? "إضافة حجز سريع" : `تبويب ${label}`
            }
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={TOUCH_HIT_SLOP}
            key={tab.id}
            onPress={() => onTabPress(tab.id)}
            style={({ pressed }) => [
              styles.tabButton,
              pressed && styles.tabButtonPressed,
              active && styles.tabButtonActive,
              isCenterAction && styles.centerTabButton,
              isCenterAction && active && styles.centerTabButtonActive,
            ]}
          >
            <Text
              style={[
                styles.tabIcon,
                active && styles.tabIconActive,
                isCenterAction && styles.centerTabIcon,
              ]}
            >
              {tab.icon}
            </Text>
            {isCenterAction ? null : (
              <Text
                numberOfLines={1}
                style={[styles.tabLabel, active && styles.tabLabelActive]}
              >
                {label}
              </Text>
            )}
            <View
              style={[
                styles.tabActiveIndicator,
                active && styles.tabActiveIndicatorVisible,
                isCenterAction && styles.centerTabActiveIndicator,
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
