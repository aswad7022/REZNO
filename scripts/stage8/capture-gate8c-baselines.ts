import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright-core";

import { prisma } from "../../lib/db/prisma";
import {
  inspectPng,
  type Gate8cCaptureEvidence,
  type Gate8cExpectedState,
  type Gate8cForbiddenSelectorContract,
  type Gate8cLocale,
  type Gate8cSelectorContract,
  type Gate8cTheme,
} from "./gate8c-visual-evidence";
import {
  cleanupGate8cVisualFixture,
  prepareGate8cVisualFixture,
} from "./gate8c-visual-fixture";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const baselineDirectory = path.join(
  repoRoot,
  "docs/stage8/baselines/gate8c",
);
const manifestPath = path.join(
  repoRoot,
  "docs/stage8/baselines/gate8c-baselines.json",
);
const baseUrl = process.env.GATE8C_VISUAL_BASE_URL ?? "";
assert.ok(baseUrl, "GATE8C_VISUAL_BASE_URL is required.");
const parsedBaseUrl = new URL(baseUrl);
assert.ok(
  parsedBaseUrl.hostname === "127.0.0.1" ||
    parsedBaseUrl.hostname === "localhost",
  "Gate 8C visual capture only runs against a local server.",
);

const finalForbidden: Gate8cForbiddenSelectorContract[] = [
  {
    selector: '[aria-busy="true"]',
    description: "loading state on a final capture",
  },
  {
    selector: '[data-slot="skeleton"]',
    description: "skeleton on a final capture",
  },
  {
    selector: "nextjs-portal",
    description: "Next.js development overlay",
  },
  {
    selector: "[data-nextjs-dialog-overlay]",
    description: "Next.js error overlay",
  },
  {
    selector: "[data-next-badge-root]",
    description: "Next.js development badge",
  },
];

interface CaptureSpec {
  file: string;
  route: string | ((fixture: FixtureResult) => string);
  locale: Gate8cLocale;
  theme: Gate8cTheme;
  role: "business-owner" | "root-super-admin" | "authenticated-non-admin";
  expectedState: Gate8cExpectedState;
  width: number;
  height: number;
  families: string[];
  requiredLandmarks: Gate8cSelectorContract[];
  forbiddenStates?: Gate8cForbiddenSelectorContract[];
  openAdminNavigation?: boolean;
  scrollTo?: string;
  loadingNavigation?: {
    from: string;
    to: string;
    linkName: string;
  };
  allowedDocumentStatuses?: number[];
  reviewNotes: string;
}

type FixtureResult = Awaited<ReturnType<typeof prepareGate8cVisualFixture>>;

const adminMain: Gate8cSelectorContract[] = [
  { selector: '[data-business-admin-surface="admin"]' },
  { selector: "main#main-content" },
  { selector: "h1" },
];
const businessMain: Gate8cSelectorContract[] = [
  { selector: '[data-business-admin-surface="business"]' },
  { selector: "main#main-content" },
  { selector: "h1" },
];

const captureSpecs: CaptureSpec[] = [
  {
    file: "admin-access-form-desktop-ar-light.png",
    route: (fixture) =>
      `/admin/access?mode=add&q=${encodeURIComponent(
        fixture.candidateEmail,
      )}&userId=${fixture.candidateUserId}#grant-admin`,
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["form", "permission"],
    requiredLandmarks: [
      ...adminMain,
      { selector: "#grant-admin" },
      { selector: 'input[name="userId"]' },
      { selector: 'input[name="permissions"]', minCount: 1 },
    ],
    scrollTo: "#grant-admin",
    reviewNotes:
      "Final Admin access grant form is visible; no loading skeleton remains.",
  },
  {
    file: "admin-businesses-filters-desktop-ar-light.png",
    route: "/admin/businesses",
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["table", "form"],
    requiredLandmarks: [
      ...adminMain,
      { selector: "form" },
      { selector: 'input[name="q"]' },
    ],
    reviewNotes:
      "Business filters and deterministic organization content use the desktop width.",
  },
  {
    file: "admin-commerce-dense-desktop-ar-light.png",
    route: "/admin/commerce",
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["commerce", "dense-data", "table"],
    requiredLandmarks: [
      ...adminMain,
      { selector: 'a[href="/admin/commerce/stores"]' },
      { selector: 'a[href="/admin/commerce/orders"]' },
    ],
    reviewNotes:
      "Commerce operational cards are complete and viewport-contained.",
  },
  {
    file: "admin-communications-empty-desktop-ar-light.png",
    route: "/admin/communications",
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "empty",
    width: 1440,
    height: 1000,
    families: ["communications"],
    requiredLandmarks: [...adminMain],
    reviewNotes:
      "Communications final empty state is visible without a skeleton.",
  },
  {
    file: "admin-not-found-error-compact-en-dark.png",
    route: "/admin/gate8c-intentional-not-found",
    locale: "en",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "error",
    width: 390,
    height: 844,
    families: ["error"],
    requiredLandmarks: [
      { selector: "main" },
      { selector: "h1" },
      { selector: "text=404" },
    ],
    allowedDocumentStatuses: [404],
    reviewNotes:
      "Production not-found error state is complete with no development overlay.",
  },
  {
    file: "admin-loading-desktop-en-dark.png",
    route: "/admin/platform-jobs",
    locale: "en",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "loading",
    width: 1280,
    height: 720,
    families: ["loading"],
    requiredLandmarks: [
      { selector: '[data-business-admin-surface="admin"]' },
      { selector: "main#main-content" },
      { selector: '[aria-busy="true"]' },
      { selector: '[data-slot="skeleton"]', minCount: 1 },
    ],
    forbiddenStates: finalForbidden.filter(
      ({ selector }) =>
        selector !== '[aria-busy="true"]' &&
        selector !== '[data-slot="skeleton"]',
    ),
    loadingNavigation: {
      from: "/admin",
      to: "/admin/platform-jobs",
      linkName: "Platform jobs",
    },
    reviewNotes:
      "Intentional loading capture shows the production loading boundary only.",
  },
  {
    file: "admin-navigation-dialog-compact-ar-dark.png",
    route: "/admin",
    locale: "ar",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "dialog-open",
    width: 390,
    height: 844,
    families: ["dialog"],
    requiredLandmarks: [
      ...adminMain,
      { selector: '[role="dialog"]' },
      { selector: 'nav[aria-label="التنقل في لوحة الإدارة"]' },
    ],
    openAdminNavigation: true,
    reviewNotes:
      "Arabic compact navigation Sheet opens from the RTL start side.",
  },
  {
    file: "admin-navigation-dialog-compact-en-dark.png",
    route: "/admin",
    locale: "en",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "dialog-open",
    width: 390,
    height: 844,
    families: ["dialog"],
    requiredLandmarks: [
      ...adminMain,
      { selector: '[role="dialog"]' },
      { selector: 'nav[aria-label="Admin dashboard navigation"]' },
    ],
    openAdminNavigation: true,
    reviewNotes:
      "English compact navigation Sheet opens from the LTR start side.",
  },
  {
    file: "admin-overview-compact-ar-dark.png",
    route: "/admin",
    locale: "ar",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "final",
    width: 390,
    height: 844,
    families: ["dense-data"],
    requiredLandmarks: [
      ...adminMain,
      { selector: 'button[aria-label="فتح قائمة الإدارة"]' },
    ],
    reviewNotes:
      "Arabic compact overview has visible landmark, title, actions, and correct RTL width.",
  },
  {
    file: "admin-overview-compact-en-dark.png",
    route: "/admin",
    locale: "en",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "final",
    width: 390,
    height: 844,
    families: ["dense-data"],
    requiredLandmarks: [
      ...adminMain,
      { selector: 'button[aria-label="Open admin menu"]' },
    ],
    reviewNotes:
      "English compact overview uses the available width with no horizontal collapse.",
  },
  {
    file: "admin-overview-desktop-ar-light.png",
    route: "/admin",
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["dense-data"],
    requiredLandmarks: [
      ...adminMain,
      { selector: 'nav[aria-label="التنقل في لوحة الإدارة"]' },
    ],
    reviewNotes: "Arabic desktop Admin overview is complete and RTL-aligned.",
  },
  {
    file: "admin-overview-desktop-en-light.png",
    route: "/admin",
    locale: "en",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["dense-data"],
    requiredLandmarks: [
      ...adminMain,
      { selector: 'nav[aria-label="Admin dashboard navigation"]' },
    ],
    reviewNotes: "English desktop Admin overview is complete and LTR-aligned.",
  },
  {
    file: "admin-permission-denied-compact-en-dark.png",
    route: "/admin",
    locale: "en",
    theme: "dark",
    role: "authenticated-non-admin",
    expectedState: "permission-denied",
    width: 390,
    height: 844,
    families: ["permission", "error"],
    requiredLandmarks: [
      { selector: "h1" },
      { selector: "text=403" },
      { selector: 'a[href="/"]' },
    ],
    allowedDocumentStatuses: [403],
    reviewNotes:
      "Authenticated non-admin sees the final localized 403 state without protected content.",
  },
  {
    file: "admin-platform-jobs-truth-desktop-ar-light.png",
    route: "/admin/platform-jobs",
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["platform", "dense-data"],
    requiredLandmarks: [...adminMain, { selector: '[role="status"]' }],
    reviewNotes:
      "Arabic Platform Jobs truth surface is final and does not claim runtime activation.",
  },
  {
    file: "business-notification-preferences-table-desktop-en-light.png",
    route: "/business/notifications",
    locale: "en",
    theme: "light",
    role: "business-owner",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["communications", "form", "table"],
    requiredLandmarks: [...businessMain, { selector: "table" }],
    scrollTo: "table",
    reviewNotes:
      "Business notification preferences table is complete, readable, and locally scrollable.",
  },
  {
    file: "admin-platform-operations-desktop-ar-light.png",
    route: "/admin/platform-operations",
    locale: "ar",
    theme: "light",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["platform"],
    requiredLandmarks: [...adminMain, { selector: '[role="status"]' }],
    reviewNotes:
      "Arabic Platform Operations explicitly displays inactive runtime truth.",
  },
  {
    file: "admin-platform-operations-desktop-en-dark.png",
    route: "/admin/platform-operations",
    locale: "en",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["platform", "dense-data"],
    requiredLandmarks: [...adminMain, { selector: '[role="status"]' }],
    reviewNotes:
      "English dark Platform Operations is final and does not infer deployment connectivity.",
  },
  {
    file: "admin-restaurants-empty-desktop-en-dark.png",
    route: "/admin/restaurants",
    locale: "en",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "empty",
    width: 1440,
    height: 1000,
    families: ["restaurant"],
    requiredLandmarks: [...adminMain, { selector: '[role="status"]' }],
    reviewNotes:
      "Restaurant administration final empty state is visible without loading artifacts.",
  },
  {
    file: "business-bookings-calendar-compact-ar-dark.png",
    route: "/business/bookings?view=upcoming",
    locale: "ar",
    theme: "dark",
    role: "business-owner",
    expectedState: "final",
    width: 390,
    height: 844,
    families: ["bookings"],
    requiredLandmarks: [
      ...businessMain,
      { selector: 'form input[name="date"]' },
      { selector: 'a[href*="/business/bookings/"]', minCount: 1 },
    ],
    scrollTo: 'a[href*="/business/bookings/"]',
    reviewNotes:
      "Compact booking card is captured at viewport root without clipping, repetition, or stitching.",
  },
  {
    file: "business-dashboard-compact-ckb-dark.png",
    route: "/business",
    locale: "ckb",
    theme: "dark",
    role: "business-owner",
    expectedState: "final",
    width: 390,
    height: 844,
    families: ["dense-data"],
    requiredLandmarks: [...businessMain],
    reviewNotes: "Kurdish compact Business dashboard uses the full RTL viewport.",
  },
  {
    file: "business-dashboard-desktop-ckb-dark.png",
    route: "/business",
    locale: "ckb",
    theme: "dark",
    role: "business-owner",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["dense-data"],
    requiredLandmarks: [...businessMain],
    reviewNotes: "Kurdish dark desktop Business dashboard is complete.",
  },
  {
    file: "business-dashboard-desktop-ckb-light.png",
    route: "/business",
    locale: "ckb",
    theme: "light",
    role: "business-owner",
    expectedState: "final",
    width: 1440,
    height: 1000,
    families: ["dense-data"],
    requiredLandmarks: [...businessMain],
    reviewNotes: "Kurdish light desktop Business dashboard is complete.",
  },
  {
    file: "business-services-form-compact-ar-dark.png",
    route: "/business/services",
    locale: "ar",
    theme: "dark",
    role: "business-owner",
    expectedState: "final",
    width: 390,
    height: 844,
    families: ["form"],
    requiredLandmarks: [
      ...businessMain,
      { selector: "form" },
      { selector: 'input[name="name"]' },
    ],
    scrollTo: 'input[name="name"]',
    reviewNotes:
      "Arabic compact service form is final, usable, and viewport-contained.",
  },
  {
    file: "business-services-form-compact-ckb-dark.png",
    route: "/business/services",
    locale: "ckb",
    theme: "dark",
    role: "business-owner",
    expectedState: "final",
    width: 390,
    height: 844,
    families: ["form"],
    requiredLandmarks: [
      ...businessMain,
      { selector: "form" },
      { selector: 'input[name="name"]' },
    ],
    scrollTo: 'input[name="name"]',
    reviewNotes:
      "Kurdish compact service form is final, usable, and viewport-contained.",
  },
];

function cookieObjects(cookieHeader: string) {
  return cookieHeader.split(";").map((part) => {
    const [name, ...value] = part.trim().split("=");
    assert.ok(name && value.length > 0);
    return {
      name,
      value: value.join("="),
      domain: parsedBaseUrl.hostname,
      path: "/",
      httpOnly: name.includes("session_token"),
      sameSite: "Lax" as const,
    };
  });
}

function roleCookie(fixture: FixtureResult, role: CaptureSpec["role"]) {
  if (role === "root-super-admin") return fixture.adminCookie;
  if (role === "business-owner") return fixture.businessCookie;
  return fixture.deniedCookie;
}

async function settlePage(page: Page, spec: CaptureSpec) {
  await page.emulateMedia({
    colorScheme: spec.theme,
    reducedMotion: "reduce",
  });
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important;scroll-behavior:auto!important}",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function openNormalPage(page: Page, spec: CaptureSpec, route: string) {
  const response = await page.goto(`${baseUrl}${route}`, {
    waitUntil: "networkidle",
  });
  const status = response?.status() ?? 0;
  assert.ok(
    status < 400 || spec.allowedDocumentStatuses?.includes(status),
    `${spec.file} returned ${status}`,
  );
}

async function openLoadingPage(
  page: Page,
  spec: CaptureSpec,
  loading: NonNullable<CaptureSpec["loadingNavigation"]>,
) {
  let releaseLock: (() => void) | undefined;
  let markLockReady: (() => void) | undefined;
  const lockReady = new Promise<void>((resolve) => {
    markLockReady = resolve;
  });
  const lockRelease = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const lockTransaction = prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      'LOCK TABLE "PlatformJob" IN ACCESS EXCLUSIVE MODE',
    );
    markLockReady?.();
    await lockRelease;
  });
  await lockReady;
  await page.goto(`${baseUrl}${loading.to}`, { waitUntil: "commit" });
  await page
    .locator('[aria-busy="true"]')
    .first()
    .waitFor({ state: "visible" });
  return async () => {
    releaseLock?.();
    await lockTransaction;
  };
}

async function collectPreflight(
  page: Page,
  spec: CaptureSpec,
  route: string,
  errors: {
    consoleErrors: string[];
    pageErrors: string[];
    failedResources: string[];
    responseErrors: string[];
  },
) {
  const requiredLandmarks = await Promise.all(
    spec.requiredLandmarks.map(async (required) => {
      const locator = page.locator(required.selector);
      const count = await locator.count();
      const text = required.textIncludes
        ? await locator.first().textContent().catch(() => "")
        : "";
      return {
        selector: required.selector,
        count,
        ...(required.textIncludes
          ? { matchedText: text?.includes(required.textIncludes) ?? false }
          : {}),
      };
    }),
  );
  const forbiddenStates = await Promise.all(
    (spec.forbiddenStates ?? finalForbidden).map(async (forbidden) => ({
      selector: forbidden.selector,
      count: await page.locator(forbidden.selector).count(),
    })),
  );
  return page.evaluate(
    ({
      route: expectedRoute,
      locale,
      direction,
      theme,
      expectedState,
      viewport,
      required,
      forbidden,
      recordedErrors,
    }) => {
      const primary = document.querySelector("main") ?? document.body;
      const primaryRect = primary.getBoundingClientRect();
      const text = document.body.innerText;
      const sensitivePatterns = [
        /postgresql:\/\/\S+/gi,
        /session_token\s*=\s*\S+/gi,
        /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
        /\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/gi,
      ];
      const sensitiveTextMatches = sensitivePatterns.flatMap(
        (pattern) => text.match(pattern) ?? [],
      );
      const emails = text.match(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      ) ?? [];
      const url = new URL(window.location.href);
      return {
        pathname: url.pathname,
        route: `${url.pathname}${url.search}${url.hash}`,
        locale: document.documentElement.lang,
        direction: document.documentElement.dir,
        theme: document.documentElement.classList.contains("dark")
          ? "dark"
          : "light",
        expectedState,
        viewport,
        documentReadyState: document.readyState,
        fontsReady: document.fonts.status === "loaded",
        requiredLandmarks: required,
        forbiddenStates: forbidden,
        horizontalOverflowPx: Math.max(
          0,
          document.documentElement.scrollWidth - window.innerWidth,
          document.body.scrollWidth - window.innerWidth,
        ),
        mainWidthRatio: Number(
          Math.min(1, primaryRect.width / window.innerWidth).toFixed(4),
        ),
        runningAnimations: document
          .getAnimations()
          .filter((animation) => animation.playState === "running").length,
        ...recordedErrors,
        sensitiveTextMatches,
        nonSyntheticEmails: emails.filter(
          (email) => !email.toLowerCase().endsWith("@rezno.invalid"),
        ),
        screenshotScope: "viewport" as const,
        expectedRoute,
        expectedLocale: locale,
        expectedDirection: direction,
        expectedTheme: theme,
      };
    },
    {
      route,
      locale: spec.locale,
      direction: spec.locale === "en" ? "ltr" : "rtl",
      theme: spec.theme,
      expectedState: spec.expectedState,
      viewport: { width: spec.width, height: spec.height },
      required: requiredLandmarks,
      forbidden: forbiddenStates,
      recordedErrors: errors,
    },
  );
}

async function captureOne(
  browserContext: BrowserContext,
  fixture: FixtureResult,
  spec: CaptureSpec,
  temporaryDirectory: string,
  browserVersion: string,
) {
  const route =
    typeof spec.route === "function" ? spec.route(fixture) : spec.route;
  const page = await browserContext.newPage();
  const errors = {
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    failedResources: [] as string[],
    responseErrors: [] as string[],
  };
  page.on("console", (message) => {
    const expectedNotFound =
      spec.allowedDocumentStatuses?.includes(404) &&
      /404 \(Not Found\)/.test(message.text());
    if (message.type() === "error" && !expectedNotFound) {
      errors.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (
      request.resourceType() === "fetch" &&
      /ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(failure)
    ) {
      return;
    }
    errors.failedResources.push(
      `${request.resourceType()}:${failure}:${new URL(request.url()).pathname}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const isExpectedDocument =
      response.request().resourceType() === "document" &&
      spec.allowedDocumentStatuses?.includes(response.status());
    if (!isExpectedDocument) {
      errors.responseErrors.push(
        `${response.status()}:${new URL(response.url()).pathname}`,
      );
    }
  });

  let releaseLoadingRequest: (() => Promise<void>) | undefined;
  if (spec.loadingNavigation) {
    releaseLoadingRequest = await openLoadingPage(
      page,
      spec,
      spec.loadingNavigation,
    );
  } else {
    await openNormalPage(page, spec, route);
  }
  await settlePage(page, spec);
  if (spec.openAdminNavigation) {
    const label =
      spec.locale === "ar"
        ? "فتح قائمة الإدارة"
        : spec.locale === "ckb"
          ? "کردنەوەی لیستی بەڕێوەبردن"
          : "Open admin menu";
    await page.getByRole("button", { name: label }).click();
    await page.locator('[role="dialog"]').waitFor({ state: "visible" });
    await settlePage(page, spec);
  }
  for (const landmark of spec.requiredLandmarks) {
    await page.locator(landmark.selector).first().waitFor({ state: "attached" });
  }
  if (spec.scrollTo) {
    await page.locator(spec.scrollTo).first().scrollIntoViewIfNeeded();
    await settlePage(page, spec);
  }

  const preflight = await collectPreflight(page, spec, route, errors);
  assert.equal(preflight.expectedRoute, route);
  assert.equal(preflight.expectedLocale, spec.locale);
  assert.equal(
    preflight.expectedDirection,
    spec.locale === "en" ? "ltr" : "rtl",
  );
  assert.equal(preflight.expectedTheme, spec.theme);
  delete (preflight as Record<string, unknown>).expectedRoute;
  delete (preflight as Record<string, unknown>).expectedLocale;
  delete (preflight as Record<string, unknown>).expectedDirection;
  delete (preflight as Record<string, unknown>).expectedTheme;

  const target = path.join(temporaryDirectory, spec.file);
  await page.screenshot({
    animations: "disabled",
    fullPage: false,
    path: target,
    type: "png",
  });
  await releaseLoadingRequest?.();
  await page.close();

  const bytes = await readFile(target);
  const inspected = await inspectPng(bytes);
  const evidence: Gate8cCaptureEvidence = {
    file: `docs/stage8/baselines/gate8c/${spec.file}`,
    route,
    viewport: spec.width < 768 ? "compact" : "desktop",
    viewportWidth: spec.width,
    viewportHeight: spec.height,
    locale: spec.locale,
    direction: spec.locale === "en" ? "ltr" : "rtl",
    theme: spec.theme,
    role: spec.role,
    expectedState: spec.expectedState,
    requiredLandmarks: spec.requiredLandmarks,
    forbiddenStates: spec.forbiddenStates ?? finalForbidden,
    expectedMime: "image/png",
    expectedFormat: "png",
    actualWidth: inspected.width,
    actualHeight: inspected.height,
    sha256: inspected.sha256,
    families: spec.families,
    visualMetrics: inspected.metrics,
    preflight: preflight as Gate8cCaptureEvidence["preflight"],
    humanReview: {
      result: "PENDING",
      reviewedAt: "",
      notes: `Pending human review: ${spec.reviewNotes}`,
    },
  };
  return { evidence, browserVersion };
}

async function prismaDisconnect() {
  await prisma.$disconnect();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "rezno-gate8c-baselines-"),
  );
  let fixture: FixtureResult | undefined;
  try {
    fixture = await prepareGate8cVisualFixture(baseUrl);
    const captures: Gate8cCaptureEvidence[] = [];
    for (const spec of captureSpecs) {
      process.stdout.write(`Capturing ${spec.file}\n`);
      const context = await browser.newContext({
        baseURL: baseUrl,
        colorScheme: spec.theme,
        locale: spec.locale === "en" ? "en-US" : "ar-IQ",
        reducedMotion: "reduce",
        viewport: { width: spec.width, height: spec.height },
      });
      await context.addCookies([
        ...cookieObjects(roleCookie(fixture, spec.role)),
        {
          name: "REZNO_LOCALE",
          value: spec.locale,
          domain: parsedBaseUrl.hostname,
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await context.addInitScript((theme) => {
        localStorage.setItem("theme", theme);
        localStorage.setItem("rezno-dashboard-sidebar-collapsed", "false");
      }, spec.theme);
      const result = await captureOne(
        context,
        fixture,
        spec,
        temporaryDirectory,
        browser.version(),
      );
      captures.push(result.evidence);
      await context.close();
    }

    await mkdir(baselineDirectory, { recursive: true });
    await rm(baselineDirectory, { recursive: true, force: true });
    await mkdir(baselineDirectory, { recursive: true });
    for (const spec of captureSpecs) {
      await rename(
        path.join(temporaryDirectory, spec.file),
        path.join(baselineDirectory, spec.file),
      );
    }
    const manifest = {
      gate: "8C",
      baseSha: "903cbf8de413145ba83f652e23f41616f79c90d3",
      capturedAt: "2026-07-27",
      environment:
        "Disposable local PostgreSQL database and authenticated local Next.js production build/server",
      capturePolicy: {
        browser: `Chromium ${browser.version()}`,
        fixtures:
          "Deterministic synthetic @rezno.invalid identities and Gate 8C data",
        motion:
          "prefers-reduced-motion plus disabled CSS animations/transitions",
        screenshotScope: "viewport-only; no full-page stitching",
        sensitiveData:
          "synthetic fixtures only; credential and non-synthetic email scan passed",
        humanReview:
          "PENDING after capture; requires separate per-image review for completeness, clipping, repetition, overlays, locale, direction, and theme",
      },
      captures,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    if (fixture) await cleanupGate8cVisualFixture();
    await prismaDisconnect();
    await browser.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

void main();
