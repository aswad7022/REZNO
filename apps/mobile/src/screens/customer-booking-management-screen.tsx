import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  cancelMobileBooking,
  fetchMobileBookingDetail,
  fetchMobileBookingRescheduleOptions,
  fetchMobileManagedBookings,
  requestMobileBookingChange,
} from "../api/bookings";
import { MobileApiRequestError } from "../api/client";
import {
  createMobileBookingSubmissionGate,
  mergeMobileBookingPage,
  mobileBookingManagementFailure,
  nextBookingDates,
} from "../bookings/state";
import type { MobileLocale } from "../i18n/labels";
import type { MobileTheme } from "../theme/tokens";
import type {
  MobileBookingAvailability,
  MobileBookingManagementPage,
  MobileBookingManagementTab,
  MobileManagedBooking,
  MobileManagedBookingDetail,
} from "../types/bookings";

type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "session-expired" };

const TABS: Array<{ id: MobileBookingManagementTab; ar: string; en: string; ckb: string }> = [
  { id: "all", ar: "الكل", en: "All", ckb: "هەموو" },
  { id: "upcoming", ar: "القادمة", en: "Upcoming", ckb: "داهاتوو" },
  { id: "completed", ar: "المكتملة", en: "Completed", ckb: "تەواوبوو" },
  { id: "cancelled", ar: "الملغاة", en: "Cancelled", ckb: "هەڵوەشاوە" },
];

const COPY = {
  ar: {
    title: "حجوزاتي",
    subtitle: "حجوزاتك الحقيقية المحفوظة",
    loading: "جارٍ تحميل الحجوزات…",
    empty: "لا توجد حجوزات في هذا القسم.",
    retry: "إعادة المحاولة",
    refresh: "تحديث",
    signIn: "تسجيل الدخول",
    session: "انتهت الجلسة. سجّل الدخول للمتابعة.",
    more: "تحميل المزيد",
    details: "عرض التفاصيل",
    back: "العودة للحجوزات",
    cancel: "إلغاء الحجز",
    confirmCancel: "تأكيد الإلغاء",
    keep: "الاحتفاظ بالحجز",
    requestChange: "طلب تغيير الموعد",
    chooseDate: "اختر التاريخ الجديد",
    chooseTime: "اختر الوقت الجديد",
    submitChange: "إرسال الطلب للنشاط",
    noSlots: "لا توجد مواعيد متاحة في هذا اليوم.",
    operationPending: "جارٍ حفظ التغيير…",
    replayed: "تم تأكيد العملية السابقة بأمان.",
    persisted: "تم حفظ العملية وتحديث بيانات الحجز.",
    conflict: "تغيّرت حالة الحجز. تم تحديث البيانات؛ راجعها وحاول مجدداً.",
    pending: "طلب التغيير بانتظار النشاط",
    accepted: "وافق النشاط على طلب التغيير",
    rejected: "رفض النشاط طلب التغيير",
    cancelledRequest: "أُلغي طلب التغيير",
    businessProposal: "النشاط اقترح موعداً جديداً؛ راجعه من موقع الويب.",
  },
  en: {
    title: "My bookings",
    subtitle: "Your persisted service bookings",
    loading: "Loading bookings…",
    empty: "No bookings in this section.",
    retry: "Retry",
    refresh: "Refresh",
    signIn: "Sign in",
    session: "Your session expired. Sign in to continue.",
    more: "Load more",
    details: "View details",
    back: "Back to bookings",
    cancel: "Cancel booking",
    confirmCancel: "Confirm cancellation",
    keep: "Keep booking",
    requestChange: "Request a new time",
    chooseDate: "Choose a new date",
    chooseTime: "Choose a new time",
    submitChange: "Send request to business",
    noSlots: "No available times on this date.",
    operationPending: "Saving change…",
    replayed: "The previous operation was safely confirmed.",
    persisted: "The operation was saved and booking data refreshed.",
    conflict: "The booking changed. Data was refreshed; review it and retry.",
    pending: "Change request is waiting for the business",
    accepted: "The business accepted the change request",
    rejected: "The business rejected the change request",
    cancelledRequest: "The change request was cancelled",
    businessProposal: "The business proposed a new time; review it on the web.",
  },
  ckb: {
    title: "حجزەکانم",
    subtitle: "حجزە پاشەکەوتکراوە ڕاستەقینەکانت",
    loading: "حجزەکان بار دەکرێن…",
    empty: "هیچ حجزێک لەم بەشەدا نییە.",
    retry: "دووبارە هەوڵدانەوە",
    refresh: "نوێکردنەوە",
    signIn: "چوونەژوورەوە",
    session: "دانیشتنەکەت کۆتایی هات. دووبارە بچۆ ژوورەوە.",
    more: "زیاتر بار بکە",
    details: "وردەکارییەکان",
    back: "گەڕانەوە بۆ حجزەکان",
    cancel: "هەڵوەشاندنەوەی حجز",
    confirmCancel: "پشتڕاستکردنەوەی هەڵوەشاندنەوە",
    keep: "حجزەکە بهێڵەوە",
    requestChange: "داوای گۆڕینی کات",
    chooseDate: "بەرواری نوێ هەڵبژێرە",
    chooseTime: "کاتی نوێ هەڵبژێرە",
    submitChange: "داواکاری بۆ چالاکی بنێرە",
    noSlots: "هیچ کاتێک لەم ڕۆژەدا بەردەست نییە.",
    operationPending: "گۆڕانکاری پاشەکەوت دەکرێت…",
    replayed: "کردارە پێشوەکە بە سەلامەتی پشتڕاستکرایەوە.",
    persisted: "کردارەکە پاشەکەوت و زانیارییەکان نوێکرانەوە.",
    conflict: "دۆخی حجزەکە گۆڕاوە. زانیارییەکان نوێکرانەوە.",
    pending: "داواکاری گۆڕانکاری چاوەڕوانی چالاکییە",
    accepted: "چالاکی داواکارییەکەی پەسەند کرد",
    rejected: "چالاکی داواکارییەکەی ڕەت کردەوە",
    cancelledRequest: "داواکاری گۆڕانکاری هەڵوەشایەوە",
    businessProposal: "چالاکی کاتێکی نوێی پێشنیار کردووە؛ لە وێب بیبینە.",
  },
} as const;

export function CustomerBookingManagementScreen({
  isAuthenticated,
  isRtl,
  locale,
  onSignIn,
  theme,
}: {
  isAuthenticated: boolean;
  isRtl: boolean;
  locale: MobileLocale;
  onSignIn: () => void;
  theme: MobileTheme;
}) {
  const copy = COPY[locale];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [tab, setTab] = useState<MobileBookingManagementTab>("all");
  const [items, setItems] = useState<MobileManagedBooking[]>([]);
  const [counts, setCounts] = useState<MobileBookingManagementPage["counts"]>({
    all: 0,
    upcoming: 0,
    completed: 0,
    cancelled: 0,
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listState, setListState] = useState<RequestState>({ status: "loading" });
  const [selected, setSelected] = useState<MobileManagedBookingDetail | null>(null);
  const [detailState, setDetailState] = useState<RequestState>({ status: "idle" });
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availability, setAvailability] = useState<MobileBookingAvailability | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<MobileBookingAvailability["slots"][number] | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [operationPending, setOperationPending] = useState(false);
  const requestSequence = useRef(0);
  const mutationGate = useRef(createMobileBookingSubmissionGate()).current;
  const cancellationKey = useRef(randomUUID());
  const changeKey = useRef(randomUUID());

  const handleRequestError = useCallback((error: unknown): RequestState => {
    const apiError = error instanceof MobileApiRequestError ? error : null;
    const recovery = mobileBookingManagementFailure(apiError?.code);
    if (recovery.sessionExpired) return { status: "session-expired" };
    return {
      status: "error",
      message: apiError?.message ?? (error instanceof Error ? error.message : copy.retry),
    };
  }, [copy.retry]);

  const loadList = useCallback((append = false, cursor: string | null = null) => {
    if (!isAuthenticated) {
      setListState({ status: "session-expired" });
      return Promise.resolve();
    }
    const requestId = ++requestSequence.current;
    setListState({ status: "loading" });
    return fetchMobileManagedBookings({
      tab,
      cursor: append ? cursor : null,
      limit: 20,
    })
      .then((response) => {
        if (requestId !== requestSequence.current) return;
        setItems((current) => mergeMobileBookingPage(current, response.data, append));
        setCounts(response.data.counts);
        setNextCursor(response.data.nextCursor);
        setListState({ status: "idle" });
      })
      .catch((error: unknown) => {
        if (requestId !== requestSequence.current) return;
        setListState(handleRequestError(error));
      });
  }, [handleRequestError, isAuthenticated, tab]);

  useEffect(() => {
    void Promise.resolve().then(() => loadList(false));
    return () => {
      requestSequence.current += 1;
    };
  }, [loadList]);

  const openDetail = (bookingId: string) => {
    setDetailState({ status: "loading" });
    setOperationMessage(null);
    fetchMobileBookingDetail(bookingId)
      .then((response) => {
        setSelected(response.data);
        setDetailState({ status: "idle" });
      })
      .catch((error: unknown) => setDetailState(handleRequestError(error)));
  };

  const refreshAuthoritative = async (bookingId?: string) => {
    await loadList(false);
    if (!bookingId) return;
    const detail = await fetchMobileBookingDetail(bookingId);
    setSelected(detail.data);
  };

  const cancelBooking = async () => {
    if (!selected || !mutationGate.tryBegin()) return;
    setOperationPending(true);
    setOperationMessage(null);
    try {
      const result = await cancelMobileBooking(
        selected.id,
        "",
        cancellationKey.current,
      );
      setSelected(result.data.booking);
      setOperationMessage(result.data.replayed ? copy.replayed : copy.persisted);
      cancellationKey.current = randomUUID();
      setConfirmCancellation(false);
      await refreshAuthoritative(selected.id);
    } catch (error) {
      const apiError = error instanceof MobileApiRequestError ? error : null;
      const recovery = mobileBookingManagementFailure(apiError?.code);
      setOperationMessage(recovery.conflict ? copy.conflict : apiError?.message ?? copy.retry);
      if (recovery.sessionExpired) setDetailState({ status: "session-expired" });
      await refreshAuthoritative(selected.id).catch(() => undefined);
    } finally {
      mutationGate.finish();
      setOperationPending(false);
    }
  };

  const loadOptions = (date: string) => {
    if (!selected) return;
    setSelectedDate(date);
    setSelectedSlot(null);
    setAvailability(null);
    setDetailState({ status: "loading" });
    fetchMobileBookingRescheduleOptions({
      bookingId: selected.id,
      date,
      memberId: selected.memberId,
    })
      .then((response) => {
        setAvailability(response.data);
        setDetailState({ status: "idle" });
      })
      .catch((error: unknown) => setDetailState(handleRequestError(error)));
  };

  const submitChange = async () => {
    if (!selected || !selectedDate || !selectedSlot || !mutationGate.tryBegin()) return;
    setOperationPending(true);
    setOperationMessage(null);
    try {
      const result = await requestMobileBookingChange(
        selected.id,
        {
          date: selectedDate,
          memberId: selectedSlot.memberId,
          startsAt: selectedSlot.startsAt,
        },
        changeKey.current,
      );
      setSelected(result.data.booking);
      setOperationMessage(result.data.replayed ? copy.replayed : copy.persisted);
      changeKey.current = randomUUID();
      setRescheduleOpen(false);
      await refreshAuthoritative(selected.id);
    } catch (error) {
      const apiError = error instanceof MobileApiRequestError ? error : null;
      const recovery = mobileBookingManagementFailure(apiError?.code);
      setOperationMessage(recovery.conflict ? copy.conflict : apiError?.message ?? copy.retry);
      if (recovery.sessionExpired) setDetailState({ status: "session-expired" });
      await refreshAuthoritative(selected.id).catch(() => undefined);
    } finally {
      mutationGate.finish();
      setOperationPending(false);
    }
  };

  if (!isAuthenticated || listState.status === "session-expired" || detailState.status === "session-expired") {
    return (
      <StateCard message={copy.session} action={copy.signIn} onAction={onSignIn} styles={styles} />
    );
  }

  if (selected) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, isRtl && styles.rowRtl]}>
          <Action label={copy.back} onPress={() => {
            setSelected(null);
            setConfirmCancellation(false);
            setRescheduleOpen(false);
            setOperationMessage(null);
          }} styles={styles} tone="neutral" />
          <Action label={copy.refresh} onPress={() => void refreshAuthoritative(selected.id)} styles={styles} tone="neutral" />
        </View>
        <View style={styles.card}>
          <Text style={[styles.title, isRtl && styles.rtl]}>{selected.businessName}</Text>
          <Text style={[styles.body, isRtl && styles.rtl]}>{selected.serviceName} · {selected.branchName}</Text>
          <Text style={[styles.body, isRtl && styles.rtl]}>{formatRange(selected, locale)}</Text>
          <Text style={[styles.meta, isRtl && styles.rtl]}>{selected.reference} · {selected.status}</Text>
          <Text style={[styles.meta, isRtl && styles.rtl]}>{selected.memberName ?? "—"} · {selected.price}</Text>
        </View>

        {selected.changeRequest ? (
          <View style={styles.stateCard}>
            <Text style={[styles.body, isRtl && styles.rtl]}>
              {changeRequestLabel(selected, copy)}
            </Text>
            <Text style={[styles.meta, isRtl && styles.rtl]}>
              {formatInstant(selected.changeRequest.proposedStartsAt, selected.timezone, locale)}
            </Text>
          </View>
        ) : null}

        {operationMessage ? <Text style={[styles.message, isRtl && styles.rtl]}>{operationMessage}</Text> : null}
        {operationPending ? <Text style={styles.body}>{copy.operationPending}</Text> : null}

        {selected.cancellation.eligible && !confirmCancellation ? (
          <Action label={copy.cancel} onPress={() => setConfirmCancellation(true)} styles={styles} tone="danger" />
        ) : null}
        {confirmCancellation ? (
          <View style={styles.actionRow}>
            <Action label={copy.keep} onPress={() => setConfirmCancellation(false)} styles={styles} tone="neutral" />
            <Action disabled={operationPending} label={copy.confirmCancel} onPress={() => void cancelBooking()} styles={styles} tone="danger" />
          </View>
        ) : null}

        {selected.reschedule.eligible && selected.changeRequest?.status !== "PENDING" ? (
          <Action label={copy.requestChange} onPress={() => setRescheduleOpen((value) => !value)} styles={styles} tone="primary" />
        ) : null}
        {rescheduleOpen ? (
          <View style={styles.card}>
            <Text style={[styles.sectionTitle, isRtl && styles.rtl]}>{copy.chooseDate}</Text>
            <View style={styles.wrap}>
              {nextBookingDates(selected.timezone).map((date) => (
                <Chip key={date} label={formatDate(date, locale)} selected={selectedDate === date} onPress={() => loadOptions(date)} styles={styles} />
              ))}
            </View>
            <Text style={[styles.sectionTitle, isRtl && styles.rtl]}>{copy.chooseTime}</Text>
            {detailState.status === "loading" ? <Text style={styles.body}>{copy.loading}</Text> : null}
            {selectedDate && detailState.status !== "loading" && !availability?.slots.length ? <Text style={styles.body}>{copy.noSlots}</Text> : null}
            <View style={styles.wrap}>
              {availability?.slots.map((slot) => (
                <Chip
                  key={`${slot.startsAt}:${slot.memberId ?? "none"}`}
                  label={formatInstant(slot.startsAt, selected.timezone, locale)}
                  selected={selectedSlot?.startsAt === slot.startsAt && selectedSlot.memberId === slot.memberId}
                  onPress={() => setSelectedSlot(slot)}
                  styles={styles}
                />
              ))}
            </View>
            {selectedSlot ? (
              <Action disabled={operationPending} label={copy.submitChange} onPress={() => void submitChange()} styles={styles} tone="primary" />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.heading}>
        <Text style={[styles.title, isRtl && styles.rtl]}>{copy.title}</Text>
        <Text style={[styles.body, isRtl && styles.rtl]}>{copy.subtitle}</Text>
      </View>
      <View style={styles.tabs}>
        {TABS.map((entry) => (
          <Chip
            key={entry.id}
            label={`${entry[locale]} (${counts[entry.id]})`}
            selected={tab === entry.id}
            onPress={() => setTab(entry.id)}
            styles={styles}
          />
        ))}
      </View>
      {listState.status === "error" ? (
        <StateCard message={listState.message} action={copy.retry} onAction={() => void loadList(false)} styles={styles} />
      ) : null}
      {listState.status === "loading" && items.length === 0 ? <StateCard message={copy.loading} styles={styles} /> : null}
      {listState.status !== "loading" && listState.status !== "error" && items.length === 0 ? <StateCard message={copy.empty} styles={styles} /> : null}
      {items.map((booking) => (
        <BookingCard key={booking.id} booking={booking} locale={locale} isRtl={isRtl} onOpen={() => openDetail(booking.id)} detailsLabel={copy.details} styles={styles} />
      ))}
      {nextCursor ? <Action disabled={listState.status === "loading"} label={listState.status === "loading" ? copy.loading : copy.more} onPress={() => void loadList(true, nextCursor)} styles={styles} tone="neutral" /> : null}
    </View>
  );
}

function BookingCard({ booking, detailsLabel, isRtl, locale, onOpen, styles }: {
  booking: MobileManagedBooking;
  detailsLabel: string;
  isRtl: boolean;
  locale: MobileLocale;
  onOpen: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.card}>
      <Text style={[styles.sectionTitle, isRtl && styles.rtl]}>{booking.businessName}</Text>
      <Text style={[styles.body, isRtl && styles.rtl]}>{booking.serviceName} · {booking.branchName}</Text>
      <Text style={[styles.meta, isRtl && styles.rtl]}>{formatRange(booking, locale)}</Text>
      <Text style={[styles.meta, isRtl && styles.rtl]}>{booking.status} · {booking.reference}</Text>
      <Action label={detailsLabel} onPress={onOpen} styles={styles} tone="primary" />
    </View>
  );
}

function StateCard({ action, message, onAction, styles }: {
  action?: string;
  message: string;
  onAction?: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.body}>{message}</Text>
      {action && onAction ? <Action label={action} onPress={onAction} styles={styles} tone="primary" /> : null}
    </View>
  );
}

function Action({ disabled = false, label, onPress, styles, tone }: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  tone: "danger" | "neutral" | "primary";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, tone === "danger" && styles.dangerAction, tone === "neutral" && styles.neutralAction, disabled && styles.disabled]}
    >
      <Text style={[styles.actionText, tone === "neutral" && styles.neutralActionText]}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, onPress, selected, styles }: {
  label: string;
  onPress: () => void;
  selected: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, selected && styles.selectedChip]}>
      <Text style={[styles.chipText, selected && styles.selectedChipText]}>{label}</Text>
    </Pressable>
  );
}

function changeRequestLabel(
  booking: MobileManagedBookingDetail,
  copy: (typeof COPY)[MobileLocale],
) {
  const request = booking.changeRequest;
  if (!request) return "";
  if (request.direction === "BUSINESS_TO_CUSTOMER") return copy.businessProposal;
  if (request.status === "PENDING") return copy.pending;
  if (request.status === "ACCEPTED") return copy.accepted;
  if (request.status === "REJECTED") return copy.rejected;
  return copy.cancelledRequest;
}

function formatRange(
  booking: { startsAt: string; endsAt: string; timezone: string },
  locale: MobileLocale,
) {
  return `${formatInstant(booking.startsAt, booking.timezone, locale)} – ${new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: booking.timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(booking.endsAt))}`;
}

function formatInstant(value: string, timezone: string, locale: MobileLocale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string, locale: MobileLocale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function localeTag(locale: MobileLocale) {
  return locale === "ar" ? "ar-IQ" : locale === "ckb" ? "ckb-IQ" : "en-US";
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    screen: { gap: 14, paddingBottom: 28 },
    heading: { gap: 4 },
    header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    rowRtl: { flexDirection: "row-reverse" },
    rtl: { textAlign: "right", writingDirection: "rtl" },
    title: { color: theme.colors.foreground, fontSize: 24, fontWeight: "800" },
    sectionTitle: { color: theme.colors.foreground, fontSize: 17, fontWeight: "700" },
    body: { color: theme.colors.mutedForeground, fontSize: 14, lineHeight: 22 },
    meta: { color: theme.colors.mutedForeground, fontSize: 12, lineHeight: 19 },
    message: { color: theme.colors.warning, fontSize: 13, fontWeight: "600" },
    card: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 20, borderWidth: 1, gap: 8, padding: 16 },
    stateCard: { backgroundColor: theme.colors.muted, borderRadius: 18, gap: 10, padding: 16 },
    tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    action: { alignItems: "center", backgroundColor: theme.colors.accent, borderRadius: 14, justifyContent: "center", minHeight: 46, paddingHorizontal: 16, paddingVertical: 10 },
    dangerAction: { backgroundColor: theme.colors.danger },
    neutralAction: { backgroundColor: theme.colors.muted, borderColor: theme.colors.border, borderWidth: 1 },
    neutralActionText: { color: theme.colors.foreground },
    actionText: { color: theme.colors.foregroundInverse, fontSize: 14, fontWeight: "700" },
    disabled: { opacity: 0.5 },
    chip: { backgroundColor: theme.colors.muted, borderColor: theme.colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
    selectedChip: { backgroundColor: theme.colors.accent },
    chipText: { color: theme.colors.foreground, fontSize: 12, fontWeight: "600" },
    selectedChipText: { color: theme.colors.foregroundInverse },
  });
}
