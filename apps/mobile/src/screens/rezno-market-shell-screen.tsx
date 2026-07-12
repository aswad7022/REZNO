import { useMemo } from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

import { PremiumEntrance, PremiumPressable } from "../components/premium-motion";
import type { MobileLocale } from "../i18n/labels";
import type { MobileTheme } from "../theme/tokens";

const FONT = {
  kufiBold: "NotoKufiArabic-Bold",
  uiMedium: "NotoSansArabicUI-Medium",
  uiRegular: "NotoSansArabicUI-Regular",
  uiSemiBold: "NotoSansArabicUI-SemiBold",
} as const;

/* eslint-disable @typescript-eslint/no-require-imports -- Expo bundles existing local image assets statically. */
const ICONS = {
  catalog: require("../../assets/icons/categories/services.png") as ImageSourcePropType,
  search: require("../../assets/icons/common/search.png") as ImageSourcePropType,
};
/* eslint-enable @typescript-eslint/no-require-imports */

const COPY: Record<
  MobileLocale,
  {
    browseServices: string;
    browseServicesHint: string;
    eyebrow: string;
    search: string;
    status: string;
    subtitle: string;
    title: string;
  }
> = {
  ar: {
    browseServices: "استكشف الخدمات والحجوزات",
    browseServicesHint: "يفتح دليل الأنشطة والخدمات الحالي.",
    eyebrow: "مساحة جديدة داخل REZNO",
    search: "ابحث عن منتج أو متجر",
    status: "سيظهر الكتالوج هنا بعد اكتمال نماذج المنتجات والمخزون الآمنة.",
    subtitle: "منتجات ومتاجر موثوقة، منفصلة بوضوح عن حجوزات الخدمات.",
    title: "السوق",
  },
  ckb: {
    browseServices: "خزمەتگوزاری و حجزەکان ببینە",
    browseServicesHint: "ڕێبەری ئێستای کار و خزمەتگوزاری دەکاتەوە.",
    eyebrow: "بۆشاییەکی نوێ لە REZNO",
    search: "بگەڕێ بۆ بەرهەم یان فرۆشگا",
    status: "کاتالۆگ لێرە دەردەکەوێت دوای تەواوبوونی مۆدێلی پارێزراوی بەرهەم و کۆگا.",
    subtitle: "بەرهەم و فرۆشگای متمانەپێکراو، جیاواز لە حجزی خزمەتگوزاری.",
    title: "بازاڕ",
  },
  en: {
    browseServices: "Explore services and bookings",
    browseServicesHint: "Opens the existing business and service directory.",
    eyebrow: "A new space in REZNO",
    search: "Search for a product or store",
    status: "The catalog will appear here after secure product and inventory models are complete.",
    subtitle: "Trusted products and stores, clearly separated from service bookings.",
    title: "Market",
  },
};

export function ReznoMarketShellScreen({
  isRtl,
  locale,
  onOpenServiceDiscovery,
  theme,
}: {
  isRtl: boolean;
  locale: MobileLocale;
  onOpenServiceDiscovery: () => void;
  theme: MobileTheme;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const copy = COPY[locale];
  const directionStyle = isRtl ? styles.rtlText : styles.ltrText;

  return (
    <View style={styles.screen}>
      <PremiumEntrance distance={8} style={styles.hero}>
        <View style={styles.iconTile}>
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={ICONS.catalog}
            style={styles.catalogIcon}
          />
        </View>
        <Text style={[styles.eyebrow, directionStyle]}>{copy.eyebrow}</Text>
        <Text style={[styles.title, directionStyle]}>{copy.title}</Text>
        <Text style={[styles.subtitle, directionStyle]}>{copy.subtitle}</Text>
      </PremiumEntrance>

      <PremiumEntrance delay={70} distance={8}>
        <View
          accessibilityLabel={`${copy.search}. ${copy.status}`}
          accessibilityRole="search"
          accessibilityState={{ disabled: true }}
          accessible
          style={[styles.searchShell, isRtl && styles.rowRtl]}
        >
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={ICONS.search}
            style={styles.searchIcon}
          />
          <Text numberOfLines={1} style={[styles.searchText, directionStyle]}>
            {copy.search}
          </Text>
          <View style={styles.soonPill}>
            <Text style={styles.soonText}>{locale === "en" ? "SOON" : "قريباً"}</Text>
          </View>
        </View>
      </PremiumEntrance>

      <PremiumEntrance
        delay={120}
        distance={8}
        style={[styles.stateCard, isRtl && styles.rowRtl]}
      >
        <View style={styles.stateMark}>
          <View style={styles.stateMarkInner} />
        </View>
        <Text style={[styles.stateText, directionStyle]}>{copy.status}</Text>
      </PremiumEntrance>

      <PremiumEntrance delay={170} distance={8}>
        <PremiumPressable
          accessibilityHint={copy.browseServicesHint}
          accessibilityLabel={copy.browseServices}
          accessibilityRole="button"
          onPress={onOpenServiceDiscovery}
          scaleTo={0.975}
          style={styles.servicesButton}
        >
          <Text style={[styles.servicesButtonText, directionStyle]}>
            {copy.browseServices}
          </Text>
        </PremiumPressable>
      </PremiumEntrance>
    </View>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    catalogIcon: {
      height: 30,
      tintColor: theme.colors.gold,
      width: 30,
    },
    eyebrow: {
      color: theme.colors.gold,
      fontFamily: FONT.uiSemiBold,
      fontSize: 13,
      marginTop: 16,
    },
    hero: {
      alignItems: "center",
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.goldSoft,
      borderRadius: 28,
      borderWidth: 1,
      paddingHorizontal: 24,
      paddingVertical: 28,
    },
    iconTile: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: 22,
      borderWidth: 1,
      height: 58,
      justifyContent: "center",
      width: 58,
    },
    ltrText: {
      textAlign: "left",
      writingDirection: "ltr",
    },
    rowRtl: {
      flexDirection: "row-reverse",
    },
    rtlText: {
      textAlign: "right",
      writingDirection: "rtl",
    },
    screen: {
      gap: 16,
      paddingBottom: 24,
      paddingHorizontal: 16,
      paddingTop: 18,
    },
    searchIcon: {
      height: 23,
      tintColor: theme.colors.gold,
      width: 23,
    },
    searchShell: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 64,
      paddingHorizontal: 16,
    },
    searchText: {
      color: theme.colors.mutedForeground,
      flex: 1,
      fontFamily: FONT.uiRegular,
      fontSize: 15,
    },
    servicesButton: {
      alignItems: "center",
      borderColor: theme.colors.gold,
      borderRadius: 20,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 54,
      paddingHorizontal: 20,
    },
    servicesButtonText: {
      color: theme.colors.gold,
      fontFamily: FONT.uiSemiBold,
      fontSize: 15,
    },
    soonPill: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    soonText: {
      color: theme.colors.gold,
      fontFamily: FONT.uiSemiBold,
      fontSize: 10,
    },
    stateCard: {
      alignItems: "center",
      backgroundColor: theme.colors.muted,
      borderColor: theme.colors.border,
      borderRadius: 24,
      borderWidth: 1,
      flexDirection: "row",
      gap: 14,
      paddingHorizontal: 18,
      paddingVertical: 20,
    },
    stateMark: {
      alignItems: "center",
      borderColor: theme.colors.gold,
      borderRadius: 15,
      borderWidth: 1,
      height: 30,
      justifyContent: "center",
      width: 30,
    },
    stateMarkInner: {
      backgroundColor: theme.colors.gold,
      borderRadius: 4,
      height: 8,
      width: 8,
    },
    stateText: {
      color: theme.colors.mutedForeground,
      flex: 1,
      fontFamily: FONT.uiRegular,
      fontSize: 14,
      lineHeight: 22,
    },
    subtitle: {
      color: theme.colors.mutedForeground,
      fontFamily: FONT.uiRegular,
      fontSize: 15,
      lineHeight: 24,
      marginTop: 8,
      maxWidth: 320,
      textAlign: "center",
    },
    title: {
      color: theme.colors.foreground,
      fontFamily: FONT.kufiBold,
      fontSize: 31,
      lineHeight: 42,
      marginTop: 4,
      textAlign: "center",
    },
  });
}
