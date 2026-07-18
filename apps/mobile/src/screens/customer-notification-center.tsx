import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { MobileApiRequestError } from "../api/client";
import { notificationApi } from "../api/notifications";
import type { MobileLocale } from "../i18n/labels";
import {
  mergeNotificationPage,
  reconcileMarkAllRead,
  reconcileNotificationState,
  type MobileNotificationInboxFilter,
} from "../notifications/notification-filter-state";
import type { MobileTheme } from "../theme/tokens";
import type {
  MobileNotificationDestinationKind,
  MobileNotificationInbox,
  MobileNotificationItem,
  MobileNotificationPreferences,
  MobileOutboundChannel,
  MobileOutboundPreferences,
} from "../types/notifications";

export type MobileNotificationDestination = {
  kind: MobileNotificationDestinationKind;
  targetId: string | null;
};

export function CustomerNotificationCenter({ locale, onOpenDestination, theme }: {
  locale: MobileLocale;
  onOpenDestination: (destination: MobileNotificationDestination) => void;
  theme: MobileTheme;
}) {
  const copy = COPY[locale];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [filter, setFilter] = useState<MobileNotificationInboxFilter>("all");
  const [inbox, setInbox] = useState<MobileNotificationInbox | null>(null);
  const [preferences, setPreferences] = useState<MobileNotificationPreferences | null>(null);
  const [outboundPreferences, setOutboundPreferences] = useState<MobileOutboundPreferences | null>(null);
  const [status, setStatus] = useState<"error" | "loading" | "ready" | "unauthenticated">("loading");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async (nextFilter: MobileNotificationInboxFilter, cursor?: string, append = false) => {
    const requestId = ++requestSequence.current;
    setStatus("loading");
    try {
      const [result, nextPreferences, nextOutboundPreferences] = await Promise.all([
        notificationApi.list({ cursor, filter: nextFilter }),
        preferences ? Promise.resolve(preferences) : notificationApi.preferences(),
        outboundPreferences ? Promise.resolve(outboundPreferences) : notificationApi.outboundPreferences(),
      ]);
      if (requestSequence.current !== requestId) return;
      setInbox((current) => append && current ? mergeNotificationPage(current, result, nextFilter) : result);
      setPreferences(nextPreferences);
      setOutboundPreferences(nextOutboundPreferences);
      setStatus("ready");
    } catch (error) {
      if (requestSequence.current !== requestId) return;
      setStatus(error instanceof MobileApiRequestError && error.status === 401 ? "unauthenticated" : "error");
    }
  }, [outboundPreferences, preferences]);

  useEffect(() => {
    const timer = setTimeout(() => void load(filter), 0);
    return () => { clearTimeout(timer); requestSequence.current += 1; };
  }, [filter, load]);

  async function updateState(item: MobileNotificationItem, action: "ARCHIVE" | "MARK_READ" | "MARK_UNREAD" | "RESTORE") {
    if (pendingId) return;
    setPendingId(item.id);
    try {
      const result = await notificationApi.updateState(item, action, randomUUID());
      setInbox((current) => current ? reconcileNotificationState(current, filter, item.id, result) : current);
      await load(filter);
    } catch {
      await load(filter);
    } finally {
      setPendingId(null);
    }
  }

  async function openNotification(item: MobileNotificationItem) {
    if (!item.read) await updateState(item, "MARK_READ");
    onOpenDestination({ kind: item.destination.kind, targetId: item.destination.targetId });
  }

  async function markAllRead() {
    if (!inbox || inbox.unreadCount === 0) return;
    try {
      const result = await notificationApi.markAllRead(inbox.inboxVersion, inbox.snapshot, randomUUID());
      setInbox(reconcileMarkAllRead(inbox, filter, result));
      await load(filter);
    } catch { await load(filter); }
  }

  async function togglePreference(key: keyof Omit<MobileNotificationPreferences, "version">) {
    if (!preferences) return;
    const values = { ...preferences, [key]: !preferences[key] };
    try {
      const result = await notificationApi.updatePreferences({
        adminAnnouncementsEnabled: values.adminAnnouncementsEnabled,
        bookingsEnabled: values.bookingsEnabled,
        commerceEnabled: values.commerceEnabled,
        messagesEnabled: values.messagesEnabled,
        restaurantEnabled: values.restaurantEnabled,
      }, preferences.version, randomUUID());
      setPreferences(result);
      await load(filter);
    } catch { await load(filter); }
  }

  async function toggleOutboundPreference(channel: MobileOutboundChannel, category: keyof typeof copy.categories) {
    if (!outboundPreferences) return;
    const selected = new Set(outboundPreferences.categories[channel]);
    if (selected.has(category)) selected.delete(category);
    else selected.add(category);
    const categories = {
      ...outboundPreferences.categories,
      [channel]: Object.keys(copy.categories).filter((item) => selected.has(item as keyof typeof copy.categories)),
    } as MobileOutboundPreferences["categories"];
    try {
      const result = await notificationApi.updateOutboundPreferences(categories, outboundPreferences.version, randomUUID());
      setOutboundPreferences(result);
    } catch { await load(filter); }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
          <Text style={styles.title}>{copy.title}</Text>
        </View>
        <View style={styles.count}><Text style={styles.countText}>{inbox?.unreadCount ?? 0}</Text></View>
      </View>
      <View style={styles.filters}>
        {(["all", "unread", "read", "important", "archived"] as const).map((value) => (
          <Pressable accessibilityRole="button" key={value} onPress={() => setFilter(value)}
            style={[styles.filter, filter === value && styles.filterActive]}>
            <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{copy.filters[value]}</Text>
          </Pressable>
        ))}
      </View>
      {status === "loading" && !inbox ? <ActivityIndicator color={theme.colors.accent} /> : null}
      {status === "error" || status === "unauthenticated" ? (
        <Pressable accessibilityRole="button" onPress={() => void load(filter)} style={styles.empty}>
          <Text style={styles.itemTitle}>{status === "unauthenticated" ? copy.signIn : copy.error}</Text>
          <Text style={styles.body}>{copy.retry}</Text>
        </Pressable>
      ) : null}
      {status === "ready" && inbox?.data.length === 0 ? <Text style={styles.empty}>{copy.empty}</Text> : null}
      {inbox?.data.map((item) => (
        <View key={item.id} style={[styles.item, !item.read && styles.itemUnread]}>
          <Pressable accessibilityRole="button" onPress={() => void openNotification(item)} style={styles.itemMain}>
            <View style={styles.itemMeta}>
              <Text style={styles.category}>{copy.categories[item.category]}</Text>
              <Text style={styles.time}>{new Date(item.createdAt).toLocaleDateString(locale === "ckb" ? "ckb-IQ" : locale)}</Text>
            </View>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable disabled={pendingId === item.id} onPress={() => void updateState(item, item.read ? "MARK_UNREAD" : "MARK_READ")}>
              <Text style={styles.action}>{item.read ? copy.unread : copy.read}</Text>
            </Pressable>
            <Pressable disabled={pendingId === item.id} onPress={() => void updateState(item, item.archived ? "RESTORE" : "ARCHIVE")}>
              <Text style={styles.action}>{item.archived ? copy.restore : copy.archive}</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {inbox?.pageInfo.hasNextPage && inbox.pageInfo.nextCursor ? (
        <Pressable accessibilityRole="button" onPress={() => void load(filter, inbox.pageInfo.nextCursor ?? undefined, true)} style={styles.more}>
          <Text style={styles.moreText}>{copy.more}</Text>
        </Pressable>
      ) : null}
      {inbox && inbox.unreadCount > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => void markAllRead()} style={styles.more}>
          <Text style={styles.moreText}>{copy.markAll}</Text>
        </Pressable>
      ) : null}
      {preferences ? (
        <View style={styles.preferences}>
          <Text style={styles.title}>{copy.preferences}</Text>
          {([
            ["bookingsEnabled", "BOOKINGS"], ["restaurantEnabled", "RESTAURANT"], ["commerceEnabled", "COMMERCE"],
            ["messagesEnabled", "MESSAGES"], ["adminAnnouncementsEnabled", "ADMIN_ANNOUNCEMENT"],
          ] as const).map(([key, category]) => (
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: preferences[key] }} key={key}
              onPress={() => void togglePreference(key)} style={styles.preferenceRow}>
              <Text style={styles.body}>{copy.categories[category]}</Text>
              <View style={[styles.toggle, preferences[key] && styles.toggleActive]}><View style={[styles.knob, preferences[key] && styles.knobActive]} /></View>
            </Pressable>
          ))}
          <Text style={styles.note}>{copy.mandatory}</Text>
        </View>
      ) : null}
      {outboundPreferences ? (
        <View style={styles.preferences}>
          <Text style={styles.title}>{copy.outboundPreferences}</Text>
          <Text style={styles.note}>{copy.outboundHelp}</Text>
          {(["EMAIL", "SMS", "PUSH"] as const).map((channel) => (
            <View key={channel} style={styles.outboundGroup}>
              <Text style={styles.itemTitle}>{channel}</Text>
              <Text style={styles.note}>{outboundPreferences.endpoints[channel].eligible ? copy.endpointAvailable : outboundPreferences.endpoints[channel].reason}</Text>
              {(Object.keys(copy.categories) as Array<keyof typeof copy.categories>).map((category) => {
                const checked = outboundPreferences.categories[channel].includes(category);
                return (
                  <Pressable accessibilityRole="switch" accessibilityState={{ checked }} key={`${channel}:${category}`}
                    onPress={() => void toggleOutboundPreference(channel, category)} style={styles.preferenceRow}>
                    <Text style={styles.body}>{copy.categories[category]}</Text>
                    <View style={[styles.toggle, checked && styles.toggleActive]}><View style={[styles.knob, checked && styles.knobActive]} /></View>
                  </Pressable>
                );
              })}
            </View>
          ))}
          <Text style={styles.note}>{copy.outboundMandatory}</Text>
        </View>
      ) : null}
    </View>
  );
}

const COPY = {
  ar: { action: "", archive: "أرشفة", categories: { ACCOUNT: "الحساب", ADMIN_ANNOUNCEMENT: "إعلانات المنصة", BOOKINGS: "الحجوزات", COMMERCE: "التجارة", MESSAGES: "الرسائل", RESTAURANT: "المطاعم" }, empty: "لا توجد إشعارات ضمن هذا المرشح.", endpointAvailable: "نقطة اتصال موثقة متاحة", error: "تعذر تحميل الإشعارات.", eyebrow: "مركز موحد وآمن", filters: { all: "الكل", archived: "المؤرشف", important: "المهم", read: "مقروء", unread: "غير مقروء" }, mandatory: "تظل إشعارات الأمان وحالات الطلب الإلزامية مفعّلة.", markAll: "تحديد الكل كمقروء", more: "تحميل المزيد", outboundHelp: "التسليم الاختياري يحتاج موافقة صريحة ونقطة اتصال موثقة.", outboundMandatory: "أحداث الحساب الإلزامية تتجاوز التفضيل فقط؛ ولا تتجاوز التحقق أو توفر المزوّد.", outboundPreferences: "تفضيلات القنوات الخارجية", preferences: "التفضيلات", read: "مقروء", restore: "استعادة", retry: "إعادة المحاولة", signIn: "سجّل الدخول لعرض إشعاراتك.", title: "الإشعارات", unread: "غير مقروء" },
  ckb: { action: "", archive: "ئەرشیف", categories: { ACCOUNT: "هەژمار", ADMIN_ANNOUNCEMENT: "ڕاگەیاندن", BOOKINGS: "حجزەکان", COMMERCE: "بازرگانی", MESSAGES: "پەیامەکان", RESTAURANT: "چێشتخانە" }, empty: "هیچ ئاگادارکردنەوەیەک نییە.", endpointAvailable: "خاڵی پەیوەندی پشتڕاستکراو هەیە", error: "بارکردن سەرکەوتوو نەبوو.", eyebrow: "ناوەندی یەکگرتوو", filters: { all: "هەموو", archived: "ئەرشیف", important: "گرنگ", read: "خوێندراوە", unread: "نەخوێندراوە" }, mandatory: "ئاگادارکردنەوە پێویستەکان چالاک دەمێنن.", markAll: "هەمووی خوێندراوە", more: "زیاتر", outboundHelp: "ناردنی ئارەزوومەندانە پێویستی بە ڕەزامەندی و خاڵی پشتڕاستکراو هەیە.", outboundMandatory: "ڕووداوە پێویستەکانی هەژمار تەنها هەڵبژاردە تێدەپەڕێنن.", outboundPreferences: "هەڵبژاردەکانی کەناڵە دەرەکییەکان", preferences: "هەڵبژاردەکان", read: "خوێندراوە", restore: "گەڕاندنەوە", retry: "دووبارە", signIn: "بچۆرە ژوورەوە.", title: "ئاگادارکردنەوەکان", unread: "نەخوێندراوە" },
  en: { action: "", archive: "Archive", categories: { ACCOUNT: "Account", ADMIN_ANNOUNCEMENT: "Platform", BOOKINGS: "Bookings", COMMERCE: "Commerce", MESSAGES: "Messages", RESTAURANT: "Restaurant" }, empty: "No notifications match this filter.", endpointAvailable: "Verified endpoint available", error: "Notifications could not be loaded.", eyebrow: "Unified and safe", filters: { all: "All", archived: "Archived", important: "Important", read: "Read", unread: "Unread" }, mandatory: "Mandatory security and order-state notifications remain enabled.", markAll: "Mark all read", more: "Load more", outboundHelp: "Optional delivery requires explicit opt-in and a verified endpoint.", outboundMandatory: "Mandatory Account events bypass preference only; verification and provider availability still apply.", outboundPreferences: "Outbound channel preferences", preferences: "Preferences", read: "Read", restore: "Restore", retry: "Retry", signIn: "Sign in to view your notifications.", title: "Notifications", unread: "Unread" },
} as const;

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    action: { color: theme.colors.accent, fontSize: 12, fontWeight: "700" },
    actions: { borderTopColor: theme.colors.border, borderTopWidth: 1, flexDirection: "row", gap: 20, paddingTop: 10 },
    body: { color: theme.colors.mutedForeground, fontSize: 13, lineHeight: 20 },
    category: { color: theme.colors.accent, fontSize: 11, fontWeight: "700" },
    count: { alignItems: "center", backgroundColor: theme.colors.accent, borderRadius: 999, justifyContent: "center", minHeight: 34, minWidth: 34 },
    countText: { color: theme.colors.foregroundInverse, fontWeight: "800" },
    empty: { color: theme.colors.mutedForeground, padding: 24, textAlign: "center" },
    eyebrow: { color: theme.colors.accent, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
    filter: { borderColor: theme.colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
    filterActive: { backgroundColor: theme.colors.accent },
    filterText: { color: theme.colors.mutedForeground, fontSize: 12 },
    filterTextActive: { color: theme.colors.foregroundInverse, fontWeight: "700" },
    filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    headingCopy: { flex: 1 }, headingRow: { alignItems: "center", flexDirection: "row", gap: 12 },
    item: { backgroundColor: theme.colors.cardElevated, borderColor: theme.colors.border, borderRadius: 20, borderWidth: 1, gap: 10, padding: 16 },
    itemMain: { gap: 6 }, itemMeta: { flexDirection: "row", justifyContent: "space-between" },
    itemTitle: { color: theme.colors.foreground, fontSize: 15, fontWeight: "700" },
    itemUnread: { borderColor: theme.colors.accent },
    knob: { backgroundColor: theme.colors.mutedForeground, borderRadius: 999, height: 18, width: 18 },
    knobActive: { alignSelf: "flex-end", backgroundColor: theme.colors.foregroundInverse },
    more: { alignItems: "center", borderColor: theme.colors.accent, borderRadius: 16, borderWidth: 1, padding: 13 },
    moreText: { color: theme.colors.accent, fontWeight: "700" },
    note: { color: theme.colors.mutedForeground, fontSize: 11, lineHeight: 17 },
    outboundGroup: { borderColor: theme.colors.border, borderRadius: 16, borderWidth: 1, gap: 2, padding: 12 },
    panel: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 28, borderWidth: 1, gap: 14, padding: 18 },
    preferenceRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
    preferences: { borderTopColor: theme.colors.border, borderTopWidth: 1, gap: 4, paddingTop: 16 },
    time: { color: theme.colors.mutedForeground, fontSize: 10 },
    title: { color: theme.colors.foreground, fontSize: 20, fontWeight: "800" },
    toggle: { backgroundColor: theme.colors.muted, borderRadius: 999, padding: 3, width: 42 },
    toggleActive: { backgroundColor: theme.colors.accent },
  });
}
