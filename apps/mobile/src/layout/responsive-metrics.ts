export type MobileLayoutPlatform =
  | "android"
  | "ios"
  | "macos"
  | "web"
  | "windows";

export type MobileLayoutInput = {
  bottomInset: number;
  height: number;
  platform: MobileLayoutPlatform;
  statusBarHeight?: number;
  topInset: number;
  width: number;
};

export type MobileResponsiveLayout = {
  bodySize: number;
  borderRadius: number;
  bottomInset: number;
  bottomNavigationBottomGap: number;
  bottomNavigationHeight: number;
  cardPadding: number;
  categoryTileHeight: number;
  contentBottomInset: number;
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
  usableHeight: number;
  verticalSpacing: number;
  width: number;
};

const clampInset = (value: number) => Math.max(0, Math.round(value));

export function createMobileResponsiveLayout({
  bottomInset,
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
  const bottomNavigationHeight = isCompactHeight ? 64 : 72;
  const bottomNavigationBottomGap = isCompactHeight ? 4 : 8;

  return {
    bodySize: isCompactHeight ? 14 : 15,
    borderRadius: isCompactHeight ? 22 : 28,
    bottomInset: safeBottomInset,
    bottomNavigationBottomGap,
    bottomNavigationHeight,
    cardPadding: isCompactHeight ? 16 : isLargeWidth ? 22 : 20,
    categoryTileHeight: isCompactHeight ? 68 : 76,
    contentBottomInset:
      bottomNavigationHeight +
      bottomNavigationBottomGap +
      safeBottomInset +
      (isCompactHeight ? 12 : 16),
    headerHeight: isCompactHeight ? 56 : 64,
    height: Math.round(height),
    iconSize: isCompactHeight ? 22 : 24,
    isCompactHeight,
    isLargeWidth,
    isNarrowWidth,
    pagePadding: isNarrowWidth ? 14 : isLargeWidth ? 22 : 18,
    promoHeight: isCompactHeight ? 124 : 145,
    screenTopPadding: isCompactHeight ? 10 : 18,
    sectionGap: isCompactHeight ? 12 : 18,
    titleSize: isCompactHeight ? 24 : isLargeWidth ? 30 : 28,
    topInset: safeTopInset,
    touchTarget: 44,
    usableHeight,
    verticalSpacing: isCompactHeight ? 10 : 14,
    width: Math.round(width),
  };
}
