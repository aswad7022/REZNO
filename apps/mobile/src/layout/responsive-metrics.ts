export type MobileLayoutPlatform =
  | "android"
  | "ios"
  | "macos"
  | "web"
  | "windows";

export type MobileLayoutInput = {
  bottomInset: number;
  fontScale?: number;
  height: number;
  platform: MobileLayoutPlatform;
  statusBarHeight?: number;
  topInset: number;
  width: number;
};

export type MobileResponsiveTypography = {
  body: number;
  button: number;
  cardTitle: number;
  heroTitle: number;
  metadata: number;
  navigationLabel: number;
  pageTitle: number;
  secondary: number;
  sectionTitle: number;
};

export const LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER = 1.15;
export const DISPLAY_MAX_FONT_SIZE_MULTIPLIER = 1.1;

export type MobileResponsiveLayout = {
  bodySize: number;
  borderRadius: number;
  bottomInset: number;
  bottomNavigationIconSize: number;
  bottomNavigationBottomGap: number;
  bottomNavigationHeight: number;
  cardPadding: number;
  categoryTileHeight: number;
  centerNavigationActionSize: number;
  contentBottomInset: number;
  finalContentGap: number;
  contentTrailingSpace: number;
  fontScale: number;
  headerHeight: number;
  height: number;
  iconSize: number;
  isCompactHeight: boolean;
  isLargeWidth: boolean;
  isNarrowWidth: boolean;
  pagePadding: number;
  promoHeight: number;
  screenTopPadding: number;
  sectionGap: number;
  titleSize: number;
  topInset: number;
  touchTarget: number;
  typography: MobileResponsiveTypography;
  usableHeight: number;
  verticalSpacing: number;
  width: number;
};

const clampInset = (value: number) => Math.max(0, Math.round(value));

export function resolveScaledFontSize(
  baseSize: number,
  fontScale: number,
  maxMultiplier = LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER,
) {
  const safeScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  return Number((baseSize * Math.min(safeScale, maxMultiplier)).toFixed(2));
}

export function createMobileResponsiveLayout({
  bottomInset,
  fontScale = 1,
  height,
  platform,
  statusBarHeight = 0,
  topInset,
  width,
}: MobileLayoutInput): MobileResponsiveLayout {
  const safeTopInset = Math.max(
    clampInset(topInset),
    platform === "android" ? clampInset(statusBarHeight) : 0,
  );
  const safeBottomInset = clampInset(bottomInset);
  const usableHeight = Math.max(
    0,
    Math.round(height) - safeTopInset - safeBottomInset,
  );
  const isNarrowWidth = width <= 360;
  const isCompactHeight = usableHeight <= 700;
  const isLargeWidth = width >= 430;
  const bottomNavigationHeight = 64;
  const bottomNavigationBottomGap = isCompactHeight ? 4 : 6;
  const finalContentGap = isCompactHeight ? 22 : 24;
  const typography: MobileResponsiveTypography = {
    body: 15,
    button: 15,
    cardTitle: 17,
    heroTitle: isCompactHeight ? 23 : 24,
    metadata: 12,
    navigationLabel: isCompactHeight ? 10 : 11,
    pageTitle: isCompactHeight ? 23 : 24,
    secondary: 13,
    sectionTitle: isCompactHeight ? 19 : 20,
  };

  return {
    bodySize: typography.body,
    borderRadius: isCompactHeight ? 22 : 28,
    bottomInset: safeBottomInset,
    bottomNavigationIconSize: isCompactHeight ? 22 : 23,
    bottomNavigationBottomGap,
    bottomNavigationHeight,
    cardPadding: isCompactHeight ? 16 : isLargeWidth ? 22 : 20,
    categoryTileHeight: isCompactHeight ? 82 : 88,
    centerNavigationActionSize: 54,
    contentBottomInset:
      bottomNavigationHeight +
      safeBottomInset +
      finalContentGap,
    finalContentGap,
    contentTrailingSpace: finalContentGap,
    fontScale: Math.max(1, fontScale),
    headerHeight: isCompactHeight ? 56 : 64,
    height: Math.round(height),
    iconSize: isCompactHeight ? 22 : 24,
    isCompactHeight,
    isLargeWidth,
    isNarrowWidth,
    pagePadding: isNarrowWidth ? 14 : isLargeWidth ? 22 : 18,
    promoHeight: isCompactHeight ? 116 : 120,
    screenTopPadding: isCompactHeight ? 10 : 18,
    sectionGap: isCompactHeight ? 12 : 18,
    titleSize: typography.pageTitle,
    topInset: safeTopInset,
    touchTarget: 44,
    typography,
    usableHeight,
    verticalSpacing: isCompactHeight ? 10 : 14,
    width: Math.round(width),
  };
}
