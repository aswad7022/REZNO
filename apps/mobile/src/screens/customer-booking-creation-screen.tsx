import { randomUUID } from "expo-crypto";
import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  createMobileBooking,
  fetchMobileBookingAvailability,
  fetchMobileBookingBranches,
  fetchMobileBookingBusiness,
  fetchMobileBookingDetail,
  fetchMobileBookingServices,
  fetchMobileBookingStaff,
} from "../api/bookings";
import { MobileApiRequestError } from "../api/client";
import {
  canReviewMobileBooking,
  createMobileBookingSubmissionGate,
  EMPTY_BOOKING_SELECTION,
  mobileBookingFailureRecovery,
  nextBookingDates,
  selectMobileBookingBranch,
  selectMobileBookingDate,
  selectMobileBookingService,
  selectMobileBookingSlot,
  selectMobileBookingStaff,
  type MobileBookingSelection,
  type MobileBookingStep,
} from "../bookings/state";
import type { MobileLocale } from "../i18n/labels";
import type { MobileTheme } from "../theme/tokens";
import type {
  MobileBookingAvailability,
  MobileBookingBranch,
  MobileBookingBusiness,
  MobileBookingService,
  MobileBookingStaff,
  MobilePersistedBooking,
} from "../types/bookings";

type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

type BookingCopy = {
  automatic: string;
  back: string;
  branches: string;
  businessUnavailable: string;
  chooseDate: string;
  chooseService: string;
  chooseStaff: string;
  chooseTime: string;
  confirm: string;
  confirmed: string;
  continue: string;
  emptyBranches: string;
  emptyServices: string;
  emptySlots: string;
  emptyStaff: string;
  loading: string;
  retry: string;
  review: string;
  sessionRequired: string;
  signIn: string;
};

const COPY: Record<MobileLocale, BookingCopy> = {
  ar: {
    automatic: "أي مختص متاح",
    back: "رجوع",
    branches: "اختر الفرع",
    businessUnavailable: "هذا النشاط لا يدعم حجز الخدمات في هذا المسار.",
    chooseDate: "اختر التاريخ",
    chooseService: "اختر الخدمة",
    chooseStaff: "اختر المختص",
    chooseTime: "الأوقات المتاحة",
    confirm: "تأكيد الحجز",
    confirmed: "تم إنشاء الحجز وحفظه",
    continue: "متابعة",
    emptyBranches: "لا توجد فروع متاحة لهذه الخدمة.",
    emptyServices: "لا توجد خدمات منشورة للحجز.",
    emptySlots: "لا توجد أوقات متاحة في هذا اليوم.",
    emptyStaff: "لا يوجد مختص مؤهل متاح لهذه الخدمة.",
    loading: "جارٍ تحميل بيانات الحجز…",
    retry: "إعادة المحاولة",
    review: "مراجعة الحجز",
    sessionRequired: "سجّل الدخول بحساب عميل مكتمل لإنشاء الحجز.",
    signIn: "تسجيل الدخول",
  },
  en: {
    automatic: "Any available professional",
    back: "Back",
    branches: "Choose a branch",
    businessUnavailable: "This business uses a different reservation flow.",
    chooseDate: "Choose a date",
    chooseService: "Choose a service",
    chooseStaff: "Choose a professional",
    chooseTime: "Available times",
    confirm: "Confirm booking",
    confirmed: "Booking created and persisted",
    continue: "Continue",
    emptyBranches: "No branches are available for this service.",
    emptyServices: "No services are published for booking.",
    emptySlots: "No times are available on this date.",
    emptyStaff: "No eligible professional is available for this service.",
    loading: "Loading booking data…",
    retry: "Retry",
    review: "Review booking",
    sessionRequired: "Sign in with a completed customer account to book.",
    signIn: "Sign in",
  },
  ckb: {
    automatic: "هەر پسپۆڕێکی بەردەست",
    back: "گەڕانەوە",
    branches: "لق هەڵبژێرە",
    businessUnavailable: "ئەم کارە ڕێڕەوی حجزکردنی جیاوازی هەیە.",
    chooseDate: "بەروار هەڵبژێرە",
    chooseService: "خزمەتگوزاری هەڵبژێرە",
    chooseStaff: "پسپۆڕ هەڵبژێرە",
    chooseTime: "کاتە بەردەستەکان",
    confirm: "پشتڕاستکردنەوەی حجز",
    confirmed: "حجزەکە دروست و پاشەکەوت کرا",
    continue: "بەردەوام بە",
    emptyBranches: "هیچ لقێک بۆ ئەم خزمەتگوزارییە بەردەست نییە.",
    emptyServices: "هیچ خزمەتگوزارییەک بۆ حجز بڵاونەکراوەتەوە.",
    emptySlots: "هیچ کاتێک لەم بەروارەدا بەردەست نییە.",
    emptyStaff: "هیچ پسپۆڕێکی شیاو بۆ ئەم خزمەتگوزارییە نییە.",
    loading: "داتای حجز بار دەکرێت…",
    retry: "دووبارە هەوڵ بدە",
    review: "پێداچوونەوەی حجز",
    sessionRequired: "بۆ حجزکردن بچۆ ژوورەوە بە هەژمارێکی تەواو.",
    signIn: "چوونەژوورەوە",
  },
};

export function CustomerBookingCreationScreen({
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
  const [step, setStep] = useState<MobileBookingStep>("business");
  const [selection, setSelection] = useState<MobileBookingSelection>(
    EMPTY_BOOKING_SELECTION,
  );
  const [business, setBusiness] = useState<MobileBookingBusiness | null>(null);
  const [services, setServices] = useState<MobileBookingService[]>([]);
  const [branches, setBranches] = useState<MobileBookingBranch[]>([]);
  const [staff, setStaff] = useState<MobileBookingStaff[]>([]);
  const [availability, setAvailability] =
    useState<MobileBookingAvailability | null>(null);
  const [detail, setDetail] = useState<MobilePersistedBooking | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({
    status: "loading",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submissionGate = useRef(createMobileBookingSubmissionGate()).current;
  const requestSequence = useRef(0);
  const idempotencyKey = useRef(randomUUID());

  const loadBusiness = useCallback(() => {
    const requestId = ++requestSequence.current;
    setRequestState({ status: "loading" });
    fetchMobileBookingBusiness(businessSlug)
      .then(async (businessResponse) => {
        if (requestId !== requestSequence.current) return;
        setBusiness(businessResponse.data);
        if (!businessResponse.data.supportsServiceBooking) {
          setServices([]);
          setRequestState({ status: "idle" });
          return;
        }
        const servicesResponse = await fetchMobileBookingServices(businessSlug);
        if (requestId !== requestSequence.current) return;
        setServices(servicesResponse.data);
        setRequestState({ status: "idle" });
      })
      .catch((error: unknown) => {
        if (requestId !== requestSequence.current) return;
        setRequestState({ status: "error", message: errorMessage(error) });
      });
  }, [businessSlug]);

  useEffect(() => {
    void Promise.resolve().then(loadBusiness);
    return () => {
      requestSequence.current += 1;
    };
  }, [loadBusiness]);

  const loadBranches = (service: MobileBookingService) => {
    const requestId = ++requestSequence.current;
    setSelection((current) => selectMobileBookingService(current, service));
    setBranches([]);
    setStep("branch");
    setRequestState({ status: "loading" });
    fetchMobileBookingBranches(businessSlug, service.id)
      .then((response) => {
        if (requestId !== requestSequence.current) return;
        setBranches(response.data);
        setRequestState({ status: "idle" });
      })
      .catch((error: unknown) => {
        if (requestId !== requestSequence.current) return;
        setRequestState({ status: "error", message: errorMessage(error) });
      });
  };

  const loadStaff = (branch: MobileBookingBranch) => {
    const requestId = ++requestSequence.current;
    setSelection((current) => selectMobileBookingBranch(current, branch));
    setStaff([]);
    setAvailability(null);
    setStep("staff");
    setRequestState({ status: "loading" });
    fetchMobileBookingStaff(branch.branchServiceId)
      .then((response) => {
        if (requestId !== requestSequence.current) return;
        setStaff(response.data.staff);
        setRequestState({ status: "idle" });
        if (response.data.staffSelectionMode === "NONE") {
          setStep("datetime");
        }
      })
      .catch((error: unknown) => {
        if (requestId !== requestSequence.current) return;
        setRequestState({ status: "error", message: errorMessage(error) });
      });
  };

  const chooseStaff = (memberId: string | null) => {
    setSelection((current) => selectMobileBookingStaff(current, memberId));
    setAvailability(null);
    setRequestState({ status: "idle" });
    setStep("datetime");
  };

  const loadAvailability = (date: string) => {
    if (!selection.branch) return;
    const requestId = ++requestSequence.current;
    setSelection((current) => selectMobileBookingDate(current, date));
    setAvailability(null);
    setRequestState({ status: "loading" });
    fetchMobileBookingAvailability({
      branchServiceId: selection.branch.branchServiceId,
      date,
      memberId: selection.memberId,
    })
      .then((response) => {
        if (requestId !== requestSequence.current) return;
        setAvailability(response.data);
        setRequestState({ status: "idle" });
      })
      .catch((error: unknown) => {
        if (requestId !== requestSequence.current) return;
        setRequestState({ status: "error", message: errorMessage(error) });
      });
  };

  const chooseSlot = (slot: MobileBookingAvailability["slots"][number]) => {
    idempotencyKey.current = randomUUID();
    setSelection((current) => selectMobileBookingSlot(current, slot));
    setSubmitError(null);
    setStep("review");
  };

  const submitBooking = async () => {
    if (!canReviewMobileBooking(selection)) return;
    if (!isAuthenticated) {
      setSubmitError(copy.sessionRequired);
      return;
    }
    if (!submissionGate.tryBegin()) return;
    setSubmitError(null);
    setRequestState({ status: "loading" });
    try {
      const created = await createMobileBooking(
        {
          branchServiceId: selection.branch!.branchServiceId,
          date: selection.date!,
          memberId: selection.slot!.memberId,
          startsAt: selection.slot!.startsAt,
        },
        idempotencyKey.current,
      );
      const persisted = await fetchMobileBookingDetail(
        created.data.booking.id,
      );
      setDetail(persisted.data);
      setStep("detail");
      setRequestState({ status: "idle" });
    } catch (error) {
      const requestError =
        error instanceof MobileApiRequestError ? error : null;
      const recovery = mobileBookingFailureRecovery(requestError?.code);
      if (recovery.returnToSlots) {
        setSelection((current) => ({ ...current, slot: null }));
        setAvailability(null);
        setStep("datetime");
      }
      setSubmitError(
        recovery.requiresAuthentication
          ? copy.sessionRequired
          : errorMessage(error),
      );
      setRequestState({ status: "idle" });
    } finally {
      submissionGate.finish();
    }
  };

  const goBack = () => {
    setSubmitError(null);
    if (step === "business") return onBack();
    if (step === "service") return setStep("business");
    if (step === "branch") return setStep("service");
    if (step === "staff") return setStep("branch");
    if (step === "datetime") {
      return setStep(
        selection.branch?.staffSelectionMode === "NONE" ? "branch" : "staff",
      );
    }
    if (step === "review") return setStep("datetime");
    onBack();
  };

  const retryCurrent = () => {
    if (step === "business" || step === "service") return loadBusiness();
    if (step === "branch" && selection.service) {
      return loadBranches(selection.service);
    }
    if (step === "staff" && selection.branch) return loadStaff(selection.branch);
    if (step === "datetime" && selection.date) {
      return loadAvailability(selection.date);
    }
  };

  if (requestState.status === "loading" && !business) {
    return <StateCard message={copy.loading} styles={styles} />;
  }
  if (requestState.status === "error" && !business) {
    return (
      <StateCard
        action={copy.retry}
        message={requestState.message}
        onAction={loadBusiness}
        styles={styles}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, isRtl && styles.rowRtl]}>
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.backButton}>
          <Text style={styles.backText}>{copy.back}</Text>
        </Pressable>
        <View style={styles.progressPill}>
          <Text style={styles.progressText}>{stepLabel(step, copy)}</Text>
        </View>
      </View>

      {step === "business" && business ? (
        <View style={styles.heroCard}>
          <Text style={[styles.title, isRtl && styles.rtlText]}>{business.name}</Text>
          <Text style={[styles.eyebrow, isRtl && styles.rtlText]}>
            {business.categoryName ?? business.vertical}
          </Text>
          <Text style={[styles.body, isRtl && styles.rtlText]}>
            {business.description ?? copy.chooseService}
          </Text>
          {business.averageRating !== null ? (
            <Text style={[styles.body, isRtl && styles.rtlText]}>
              ★ {business.averageRating.toFixed(1)} · {business.reviewCount}
            </Text>
          ) : null}
          {!business.supportsServiceBooking ? (
            <Text style={[styles.errorText, isRtl && styles.rtlText]}>
              {copy.businessUnavailable}
            </Text>
          ) : (
            <PrimaryAction
              label={copy.continue}
              onPress={() => setStep("service")}
              styles={styles}
            />
          )}
        </View>
      ) : null}

      {step === "service" ? (
        <ChoiceSection
          empty={copy.emptyServices}
          isRtl={isRtl}
          title={copy.chooseService}
          styles={styles}
        >
          {services.map((service) => (
            <ChoiceCard
              key={service.id}
              label={service.name}
              meta={`${service.durationMinutes} min · ${service.startingPrice}`}
              onPress={() => loadBranches(service)}
              styles={styles}
            />
          ))}
        </ChoiceSection>
      ) : null}

      {step === "branch" ? (
        <ChoiceSection
          empty={requestState.status === "loading" ? copy.loading : copy.emptyBranches}
          isRtl={isRtl}
          title={copy.branches}
          styles={styles}
        >
          {branches.map((branch) => (
            <ChoiceCard
              key={branch.branchServiceId}
              label={branch.name}
              meta={`${branch.city ?? branch.locationLabel ?? ""} · ${branch.price}`}
              onPress={() => loadStaff(branch)}
              styles={styles}
            />
          ))}
        </ChoiceSection>
      ) : null}

      {step === "staff" ? (
        <ChoiceSection
          empty={requestState.status === "loading" ? copy.loading : copy.emptyStaff}
          isRtl={isRtl}
          title={copy.chooseStaff}
          styles={styles}
        >
          {selection.branch?.staffSelectionMode === "OPTIONAL" ? (
            <ChoiceCard
              label={copy.automatic}
              meta={copy.chooseTime}
              onPress={() => chooseStaff(null)}
              styles={styles}
            />
          ) : null}
          {staff.map((member) => (
            <ChoiceCard
              key={member.id}
              label={member.name}
              meta={member.specialties.join(" · ") || copy.chooseTime}
              onPress={() => chooseStaff(member.id)}
              styles={styles}
            />
          ))}
        </ChoiceSection>
      ) : null}

      {step === "datetime" && selection.branch ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>
            {copy.chooseDate}
          </Text>
          <View style={styles.wrapRow}>
            {nextBookingDates(selection.branch.timezone).map((date) => (
              <ChoiceChip
                key={date}
                label={formatDate(date, locale)}
                onPress={() => loadAvailability(date)}
                selected={selection.date === date}
                styles={styles}
              />
            ))}
          </View>
          <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>
            {copy.chooseTime}
          </Text>
          {requestState.status === "loading" ? (
            <Text style={styles.body}>{copy.loading}</Text>
          ) : availability?.slots.length ? (
            <View style={styles.wrapRow}>
              {availability.slots.map((slot) => (
                <ChoiceChip
                  key={`${slot.startsAt}:${slot.memberId ?? "none"}`}
                  label={formatTime(slot.startsAt, availability.timezone, locale)}
                  meta={slot.memberName ?? copy.automatic}
                  onPress={() => chooseSlot(slot)}
                  selected={selection.slot?.startsAt === slot.startsAt}
                  styles={styles}
                />
              ))}
            </View>
          ) : selection.date ? (
            <Text style={styles.body}>{copy.emptySlots}</Text>
          ) : null}
          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        </View>
      ) : null}

      {step === "review" && selection.service && selection.branch && selection.slot ? (
        <View style={styles.summaryCard}>
          <Text style={[styles.title, isRtl && styles.rtlText]}>{copy.review}</Text>
          <SummaryRow label={copy.chooseService} value={selection.service.name} styles={styles} />
          <SummaryRow label={copy.branches} value={selection.branch.name} styles={styles} />
          <SummaryRow
            label={copy.chooseStaff}
            value={selection.slot.memberName ?? copy.automatic}
            styles={styles}
          />
          <SummaryRow
            label={copy.chooseTime}
            value={`${selection.date} · ${formatTime(selection.slot.startsAt, selection.branch.timezone, locale)}`}
            styles={styles}
          />
          <SummaryRow label="Total" value={selection.branch.price} styles={styles} />
          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
          {submitError === copy.sessionRequired ? (
            <SecondaryAction label={copy.signIn} onPress={onSignIn} styles={styles} />
          ) : null}
          <PrimaryAction
            disabled={requestState.status === "loading"}
            label={requestState.status === "loading" ? copy.loading : copy.confirm}
            onPress={() => void submitBooking()}
            styles={styles}
          />
        </View>
      ) : null}

      {step === "detail" && detail ? (
        <View style={styles.successCard}>
          <Text style={styles.successMark}>✓</Text>
          <Text style={[styles.title, isRtl && styles.rtlText]}>{copy.confirmed}</Text>
          <Text selectable style={styles.reference}>{detail.reference}</Text>
          <SummaryRow label={copy.chooseService} value={detail.serviceName} styles={styles} />
          <SummaryRow label={copy.branches} value={detail.branchName} styles={styles} />
          <SummaryRow
            label={copy.chooseStaff}
            value={detail.memberName ?? copy.automatic}
            styles={styles}
          />
          <SummaryRow
            label={copy.chooseTime}
            value={formatDateTime(detail.startsAt, detail.timezone, locale)}
            styles={styles}
          />
          <SummaryRow label="Status" value={detail.status} styles={styles} />
          <SecondaryAction label={copy.back} onPress={onBack} styles={styles} />
        </View>
      ) : null}

      {requestState.status === "error" && business ? (
        <StateCard
          action={copy.retry}
          message={requestState.message}
          onAction={retryCurrent}
          styles={styles}
        />
      ) : null}
    </View>
  );
}

function ChoiceSection({
  children,
  empty,
  isRtl,
  styles,
  title,
}: {
  children: React.ReactNode;
  empty: string;
  isRtl: boolean;
  styles: BookingStyles;
  title: string;
}) {
  const childArray = Children.toArray(children);
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>{title}</Text>
      <View style={styles.choiceList}>{childArray.length ? childArray : <Text style={styles.body}>{empty}</Text>}</View>
    </View>
  );
}

function ChoiceCard({ label, meta, onPress, styles }: { label: string; meta: string; onPress: () => void; styles: BookingStyles }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.choiceCard, pressed && styles.pressed]}>
      <Text style={styles.choiceTitle}>{label}</Text>
      <Text style={styles.choiceMeta}>{meta}</Text>
    </Pressable>
  );
}

function ChoiceChip({ label, meta, onPress, selected, styles }: { label: string; meta?: string; onPress: () => void; selected: boolean; styles: BookingStyles }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
      {meta ? <Text style={[styles.chipMeta, selected && styles.chipTextSelected]}>{meta}</Text> : null}
    </Pressable>
  );
}

function PrimaryAction({ disabled = false, label, onPress, styles }: { disabled?: boolean; label: string; onPress: () => void; styles: BookingStyles }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryAction({ label, onPress, styles }: { label: string; onPress: () => void; styles: BookingStyles }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

function SummaryRow({ label, styles, value }: { label: string; styles: BookingStyles; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function StateCard({ action, message, onAction, styles }: { action?: string; message: string; onAction?: () => void; styles: BookingStyles }) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.body}>{message}</Text>
      {action && onAction ? <SecondaryAction label={action} onPress={onAction} styles={styles} /> : null}
    </View>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Booking data could not be loaded.";
}

function stepLabel(step: MobileBookingStep, copy: BookingCopy) {
  if (step === "business") return "1/6";
  if (step === "service") return "2/6";
  if (step === "branch") return "3/6";
  if (step === "staff") return "4/6";
  if (step === "datetime") return "5/6";
  if (step === "review") return `6/6 · ${copy.review}`;
  return copy.confirmed;
}

function formatDate(date: string, locale: MobileLocale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en" : "ar-IQ", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function formatTime(instant: string, timezone: string, locale: MobileLocale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en" : "ar-IQ", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(instant));
}

function formatDateTime(instant: string, timezone: string, locale: MobileLocale) {
  return new Intl.DateTimeFormat(locale === "en" ? "en" : "ar-IQ", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(instant));
}

type BookingStyles = ReturnType<typeof createStyles>;

function createStyles(theme: MobileTheme) {
  return StyleSheet.create({
    screen: { gap: 16, paddingBottom: 120 },
    header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    rowRtl: { flexDirection: "row-reverse" },
    backButton: { borderColor: theme.colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
    backText: { color: theme.colors.foreground, fontSize: 14, fontWeight: "700" },
    progressPill: { backgroundColor: theme.colors.goldSoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    progressText: { color: theme.colors.gold, fontSize: 12, fontWeight: "800" },
    heroCard: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 28, borderWidth: 1, gap: 12, padding: 22 },
    eyebrow: { color: theme.colors.gold, fontSize: 13, fontWeight: "700" },
    title: { color: theme.colors.foreground, fontSize: 24, fontWeight: "900" },
    body: { color: theme.colors.mutedForeground, fontSize: 15, lineHeight: 24 },
    rtlText: { textAlign: "right", writingDirection: "rtl" },
    section: { gap: 14 },
    sectionTitle: { color: theme.colors.foreground, fontSize: 21, fontWeight: "900" },
    choiceList: { gap: 10 },
    choiceCard: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 22, borderWidth: 1, gap: 5, padding: 17 },
    choiceTitle: { color: theme.colors.foreground, fontSize: 17, fontWeight: "800", textAlign: "right" },
    choiceMeta: { color: theme.colors.mutedForeground, fontSize: 13, textAlign: "right" },
    wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    chip: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 18, borderWidth: 1, minWidth: 104, paddingHorizontal: 12, paddingVertical: 12 },
    chipSelected: { backgroundColor: theme.colors.gold, borderColor: theme.colors.gold },
    chipText: { color: theme.colors.foreground, fontSize: 13, fontWeight: "800", textAlign: "center" },
    chipMeta: { color: theme.colors.mutedForeground, fontSize: 10, marginTop: 3, textAlign: "center" },
    chipTextSelected: { color: theme.colors.foregroundInverse },
    summaryCard: { backgroundColor: theme.colors.card, borderColor: theme.colors.gold, borderRadius: 28, borderWidth: 1, gap: 12, padding: 20 },
    summaryRow: { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth, gap: 5, paddingBottom: 10 },
    summaryLabel: { color: theme.colors.mutedForeground, fontSize: 12 },
    summaryValue: { color: theme.colors.foreground, fontSize: 16, fontWeight: "800" },
    primaryButton: { alignItems: "center", backgroundColor: theme.colors.gold, borderRadius: 18, minHeight: 54, justifyContent: "center", marginTop: 6, paddingHorizontal: 18 },
    primaryText: { color: theme.colors.foregroundInverse, fontSize: 16, fontWeight: "900" },
    secondaryButton: { alignItems: "center", borderColor: theme.colors.gold, borderRadius: 18, borderWidth: 1, minHeight: 48, justifyContent: "center", paddingHorizontal: 16 },
    secondaryText: { color: theme.colors.gold, fontSize: 14, fontWeight: "800" },
    disabled: { backgroundColor: theme.colors.disabled },
    pressed: { opacity: 0.78 },
    errorText: { color: theme.colors.danger, fontSize: 14, lineHeight: 21 },
    successCard: { backgroundColor: theme.colors.successSoft, borderColor: theme.colors.success, borderRadius: 28, borderWidth: 1, gap: 13, padding: 20 },
    successMark: { color: theme.colors.success, fontSize: 42, fontWeight: "900" },
    reference: { color: theme.colors.gold, fontSize: 18, fontWeight: "900" },
    stateCard: { alignItems: "stretch", backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: 22, borderWidth: 1, gap: 12, padding: 18 },
  });
}
