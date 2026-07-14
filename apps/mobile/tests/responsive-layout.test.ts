import assert from "node:assert/strict";
import test from "node:test";

import {
  DISPLAY_MAX_FONT_SIZE_MULTIPLIER,
  LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER,
  createMobileResponsiveLayout,
  resolveScaledFontSize,
} from "../src/layout/responsive-metrics";
import {
  ACCOUNT_GUEST_AUTH_ACTIONS,
  ACCOUNT_ACTION_LAYOUT,
  HOME_HERO_TITLE_MAX_LINES,
  HOME_HEADER_ACTION_MODE,
  MESSAGE_PREVIEW_ROW_LAYOUT,
  getTextWritingDirection,
  homeHeaderActionLabelsAreVisible,
  resolveVisualQaInitialScreen,
} from "../src/layout/screen-contracts";

const dimensions = [
  {
    bottomInset: 48,
    height: 740,
    label: "Galaxy S8+ class",
    platform: "android" as const,
    statusBarHeight: 24,
    topInset: 24,
    width: 360,
  },
  {
    bottomInset: 48,
    height: 640,
    label: "compact Android",
    platform: "android" as const,
    statusBarHeight: 24,
    topInset: 24,
    width: 360,
  },
  {
    bottomInset: 34,
    height: 812,
    label: "narrow iPhone class",
    platform: "ios" as const,
    topInset: 47,
    width: 375,
  },
  {
    bottomInset: 34,
    height: 874,
    label: "standard iPhone class",
    platform: "ios" as const,
    topInset: 59,
    width: 402,
  },
  {
    bottomInset: 24,
    height: 915,
    label: "large Android",
    platform: "android" as const,
    statusBarHeight: 24,
    topInset: 24,
    width: 412,
  },
];

test("detects compact-height and narrow-width device classes", () => {
  const galaxy = createMobileResponsiveLayout(dimensions[0]);
  const compactAndroid = createMobileResponsiveLayout(dimensions[1]);
  const narrowIphone = createMobileResponsiveLayout(dimensions[2]);

  assert.equal(galaxy.isCompactHeight, true);
  assert.equal(galaxy.isNarrowWidth, true);
  assert.equal(compactAndroid.isCompactHeight, true);
  assert.equal(narrowIphone.isNarrowWidth, false);
});

test("keeps system insets and navigation clearance in bottom padding", () => {
  const layout = createMobileResponsiveLayout(dimensions[0]);

  assert.equal(layout.topInset, 24);
  assert.equal(layout.bottomInset, 48);
  assert.equal(
    layout.contentBottomInset,
      layout.bottomNavigationHeight +
      layout.bottomNavigationBottomGap +
      layout.bottomInset +
      layout.contentTrailingSpace,
  );
  assert.ok(layout.contentTrailingSpace >= 16);
  assert.ok(layout.contentTrailingSpace <= 24);
});

test("produces readable, tappable metrics across the QA dimension matrix", () => {
  for (const target of dimensions) {
    const layout = createMobileResponsiveLayout(target);

    assert.ok(layout.usableHeight > 0, target.label);
    assert.ok(layout.pagePadding >= 14, target.label);
    assert.ok(layout.bodySize >= 14, target.label);
    assert.ok(layout.touchTarget >= 44, target.label);
    assert.ok(layout.bottomNavigationHeight >= 58, target.label);
    assert.ok(layout.bottomNavigationHeight <= 64, target.label);
    assert.ok(layout.bottomNavigationIconSize >= 21, target.label);
    assert.ok(layout.bottomNavigationIconSize <= 24, target.label);
    assert.ok(layout.centerNavigationActionSize >= 54, target.label);
    assert.ok(layout.centerNavigationActionSize <= 60, target.label);
    assert.ok(layout.categoryTileHeight >= 78, target.label);
    assert.ok(layout.categoryTileHeight <= 92, target.label);
    assert.ok(layout.promoHeight >= 108, target.label);
    assert.ok(layout.promoHeight <= 120, target.label);
  }
});

test("keeps the compact typography hierarchy inside the physical QA limits", () => {
  const layout = createMobileResponsiveLayout(dimensions[0]);

  assert.ok(layout.typography.heroTitle <= 26);
  assert.ok(layout.typography.pageTitle >= 22);
  assert.ok(layout.typography.pageTitle <= 24);
  assert.ok(layout.typography.sectionTitle >= 18);
  assert.ok(layout.typography.sectionTitle <= 21);
  assert.ok(layout.typography.cardTitle >= 16);
  assert.ok(layout.typography.cardTitle <= 18);
  assert.ok(layout.typography.body >= 14);
  assert.ok(layout.typography.body <= 16);
  assert.ok(layout.typography.secondary >= 12);
  assert.ok(layout.typography.secondary <= 14);
  assert.ok(layout.typography.metadata >= 11);
  assert.ok(layout.typography.metadata <= 13);
  assert.ok(layout.typography.button >= 15);
  assert.ok(layout.typography.button <= 16);
  assert.ok(layout.typography.navigationLabel >= 10);
  assert.ok(layout.typography.navigationLabel <= 12);
});

test("bounds layout-critical text at Android font scales 1.0, 1.15, and 1.3", () => {
  const scales = [1, 1.15, 1.3];

  assert.deepEqual(
    scales.map((fontScale) => resolveScaledFontSize(20, fontScale)),
    [20, 23, 23],
  );
  assert.deepEqual(
    scales.map((fontScale) =>
      resolveScaledFontSize(
        24,
        fontScale,
        DISPLAY_MAX_FONT_SIZE_MULTIPLIER,
      ),
    ),
    [24, 26.4, 26.4],
  );
  assert.equal(LAYOUT_CRITICAL_MAX_FONT_SIZE_MULTIPLIER, 1.15);
});

test("keeps both guest Account auth actions with a primary sign-in", () => {
  assert.deepEqual(ACCOUNT_GUEST_AUTH_ACTIONS, ["signin", "signup"]);
  assert.equal(ACCOUNT_GUEST_AUTH_ACTIONS[0], "signin");
  assert.equal(ACCOUNT_ACTION_LAYOUT.direction, "column");
  assert.equal(ACCOUNT_ACTION_LAYOUT.buttonWidth, "100%");
  assert.ok(ACCOUNT_ACTION_LAYOUT.buttonMinHeight >= 50);
  assert.ok(ACCOUNT_ACTION_LAYOUT.buttonMinHeight <= 54);
  assert.equal(ACCOUNT_ACTION_LAYOUT.gap, 12);
});

test("uses icon-only Home header actions", () => {
  assert.equal(HOME_HEADER_ACTION_MODE, "icon-only");
  assert.equal(homeHeaderActionLabelsAreVisible(HOME_HEADER_ACTION_MODE), false);
});

test("keeps Home hero copy to two lines and preserves mixed-script direction", () => {
  assert.equal(HOME_HERO_TITLE_MAX_LINES, 2);
  assert.equal(getTextWritingDirection("Noura Beauty Lounge"), "ltr");
  assert.equal(getTextWritingDirection("مركز الجمال"), "rtl");
});

test("keeps message previews in deterministic flex rows", () => {
  assert.equal(MESSAGE_PREVIEW_ROW_LAYOUT.usesAbsolutePositioning, false);
  assert.equal(MESSAGE_PREVIEW_ROW_LAYOUT.metaColumnWidth, 48);
});

test("keeps visual QA screen selection development-only and deterministic", () => {
  assert.equal(resolveVisualQaInitialScreen("checkout", true), "checkout");
  assert.equal(resolveVisualQaInitialScreen("messages", true), "messages");
  assert.equal(resolveVisualQaInitialScreen("unknown", true), null);
  assert.equal(resolveVisualQaInitialScreen("checkout", false), null);
});
