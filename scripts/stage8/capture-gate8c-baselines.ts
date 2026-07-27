import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright-core";

import { prisma } from "../../lib/db/prisma";
import {
  assertGate8cCaptureContract,
  gate8cCaptureSpecs,
  gate8cFinalForbidden,
  type Gate8cCaptureSpec,
} from "./gate8c-capture-contract";
import {
  gate8cCanonicalJson,
  gate8cSha256,
  startGate8cProductionHarness,
} from "./gate8c-production-harness";
import {
  inspectPng,
  inspectGate8cVisibleTextPrivacy,
  semanticGate8cCaptureDigest,
  validateGate8cCapture,
  type Gate8cCaptureEvidence,
  type Gate8cPagePreflight,
  type Gate8cSelectorContract,
} from "./gate8c-visual-evidence";
import {
  cleanupGate8cVisualFixture,
  prepareGate8cVisualFixture,
  readGate8cVisualFixtureLocale,
  setGate8cVisualFixtureLocale,
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

type FixtureResult = Awaited<ReturnType<typeof prepareGate8cVisualFixture>>;

interface CaptureErrors {
  consoleErrors: string[];
  pageErrors: string[];
  failedResources: string[];
  responseErrors: string[];
}

interface MeasuredLocator {
  selector: string;
  count: number;
  visibleCount: number;
  inViewportCount: number;
  matchedText?: boolean;
}

function cookieObjects(baseUrl: string, cookieHeader: string) {
  const hostname = new URL(baseUrl).hostname;
  return cookieHeader.split(";").map((part) => {
    const [name, ...value] = part.trim().split("=");
    assert.ok(name && value.length > 0);
    return {
      name,
      value: value.join("="),
      domain: hostname,
      path: "/",
      httpOnly: name.includes("session_token"),
      sameSite: "Lax" as const,
    };
  });
}

function roleCookie(fixture: FixtureResult, role: Gate8cCaptureSpec["role"]) {
  if (role === "root-super-admin") return fixture.adminCookie;
  if (role === "business-owner") return fixture.businessCookie;
  if (role === "communications-viewer") {
    return fixture.communicationsViewerCookie;
  }
  return fixture.deniedCookie;
}

function browserLocale(locale: Gate8cCaptureSpec["locale"]) {
  if (locale === "ar") return "ar-IQ";
  if (locale === "ckb") return "ckb-IQ";
  return "en-US";
}

async function settlePage(page: Page, spec: Gate8cCaptureSpec) {
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

async function openNormalPage(
  page: Page,
  baseUrl: string,
  spec: Gate8cCaptureSpec,
  route: string,
) {
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
  baseUrl: string,
  spec: Gate8cCaptureSpec,
  loading: NonNullable<Gate8cCaptureSpec["loadingNavigation"]>,
) {
  await page.goto(`${baseUrl}${loading.from}`, { waitUntil: "networkidle" });
  await settlePage(page, spec);
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
  await page.getByRole("link", { name: loading.linkName }).first().click();
  await page
    .locator('[aria-busy="true"]')
    .first()
    .waitFor({ state: "visible" });
  return async () => {
    releaseLock?.();
    await lockTransaction;
  };
}

async function measureLocator(
  page: Page,
  contract: Pick<Gate8cSelectorContract, "selector" | "textIncludes">,
): Promise<MeasuredLocator> {
  const locator = contract.textIncludes
    ? page.locator(contract.selector).filter({ hasText: contract.textIncludes })
    : page.locator(contract.selector);
  const count = await locator.count();
  let visibleCount = 0;
  let inViewportCount = 0;
  for (let index = 0; index < count; index += 1) {
    const child = locator.nth(index);
    const visible = await child.isVisible().catch(() => false);
    if (!visible) continue;
    visibleCount += 1;
    const inViewport = await child
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth
        );
      })
      .catch(() => false);
    if (inViewport) inViewportCount += 1;
  }
  return {
    selector: contract.selector,
    count,
    visibleCount,
    inViewportCount,
    ...(contract.textIncludes ? { matchedText: count > 0 } : {}),
  };
}

async function waitForContract(page: Page, contract: Gate8cSelectorContract) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const measured = await measureLocator(page, contract);
    const countReady = measured.count >= (contract.minCount ?? 1);
    const visibilityReady =
      contract.requireVisible === false || measured.visibleCount >= 1;
    const viewportReady =
      !contract.requireInViewport || measured.inViewportCount >= 1;
    if (countReady && visibilityReady && viewportReady) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for visual contract: ${contract.selector}`);
}

async function collectPreflight(
  page: Page,
  spec: Gate8cCaptureSpec,
  route: string,
  errors: CaptureErrors,
  localeEvidence: Gate8cPagePreflight["localeEvidence"],
) {
  const requiredLandmarks = await Promise.all(
    spec.requiredLandmarks.map((required) =>
      measureLocator(page, required),
    ),
  );
  const forbiddenStates = await Promise.all(
    (spec.forbiddenStates ?? gate8cFinalForbidden).map(
      async (forbidden) => ({
        ...(await measureLocator(page, forbidden)),
        selector: forbidden.selector,
      }),
    ),
  );
  const requiredVisibleText = await Promise.all(
    spec.requiredVisibleText.map(async (required) => {
      const measured = await measureLocator(page, {
        selector: required.selector,
        textIncludes: required.text,
      });
      return {
        selector: required.selector,
        text: required.text,
        count: measured.count,
        visibleCount: measured.visibleCount,
        inViewportCount: measured.inViewportCount,
      };
    }),
  );
  const forbiddenVisibleText = await Promise.all(
    spec.forbiddenVisibleText.map(async (forbidden) => {
      const measured = await measureLocator(page, {
        selector: forbidden.selector,
        textIncludes: forbidden.text,
      });
      return {
        selector: forbidden.selector,
        text: forbidden.text,
        count: measured.count,
        visibleCount: measured.visibleCount,
        inViewportCount: measured.inViewportCount,
      };
    }),
  );
  const stateMarker = await measureLocator(page, spec.stateContract.marker);
  const conflictingStates = await Promise.all(
    (spec.stateContract.forbiddenInViewport ?? []).map(
      async (forbidden) => ({
        ...(await measureLocator(page, forbidden)),
        selector: forbidden.selector,
      }),
    ),
  );
  const pageState = await page.evaluate(() => {
    const primary = document.querySelector("main") ?? document.body;
    const primaryRect = primary.getBoundingClientRect();
    const url = new URL(window.location.href);
    return {
      bodyText: document.body.innerText,
      pathname: url.pathname,
      route: `${url.pathname}${url.search}${url.hash}`,
      locale: document.documentElement.lang,
      direction: document.documentElement.dir,
      theme: document.documentElement.classList.contains("dark")
        ? "dark"
        : "light",
      documentReadyState: document.readyState,
      fontsReady: document.fonts.status === "loaded",
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
    };
  });
  const privacy = inspectGate8cVisibleTextPrivacy(pageState.bodyText);
  const observedState =
    stateMarker.visibleCount > 0 &&
    (!spec.stateContract.marker.requireInViewport ||
      stateMarker.inViewportCount > 0)
      ? spec.expectedState
      : "UNVERIFIED";

  return {
    pathname: pageState.pathname,
    route: pageState.route,
    locale: pageState.locale,
    direction: pageState.direction,
    theme: pageState.theme,
    observedState,
    viewport: { width: spec.width, height: spec.height },
    localeEvidence,
    documentReadyState: pageState.documentReadyState,
    fontsReady: pageState.fontsReady,
    requiredLandmarks,
    forbiddenStates,
    requiredVisibleText,
    forbiddenVisibleText,
    stateEvidence: {
      marker: spec.stateContract.marker.selector,
      count: stateMarker.count,
      visibleCount: stateMarker.visibleCount,
      inViewportCount: stateMarker.inViewportCount,
      conflictingStates: conflictingStates.map(
        ({ count, inViewportCount, selector }) => ({
          count,
          inViewportCount,
          selector,
        }),
      ),
    },
    horizontalOverflowPx: pageState.horizontalOverflowPx,
    mainWidthRatio: pageState.mainWidthRatio,
    runningAnimations: pageState.runningAnimations,
    ...errors,
    ...privacy,
    visibleTextSha256: gate8cSha256(pageState.bodyText.replace(/\s+/gu, " ").trim()),
    screenshotScope: "viewport" as const,
  } satisfies Gate8cPagePreflight;
}

async function captureOne(
  browserContext: BrowserContext,
  baseUrl: string,
  fixture: FixtureResult,
  spec: Gate8cCaptureSpec,
  temporaryDirectory: string,
) {
  const route =
    typeof spec.route === "function" ? spec.route(fixture) : spec.route;
  const page = await browserContext.newPage();
  const errors: CaptureErrors = {
    consoleErrors: [],
    pageErrors: [],
    failedResources: [],
    responseErrors: [],
  };
  page.on("console", (message) => {
    const expectedNotFound =
      spec.allowedDocumentStatuses?.includes(404) &&
      /404 \(Not Found\)/u.test(message.text());
    if (message.type() === "error" && !expectedNotFound) {
      errors.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (
      request.resourceType() === "fetch" &&
      /ERR_ABORTED|NS_BINDING_ABORTED|cancelled/iu.test(failure)
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
  try {
    if (spec.loadingNavigation) {
      releaseLoadingRequest = await openLoadingPage(
        page,
        baseUrl,
        spec,
        spec.loadingNavigation,
      );
    } else {
      await openNormalPage(page, baseUrl, spec, route);
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
      await waitForContract(page, {
        ...landmark,
        requireInViewport: false,
      });
    }
    if (spec.scrollTo) {
      await page.locator(spec.scrollTo).first().scrollIntoViewIfNeeded();
      await settlePage(page, spec);
    }
    for (const landmark of spec.requiredLandmarks.filter(
      (contract) => contract.requireInViewport,
    )) {
      await waitForContract(page, landmark);
    }

    const fixtureLocale = await readGate8cVisualFixtureLocale(spec.role);
    const preflight = await collectPreflight(page, spec, route, errors, {
      browserLocale: browserLocale(spec.locale),
      cookieLocale: spec.locale,
      fixtureLanguage: fixtureLocale.language,
      fixtureUserId: fixtureLocale.userId,
    });
    const target = path.join(temporaryDirectory, spec.file);
    await page.screenshot({
      animations: "disabled",
      fullPage: false,
      path: target,
      type: "png",
    });

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
      forbiddenStates: spec.forbiddenStates ?? gate8cFinalForbidden,
      requiredVisibleText: spec.requiredVisibleText,
      forbiddenVisibleText: spec.forbiddenVisibleText,
      languageExceptions: spec.languageExceptions,
      stateContract: spec.stateContract,
      expectedMime: "image/png",
      expectedFormat: "png",
      actualWidth: inspected.width,
      actualHeight: inspected.height,
      sha256: inspected.sha256,
      families: spec.families,
      visualMetrics: inspected.metrics,
      preflight,
      humanReview: {
        result: "PENDING",
        reviewedAt: "",
        notes: `Pending fresh human review: ${spec.reviewPrompt}`,
      },
    };
    return evidence;
  } finally {
    await releaseLoadingRequest?.();
    await page.close();
  }
}

async function capturePass(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  baseUrl: string,
  temporaryDirectory: string,
  assertOwnedResponder: () => Promise<void>,
) {
  const fixture = await prepareGate8cVisualFixture();
  const captures: Gate8cCaptureEvidence[] = [];
  try {
    for (const spec of gate8cCaptureSpecs) {
      await assertOwnedResponder();
      process.stdout.write(`Capturing ${spec.file}\n`);
      await setGate8cVisualFixtureLocale(spec.role, spec.locale);
      const context = await browser.newContext({
        baseURL: baseUrl,
        colorScheme: spec.theme,
        locale: browserLocale(spec.locale),
        reducedMotion: "reduce",
        viewport: { width: spec.width, height: spec.height },
      });
      await context.addCookies([
        ...cookieObjects(baseUrl, roleCookie(fixture, spec.role)),
        {
          name: "REZNO_LOCALE",
          value: spec.locale,
          domain: new URL(baseUrl).hostname,
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await context.addInitScript((theme) => {
        localStorage.setItem("theme", theme);
        localStorage.setItem("rezno-dashboard-sidebar-collapsed", "false");
      }, spec.theme);
      try {
        captures.push(
          await captureOne(
            context,
            baseUrl,
            fixture,
            spec,
            temporaryDirectory,
          ),
        );
      } finally {
        await context.close();
      }
    }
    await assertOwnedResponder();
    return {
      captures,
      fixtureFingerprint: fixture.fixtureFingerprint,
    };
  } finally {
    await cleanupGate8cVisualFixture();
  }
}

async function assertDeterministicPasses(
  first: Awaited<ReturnType<typeof capturePass>>,
  second: Awaited<ReturnType<typeof capturePass>>,
  firstDirectory: string,
  secondDirectory: string,
) {
  assert.equal(
    first.fixtureFingerprint,
    second.fixtureFingerprint,
    "Visible fixture data changed between identical capture passes.",
  );
  assert.equal(
    semanticGate8cCaptureDigest(first.captures),
    semanticGate8cCaptureDigest(second.captures),
    "Capture manifests differ semantically between identical passes.",
  );
  let identicalCaptureCount = 0;
  let identicalPreflightCount = 0;
  for (const spec of gate8cCaptureSpecs) {
    const left = await readFile(path.join(firstDirectory, spec.file));
    const right = await readFile(path.join(secondDirectory, spec.file));
    assert.ok(
      left.equals(right),
      `${spec.file} changed between identical capture passes.`,
    );
    identicalCaptureCount += 1;
    const firstEvidence = first.captures.find(
      (capture) => capture.file.endsWith(`/${spec.file}`),
    );
    const secondEvidence = second.captures.find(
      (capture) => capture.file.endsWith(`/${spec.file}`),
    );
    assert.ok(firstEvidence && secondEvidence);
    assert.equal(
      gate8cCanonicalJson(firstEvidence.preflight),
      gate8cCanonicalJson(secondEvidence.preflight),
      `${spec.file} page preflight changed between identical passes.`,
    );
    identicalPreflightCount += 1;
  }
  return { identicalCaptureCount, identicalPreflightCount };
}

async function main() {
  assertGate8cCaptureContract();
  const production = await startGate8cProductionHarness();
  const browser = await chromium.launch({ headless: true });
  const firstDirectory = await mkdtemp(
    path.join(os.tmpdir(), "rezno-gate8c-pass-one-"),
  );
  const secondDirectory = await mkdtemp(
    path.join(os.tmpdir(), "rezno-gate8c-pass-two-"),
  );
  try {
    const first = await capturePass(
      browser,
      production.baseUrl,
      firstDirectory,
      production.assertOwnedResponder,
    );
    const second = await capturePass(
      browser,
      production.baseUrl,
      secondDirectory,
      production.assertOwnedResponder,
    );
    await production.assertOwnedResponder();
    const deterministic = await assertDeterministicPasses(
      first,
      second,
      firstDirectory,
      secondDirectory,
    );
    for (const capture of second.captures) {
      await validateGate8cCapture(
        {
          ...capture,
          humanReview: {
            result: "PASS",
            reviewedAt: "CAPTURE_VALIDATION_ONLY",
            notes: "Capture-time structural validation; not the human review record.",
          },
        },
        await readFile(path.join(secondDirectory, path.basename(capture.file))),
      );
    }

    await rm(baselineDirectory, { recursive: true, force: true });
    await mkdir(baselineDirectory, { recursive: true });
    for (const spec of gate8cCaptureSpecs) {
      await copyFile(
        path.join(secondDirectory, spec.file),
        path.join(baselineDirectory, spec.file),
      );
    }
    const semanticManifestSha256 = semanticGate8cCaptureDigest(second.captures);
    const manifest = {
      gate: "8C",
      baseSha: "903cbf8de413145ba83f652e23f41616f79c90d3",
      capturedAt: production.attestation.startedAt,
      environment:
        "Disposable local PostgreSQL database and harness-owned authenticated Next.js production build/server",
      productionAttestation: production.attestation,
      determinism: {
        passes: 2,
        fixtureFingerprint: second.fixtureFingerprint,
        identicalCaptureCount: deterministic.identicalCaptureCount,
        identicalPreflightCount: deterministic.identicalPreflightCount,
        semanticManifestSha256,
      },
      capturePolicy: {
        browser: `Chromium ${browser.version()}`,
        fixtures:
          "Fixed UUIDs, timestamps, .example identities, null phones, and deterministic Gate 8C domain data",
        motion:
          "prefers-reduced-motion plus disabled CSS animations/transitions",
        screenshotScope: "viewport-only; no full-page stitching",
        sensitiveData:
          "fixtures.example identities only; credential, phone, and non-fixture email scans passed",
        localeEvidence:
          "visible locale-specific text plus cookie, browser locale, HTML direction, and Person preferred-language agreement",
        productionProvenance:
          "harness-owned next build and next start; BUILD_ID, Git SHA, child PID/port, commands, and build/script hashes attested",
        determinism:
          "two clean fixture generations on one attested build produced byte-identical images and preflight records",
        humanReview:
          "PENDING; a fresh per-image record is required after opening every generated PNG",
      },
      captures: second.captures,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await cleanupGate8cVisualFixture().catch(() => undefined);
    await prisma.$disconnect();
    await browser.close();
    await production.stop();
    await rm(firstDirectory, { recursive: true, force: true });
    await rm(secondDirectory, { recursive: true, force: true });
  }
}

void main();
