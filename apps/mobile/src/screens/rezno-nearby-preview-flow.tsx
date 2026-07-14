import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from "react-native";

import { TOUCH_HIT_SLOP } from "../components/mobile-chrome";
import {
  PremiumCheck,
  PremiumEntrance,
  PremiumPressable,
} from "../components/premium-motion";
import type { MobileResponsiveLayout } from "../layout/responsive-metrics";
import { useMobileResponsiveLayout } from "../layout/use-mobile-responsive-layout";
import type { MobileTheme } from "../theme/tokens";
import type {
  NearbyVisualQaFixture,
  PreviewBusinessVertical,
  PreviewSelectionOption,
  PreviewTimeOption,
} from "./fixtures/nearby-visual-qa-fixtures";

const PREVIEW_FONT = {
  kufiBold: "NotoKufiArabic-Bold",
  uiMedium: "NotoSansArabicUI-Medium",
  uiRegular: "NotoSansArabicUI-Regular",
  uiSemiBold: "NotoSansArabicUI-SemiBold",
} as const;

type PreviewRoute =
  | { name: "configuration" }
  | { name: "confirmation" }
  | { name: "detail" }
  | { name: "review"; mode: "checkout" | "confirmed" }
  | { name: "schedule" };

type PreviewDateOption = {
  day: string;
  id: string;
  label: string;
};

type PreviewSummaryRow = {
  label: string;
  value: string;
};

type PreviewStyles = ReturnType<typeof createStyles>;

const CUSTOM_GUEST_OPTION_ID = "restaurant-guests-custom";

const PREVIEW_DATES: readonly PreviewDateOption[] = [
  { day: "اليوم", id: "preview-date-today", label: "11 يوليو" },
  { day: "غداً", id: "preview-date-tomorrow", label: "12 يوليو" },
  { day: "الاثنين", id: "preview-date-monday", label: "13 يوليو" },
  { day: "الثلاثاء", id: "preview-date-tuesday", label: "14 يوليو" },
  { day: "الأربعاء", id: "preview-date-wednesday", label: "15 يوليو" },
];

/* eslint-disable @typescript-eslint/no-require-imports -- Expo bundles existing local assets through static require(). */
const PREVIEW_ICONS = {
  backLtr: require("../../assets/icons/common/back-arrow-ltr.png") as ImageSourcePropType,
  backRtl: require("../../assets/icons/common/back-arrow-rtl.png") as ImageSourcePropType,
  calendar: require("../../assets/icons/common/calendar.png") as ImageSourcePropType,
  check: require("../../assets/icons/common/check-success.png") as ImageSourcePropType,
  clock: require("../../assets/icons/common/clock.png") as ImageSourcePropType,
  heart: require("../../assets/icons/common/heart.png") as ImageSourcePropType,
  location: require("../../assets/icons/common/location-pin.png") as ImageSourcePropType,
  payment: require("../../assets/icons/common/payment-card.png") as ImageSourcePropType,
  share: require("../../assets/icons/common/share.png") as ImageSourcePropType,
  star: require("../../assets/icons/common/star-rating.png") as ImageSourcePropType,
  user: require("../../assets/icons/nav/account.png") as ImageSourcePropType,
};

const PREVIEW_CATEGORY_ICONS: Record<
  PreviewBusinessVertical,
  ImageSourcePropType
> = {
  clinic: require("../../assets/icons/categories/clinic.png") as ImageSourcePropType,
  restaurant: require("../../assets/icons/categories/restaurant.png") as ImageSourcePropType,
  salon: require("../../assets/icons/categories/salon.png") as ImageSourcePropType,
};
/* eslint-enable @typescript-eslint/no-require-imports */

export type ReznoNearbyPreviewFlowHandle = {
  goBack: () => void;
};

type ReznoNearbyPreviewFlowProps = {
  business: NearbyVisualQaFixture;
  isRtl: boolean;
  onExit: () => void;
  theme: MobileTheme;
};

export const ReznoNearbyPreviewFlow = forwardRef<
  ReznoNearbyPreviewFlowHandle,
  ReznoNearbyPreviewFlowProps
>(function ReznoNearbyPreviewFlow(
  { business, isRtl, onExit, theme },
  ref,
) {
  const layout = useMobileResponsiveLayout();
  const styles = useMemo(() => createStyles(theme, layout), [layout, theme]);
  const [routeStack, setRouteStack] = useState<readonly PreviewRoute[]>([
    { name: "detail" },
  ]);
  const [transitionDirection, setTransitionDirection] =
    useState<"back" | "forward">("forward");
  const [primaryId, setPrimaryId] = useState(
    business.booking.defaultPrimaryId,
  );
  const [secondaryId, setSecondaryId] = useState(
    business.booking.defaultSecondaryId,
  );
  const [dateId, setDateId] = useState(PREVIEW_DATES[0]?.id ?? "");
  const [timeId, setTimeId] = useState(business.booking.defaultTimeId);
  const [note, setNote] = useState("");
  const [customGuestCount, setCustomGuestCount] = useState("");

  const route = routeStack[routeStack.length - 1] ?? { name: "detail" };
  const selectedPrimary =
    business.vertical === "restaurant" &&
    primaryId === CUSTOM_GUEST_OPTION_ID &&
    customGuestCount
      ? {
          duration: null,
          id: CUSTOM_GUEST_OPTION_ID,
          label: customGuestCount,
          price: null,
          supportingText: null,
        }
      : findSelectionOption(business.primaryOptions, primaryId);
  const selectedSecondary = findSelectionOption(
    business.secondaryOptions,
    secondaryId,
  );
  const selectedDate = PREVIEW_DATES.find((date) => date.id === dateId);
  const selectedTime = business.booking.times.find((time) => time.id === timeId);
  const summaryRows = buildPreviewSummaryRows({
    business,
    note,
    selectedDate,
    selectedPrimary,
    selectedSecondary,
    selectedTime,
  });
  const summaryHighlight = buildPreviewHighlight(
    business,
    selectedPrimary,
    selectedSecondary,
  );

  const pushRoute = useCallback((nextRoute: PreviewRoute) => {
    setTransitionDirection("forward");
    setRouteStack((current) => [...current, nextRoute]);
    AccessibilityInfo.announceForAccessibility(
      getPreviewHeaderCopy(nextRoute, business).title,
    );
  }, [business]);

  const handleCustomGuestConfirm = useCallback((value: string) => {
    setCustomGuestCount(value);
    setPrimaryId(CUSTOM_GUEST_OPTION_ID);
  }, []);

  const handleBack = useCallback(() => {
    if (routeStack.length <= 1) {
      onExit();
      return;
    }

    const previousRoute = routeStack[routeStack.length - 2];
    setTransitionDirection("back");
    setRouteStack((current) => current.slice(0, -1));
    if (previousRoute) {
      AccessibilityInfo.announceForAccessibility(
        getPreviewHeaderCopy(previousRoute, business).title,
      );
    }
  }, [business, onExit, routeStack]);

  useImperativeHandle(ref, () => ({ goBack: handleBack }), [handleBack]);

  const header = getPreviewHeaderCopy(route, business);
  let body: ReactNode;
  let footer: ReactNode;

  if (route.name === "detail") {
    body = (
      <PreviewBusinessDetailScreen
        business={business}
        isRtl={isRtl}
        styles={styles}
      />
    );
    footer = (
      <PreviewBottomCTA
        accessibilityHint="يفتح إعدادات حجز محلية للمعاينة فقط."
        label={business.ctaLabel}
        onPress={() => pushRoute({ name: "configuration" })}
        styles={styles}
      />
    );
  } else if (route.name === "configuration") {
    body = (
      <PreviewBookingConfiguration
        business={business}
        customGuestCount={customGuestCount}
        onCustomGuestConfirm={handleCustomGuestConfirm}
        onPrimarySelect={setPrimaryId}
        onSecondarySelect={setSecondaryId}
        primaryId={primaryId}
        secondaryId={secondaryId}
        styles={styles}
      />
    );
    footer = (
      <PreviewBottomCTA
        accessibilityHint="ينتقل إلى اختيار تاريخ ووقت المعاينة."
        label="اختيار التاريخ والوقت"
        onPress={() => pushRoute({ name: "schedule" })}
        styles={styles}
      />
    );
  } else if (route.name === "schedule") {
    body = (
      <PreviewScheduleScreen
        business={business}
        dateId={dateId}
        note={note}
        onDateSelect={setDateId}
        onNoteChange={setNote}
        onTimeSelect={setTimeId}
        styles={styles}
        timeId={timeId}
      />
    );
    footer = (
      <PreviewBottomCTA
        accessibilityHint="يفتح مراجعة محلية لتفاصيل الحجز دون إرسالها."
        label="مراجعة الحجز"
        onPress={() => pushRoute({ mode: "checkout", name: "review" })}
        styles={styles}
      />
    );
  } else if (route.name === "review") {
    body = (
      <PreviewBookingSummary
        business={business}
        confirmed={route.mode === "confirmed"}
        highlight={summaryHighlight}
        rows={summaryRows}
        styles={styles}
      />
    );
    footer =
      route.mode === "confirmed" ? (
        <PreviewBottomCTA
          accessibilityHint="يعود إلى شاشة التأكيد المحلية."
          label="العودة إلى التأكيد"
          onPress={handleBack}
          styles={styles}
        />
      ) : (
        <PreviewBottomCTA
          accessibilityHint="يؤكد المعاينة محلياً فقط ولا ينشئ حجزاً حقيقياً."
          label={getConfirmationCtaLabel(business.vertical)}
          onPress={() => pushRoute({ name: "confirmation" })}
          styles={styles}
        />
      );
  } else {
    body = (
      <PreviewConfirmationView
        business={business}
        rows={summaryRows}
        styles={styles}
      />
    );
    footer = (
      <PreviewBottomCTA
        accessibilityHint="يعرض تفاصيل التأكيد المحلي داخل المعاينة."
        label="عرض تفاصيل الحجز"
        onPress={() => pushRoute({ mode: "confirmed", name: "review" })}
        onSecondaryPress={onExit}
        secondaryAccessibilityHint="يغلق المعاينة ويعود إلى شاشة الاستكشاف."
        secondaryLabel="العودة للاستكشاف"
        styles={styles}
      />
    );
  }

  return (
    <PreviewScreenScaffold
      footer={footer}
      header={
        <PreviewFlowHeader
          alignCopyLeft={route.name === "detail"}
          eyebrow={header.eyebrow}
          isRtl={isRtl}
          onBack={handleBack}
          progressStep={getPreviewProgressStep(route)}
          styles={styles}
          subtitle={header.subtitle}
          title={header.title}
        />
      }
      routeKey={
        route.name === "review" ? `${route.name}-${route.mode}` : route.name
      }
      styles={styles}
      transitionDirection={transitionDirection}
    >
      {body}
    </PreviewScreenScaffold>
  );
});

function PreviewScreenScaffold({
  children,
  footer,
  header,
  routeKey,
  styles,
  transitionDirection,
}: {
  children: ReactNode;
  footer: ReactNode;
  header: ReactNode;
  routeKey: string;
  styles: PreviewStyles;
  transitionDirection: "back" | "forward";
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      {header}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        key={routeKey}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <PremiumEntrance
          distance={0}
          horizontalDistance={transitionDirection === "forward" ? -14 : 14}
          key={routeKey}
        >
          {children}
        </PremiumEntrance>
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}

function PreviewFlowHeader({
  alignCopyLeft,
  eyebrow,
  isRtl,
  onBack,
  progressStep,
  styles,
  subtitle,
  title,
}: {
  alignCopyLeft: boolean;
  eyebrow: string;
  isRtl: boolean;
  onBack: () => void;
  progressStep: number | null;
  styles: PreviewStyles;
  subtitle: string;
  title: string;
}) {
  return (
    <View style={styles.header}>
      <PremiumPressable
        accessibilityHint="يعود إلى الشاشة السابقة مع الاحتفاظ باختيارات المعاينة."
        accessibilityLabel="رجوع"
        accessibilityRole="button"
        hitSlop={TOUCH_HIT_SLOP}
        onPress={onBack}
        scaleTo={0.94}
        style={styles.backButton}
      >
        <Image
          accessible={false}
          alt=""
          resizeMode="contain"
          source={isRtl ? PREVIEW_ICONS.backRtl : PREVIEW_ICONS.backLtr}
          style={styles.backIcon}
        />
      </PremiumPressable>
      <View
        style={[
          styles.headerCopy,
          alignCopyLeft && styles.headerCopyDetail,
        ]}
      >
        {!progressStep ? (
          <Text
            numberOfLines={1}
            style={[
              styles.eyebrow,
              alignCopyLeft && styles.headerDetailText,
            ]}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          numberOfLines={1}
          style={[
            styles.headerTitle,
            alignCopyLeft && styles.headerDetailText,
          ]}
        >
          {title}
        </Text>
        <Text
          numberOfLines={2}
          style={[
            styles.headerSubtitle,
            alignCopyLeft && styles.headerDetailText,
          ]}
        >
          {subtitle}
        </Text>
      </View>
      {progressStep ? (
        <View
          accessibilityLabel={`الخطوة ${progressStep} من 4`}
          accessible
          style={styles.headerProgress}
        >
          <Text style={styles.headerProgressLabel}>
            {formatStepLabel(progressStep)}
          </Text>
          <View style={styles.progressTrack}>
            {[4, 3, 2, 1].map((segment) => (
              <View
                key={segment}
                style={styles.progressSegment}
              >
                {segment <= progressStep ? (
                  <PremiumEntrance
                    distance={0}
                    initialScale={0.85}
                    style={styles.progressSegmentActive}
                  >
                    <View />
                  </PremiumEntrance>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PreviewBusinessDetailScreen({
  business,
  isRtl,
  styles,
}: {
  business: NearbyVisualQaFixture;
  isRtl: boolean;
  styles: PreviewStyles;
}) {
  const detailOptions = getPreviewDetailOptions(business);

  return (
    <View style={styles.detailStack}>
      <PreviewBusinessHero business={business} isRtl={isRtl} styles={styles} />

      <PreviewDetailSection styles={styles} title="المعلومات الأساسية" tone="flat">
        <PreviewInfoRow
          bidiIsolate
          icon={PREVIEW_ICONS.clock}
          label="ساعات العمل"
          styles={styles}
          value={business.hours}
        />
        <PreviewInfoRow
          icon={PREVIEW_ICONS.location}
          label="العنوان"
          styles={styles}
          value={business.address}
        />
        <PreviewInfoRow
          icon={PREVIEW_ICONS.check}
          label="الموقع"
          styles={styles}
          value={business.locationSummary}
        />
      </PreviewDetailSection>

      <PreviewDetailSection styles={styles} title="المزايا" tone="flat">
        <View style={styles.featureWrap}>
          {business.features.map((feature) => (
            <View key={feature} style={styles.featurePill}>
              <Image
                accessible={false}
                alt=""
                resizeMode="contain"
                source={PREVIEW_ICONS.check}
                style={styles.featureCheck}
              />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </PreviewDetailSection>

      <PreviewDetailSection styles={styles} title="نبذة">
        <Text numberOfLines={3} style={styles.aboutText}>
          {business.about}
        </Text>
      </PreviewDetailSection>

      <PreviewDetailSection
        styles={styles}
        title={business.detailOptionsTitle}
        tone="flat"
      >
        <View style={styles.detailOptionList}>
          {detailOptions.map((option) => (
            <PreviewDetailOptionRow
              key={option.id}
              option={option}
              styles={styles}
            />
          ))}
        </View>
      </PreviewDetailSection>
    </View>
  );
}

function PreviewBusinessHero({
  business,
  styles,
}: {
  business: NearbyVisualQaFixture;
  isRtl: boolean;
  styles: PreviewStyles;
}) {
  return (
    <View
      style={[
        styles.hero,
        business.vertical === "restaurant" && styles.heroRestaurant,
        business.vertical === "clinic" && styles.heroClinic,
      ]}
    >
      <View style={styles.heroGlow} />
      <View style={[styles.heroPanel, styles.heroPanelOne]} />
      <View style={[styles.heroPanel, styles.heroPanelTwo]} />
      <View style={styles.heroIdentityPanel}>
        <View
          accessibilityLabel={`معاينة فنية محلية لنشاط ${business.name}`}
          accessible
          style={styles.heroThumbnail}
        >
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={PREVIEW_CATEGORY_ICONS[business.vertical]}
            style={styles.heroThumbnailIcon}
          />
        </View>
        <View style={styles.heroIdentityCopy}>
          <Text numberOfLines={2} style={styles.heroBusinessName}>
            {business.name}
          </Text>
          <Text numberOfLines={1} style={styles.heroBusinessCategory}>
            {business.category}
          </Text>
          <View style={styles.heroTrustRow}>
            <View style={styles.businessVerifiedPill}>
              <Image
                accessible={false}
                alt=""
                resizeMode="contain"
                source={PREVIEW_ICONS.check}
                style={styles.businessVerifiedIcon}
              />
              <Text style={styles.businessVerifiedText}>موثق</Text>
            </View>
            <View style={styles.businessRatingRow}>
              <Image
                accessible={false}
                alt=""
                resizeMode="contain"
                source={PREVIEW_ICONS.star}
                style={styles.businessRatingIcon}
              />
              <Text style={styles.businessRatingText}>
                {business.rating.toFixed(1)} ({business.reviewCount})
              </Text>
            </View>
            <Text style={styles.heroDistance}>{business.distance}</Text>
          </View>
        </View>
      </View>
      <View style={styles.heroActions}>
        <PreviewDisabledIconButton
          accessibilityHint="المفضلة معطلة في معاينة التطوير ولا يتم حفظ شيء."
          icon={PREVIEW_ICONS.heart}
          label="إضافة إلى المفضلة غير متاحة"
          styles={styles}
        />
        <PreviewDisabledIconButton
          accessibilityHint="المشاركة معطلة في معاينة التطوير ولا يتم إرسال شيء."
          icon={PREVIEW_ICONS.share}
          label="مشاركة النشاط غير متاحة"
          styles={styles}
        />
      </View>
    </View>
  );
}

function PreviewDisabledIconButton({
  accessibilityHint,
  icon,
  label,
  styles,
}: {
  accessibilityHint: string;
  icon: ImageSourcePropType;
  label: string;
  styles: PreviewStyles;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      disabled
      style={styles.disabledIconButton}
    >
      <Image
        accessible={false}
        alt=""
        resizeMode="contain"
        source={icon}
        style={styles.disabledIcon}
      />
    </Pressable>
  );
}

function PreviewDetailSection({
  children,
  styles,
  title,
  tone = "card",
}: {
  children: ReactNode;
  styles: PreviewStyles;
  title: string;
  tone?: "card" | "flat";
}) {
  return (
    <View
      style={[
        styles.sectionCard,
        tone === "flat" && styles.sectionCardFlat,
      ]}
    >
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function PreviewInfoRow({
  bidiIsolate = false,
  icon,
  label,
  styles,
  value,
}: {
  bidiIsolate?: boolean;
  icon: ImageSourcePropType;
  label: string;
  styles: PreviewStyles;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <Image
          accessible={false}
          alt=""
          resizeMode="contain"
          source={icon}
          style={styles.infoIcon}
        />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>
          {bidiIsolate ? `\u2067${value}\u2069` : value}
        </Text>
      </View>
    </View>
  );
}

function PreviewDetailOptionRow({
  option,
  styles,
}: {
  option: PreviewSelectionOption;
  styles: PreviewStyles;
}) {
  const hasMeta = Boolean(option.duration || option.price);

  return (
    <View style={styles.detailOptionRow}>
      {hasMeta ? (
        <View style={styles.detailOptionMeta}>
          {option.duration ? (
            <Text style={styles.optionMetaText}>{option.duration}</Text>
          ) : null}
          {option.price ? (
            <Text style={styles.optionPriceText}>{option.price}</Text>
          ) : null}
        </View>
      ) : (
        <Image
          accessible={false}
          alt=""
          resizeMode="contain"
          source={PREVIEW_ICONS.check}
          style={styles.detailInfoCheck}
        />
      )}
      <View style={styles.detailOptionCopy}>
        <Text style={styles.detailOptionName}>{option.label}</Text>
        {option.supportingText ? (
          <Text style={styles.detailOptionSupporting}>
            {option.supportingText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function PreviewBookingConfiguration({
  business,
  customGuestCount,
  onCustomGuestConfirm,
  onPrimarySelect,
  onSecondarySelect,
  primaryId,
  secondaryId,
  styles,
}: {
  business: NearbyVisualQaFixture;
  customGuestCount: string;
  onCustomGuestConfirm: (value: string) => void;
  onPrimarySelect: (id: string) => void;
  onSecondarySelect: (id: string) => void;
  primaryId: string;
  secondaryId: string;
  styles: PreviewStyles;
}) {
  const [customGuestDialogVisible, setCustomGuestDialogVisible] =
    useState(false);
  const [customGuestDraft, setCustomGuestDraft] =
    useState(customGuestCount);
  const customGuestValue = Number(customGuestDraft);
  const customGuestValid =
    /^\d+$/.test(customGuestDraft) &&
    Number.isInteger(customGuestValue) &&
    customGuestValue >= 6;
  const primaryOptions =
    business.vertical === "restaurant"
      ? business.primaryOptions.map((option) =>
          option.label === "6+"
            ? {
                ...option,
                id: CUSTOM_GUEST_OPTION_ID,
                label: customGuestCount || "عدد مخصص",
                supportingText: null,
              }
            : option,
        )
      : business.primaryOptions;

  const handlePrimarySelect = (id: string) => {
    if (id !== CUSTOM_GUEST_OPTION_ID) {
      onPrimarySelect(id);
      return;
    }

    setCustomGuestDraft(customGuestCount);
    setCustomGuestDialogVisible(true);
  };

  const handleCustomGuestSubmit = () => {
    if (!customGuestValid) return;

    onCustomGuestConfirm(String(customGuestValue));
    setCustomGuestDialogVisible(false);
  };

  return (
    <>
      <View style={styles.flowStack}>
        <PreviewBusinessMiniSummary business={business} styles={styles} />
        <PreviewDetailSection styles={styles} title={business.booking.primaryTitle}>
          <PreviewSelectionGrid
            onSelect={handlePrimarySelect}
            options={primaryOptions}
            selectedId={primaryId}
            selectionLabel={business.booking.primaryTitle}
            styles={styles}
          />
        </PreviewDetailSection>
        <PreviewDetailSection styles={styles} title={business.booking.secondaryTitle}>
          <PreviewSelectionGrid
            onSelect={onSecondarySelect}
            options={business.secondaryOptions}
            selectedId={secondaryId}
            selectionLabel={business.booking.secondaryTitle}
            styles={styles}
          />
        </PreviewDetailSection>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setCustomGuestDialogVisible(false)}
        transparent
        visible={customGuestDialogVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.customGuestBackdrop}
        >
          <View
            accessibilityViewIsModal
            style={styles.customGuestModalContainer}
          >
            <PremiumEntrance
              distance={0}
              initialScale={0.96}
              style={styles.motionStretch}
            >
              <View style={styles.customGuestDialog}>
                <Text style={styles.customGuestTitle}>عدد مخصص</Text>
                <Text style={styles.customGuestSubtitle}>
                  أدخل عدداً يبدأ من 6 ضيوف.
                </Text>
                <TextInput
                  accessibilityLabel="أدخل عدد الضيوف"
                  autoFocus
                  keyboardType="number-pad"
                  maxLength={3}
                  onChangeText={(value) =>
                    setCustomGuestDraft(value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="أدخل عدد الضيوف"
                  placeholderTextColor="#70777d"
                  returnKeyType="done"
                  style={styles.customGuestInput}
                  textAlign="right"
                  value={customGuestDraft}
                />
                <Text style={styles.customGuestHelper}>
                  الحد الأدنى 6 أشخاص
                </Text>
                <View style={styles.customGuestActions}>
                  <PremiumPressable
                    accessibilityRole="button"
                    onPress={() => setCustomGuestDialogVisible(false)}
                    scaleTo={0.98}
                    style={styles.customGuestCancel}
                  >
                    <Text style={styles.customGuestCancelText}>إلغاء</Text>
                  </PremiumPressable>
                  <PremiumPressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !customGuestValid }}
                    disabled={!customGuestValid}
                    onPress={handleCustomGuestSubmit}
                    scaleTo={0.975}
                    style={[
                      styles.customGuestConfirm,
                      !customGuestValid && styles.customGuestConfirmDisabled,
                    ]}
                  >
                    <Text style={styles.customGuestConfirmText}>تأكيد العدد</Text>
                  </PremiumPressable>
                </View>
              </View>
            </PremiumEntrance>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function PreviewBusinessMiniSummary({
  business,
  styles,
}: {
  business: NearbyVisualQaFixture;
  styles: PreviewStyles;
}) {
  return (
    <View style={styles.miniSummary}>
      <View style={styles.miniIconWrap}>
        <Image
          accessible={false}
          alt=""
          resizeMode="contain"
          source={PREVIEW_CATEGORY_ICONS[business.vertical]}
          style={styles.miniIcon}
        />
      </View>
      <View style={styles.miniCopy}>
        <Text numberOfLines={2} style={styles.miniName}>
          {business.name}
        </Text>
        <Text style={styles.miniMeta}>
          {business.category} · {business.distance}
        </Text>
      </View>
    </View>
  );
}

function PreviewBusinessIdentityCard({
  business,
  styles,
}: {
  business: NearbyVisualQaFixture;
  styles: PreviewStyles;
}) {
  return (
    <View style={styles.businessIdentityCard}>
      <View style={styles.businessThumbnail}>
        <View style={styles.businessThumbnailGlow} />
        <Image
          accessible={false}
          alt=""
          resizeMode="contain"
          source={PREVIEW_CATEGORY_ICONS[business.vertical]}
          style={styles.businessThumbnailIcon}
        />
      </View>
      <View style={styles.businessIdentityCopy}>
        <Text numberOfLines={2} style={styles.businessIdentityName}>
          {business.name}
        </Text>
        <View style={styles.businessTrustRow}>
          <View style={styles.businessVerifiedPill}>
            <Image
              accessible={false}
              alt=""
              resizeMode="contain"
              source={PREVIEW_ICONS.check}
              style={styles.businessVerifiedIcon}
            />
            <Text style={styles.businessVerifiedText}>موثق</Text>
          </View>
          <View style={styles.businessRatingRow}>
            <Image
              accessible={false}
              alt=""
              resizeMode="contain"
              source={PREVIEW_ICONS.star}
              style={styles.businessRatingIcon}
            />
            <Text style={styles.businessRatingText}>
              {business.rating.toFixed(1)} ({business.reviewCount})
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.businessIdentityMeta}>
          {business.category} · {business.distance}
        </Text>
      </View>
    </View>
  );
}

function PreviewSelectionGrid({
  onSelect,
  options,
  selectedId,
  selectionLabel,
  styles,
}: {
  onSelect: (id: string) => void;
  options: readonly PreviewSelectionOption[];
  selectedId: string;
  selectionLabel: string;
  styles: PreviewStyles;
}) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const compact = options.every(
    (option) => option.duration === null && option.price === null,
  );
  const profileGrid =
    selectionLabel === "اختر الموظف" || selectionLabel === "اختر الطبيب";
  const serviceRtlGrid =
    selectionLabel === "اختر الخدمة" || selectionLabel === "نوع الموعد";
  const guestCountGrid = selectionLabel === "عدد الضيوف";
  const seatingGrid = selectionLabel === "تفضيل الجلسة";
  const columns = profileGrid || !compact
    ? 1
    : guestCountGrid
      ? availableWidth >= 310
        ? 3
        : 2
      : seatingGrid
        ? 2
        : 2;
  const gap = 10;
  const cardWidth =
    availableWidth > 0
      ? (availableWidth - gap * (columns - 1)) / columns
      : undefined;

  return (
    <View
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (Math.abs(nextWidth - availableWidth) > 0.5) {
          setAvailableWidth(nextWidth);
        }
      }}
      style={styles.selectionGrid}
    >
      {options.map((option) => {
        const fullWidth =
          profileGrid || (compact && option.id.endsWith("-any"));
        const resolvedWidth =
          fullWidth && availableWidth > 0 ? availableWidth : cardWidth;

        return profileGrid ? (
          <PreviewEmployeeCard
            cardWidth={resolvedWidth}
            key={option.id}
            onPress={() => onSelect(option.id)}
            option={option}
            selected={option.id === selectedId}
            selectionLabel={selectionLabel}
            styles={styles}
          />
        ) : (
          <PreviewOptionCard
            cardWidth={resolvedWidth}
            compact={compact}
            fullWidth={fullWidth}
            key={option.id}
            onPress={() => onSelect(option.id)}
            option={option}
            serviceRtl={serviceRtlGrid}
            selected={option.id === selectedId}
            selectionLabel={selectionLabel}
            styles={styles}
          />
        );
      })}
    </View>
  );
}

function PreviewEmployeeCard({
  cardWidth,
  onPress,
  option,
  selected,
  selectionLabel,
  styles,
}: {
  cardWidth: number | undefined;
  onPress: () => void;
  option: PreviewSelectionOption;
  selected: boolean;
  selectionLabel: string;
  styles: PreviewStyles;
}) {
  const anyEmployee = option.id.endsWith("-any");

  return (
    <PremiumPressable
      accessibilityHint="يغير هذا الاختيار داخل المعاينة المحلية فقط."
      accessibilityLabel={`${selectionLabel}: ${option.label}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      scaleTo={0.985}
      style={[
        styles.employeeCard,
        cardWidth ? { width: cardWidth } : null,
        selected && styles.optionCardSelected,
      ]}
    >
      <View style={styles.employeeAvatar}>
        {anyEmployee ? (
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={PREVIEW_ICONS.user}
            style={styles.employeeAvatarIcon}
          />
        ) : (
          <Text style={styles.employeeAvatarText}>
            {option.avatarInitials ?? option.label.slice(0, 2)}
          </Text>
        )}
      </View>
      <View style={styles.employeeCopy}>
        <Text numberOfLines={1} style={styles.employeeName}>
          {option.label}
        </Text>
        <Text numberOfLines={1} style={styles.employeeRole}>
          {option.supportingText}
        </Text>
        {option.rating ? (
          <View style={styles.employeeRatingRow}>
            <Image
              accessible={false}
              alt=""
              resizeMode="contain"
              source={PREVIEW_ICONS.star}
              style={styles.employeeRatingIcon}
            />
            <Text style={styles.employeeRatingText}>
              {option.rating.toFixed(1)}
            </Text>
          </View>
        ) : null}
        <View style={styles.employeeStatusRow}>
          <View style={styles.employeeStatusDot} />
          <Text style={styles.employeeStatusText}>متاح الآن</Text>
        </View>
      </View>
      <View style={styles.employeeSelectionSlot}>
        {selected ? (
          <PremiumCheck style={styles.employeeSelectedCheck}>
            <Image
              accessible={false}
              alt=""
              resizeMode="contain"
              source={PREVIEW_ICONS.check}
              style={styles.selectedCheck}
            />
          </PremiumCheck>
        ) : null}
      </View>
    </PremiumPressable>
  );
}

function PreviewOptionCard({
  cardWidth,
  compact,
  fullWidth,
  onPress,
  option,
  serviceRtl,
  selected,
  selectionLabel,
  styles,
}: {
  cardWidth: number | undefined;
  compact: boolean;
  fullWidth: boolean;
  onPress: () => void;
  option: PreviewSelectionOption;
  serviceRtl: boolean;
  selected: boolean;
  selectionLabel: string;
  styles: PreviewStyles;
}) {
  const guestCount = selectionLabel === "عدد الضيوف";
  const displayLabel = guestCount
    ? formatGuestCountLabel(option.label)
    : option.label;

  return (
    <PremiumPressable
      accessibilityHint="يغير هذا الاختيار داخل المعاينة المحلية فقط."
      accessibilityLabel={`${selectionLabel}: ${displayLabel}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      scaleTo={0.985}
      style={[
        styles.optionCard,
        cardWidth ? { width: cardWidth } : null,
        compact && styles.optionCardCompact,
        fullWidth && styles.optionCardFullWidth,
        guestCount && styles.optionCardGuest,
        serviceRtl && styles.optionCardServiceRtl,
        selected && styles.optionCardSelected,
      ]}
    >
      {selected && !serviceRtl ? (
        <PremiumCheck style={styles.selectedCheckWrap}>
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={PREVIEW_ICONS.check}
            style={styles.selectedCheck}
          />
        </PremiumCheck>
      ) : null}
      {selected && serviceRtl ? (
        <PremiumCheck style={styles.serviceCardCheck}>
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={PREVIEW_ICONS.check}
            style={styles.selectedCheck}
          />
        </PremiumCheck>
      ) : null}
      {serviceRtl ? (
        <View style={styles.serviceCardContent}>
          <Text numberOfLines={2} style={styles.serviceName}>
            {displayLabel}
          </Text>
          {option.duration ? (
            <Text style={styles.serviceDuration}>{option.duration}</Text>
          ) : null}
          {option.price ? (
            <Text style={styles.servicePrice}>{option.price}</Text>
          ) : null}
        </View>
      ) : (
        <>
          <Text
            numberOfLines={2}
            style={[
              styles.optionLabel,
              guestCount && styles.optionLabelGuest,
            ]}
          >
            {displayLabel}
          </Text>
          {option.supportingText && !guestCount ? (
            <Text numberOfLines={1} style={styles.optionSupporting}>
              {option.supportingText}
            </Text>
          ) : null}
          {option.duration || option.price ? (
            <View style={styles.optionMetaRow}>
              {option.duration ? (
                <Text style={styles.optionMetaText}>{option.duration}</Text>
              ) : null}
              {option.price ? (
                <Text style={styles.optionPriceText}>{option.price}</Text>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </PremiumPressable>
  );
}

function PreviewScheduleScreen({
  business,
  dateId,
  note,
  onDateSelect,
  onNoteChange,
  onTimeSelect,
  styles,
  timeId,
}: {
  business: NearbyVisualQaFixture;
  dateId: string;
  note: string;
  onDateSelect: (id: string) => void;
  onNoteChange: (value: string) => void;
  onTimeSelect: (id: string) => void;
  styles: PreviewStyles;
  timeId: string;
}) {
  return (
    <View style={styles.flowStack}>
      <PreviewBusinessIdentityCard business={business} styles={styles} />
      <PreviewDetailSection styles={styles} title="اختر التاريخ">
        <PreviewDateSelector
          onSelect={onDateSelect}
          selectedId={dateId}
          styles={styles}
        />
      </PreviewDetailSection>
      <PreviewDetailSection styles={styles} title="اختر الوقت">
        <PreviewTimeGrid
          onSelect={onTimeSelect}
          selectedId={timeId}
          styles={styles}
          times={business.booking.times}
        />
      </PreviewDetailSection>
      {business.booking.note ? (
        <PreviewTextNoteStep
          config={business.booking.note}
          onChange={onNoteChange}
          styles={styles}
          value={note}
        />
      ) : null}
    </View>
  );
}

function PreviewDateSelector({
  onSelect,
  selectedId,
  styles,
}: {
  onSelect: (id: string) => void;
  selectedId: string;
  styles: PreviewStyles;
}) {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const datePositionsRef = useRef<Record<string, number>>({});
  const itemWidth = width < 380 ? 112 : 120;
  const itemInterval = itemWidth + 10;
  const displayedDates = [...PREVIEW_DATES].reverse();
  const scrollSelectedIntoView = useCallback(
    (animated: boolean) => {
      const selectedX = datePositionsRef.current[selectedId];
      if (selectedX === undefined) return;

      scrollRef.current?.scrollTo({
        animated,
        x: Math.max(0, selectedX - 8),
      });
    },
    [selectedId],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      scrollSelectedIntoView(false),
    );

    return () => cancelAnimationFrame(frame);
  }, [scrollSelectedIntoView]);

  return (
    <ScrollView
      contentContainerStyle={styles.dateRow}
      decelerationRate="fast"
      horizontal
      ref={scrollRef}
      showsHorizontalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={itemInterval}
    >
      {displayedDates.map((date) => {
        const selected = date.id === selectedId;

        return (
          <PremiumPressable
            accessibilityHint="يغير تاريخ الحجز داخل المعاينة."
            accessibilityLabel={`${date.day}، ${date.label}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={date.id}
            onLayout={(event) => {
              datePositionsRef.current[date.id] = event.nativeEvent.layout.x;
              if (selected) {
                requestAnimationFrame(() => scrollSelectedIntoView(false));
              }
            }}
            onPress={() => onSelect(date.id)}
            scaleTo={0.96}
            style={[
              styles.dateCard,
              { width: itemWidth },
              selected && styles.dateCardSelected,
            ]}
          >
            {selected ? (
              <PremiumCheck style={styles.dateCheckMotion}>
                <Image
                  accessible={false}
                  alt=""
                  resizeMode="contain"
                  source={PREVIEW_ICONS.check}
                  style={styles.dateCheck}
                />
              </PremiumCheck>
            ) : null}
            <Text numberOfLines={1} style={styles.dateDay}>
              {date.day}
            </Text>
            <Text numberOfLines={1} style={styles.dateLabel}>
              {date.label}
            </Text>
          </PremiumPressable>
        );
      })}
    </ScrollView>
  );
}

function PreviewTimeGrid({
  onSelect,
  selectedId,
  styles,
  times,
}: {
  onSelect: (id: string) => void;
  selectedId: string;
  styles: PreviewStyles;
  times: readonly PreviewTimeOption[];
}) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const columns = availableWidth >= 310 ? 3 : 2;
  const gap = 10;
  const cardWidth =
    availableWidth > 0
      ? (availableWidth - gap * (columns - 1)) / columns
      : undefined;

  return (
    <View
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (Math.abs(nextWidth - availableWidth) > 0.5) {
          setAvailableWidth(nextWidth);
        }
      }}
      style={styles.timeGrid}
    >
      {times.map((time) => {
        const selected = time.id === selectedId;

        return (
          <PremiumPressable
            accessibilityHint="يغير وقت الحجز داخل المعاينة."
            accessibilityLabel={`الوقت ${time.label}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={time.id}
            onPress={() => onSelect(time.id)}
            scaleTo={0.97}
            style={[
              styles.timeButton,
              cardWidth ? { width: cardWidth } : null,
              selected && styles.timeButtonSelected,
            ]}
          >
            {selected ? (
              <PremiumCheck>
                <Image
                  accessible={false}
                  alt=""
                  resizeMode="contain"
                  source={PREVIEW_ICONS.check}
                  style={styles.timeCheck}
                />
              </PremiumCheck>
            ) : (
              <Image
                accessible={false}
                alt=""
                resizeMode="contain"
                source={PREVIEW_ICONS.clock}
                style={styles.timeIcon}
              />
            )}
            <Text numberOfLines={1} style={styles.timeLabel}>
              {time.label}
            </Text>
          </PremiumPressable>
        );
      })}
    </View>
  );
}

function PreviewTextNoteStep({
  config,
  onChange,
  styles,
  value,
}: {
  config: NonNullable<NearbyVisualQaFixture["booking"]["note"]>;
  onChange: (value: string) => void;
  styles: PreviewStyles;
  value: string;
}) {
  return (
    <PreviewDetailSection styles={styles} title={config.label}>
      <TextInput
        accessibilityHint="يبقى النص محلياً ويُحذف عند إغلاق المعاينة."
        accessibilityLabel={config.label}
        autoCapitalize="sentences"
        autoComplete="off"
        autoCorrect={false}
        maxLength={240}
        multiline
        onChangeText={onChange}
        placeholder={config.placeholder}
        placeholderTextColor="#70777d"
        spellCheck={false}
        style={styles.noteInput}
        textContentType="none"
        value={value}
      />
      <Text style={styles.safetyText}>{config.safetyText}</Text>
    </PreviewDetailSection>
  );
}

function PreviewBookingSummary({
  business,
  confirmed,
  highlight,
  rows,
  styles,
}: {
  business: NearbyVisualQaFixture;
  confirmed: boolean;
  highlight: string;
  rows: readonly PreviewSummaryRow[];
  styles: PreviewStyles;
}) {
  return (
    <View style={styles.flowStack}>
      {!confirmed ? (
        <PreviewBusinessIdentityCard business={business} styles={styles} />
      ) : null}
      {confirmed ? (
        <View style={styles.receiptTopRow}>
          <View style={styles.confirmedStatusPill}>
            <Image
              accessible={false}
              alt=""
              resizeMode="contain"
              source={PREVIEW_ICONS.check}
              style={styles.confirmedStatusIcon}
            />
            <Text style={styles.confirmedStatusText}>مؤكد محلياً</Text>
          </View>
          <View style={styles.referenceCardCompact}>
            <Text style={styles.referenceLabel}>مرجع المعاينة</Text>
            <Text style={styles.referenceValue}>{business.booking.reference}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.summaryHighlight}>
          <Text numberOfLines={2} style={styles.summaryHighlightText}>
            {highlight}
          </Text>
        </View>
      )}
      <View style={styles.summaryCard}>
        {rows.map((row) => (
          <View key={row.label} style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{row.label}</Text>
            <Text style={styles.summaryValue}>{row.value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.localSafetyCard}>
        <Image
          accessible={false}
          alt=""
          resizeMode="contain"
          source={PREVIEW_ICONS.check}
          style={styles.localSafetyIcon}
        />
        <Text style={styles.localSafetyText}>
          معاينة محلية فقط — لن يتم إنشاء حجز أو تنفيذ دفع أو إرسال بيانات.
        </Text>
      </View>
    </View>
  );
}

function PreviewConfirmationView({
  business,
  rows,
  styles,
}: {
  business: NearbyVisualQaFixture;
  rows: readonly PreviewSummaryRow[];
  styles: PreviewStyles;
}) {
  return (
    <View style={styles.confirmationStack}>
      <PremiumEntrance distance={0} initialScale={0.75}>
        <View style={styles.confirmationIconWrap}>
          <PremiumCheck>
            <Image
              accessible={false}
              alt=""
              resizeMode="contain"
              source={PREVIEW_ICONS.check}
              style={styles.confirmationIcon}
            />
          </PremiumCheck>
        </View>
      </PremiumEntrance>
      <PremiumEntrance delay={90} distance={8}>
        <Text style={styles.confirmationTitle}>
          {business.booking.confirmationTitle}
        </Text>
      </PremiumEntrance>
      <PremiumEntrance delay={140} distance={6}>
        <Text style={styles.confirmationBody}>
          {getConfirmationMessage(business.vertical)}
        </Text>
      </PremiumEntrance>
      <PremiumEntrance delay={190} distance={8} style={styles.motionStretch}>
        <View style={styles.referenceCard}>
          <Text style={styles.referenceLabel}>مرجع المعاينة</Text>
          <Text style={styles.referenceValue}>{business.booking.reference}</Text>
        </View>
      </PremiumEntrance>
      <PremiumEntrance delay={240} distance={8} style={styles.motionStretch}>
        <View style={styles.confirmationSummary}>
          {rows.map((row) => (
            <View key={row.label} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{row.label}</Text>
              <Text style={styles.summaryValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      </PremiumEntrance>
    </View>
  );
}

function PreviewBottomCTA({
  accessibilityHint,
  label,
  onPress,
  onSecondaryPress,
  secondaryAccessibilityHint,
  secondaryLabel,
  styles,
}: {
  accessibilityHint: string;
  label: string;
  onPress: () => void;
  onSecondaryPress?: () => void;
  secondaryAccessibilityHint?: string;
  secondaryLabel?: string;
  styles: PreviewStyles;
}) {
  return (
    <View style={styles.footer}>
      <PremiumPressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={onPress}
        scaleTo={0.975}
        style={styles.primaryCta}
      >
        <Text style={styles.primaryCtaText}>{label}</Text>
      </PremiumPressable>
      {secondaryLabel && onSecondaryPress ? (
        <PremiumPressable
          accessibilityHint={secondaryAccessibilityHint}
          accessibilityLabel={secondaryLabel}
          accessibilityRole="button"
          onPress={onSecondaryPress}
          scaleTo={0.98}
          style={styles.secondaryCta}
        >
          <Text style={styles.secondaryCtaText}>{secondaryLabel}</Text>
        </PremiumPressable>
      ) : null}
    </View>
  );
}

function findSelectionOption(
  options: readonly PreviewSelectionOption[],
  id: string,
) {
  return options.find((option) => option.id === id);
}

function buildPreviewSummaryRows({
  business,
  note,
  selectedDate,
  selectedPrimary,
  selectedSecondary,
  selectedTime,
}: {
  business: NearbyVisualQaFixture;
  note: string;
  selectedDate: PreviewDateOption | undefined;
  selectedPrimary: PreviewSelectionOption | undefined;
  selectedSecondary: PreviewSelectionOption | undefined;
  selectedTime: PreviewTimeOption | undefined;
}): PreviewSummaryRow[] {
  const primarySuffix = business.booking.primaryReviewSuffix;
  const primaryValue = selectedPrimary
    ? business.vertical === "restaurant"
      ? formatGuestCountLabel(selectedPrimary.label)
      : `${selectedPrimary.label}${primarySuffix ? ` ${primarySuffix}` : ""}`
    : "غير محدد";
  const rows: PreviewSummaryRow[] = [
    { label: "النشاط", value: business.name },
    { label: business.booking.primaryReviewLabel, value: primaryValue },
    {
      label: business.booking.secondaryReviewLabel,
      value: selectedSecondary?.label ?? "غير محدد",
    },
    {
      label: "التاريخ",
      value: selectedDate
        ? `${selectedDate.day} · ${selectedDate.label}`
        : "غير محدد",
    },
    { label: "الوقت", value: selectedTime?.label ?? "غير محدد" },
  ];

  if (selectedPrimary?.duration) {
    rows.push({ label: "المدة", value: selectedPrimary.duration });
  }

  if (selectedPrimary?.price) {
    rows.push({ label: "السعر", value: selectedPrimary.price });
  }

  rows.push(
    business.vertical === "restaurant"
      ? { label: "رسوم الحجز", value: "مجاناً" }
      : { label: "طريقة الدفع", value: business.booking.paymentLabel },
  );

  if (note.trim() && business.booking.note) {
    rows.push({ label: business.booking.note.label, value: note.trim() });
  }

  return rows;
}

function getConfirmationCtaLabel(vertical: PreviewBusinessVertical) {
  return vertical === "restaurant" ? "تأكيد حجز الطاولة" : "تأكيد الموعد";
}

function getPreviewProgressStep(route: PreviewRoute) {
  if (route.name === "configuration") return 1;
  if (route.name === "schedule") return 2;
  if (route.name === "review" && route.mode === "checkout") return 3;
  if (route.name === "confirmation") return 4;

  return null;
}

function formatStepLabel(step: number) {
  return `${step} من 4`;
}

function getConfigurationTitle(vertical: PreviewBusinessVertical) {
  if (vertical === "restaurant") return "تفاصيل حجز الطاولة";
  if (vertical === "clinic") return "تفاصيل موعد العيادة";

  return "تفاصيل الموعد";
}

function getReviewTitle(vertical: PreviewBusinessVertical) {
  return vertical === "restaurant" ? "مراجعة حجز الطاولة" : "مراجعة الموعد";
}

function getConfirmedDetailsTitle(vertical: PreviewBusinessVertical) {
  if (vertical === "restaurant") return "تفاصيل حجز الطاولة";
  if (vertical === "clinic") return "تفاصيل موعد العيادة";

  return "تفاصيل الموعد";
}

function getConfirmationMessage(vertical: PreviewBusinessVertical) {
  if (vertical === "restaurant") {
    return "تم حفظ حجز الطاولة محلياً داخل هذه المعاينة فقط.";
  }

  if (vertical === "clinic") {
    return "هذا تأكيد تجريبي للواجهة، وليس موعداً طبياً حقيقياً.";
  }

  return "تم حفظ موعدك محلياً داخل هذه المعاينة فقط.";
}

function buildPreviewHighlight(
  business: NearbyVisualQaFixture,
  primary: PreviewSelectionOption | undefined,
  secondary: PreviewSelectionOption | undefined,
) {
  if (business.vertical === "restaurant") {
    return `طاولة لـ ${formatGuestCountLabel(primary?.label ?? "4")} · جلسة ${secondary?.label ?? "عائلي"}`;
  }

  return `${primary?.label ?? "غير محدد"} · ${primary?.duration ?? "المدة غير محددة"}`;
}

function formatGuestCountLabel(value: string) {
  if (value === "عدد مخصص") return value;
  if (value === "1") return "1 شخص";
  if (value === "2") return "2 شخصان";

  return `${value} أشخاص`;
}

function getPreviewDetailOptions(
  business: NearbyVisualQaFixture,
): readonly PreviewSelectionOption[] {
  if (business.vertical !== "restaurant") {
    return business.primaryOptions.slice(0, 4);
  }

  return [
    {
      duration: null,
      id: "restaurant-detail-capacity",
      label: "حجز من شخص إلى 6+",
      price: null,
      supportingText: "خيارات مرنة لعدد الضيوف",
    },
    {
      duration: null,
      id: "restaurant-detail-seating",
      label: "اختيار جلسة داخلية أو عائلية",
      price: null,
      supportingText: "يُحدد أثناء الحجز",
    },
    {
      duration: null,
      id: "restaurant-detail-confirmation",
      label: "تأكيد فوري",
      price: null,
      supportingText: "بدون رسوم حجز",
    },
  ];
}

function getPreviewHeaderCopy(
  route: PreviewRoute,
  business: NearbyVisualQaFixture,
) {
  if (route.name === "detail") {
    return {
      eyebrow: "معاينة النشاط",
      subtitle: business.category,
      title: "تفاصيل النشاط",
    };
  }

  if (route.name === "configuration") {
    return {
      eyebrow: "الخطوة 1 من 4",
      subtitle: business.booking.configurationSubtitle,
      title: getConfigurationTitle(business.vertical),
    };
  }

  if (route.name === "schedule") {
    return {
      eyebrow: "الخطوة 2 من 4",
      subtitle: "اختر تاريخاً ووقتاً مناسبين من الخيارات المتاحة.",
      title: "التاريخ والوقت",
    };
  }

  if (route.name === "review") {
    return {
      eyebrow: route.mode === "confirmed" ? "تفاصيل التأكيد" : "الخطوة 3 من 4",
      subtitle:
        route.mode === "confirmed"
          ? "مرجع محلي لهذا التأكيد التجريبي."
          : "تحقق من اختياراتك قبل التأكيد المحلي.",
      title:
        route.mode === "confirmed"
          ? getConfirmedDetailsTitle(business.vertical)
          : getReviewTitle(business.vertical),
    };
  }

  return {
    eyebrow: "الخطوة 4 من 4",
    subtitle: "تم حفظ التأكيد محلياً للمعاينة فقط.",
    title: business.booking.confirmationTitle,
  };
}

const createStyles = (
  theme: MobileTheme,
  layout: MobileResponsiveLayout,
) => {
  const { width } = layout;
  const gold = theme.isDark ? theme.colors.gold : "#e9ae3e";
  const horizontalPadding = layout.pagePadding;
  const heroHeight = layout.isCompactHeight
    ? Math.max(184, Math.min(210, Math.round(width * 0.5)))
    : Math.max(204, Math.min(232, Math.round(width * 0.54)));

  return StyleSheet.create({
    aboutText: {
      color: "#b6b0a7",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "right",
      writingDirection: "rtl",
    },
    backButton: {
      alignItems: "center",
      backgroundColor: "#17170f",
      borderColor: "rgba(233, 174, 62, 0.4)",
      borderRadius: 25,
      borderWidth: 1,
      height: 50,
      justifyContent: "center",
      shadowColor: gold,
      shadowOffset: { height: 2, width: 0 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      width: 50,
    },
    backIcon: {
      height: 22,
      tintColor: "#f3ebdd",
      width: 22,
    },
    businessName: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: width < 380 ? 21 : 23,
      lineHeight: width < 380 ? 28 : 31,
      textAlign: "right",
      writingDirection: "ltr",
    },
    businessIdentityCard: {
      alignItems: "center",
      backgroundColor: "#101518",
      borderColor: "rgba(233, 174, 62, 0.18)",
      borderRadius: 20,
      borderWidth: 1,
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 10,
      minHeight: 88,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    businessIdentityCopy: {
      alignItems: "flex-end",
      flex: 1,
      minWidth: 0,
    },
    businessIdentityMeta: {
      color: "#939a9e",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 12.5,
      lineHeight: 17,
      marginTop: 2,
      textAlign: "right",
      width: "100%",
      writingDirection: "rtl",
    },
    businessIdentityName: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 16,
      lineHeight: 21,
      textAlign: "right",
      width: "100%",
      writingDirection: "ltr",
    },
    businessRatingIcon: {
      height: 13,
      tintColor: gold,
      width: 13,
    },
    businessRatingRow: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 4,
    },
    businessRatingText: {
      color: "#d7d0c5",
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 12,
      lineHeight: 17,
      writingDirection: "ltr",
    },
    businessThumbnail: {
      alignItems: "center",
      backgroundColor: "#17170f",
      borderColor: "rgba(233, 174, 62, 0.32)",
      borderRadius: 18,
      borderWidth: 1,
      height: 64,
      justifyContent: "center",
      overflow: "hidden",
      position: "relative",
      width: 64,
    },
    businessThumbnailGlow: {
      backgroundColor: "rgba(233, 174, 62, 0.12)",
      borderRadius: 36,
      height: 72,
      position: "absolute",
      right: -22,
      top: -24,
      width: 72,
    },
    businessThumbnailIcon: {
      height: 34,
      tintColor: gold,
      width: 34,
    },
    businessTrustRow: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 8,
      marginTop: 2,
      width: "100%",
    },
    businessVerifiedIcon: {
      height: 12,
      tintColor: "#67d89f",
      width: 12,
    },
    businessVerifiedPill: {
      alignItems: "center",
      backgroundColor: "#102019",
      borderRadius: 10,
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 4,
      minHeight: 22,
      paddingHorizontal: 7,
    },
    businessVerifiedText: {
      color: "#67d89f",
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 11,
      lineHeight: 15,
      writingDirection: "rtl",
    },
    buttonPressed: {
      opacity: 0.76,
    },
    categoryText: {
      color: "#aaa59d",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 13.5,
      lineHeight: 20,
      marginTop: 3,
      textAlign: "right",
      writingDirection: "rtl",
    },
    confirmationBody: {
      color: "#aaa59d",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 14,
      lineHeight: 21,
      maxWidth: 340,
      textAlign: "center",
      writingDirection: "rtl",
    },
    confirmationIcon: {
      height: width < 380 ? 50 : 56,
      tintColor: "#102017",
      width: width < 380 ? 50 : 56,
    },
    confirmationIconWrap: {
      alignItems: "center",
      backgroundColor: gold,
      borderColor: "#f7d98c",
      borderRadius: width < 380 ? 54 : 60,
      borderWidth: 2,
      height: width < 380 ? 108 : 120,
      justifyContent: "center",
      shadowColor: gold,
      shadowOffset: { height: 5, width: 0 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      width: width < 380 ? 108 : 120,
    },
    confirmationStack: {
      alignItems: "center",
      gap: 8,
      paddingTop: 2,
    },
    confirmationSummary: {
      alignSelf: "stretch",
      backgroundColor: "#101518",
      borderColor: "rgba(233, 174, 62, 0.18)",
      borderRadius: 22,
      borderWidth: 1,
      padding: 10,
    },
    confirmationTitle: {
      color: "#f3ebdd",
      fontFamily: PREVIEW_FONT.kufiBold,
      fontSize: width < 380 ? 22 : 24,
      lineHeight: width < 380 ? 30 : 33,
      textAlign: "center",
      writingDirection: "rtl",
    },
    customGuestActions: {
      direction: "ltr",
      flexDirection: "row",
      gap: 10,
      marginTop: 16,
    },
    customGuestBackdrop: {
      alignItems: "center",
      backgroundColor: "rgba(0, 0, 0, 0.76)",
      flex: 1,
      justifyContent: "center",
      padding: 22,
    },
    customGuestCancel: {
      alignItems: "center",
      backgroundColor: "#0c1114",
      borderColor: "rgba(233, 174, 62, 0.28)",
      borderRadius: 17,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 54,
    },
    customGuestCancelText: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 15,
      lineHeight: 21,
      writingDirection: "rtl",
    },
    customGuestConfirm: {
      alignItems: "center",
      backgroundColor: gold,
      borderRadius: 17,
      flex: 1.25,
      justifyContent: "center",
      minHeight: 54,
    },
    customGuestConfirmDisabled: {
      opacity: 0.38,
    },
    customGuestConfirmText: {
      color: "#171106",
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 15,
      lineHeight: 21,
      writingDirection: "rtl",
    },
    customGuestDialog: {
      backgroundColor: "#101518",
      borderColor: "rgba(233, 174, 62, 0.32)",
      borderRadius: 24,
      borderWidth: 1,
      maxWidth: 390,
      padding: 20,
      width: "100%",
    },
    customGuestHelper: {
      color: "#8f969b",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 12.5,
      lineHeight: 18,
      marginTop: 7,
      textAlign: "right",
      writingDirection: "rtl",
    },
    customGuestInput: {
      backgroundColor: "#080d10",
      borderColor: "rgba(233, 174, 62, 0.28)",
      borderRadius: 16,
      borderWidth: 1,
      color: "#f3ebdd",
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 20,
      height: 58,
      marginTop: 16,
      paddingHorizontal: 14,
      writingDirection: "rtl",
    },
    customGuestModalContainer: {
      maxWidth: 390,
      width: "100%",
    },
    customGuestSubtitle: {
      color: "#969da0",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 5,
      textAlign: "right",
      writingDirection: "rtl",
    },
    customGuestTitle: {
      color: "#f2e9da",
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 21,
      lineHeight: 29,
      textAlign: "right",
      writingDirection: "rtl",
    },
    dateCard: {
      alignItems: "center",
      backgroundColor: "#111619",
      borderColor: "rgba(233, 174, 62, 0.18)",
      borderRadius: 16,
      borderWidth: 1,
      height: 76,
      justifyContent: "center",
      paddingHorizontal: 10,
      position: "relative",
    },
    dateCardSelected: {
      backgroundColor: "#2a210f",
      borderColor: gold,
      borderWidth: 1.5,
    },
    dateCheck: {
      height: 14,
      tintColor: gold,
      width: 14,
    },
    dateCheckMotion: {
      left: 7,
      position: "absolute",
      top: 7,
    },
    dateDay: {
      color: "#f3ebdd",
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
      writingDirection: "rtl",
    },
    dateLabel: {
      color: "#9da3a6",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 11.5,
      lineHeight: 17,
      marginTop: 3,
      textAlign: "center",
      writingDirection: "rtl",
    },
    dateRow: {
      direction: "ltr",
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 4,
      paddingVertical: 3,
    },
    descriptionText: {
      color: "#aaa59d",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 14.5,
      lineHeight: 22,
      marginTop: 11,
      textAlign: "right",
      writingDirection: "rtl",
    },
    detailOptionList: {
      gap: 10,
    },
    detailOptionCopy: {
      flex: 1,
      minWidth: 0,
    },
    detailOptionSupporting: {
      color: "#8f9699",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 2,
      textAlign: "right",
      writingDirection: "rtl",
    },
    detailOptionMeta: {
      alignItems: "flex-start",
      gap: 2,
      minWidth: 92,
    },
    detailOptionName: {
      color: "#eee5d7",
      flex: 1,
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 16,
      lineHeight: 23,
      textAlign: "right",
      writingDirection: "rtl",
    },
    detailOptionRow: {
      alignItems: "center",
      backgroundColor: "#0c1114",
      borderColor: "rgba(233, 174, 62, 0.12)",
      borderRadius: 17,
      borderWidth: 1,
      direction: "ltr",
      flexDirection: "row",
      gap: 10,
      minHeight: 62,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    detailInfoCheck: {
      height: 18,
      tintColor: gold,
      width: 18,
    },
    detailStack: {
      gap: 15,
    },
    disabledIcon: {
      height: 20,
      tintColor: "#e8e0d3",
      width: 20,
    },
    disabledIconButton: {
      alignItems: "center",
      backgroundColor: "rgba(5, 9, 11, 0.84)",
      borderColor: "rgba(243, 235, 221, 0.28)",
      borderRadius: 22,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      opacity: 0.72,
      width: 44,
    },
    eyebrow: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "right",
      writingDirection: "rtl",
    },
    employeeAvatar: {
      alignItems: "center",
      backgroundColor: "#19170f",
      borderColor: "rgba(233, 174, 62, 0.34)",
      borderRadius: 27,
      borderWidth: 1,
      height: 54,
      justifyContent: "center",
      width: 54,
    },
    employeeAvatarIcon: {
      height: 28,
      tintColor: gold,
      width: 28,
    },
    employeeAvatarText: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 16,
      lineHeight: 22,
      textAlign: "center",
      writingDirection: "rtl",
    },
    employeeCard: {
      alignItems: "center",
      backgroundColor: "#0d1215",
      borderColor: "rgba(233, 174, 62, 0.16)",
      borderRadius: 19,
      borderWidth: 1,
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 10,
      minHeight: 88,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    employeeCopy: {
      alignItems: "flex-end",
      flex: 1,
      minWidth: 0,
    },
    employeeName: {
      color: "#f0e7d9",
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 16,
      lineHeight: 22,
      textAlign: "right",
      width: "100%",
      writingDirection: "rtl",
    },
    employeeRatingIcon: {
      height: 13,
      tintColor: gold,
      width: 13,
    },
    employeeRatingRow: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 4,
      marginTop: 2,
    },
    employeeRatingText: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 12,
      lineHeight: 16,
      writingDirection: "ltr",
    },
    employeeRole: {
      color: "#949b9f",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 12.5,
      lineHeight: 17,
      marginTop: 1,
      textAlign: "right",
      width: "100%",
      writingDirection: "rtl",
    },
    employeeSelectedCheck: {
      alignItems: "center",
      backgroundColor: "#0d130f",
      borderColor: gold,
      borderRadius: 12,
      borderWidth: 1,
      height: 24,
      justifyContent: "center",
      width: 24,
    },
    employeeSelectionSlot: {
      alignItems: "center",
      height: 24,
      justifyContent: "center",
      width: 24,
    },
    employeeStatusDot: {
      backgroundColor: "#55ce94",
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    employeeStatusRow: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 4,
      marginTop: 2,
    },
    employeeStatusText: {
      color: "#67d89f",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 11,
      lineHeight: 15,
      writingDirection: "rtl",
    },
    featureCheck: {
      height: 14,
      tintColor: gold,
      width: 14,
    },
    featurePill: {
      alignItems: "center",
      backgroundColor: "#151811",
      borderColor: "rgba(233, 174, 62, 0.2)",
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 11,
    },
    featureText: {
      color: "#d5ccbd",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 13,
      lineHeight: 18,
      writingDirection: "rtl",
    },
    featureWrap: {
      direction: "rtl",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
    },
    flowStack: {
      gap: layout.sectionGap,
    },
    footer: {
      backgroundColor: "#080d10",
      borderTopColor: "rgba(233, 174, 62, 0.15)",
      borderTopWidth: 1,
      flexShrink: 0,
      gap: 8,
      paddingBottom: layout.verticalSpacing,
      paddingHorizontal: horizontalPadding,
      paddingTop: 10,
    },
    header: {
      alignItems: "center",
      backgroundColor: "#070b0e",
      borderBottomColor: "rgba(233, 174, 62, 0.14)",
      borderBottomWidth: 1,
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 12,
      minHeight: layout.isCompactHeight ? 76 : 88,
      paddingBottom: 9,
      paddingHorizontal: horizontalPadding,
      paddingTop: 9,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    headerCopyDetail: {
      alignItems: "flex-start",
    },
    headerDetailText: {
      alignSelf: "flex-start",
      textAlign: "left",
    },
    headerProgress: {
      alignItems: "center",
      flexShrink: 0,
      gap: 5,
      justifyContent: "center",
      width: width < 380 ? 66 : 76,
    },
    headerProgressLabel: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 12.5,
      lineHeight: 17,
      textAlign: "center",
      writingDirection: "rtl",
    },
    eyebrowRow: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 2,
    },
    headerSubtitle: {
      color: "#8f969b",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: width < 380 ? 12.5 : 13.5,
      lineHeight: width < 380 ? 18 : 19,
      marginTop: 1,
      textAlign: "right",
      writingDirection: "rtl",
    },
    headerTitle: {
      color: "#f3ebdd",
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: width < 380 ? 23 : 25,
      lineHeight: width < 380 ? 30 : 32,
      textAlign: "right",
      writingDirection: "rtl",
    },
    progressSegment: {
      backgroundColor: "#30363a",
      borderRadius: 2,
      height: 3,
      overflow: "hidden",
      width: width < 380 ? 12 : 14,
    },
    progressSegmentActive: {
      backgroundColor: gold,
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    progressTrack: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
    },
    hero: {
      backgroundColor: "#101812",
      borderColor: "rgba(233, 174, 62, 0.2)",
      borderRadius: 24,
      borderWidth: 1,
      height: heroHeight,
      overflow: "hidden",
      position: "relative",
    },
    heroActions: {
      flexDirection: "row",
      gap: 8,
      left: 12,
      position: "absolute",
      top: 12,
    },
    heroBusinessCategory: {
      color: "#b7b1a7",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 12.5,
      lineHeight: 17,
      marginTop: 1,
      textAlign: "right",
      width: "100%",
      writingDirection: "rtl",
    },
    heroBusinessName: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: width < 380 ? 16 : 17,
      lineHeight: width < 380 ? 21 : 23,
      textAlign: "right",
      width: "100%",
      writingDirection: "ltr",
    },
    heroClinic: {
      backgroundColor: "#111716",
    },
    heroGlow: {
      backgroundColor: "rgba(233, 174, 62, 0.16)",
      borderRadius: 90,
      height: 180,
      position: "absolute",
      right: -34,
      top: -40,
      width: 180,
    },
    heroDistance: {
      color: "#d6d0c5",
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 12,
      lineHeight: 17,
      writingDirection: "rtl",
    },
    heroIdentityCopy: {
      alignItems: "flex-end",
      flex: 1,
      minWidth: 0,
    },
    heroIdentityPanel: {
      alignItems: "center",
      backgroundColor: "rgba(5, 9, 11, 0.9)",
      borderColor: "rgba(233, 174, 62, 0.22)",
      borderRadius: 20,
      borderWidth: 1,
      bottom: 14,
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 9,
      left: 14,
      paddingHorizontal: 12,
      paddingVertical: 8,
      position: "absolute",
      right: 14,
    },
    heroPanel: {
      backgroundColor: "rgba(235, 219, 180, 0.07)",
      borderColor: "rgba(233, 174, 62, 0.12)",
      borderRadius: 18,
      borderWidth: 1,
      position: "absolute",
      transform: [{ rotate: "-8deg" }],
    },
    heroPanelOne: {
      bottom: 22,
      height: 92,
      left: 26,
      width: 118,
    },
    heroPanelTwo: {
      height: 72,
      left: "42%",
      top: 24,
      width: 96,
    },
    heroRestaurant: {
      backgroundColor: "#191108",
    },
    heroThumbnail: {
      alignItems: "center",
      backgroundColor: "#19170f",
      borderColor: "rgba(233, 174, 62, 0.42)",
      borderRadius: 16,
      borderWidth: 1,
      height: width < 380 ? 54 : 60,
      justifyContent: "center",
      width: width < 380 ? 54 : 60,
    },
    heroThumbnailIcon: {
      height: width < 380 ? 30 : 34,
      tintColor: gold,
      width: width < 380 ? 30 : 34,
    },
    heroTrustRow: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row-reverse",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 3,
      width: "100%",
    },
    identityCard: {
      backgroundColor: "#101518",
      borderColor: "rgba(233, 174, 62, 0.18)",
      borderRadius: 24,
      borderWidth: 1,
      padding: 17,
    },
    identityCopy: {
      alignItems: "flex-end",
      flex: 1,
      minWidth: 0,
    },
    identityHeading: {
      alignItems: "flex-start",
      direction: "ltr",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
    },
    identityTopRow: {
      alignItems: "flex-start",
      direction: "ltr",
      flexDirection: "row",
      gap: 12,
    },
    infoCopy: {
      flex: 1,
      minWidth: 0,
    },
    infoIcon: {
      height: 18,
      tintColor: gold,
      width: 18,
    },
    infoIconWrap: {
      alignItems: "center",
      backgroundColor: "#18170f",
      borderRadius: 17,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    infoLabel: {
      color: "#858d92",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "right",
      writingDirection: "rtl",
    },
    infoRow: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 9,
      minHeight: 46,
    },
    infoValue: {
      color: "#e6ded1",
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 14.5,
      lineHeight: 21,
      textAlign: "right",
      writingDirection: "rtl",
    },
    inlineMetric: {
      alignItems: "center",
      flexDirection: "row",
      gap: 5,
    },
    overviewMetricsRow: {
      alignItems: "center",
      direction: "rtl",
      flexDirection: "row",
      gap: 18,
      marginTop: 12,
    },
    localSafetyCard: {
      alignItems: "center",
      backgroundColor: "#101518",
      borderColor: "rgba(233, 174, 62, 0.14)",
      borderRadius: 18,
      borderWidth: 1,
      direction: "rtl",
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    localSafetyIcon: {
      height: 22,
      tintColor: gold,
      width: 22,
    },
    localSafetyText: {
      color: "#aeb9b3",
      flex: 1,
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 12.5,
      lineHeight: 18,
      textAlign: "right",
      writingDirection: "rtl",
    },
    metricColumn: {
      alignItems: "flex-start",
      gap: 8,
      paddingTop: 3,
    },
    metricIconGold: {
      height: 14,
      tintColor: gold,
      width: 14,
    },
    metricIconMuted: {
      height: 13,
      tintColor: "#979da0",
      width: 13,
    },
    metricMuted: {
      color: "#969ca0",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 11.5,
      lineHeight: 17,
      writingDirection: "ltr",
    },
    metricValue: {
      color: "#f0e8da",
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 13.5,
      lineHeight: 19,
      writingDirection: "ltr",
    },
    miniCopy: {
      flex: 1,
      minWidth: 0,
    },
    miniIcon: {
      height: 34,
      tintColor: gold,
      width: 34,
    },
    miniIconWrap: {
      alignItems: "center",
      backgroundColor: "#19170f",
      borderColor: "rgba(233, 174, 62, 0.22)",
      borderRadius: 20,
      borderWidth: 1,
      height: 52,
      justifyContent: "center",
      width: 52,
    },
    miniMeta: {
      color: "#939a9e",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "right",
      writingDirection: "rtl",
    },
    miniName: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 17,
      lineHeight: 23,
      textAlign: "right",
      writingDirection: "ltr",
    },
    miniSummary: {
      alignItems: "center",
      backgroundColor: "#101518",
      borderColor: "rgba(233, 174, 62, 0.18)",
      borderRadius: 20,
      borderWidth: 1,
      direction: "rtl",
      flexDirection: "row",
      gap: 9,
      minHeight: 84,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    motionStretch: {
      alignSelf: "stretch",
    },
    noteInput: {
      backgroundColor: "#0a0f12",
      borderColor: "rgba(233, 174, 62, 0.2)",
      borderRadius: 15,
      borderWidth: 1,
      color: "#f3ebdd",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 14,
      lineHeight: 22,
      minHeight: 128,
      padding: 14,
      textAlign: "right",
      textAlignVertical: "top",
      writingDirection: "rtl",
    },
    optionCard: {
      alignItems: "flex-end",
      backgroundColor: "#0d1215",
      borderColor: "rgba(233, 174, 62, 0.16)",
      borderRadius: 19,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 96,
      padding: 12,
      position: "relative",
      width: "100%",
    },
    optionCardCompact: {
      minHeight: 94,
    },
    optionCardFullWidth: {
      minHeight: 88,
    },
    optionCardGuest: {
      alignItems: "center",
      paddingHorizontal: 8,
    },
    optionCardServiceRtl: {
      alignItems: "stretch",
      direction: "ltr",
    },
    optionCardSelected: {
      backgroundColor: "#211b0e",
      borderColor: gold,
      borderWidth: 1.5,
    },
    optionLabel: {
      color: "#f0e7d9",
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 16,
      lineHeight: 22,
      paddingRight: 24,
      textAlign: "right",
      width: "100%",
      writingDirection: "rtl",
    },
    optionLabelGuest: {
      fontSize: 14,
      lineHeight: 20,
      paddingRight: 0,
      textAlign: "center",
    },
    optionMetaRow: {
      alignItems: "center",
      direction: "rtl",
      flexDirection: "row",
      gap: 6,
      justifyContent: "space-between",
      marginTop: 6,
      width: "100%",
    },
    optionMetaText: {
      color: "#969da0",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 13,
      lineHeight: 18,
      writingDirection: "rtl",
    },
    optionPriceText: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 13.5,
      lineHeight: 19,
      writingDirection: "rtl",
    },
    optionSupporting: {
      color: "#8d9498",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 3,
      textAlign: "right",
      width: "100%",
      writingDirection: "rtl",
    },
    primaryCta: {
      alignItems: "center",
      backgroundColor: gold,
      borderColor: "#f5d583",
      borderRadius: 21,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 60,
      paddingHorizontal: 18,
    },
    primaryCtaText: {
      color: "#171106",
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 16,
      lineHeight: 22,
      textAlign: "center",
      writingDirection: "rtl",
    },
    referenceCard: {
      alignItems: "center",
      alignSelf: "stretch",
      backgroundColor: "#17170e",
      borderColor: "rgba(233, 174, 62, 0.3)",
      borderRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    referenceCardCompact: {
      alignItems: "center",
      flex: 1,
      minWidth: 0,
    },
    referenceLabel: {
      color: "#989b95",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 12,
      lineHeight: 17,
      textAlign: "center",
      writingDirection: "rtl",
    },
    referenceValue: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 17,
      letterSpacing: 0.8,
      lineHeight: 23,
      marginTop: 2,
      writingDirection: "ltr",
    },
    receiptTopRow: {
      alignItems: "center",
      backgroundColor: "#101518",
      borderColor: "rgba(233, 174, 62, 0.16)",
      borderRadius: 22,
      borderWidth: 1,
      direction: "rtl",
      flexDirection: "row",
      gap: 12,
      padding: 13,
    },
    confirmedStatusIcon: {
      height: 16,
      tintColor: "#55ce94",
      width: 16,
    },
    confirmedStatusPill: {
      alignItems: "center",
      backgroundColor: "#102019",
      borderColor: "rgba(85, 206, 148, 0.28)",
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 10,
    },
    confirmedStatusText: {
      color: "#67d89f",
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 12.5,
      lineHeight: 18,
      writingDirection: "rtl",
    },
    safetyText: {
      color: "#8d9498",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 6,
      textAlign: "right",
      writingDirection: "rtl",
    },
    screen: {
      backgroundColor: "#05090b",
      flex: 1,
      minHeight: 0,
    },
    scroll: {
      flex: 1,
      minHeight: 0,
    },
    scrollContent: {
      paddingBottom: layout.isCompactHeight ? 20 : 28,
      paddingHorizontal: horizontalPadding,
      paddingTop: layout.screenTopPadding,
    },
    secondaryCta: {
      alignItems: "center",
      backgroundColor: "#0b1013",
      borderColor: "rgba(233, 174, 62, 0.35)",
      borderRadius: 21,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 56,
      paddingHorizontal: 16,
    },
    secondaryCtaText: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 15,
      lineHeight: 21,
      textAlign: "center",
      writingDirection: "rtl",
    },
    sectionCard: {
      backgroundColor: "#101518",
      borderColor: "rgba(233, 174, 62, 0.16)",
      borderRadius: 24,
      borderWidth: 1,
      padding: width < 380 ? 14 : 15,
    },
    sectionCardFlat: {
      backgroundColor: "transparent",
      borderWidth: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    sectionTitle: {
      color: "#f0e8da",
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: width < 380 ? 18.5 : 19.5,
      lineHeight: width < 380 ? 25 : 27,
      marginBottom: 10,
      textAlign: "right",
      writingDirection: "rtl",
    },
    selectedCheck: {
      height: 15,
      tintColor: gold,
      width: 15,
    },
    selectedCheckWrap: {
      alignItems: "center",
      backgroundColor: "#0d130f",
      borderColor: gold,
      borderRadius: 11,
      borderWidth: 1,
      height: 22,
      justifyContent: "center",
      position: "absolute",
      right: 8,
      top: 8,
      width: 22,
    },
    serviceCardCheck: {
      alignItems: "center",
      backgroundColor: "#0d130f",
      borderColor: gold,
      borderRadius: 11,
      borderWidth: 1,
      height: 22,
      justifyContent: "center",
      position: "absolute",
      right: 14,
      top: 14,
      width: 22,
    },
    serviceCardContent: {
      alignItems: "flex-end",
      flex: 1,
      justifyContent: "center",
      paddingRight: 52,
      width: "100%",
    },
    serviceDuration: {
      color: "#969da0",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 3,
      alignSelf: "stretch",
      textAlign: "right",
      width: "100%",
      writingDirection: "rtl",
    },
    serviceName: {
      alignSelf: "stretch",
      color: "#f0e7d9",
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: 16,
      lineHeight: 22,
      textAlign: "right",
      width: "100%",
      writingDirection: "rtl",
    },
    servicePrice: {
      alignSelf: "stretch",
      color: gold,
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 14,
      lineHeight: 19,
      marginTop: 1,
      textAlign: "right",
      width: "100%",
      writingDirection: "rtl",
    },
    selectionGrid: {
      direction: "ltr",
      flexDirection: "row-reverse",
      flexWrap: "wrap",
      gap: 9,
      justifyContent: "flex-start",
    },
    statusPill: {
      alignSelf: "flex-start",
      backgroundColor: "#10251d",
      borderColor: "rgba(73, 201, 138, 0.35)",
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    statusText: {
      color: "#55ce94",
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 12,
      lineHeight: 17,
      writingDirection: "rtl",
    },
    summaryCard: {
      backgroundColor: "#101518",
      borderColor: "rgba(233, 174, 62, 0.19)",
      borderRadius: 24,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    summaryHighlight: {
      alignItems: "center",
      backgroundColor: "#1a170d",
      borderColor: "rgba(233, 174, 62, 0.3)",
      borderRadius: 18,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 54,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    summaryHighlightText: {
      color: gold,
      fontFamily: PREVIEW_FONT.uiSemiBold,
      fontSize: width < 380 ? 15 : 16,
      lineHeight: width < 380 ? 21 : 23,
      textAlign: "center",
      writingDirection: "rtl",
    },
    summaryLabel: {
      color: "#8e9599",
      fontFamily: PREVIEW_FONT.uiRegular,
      fontSize: 13.5,
      lineHeight: 19,
      textAlign: "right",
      width: "36%",
      writingDirection: "rtl",
    },
    summaryRow: {
      alignItems: "flex-start",
      borderBottomColor: "rgba(233, 174, 62, 0.08)",
      borderBottomWidth: 1,
      direction: "ltr",
      flexDirection: "row-reverse",
      gap: 8,
      justifyContent: "space-between",
      minHeight: 54,
      paddingVertical: 9,
    },
    summaryValue: {
      color: "#eee5d8",
      flex: 1,
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "right",
      writingDirection: "rtl",
    },
    timeButton: {
      alignItems: "center",
      backgroundColor: "#0d1215",
      borderColor: "rgba(233, 174, 62, 0.18)",
      borderRadius: 15,
      borderWidth: 1,
      direction: "ltr",
      flexDirection: "row",
      gap: 7,
      justifyContent: "center",
      minHeight: 48,
    },
    timeButtonSelected: {
      backgroundColor: "#221b0d",
      borderColor: gold,
      borderWidth: 1.5,
    },
    timeCheck: {
      height: 15,
      tintColor: gold,
      width: 15,
    },
    timeGrid: {
      direction: "ltr",
      flexDirection: "row-reverse",
      flexWrap: "wrap",
      gap: 9,
      justifyContent: "flex-start",
    },
    timeIcon: {
      height: 15,
      tintColor: "#969da0",
      width: 15,
    },
    timeLabel: {
      color: "#eee5d8",
      fontFamily: PREVIEW_FONT.uiMedium,
      fontSize: 14,
      lineHeight: 20,
      writingDirection: "rtl",
    },
  });
};
