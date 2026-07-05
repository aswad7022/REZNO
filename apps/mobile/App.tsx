import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import {
  I18nManager,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

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

I18nManager.allowRTL(true);

export default function App() {
  const [locale, setLocale] = useState<MobileLocale>(DEFAULT_LOCALE);
  const [activeTab, setActiveTab] = useState<MobileTabId>("customerHome");
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

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
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
      >
        <View style={styles.noticeCard}>
          <Text style={[styles.noticeTitle, isRtl && styles.rtlText]}>
            {text.nativeFoundation}
          </Text>
          <Text style={[styles.noticeBody, isRtl && styles.rtlText]}>
            {text.nativeFoundationBody}
          </Text>
        </View>

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
              onPress={() => setActiveTab(tab.id)}
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

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  logoMark: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 18,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
  },
  brandName: {
    color: "#0f172a",
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  brandTagline: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 2,
  },
  localeRow: {
    flexDirection: "row",
    gap: 8,
  },
  localeButton: {
    borderColor: "#dbe4ef",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  localeButtonActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  localeButtonText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  localeButtonTextActive: {
    color: "#ffffff",
  },
  content: {
    gap: 14,
    paddingBottom: 104,
    paddingHorizontal: 20,
  },
  noticeCard: {
    backgroundColor: "#ecfeff",
    borderColor: "#bae6fd",
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  noticeTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
  },
  noticeBody: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  screenCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
    shadowColor: "#0f172a",
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  screenEyebrow: {
    color: "#7c3aed",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  screenTitle: {
    color: "#0f172a",
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 31,
    marginTop: 8,
  },
  screenDescription: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
  },
  actionStack: {
    gap: 10,
    marginTop: 20,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 18,
    paddingVertical: 14,
  },
  secondaryActionButton: {
    backgroundColor: "#f1f5f9",
  },
  disabledActionButton: {
    backgroundColor: "#e2e8f0",
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryActionText: {
    color: "#111827",
  },
  disabledActionText: {
    color: "#64748b",
  },
  integrationCard: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  integrationTitle: {
    color: "#9a3412",
    fontSize: 16,
    fontWeight: "900",
  },
  integrationBody: {
    color: "#9a3412",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  apiText: {
    color: "#7c2d12",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 12,
  },
  tabBar: {
    backgroundColor: "#ffffff",
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    gap: 4,
    left: 0,
    paddingBottom: 12,
    paddingHorizontal: 8,
    paddingTop: 10,
    position: "absolute",
    right: 0,
  },
  tabButton: {
    alignItems: "center",
    borderRadius: 18,
    flex: 1,
    gap: 3,
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabButtonActive: {
    backgroundColor: "#eef2ff",
  },
  tabIcon: {
    fontSize: 18,
  },
  tabLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
  },
  tabLabelActive: {
    color: "#4338ca",
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl",
  },
});
