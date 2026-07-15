import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  fetchMobileBookingReview,
  submitMobileBookingReview,
} from "../api/bookings";
import { MobileApiRequestError } from "../api/client";
import type { MobileLocale } from "../i18n/labels";
import type { MobileTheme } from "../theme/tokens";
import type { MobileBookingReviewState } from "../types/bookings";
import {
  createMobileReviewSubmissionGate,
  mobileReviewFailure,
  reviewStateFromAuthoritative,
  type MobileReviewUiState,
} from "./state";

const COPY = {
  ar: {
    rate: "قيّم هذه الخدمة",
    loading: "جارٍ التحقق من أهلية التقييم…",
    comment: "تعليق اختياري",
    submit: "إرسال التقييم",
    submitting: "جارٍ الحفظ…",
    retry: "إعادة المحاولة",
    ineligible: "هذا الحجز غير مؤهل للتقييم.",
    saved: "تم حفظ تقييمك وتحديثه من الخادم.",
    replayed: "تم تأكيد التقييم السابق بأمان.",
    conflict: "يوجد تقييم مختلف محفوظ لهذا الحجز.",
    invalid: "اختر من 1 إلى 5 نجوم واكتب تعليقًا صالحًا.",
    hidden: "هذا التقييم مخفي حاليًا عن الجمهور.",
    response: "رد النشاط",
  },
  en: {
    rate: "Rate this service",
    loading: "Checking review eligibility…",
    comment: "Optional comment",
    submit: "Submit review",
    submitting: "Saving…",
    retry: "Retry",
    ineligible: "This booking is not eligible for a review.",
    saved: "Your review was saved and refreshed from the server.",
    replayed: "The existing review was safely confirmed.",
    conflict: "A different review is already saved for this booking.",
    invalid: "Choose 1–5 stars and enter a valid comment.",
    hidden: "This review is currently hidden from public surfaces.",
    response: "Business response",
  },
  ckb: {
    rate: "ئەم خزمەتگوزارییە هەڵبسەنگێنە",
    loading: "شیاوی هەڵسەنگاندن پشکنین دەکرێت…",
    comment: "سەرنجی ئارەزوومەندانە",
    submit: "ناردنی هەڵسەنگاندن",
    submitting: "پاشەکەوت دەکرێت…",
    retry: "دووبارە هەوڵدانەوە",
    ineligible: "ئەم حجزە شیاوی هەڵسەنگاندن نییە.",
    saved: "هەڵسەنگاندنەکەت پاشەکەوت و لە ڕاژەکارەوە نوێکرایەوە.",
    replayed: "هەڵسەنگاندنی پێشوو بە سەلامەتی پشتڕاستکرایەوە.",
    conflict: "هەڵسەنگاندنێکی جیاواز پێشتر پاشەکەوت کراوە.",
    invalid: "لە 1 تا 5 ئەستێرە هەڵبژێرە و سەرنجێکی دروست بنووسە.",
    hidden: "ئەم هەڵسەنگاندنە ئێستا لە خەڵک شاراوەتەوە.",
    response: "وەڵامی بازرگانی",
  },
} as const;

export function CustomerReviewPanel({
  bookingId,
  initialState,
  locale,
  onSessionExpired,
  onReviewPersisted,
  theme,
}: {
  bookingId: string;
  initialState: MobileBookingReviewState | null;
  locale: MobileLocale;
  onSessionExpired: () => void;
  onReviewPersisted: () => Promise<void>;
  theme: MobileTheme;
}) {
  const copy = COPY[locale];
  const styles = createStyles(theme);
  const [open, setOpen] = useState(Boolean(initialState?.review));
  const [uiState, setUiState] = useState<MobileReviewUiState>(
    initialState ? reviewStateFromAuthoritative(initialState) : { status: "idle" },
  );
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const gate = useRef(createMobileReviewSubmissionGate()).current;

  const load = async () => {
    setOpen(true);
    setUiState({ status: "loading" });
    try {
      const response = await fetchMobileBookingReview(bookingId);
      setUiState(reviewStateFromAuthoritative(response.data));
    } catch (error) {
      handleError(error);
    }
  };

  const handleError = (error: unknown) => {
    const apiError = error instanceof MobileApiRequestError ? error : null;
    const failure = mobileReviewFailure(apiError?.code);
    if (failure.sessionExpired) {
      setUiState({ status: "session-expired" });
      onSessionExpired();
      return;
    }
    setUiState({
      status: "error",
      message: failure.conflict
        ? copy.conflict
        : failure.validation
          ? copy.invalid
          : apiError?.message ?? copy.retry,
    });
  };

  const submit = async () => {
    if (rating < 1 || rating > 5 || comment.trim().length > 1000 || !gate.tryBegin()) {
      if (rating < 1 || rating > 5 || comment.trim().length > 1000) {
        setUiState({ status: "error", message: copy.invalid });
      }
      return;
    }
    const current = uiState.status === "eligible" ? uiState.data : null;
    if (!current) {
      gate.finish();
      return;
    }
    setUiState({ status: "submitting", data: current });
    try {
      const result = await submitMobileBookingReview(bookingId, {
        rating,
        comment: comment.trim() || null,
      });
      const authoritative = await fetchMobileBookingReview(bookingId);
      setUiState({
        status: "success",
        data: authoritative.data,
        replayed: result.data.replayed,
      });
      await onReviewPersisted();
    } catch (error) {
      handleError(error);
    } finally {
      gate.finish();
    }
  };

  if (!open) {
    return <Action label={copy.rate} onPress={() => void load()} styles={styles} />;
  }
  if (uiState.status === "loading") return <Text style={styles.body}>{copy.loading}</Text>;
  if (uiState.status === "error") {
    return (
      <View style={styles.card}>
        <Text style={styles.error}>{uiState.message}</Text>
        <Action label={copy.retry} onPress={() => void load()} styles={styles} />
      </View>
    );
  }
  if (uiState.status === "session-expired") return null;
  if (uiState.status === "ineligible") return <Text style={styles.body}>{copy.ineligible}</Text>;

  const data = "data" in uiState ? uiState.data : null;
  if (data?.review) {
    return (
      <View style={styles.card}>
        <Text style={styles.rating}>{"★".repeat(data.review.rating)} {data.review.rating}/5</Text>
        {data.review.comment ? <Text style={styles.body}>{data.review.comment}</Text> : null}
        {data.review.status !== "VISIBLE" ? <Text style={styles.error}>{copy.hidden}</Text> : null}
        {data.review.businessReply ? (
          <View style={styles.reply}>
            <Text style={styles.label}>{copy.response}</Text>
            <Text style={styles.body}>{data.review.businessReply}</Text>
          </View>
        ) : null}
        {uiState.status === "success" ? (
          <Text style={styles.success}>{uiState.replayed ? copy.replayed : copy.saved}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable
            key={value}
            accessibilityLabel={`${value} of 5`}
            accessibilityRole="button"
            onPress={() => setRating(value)}
            style={styles.starButton}
          >
            <Text style={[styles.star, value <= rating && styles.selectedStar]}>★</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel={copy.comment}
        maxLength={1000}
        multiline
        onChangeText={setComment}
        placeholder={copy.comment}
        placeholderTextColor={theme.colors.mutedForeground}
        style={styles.input}
        value={comment}
      />
      <Action
        disabled={uiState.status === "submitting"}
        label={uiState.status === "submitting" ? copy.submitting : copy.submit}
        onPress={() => void submit()}
        styles={styles}
      />
    </View>
  );
}

function Action({ disabled = false, label, onPress, styles }: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    card: { backgroundColor: theme.colors.muted, borderRadius: 18, gap: 10, padding: 14 },
    body: { color: theme.colors.mutedForeground, fontSize: 14, lineHeight: 22 },
    error: { color: theme.colors.danger, fontSize: 13 },
    success: { color: theme.colors.success, fontSize: 13, fontWeight: "700" },
    label: { color: theme.colors.foreground, fontSize: 12, fontWeight: "700" },
    rating: { color: theme.colors.foreground, fontSize: 18, fontWeight: "800" },
    reply: { borderColor: theme.colors.border, borderRadius: 12, borderWidth: 1, gap: 4, padding: 10 },
    stars: { flexDirection: "row", gap: 4 },
    starButton: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
    star: { color: theme.colors.border, fontSize: 30 },
    selectedStar: { color: theme.colors.warning },
    input: { borderColor: theme.colors.border, borderRadius: 12, borderWidth: 1, color: theme.colors.foreground, minHeight: 90, padding: 12, textAlignVertical: "top" },
    action: { alignItems: "center", backgroundColor: theme.colors.accent, borderRadius: 14, justifyContent: "center", minHeight: 46, paddingHorizontal: 16 },
    actionText: { color: theme.colors.foregroundInverse, fontSize: 14, fontWeight: "700" },
    disabled: { opacity: 0.5 },
  });
}
