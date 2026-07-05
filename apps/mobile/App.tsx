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
import { getScreenContent } from "./src/screens/content";
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
  const direction = getTextDirection(locale);
  const isRtl = direction === "rtl";
  const screen = useMemo(
    () =>
      getScreenContent({
        apiBaseUrl: API_BASE_URL,
        locale,
        tabId: activeTab,
      }),
    [activeTab, locale],
  );

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

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style={theme.isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>R</Text>
          </View>
          <View>
            <Text style={[styles.brandName, isRtl && styles.rtlText]}>
              REZNO
            </Text>
            <Text style={[styles.brandTagline, isRtl && styles.rtlText]}>
              {text.appTagline}
            </Text>
          </View>
        </View>
        <View style={styles.localeRow}>
          {SUPPORTED_LOCALES.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: item === locale }}
              onPress={() => setLocale(item)}
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

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scrollArea}
      >
        <View style={styles.noticeCard}>
          <Text style={[styles.noticeTitle, isRtl && styles.rtlText]}>
            {text.nativeFoundation}
          </Text>
          <Text style={[styles.noticeBody, isRtl && styles.rtlText]}>
            {text.nativeFoundationBody}
          </Text>
        </View>

        {activeTab === "marketplace" ? (
          <MarketplaceSection
            isRtl={isRtl}
            onRetry={loadMarketplace}
            state={marketplaceState}
            styles={styles}
            text={text}
          />
        ) : (
          <View style={styles.screenCard}>
            <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
              {screen.eyebrow}
            </Text>
            <Text style={[styles.screenTitle, isRtl && styles.rtlText]}>
              {screen.title}
            </Text>
            <Text style={[styles.screenDescription, isRtl && styles.rtlText]}>
              {screen.description}
            </Text>

            <View style={styles.actionStack}>
              {screen.actions.map((action) => (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  disabled={action.disabled}
                  style={[
                    styles.actionButton,
                    action.kind === "secondary" && styles.secondaryActionButton,
                    action.disabled && styles.disabledActionButton,
                  ]}
                >
                  <Text
                    style={[
                      styles.actionButtonText,
                      action.kind === "secondary" && styles.secondaryActionText,
                      action.disabled && styles.disabledActionText,
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

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
      </ScrollView>

      <View style={styles.tabBar}>
        {MOBILE_TABS.map((tab) => {
          const active = tab.id === activeTab;

          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (
                  tab.id === "marketplace" &&
                  marketplaceState.status === "idle"
                ) {
                  loadMarketplace();
                }

                setActiveTab(tab.id);
              }}
              style={[styles.tabButton, active && styles.tabButtonActive]}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
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
    </SafeAreaView>
  );
}

function MarketplaceSection({
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
          {text.tabs.marketplace}
        </Text>
        <Text style={[styles.screenTitle, isRtl && styles.rtlText]}>
          {text.marketplaceErrorTitle}
        </Text>
        <Text style={[styles.screenDescription, isRtl && styles.rtlText]}>
          {state.message}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={styles.actionButton}
        >
          <Text style={styles.actionButtonText}>{text.marketplaceRetry}</Text>
        </Pressable>
      </View>
    );
  }

  if (state.businesses.length === 0) {
    return (
      <View style={styles.screenCard}>
        <Text style={[styles.screenEyebrow, isRtl && styles.rtlText]}>
          {text.tabs.marketplace}
        </Text>
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
    <View style={styles.marketplaceList}>
      {state.businesses.map((business) => (
        <MarketplaceBusinessCard
          business={business}
          isRtl={isRtl}
          key={business.id}
          styles={styles}
          text={text}
        />
      ))}
    </View>
  );
}

function MarketplaceBusinessCard({
  business,
  isRtl,
  styles,
  text,
}: {
  business: MobileMarketplaceBusiness;
  isRtl: boolean;
  styles: MobileStyles;
  text: (typeof labels)[MobileLocale];
}) {
  const meta = [
    business.categoryName,
    business.city,
    business.branch.locationLabel,
  ].filter(Boolean);

  return (
    <View style={styles.businessCard}>
      <View style={styles.businessHeader}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>{business.name.charAt(0)}</Text>
        </View>
        <View style={styles.businessHeaderText}>
          <Text style={[styles.businessName, isRtl && styles.rtlText]}>
            {business.name}
          </Text>
          {meta.length > 0 ? (
            <Text style={[styles.businessMeta, isRtl && styles.rtlText]}>
              {meta.join(" · ")}
            </Text>
          ) : null}
        </View>
      </View>

      {business.description ? (
        <Text
          numberOfLines={3}
          style={[styles.businessDescription, isRtl && styles.rtlText]}
        >
          {business.description}
        </Text>
      ) : null}

      {business.matchingServiceName || business.matchingServicePrice ? (
        <View style={styles.bookingStrip}>
          <Text style={[styles.bookingStripTitle, isRtl && styles.rtlText]}>
            {business.matchingServiceName ?? text.marketplaceServices}
          </Text>
          {business.matchingServicePrice ? (
            <Text style={styles.bookingStripPrice}>
              {business.matchingServicePrice}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.businessPills}>
        <Text style={styles.businessPill}>
          ★ {business.averageRating?.toFixed(1) ?? "-"} ·{" "}
          {business.reviewCount} {text.marketplaceReviews}
        </Text>
        <Text style={styles.businessPill}>
          {business.serviceCount} {text.marketplaceServices}
        </Text>
        {business.startingPrice ? (
          <Text style={styles.businessPill}>
            {text.marketplaceStartingFrom} {business.startingPrice}
          </Text>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        <Text style={[styles.publicPath, isRtl && styles.rtlText]}>
          {text.marketplaceOpenBusiness}: {business.publicPath}
        </Text>
      </View>
    </View>
  );
}

type MobileStyles = ReturnType<typeof createStyles>;

const createStyles = (theme: MobileTheme) =>
  StyleSheet.create({
    actionButton: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: theme.radii.control,
      paddingVertical: 14,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: theme.isDark ? 0.24 : 0.12,
      shadowRadius: 18,
    },
    actionButtonText: {
      color: theme.colors.foregroundInverse,
      fontSize: 15,
      fontWeight: "900",
    },
    actionStack: {
      gap: theme.spacing.sm,
      marginTop: 20,
    },
    apiText: {
      color: theme.colors.warning,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 12,
    },
    bookingStrip: {
      backgroundColor: theme.colors.goldSoft,
      borderColor: theme.colors.accent,
      borderRadius: theme.radii.control,
      borderWidth: 1,
      flexDirection: "row",
      gap: theme.spacing.sm,
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    bookingStripPrice: {
      color: theme.colors.gold,
      fontSize: 13,
      fontWeight: "900",
    },
    bookingStripTitle: {
      color: theme.colors.foreground,
      flex: 1,
      fontSize: 13,
      fontWeight: "900",
    },
    brandName: {
      color: theme.colors.foreground,
      fontSize: 21,
      fontWeight: "900",
      letterSpacing: 0.5,
    },
    brandRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    brandTagline: {
      color: theme.colors.mutedForeground,
      fontSize: 13,
      marginTop: 2,
    },
    businessCard: {
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      gap: 13,
      padding: 16,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: theme.isDark ? 0.28 : 0.08,
      shadowRadius: 24,
    },
    businessDescription: {
      color: theme.colors.mutedForeground,
      fontSize: 14,
      lineHeight: 21,
    },
    businessHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    businessHeaderText: {
      flex: 1,
    },
    businessMeta: {
      color: theme.colors.mutedForeground,
      fontSize: 13,
      marginTop: 3,
    },
    businessName: {
      color: theme.colors.foreground,
      fontSize: 18,
      fontWeight: "900",
    },
    businessPill: {
      backgroundColor: theme.colors.muted,
      borderRadius: theme.radii.pill,
      color: theme.colors.mutedForeground,
      fontSize: 12,
      fontWeight: "800",
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    businessPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    cardFooter: {
      borderTopColor: theme.colors.border,
      borderTopWidth: 1,
      paddingTop: 12,
    },
    content: {
      gap: theme.spacing.md,
      paddingBottom: 132,
      paddingHorizontal: 20,
    },
    disabledActionButton: {
      backgroundColor: theme.colors.disabled,
      shadowOpacity: 0,
    },
    disabledActionText: {
      color: theme.colors.disabledText,
    },
    header: {
      gap: 16,
      paddingBottom: 14,
      paddingHorizontal: 20,
      paddingTop: 18,
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
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    localeButtonActive: {
      backgroundColor: theme.colors.gold,
      borderColor: theme.colors.gold,
    },
    localeButtonText: {
      color: theme.colors.mutedForeground,
      fontSize: 12,
      fontWeight: "800",
    },
    localeButtonTextActive: {
      color: theme.colors.foregroundInverse,
    },
    localeRow: {
      flexDirection: "row",
      gap: 8,
    },
    logoMark: {
      alignItems: "center",
      backgroundColor: theme.colors.gold,
      borderRadius: 18,
      height: 44,
      justifyContent: "center",
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: theme.isDark ? 0.3 : 0.14,
      shadowRadius: 14,
      width: 44,
    },
    logoText: {
      color: theme.colors.foregroundInverse,
      fontSize: 22,
      fontWeight: "900",
    },
    marketplaceList: {
      gap: 12,
    },
    noticeBody: {
      color: theme.colors.mutedForeground,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
    },
    noticeCard: {
      backgroundColor: theme.colors.accentMuted,
      borderColor: theme.colors.gold,
      borderRadius: theme.radii.card,
      borderWidth: 1,
      padding: 18,
    },
    noticeTitle: {
      color: theme.colors.foreground,
      fontSize: 17,
      fontWeight: "900",
    },
    publicPath: {
      color: theme.colors.gold,
      fontSize: 13,
      fontWeight: "800",
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
      fontSize: 26,
      fontWeight: "900",
      lineHeight: 31,
      marginTop: 8,
    },
    secondaryActionButton: {
      backgroundColor: theme.colors.muted,
      shadowOpacity: 0,
    },
    secondaryActionText: {
      color: theme.colors.foreground,
    },
    shell: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    scrollArea: {
      flex: 1,
    },
    tabBar: {
      backgroundColor: theme.colors.nav,
      borderColor: theme.colors.border,
      borderRadius: 28,
      borderWidth: 1,
      bottom: 28,
      elevation: 20,
      flexDirection: "row",
      height: 86,
      left: 14,
      padding: 8,
      position: "absolute",
      right: 14,
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
      paddingHorizontal: 4,
    },
    tabButtonActive: {
      backgroundColor: theme.colors.goldSoft,
    },
    tabIcon: {
      color: theme.colors.mutedForeground,
      fontSize: 18,
    },
    tabLabel: {
      color: theme.colors.mutedForeground,
      fontSize: 10,
      fontWeight: "800",
    },
    tabLabelActive: {
      color: theme.colors.gold,
    },
  });
