import { useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { MobileLocale } from "../i18n/labels";
import type { MobileResponsiveLayout } from "../layout/responsive-metrics";
import { useMobileResponsiveLayout } from "../layout/use-mobile-responsive-layout";
import type { MobileAppTabId } from "./mobile-chrome";
import { PremiumEntrance, PremiumPressable, useReducedMotionPreference } from "./premium-motion";
import type { MobileTheme } from "../theme/tokens";

const FONT = {
  uiMedium: "NotoSansArabicUI-Medium",
  uiRegular: "NotoSansArabicUI-Regular",
  uiSemiBold: "NotoSansArabicUI-SemiBold",
} as const;

/* eslint-disable @typescript-eslint/no-require-imports -- Expo bundles existing local image assets statically. */
const ICONS = {
  bookings: require("../../assets/icons/common/calendar.png") as ImageSourcePropType,
  favorites: require("../../assets/icons/common/heart.png") as ImageSourcePropType,
  orders: require("../../assets/icons/common/payment-card.png") as ImageSourcePropType,
};
/* eslint-enable @typescript-eslint/no-require-imports */

type ActivityDestination = "bookings" | "favorites" | "orders";

const COPY: Record<
  MobileLocale,
  {
    close: string;
    hint: string;
    labels: Record<ActivityDestination, string>;
    title: string;
  }
> = {
  ar: {
    close: "إغلاق قائمة نشاطي",
    hint: "اختر وجهتك",
    labels: { bookings: "حجوزاتي", favorites: "مفضلتي", orders: "طلباتي" },
    title: "نشاطي",
  },
  ckb: {
    close: "داخستنی لیستی چالاکییەکانم",
    hint: "شوێنێک هەڵبژێرە",
    labels: { bookings: "حجزەکانم", favorites: "دڵخوازەکان", orders: "داواکارییەکانم" },
    title: "چالاکییەکانم",
  },
  en: {
    close: "Close My activity menu",
    hint: "Choose a destination",
    labels: { bookings: "My bookings", favorites: "Favorites", orders: "My orders" },
    title: "My activity",
  },
};

const DESTINATIONS: Array<{ id: ActivityDestination; icon: ImageSourcePropType }> = [
  { id: "bookings", icon: ICONS.bookings },
  { id: "orders", icon: ICONS.orders },
  { id: "favorites", icon: ICONS.favorites },
];

export function ActivityLauncher({
  isRtl,
  locale,
  onClose,
  onNavigate,
  theme,
  visible,
}: {
  isRtl: boolean;
  locale: MobileLocale;
  onClose: () => void;
  onNavigate: (destination: MobileAppTabId) => void;
  theme: MobileTheme;
  visible: boolean;
}) {
  const layout = useMobileResponsiveLayout();
  const reducedMotion = useReducedMotionPreference();
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const styles = useMemo(() => createStyles(theme, layout), [layout, theme]);
  const copy = COPY[locale];

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted) setScreenReaderEnabled(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReaderEnabled,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const useFallbackSheet =
    screenReaderEnabled ||
    reducedMotion ||
    layout.isNarrowWidth ||
    layout.isCompactHeight;
  const destinations = locale === "en" ? DESTINATIONS : [...DESTINATIONS].reverse();
  const direction = isRtl ? styles.rtlText : styles.ltrText;

  const handleDestination = (destination: ActivityDestination) => {
    onClose();
    onNavigate(destination);
  };

  return (
    <Modal
      animationType={useFallbackSheet ? "none" : "fade"}
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityLabel={copy.close}
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView
          edges={["bottom", "left", "right", "top"]}
          pointerEvents="box-none"
          style={styles.safeArea}
        >
          {useFallbackSheet ? (
            <View accessibilityViewIsModal style={styles.sheet}>
              <Text style={[styles.sheetTitle, direction]}>{copy.title}</Text>
              <Text style={[styles.sheetHint, direction]}>{copy.hint}</Text>
              <View style={styles.sheetList}>
                {destinations.map((destination) => (
                  <ActivityButton
                    direction={direction}
                    icon={destination.icon}
                    isRtl={isRtl}
                    key={destination.id}
                    label={copy.labels[destination.id]}
                    onPress={() => handleDestination(destination.id)}
                    sheet
                    styles={styles}
                  />
                ))}
              </View>
            </View>
          ) : (
            <View accessibilityViewIsModal style={styles.arcModalBoundary}>
              <PremiumEntrance
                distance={12}
                initialScale={0.96}
                style={styles.arcPanel}
              >
                <View style={styles.arcHeading}>
                  <Text style={[styles.arcTitle, direction]}>{copy.title}</Text>
                  <Text style={[styles.arcHint, direction]}>{copy.hint}</Text>
                </View>
                <View style={styles.arcRow}>
                  {destinations.map((destination, index) => (
                    <View
                      key={destination.id}
                      style={index === 1 ? styles.arcCenterItem : styles.arcSideItem}
                    >
                      <ActivityButton
                        direction={direction}
                        icon={destination.icon}
                        isRtl={isRtl}
                        label={copy.labels[destination.id]}
                        onPress={() => handleDestination(destination.id)}
                        styles={styles}
                      />
                    </View>
                  ))}
                </View>
              </PremiumEntrance>
            </View>
          )}
        </SafeAreaView>
        <Pressable
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          style={[
            styles.activityTabCloseTarget,
            locale === "en"
              ? styles.activityTabCloseTargetLtr
              : styles.activityTabCloseTargetRtl,
          ]}
        />
      </View>
    </Modal>
  );
}

function ActivityButton({
  direction,
  icon,
  isRtl,
  label,
  onPress,
  sheet = false,
  styles,
}: {
  direction: object;
  icon: ImageSourcePropType;
  isRtl: boolean;
  label: string;
  onPress: () => void;
  sheet?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <PremiumPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      scaleTo={0.96}
      style={[
        styles.activityButton,
        sheet && styles.activityButtonSheet,
        sheet && isRtl && styles.activityButtonSheetRtl,
      ]}
    >
      <View style={styles.activityIconTile}>
        <Image
          accessible={false}
          alt=""
          resizeMode="contain"
          source={icon}
          style={styles.activityIcon}
        />
      </View>
      <Text numberOfLines={1} style={[styles.activityLabel, direction]}>
        {label}
      </Text>
    </PremiumPressable>
  );
}

function createStyles(
  theme: MobileTheme,
  layout: MobileResponsiveLayout,
) {
  return StyleSheet.create({
    activityButton: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.goldSoft,
      borderRadius: 22,
      borderWidth: 1,
      gap: 8,
      justifyContent: "center",
      minHeight: 104,
      paddingHorizontal: 8,
      paddingVertical: 12,
      width: 96,
    },
    activityButtonSheet: {
      flexDirection: "row",
      justifyContent: "flex-start",
      minHeight: 58,
      paddingHorizontal: 14,
      width: "100%",
    },
    activityButtonSheetRtl: {
      flexDirection: "row-reverse",
    },
    activityIcon: {
      height: 24,
      tintColor: theme.colors.gold,
      width: 24,
    },
    activityIconTile: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 16,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    activityLabel: {
      color: theme.colors.foreground,
      flexShrink: 1,
      fontFamily: FONT.uiMedium,
      fontSize: 12,
      textAlign: "center",
    },
    activityTabCloseTarget: {
      bottom: layout.bottomInset + 4,
      height: 78,
      position: "absolute",
      width: "20%",
    },
    activityTabCloseTargetLtr: {
      left: "60%",
    },
    activityTabCloseTargetRtl: {
      left: "20%",
    },
    arcCenterItem: {
      marginBottom: 28,
    },
    arcHeading: {
      alignItems: "center",
      marginBottom: 12,
    },
    arcModalBoundary: {
      width: "100%",
    },
    arcHint: {
      color: theme.colors.mutedForeground,
      fontFamily: FONT.uiRegular,
      fontSize: 12,
      marginTop: 2,
    },
    arcPanel: {
      alignSelf: "center",
      backgroundColor: theme.colors.nav,
      borderColor: theme.colors.goldSoft,
      borderRadius: 30,
      borderWidth: 1,
      marginBottom: 84,
      maxWidth: 390,
      paddingHorizontal: 16,
      paddingTop: 16,
      width: "94%",
    },
    arcRow: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    arcSideItem: {
      marginBottom: 4,
    },
    arcTitle: {
      color: theme.colors.foreground,
      fontFamily: FONT.uiSemiBold,
      fontSize: 18,
    },
    ltrText: {
      writingDirection: "ltr",
    },
    modalRoot: {
      backgroundColor: theme.colors.overlay,
      flex: 1,
    },
    rtlText: {
      writingDirection: "rtl",
    },
    safeArea: {
      flex: 1,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: theme.colors.nav,
      borderColor: theme.colors.goldSoft,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 1,
      paddingBottom: 16,
      paddingHorizontal: 18,
      paddingTop: 20,
    },
    sheetHint: {
      color: theme.colors.mutedForeground,
      fontFamily: FONT.uiRegular,
      fontSize: 13,
      marginTop: 2,
    },
    sheetList: {
      gap: 10,
      marginTop: 16,
    },
    sheetTitle: {
      color: theme.colors.foreground,
      fontFamily: FONT.uiSemiBold,
      fontSize: 21,
    },
  });
}
