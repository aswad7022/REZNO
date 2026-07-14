import { useEffect, useMemo, useRef, useState } from "react";
import { requireOptionalNativeModule } from "expo-modules-core";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from "react-native";

import { labels, type MobileLocale } from "../i18n/labels";
import {
  PremiumEntrance,
  PremiumPressable,
} from "../components/premium-motion";
import type { MobileTheme } from "../theme/tokens";
import type {
  MobileBusinessVertical,
  MobileMarketplaceBusiness,
} from "../types/marketplace";
import {
  getNearbyVisualQaFixturePreviewToken,
  NEARBY_VISUAL_QA_FIXTURES,
  NEARBY_VISUAL_QA_USER_POSITION,
  type NearbyVisualQaBusinessId,
  type NearbyVisualQaArtwork,
  type NearbyVisualQaFixture,
  type NearbyVisualQaUserPosition,
} from "./fixtures/nearby-visual-qa-fixtures";
import {
  ReznoNearbyPreviewFlow,
  type ReznoNearbyPreviewFlowHandle,
} from "./rezno-nearby-preview-flow";

const NEARBY_FONT = {
  kufiBold: "NotoKufiArabic-Bold",
  uiMedium: "NotoSansArabicUI-Medium",
  uiRegular: "NotoSansArabicUI-Regular",
  uiSemiBold: "NotoSansArabicUI-SemiBold",
} as const;

const NEARBY_LAYOUT = {
  cardGap: 10,
  mapHorizontalInset: 20,
  maxMapHeight: 250,
  minMapHeight: 210,
} as const;

type NearbyCopy = {
  allCategories: string;
  distanceUnavailable: string;
  favoriteUnavailable: string;
  filterAccessibility: string;
  listAccessibility: string;
  mapAccessibility: (count: number) => string;
  nearby: string;
  openBusinessHint: string;
  priceUnavailable: string;
  previewBusinessHint: string;
  previewMapAccessibility: string;
  previewUserMarkerAccessibility: string;
  resultsTitle: string;
  searchAccessibility: string;
  searchPlaceholder: string;
  topRated: string;
};

const NEARBY_COPY: Record<MobileLocale, NearbyCopy> = {
  ar: {
    allCategories: "جميع الفئات",
    distanceUnavailable: "المسافة غير متاحة",
    favoriteUnavailable: "إضافة المفضلة غير متاحة حالياً",
    filterAccessibility: "خيارات تصفية البحث غير متاحة حالياً",
    listAccessibility: "طريقة عرض القائمة غير متاحة حالياً",
    mapAccessibility: (count) =>
      count > 0
        ? `خريطة داكنة تعرض ${count} من مواقع الأنشطة الحقيقية`
        : "خريطة داكنة، لا تتوفر مواقع أنشطة حقيقية حالياً",
    nearby: "القرب منك",
    openBusinessHint: "يفتح تفاصيل النشاط",
    priceUnavailable: "السعر غير متاح",
    previewBusinessHint:
      "يفتح معاينة محلية لتفاصيل النشاط والحجز دون اتصال حقيقي",
    previewMapAccessibility:
      "معاينة مرئية لخريطة داكنة تعرض ثلاثة مواقع تجريبية غير حقيقية",
    previewUserMarkerAccessibility:
      "معاينة مرئية لموقع المستخدم، وليست موقعاً حقيقياً مكتشفاً",
    resultsTitle: "نتائج بالقرب منك",
    searchAccessibility: "حقل البحث المرئي، البحث النصي غير متاح حالياً",
    searchPlaceholder: "ابحث عن مطعم، عيادة، صالون...",
    topRated: "الأعلى تقييماً",
  },
  en: {
    allCategories: "All categories",
    distanceUnavailable: "Distance unavailable",
    favoriteUnavailable: "Adding favorites is not available yet",
    filterAccessibility: "Search filters are not available yet",
    listAccessibility: "List view switching is not available yet",
    mapAccessibility: (count) =>
      count > 0
        ? `Dark map showing ${count} real business locations`
        : "Dark map with no real business locations available",
    nearby: "Near you",
    openBusinessHint: "Opens business details",
    priceUnavailable: "Price unavailable",
    previewBusinessHint:
      "Opens a local detail and booking preview without contacting a real business",
    previewMapAccessibility:
      "Visual preview of a dark map with three non-geographic test markers",
    previewUserMarkerAccessibility:
      "Visual user-position preview; not a detected location",
    resultsTitle: "Results near you",
    searchAccessibility: "Visual search field; text search is not available yet",
    searchPlaceholder: "Search restaurants, clinics, salons...",
    topRated: "Top rated",
  },
  ckb: {
    allCategories: "هەموو پۆلەکان",
    distanceUnavailable: "دووری بەردەست نییە",
    favoriteUnavailable: "زیادکردنی دڵخواز هێشتا بەردەست نییە",
    filterAccessibility: "پاڵێوەکانی گەڕان هێشتا بەردەست نین",
    listAccessibility: "گۆڕینی پیشاندانی لیست هێشتا بەردەست نییە",
    mapAccessibility: (count) =>
      count > 0
        ? `نەخشەی تاریک ${count} شوێنی ڕاستەقینەی کار پیشان دەدات`
        : "نەخشەی تاریک، هیچ شوێنی ڕاستەقینەی کار بەردەست نییە",
    nearby: "لە نزیک تۆ",
    openBusinessHint: "وردەکارییەکانی کار دەکاتەوە",
    priceUnavailable: "نرخ بەردەست نییە",
    previewBusinessHint:
      "پێشبینینی ناوخۆیی وردەکاری و حجز دەکاتەوە بەبێ پەیوەندی ڕاستەقینە",
    previewMapAccessibility:
      "پێشبینینی نەخشەی تاریک بە سێ نیشانەی تاقیکردنەوەی ناڕاستەقینە",
    previewUserMarkerAccessibility:
      "پێشبینینی شوێنی بەکارهێنەرە؛ شوێنی دۆزراوەی ڕاستەقینە نییە",
    resultsTitle: "ئەنجامەکانی نزیک تۆ",
    searchAccessibility: "خانەی گەڕانی بینراو؛ گەڕانی دەق هێشتا بەردەست نییە",
    searchPlaceholder: "بگەڕێ بۆ چێشتخانە، کلینیک، سالۆن...",
    topRated: "بەرزترین هەڵسەنگاندن",
  },
};

/* eslint-disable @typescript-eslint/no-require-imports -- Expo bundles existing local assets through static require(). */
const NEARBY_ICONS = {
  filter: require("../../assets/icons/common/filter.png") as ImageSourcePropType,
  heart: require("../../assets/icons/common/heart.png") as ImageSourcePropType,
  location: require("../../assets/icons/common/location-pin.png") as ImageSourcePropType,
  search: require("../../assets/icons/common/search.png") as ImageSourcePropType,
  star: require("../../assets/icons/common/star-rating.png") as ImageSourcePropType,
};
/* eslint-enable @typescript-eslint/no-require-imports */

export type NearbyMarketplaceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; businesses: MobileMarketplaceBusiness[] }
  | { status: "error"; message: string };

type NearbyLoadedMarketplaceState = Extract<
  NearbyMarketplaceState,
  { status: "loaded" }
>;

export type NearbySearchBusiness = {
  category: string;
  distance: string;
  id: string;
  name: string;
  price: string;
  rating: string;
  reviewCount: string;
  slug: string;
  status: string;
  tag: string;
};

type NearbyResultBase = {
  artwork: "default" | NearbyVisualQaArtwork;
  badge: string | null;
  business: NearbySearchBusiness;
  category: string;
  distanceKm: number | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  matchingServiceName: string | null;
  rating: number | null;
  reviewCount: number;
};

type NearbyResult = NearbyResultBase &
  (
    | {
        previewBusinessId: null;
        source: "api";
      }
    | {
        previewBusinessId: NearbyVisualQaBusinessId;
        source: "visual-qa-fixture";
      }
  );

type ProjectedMarker = {
  businessName: string;
  id: string;
  left: number;
  top: number;
};

type ProjectedPosition = {
  left: number;
  top: number;
};

type NearbyPreviewSession = {
  activationToken: object;
  businessId: NearbyVisualQaBusinessId;
  marketplaceSnapshot: NearbyLoadedMarketplaceState;
};

type NearbyStyles = ReturnType<typeof createStyles>;

type DevMenuPreferencesModule = {
  getPreferencesAsync(): Promise<{ showFloatingActionButton?: boolean }>;
  setPreferencesAsync(settings: {
    showFloatingActionButton: boolean;
  }): Promise<void>;
};

const DEV_MENU_PREFERENCES = __DEV__
  ? requireOptionalNativeModule<DevMenuPreferencesModule>("DevMenuPreferences")
  : null;

export function ReznoNearbySearchScreen({
  isRtl,
  locale,
  onOpenBusiness,
  onRetry,
  state,
  theme,
}: {
  isRtl: boolean;
  locale: MobileLocale;
  onOpenBusiness: (business: NearbySearchBusiness) => void;
  onRetry: () => void;
  state: NearbyMarketplaceState;
  theme: MobileTheme;
}) {
  const { height, width } = useWindowDimensions();
  const copy = NEARBY_COPY[locale];
  const stateCopy = labels[locale];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [previewSession, setPreviewSession] =
    useState<NearbyPreviewSession | null>(null);
  const previewFlowRef = useRef<ReznoNearbyPreviewFlowHandle>(null);
  const pagePadding = width < 380 ? 18 : width >= 430 ? 22 : 20;
  const sheetPadding = width < 390 ? 16 : width >= 430 ? 20 : 18;
  const searchHeight = width < 380 ? 56 : width >= 430 ? 60 : 58;
  const chipHeight = width < 380 ? 42 : width >= 430 ? 46 : 44;
  const chipGap = width < 380 ? 6 : width >= 430 ? 10 : 8;
  const mapHeight = clamp(
    Math.round(height * 0.265),
    NEARBY_LAYOUT.minMapHeight,
    NEARBY_LAYOUT.maxMapHeight,
  );
  const sheetOverlap = clamp(Math.round(height * 0.035), 26, 34);
  const cardHeight = clamp(Math.round(width * 0.345), 132, 144);
  const mediaWidth = clamp(Math.round(width * 0.3), 108, 128);
  const realResults = useMemo(
    () => deriveNearbyResults(state, locale, copy),
    [copy, locale, state],
  );
  const previewActivationToken = getNearbyVisualQaFixturePreviewToken();
  const visualQaPreviewActive =
    previewActivationToken !== null &&
    state.status === "loaded" &&
    state.businesses.length === 0;
  const results = useMemo(
    () =>
      visualQaPreviewActive
        ? deriveVisualQaResults(NEARBY_VISUAL_QA_FIXTURES, locale, copy)
        : realResults,
    [copy, locale, realResults, visualQaPreviewActive],
  );
  const markers = useMemo(
    () =>
      visualQaPreviewActive
        ? projectVisualQaMarkers(NEARBY_VISUAL_QA_FIXTURES, width, mapHeight)
        : projectBusinessMarkers(realResults, width, mapHeight),
    [mapHeight, realResults, visualQaPreviewActive, width],
  );
  const previewUserPosition = useMemo(
    () =>
      visualQaPreviewActive
        ? projectVisualQaPosition(
            NEARBY_VISUAL_QA_USER_POSITION,
            width,
            mapHeight,
            46,
          )
        : null,
    [mapHeight, visualQaPreviewActive, width],
  );
  const listIsEmpty = results.length === 0;
  const selectedPreviewBusiness =
    visualQaPreviewActive &&
    state.status === "loaded" &&
    previewSession?.activationToken === previewActivationToken &&
    previewSession.marketplaceSnapshot === state
    ? (NEARBY_VISUAL_QA_FIXTURES.find(
        (fixture) => fixture.id === previewSession.businessId,
      ) ?? null)
    : null;
  const previewModalActive = selectedPreviewBusiness !== null;

  useEffect(() => {
    if (!previewModalActive || !DEV_MENU_PREFERENCES) return;

    let cancelled = false;
    let originalFabVisibility: boolean | undefined;
    const hideFabTask = DEV_MENU_PREFERENCES.getPreferencesAsync()
      .then((preferences) => {
        if (cancelled) return;

        originalFabVisibility =
          preferences.showFloatingActionButton ?? true;
        return DEV_MENU_PREFERENCES.setPreferencesAsync({
          showFloatingActionButton: false,
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      void hideFabTask.finally(() => {
        if (originalFabVisibility === undefined) return;

        void DEV_MENU_PREFERENCES.setPreferencesAsync({
          showFloatingActionButton: originalFabVisibility,
        });
      });
    };
  }, [previewModalActive]);

  const handleOpenPreviewBusiness = (
    businessId: NearbyVisualQaBusinessId,
  ) => {
    if (
      !visualQaPreviewActive ||
      previewActivationToken === null ||
      state.status !== "loaded"
    ) {
      return;
    }

    setPreviewSession({
      activationToken: previewActivationToken,
      businessId,
      marketplaceSnapshot: state,
    });
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topControls, { paddingHorizontal: pagePadding }]}>
        <NearbySearchField
          copy={copy}
          height={searchHeight}
          isRtl={isRtl}
          styles={styles}
        />
        <NearbyFilterRow
          chipGap={chipGap}
          chipHeight={chipHeight}
          copy={copy}
          isRtl={isRtl}
          styles={styles}
        />
      </View>

      <NearbyMap
        accessibilityLabel={
          visualQaPreviewActive
            ? copy.previewMapAccessibility
            : copy.mapAccessibility(markers.length)
        }
        height={mapHeight}
        markers={markers}
        previewUserMarkerAccessibility={copy.previewUserMarkerAccessibility}
        previewUserPosition={previewUserPosition}
        styles={styles}
      />

      <PremiumEntrance
        distance={12}
        style={[
          styles.resultsSheet,
          {
            marginTop: -sheetOverlap,
            paddingHorizontal: sheetPadding,
          },
        ]}
      >
        <View style={styles.sheetHandle} />
        <NearbyResultsHeader copy={copy} isRtl={isRtl} styles={styles} width={width} />
        <FlatList
          contentContainerStyle={[
            styles.resultsListContent,
            listIsEmpty && styles.resultsListContentEmpty,
          ]}
          data={state.status === "loaded" ? results : []}
          ItemSeparatorComponent={NearbyResultSeparator}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.business.id}
          ListEmptyComponent={
            <NearbyListState
              cardHeight={cardHeight}
              isRtl={isRtl}
              onRetry={onRetry}
              state={state}
              stateCopy={stateCopy}
              styles={styles}
            />
          }
          renderItem={({ item }) => (
            <NearbyResultCard
              cardHeight={cardHeight}
              copy={copy}
              isRtl={isRtl}
              mediaWidth={mediaWidth}
              onPress={
                item.source === "api"
                  ? () => onOpenBusiness(item.business)
                  : () => handleOpenPreviewBusiness(item.previewBusinessId)
              }
              result={item}
              styles={styles}
            />
          )}
          showsVerticalScrollIndicator={false}
          style={styles.resultsList}
        />
      </PremiumEntrance>

      <Modal
        animationType="slide"
        onRequestClose={() => previewFlowRef.current?.goBack()}
        presentationStyle="fullScreen"
        visible={selectedPreviewBusiness !== null}
      >
        <SafeAreaView
          accessibilityViewIsModal
          style={styles.previewModalSafeArea}
        >
          {selectedPreviewBusiness ? (
            <ReznoNearbyPreviewFlow
              business={selectedPreviewBusiness}
              isRtl={isRtl}
              key={selectedPreviewBusiness.id}
              onExit={() => setPreviewSession(null)}
              ref={previewFlowRef}
              theme={theme}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function NearbySearchField({
  copy,
  height,
  isRtl,
  styles,
}: {
  copy: NearbyCopy;
  height: number;
  isRtl: boolean;
  styles: NearbyStyles;
}) {
  const filterSize = height - 10;

  return (
    <View
      accessibilityLabel={copy.searchAccessibility}
      accessibilityRole="search"
      accessible
      style={[styles.searchField, { height }]}
    >
      <Image
        accessible={false}
        alt=""
        resizeMode="contain"
        source={NEARBY_ICONS.search}
        style={styles.searchIcon}
      />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        numberOfLines={1}
        style={[
          styles.searchPlaceholder,
          isRtl ? styles.rtlText : styles.ltrText,
        ]}
      >
        {copy.searchPlaceholder}
      </Text>
      <View
        accessibilityLabel={copy.filterAccessibility}
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessible
        style={[styles.searchFilterButton, { height: filterSize, width: filterSize }]}
      >
        <Image
          accessible={false}
          alt=""
          resizeMode="contain"
          source={NEARBY_ICONS.filter}
          style={styles.searchFilterIcon}
        />
      </View>
    </View>
  );
}

function NearbyFilterRow({
  chipGap,
  chipHeight,
  copy,
  isRtl,
  styles,
}: {
  chipGap: number;
  chipHeight: number;
  copy: NearbyCopy;
  isRtl: boolean;
  styles: NearbyStyles;
}) {
  const chips = [
    { active: false, flex: 1, label: copy.allCategories },
    { active: false, flex: 1.16, label: copy.topRated },
    { active: true, flex: 1.08, label: copy.nearby },
  ];

  return (
    <View style={[styles.filterRow, { gap: chipGap }]}>
      {chips.map((chip) => (
        <View
          accessibilityLabel={chip.label}
          accessibilityRole="tab"
          accessibilityState={{ disabled: true, selected: chip.active }}
          accessible
          key={chip.label}
          style={[
            styles.filterChip,
            { flex: chip.flex, height: chipHeight },
            chip.active && styles.filterChipActive,
          ]}
        >
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.78}
            numberOfLines={1}
            style={[
              styles.filterChipText,
              isRtl
                ? styles.filterChipRtlText
                : styles.filterChipLtrText,
              chip.active && styles.filterChipTextActive,
            ]}
          >
            {chip.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function NearbyMap({
  accessibilityLabel,
  height,
  markers,
  previewUserMarkerAccessibility,
  previewUserPosition,
  styles,
}: {
  accessibilityLabel: string;
  height: number;
  markers: ProjectedMarker[];
  previewUserMarkerAccessibility: string;
  previewUserPosition: ProjectedPosition | null;
  styles: NearbyStyles;
}) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessible
      style={[styles.map, { height }]}
    >
      <View style={[styles.mapRoad, styles.mapRoadOne]} />
      <View style={[styles.mapRoad, styles.mapRoadTwo]} />
      <View style={[styles.mapRoad, styles.mapRoadThree]} />
      <View style={[styles.mapRoad, styles.mapRoadFour]} />
      <View style={[styles.mapRoad, styles.mapRoadFive]} />
      <View style={[styles.mapStreet, styles.mapStreetOne]} />
      <View style={[styles.mapStreet, styles.mapStreetTwo]} />
      <View style={[styles.mapStreet, styles.mapStreetThree]} />
      <View style={[styles.mapBlock, styles.mapBlockOne]} />
      <View style={[styles.mapBlock, styles.mapBlockTwo]} />
      <View style={[styles.mapBlock, styles.mapBlockThree]} />

      {previewUserPosition ? (
        <View
          accessibilityLabel={previewUserMarkerAccessibility}
          accessible
          style={[
            styles.previewUserMarker,
            {
              left: previewUserPosition.left,
              top: previewUserPosition.top,
            },
          ]}
        >
          <View style={styles.previewUserMarkerPulse} />
          <View style={styles.previewUserMarkerCore}>
            <View style={styles.previewUserMarkerDot} />
          </View>
        </View>
      ) : null}

      {markers.map((marker) => (
        <View
          accessibilityLabel={marker.businessName}
          accessible
          key={marker.id}
          style={[
            styles.businessMarker,
            { left: marker.left, top: marker.top },
          ]}
        >
          <View style={styles.businessMarkerGlow} />
          <View style={styles.businessMarkerPin}>
            <Image
              accessible={false}
              alt=""
              resizeMode="contain"
              source={NEARBY_ICONS.location}
              style={styles.businessMarkerIcon}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function NearbyResultsHeader({
  copy,
  isRtl,
  styles,
  width,
}: {
  copy: NearbyCopy;
  isRtl: boolean;
  styles: NearbyStyles;
  width: number;
}) {
  const titleSize = width < 380 ? 22 : width >= 430 ? 24 : 23;

  return (
    <View style={styles.resultsHeader}>
      <View
        accessibilityLabel={copy.listAccessibility}
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessible
        style={styles.listViewButton}
      >
        {[0, 1, 2].map((line) => (
          <View key={line} style={styles.listGlyphRow}>
            <View style={styles.listGlyphDot} />
            <View style={styles.listGlyphLine} />
          </View>
        ))}
      </View>
      <View style={styles.resultsTitleWrap}>
        <View accessible={false} style={styles.resultsSparkle}>
          <View style={styles.resultsSparkleHorizontal} />
          <View style={styles.resultsSparkleVertical} />
        </View>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.86}
          numberOfLines={1}
          style={[
            styles.resultsTitle,
            { fontSize: titleSize, lineHeight: titleSize + 8 },
            isRtl ? styles.rtlText : styles.ltrText,
          ]}
        >
          {copy.resultsTitle}
        </Text>
      </View>
    </View>
  );
}

function NearbyResultCard({
  cardHeight,
  copy,
  isRtl,
  mediaWidth,
  onPress,
  result,
  styles,
}: {
  cardHeight: number;
  copy: NearbyCopy;
  isRtl: boolean;
  mediaWidth: number;
  onPress: () => void;
  result: NearbyResult;
  styles: NearbyStyles;
}) {
  const nameIsLtr = /[A-Za-z]/.test(result.business.name);
  const categoryIsLtr = /[A-Za-z]/.test(result.category);
  const serviceIsLtr = result.matchingServiceName
    ? /[A-Za-z]/.test(result.matchingServiceName)
    : false;
  const isOpenPreviewStatus =
    result.source === "visual-qa-fixture" &&
    result.matchingServiceName === "مفتوح الآن";

  return (
    <PremiumPressable
      accessibilityHint={
        result.source === "api"
          ? copy.openBusinessHint
          : copy.previewBusinessHint
      }
      accessibilityLabel={buildBusinessAccessibilityLabel(result)}
      accessibilityRole="button"
      onPress={onPress}
      scaleTo={0.985}
      style={[
        styles.resultCard,
        { height: cardHeight },
      ]}
    >
      <View style={styles.resultActions}>
        <Pressable
          accessibilityLabel={copy.favoriteUnavailable}
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          onPress={(event) => event.stopPropagation()}
          style={styles.favoriteButton}
        >
          <Image
            accessible={false}
            alt=""
            resizeMode="contain"
            source={NEARBY_ICONS.heart}
            style={styles.favoriteIcon}
          />
        </Pressable>
        {result.distanceKm !== null ? (
          <View style={styles.distanceRow}>
            <Image
              accessible={false}
              alt=""
              resizeMode="contain"
              source={NEARBY_ICONS.location}
              style={styles.distanceIcon}
            />
            <Text numberOfLines={1} style={styles.distanceText}>
              {result.business.distance}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.resultCopy}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          numberOfLines={2}
          style={[
            styles.resultName,
            nameIsLtr
              ? isRtl
                ? styles.naturalLtrText
                : styles.ltrText
              : isRtl
                ? styles.rtlText
                : styles.ltrText,
          ]}
        >
          {result.business.name}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.resultCategory,
            categoryIsLtr
              ? isRtl
                ? styles.naturalLtrText
                : styles.ltrText
              : isRtl
                ? styles.rtlText
                : styles.ltrText,
          ]}
        >
          {result.category}
        </Text>
        {result.matchingServiceName ? (
          <Text
            numberOfLines={1}
            style={[
              styles.resultService,
              serviceIsLtr
                ? isRtl
                  ? styles.naturalLtrText
                  : styles.ltrText
                : isRtl
                  ? styles.rtlText
                  : styles.ltrText,
              isOpenPreviewStatus && styles.previewOpenStatus,
            ]}
          >
            {result.matchingServiceName}
          </Text>
        ) : null}
        {result.rating !== null ? (
          <View style={styles.ratingRow}>
            <Image
              accessible={false}
              alt=""
              resizeMode="contain"
              source={NEARBY_ICONS.star}
              style={styles.ratingIcon}
            />
            <Text style={styles.ratingValue}>{result.rating.toFixed(1)}</Text>
            <Text style={styles.reviewCount}>({result.reviewCount})</Text>
          </View>
        ) : null}
      </View>

      <NearbyResultMedia
        artwork={result.artwork}
        badge={result.badge}
        height={cardHeight - 18}
        imageUrl={result.imageUrl}
        styles={styles}
        width={mediaWidth}
      />
    </PremiumPressable>
  );
}

function NearbyResultMedia({
  artwork,
  badge,
  height,
  imageUrl,
  styles,
  width,
}: {
  artwork: "default" | NearbyVisualQaArtwork;
  badge: string | null;
  height: number;
  imageUrl: string | null;
  styles: NearbyStyles;
  width: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl && !imageFailed);

  return (
    <View style={[styles.resultMedia, { height, width }]}>
      {showImage && imageUrl ? (
        <Image
          accessible={false}
          alt=""
          onError={() => setImageFailed(true)}
          resizeMode="cover"
          source={{ uri: imageUrl }}
          style={styles.resultImage}
        />
      ) : (
        <VenueFallback artwork={artwork} styles={styles} />
      )}
      {badge ? (
        <View style={styles.imageBadge}>
          <Text numberOfLines={1} style={styles.imageBadgeText}>
            {badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function VenueFallback({
  artwork,
  styles,
}: {
  artwork: "default" | NearbyVisualQaArtwork;
  styles: NearbyStyles;
}) {
  const isRestaurant = artwork === "restaurant";
  const isClinic = artwork === "clinic";

  return (
    <View
      accessible={false}
      style={[
        styles.venueFallback,
        isRestaurant && styles.venueFallbackRestaurant,
        isClinic && styles.venueFallbackClinic,
      ]}
    >
      <View
        style={[
          styles.venueGlow,
          isRestaurant && styles.venueGlowRestaurant,
          isClinic && styles.venueGlowClinic,
        ]}
      />
      {isRestaurant ? (
        <>
          <View style={styles.restaurantPendant} />
          <View style={[styles.restaurantTable, styles.restaurantTableLeft]} />
          <View style={[styles.restaurantTable, styles.restaurantTableRight]} />
          <View style={styles.restaurantFloor} />
        </>
      ) : isClinic ? (
        <>
          <View style={styles.clinicLightPanel} />
          <View style={styles.clinicChairBack} />
          <View style={styles.clinicChairSeat} />
          <View style={styles.clinicCabinet} />
          <View style={styles.venueFloor} />
        </>
      ) : (
        <>
          <View style={styles.venueCeiling} />
          <View style={styles.venueArchRow}>
            <View style={styles.venueArch} />
            <View style={styles.venueArch} />
            <View style={styles.venueArchSmall} />
          </View>
          <View style={styles.venueCounter} />
          <View style={styles.venueFloor} />
        </>
      )}
    </View>
  );
}

function NearbyListState({
  cardHeight,
  isRtl,
  onRetry,
  state,
  stateCopy,
  styles,
}: {
  cardHeight: number;
  isRtl: boolean;
  onRetry: () => void;
  state: NearbyMarketplaceState;
  stateCopy: (typeof labels)[MobileLocale];
  styles: NearbyStyles;
}) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <View
        accessibilityLabel={stateCopy.marketplaceLoading}
        accessible
        style={styles.skeletonStack}
      >
        {[0, 1, 2].map((item) => (
          <View key={item} style={[styles.resultCard, { height: cardHeight }]}>
            <View style={styles.skeletonActions}>
              <View style={styles.skeletonCircle} />
              <View style={styles.skeletonLineShort} />
            </View>
            <View style={styles.skeletonCopy}>
              <View style={styles.skeletonLineTitle} />
              <View style={styles.skeletonLineMedium} />
              <View style={styles.skeletonLineShort} />
            </View>
            <View style={[styles.skeletonMedia, { height: cardHeight - 18 }]} />
          </View>
        ))}
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View style={styles.stateCard}>
        <Text
          style={[
            styles.stateTitle,
            isRtl ? styles.rtlText : styles.ltrText,
          ]}
        >
          {stateCopy.marketplaceErrorTitle}
        </Text>
        <Text
          numberOfLines={3}
          style={[
            styles.stateBody,
            isRtl ? styles.rtlText : styles.ltrText,
          ]}
        >
          {state.message}
        </Text>
        <PremiumPressable
          accessibilityLabel={stateCopy.marketplaceRetry}
          accessibilityRole="button"
          onPress={onRetry}
          scaleTo={0.97}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>{stateCopy.marketplaceRetry}</Text>
        </PremiumPressable>
      </View>
    );
  }

  return (
    <View style={styles.stateCard}>
      <Text
        style={[
          styles.stateTitle,
          isRtl ? styles.rtlText : styles.ltrText,
        ]}
      >
        {stateCopy.marketplaceEmptyTitle}
      </Text>
      <Text
        numberOfLines={3}
        style={[
          styles.stateBody,
          isRtl ? styles.rtlText : styles.ltrText,
        ]}
      >
        {stateCopy.marketplaceEmptyBody}
      </Text>
    </View>
  );
}

function NearbyResultSeparator() {
  return <View style={{ height: NEARBY_LAYOUT.cardGap }} />;
}

function deriveVisualQaResults(
  fixtures: readonly NearbyVisualQaFixture[],
  locale: MobileLocale,
  copy: NearbyCopy,
): NearbyResult[] {
  return fixtures.map((fixture) => ({
    artwork: fixture.artwork,
    badge: fixture.badge,
    business: {
      category: fixture.category,
      distance: fixture.distance,
      id: fixture.id,
      name: fixture.name,
      price: copy.priceUnavailable,
      rating: fixture.rating.toFixed(1),
      reviewCount: `${fixture.reviewCount} ${labels[locale].marketplaceReviews}`,
      slug: fixture.id,
      status: fixture.status,
      tag: fixture.badge,
    },
    category: fixture.category,
    distanceKm: fixture.distanceKm,
    imageUrl: null,
    latitude: null,
    longitude: null,
    matchingServiceName: fixture.status,
    previewBusinessId: fixture.id,
    rating: fixture.rating,
    reviewCount: fixture.reviewCount,
    source: "visual-qa-fixture",
  }));
}

function deriveNearbyResults(
  state: NearbyMarketplaceState,
  locale: MobileLocale,
  copy: NearbyCopy,
) {
  if (state.status !== "loaded" || state.businesses.length === 0) return [];

  const sourceOrder = new Map(
    state.businesses.map((business, index) => [business.id, index]),
  );

  return [...state.businesses]
    .sort((left, right) => {
      const leftDistance = getValidDistance(left.distanceKm);
      const rightDistance = getValidDistance(right.distanceKm);

      if (leftDistance === null && rightDistance !== null) return 1;
      if (leftDistance !== null && rightDistance === null) return -1;
      if (
        leftDistance !== null &&
        rightDistance !== null &&
        leftDistance !== rightDistance
      ) {
        return leftDistance - rightDistance;
      }

      return (
        (sourceOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (sourceOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .map((business) => mapNearbyResult(business, locale, copy));
}

function mapNearbyResult(
  source: MobileMarketplaceBusiness,
  locale: MobileLocale,
  copy: NearbyCopy,
): NearbyResult {
  const category =
    source.categoryName?.trim() || localizeVertical(source.vertical, locale);
  const matchingServiceName = source.matchingServiceName?.trim() || null;
  const distanceKm = getValidDistance(source.distanceKm);
  const distance =
    distanceKm === null
      ? copy.distanceUnavailable
      : formatDistance(distanceKm, locale);
  const rating = getValidRating(source.averageRating);
  const reviewCount = Math.max(0, source.reviewCount);
  const serviceLabel =
    source.serviceCount > 0
      ? `${source.serviceCount} ${labels[locale].marketplaceServices}`
      : null;
  const price =
    source.startingPrice?.trim() ||
    source.matchingServicePrice?.trim() ||
    copy.priceUnavailable;
  const status = matchingServiceName ?? serviceLabel ?? category;

  return {
    artwork: "default",
    badge: serviceLabel,
    business: {
      category,
      distance,
      id: source.id,
      name: source.name,
      price,
      rating: rating === null ? "—" : rating.toFixed(1),
      reviewCount: `${reviewCount} ${labels[locale].marketplaceReviews}`,
      slug: source.slug,
      status,
      tag: serviceLabel ?? category,
    },
    category,
    distanceKm,
    imageUrl: getRemoteImageUrl(source.coverImageUrl ?? source.logoUrl),
    latitude: getValidLatitude(source.branch.latitude),
    longitude: getValidLongitude(source.branch.longitude),
    matchingServiceName,
    previewBusinessId: null,
    rating,
    reviewCount,
    source: "api",
  };
}

type LocatedNearbyResult = NearbyResult & {
  latitude: number;
  longitude: number;
};

function hasGeographicCoordinates(
  result: NearbyResult,
): result is LocatedNearbyResult {
  return result.latitude !== null && result.longitude !== null;
}

function projectBusinessMarkers(
  results: NearbyResult[],
  mapWidth: number,
  mapHeight: number,
): ProjectedMarker[] {
  const located = results.filter(hasGeographicCoordinates);

  if (located.length === 0) return [];

  const latitudes = located.map((result) => result.latitude);
  const longitudes = located.map((result) => result.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeSpan = maxLatitude - minLatitude;
  const longitudeSpan = maxLongitude - minLongitude;
  const horizontalInset = NEARBY_LAYOUT.mapHorizontalInset;
  const verticalInset = 22;
  const drawableWidth = Math.max(1, mapWidth - horizontalInset * 2 - 28);
  const drawableHeight = Math.max(1, mapHeight - verticalInset * 2 - 34);

  return located.map((result) => {
    const { latitude, longitude } = result;
    const horizontalRatio =
      longitudeSpan === 0 ? 0.5 : (longitude - minLongitude) / longitudeSpan;
    const verticalRatio =
      latitudeSpan === 0 ? 0.5 : 1 - (latitude - minLatitude) / latitudeSpan;

    return {
      businessName: result.business.name,
      id: result.business.id,
      left: horizontalInset + horizontalRatio * drawableWidth,
      top: verticalInset + verticalRatio * drawableHeight,
    };
  });
}

function projectVisualQaMarkers(
  fixtures: readonly NearbyVisualQaFixture[],
  mapWidth: number,
  mapHeight: number,
): ProjectedMarker[] {
  return fixtures.map((fixture) => ({
    businessName: fixture.name,
    id: fixture.id,
    ...projectVisualQaPosition(
      fixture.markerPosition,
      mapWidth,
      mapHeight,
      34,
    ),
  }));
}

function projectVisualQaPosition(
  position: NearbyVisualQaUserPosition,
  mapWidth: number,
  mapHeight: number,
  markerSize: number,
): ProjectedPosition {
  const horizontalInset = 18;
  const verticalInset = 14;
  const drawableWidth = Math.max(
    1,
    mapWidth - horizontalInset * 2 - markerSize,
  );
  const drawableHeight = Math.max(
    1,
    mapHeight - verticalInset * 2 - markerSize,
  );

  return {
    left: horizontalInset + clamp(position.x, 0, 1) * drawableWidth,
    top: verticalInset + clamp(position.y, 0, 1) * drawableHeight,
  };
}

function getValidDistance(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function getValidRating(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 5
    ? value
    : null;
}

function getValidLatitude(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= -90 && value <= 90
    ? value
    : null;
}

function getValidLongitude(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= -180 && value <= 180
    ? value
    : null;
}

function getRemoteImageUrl(value: string | null) {
  const normalized = value?.trim();

  return normalized && /^https?:\/\//i.test(normalized) ? normalized : null;
}

function formatDistance(distanceKm: number, locale: MobileLocale) {
  const value = new Intl.NumberFormat(locale === "en" ? "en" : "ar-IQ", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(distanceKm);

  return locale === "en" ? `${value} km` : `${value} كم`;
}

function localizeVertical(
  vertical: MobileBusinessVertical,
  locale: MobileLocale,
) {
  const localized: Record<MobileLocale, Record<MobileBusinessVertical, string>> = {
    ar: {
      BARBER: "حلاقة",
      BEAUTY: "تجميل",
      CAFE: "مقهى",
      CLINIC: "عيادة",
      CONSULTANT: "استشارات",
      DENTIST: "طب أسنان",
      GYM: "رياضة",
      OTHER: "خدمات",
      RESTAURANT: "مطعم",
      SPA: "سبا",
    },
    ckb: {
      BARBER: "سەرتاشی",
      BEAUTY: "جوانکاری",
      CAFE: "قاوەخانە",
      CLINIC: "کلینیک",
      CONSULTANT: "ڕاوێژکاری",
      DENTIST: "ددانسازی",
      GYM: "وەرزش",
      OTHER: "خزمەتگوزاری",
      RESTAURANT: "چێشتخانە",
      SPA: "سپا",
    },
    en: {
      BARBER: "Barber",
      BEAUTY: "Beauty",
      CAFE: "Cafe",
      CLINIC: "Clinic",
      CONSULTANT: "Consulting",
      DENTIST: "Dentist",
      GYM: "Fitness",
      OTHER: "Services",
      RESTAURANT: "Restaurant",
      SPA: "Spa",
    },
  };

  return localized[locale][vertical];
}

function buildBusinessAccessibilityLabel(result: NearbyResult) {
  const parts = [result.business.name, result.category];

  if (result.rating !== null) {
    parts.push(`${result.rating.toFixed(1)}, ${result.reviewCount}`);
  }

  if (result.distanceKm !== null) parts.push(result.business.distance);

  return parts.join(", ");
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

const createStyles = (theme: MobileTheme) => {
  const gold = theme.isDark ? theme.colors.gold : "#e9ae3e";

  return StyleSheet.create({
    businessMarker: {
      height: 38,
      position: "absolute",
      width: 32,
    },
    businessMarkerGlow: {
      backgroundColor: "rgba(233, 174, 62, 0.13)",
      borderRadius: 21,
      height: 42,
      left: -5,
      position: "absolute",
      top: -4,
      width: 42,
    },
    businessMarkerIcon: {
      height: 32,
      tintColor: gold,
      width: 28,
    },
    businessMarkerPin: {
      alignItems: "center",
      height: 36,
      justifyContent: "center",
      width: 30,
    },
    distanceIcon: {
      height: 12,
      tintColor: "#a7adb0",
      width: 12,
    },
    distanceRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 3,
      maxWidth: 64,
    },
    distanceText: {
      color: "#9ba0a4",
      flexShrink: 1,
      fontFamily: NEARBY_FONT.uiRegular,
      fontSize: 11.5,
      lineHeight: 16,
      writingDirection: "ltr",
    },
    favoriteButton: {
      alignItems: "center",
      borderColor: "rgba(243, 235, 221, 0.3)",
      borderRadius: 22,
      borderWidth: 1,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    favoriteIcon: {
      height: 19,
      tintColor: "#f3ebdd",
      width: 19,
    },
    filterChip: {
      alignItems: "center",
      backgroundColor: "#111619",
      borderColor: "rgba(233, 174, 62, 0.22)",
      borderRadius: 24,
      borderWidth: 1,
      flexBasis: 0,
      justifyContent: "center",
      minWidth: 0,
      paddingHorizontal: 7,
    },
    filterChipActive: {
      backgroundColor: gold,
      borderColor: "rgba(255, 224, 151, 0.72)",
    },
    filterChipText: {
      color: "#f3ebdd",
      fontFamily: NEARBY_FONT.uiMedium,
      fontSize: 13.5,
      includeFontPadding: false,
      lineHeight: 19,
      textAlign: "center",
      width: "100%",
    },
    filterChipLtrText: {
      writingDirection: "ltr",
    },
    filterChipRtlText: {
      writingDirection: "rtl",
    },
    filterChipTextActive: {
      color: "#191204",
    },
    filterRow: {
      direction: "ltr",
      flexDirection: "row",
      width: "100%",
    },
    imageBadge: {
      backgroundColor: "rgba(5, 9, 11, 0.82)",
      borderColor: "rgba(233, 174, 62, 0.55)",
      borderRadius: 12,
      borderWidth: 1,
      bottom: 6,
      maxWidth: "82%",
      paddingHorizontal: 7,
      paddingVertical: 3,
      position: "absolute",
      right: 6,
    },
    imageBadgeText: {
      color: "#f1bd54",
      fontFamily: NEARBY_FONT.uiMedium,
      fontSize: 10.5,
      lineHeight: 14,
      textAlign: "center",
    },
    listGlyphDot: {
      backgroundColor: "#c3bcae",
      borderRadius: 2,
      height: 3,
      width: 3,
    },
    listGlyphLine: {
      backgroundColor: "#c3bcae",
      borderRadius: 2,
      height: 2,
      width: 15,
    },
    listGlyphRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
    },
    listViewButton: {
      alignItems: "center",
      backgroundColor: "#101518",
      borderColor: "rgba(233, 174, 62, 0.14)",
      borderRadius: 12,
      gap: 3,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    ltrText: {
      textAlign: "left",
      writingDirection: "ltr",
    },
    map: {
      backgroundColor: "#090d10",
      overflow: "hidden",
      position: "relative",
      width: "100%",
    },
    mapBlock: {
      backgroundColor: "rgba(27, 32, 35, 0.64)",
      borderColor: "rgba(87, 91, 94, 0.13)",
      borderRadius: 10,
      borderWidth: 1,
      position: "absolute",
    },
    mapBlockOne: {
      height: 72,
      left: "7%",
      top: "16%",
      width: "26%",
    },
    mapBlockThree: {
      bottom: "12%",
      height: 58,
      right: "6%",
      width: "28%",
    },
    mapBlockTwo: {
      height: 82,
      right: "18%",
      top: "10%",
      width: "22%",
    },
    mapRoad: {
      backgroundColor: "rgba(70, 76, 80, 0.28)",
      borderRadius: 999,
      height: 4,
      left: "-12%",
      position: "absolute",
      width: "126%",
    },
    mapRoadFive: {
      bottom: "7%",
      transform: [{ rotate: "-18deg" }],
    },
    mapRoadFour: {
      bottom: "27%",
      transform: [{ rotate: "17deg" }],
    },
    mapRoadOne: {
      top: "11%",
      transform: [{ rotate: "-27deg" }],
    },
    mapRoadThree: {
      top: "49%",
      transform: [{ rotate: "-8deg" }],
    },
    mapRoadTwo: {
      top: "31%",
      transform: [{ rotate: "23deg" }],
    },
    mapStreet: {
      backgroundColor: "rgba(53, 59, 63, 0.22)",
      borderRadius: 999,
      height: 2,
      position: "absolute",
      width: "78%",
    },
    mapStreetOne: {
      left: "-12%",
      top: "63%",
      transform: [{ rotate: "67deg" }],
    },
    mapStreetThree: {
      right: "-20%",
      top: "52%",
      transform: [{ rotate: "-72deg" }],
    },
    mapStreetTwo: {
      left: "18%",
      top: "42%",
      transform: [{ rotate: "78deg" }],
    },
    naturalLtrText: {
      textAlign: "right",
      writingDirection: "ltr",
    },
    previewUserMarker: {
      alignItems: "center",
      height: 46,
      justifyContent: "center",
      position: "absolute",
      width: 46,
    },
    previewOpenStatus: {
      color: "#49c98a",
    },
    previewModalSafeArea: {
      backgroundColor: "#05090b",
      flex: 1,
    },
    previewUserMarkerCore: {
      alignItems: "center",
      backgroundColor: "#4ba4ef",
      borderColor: "rgba(166, 215, 255, 0.78)",
      borderRadius: 16,
      borderWidth: 2,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    previewUserMarkerDot: {
      backgroundColor: "#10243a",
      borderRadius: 5,
      height: 10,
      width: 10,
    },
    previewUserMarkerPulse: {
      backgroundColor: "rgba(39, 119, 207, 0.2)",
      borderRadius: 23,
      height: 46,
      position: "absolute",
      width: 46,
    },
    ratingIcon: {
      height: 13,
      tintColor: gold,
      width: 13,
    },
    ratingRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
      marginTop: 7,
    },
    ratingValue: {
      color: "#f3ebdd",
      fontFamily: NEARBY_FONT.uiMedium,
      fontSize: 12.5,
      lineHeight: 17,
      writingDirection: "ltr",
    },
    resultActions: {
      alignItems: "flex-start",
      alignSelf: "stretch",
      justifyContent: "space-between",
      paddingVertical: 9,
      width: 54,
    },
    resultCard: {
      alignItems: "center",
      backgroundColor: "#101518",
      borderColor: "rgba(233, 174, 62, 0.17)",
      borderRadius: 18,
      borderWidth: 1,
      direction: "ltr",
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 9,
      shadowColor: "#000000",
      shadowOffset: { height: 5, width: 0 },
      shadowOpacity: 0.22,
      shadowRadius: 9,
    },
    resultCardPressed: {
      opacity: 0.84,
    },
    resultCategory: {
      color: "#9ba0a4",
      fontFamily: NEARBY_FONT.uiRegular,
      fontSize: 12.5,
      lineHeight: 18,
      marginTop: 4,
    },
    resultCopy: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 10,
    },
    resultImage: {
      height: "100%",
      width: "100%",
    },
    resultMedia: {
      backgroundColor: "#0a100f",
      borderColor: "rgba(233, 174, 62, 0.14)",
      borderRadius: 14,
      borderWidth: 1,
      flexShrink: 0,
      overflow: "hidden",
      position: "relative",
    },
    resultName: {
      color: gold,
      fontFamily: NEARBY_FONT.uiSemiBold,
      fontSize: 16,
      lineHeight: 21,
      minHeight: 21,
    },
    resultService: {
      color: "#b5aca0",
      fontFamily: NEARBY_FONT.uiRegular,
      fontSize: 11.5,
      lineHeight: 17,
      marginTop: 3,
    },
    resultsHeader: {
      alignItems: "center",
      direction: "ltr",
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 52,
    },
    resultsList: {
      flex: 1,
      minHeight: 0,
    },
    resultsListContent: {
      paddingBottom: 18,
      paddingTop: 4,
    },
    resultsListContentEmpty: {
      flexGrow: 1,
    },
    resultsSheet: {
      backgroundColor: "#0d1215",
      borderColor: "rgba(233, 174, 62, 0.18)",
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      borderTopWidth: 1,
      flex: 1,
      minHeight: 0,
      paddingTop: 8,
      shadowColor: "#000000",
      shadowOffset: { height: -8, width: 0 },
      shadowOpacity: 0.38,
      shadowRadius: 18,
      width: "100%",
      zIndex: 4,
    },
    resultsSparkle: {
      height: 14,
      position: "relative",
      transform: [{ rotate: "45deg" }],
      width: 14,
    },
    resultsSparkleHorizontal: {
      backgroundColor: gold,
      borderRadius: 1,
      height: 2,
      left: 1,
      position: "absolute",
      top: 6,
      width: 12,
    },
    resultsSparkleVertical: {
      backgroundColor: gold,
      borderRadius: 1,
      height: 12,
      left: 6,
      position: "absolute",
      top: 1,
      width: 2,
    },
    resultsTitle: {
      color: "#f3ebdd",
      flex: 1,
      fontFamily: NEARBY_FONT.kufiBold,
      minWidth: 0,
    },
    resultsTitleWrap: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row-reverse",
      gap: 6,
      justifyContent: "flex-start",
      minWidth: 0,
    },
    retryButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      borderColor: gold,
      borderRadius: 11,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 38,
      minWidth: 104,
      paddingHorizontal: 14,
    },
    retryButtonPressed: {
      opacity: 0.72,
    },
    retryButtonText: {
      color: gold,
      fontFamily: NEARBY_FONT.uiSemiBold,
      fontSize: 12.5,
      lineHeight: 18,
    },
    reviewCount: {
      color: "#9ba0a4",
      fontFamily: NEARBY_FONT.uiRegular,
      fontSize: 11.5,
      lineHeight: 16,
      writingDirection: "ltr",
    },
    rtlText: {
      textAlign: "right",
      writingDirection: "rtl",
    },
    screen: {
      backgroundColor: "#05090b",
      flex: 1,
      minHeight: 0,
      width: "100%",
    },
    searchField: {
      alignItems: "center",
      backgroundColor: "#0b1013",
      borderColor: "rgba(233, 174, 62, 0.18)",
      borderRadius: 30,
      borderWidth: 1,
      direction: "ltr",
      flexDirection: "row",
      gap: 10,
      paddingLeft: 14,
      paddingRight: 5,
    },
    searchFilterButton: {
      alignItems: "center",
      backgroundColor: gold,
      borderColor: "rgba(255, 229, 166, 0.68)",
      borderRadius: 25,
      borderWidth: 1,
      justifyContent: "center",
    },
    searchFilterIcon: {
      height: 20,
      tintColor: "#171207",
      width: 20,
    },
    searchIcon: {
      height: 21,
      tintColor: gold,
      width: 21,
    },
    searchPlaceholder: {
      color: "#9ba0a4",
      flex: 1,
      fontFamily: NEARBY_FONT.uiRegular,
      fontSize: 15.5,
      lineHeight: 22,
      minWidth: 0,
    },
    sheetHandle: {
      alignSelf: "center",
      backgroundColor: "rgba(155, 160, 164, 0.58)",
      borderRadius: 3,
      height: 4,
      width: 44,
    },
    skeletonActions: {
      alignItems: "flex-start",
      alignSelf: "stretch",
      justifyContent: "space-between",
      paddingVertical: 10,
      width: 54,
    },
    skeletonCircle: {
      backgroundColor: "rgba(155, 160, 164, 0.11)",
      borderRadius: 18,
      height: 36,
      width: 36,
    },
    skeletonCopy: {
      flex: 1,
      gap: 10,
      justifyContent: "center",
      minWidth: 0,
    },
    skeletonLineMedium: {
      backgroundColor: "rgba(155, 160, 164, 0.1)",
      borderRadius: 5,
      height: 10,
      width: "70%",
    },
    skeletonLineShort: {
      backgroundColor: "rgba(155, 160, 164, 0.1)",
      borderRadius: 5,
      height: 10,
      width: "44%",
    },
    skeletonLineTitle: {
      backgroundColor: "rgba(233, 174, 62, 0.1)",
      borderRadius: 6,
      height: 15,
      width: "82%",
    },
    skeletonMedia: {
      backgroundColor: "rgba(155, 160, 164, 0.08)",
      borderRadius: 14,
      width: "34%",
    },
    skeletonStack: {
      gap: NEARBY_LAYOUT.cardGap,
      paddingBottom: 18,
    },
    stateBody: {
      color: "#9ba0a4",
      fontFamily: NEARBY_FONT.uiRegular,
      fontSize: 12.5,
      lineHeight: 19,
    },
    stateCard: {
      alignSelf: "stretch",
      backgroundColor: "#101518",
      borderColor: "rgba(233, 174, 62, 0.17)",
      borderRadius: 18,
      borderWidth: 1,
      gap: 9,
      justifyContent: "center",
      marginTop: 8,
      minHeight: 116,
      padding: 15,
    },
    stateTitle: {
      color: "#f3ebdd",
      fontFamily: NEARBY_FONT.uiSemiBold,
      fontSize: 15,
      lineHeight: 21,
    },
    topControls: {
      backgroundColor: "#05090b",
      gap: 12,
      paddingBottom: 12,
      paddingTop: 8,
    },
    venueArch: {
      borderColor: "rgba(233, 174, 62, 0.42)",
      borderRadius: 14,
      borderWidth: 1,
      height: 42,
      width: 28,
    },
    venueArchRow: {
      bottom: 17,
      flexDirection: "row",
      gap: 7,
      left: 8,
      position: "absolute",
    },
    venueArchSmall: {
      borderColor: "rgba(233, 174, 62, 0.28)",
      borderRadius: 11,
      borderWidth: 1,
      height: 34,
      width: 23,
    },
    venueCeiling: {
      backgroundColor: "rgba(243, 189, 84, 0.12)",
      height: 2,
      left: 8,
      position: "absolute",
      right: 8,
      top: 11,
    },
    venueCounter: {
      backgroundColor: "rgba(9, 14, 14, 0.88)",
      borderColor: "rgba(233, 174, 62, 0.22)",
      borderRadius: 3,
      borderWidth: 1,
      bottom: 9,
      height: 18,
      position: "absolute",
      right: 7,
      width: "58%",
    },
    clinicCabinet: {
      backgroundColor: "rgba(232, 220, 190, 0.16)",
      borderColor: "rgba(233, 174, 62, 0.28)",
      borderRadius: 3,
      borderWidth: 1,
      bottom: 10,
      height: 24,
      position: "absolute",
      right: 8,
      width: 36,
    },
    clinicChairBack: {
      backgroundColor: "rgba(218, 207, 184, 0.22)",
      borderColor: "rgba(243, 189, 84, 0.3)",
      borderRadius: 10,
      borderWidth: 1,
      bottom: 23,
      height: 35,
      left: 18,
      position: "absolute",
      transform: [{ rotate: "-8deg" }],
      width: 31,
    },
    clinicChairSeat: {
      backgroundColor: "rgba(218, 207, 184, 0.2)",
      borderColor: "rgba(243, 189, 84, 0.3)",
      borderRadius: 8,
      borderWidth: 1,
      bottom: 14,
      height: 17,
      left: 31,
      position: "absolute",
      width: 39,
    },
    clinicLightPanel: {
      backgroundColor: "rgba(243, 235, 221, 0.11)",
      borderColor: "rgba(243, 189, 84, 0.2)",
      borderRadius: 3,
      borderWidth: 1,
      height: 25,
      left: 9,
      position: "absolute",
      right: 9,
      top: 9,
    },
    restaurantFloor: {
      backgroundColor: "rgba(101, 64, 24, 0.22)",
      bottom: 0,
      height: 13,
      left: 0,
      position: "absolute",
      right: 0,
    },
    restaurantPendant: {
      backgroundColor: "#efb747",
      borderRadius: 4,
      height: 8,
      left: "48%",
      position: "absolute",
      top: 17,
      width: 8,
    },
    restaurantTable: {
      backgroundColor: "rgba(7, 8, 8, 0.9)",
      borderColor: "rgba(233, 174, 62, 0.34)",
      borderRadius: 4,
      borderWidth: 1,
      bottom: 14,
      height: 24,
      position: "absolute",
      width: 38,
    },
    restaurantTableLeft: {
      left: 12,
    },
    restaurantTableRight: {
      right: 10,
    },
    venueFallback: {
      backgroundColor: "#121a17",
      height: "100%",
      overflow: "hidden",
      position: "relative",
      width: "100%",
    },
    venueFallbackClinic: {
      backgroundColor: "#171a18",
    },
    venueFallbackRestaurant: {
      backgroundColor: "#1a120b",
    },
    venueFloor: {
      backgroundColor: "rgba(233, 174, 62, 0.08)",
      bottom: 0,
      height: 7,
      left: 0,
      position: "absolute",
      right: 0,
    },
    venueGlow: {
      backgroundColor: "rgba(233, 174, 62, 0.12)",
      borderRadius: 44,
      height: 86,
      position: "absolute",
      right: -22,
      top: 8,
      width: 86,
    },
    venueGlowClinic: {
      backgroundColor: "rgba(224, 213, 190, 0.1)",
      left: -24,
      right: "auto",
      top: -8,
    },
    venueGlowRestaurant: {
      backgroundColor: "rgba(226, 139, 31, 0.16)",
      right: -8,
      top: -18,
    },
  });
};
