import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  cancelMobileRestaurantReservation,
  fetchMobileManagedRestaurantReservations,
  fetchMobileRestaurantReservationDetail,
  fetchMobileRestaurantRescheduleOptions,
  rescheduleMobileRestaurantReservation,
} from "../api/restaurant-reservations";
import { MobileApiRequestError } from "../api/client";
import type { MobileLocale } from "../i18n/labels";
import {
  createRestaurantManagementSubmissionGate,
  mergeMobileRestaurantReservationPage,
  mobileRestaurantManagementFailure,
  nextRestaurantReservationDates,
} from "../restaurant-reservations/management-state";
import type { MobileTheme } from "../theme/tokens";
import type {
  MobileManagedRestaurantReservation,
  MobileRestaurantAvailability,
  MobileRestaurantReservationDetail,
  MobileRestaurantReservationManagementPage,
  MobileRestaurantReservationManagementTab,
} from "../types/restaurant-reservations";

type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "session-expired" };

const TABS: Array<{
  id: MobileRestaurantReservationManagementTab;
  ar: string;
  en: string;
  ckb: string;
}> = [
  { id: "all", ar: "الكل", en: "All", ckb: "هەموو" },
  { id: "upcoming", ar: "القادمة", en: "Upcoming", ckb: "داهاتوو" },
  { id: "completed", ar: "المكتملة", en: "Completed", ckb: "تەواوبوو" },
  { id: "cancelled", ar: "الملغاة", en: "Cancelled", ckb: "هەڵوەشاوە" },
];

const COPY = {
  ar: {
    title: "حجوزات المطاعم",
    subtitle: "حجوزات الطاولات المحفوظة في حسابك",
    loading: "جارٍ تحميل الحجوزات…",
    empty: "لا توجد حجوزات مطاعم في هذا القسم.",
    retry: "إعادة المحاولة",
    refresh: "تحديث",
    signIn: "تسجيل الدخول",
    session: "انتهت الجلسة. سجّل الدخول للمتابعة.",
    more: "تحميل المزيد",
    details: "عرض التفاصيل",
    back: "العودة للحجوزات",
    guests: "ضيوف",
    preorder: "الطلب المسبق المحفوظ",
    noPreorder: "لا يوجد طلب مسبق.",
    history: "سجل الحجز",
    activityCreated: "تم إنشاء الحجز",
    activityCancelled: "تم إلغاء الحجز",
    activityRescheduled: "تمت إعادة جدولة الحجز",
    activityStatusChanged: "تغيّرت حالة الحجز",
    cancel: "إلغاء الحجز",
    cancelReason: "سبب الإلغاء (اختياري)",
    confirmCancel: "تأكيد الإلغاء",
    keep: "الاحتفاظ بالحجز",
    reschedule: "إعادة الجدولة",
    chooseDate: "اختر التاريخ الجديد",
    chooseTime: "اختر الوقت الجديد",
    party: "عدد الضيوف",
    area: "منطقة الجلوس",
    anyArea: "أي منطقة",
    note: "ملاحظة العميل",
    save: "حفظ إعادة الجدولة",
    noSlots: "لا توجد أوقات متاحة لهذه الخيارات.",
    restaurantClosed: "المطعم مغلق في هذا التاريخ.",
    noCapacity: "لا توجد طاولة مناسبة لهذه الخيارات.",
    deadline: "انتهت مهلة إلغاء الحجز أو إعادة جدولته.",
    pending: "جارٍ حفظ التغيير…",
    replayed: "تم تأكيد العملية السابقة بأمان.",
    persisted: "تم حفظ العملية وتحديث الحجز.",
    conflict: "تغيّرت حالة الحجز. تم تحديث البيانات؛ راجعها وحاول مجدداً.",
  },
  en: {
    title: "Restaurant reservations",
    subtitle: "Table reservations persisted to your account",
    loading: "Loading restaurant reservations…",
    empty: "No restaurant reservations in this section.",
    retry: "Retry",
    refresh: "Refresh",
    signIn: "Sign in",
    session: "Your session expired. Sign in to continue.",
    more: "Load more",
    details: "View details",
    back: "Back to reservations",
    guests: "guests",
    preorder: "Persisted preorder",
    noPreorder: "No preorder items.",
    history: "Reservation history",
    activityCreated: "Reservation created",
    activityCancelled: "Reservation cancelled",
    activityRescheduled: "Reservation rescheduled",
    activityStatusChanged: "Reservation status changed",
    cancel: "Cancel reservation",
    cancelReason: "Cancellation reason (optional)",
    confirmCancel: "Confirm cancellation",
    keep: "Keep reservation",
    reschedule: "Reschedule",
    chooseDate: "Choose a new date",
    chooseTime: "Choose a new time",
    party: "Party size",
    area: "Seating area",
    anyArea: "Any area",
    note: "Customer note",
    save: "Save reschedule",
    noSlots: "No times are available for these options.",
    restaurantClosed: "The restaurant is closed on this date.",
    noCapacity: "No suitable table is available for these options.",
    deadline: "The cancellation or reschedule deadline has passed.",
    pending: "Saving change…",
    replayed: "The previous operation was safely confirmed.",
    persisted: "The operation was saved and the reservation refreshed.",
    conflict: "The reservation changed. Data was refreshed; review it and retry.",
  },
  ckb: {
    title: "حجزەکانی چێشتخانە",
    subtitle: "حجزە پاشەکەوتکراوەکانی مێز",
    loading: "حجزەکان بار دەکرێن…",
    empty: "هیچ حجزێکی چێشتخانە لەم بەشەدا نییە.",
    retry: "دووبارە هەوڵدانەوە",
    refresh: "نوێکردنەوە",
    signIn: "چوونەژوورەوە",
    session: "دانیشتنەکەت کۆتایی هات. دووبارە بچۆ ژوورەوە.",
    more: "زیاتر بار بکە",
    details: "وردەکارییەکان",
    back: "گەڕانەوە بۆ حجزەکان",
    guests: "میوان",
    preorder: "داواکاری پێشوەختە",
    noPreorder: "داواکاری پێشوەختە نییە.",
    history: "مێژووی حجز",
    activityCreated: "حجزەکە دروستکرا",
    activityCancelled: "حجزەکە هەڵوەشێندرایەوە",
    activityRescheduled: "کاتی حجزەکە گۆڕدرا",
    activityStatusChanged: "دۆخی حجزەکە گۆڕا",
    cancel: "هەڵوەشاندنەوەی حجز",
    cancelReason: "هۆکاری هەڵوەشاندنەوە (ئارەزوومەندانە)",
    confirmCancel: "پشتڕاستکردنەوە",
    keep: "حجزەکە بهێڵەوە",
    reschedule: "گۆڕینی کات",
    chooseDate: "بەرواری نوێ هەڵبژێرە",
    chooseTime: "کاتی نوێ هەڵبژێرە",
    party: "ژمارەی میوان",
    area: "ناوچەی دانیشتن",
    anyArea: "هەر ناوچەیەک",
    note: "تێبینی کڕیار",
    save: "پاشەکەوتکردنی گۆڕانکاری",
    noSlots: "هیچ کاتێک بۆ ئەم هەڵبژاردنانە نییە.",
    restaurantClosed: "چێشتخانەکە لەم بەروارەدا داخراوە.",
    noCapacity: "هیچ مێزێکی گونجاو بۆ ئەم هەڵبژاردنانە نییە.",
    deadline: "کاتی هەڵوەشاندنەوە یان گۆڕینی کات تێپەڕیوە.",
    pending: "گۆڕانکاری پاشەکەوت دەکرێت…",
    replayed: "کردارە پێشوەکە بە سەلامەتی پشتڕاستکرایەوە.",
    persisted: "کردارەکە پاشەکەوت و حجزەکە نوێکرایەوە.",
    conflict: "دۆخی حجزەکە گۆڕاوە. زانیارییەکان نوێکرانەوە.",
  },
} as const;

export function CustomerRestaurantReservationManagementScreen({
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
  const [tab, setTab] = useState<MobileRestaurantReservationManagementTab>("all");
  const [items, setItems] = useState<MobileManagedRestaurantReservation[]>([]);
  const [counts, setCounts] = useState<MobileRestaurantReservationManagementPage["counts"]>({
    all: 0,
    upcoming: 0,
    completed: 0,
    cancelled: 0,
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listState, setListState] = useState<RequestState>({ status: "loading" });
  const [detailState, setDetailState] = useState<RequestState>({ status: "idle" });
  const [selected, setSelected] = useState<MobileRestaurantReservationDetail | null>(null);
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState(1);
  const [seatingArea, setSeatingArea] = useState<string | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [availability, setAvailability] = useState<MobileRestaurantAvailability | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<MobileRestaurantAvailability["slots"][number] | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [operationPending, setOperationPending] = useState(false);
  const requestSequence = useRef(0);
  const detailRequestSequence = useRef(0);
  const optionsRequestSequence = useRef(0);
  const retryDetailId = useRef<string | null>(null);
  const mutationGate = useRef(createRestaurantManagementSubmissionGate()).current;
  const cancellationKey = useRef(randomUUID());
  const rescheduleKey = useRef(randomUUID());

  const requestFailure = useCallback((error: unknown): RequestState => {
    const apiError = error instanceof MobileApiRequestError ? error : null;
    const recovery = mobileRestaurantManagementFailure(apiError?.code);
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
    return fetchMobileManagedRestaurantReservations({
      tab,
      cursor: append ? cursor : null,
      limit: 20,
    })
      .then((response) => {
        if (requestId !== requestSequence.current) return;
        setItems((current) =>
          mergeMobileRestaurantReservationPage(current, response.data, append),
        );
        setCounts(response.data.counts);
        setNextCursor(response.data.nextCursor);
        setListState({ status: "idle" });
      })
      .catch((error: unknown) => {
        if (requestId !== requestSequence.current) return;
        setListState(requestFailure(error));
      });
  }, [isAuthenticated, requestFailure, tab]);

  useEffect(() => {
    void Promise.resolve().then(() => loadList(false));
    return () => {
      requestSequence.current += 1;
    };
  }, [loadList]);

  const openDetail = (bookingId: string) => {
    retryDetailId.current = bookingId;
    const requestId = ++detailRequestSequence.current;
    setDetailState({ status: "loading" });
    setOperationMessage(null);
    fetchMobileRestaurantReservationDetail(bookingId)
      .then((response) => {
        if (requestId !== detailRequestSequence.current) return;
        setSelected(response.data);
        setDetailState({ status: "idle" });
      })
      .catch((error: unknown) => {
        if (requestId !== detailRequestSequence.current) return;
        setDetailState(requestFailure(error));
      });
  };

  const refreshAuthoritative = async (bookingId?: string) => {
    await loadList(false);
    if (!bookingId) return;
    const detail = await fetchMobileRestaurantReservationDetail(bookingId);
    setSelected(detail.data);
  };

  const cancelReservation = async () => {
    if (!selected || !mutationGate.tryBegin()) return;
    setOperationPending(true);
    setOperationMessage(null);
    try {
      const result = await cancelMobileRestaurantReservation(
        selected.id,
        cancellationReason,
        cancellationKey.current,
      );
      setSelected(result.data.reservation);
      setOperationMessage(result.data.replayed ? copy.replayed : copy.persisted);
      cancellationKey.current = randomUUID();
      setConfirmCancellation(false);
      await refreshAuthoritative(selected.id);
    } catch (error) {
      const apiError = error instanceof MobileApiRequestError ? error : null;
      const recovery = mobileRestaurantManagementFailure(apiError?.code);
      setOperationMessage(
        apiError?.code === "CANCELLATION_DEADLINE_PASSED"
          ? copy.deadline
          : recovery.conflict
            ? copy.conflict
            : apiError?.message ?? copy.retry,
      );
      if (recovery.sessionExpired) setDetailState({ status: "session-expired" });
      await refreshAuthoritative(selected.id).catch(() => undefined);
    } finally {
      mutationGate.finish();
      setOperationPending(false);
    }
  };

  const loadOptions = (
    date: string,
    party = guestCount,
    area = seatingArea,
  ) => {
    if (!selected) return;
    const requestId = ++optionsRequestSequence.current;
    setSelectedDate(date);
    setSelectedSlot(null);
    setAvailability(null);
    setDetailState({ status: "loading" });
    fetchMobileRestaurantRescheduleOptions({
      bookingId: selected.id,
      date,
      guestCount: party,
      seatingArea: area,
    })
      .then((response) => {
        if (requestId !== optionsRequestSequence.current) return;
        setAvailability(response.data);
        setDetailState({ status: "idle" });
      })
      .catch((error: unknown) => {
        if (requestId !== optionsRequestSequence.current) return;
        setDetailState(requestFailure(error));
      });
  };

  const updateParty = (next: number) => {
    const bounded = Math.max(1, Math.min(100, next));
    setGuestCount(bounded);
    if (selectedDate) loadOptions(selectedDate, bounded, seatingArea);
  };

  const updateArea = (area: string | null) => {
    setSeatingArea(area);
    if (selectedDate) loadOptions(selectedDate, guestCount, area);
  };

  const submitReschedule = async () => {
    if (!selected || !selectedDate || !selectedSlot || !mutationGate.tryBegin()) return;
    setOperationPending(true);
    setOperationMessage(null);
    try {
      const result = await rescheduleMobileRestaurantReservation(
        selected.id,
        {
          customerNote: customerNote.trim() || null,
          date: selectedDate,
          guestCount,
          seatingArea,
          startsAt: selectedSlot.startsAt,
        },
        rescheduleKey.current,
      );
      setSelected(result.data.reservation);
      setOperationMessage(result.data.replayed ? copy.replayed : copy.persisted);
      rescheduleKey.current = randomUUID();
      setRescheduleOpen(false);
      await refreshAuthoritative(selected.id);
    } catch (error) {
      const apiError = error instanceof MobileApiRequestError ? error : null;
      const recovery = mobileRestaurantManagementFailure(apiError?.code);
      setOperationMessage(
        apiError?.code === "CANCELLATION_DEADLINE_PASSED"
          ? copy.deadline
          : apiError?.code === "CAPACITY_UNAVAILABLE"
            ? copy.noCapacity
            : apiError?.code === "RESTAURANT_CLOSED"
              ? copy.restaurantClosed
              : recovery.conflict
                ? copy.conflict
                : apiError?.message ?? copy.retry,
      );
      if (recovery.sessionExpired) setDetailState({ status: "session-expired" });
      await refreshAuthoritative(selected.id).catch(() => undefined);
    } finally {
      mutationGate.finish();
      setOperationPending(false);
    }
  };

  if (
    !isAuthenticated ||
    listState.status === "session-expired" ||
    detailState.status === "session-expired"
  ) {
    return (
      <StateCard
        action={copy.signIn}
        message={copy.session}
        onAction={onSignIn}
        styles={styles}
      />
    );
  }

  if (selected) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, isRtl && styles.rowRtl]}>
          <Action
            label={copy.back}
            onPress={() => {
              setSelected(null);
              setConfirmCancellation(false);
              setRescheduleOpen(false);
              setOperationMessage(null);
              setDetailState({ status: "idle" });
              optionsRequestSequence.current += 1;
            }}
            styles={styles}
            tone="neutral"
          />
          <Action
            label={copy.refresh}
            onPress={() => {
              void refreshAuthoritative(selected.id).catch((error: unknown) =>
                setDetailState(requestFailure(error)),
              );
            }}
            styles={styles}
            tone="neutral"
          />
        </View>
        <View style={styles.card}>
          <Text style={[styles.title, isRtl && styles.rtl]}>{selected.restaurant.name}</Text>
          <Text style={[styles.body, isRtl && styles.rtl]}>{selected.branch.name}</Text>
          <Text style={[styles.body, isRtl && styles.rtl]}>{formatRange(selected, locale)}</Text>
          <Text style={[styles.meta, isRtl && styles.rtl]}>
            {selected.guestCount} {copy.guests} · {selected.seatingArea ?? "—"}
          </Text>
          <Text style={[styles.meta, isRtl && styles.rtl]}>
            {selected.reference} · {selected.status}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={[styles.sectionTitle, isRtl && styles.rtl]}>{copy.preorder}</Text>
          {selected.preorderItems.length === 0 ? (
            <Text style={[styles.body, isRtl && styles.rtl]}>{copy.noPreorder}</Text>
          ) : selected.preorderItems.map((item) => (
            <Text key={item.id} style={[styles.body, isRtl && styles.rtl]}>
              {item.quantity} × {item.name} · {item.unitPrice} {item.currency}
            </Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={[styles.sectionTitle, isRtl && styles.rtl]}>{copy.history}</Text>
          {selected.activityHistory.map((entry, index) => (
            <View key={`${entry.kind}:${entry.createdAt}:${index}`} style={styles.historyEntry}>
              <Text style={[styles.body, isRtl && styles.rtl]}>
                {entry.kind === "CREATED"
                  ? copy.activityCreated
                  : entry.kind === "CANCELLED"
                    ? copy.activityCancelled
                    : entry.kind === "RESCHEDULED"
                      ? copy.activityRescheduled
                      : copy.activityStatusChanged}
              </Text>
              <Text style={[styles.meta, isRtl && styles.rtl]}>
                {formatInstant(entry.createdAt, selected.timezone, locale)}
              </Text>
            </View>
          ))}
        </View>

        {operationMessage ? (
          <Text style={[styles.message, isRtl && styles.rtl]}>{operationMessage}</Text>
        ) : null}
        {operationPending ? <Text style={styles.body}>{copy.pending}</Text> : null}

        {selected.cancellation.eligible && !confirmCancellation ? (
          <Action label={copy.cancel} onPress={() => setConfirmCancellation(true)} styles={styles} tone="danger" />
        ) : null}
        {confirmCancellation ? (
          <View style={styles.card}>
            <TextInput
              accessibilityLabel={copy.cancelReason}
              maxLength={500}
              onChangeText={setCancellationReason}
              placeholder={copy.cancelReason}
              placeholderTextColor={theme.colors.mutedForeground}
              style={[styles.input, isRtl && styles.rtl]}
              value={cancellationReason}
            />
            <View style={styles.actionRow}>
              <Action label={copy.keep} onPress={() => setConfirmCancellation(false)} styles={styles} tone="neutral" />
              <Action disabled={operationPending} label={copy.confirmCancel} onPress={() => void cancelReservation()} styles={styles} tone="danger" />
            </View>
          </View>
        ) : null}

        {selected.reschedule.eligible ? (
          <Action
            label={copy.reschedule}
            onPress={() => {
              const next = !rescheduleOpen;
              setRescheduleOpen(next);
              if (next) {
                setGuestCount(selected.guestCount);
                setSeatingArea(selected.seatingArea);
                setCustomerNote(selected.customerNote ?? "");
                setSelectedDate(null);
                setSelectedSlot(null);
                setAvailability(null);
              }
            }}
            styles={styles}
            tone="primary"
          />
        ) : null}
        {rescheduleOpen ? (
          <View style={styles.card}>
            <Text style={[styles.sectionTitle, isRtl && styles.rtl]}>{copy.party}</Text>
            <View style={[styles.counter, isRtl && styles.rowRtl]}>
              <Action label="−" onPress={() => updateParty(guestCount - 1)} styles={styles} tone="neutral" />
              <Text style={styles.counterValue}>{guestCount}</Text>
              <Action label="+" onPress={() => updateParty(guestCount + 1)} styles={styles} tone="neutral" />
            </View>
            <Text style={[styles.sectionTitle, isRtl && styles.rtl]}>{copy.chooseDate}</Text>
            <View style={styles.wrap}>
              {nextRestaurantReservationDates(selected.timezone).map((date) => (
                <Chip key={date} label={formatDate(date, locale)} selected={selectedDate === date} onPress={() => loadOptions(date)} styles={styles} />
              ))}
            </View>
            {availability ? (
              <>
                <Text style={[styles.sectionTitle, isRtl && styles.rtl]}>{copy.area}</Text>
                <View style={styles.wrap}>
                  <Chip label={copy.anyArea} selected={seatingArea === null} onPress={() => updateArea(null)} styles={styles} />
                  {availability.seatingAreas.map((area) => (
                    <Chip key={area} label={area} selected={seatingArea === area} onPress={() => updateArea(area)} styles={styles} />
                  ))}
                </View>
              </>
            ) : null}
            <Text style={[styles.sectionTitle, isRtl && styles.rtl]}>{copy.chooseTime}</Text>
            {detailState.status === "loading" ? <Text style={styles.body}>{copy.loading}</Text> : null}
            {detailState.status === "error" ? (
              <StateCard
                action={copy.retry}
                message={detailState.message}
                onAction={() => {
                  if (selectedDate) loadOptions(selectedDate, guestCount, seatingArea);
                }}
                styles={styles}
              />
            ) : null}
            {selectedDate && detailState.status !== "loading" && detailState.status !== "error" && !availability?.slots.length ? (
              <Text style={styles.body}>
                {availability?.reason === "RESTAURANT_CLOSED"
                  ? copy.restaurantClosed
                  : availability?.reason === "CAPACITY_UNAVAILABLE"
                    ? copy.noCapacity
                    : copy.noSlots}
              </Text>
            ) : null}
            <View style={styles.wrap}>
              {availability?.slots.map((slot) => (
                <Chip
                  key={slot.startsAt}
                  label={formatInstant(slot.startsAt, selected.timezone, locale)}
                  selected={selectedSlot?.startsAt === slot.startsAt}
                  onPress={() => setSelectedSlot(slot)}
                  styles={styles}
                />
              ))}
            </View>
            <TextInput
              accessibilityLabel={copy.note}
              maxLength={500}
              multiline
              onChangeText={setCustomerNote}
              placeholder={copy.note}
              placeholderTextColor={theme.colors.mutedForeground}
              style={[styles.input, styles.noteInput, isRtl && styles.rtl]}
              value={customerNote}
            />
            {selectedSlot ? (
              <Action disabled={operationPending} label={copy.save} onPress={() => void submitReschedule()} styles={styles} tone="primary" />
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
      <View style={styles.wrap}>
        {TABS.map((entry) => (
          <Chip key={entry.id} label={`${entry[locale]} (${counts[entry.id]})`} selected={tab === entry.id} onPress={() => setTab(entry.id)} styles={styles} />
        ))}
      </View>
      {listState.status === "error" ? <StateCard message={listState.message} action={copy.retry} onAction={() => void loadList(false)} styles={styles} /> : null}
      {detailState.status === "error" ? (
        <StateCard
          message={detailState.message}
          action={copy.retry}
          onAction={() => {
            if (retryDetailId.current) openDetail(retryDetailId.current);
          }}
          styles={styles}
        />
      ) : null}
      {listState.status === "loading" && items.length === 0 ? <StateCard message={copy.loading} styles={styles} /> : null}
      {listState.status === "idle" && items.length === 0 ? <StateCard message={copy.empty} styles={styles} /> : null}
      {items.map((reservation) => (
        <View key={reservation.id} style={styles.card}>
          <Text style={[styles.sectionTitle, isRtl && styles.rtl]}>{reservation.restaurant.name}</Text>
          <Text style={[styles.body, isRtl && styles.rtl]}>{reservation.branch.name}</Text>
          <Text style={[styles.meta, isRtl && styles.rtl]}>{formatRange(reservation, locale)}</Text>
          <Text style={[styles.meta, isRtl && styles.rtl]}>
            {reservation.guestCount} {copy.guests} · {reservation.status} · {reservation.reference}
          </Text>
          <Action label={copy.details} onPress={() => openDetail(reservation.id)} styles={styles} tone="primary" />
        </View>
      ))}
      {nextCursor ? <Action disabled={listState.status === "loading"} label={copy.more} onPress={() => void loadList(true, nextCursor)} styles={styles} tone="neutral" /> : null}
      {items.length > 0 ? <Action label={copy.refresh} onPress={() => void loadList(false)} styles={styles} tone="neutral" /> : null}
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
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, tone === "danger" && styles.dangerAction, tone === "neutral" && styles.neutralAction, disabled && styles.disabled]}>
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

function formatRange(value: { startsAt: string; endsAt: string; timezone: string }, locale: MobileLocale) {
  return `${formatInstant(value.startsAt, value.timezone, locale)} – ${new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: value.timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value.endsAt))}`;
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
    card: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 20, borderWidth: 1, gap: 10, padding: 16 },
    stateCard: { backgroundColor: theme.colors.muted, borderRadius: 18, gap: 10, padding: 16 },
    historyEntry: { borderBottomColor: theme.colors.border, borderBottomWidth: 1, gap: 3, paddingBottom: 9 },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    counter: { alignItems: "center", flexDirection: "row", gap: 14 },
    counterValue: { color: theme.colors.foreground, fontSize: 18, fontWeight: "800", minWidth: 30, textAlign: "center" },
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
    input: { backgroundColor: theme.colors.muted, borderColor: theme.colors.border, borderRadius: 14, borderWidth: 1, color: theme.colors.foreground, minHeight: 48, paddingHorizontal: 14, paddingVertical: 10 },
    noteInput: { minHeight: 86, textAlignVertical: "top" },
  });
}
