import { Image, StyleSheet, View, type ImageSourcePropType } from "react-native";

import { PremiumEntrance, PremiumPressable } from "./premium-motion";
import { LayoutText as Text } from "./layout-text";
import { formatCommerceMoney, type CommerceCopy } from "../i18n/commerce";
import type { MobileLocale } from "../i18n/labels";
import type { CommerceProduct, CommerceStore } from "../types/commerce";
import type { MobileResponsiveLayout } from "../layout/responsive-metrics";
import { SHARED_TOP_HEADER_LAYOUT } from "../layout/screen-contracts";
import { useMobileResponsiveLayout } from "../layout/use-mobile-responsive-layout";
import type { MobileTheme } from "../theme/tokens";

const FONT = {
  kufiBold: "NotoKufiArabic-Bold",
  uiRegular: "NotoSansArabicUI-Regular",
  uiSemiBold: "NotoSansArabicUI-SemiBold",
} as const;

/* eslint-disable @typescript-eslint/no-require-imports -- Expo bundles existing assets statically. */
export const COMMERCE_ICONS = {
  backLtr: require("../../assets/icons/common/back-arrow-ltr.png") as ImageSourcePropType,
  backRtl: require("../../assets/icons/common/back-arrow-rtl.png") as ImageSourcePropType,
  cart: require("../../assets/icons/common/payment-card.png") as ImageSourcePropType,
  catalog: require("../../assets/icons/categories/services.png") as ImageSourcePropType,
  favorite: require("../../assets/icons/common/heart.png") as ImageSourcePropType,
  location: require("../../assets/icons/common/location-pin.png") as ImageSourcePropType,
  search: require("../../assets/icons/common/search.png") as ImageSourcePropType,
};
/* eslint-enable @typescript-eslint/no-require-imports */

export function CommerceHeader({
  cartQuantity,
  copy,
  isRtl,
  onBack,
  onCart,
  title,
  theme,
}: {
  cartQuantity?: number;
  copy: CommerceCopy;
  isRtl: boolean;
  onBack?: () => void;
  onCart?: () => void;
  title: string;
  theme: MobileTheme;
}) {
  const layout = useMobileResponsiveLayout();
  const styles = createStyles(theme, layout);
  return (
    <View style={[styles.header, isRtl && styles.rowRtl]}>
      {onBack ? (
        <IconButton
          icon={isRtl ? COMMERCE_ICONS.backRtl : COMMERCE_ICONS.backLtr}
          label={copy.back}
          onPress={onBack}
          theme={theme}
        />
      ) : <View style={styles.headerSpacer} />}
      <Text numberOfLines={SHARED_TOP_HEADER_LAYOUT.titleMaxLines} style={[styles.headerTitle, isRtl ? styles.rtl : styles.ltr]}>{title}</Text>
      {onCart ? (
        <View>
          <IconButton icon={COMMERCE_ICONS.cart} label={copy.cart} onPress={onCart} theme={theme} />
          {cartQuantity ? <View style={styles.badge}><Text style={styles.badgeText}>{cartQuantity}</Text></View> : null}
        </View>
      ) : <View style={styles.headerSpacer} />}
    </View>
  );
}

export function IconButton({
  active = false,
  disabled = false,
  icon,
  label,
  onPress,
  theme,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: ImageSourcePropType;
  label: string;
  onPress: () => void;
  theme: MobileTheme;
}) {
  const layout = useMobileResponsiveLayout();
  const styles = createStyles(theme, layout);
  return (
    <PremiumPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={[styles.iconButton, active && styles.iconButtonActive, disabled && styles.disabled]}
    >
      <Image accessible={false} alt="" source={icon} style={[styles.icon, active && styles.iconActive]} />
    </PremiumPressable>
  );
}

export function CommerceButton({
  danger = false,
  disabled = false,
  label,
  onPress,
  secondary = false,
  theme,
}: {
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  secondary?: boolean;
  theme: MobileTheme;
}) {
  const styles = createStyles(theme);
  return (
    <PremiumPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        danger && styles.buttonDanger,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary, danger && styles.buttonTextDanger]}>
        {label}
      </Text>
    </PremiumPressable>
  );
}

export function CommerceState({
  body,
  buttonLabel,
  onPress,
  theme,
  title,
}: {
  body?: string;
  buttonLabel?: string;
  onPress?: () => void;
  theme: MobileTheme;
  title: string;
}) {
  const styles = createStyles(theme);
  return (
    <PremiumEntrance style={styles.stateCard}>
      <View style={styles.stateMark}><View style={styles.stateMarkInner} /></View>
      <Text style={styles.stateTitle}>{title}</Text>
      {body ? <Text style={styles.stateBody}>{body}</Text> : null}
      {buttonLabel && onPress ? <CommerceButton label={buttonLabel} onPress={onPress} secondary theme={theme} /> : null}
    </PremiumEntrance>
  );
}

export function StoreCard({
  copy,
  favorite,
  isRtl,
  locale,
  onFavorite,
  onPress,
  store,
  theme,
}: {
  copy: CommerceCopy;
  favorite?: boolean;
  isRtl: boolean;
  locale: MobileLocale;
  onFavorite: () => void;
  onPress: () => void;
  store: CommerceStore;
  theme: MobileTheme;
}) {
  const styles = createStyles(theme);
  return (
    <PremiumEntrance style={styles.card}>
      {store.coverImageUrl ? <Image alt={store.name} source={{ uri: store.coverImageUrl }} style={styles.cover} /> : <View style={styles.coverFallback}><Image alt="" source={COMMERCE_ICONS.catalog} style={styles.coverIcon} /></View>}
      <View style={styles.cardContent}>
        <View style={[styles.cardTitleRow, isRtl && styles.rowRtl]}>
          <PremiumPressable accessibilityLabel={store.name} accessibilityRole="button" onPress={onPress} style={styles.cardTitlePress}>
            <Text numberOfLines={2} style={[styles.cardTitle, isRtl ? styles.rtl : styles.ltr]}>{store.name}</Text>
          </PremiumPressable>
          {favorite === undefined ? null : <IconButton active={favorite} icon={COMMERCE_ICONS.favorite} label={copy.favorites} onPress={onFavorite} theme={theme} />}
        </View>
        {store.description ? <Text numberOfLines={2} style={[styles.cardBody, isRtl ? styles.rtl : styles.ltr]}>{store.description}</Text> : null}
        <View style={[styles.metaRow, isRtl && styles.rowRtl]}>
          {store.delivery.enabled ? <MetaPill label={copy.delivery} theme={theme} /> : null}
          {store.pickup.enabled ? <MetaPill label={copy.pickup} theme={theme} /> : null}
        </View>
        <Text style={[styles.price, isRtl ? styles.rtl : styles.ltr]}>
          {copy.minimumOrder}: {formatCommerceMoney(store.minimumOrderValue, store.currency, locale)}
        </Text>
      </View>
    </PremiumEntrance>
  );
}

export function ProductCard({
  copy,
  favorite,
  isRtl,
  locale,
  onFavorite,
  onPress,
  product,
  theme,
}: {
  copy: CommerceCopy;
  favorite?: boolean;
  isRtl: boolean;
  locale: MobileLocale;
  onFavorite: () => void;
  onPress: () => void;
  product: CommerceProduct;
  theme: MobileTheme;
}) {
  const styles = createStyles(theme);
  const price = product.highestPrice
    ? `${formatCommerceMoney(product.lowestPrice, product.currency, locale)} – ${formatCommerceMoney(product.highestPrice, product.currency, locale)}`
    : formatCommerceMoney(product.lowestPrice, product.currency, locale);
  return (
    <PremiumEntrance style={styles.card}>
      {product.primaryMediaUrl ? <Image alt={product.name} source={{ uri: product.primaryMediaUrl }} style={styles.productImage} /> : <View style={styles.productFallback}><Image alt="" source={COMMERCE_ICONS.catalog} style={styles.coverIcon} /></View>}
      <View style={styles.cardContent}>
        <View style={[styles.cardTitleRow, isRtl && styles.rowRtl]}>
          <PremiumPressable accessibilityLabel={product.name} accessibilityRole="button" onPress={onPress} style={styles.cardTitlePress}>
            <Text numberOfLines={2} style={[styles.cardTitle, isRtl ? styles.rtl : styles.ltr]}>{product.name}</Text>
            <Text numberOfLines={1} style={[styles.cardBody, isRtl ? styles.rtl : styles.ltr]}>{product.store.name}</Text>
          </PremiumPressable>
          {favorite === undefined ? null : <IconButton active={favorite} icon={COMMERCE_ICONS.favorite} label={copy.favorites} onPress={onFavorite} theme={theme} />}
        </View>
        <Text style={[styles.price, isRtl ? styles.rtl : styles.ltr]}>{price}</Text>
        <Text style={[product.inStock ? styles.available : styles.unavailable, isRtl ? styles.rtl : styles.ltr]}>
          {product.inStock ? copy.inStock : copy.outOfStock}
        </Text>
      </View>
    </PremiumEntrance>
  );
}

export function MetaPill({ label, selected = false, theme }: { label: string; selected?: boolean; theme: MobileTheme }) {
  const styles = createStyles(theme);
  return <View style={[styles.pill, selected && styles.pillSelected]}><Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text></View>;
}

export function createCommerceStyles(theme: MobileTheme) {
  return createStyles(theme);
}

function createStyles(theme: MobileTheme, layout?: MobileResponsiveLayout) {
  const headerActionSize = layout?.touchTarget ?? 44;

  return StyleSheet.create({
    available: { color: theme.colors.success, fontFamily: FONT.uiSemiBold, fontSize: 13 },
    badge: { alignItems: "center", backgroundColor: theme.colors.gold, borderRadius: 10, height: 20, justifyContent: "center", position: "absolute", right: -5, top: -5, width: 20 },
    badgeText: { color: theme.colors.foregroundInverse, fontFamily: FONT.uiSemiBold, fontSize: 10 },
    button: { alignItems: "center", backgroundColor: theme.colors.gold, borderColor: theme.colors.gold, borderRadius: 18, borderWidth: 1, justifyContent: "center", minHeight: 50, paddingHorizontal: 18 },
    buttonDanger: { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.danger },
    buttonSecondary: { backgroundColor: "transparent" },
    buttonText: { color: theme.colors.foregroundInverse, fontFamily: FONT.uiSemiBold, fontSize: 15 },
    buttonTextDanger: { color: theme.colors.danger },
    buttonTextSecondary: { color: theme.colors.gold },
    card: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 24, borderWidth: 1, overflow: "hidden" },
    cardBody: { color: theme.colors.mutedForeground, fontFamily: FONT.uiRegular, fontSize: 13, lineHeight: 21 },
    cardContent: { gap: 9, padding: 15 },
    cardTitle: { color: theme.colors.foreground, fontFamily: FONT.uiSemiBold, fontSize: 17, lineHeight: 25 },
    cardTitlePress: { flex: 1, gap: 3, minHeight: 44, justifyContent: "center" },
    cardTitleRow: { alignItems: "center", flexDirection: "row", gap: 10 },
    cover: { height: 135, width: "100%" },
    coverFallback: { alignItems: "center", backgroundColor: theme.colors.heroMuted, height: 110, justifyContent: "center" },
    coverIcon: { height: 36, tintColor: theme.colors.gold, width: 36 },
    disabled: { opacity: 0.45 },
    header: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between", minHeight: layout?.headerHeight ?? 56 },
    headerSpacer: { height: headerActionSize, width: headerActionSize },
    headerTitle: { color: theme.colors.foreground, flex: 1, fontFamily: FONT.kufiBold, fontSize: layout?.isCompactHeight ? 18 : 20, lineHeight: layout?.isCompactHeight ? 25 : 28, textAlign: "center" },
    icon: { height: 22, tintColor: theme.colors.mutedForeground, width: 22 },
    iconActive: { tintColor: theme.colors.gold },
    iconButton: { alignItems: "center", backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.border, borderRadius: 16, borderWidth: 1, height: headerActionSize, justifyContent: "center", width: headerActionSize },
    iconButtonActive: { borderColor: theme.colors.gold },
    ltr: { textAlign: "left", writingDirection: "ltr" },
    metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    pill: { backgroundColor: theme.colors.muted, borderColor: theme.colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
    pillSelected: { backgroundColor: theme.colors.goldSoft, borderColor: theme.colors.gold },
    pillText: { color: theme.colors.mutedForeground, fontFamily: FONT.uiRegular, fontSize: 12 },
    pillTextSelected: { color: theme.colors.gold, fontFamily: FONT.uiSemiBold },
    price: { color: theme.colors.gold, fontFamily: FONT.uiSemiBold, fontSize: 15 },
    productFallback: { alignItems: "center", backgroundColor: theme.colors.heroMuted, height: 160, justifyContent: "center" },
    productImage: { height: 180, width: "100%" },
    rowRtl: { flexDirection: "row-reverse" },
    rtl: { textAlign: "right", writingDirection: "rtl" },
    stateBody: { color: theme.colors.mutedForeground, fontFamily: FONT.uiRegular, fontSize: 14, lineHeight: 23, textAlign: "center" },
    stateCard: { alignItems: "center", backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 24, borderWidth: 1, gap: 12, minHeight: 210, justifyContent: "center", padding: 24 },
    stateMark: { alignItems: "center", borderColor: theme.colors.gold, borderRadius: 22, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
    stateMarkInner: { backgroundColor: theme.colors.gold, borderRadius: 6, height: 12, width: 12 },
    stateTitle: { color: theme.colors.foreground, fontFamily: FONT.uiSemiBold, fontSize: 17, textAlign: "center" },
    unavailable: { color: theme.colors.danger, fontFamily: FONT.uiSemiBold, fontSize: 13 },
  });
}
