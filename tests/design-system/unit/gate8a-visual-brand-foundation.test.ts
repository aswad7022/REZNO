import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { reznoBrandFoundation } from "../../../design-system/brand-foundation";
import { getLocaleDirection, locales } from "../../../i18n/config";
import {
  resolveMotionDuration,
  resolvePremiumMotion,
  resolvePressScale,
} from "../../../apps/mobile/src/theme/motion";
import {
  darkMobileTheme,
  lightMobileTheme,
} from "../../../apps/mobile/src/theme/tokens";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const readRepoFile = (relativePath: string) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

test("Gate 8A locale directions are canonical across web and mobile", () => {
  assert.deepEqual([...locales].sort(), ["ar", "ckb", "en"]);
  assert.equal(getLocaleDirection("ar"), reznoBrandFoundation.direction.ar);
  assert.equal(getLocaleDirection("ckb"), reznoBrandFoundation.direction.ckb);
  assert.equal(getLocaleDirection("en"), reznoBrandFoundation.direction.en);

  const mobileLabels = readRepoFile("apps/mobile/src/i18n/labels.ts");
  assert.match(mobileLabels, /locale === "en" \? "ltr" : "rtl"/);
});

test("Gate 8A web tokens expose semantic light, dark, status, focus, and layout roles", () => {
  const css = readRepoFile("app/globals.css");
  for (const token of [
    "--background:",
    "--foreground:",
    "--card:",
    "--primary:",
    "--success:",
    "--warning:",
    "--info:",
    "--destructive:",
    "--ring:",
    "--shadow-soft:",
    "--motion-duration-fast:",
    "--control-min-size:",
    "--content-max:",
  ]) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(css, /\.dark\s*\{/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\[aria-busy="true"\]/);
  assert.match(css, /\[aria-invalid="true"\]/);
  assert.match(css, /\[aria-disabled="true"\]/);
});

test("Gate 8A mobile themes implement the canonical semantic palette", () => {
  assert.equal(
    lightMobileTheme.colors.background,
    reznoBrandFoundation.palette.light.background,
  );
  assert.equal(
    lightMobileTheme.colors.foreground,
    reznoBrandFoundation.palette.light.foreground,
  );
  assert.equal(
    lightMobileTheme.colors.gold,
    reznoBrandFoundation.palette.light.primary,
  );
  assert.equal(
    lightMobileTheme.colors.focus,
    reznoBrandFoundation.palette.light.focus,
  );
  assert.equal(
    lightMobileTheme.colors.info,
    reznoBrandFoundation.palette.light.info,
  );
  assert.equal(
    darkMobileTheme.colors.background,
    reznoBrandFoundation.palette.dark.background,
  );
  assert.equal(
    darkMobileTheme.colors.gold,
    reznoBrandFoundation.palette.dark.primary,
  );
  assert.equal(
    darkMobileTheme.colors.focus,
    reznoBrandFoundation.palette.dark.focus,
  );
  assert.equal(
    darkMobileTheme.colors.info,
    reznoBrandFoundation.palette.dark.info,
  );
  assert.deepEqual(lightMobileTheme.spacing, reznoBrandFoundation.spacing);
  assert.deepEqual(darkMobileTheme.spacing, reznoBrandFoundation.spacing);
});

test("Gate 8A reduced motion removes spatial motion and motion delays", () => {
  assert.equal(resolveMotionDuration(220, "reduced"), 0);
  assert.equal(resolveMotionDuration(220, "full"), 220);
  assert.equal(resolvePressScale(0.97, "reduced"), 1);
  assert.equal(resolvePressScale(0.97, "full"), 0.97);

  const reduced = resolvePremiumMotion("reduced");
  assert.ok(Object.values(reduced.duration).every((duration) => duration === 0));
  assert.ok(Object.values(reduced.pressScale).every((scale) => scale === 1));

  const css = readRepoFile("app/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /scroll-behavior: auto/);
  assert.match(css, /animation-duration: 1ms !important/);

  const nativeMotion = readRepoFile(
    "apps/mobile/src/components/premium-motion.tsx",
  );
  assert.match(nativeMotion, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(nativeMotion, /resolveMotionDuration/);
});

test("Gate 8A primitives cover interactive state and minimum-target contracts", () => {
  const button = readRepoFile("components/ui/button.tsx");
  const input = readRepoFile("components/ui/input.tsx");

  for (const state of [
    "hover:",
    "active:",
    "focus-visible:",
    "disabled:",
    "aria-busy:",
    "aria-invalid:",
  ]) {
    assert.match(button, new RegExp(state.replace(":", "\\:")));
  }
  assert.match(input, /h-11/);
  assert.equal(reznoBrandFoundation.iconography.minimumTouchTarget, 44);
});

test("Gate 8A baseline manifest covers public, dashboard, auth, and mobile surfaces", () => {
  const manifest = JSON.parse(
    readRepoFile("docs/stage8/baselines/gate8a-baselines.json"),
  ) as {
    captures: Array<{ file: string; sha256: string; surface: string }>;
  };
  const surfaces = new Set(manifest.captures.map((capture) => capture.surface));

  for (const expected of ["public", "auth", "dashboard", "mobile"]) {
    assert.ok(surfaces.has(expected), `missing ${expected} baseline`);
  }
  for (const capture of manifest.captures) {
    const bytes = readFileSync(
      path.join(repoRoot, "docs/stage8/baselines", capture.file),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), capture.sha256);
  }
});

test("Gate 8A does not add a database migration", () => {
  const migrationIndex = readRepoFile(
    "docs/stage8/gate8a-visual-brand-foundation.md",
  );
  assert.match(migrationIndex, /Migration count: `51`/);
  assert.match(migrationIndex, /Migration 52: `NOT CREATED`/);
});
