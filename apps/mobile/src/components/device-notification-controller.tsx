import * as Notifications from "expo-notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { MobileLocale } from "../i18n/labels";
import {
  mobilePushRegistrationCoordinator,
  subscribeToNativePushTokenChanges,
} from "../notifications/device-registration-runtime";
import type { MobilePushRegistrationState } from "../notifications/device-registration";
import { resolvePushNotificationDestination } from "../notifications/notification-route-policy";
import type { MobileNotificationDestination } from "../screens/customer-notification-center";
import type { MobileTheme } from "../theme/tokens";

const COPY = {
  ar: {
    denied: "الإشعارات متوقفة. يمكنك تفعيلها من إعدادات الجهاز.",
    enable: "تفعيل الإشعارات",
    error: "تعذر تسجيل هذا الجهاز. سنحاول مجددًا بأمان.",
    openSettings: "فتح الإعدادات",
    permission: "فعّل الإشعارات لمتابعة تحديثات حسابك وحجوزاتك.",
    provisional: "الإشعارات الهادئة مفعلة لهذا الجهاز.",
    ready: "الإشعارات مفعلة لهذا الجهاز.",
    registering: "جارٍ تأمين إشعارات هذا الجهاز…",
    retry: "إعادة المحاولة",
  },
  en: {
    denied: "Notifications are off. You can enable them in device settings.",
    enable: "Enable notifications",
    error: "This device could not be registered. You can retry safely.",
    openSettings: "Open settings",
    permission: "Enable notifications for account and booking updates.",
    provisional: "Quiet notifications are enabled for this device.",
    ready: "Notifications are enabled for this device.",
    registering: "Securing notifications for this device…",
    retry: "Retry",
  },
  ckb: {
    denied: "ئاگادارکردنەوەکان ناچالاکن. لە ڕێکخستنەکانی ئامێر چالاکیان بکە.",
    enable: "چالاککردنی ئاگادارکردنەوە",
    error: "تۆمارکردنی ئەم ئامێرە سەرکەوتوو نەبوو. بە پارێزراوی دووبارە هەوڵبدە.",
    openSettings: "کردنەوەی ڕێکخستنەکان",
    permission: "ئاگادارکردنەوە بۆ نوێکاری هەژمار و حجزەکان چالاک بکە.",
    provisional: "ئاگادارکردنەوەی بێدەنگ بۆ ئەم ئامێرە چالاکە.",
    ready: "ئاگادارکردنەوە بۆ ئەم ئامێرە چالاکە.",
    registering: "ئاگادارکردنەوەکانی ئەم ئامێرە پارێزراو دەکرێن…",
    retry: "دووبارە هەوڵبدە",
  },
} as const;

export function DeviceNotificationController({
  locale,
  onOpenDestination,
  ownerId,
  theme,
  visible,
}: {
  locale: MobileLocale;
  onOpenDestination(destination: MobileNotificationDestination): void;
  ownerId: string | null;
  theme: MobileTheme;
  visible: boolean;
}) {
  const [state, setState] = useState<MobilePushRegistrationState>({ kind: "IDLE" });
  const seenResponses = useRef(new Set<string>());
  const styles = useMemo(() => createStyles(theme), [theme]);
  const copy = COPY[locale];

  useEffect(
    () => mobilePushRegistrationCoordinator.subscribe(setState),
    [],
  );
  useEffect(() => {
    if (!ownerId) return;
    void mobilePushRegistrationCoordinator.activate(ownerId);
    return subscribeToNativePushTokenChanges(ownerId);
  }, [ownerId]);
  useEffect(() => {
    if (!ownerId) return;
    const processResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const identifier = response.notification.request.identifier;
      if (seenResponses.current.has(identifier)) return;
      const destination = resolvePushNotificationDestination(
        response.notification.request.content.data,
      );
      seenResponses.current.add(identifier);
      if (destination) onOpenDestination(destination);
    };
    void Notifications.getLastNotificationResponseAsync().then(processResponse);
    const subscription = Notifications.addNotificationResponseReceivedListener(
      processResponse,
    );
    return () => subscription.remove();
  }, [onOpenDestination, ownerId]);

  if (!ownerId || !visible || state.kind === "IDLE") return null;
  const message = state.kind === "PERMISSION_REQUIRED"
    ? copy.permission
    : state.kind === "PERMISSION_DENIED"
      ? copy.denied
      : state.kind === "REGISTERED"
        ? state.permission === "PROVISIONAL" ? copy.provisional : copy.ready
        : state.kind === "UNAVAILABLE"
          ? copy.error
          : copy.registering;
  const action = state.kind === "PERMISSION_REQUIRED"
    ? copy.enable
    : state.kind === "PERMISSION_DENIED"
      ? (state.revocationPending ? copy.retry : copy.openSettings)
      : state.kind === "UNAVAILABLE"
        ? copy.retry
        : null;
  return (
    <View accessibilityLiveRegion="polite" style={styles.panel}>
      <Text style={styles.message}>{message}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (state.kind === "PERMISSION_REQUIRED") {
              void mobilePushRegistrationCoordinator.requestPermission(ownerId);
            } else if (state.kind === "PERMISSION_DENIED" && !state.revocationPending) {
              void Linking.openSettings();
            } else {
              void mobilePushRegistrationCoordinator.activate(ownerId);
            }
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    button: {
      backgroundColor: theme.colors.accent,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    buttonText: {
      color: theme.colors.foregroundInverse,
      fontSize: 13,
      fontWeight: "700",
    },
    message: {
      color: theme.colors.foreground,
      flex: 1,
      fontSize: 13,
      lineHeight: 20,
    },
    panel: {
      alignItems: "center",
      backgroundColor: theme.colors.cardElevated,
      borderColor: theme.colors.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 14,
    },
  });
}
