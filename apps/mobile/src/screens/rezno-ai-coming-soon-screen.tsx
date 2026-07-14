import { useMemo } from "react";
import { Image, StyleSheet, View, type ImageSourcePropType } from "react-native";

import { PremiumEntrance } from "../components/premium-motion";
import { LayoutText as Text } from "../components/layout-text";
import type { MobileLocale } from "../i18n/labels";
import type { MobileResponsiveLayout } from "../layout/responsive-metrics";
import { useMobileResponsiveLayout } from "../layout/use-mobile-responsive-layout";
import type { MobileTheme } from "../theme/tokens";

const FONT = {
  kufiBold: "NotoKufiArabic-Bold",
  uiRegular: "NotoSansArabicUI-Regular",
  uiSemiBold: "NotoSansArabicUI-SemiBold",
} as const;

/* eslint-disable @typescript-eslint/no-require-imports -- Expo bundles this existing local image asset statically. */
const AI_ICON = require("../../assets/icons/common/star-rating.png") as ImageSourcePropType;
/* eslint-enable @typescript-eslint/no-require-imports */

const COPY: Record<MobileLocale, { body: string; flag: string; title: string }> = {
  ar: {
    body: "نعمل على مساعد يسهّل اكتشاف الخدمات والمنتجات دون اتخاذ قرارات أو عرض توصيات وهمية.",
    flag: "قريباً",
    title: "REZNO AI",
  },
  ckb: {
    body: "لەسەر یاریدەدەرێک کار دەکەین کە دۆزینەوەی خزمەتگوزاری و بەرهەم ئاسان دەکات، بەبێ پێشنیاری ساختە.",
    flag: "بەم زووانە",
    title: "REZNO AI",
  },
  en: {
    body: "We are building an assistant for clearer service and product discovery, without fake recommendations or automated decisions.",
    flag: "Coming soon",
    title: "REZNO AI",
  },
};

const AI_FEATURE_ENABLED = process.env.EXPO_PUBLIC_REZNO_AI_ENABLED === "true";

export function ReznoAiComingSoonScreen({
  isRtl,
  locale,
  theme,
}: {
  isRtl: boolean;
  locale: MobileLocale;
  theme: MobileTheme;
}) {
  const layout = useMobileResponsiveLayout();
  const styles = useMemo(() => createStyles(theme, layout), [layout, theme]);
  const copy = COPY[locale];

  return (
    <View style={styles.screen}>
      <PremiumEntrance initialScale={0.96} style={styles.card}>
        <View style={styles.glow} />
        <View style={styles.iconHalo}>
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={AI_ICON}
            style={styles.icon}
          />
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{copy.flag}</Text>
        </View>
        <Text style={styles.title}>{copy.title}</Text>
        <Text
          style={[
            styles.body,
            isRtl ? styles.rtlText : styles.ltrText,
          ]}
        >
          {copy.body}
        </Text>
        <Text accessibilityElementsHidden style={styles.flagState}>
          {AI_FEATURE_ENABLED ? "preview-flag:on" : "preview-flag:off"}
        </Text>
      </PremiumEntrance>
    </View>
  );
}
function createStyles(
  theme: MobileTheme,
  layout: MobileResponsiveLayout,
) {
  return StyleSheet.create({
    body: {
      color: theme.colors.mutedForeground,
      fontFamily: FONT.uiRegular,
      fontSize: 15,
      lineHeight: 25,
      marginTop: 10,
      maxWidth: 320,
      textAlign: "center",
    },
    card: {
      alignItems: "center",
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.goldSoft,
      borderRadius: 30,
      borderWidth: 1,
      minHeight: layout.isCompactHeight ? 300 : 360,
      overflow: "hidden",
      paddingHorizontal: layout.cardPadding,
      paddingVertical: layout.isCompactHeight ? 30 : 42,
      position: "relative",
    },
    flagState: {
      height: 0,
      opacity: 0,
      width: 0,
    },
    glow: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 160,
      height: 240,
      opacity: theme.isDark ? 0.56 : 0.32,
      position: "absolute",
      right: -86,
      top: -90,
      width: 240,
    },
    icon: {
      height: 40,
      tintColor: theme.colors.gold,
      width: 40,
    },
    iconHalo: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: 34,
      borderWidth: 1,
      height: 68,
      justifyContent: "center",
      width: 68,
    },
    ltrText: {
      writingDirection: "ltr",
    },
    rtlText: {
      writingDirection: "rtl",
    },
    screen: {
      paddingBottom: layout.verticalSpacing,
      paddingHorizontal: layout.pagePadding,
      paddingTop: layout.screenTopPadding,
    },
    statusPill: {
      backgroundColor: theme.colors.goldSoft,
      borderRadius: 999,
      marginTop: 22,
      paddingHorizontal: 16,
      paddingVertical: 7,
    },
    statusText: {
      color: theme.colors.gold,
      fontFamily: FONT.uiSemiBold,
      fontSize: 12,
    },
    title: {
      color: theme.colors.foreground,
      fontFamily: FONT.kufiBold,
      fontSize: layout.titleSize,
      lineHeight: layout.titleSize + 10,
      marginTop: 14,
    },
  });
}
