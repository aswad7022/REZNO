import { useEffect, useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { MobileLocale } from "../i18n/labels";
import type {
  HostedPaymentSnapshot,
  HostedPaymentStatus,
} from "../payments/hosted-payment-coordinator";
import { shouldHandleInitialHostedPaymentUrl } from "../payments/hosted-payment-coordinator";
import { hostedPaymentCoordinator } from "../payments/hosted-payment-runtime";
import type { MobileTheme } from "../theme/tokens";

const COPY: Record<
  MobileLocale,
  {
    retry: string;
    status: Record<HostedPaymentStatus, string>;
  }
> = {
  ar: {
    retry: "إعادة المحاولة الآمنة",
    status: {
      BROWSER_CANCELLED:
        "أُغلق متصفح الدفع. لم يُعلن نجاح أو فشل مالي ويمكنك المتابعة لاحقًا.",
      CONFIRMED: "أكد الخادم حالة الدفع بنجاح.",
      DECLINED: "أكد الخادم أن الدفع لم يكتمل.",
      DUPLICATE_LINK: "تم تجاهل رابط دفع مستخدم سابقًا.",
      EXPIRED: "انتهت صلاحية جلسة الدفع. ابدأ محاولة جديدة من الطلب.",
      IDLE: "",
      INVALID_LINK: "تم رفض رابط دفع غير صالح أو غير مطابق.",
      OPENING_BROWSER: "جارٍ فتح صفحة الدفع الآمنة...",
      PENDING_CONFIRMATION:
        "لم تصل حالة نهائية بعد. سيبقى الطلب غير مؤكد حتى يثبت الخادم النتيجة.",
      PREPARING: "جارٍ تجهيز انتقال الدفع الآمن...",
      RETRYABLE: "تعذر التحقق من الخادم الآن. لم يُعلن نجاح الدفع.",
      UNAVAILABLE: "الدفع المستضاف غير مهيأ حاليًا.",
      VERIFYING: "جارٍ التحقق من حالة الدفع الموثوقة لدى الخادم...",
      WAITING_RETURN: "جلسة الدفع بانتظار العودة من المزود.",
    },
  },
  ckb: {
    retry: "هەوڵدانەوەی پارێزراو",
    status: {
      BROWSER_CANCELLED:
        "وێبگەڕی پارەدان داخرا. هیچ سەرکەوتن یان شکستی دارایی ڕانەگەیەنراوە.",
      CONFIRMED: "ڕاژەکار دۆخی پارەدانی پشتڕاست کردەوە.",
      DECLINED: "ڕاژەکار پشتڕاستی کردەوە کە پارەدان تەواو نەبووە.",
      DUPLICATE_LINK: "بەستەری پارەدانی بەکارهاتوو پشتگوێ خرا.",
      EXPIRED: "کاتی دانیشتنی پارەدان بەسەرچوو.",
      IDLE: "",
      INVALID_LINK: "بەستەری پارەدانی نادروست ڕەتکرایەوە.",
      OPENING_BROWSER: "پەڕەی پارەدانی پارێزراو دەکرێتەوە...",
      PENDING_CONFIRMATION:
        "هێشتا دۆخی کۆتایی نییە؛ تەنها ڕاژەکار ئەنجامەکە پشتڕاست دەکاتەوە.",
      PREPARING: "گواستنەوەی پارەدانی پارێزراو ئامادە دەکرێت...",
      RETRYABLE: "ئێستا پشتڕاستکردنەوەی ڕاژەکار سەرکەوتوو نەبوو.",
      UNAVAILABLE: "پارەدانی میوانکراو ئێستا ڕێک نەخراوە.",
      VERIFYING: "دۆخی متمانەپێکراوی ڕاژەکار پشکنین دەکرێت...",
      WAITING_RETURN: "دانیشتنی پارەدان چاوەڕێی گەڕانەوەی دابینکەرە.",
    },
  },
  en: {
    retry: "Retry safely",
    status: {
      BROWSER_CANCELLED:
        "The payment browser closed. No financial success or failure was claimed.",
      CONFIRMED: "The server confirmed the payment status.",
      DECLINED: "The server confirmed that payment did not complete.",
      DUPLICATE_LINK: "A previously consumed payment link was ignored.",
      EXPIRED: "The payment session expired. Start a new attempt from the order.",
      IDLE: "",
      INVALID_LINK: "An invalid or mismatched payment link was rejected.",
      OPENING_BROWSER: "Opening the approved payment page...",
      PENDING_CONFIRMATION:
        "No final status is available yet. The order stays unconfirmed until the server proves the result.",
      PREPARING: "Preparing the secure payment handoff...",
      RETRYABLE: "Server verification is unavailable. Payment was not marked successful.",
      UNAVAILABLE: "Hosted payment is not configured.",
      VERIFYING: "Checking the server-authoritative payment status...",
      WAITING_RETURN: "The payment session is waiting for the provider return.",
    },
  },
};

export function HostedPaymentController({
  locale,
  ownerId,
  theme,
}: {
  locale: MobileLocale;
  ownerId: string | null;
  theme: MobileTheme;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [snapshot, setSnapshot] = useState<HostedPaymentSnapshot | null>(null);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    const unsubscribe = hostedPaymentCoordinator.subscribe(
      ownerId,
      (next) => {
        if (active) setSnapshot(next);
      },
    );
    const urlSubscription = Linking.addEventListener("url", ({ url }) => {
      void hostedPaymentCoordinator.handleUrl(ownerId, url);
    });
    const bootstrap = async () => {
      await hostedPaymentCoordinator.bootstrap(ownerId);
      if (!active) return;
      const initialUrl = await Linking.getInitialURL();
      if (
        active
        && initialUrl
        && shouldHandleInitialHostedPaymentUrl(
          hostedPaymentCoordinator.getSnapshot(ownerId),
        )
      ) {
        await hostedPaymentCoordinator.handleUrl(ownerId, initialUrl);
      }
    };
    void bootstrap();
    return () => {
      active = false;
      unsubscribe();
      urlSubscription.remove();
    };
  }, [ownerId]);

  if (!ownerId || !snapshot || snapshot.status === "IDLE") return null;
  const retryable =
    snapshot.status === "BROWSER_CANCELLED"
    || snapshot.status === "PENDING_CONFIRMATION"
    || snapshot.status === "RETRYABLE"
    || snapshot.status === "WAITING_RETURN";
  const copy = COPY[locale];
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        snapshot.status === "CONFIRMED" && styles.success,
        (snapshot.status === "DECLINED"
          || snapshot.status === "INVALID_LINK") && styles.danger,
      ]}
    >
      <Text style={styles.message}>{copy.status[snapshot.status]}</Text>
      {retryable ? (
        <Pressable
          accessibilityRole="button"
          disabled={snapshot.pending}
          onPress={() => void hostedPaymentCoordinator.retry(ownerId)}
          style={[styles.button, snapshot.pending && styles.disabled]}
        >
          <Text style={styles.buttonText}>{copy.retry}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    banner: {
      backgroundColor: theme.colors.warningSoft,
      borderColor: theme.colors.warning,
      borderRadius: 16,
      borderWidth: 1,
      gap: 8,
      marginHorizontal: 12,
      padding: 12,
    },
    button: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.gold,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    buttonText: {
      color: theme.colors.foregroundInverse,
      fontFamily: "NotoSansArabicUI-SemiBold",
      fontSize: 12,
    },
    danger: {
      backgroundColor: theme.colors.dangerSoft,
      borderColor: theme.colors.danger,
    },
    disabled: {
      opacity: 0.5,
    },
    message: {
      color: theme.colors.foreground,
      fontFamily: "NotoSansArabicUI-Regular",
      fontSize: 13,
      lineHeight: 20,
    },
    success: {
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
    },
  });
}
