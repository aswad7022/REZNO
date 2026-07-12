import { useMemo } from "react";
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";

import { PremiumEntrance } from "../components/premium-motion";
import type { MobileLocale } from "../i18n/labels";
import type { MobileTheme } from "../theme/tokens";

const FONT = {
  kufiBold: "NotoKufiArabic-Bold",
  uiRegular: "NotoSansArabicUI-Regular",
  uiSemiBold: "NotoSansArabicUI-SemiBold",
} as const;

/* eslint-disable @typescript-eslint/no-require-imports -- Expo bundles this existing local image asset statically. */
const ORDER_ICON = require("../../assets/icons/common/payment-card.png") as ImageSourcePropType;
/* eslint-enable @typescript-eslint/no-require-imports */

const COPY: Record<MobileLocale, { body: string; eyebrow: string; title: string }> = {
  ar: {
    body: "ستظهر طلبات المنتجات هنا بعد تفعيل السوق والدفع والمخزون بصورة آمنة.",
    eyebrow: "لا توجد طلبات حالياً",
    title: "طلباتي",
  },
  ckb: {
    body: "داواکارییەکانی بەرهەم لێرە دەردەکەون دوای چالاککردنی پارێزراوی بازاڕ و پارەدان و کۆگا.",
    eyebrow: "ئێستا هیچ داواکارییەک نییە",
    title: "داواکارییەکانم",
  },
  en: {
    body: "Product orders will appear here after the market, payments, and inventory are enabled safely.",
    eyebrow: "No orders yet",
    title: "My orders",
  },
};

export function ReznoOrdersScreen({
  isRtl,
  locale,
  theme,
}: {
  isRtl: boolean;
  locale: MobileLocale;
  theme: MobileTheme;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const copy = COPY[locale];
  const direction = isRtl ? styles.rtlText : styles.ltrText;

  return (
    <View style={styles.screen}>
      <Text style={[styles.title, direction]}>{copy.title}</Text>
      <PremiumEntrance delay={60} distance={8} style={styles.emptyCard}>
        <View style={styles.iconTile}>
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={ORDER_ICON}
            style={styles.icon}
          />
        </View>
        <Text style={[styles.eyebrow, direction]}>{copy.eyebrow}</Text>
        <Text style={[styles.body, direction]}>{copy.body}</Text>
      </PremiumEntrance>
    </View>
  );
}
function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    body: {
      color: theme.colors.mutedForeground,
      fontFamily: FONT.uiRegular,
      fontSize: 15,
      lineHeight: 24,
      marginTop: 8,
      maxWidth: 310,
      textAlign: "center",
    },
    emptyCard: {
      alignItems: "center",
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      borderRadius: 28,
      borderWidth: 1,
      marginTop: 20,
      minHeight: 300,
      paddingHorizontal: 24,
      paddingVertical: 46,
    },
    eyebrow: {
      color: theme.colors.foreground,
      fontFamily: FONT.uiSemiBold,
      fontSize: 17,
      marginTop: 20,
      textAlign: "center",
    },
    icon: {
      height: 34,
      tintColor: theme.colors.gold,
      width: 34,
    },
    iconTile: {
      alignItems: "center",
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.gold,
      borderRadius: 28,
      borderWidth: 1,
      height: 64,
      justifyContent: "center",
      width: 64,
    },
    ltrText: {
      writingDirection: "ltr",
    },
    rtlText: {
      writingDirection: "rtl",
    },
    screen: {
      paddingBottom: 24,
      paddingHorizontal: 16,
      paddingTop: 18,
    },
    title: {
      color: theme.colors.foreground,
      fontFamily: FONT.kufiBold,
      fontSize: 28,
      lineHeight: 40,
    },
  });
}
