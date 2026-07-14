import assert from "node:assert/strict";
import test from "node:test";

import { createMobileResponsiveLayout } from "../src/layout/responsive-metrics";
import {
  ACCOUNT_GUEST_AUTH_ACTIONS,
  HOME_HEADER_ACTION_MODE,
  homeHeaderActionLabelsAreVisible,
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
      12,
  );
});

test("produces readable, tappable metrics across the QA dimension matrix", () => {
  for (const target of dimensions) {
    const layout = createMobileResponsiveLayout(target);

    assert.ok(layout.usableHeight > 0, target.label);
    assert.ok(layout.pagePadding >= 14, target.label);
    assert.ok(layout.bodySize >= 14, target.label);
    assert.ok(layout.touchTarget >= 44, target.label);
    assert.ok(layout.bottomNavigationHeight >= 64, target.label);
  }
});

test("keeps both guest Account auth actions with a primary sign-in", () => {
  assert.deepEqual(ACCOUNT_GUEST_AUTH_ACTIONS, ["signin", "signup"]);
  assert.equal(ACCOUNT_GUEST_AUTH_ACTIONS[0], "signin");
});

test("uses icon-only Home header actions", () => {
  assert.equal(HOME_HEADER_ACTION_MODE, "icon-only");
  assert.equal(homeHeaderActionLabelsAreVisible(HOME_HEADER_ACTION_MODE), false);
});
