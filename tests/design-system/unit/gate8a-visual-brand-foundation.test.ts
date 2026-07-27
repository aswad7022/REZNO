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

type Oklch = readonly [lightness: number, chroma: number, hue: number];

const extractCssBlock = (css: string, selector: string) => {
  const selectorStart = css.indexOf(`${selector} {`);
  assert.notEqual(selectorStart, -1, `missing ${selector} CSS block`);
  const blockStart = css.indexOf("{", selectorStart) + 1;
  let depth = 1;

  for (let index = blockStart; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(blockStart, index);
      }
    }
  }

  assert.fail(`unterminated ${selector} CSS block`);
};

const readOklchToken = (block: string, token: string): Oklch => {
  const match = block.match(
    new RegExp(
      `--${token}:\\s*oklch\\(\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)`,
    ),
  );
  assert.ok(match, `missing oklch token --${token}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const oklchToLinearSrgb = ([lightness, chroma, hue]: Oklch) => {
  const hueRadians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
};

const relativeLuminance = (color: Oklch) => {
  const [red, green, blue] = oklchToLinearSrgb(color);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrastRatio = (foreground: Oklch, background: Oklch) => {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
};

const mixOklch = (base: Oklch, tint: Oklch, tintAmount: number): Oklch => {
  const hueDelta = ((tint[2] - base[2] + 540) % 360) - 180;
  return [
    base[0] * (1 - tintAmount) + tint[0] * tintAmount,
    base[1] * (1 - tintAmount) + tint[1] * tintAmount,
    base[2] + hueDelta * tintAmount,
  ];
};

const hexToOklchContrastInput = (hex: string) => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  assert.equal(channels?.length, 3, `invalid RGB hex ${hex}`);
  return channels!.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
};

const hexRelativeLuminance = (hex: string) => {
  const [red, green, blue] = hexToOklchContrastInput(hex);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const hexContrastRatio = (foreground: string, background: string) => {
  const lighter = Math.max(
    hexRelativeLuminance(foreground),
    hexRelativeLuminance(background),
  );
  const darker = Math.min(
    hexRelativeLuminance(foreground),
    hexRelativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
};

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

test("Gate 8A web semantic text pairs meet WCAG AA in light and dark modes", () => {
  const css = readRepoFile("app/globals.css");

  for (const [mode, selector] of [
    ["light", ":root"],
    ["dark", ".dark"],
  ] as const) {
    const block = extractCssBlock(css, selector);
    const card = readOklchToken(block, "card");
    const background = readOklchToken(block, "background");
    const primary = readOklchToken(block, "primary");
    const primaryEmphasis = readOklchToken(block, "primary-emphasis");
    const primaryForeground = readOklchToken(block, "primary-foreground");
    const destructive = readOklchToken(block, "destructive");
    const success = readOklchToken(block, "success");
    const warning = readOklchToken(block, "warning");
    const warningText = readOklchToken(block, "warning-text");
    const info = readOklchToken(block, "info");
    const pairs: Array<[string, Oklch, Oklch]> = [
      ["primary CTA start", primaryForeground, primary],
      ["primary CTA end", primaryForeground, primaryEmphasis],
      ["primary text", primary, background],
      [
        "destructive soft status",
        destructive,
        mixOklch(card, destructive, 0.1),
      ],
      ["success soft status", success, mixOklch(card, success, 0.1)],
      ["warning soft status", warningText, mixOklch(card, warning, 0.12)],
      ["info soft status", info, mixOklch(card, info, 0.1)],
    ];

    for (const [name, foreground, surface] of pairs) {
      assert.ok(
        contrastRatio(foreground, surface) >= 4.5,
        `${mode} ${name} must meet 4.5:1`,
      );
    }
  }
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

test("Gate 8A mobile semantic text pairs meet WCAG AA in light and dark modes", () => {
  for (const [mode, theme] of [
    ["light", lightMobileTheme],
    ["dark", darkMobileTheme],
  ] as const) {
    const pairs = [
      ["foreground", theme.colors.foreground, theme.colors.background],
      ["primary action", theme.colors.foregroundInverse, theme.colors.gold],
      ["accent action", theme.colors.foregroundInverse, theme.colors.accent],
      ["primary soft", theme.colors.gold, theme.colors.goldSoft],
      ["danger soft", theme.colors.danger, theme.colors.dangerSoft],
      ["success soft", theme.colors.success, theme.colors.successSoft],
      ["warning soft", theme.colors.warning, theme.colors.warningSoft],
      ["info soft", theme.colors.info, theme.colors.infoSoft],
    ];

    for (const [name, foreground, background] of pairs) {
      assert.ok(
        hexContrastRatio(foreground, background) >= 4.5,
        `${mode} mobile ${name} must meet 4.5:1`,
      );
    }
  }
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
  const css = readRepoFile("app/globals.css");
  const button = readRepoFile("components/ui/button.tsx");
  const dashboardSidebar = readRepoFile(
    "components/dashboard/dashboard-sidebar.tsx",
  );
  const mobileApp = readRepoFile("apps/mobile/App.tsx");
  const outboundPreferences = readRepoFile(
    "features/communications/components/outbound-preferences.tsx",
  );
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
  assert.match(css, /min-block-size: var\(--control-min-size\)/);
  assert.match(css, /min-inline-size: var\(--control-min-size\)/);
  assert.match(
    css,
    /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="hidden"\]\)/,
  );
  assert.match(css, /label:has\(input\[type="checkbox"\]\)/);
  assert.match(css, /label:has\(input\[type="radio"\]\)/);
  assert.match(
    css,
    /input\[type="checkbox"\],[\s\S]*?input\[type="radio"\][\s\S]*?block-size: 1rem;[\s\S]*?inline-size: 1rem;/,
  );
  assert.match(button, /min-h-11 min-w-11/);
  assert.doesNotMatch(dashboardSidebar, /min-h-10/);
  assert.match(dashboardSidebar, /min-h-11 min-w-11/);
  assert.match(outboundPreferences, /inline-grid size-11 place-items-center/);
  assert.match(outboundPreferences, /className="size-4" type="checkbox"/);
  assert.match(
    mobileApp,
    /startupRetryButton:\s*\{[\s\S]*?minHeight:\s*44,[\s\S]*?minWidth:\s*44,/,
  );
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
