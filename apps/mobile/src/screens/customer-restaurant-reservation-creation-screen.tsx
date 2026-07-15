import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  createMobileRestaurantReservation,
  fetchMobileRestaurantAvailability,
  fetchMobileRestaurantBranches,
  fetchMobileRestaurantBusiness,
  fetchMobileRestaurantMenu,
  fetchMobileRestaurantReservationDetail,
} from "../api/restaurant-reservations";
import { MobileApiRequestError } from "../api/client";
import type { MobileLocale } from "../i18n/labels";
import {
  canReviewMobileRestaurantReservation,
  createRestaurantReservationSubmissionGate,
  EMPTY_RESTAURANT_RESERVATION_SELECTION,
  mobileRestaurantReservationFailure,
  restaurantPreorderItems,
  selectMobileRestaurantBranch,
  selectMobileRestaurantDate,
  selectMobileRestaurantGuests,
  selectMobileRestaurantSlot,
  type MobileRestaurantReservationStep,
} from "../restaurant-reservations/state";
import type { MobileTheme } from "../theme/tokens";
import type {
  MobileRestaurantAvailability,
  MobileRestaurantBranch,
  MobileRestaurantBusiness,
  MobileRestaurantMenuCategory,
  MobileRestaurantReservationDetail,
} from "../types/restaurant-reservations";

type RequestState =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | { status: "error"; message: string };

const COPY = {
  ar: {
    back: "رجوع", branches: "اختر الفرع", businessUnavailable: "الحجز غير متاح لهذا النشاط.",
    capacity: "لا توجد طاولة مناسبة لهذا العدد.", chooseDate: "اختر التاريخ والوقت",
    chooseGuests: "عدد الضيوف", chooseSeating: "منطقة الجلوس المفضلة", closed: "المطعم مغلق في هذا اليوم.",
    confirm: "تأكيد الحجز", continue: "متابعة", detail: "تم حفظ الحجز", anyArea: "أي منطقة متاحة",
    emptyBranches: "لا توجد فروع تدعم الحجز.", emptySlots: "لا توجد أوقات متاحة.", loading: "جارٍ التحميل…",
    menu: "طلب مسبق اختياري", next: "التالي", profile: "حجز مطعم", retry: "إعادة المحاولة",
    review: "مراجعة الحجز", session: "سجّل الدخول بحساب عميل مكتمل لإنشاء الحجز.", signIn: "تسجيل الدخول",
    note: "ملاحظة للمطعم (اختياري)", invalidGuests: "أدخل عدداً صحيحاً من 1 إلى 100.",
  },
  en: {
    back: "Back", branches: "Choose branch", businessUnavailable: "Reservations are unavailable for this business.",
    capacity: "No suitable table is available for this party size.", chooseDate: "Choose date and time",
    chooseGuests: "Guest count", chooseSeating: "Seating preference", closed: "The restaurant is closed on this date.",
    confirm: "Confirm reservation", continue: "Continue", detail: "Reservation persisted", anyArea: "Any available area",
    emptyBranches: "No reservation branches are available.", emptySlots: "No times are available.", loading: "Loading…",
    menu: "Optional menu preorder", next: "Next", profile: "Restaurant reservation", retry: "Retry",
    review: "Review reservation", session: "Sign in with a completed customer account to reserve.", signIn: "Sign in",
    note: "Note for the restaurant (optional)", invalidGuests: "Enter an integer from 1 to 100.",
  },
  ckb: {
    back: "گەڕانەوە", branches: "لق هەڵبژێرە", businessUnavailable: "حجزکردن بۆ ئەم کارە بەردەست نییە.",
    capacity: "هیچ مێزێکی گونجاو بۆ ئەم ژمارەیە نییە.", chooseDate: "بەروار و کات هەڵبژێرە",
    chooseGuests: "ژمارەی میوان", chooseSeating: "شوێنی دانیشتن", closed: "چێشتخانەکە لەم ڕۆژەدا داخراوە.",
    confirm: "پشتڕاستکردنەوە", continue: "بەردەوام بە", detail: "حجزەکە پاشەکەوت کرا", anyArea: "هەر شوێنێکی بەردەست",
    emptyBranches: "هیچ لقێکی حجز بەردەست نییە.", emptySlots: "هیچ کاتێک بەردەست نییە.", loading: "بار دەکرێت…",
    menu: "داواکاری پێشوەختەی هەڵبژاردەیی", next: "دواتر", profile: "حجزی چێشتخانە", retry: "دووبارە هەوڵ بدە",
    review: "پێداچوونەوە", session: "بە هەژمارێکی تەواو بچۆ ژوورەوە.", signIn: "چوونەژوورەوە",
    note: "تێبینی بۆ چێشتخانە", invalidGuests: "ژمارەیەکی تەواو لە ١ تا ١٠٠ بنووسە.",
  },
} as const;

export function CustomerRestaurantReservationCreationScreen({
  businessSlug,
  isAuthenticated,
  isRtl,
  locale,
  onBack,
  onSignIn,
  theme,
}: {
  businessSlug: string;
  isAuthenticated: boolean;
  isRtl: boolean;
  locale: MobileLocale;
  onBack: () => void;
  onSignIn: () => void;
  theme: MobileTheme;
}) {
  const copy = COPY[locale];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [step, setStep] = useState<MobileRestaurantReservationStep>("business");
  const [business, setBusiness] = useState<MobileRestaurantBusiness | null>(null);
  const [branches, setBranches] = useState<MobileRestaurantBranch[]>([]);
  const [menu, setMenu] = useState<MobileRestaurantMenuCategory[]>([]);
  const [availability, setAvailability] = useState<MobileRestaurantAvailability | null>(null);
  const [selection, setSelection] = useState(EMPTY_RESTAURANT_RESERVATION_SELECTION);
  const [guestInput, setGuestInput] = useState("2");
  const [detail, setDetail] = useState<MobileRestaurantReservationDetail | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({ status: "loading", message: copy.loading });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const sequence = useRef(0);
  const idempotencyKey = useRef(randomUUID());
  const submissionGate = useRef(createRestaurantReservationSubmissionGate()).current;

  const loadBusiness = useCallback(() => {
    const requestId = ++sequence.current;
    setRequestState({ status: "loading", message: copy.loading });
    fetchMobileRestaurantBusiness(businessSlug)
      .then((response) => {
        if (requestId !== sequence.current) return;
        setBusiness(response.data);
        setRequestState({ status: "idle" });
      })
      .catch((error: unknown) => {
        if (requestId !== sequence.current) return;
        setRequestState({ status: "error", message: errorMessage(error) });
      });
  }, [businessSlug, copy.loading]);

  useEffect(() => {
    void Promise.resolve().then(loadBusiness);
    return () => { sequence.current += 1; };
  }, [loadBusiness]);

  const loadBranches = () => {
    const requestId = ++sequence.current;
    setStep("branch");
    setRequestState({ status: "loading", message: copy.loading });
    fetchMobileRestaurantBranches(businessSlug)
      .then((response) => {
        if (requestId !== sequence.current) return;
        setBranches(response.data.filter((branch) => branch.supportsReservations));
        setRequestState({ status: "idle" });
      })
      .catch((error: unknown) => setRequestError(requestId, error));
  };

  const chooseBranch = (branch: MobileRestaurantBranch) => {
    setSelection((current) => selectMobileRestaurantBranch(current, branch));
    setStep("guests");
    setSubmitError(null);
  };

  const chooseGuests = () => {
    const guestCount = Number(guestInput);
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 100) {
      setSubmitError(copy.invalidGuests);
      return;
    }
    setSelection((current) => selectMobileRestaurantGuests(current, guestCount));
    setSubmitError(null);
    setStep("datetime");
  };

  const loadAvailability = (
    date: string,
    seatingArea: string | null = null,
    updateSelection = true,
  ) => {
    if (!selection.branch || !selection.guestCount) return Promise.resolve(null);
    const requestId = ++sequence.current;
    if (updateSelection) {
      idempotencyKey.current = randomUUID();
      setSelection((current) => selectMobileRestaurantDate(current, date));
    }
    setAvailability(null);
    setRequestState({ status: "loading", message: copy.loading });
    return fetchMobileRestaurantAvailability({
      branchId: selection.branch.id,
      date,
      guestCount: selection.guestCount,
      seatingArea,
    })
      .then((response) => {
        if (requestId !== sequence.current) return null;
        setAvailability(response.data);
        setRequestState({ status: "idle" });
        return response.data;
      })
      .catch((error: unknown) => {
        setRequestError(requestId, error);
        return null;
      });
  };

  const chooseSlot = (slot: { startsAt: string; endsAt: string }) => {
    idempotencyKey.current = randomUUID();
    setSelection((current) => selectMobileRestaurantSlot(current, slot));
    setSubmitError(null);
    setStep("seating");
  };

  const chooseSeating = async (area: string | null) => {
    if (!selection.date || !selection.slot) return;
    const selectedStartsAt = selection.slot.startsAt;
    const refreshed = await loadAvailability(selection.date, area, false);
    if (!refreshed) return;
    if (!refreshed.slots.some((slot) => slot.startsAt === selectedStartsAt)) {
      setSubmitError(copy.capacity);
      setStep("datetime");
      return;
    }
    if (selection.seatingArea !== area) {
      idempotencyKey.current = randomUUID();
    }
    setSelection((current) => ({ ...current, seatingArea: area }));
    void loadMenu();
  };

  const loadMenu = () => {
    const requestId = ++sequence.current;
    setStep("menu");
    setRequestState({ status: "loading", message: copy.loading });
    return fetchMobileRestaurantMenu(businessSlug)
      .then((response) => {
        if (requestId !== sequence.current) return;
        setMenu(response.data);
        setRequestState({ status: "idle" });
      })
      .catch((error: unknown) => setRequestError(requestId, error));
  };

  const setItemQuantity = (itemId: string, next: number) => {
    setSelection((current) => {
      const quantity = Math.max(0, Math.min(20, next));
      if ((current.preorderItems[itemId] ?? 0) !== quantity) {
        idempotencyKey.current = randomUUID();
      }
      return {
        ...current,
        preorderItems: {
          ...current.preorderItems,
          [itemId]: quantity,
        },
      };
    });
  };

  const submit = async () => {
    if (!canReviewMobileRestaurantReservation(selection)) return;
    if (!isAuthenticated) {
      setSubmitError(copy.session);
      return;
    }
    if (!submissionGate.tryBegin()) return;
    setRequestState({ status: "loading", message: copy.loading });
    setSubmitError(null);
    try {
      const created = await createMobileRestaurantReservation(
        {
          businessSlug,
          branchId: selection.branch!.id,
          date: selection.date!,
          startsAt: selection.slot!.startsAt,
          guestCount: selection.guestCount!,
          seatingArea: selection.seatingArea,
          customerNote: selection.customerNote.trim() || null,
          preorderItems: restaurantPreorderItems(selection.preorderItems),
        },
        idempotencyKey.current,
      );
      const persisted = await fetchMobileRestaurantReservationDetail(
        created.data.reservation.id,
      );
      setDetail(persisted.data);
      setStep("detail");
      setRequestState({ status: "idle" });
    } catch (error) {
      const code = error instanceof MobileApiRequestError ? error.code : undefined;
      const recovery = mobileRestaurantReservationFailure(code);
      if (recovery.returnToAvailability) {
        setSelection((current) => ({ ...current, slot: null }));
        setAvailability(null);
        setStep("datetime");
      } else if (recovery.returnToMenu) {
        setStep("menu");
        await loadMenu();
      }
      setSubmitError(recovery.requiresAuthentication ? copy.session : errorMessage(error));
      setRequestState({ status: "idle" });
    } finally {
      submissionGate.finish();
    }
  };

  const setRequestError = (requestId: number, error: unknown) => {
    if (requestId !== sequence.current) return;
    setRequestState({ status: "error", message: errorMessage(error) });
  };

  const goBack = () => {
    setSubmitError(null);
    if (step === "business") return onBack();
    if (step === "branch") return setStep("business");
    if (step === "guests") return setStep("branch");
    if (step === "datetime") return setStep("guests");
    if (step === "seating") return setStep("datetime");
    if (step === "menu") return setStep("seating");
    if (step === "review") return setStep("menu");
    onBack();
  };

  const retry = () => {
    if (step === "business") return loadBusiness();
    if (step === "branch") return loadBranches();
    if (step === "datetime" && selection.date) return void loadAvailability(selection.date);
    if (step === "seating" && selection.date) {
      return void loadAvailability(selection.date, null, false);
    }
    if (step === "menu") return void loadMenu();
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, isRtl && styles.rowRtl]}>
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>{copy.back}</Text>
        </Pressable>
        <Text style={styles.step}>{stepLabel(step, copy)}</Text>
      </View>

      {requestState.status === "error" ? (
        <StateCard message={requestState.message} action={copy.retry} onAction={retry} styles={styles} />
      ) : null}
      {requestState.status === "loading" ? <StateCard message={requestState.message} styles={styles} /> : null}

      {requestState.status !== "error" && step === "business" && business ? (
        <View style={styles.card}>
          <Text style={[styles.eyebrow, isRtl && styles.rtl]}>{copy.profile}</Text>
          <Text style={[styles.title, isRtl && styles.rtl]}>{business.name}</Text>
          <Text style={[styles.body, isRtl && styles.rtl]}>{business.description ?? copy.profile}</Text>
          {!business.supportsReservations ? (
            <Text style={styles.error}>{copy.businessUnavailable}</Text>
          ) : <Primary label={copy.continue} onPress={loadBranches} styles={styles} />}
        </View>
      ) : null}

      {step === "branch" && requestState.status === "idle" ? (
        <ChoiceSection title={copy.branches} empty={copy.emptyBranches} styles={styles}>
          {branches.map((branch) => (
            <Choice key={branch.id} label={branch.name} detail={[branch.city, branch.address].filter(Boolean).join(" · ")} onPress={() => chooseBranch(branch)} styles={styles} />
          ))}
        </ChoiceSection>
      ) : null}

      {step === "guests" ? (
        <View style={styles.card}>
          <Text style={[styles.title, isRtl && styles.rtl]}>{copy.chooseGuests}</Text>
          <TextInput
            accessibilityLabel={copy.chooseGuests}
            keyboardType="number-pad"
            maxLength={3}
            onChangeText={setGuestInput}
            style={styles.input}
            value={guestInput}
          />
          <Primary label={copy.next} onPress={chooseGuests} styles={styles} />
        </View>
      ) : null}

      {step === "datetime" && selection.branch && selection.guestCount ? (
        <View style={styles.card}>
          <Text style={[styles.title, isRtl && styles.rtl]}>{copy.chooseDate}</Text>
          <View style={styles.wrap}>
            {nextDates(selection.branch.timezone).map((date) => (
              <Choice key={date} label={date} active={selection.date === date} onPress={() => void loadAvailability(date)} styles={styles} compact />
            ))}
          </View>
          {availability?.reason ? (
            <Text style={styles.error}>{availability.reason === "RESTAURANT_CLOSED" ? copy.closed : availability.reason === "CAPACITY_UNAVAILABLE" ? copy.capacity : copy.emptySlots}</Text>
          ) : null}
          <View style={styles.wrap}>
            {availability?.slots.map((slot) => (
              <Choice key={slot.startsAt} label={formatTime(slot.startsAt, availability.timezone, locale)} onPress={() => chooseSlot(slot)} styles={styles} compact />
            ))}
          </View>
        </View>
      ) : null}

      {step === "seating" && availability ? (
        <ChoiceSection title={copy.chooseSeating} empty={copy.capacity} styles={styles}>
          <Choice label={copy.anyArea} onPress={() => void chooseSeating(null)} styles={styles} />
          {availability.seatingAreas.map((area) => (
            <Choice key={area} label={area} onPress={() => void chooseSeating(area)} styles={styles} />
          ))}
        </ChoiceSection>
      ) : null}

      {step === "menu" && requestState.status === "idle" ? (
        <View style={styles.card}>
          <Text style={[styles.title, isRtl && styles.rtl]}>{copy.menu}</Text>
          {menu.flatMap((category) => category.items).map((item) => {
            const quantity = selection.preorderItems[item.id] ?? 0;
            return (
              <View key={item.id} style={[styles.menuRow, isRtl && styles.rowRtl]}>
                <View style={styles.flex}>
                  <Text style={[styles.choiceTitle, isRtl && styles.rtl]}>{item.name}</Text>
                  <Text style={[styles.body, isRtl && styles.rtl]}>{item.price} {item.currency}</Text>
                </View>
                <View style={styles.counter}>
                  <Pressable onPress={() => setItemQuantity(item.id, quantity - 1)} style={styles.counterButton}><Text style={styles.choiceTitle}>−</Text></Pressable>
                  <Text style={styles.choiceTitle}>{quantity}</Text>
                  <Pressable onPress={() => setItemQuantity(item.id, quantity + 1)} style={styles.counterButton}><Text style={styles.choiceTitle}>+</Text></Pressable>
                </View>
              </View>
            );
          })}
          <Primary label={copy.review} onPress={() => setStep("review")} styles={styles} />
        </View>
      ) : null}

      {step === "review" ? (
        <View style={styles.card}>
          <Text style={[styles.title, isRtl && styles.rtl]}>{copy.review}</Text>
          <Summary label={business?.name ?? ""} value={selection.branch?.name ?? ""} styles={styles} />
          <Summary label={`${selection.guestCount ?? 0}`} value={selection.slot ? formatTime(selection.slot.startsAt, selection.branch?.timezone ?? "UTC", locale) : ""} styles={styles} />
          <Summary label={copy.chooseSeating} value={selection.seatingArea ?? copy.anyArea} styles={styles} />
          <TextInput
            maxLength={500}
            multiline
            onChangeText={(customerNote) => setSelection((current) => {
              if (current.customerNote !== customerNote) {
                idempotencyKey.current = randomUUID();
              }
              return { ...current, customerNote };
            })}
            placeholder={copy.note}
            placeholderTextColor={theme.colors.mutedForeground}
            style={[styles.input, styles.note]}
            value={selection.customerNote}
          />
          <Primary label={copy.confirm} onPress={() => void submit()} styles={styles} disabled={requestState.status === "loading"} />
          {!isAuthenticated ? <Primary label={copy.signIn} onPress={onSignIn} styles={styles} secondary /> : null}
        </View>
      ) : null}

      {step === "detail" && detail ? (
        <View style={styles.card}>
          <Text style={[styles.eyebrow, isRtl && styles.rtl]}>{copy.detail}</Text>
          <Text style={styles.reference}>{detail.reference}</Text>
          <Text style={[styles.title, isRtl && styles.rtl]}>{detail.restaurant.name}</Text>
          <Summary label={detail.branch.name} value={formatTime(detail.startsAt, detail.timezone, locale)} styles={styles} />
          <Summary label={`${detail.guestCount}`} value={detail.seatingArea ?? copy.anyArea} styles={styles} />
          <Text style={styles.success}>{detail.status}</Text>
        </View>
      ) : null}

      {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
    </View>
  );
}

function nextDates(timezone: string, count = 14) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === type)?.value);
  const start = Date.UTC(part("year"), part("month") - 1, part("day"));
  return Array.from({ length: count }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

function formatTime(value: string, timezone: string, locale: MobileLocale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en" : "ar", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not complete the request.";
}

function stepLabel(step: MobileRestaurantReservationStep, copy: typeof COPY[MobileLocale]) {
  if (step === "business") return copy.profile;
  if (step === "branch") return copy.branches;
  if (step === "guests") return copy.chooseGuests;
  if (step === "datetime") return copy.chooseDate;
  if (step === "seating") return copy.chooseSeating;
  if (step === "menu") return copy.menu;
  if (step === "review") return copy.review;
  return copy.detail;
}

function Primary({ label, onPress, styles, disabled = false, secondary = false }: { label: string; onPress: () => void; styles: ReturnType<typeof createStyles>; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, secondary && styles.secondaryButton, disabled && styles.disabled]}><Text style={secondary ? styles.secondaryText : styles.primaryText}>{label}</Text></Pressable>;
}

function Choice({ label, detail, onPress, styles, compact = false, active = false }: { label: string; detail?: string; onPress: () => void; styles: ReturnType<typeof createStyles>; compact?: boolean; active?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.choice, compact && styles.compactChoice, active && styles.activeChoice]}><Text style={styles.choiceTitle}>{label}</Text>{detail ? <Text style={styles.body}>{detail}</Text> : null}</Pressable>;
}

function ChoiceSection({ title, empty, children, styles }: { title: string; empty: string; children: ReactNode; styles: ReturnType<typeof createStyles> }) {
  const count = Array.isArray(children) ? children.length : children ? 1 : 0;
  return <View style={styles.card}><Text style={styles.title}>{title}</Text>{count ? children : <Text style={styles.body}>{empty}</Text>}</View>;
}

function StateCard({ message, action, onAction, styles }: { message: string; action?: string; onAction?: () => void; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.stateCard}><Text style={styles.body}>{message}</Text>{action && onAction ? <Primary label={action} onPress={onAction} styles={styles} /> : null}</View>;
}

function Summary({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.summary}><Text style={styles.body}>{label}</Text><Text style={styles.choiceTitle}>{value}</Text></View>;
}

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    screen: { gap: 14, padding: 16, paddingBottom: 100 },
    header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    rowRtl: { flexDirection: "row-reverse" },
    rtl: { textAlign: "right", writingDirection: "rtl" },
    flex: { flex: 1 },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    card: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 20, borderWidth: 1, gap: 14, padding: 16 },
    stateCard: { alignItems: "center", backgroundColor: theme.colors.card, borderRadius: 18, gap: 12, padding: 18 },
    eyebrow: { color: theme.colors.accent, fontSize: 13, fontWeight: "800" },
    title: { color: theme.colors.foreground, fontSize: 22, fontWeight: "800" },
    reference: { color: theme.colors.accent, fontSize: 18, fontWeight: "900" },
    step: { color: theme.colors.mutedForeground, fontSize: 13, fontWeight: "700" },
    body: { color: theme.colors.mutedForeground, fontSize: 14, lineHeight: 21 },
    error: { color: "#ef4444", fontSize: 14, fontWeight: "700", padding: 8 },
    success: { color: "#22c55e", fontSize: 15, fontWeight: "900" },
    input: { borderColor: theme.colors.border, borderRadius: 14, borderWidth: 1, color: theme.colors.foreground, minHeight: 48, paddingHorizontal: 14 },
    note: { minHeight: 92, paddingTop: 12, textAlignVertical: "top" },
    primaryButton: { alignItems: "center", backgroundColor: theme.colors.accent, borderRadius: 14, minHeight: 48, justifyContent: "center", paddingHorizontal: 16 },
    primaryText: { color: theme.colors.foregroundInverse, fontSize: 15, fontWeight: "900" },
    secondaryButton: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 12, borderWidth: 1, minHeight: 42, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
    secondaryText: { color: theme.colors.foreground, fontSize: 14, fontWeight: "800" },
    disabled: { opacity: 0.5 },
    choice: { borderColor: theme.colors.border, borderRadius: 15, borderWidth: 1, gap: 4, marginTop: 8, padding: 14 },
    compactChoice: { minWidth: 92, marginTop: 0 },
    activeChoice: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentMuted },
    choiceTitle: { color: theme.colors.foreground, fontSize: 15, fontWeight: "800" },
    menuRow: { alignItems: "center", borderBottomColor: theme.colors.border, borderBottomWidth: 1, flexDirection: "row", gap: 12, paddingVertical: 10 },
    counter: { alignItems: "center", flexDirection: "row", gap: 10 },
    counterButton: { alignItems: "center", borderColor: theme.colors.border, borderRadius: 10, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
    summary: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 },
  });
}
