import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type Page,
} from "playwright-core";

import {
  assertGate8dCaptureContract,
  gate8dCaptureSpecs,
  type Gate8dBrowser,
  type Gate8dCaptureSpec,
} from "./gate8d-capture-contract";
import { startGate8dProductionHarness } from "./gate8d-production-harness";
import {
  inspectGate8dPng,
  sha256,
  validateGate8dCapture,
  type Gate8dAccessibilityEvidence,
  type Gate8dCaptureEvidence,
  type Gate8dDomEvidence,
  type Gate8dPerformanceEvidence,
  type Gate8dVisualManifest,
} from "./gate8d-visual-evidence";
import {
  cleanupGate8cVisualFixture,
  prepareGate8cVisualFixture,
  setGate8cVisualFixtureLocale,
} from "./gate8c-visual-fixture";
import { gate8cFinalForbidden } from "./gate8c-capture-contract";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const baselineDirectory = path.join(repoRoot, "docs/stage8/baselines/gate8d");
const manifestPath = path.join(
  repoRoot,
  "docs/stage8/baselines/gate8d-baselines.json",
);

type Fixture = Awaited<ReturnType<typeof prepareGate8cVisualFixture>>;

const browserTypes: Record<Gate8dBrowser, BrowserType> = {
  chromium,
  firefox,
  webkit,
};

function browserLocale(locale: Gate8dCaptureSpec["locale"]) {
  if (locale === "ar") return "ar-IQ";
  if (locale === "ckb") return "ckb-IQ";
  return "en-US";
}

function roleCookie(fixture: Fixture, role: Gate8dCaptureSpec["role"]) {
  if (role === "root-super-admin") return fixture.adminCookie;
  if (role === "business-owner") return fixture.businessCookie;
  if (role === "communications-viewer") return fixture.communicationsViewerCookie;
  return fixture.deniedCookie;
}

function cookies(baseUrl: string, header: string) {
  const domain = new URL(baseUrl).hostname;
  return header.split(";").map((part) => {
    const [name, ...value] = part.trim().split("=");
    return {
      name,
      value: value.join("="),
      domain,
      path: "/",
      httpOnly: name.includes("session_token"),
      sameSite: "Lax" as const,
    };
  });
}

function routeFor(spec: Gate8dCaptureSpec, fixture: Fixture) {
  return typeof spec.route === "function"
    ? spec.route({
        candidateEmail: fixture.candidateEmail,
        candidateUserId: fixture.candidateUserId,
      })
    : spec.route;
}

async function configureContext(
  browser: Browser,
  baseUrl: string,
  fixture: Fixture,
  spec: Gate8dCaptureSpec,
) {
  const context = await browser.newContext({
    colorScheme: spec.theme,
    locale: browserLocale(spec.locale),
    reducedMotion: "reduce",
    viewport: { width: spec.width, height: spec.height },
    deviceScaleFactor: 1,
  });
  await context.addCookies(cookies(baseUrl, roleCookie(fixture, spec.role)));
  await context.addInitScript(
    ({ theme }) => {
      localStorage.setItem("theme", theme);
      const state = {
        cls: 0,
        fcp: 0,
        lcp: 0,
        longTasks: 0,
      };
      Object.defineProperty(window, "__gate8dPerformance", {
        value: state,
        configurable: false,
        writable: false,
      });
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
              state.cls += (entry as PerformanceEntry & { value?: number }).value ?? 0;
            }
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch {}
      try {
        new PerformanceObserver((list) => {
          const entry = list.getEntries().at(-1);
          if (entry) state.lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
      } catch {}
      try {
        new PerformanceObserver((list) => {
          const entry = list.getEntriesByName("first-contentful-paint")[0];
          if (entry) state.fcp = entry.startTime;
        }).observe({ type: "paint", buffered: true });
      } catch {}
      try {
        new PerformanceObserver((list) => {
          state.longTasks += list.getEntries().length;
        }).observe({ type: "longtask", buffered: true });
      } catch {}
    },
    { theme: spec.theme },
  );
  return context;
}

async function settle(page: Page) {
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
  await page.waitForTimeout(250);
}

async function preparePage(
  page: Page,
  baseUrl: string,
  route: string,
  spec: Gate8dCaptureSpec,
) {
  const response = await page.goto(`${baseUrl}${route}`, {
    waitUntil: "networkidle",
  });
  const status = response?.status() ?? 0;
  assert.ok(
    status < 400 || spec.allowedDocumentStatuses?.includes(status),
    `${spec.file} returned ${status}`,
  );
  if (spec.openAdminNavigation) {
    const label = spec.locale === "en" ? "Open admin menu" : "فتح قائمة الإدارة";
    await page.getByRole("button", { name: label }).click();
  }
  if (spec.scrollTo) {
    await page.locator(spec.scrollTo).first().scrollIntoViewIfNeeded();
  }
  await settle(page);
  for (const required of spec.requiredLandmarks) {
    const locator = required.textIncludes
      ? page.locator(required.selector).filter({ hasText: required.textIncludes })
      : page.locator(required.selector);
    await locator.first().waitFor({ state: "attached", timeout: 30_000 });
  }
}

async function countVisible(page: Page, selector: string, text?: string) {
  const locator = text
    ? page.locator(selector).filter({ hasText: text })
    : page.locator(selector);
  const count = await locator.count();
  let visible = 0;
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) visible += 1;
  }
  return visible;
}

async function collectDom(
  page: Page,
  route: string,
  spec: Gate8dCaptureSpec,
  errors: {
    consoleErrors: string[];
    pageErrors: string[];
    failedResources: string[];
  },
): Promise<Gate8dDomEvidence> {
  const requiredLandmarkCounts = Object.fromEntries(
    await Promise.all(
      spec.requiredLandmarks.map(async ({ selector, textIncludes }) => [
        `${selector}${textIncludes ? `::${textIncludes}` : ""}`,
        await countVisible(page, selector, textIncludes),
      ]),
    ),
  );
  const forbidden = spec.forbiddenStates ?? gate8cFinalForbidden;
  const forbiddenStateCounts = Object.fromEntries(
    await Promise.all(
      forbidden.map(async ({ selector }) => [
        selector,
        await countVisible(page, selector),
      ]),
    ),
  );
  const requiredTextCounts = Object.fromEntries(
    await Promise.all(
      spec.requiredVisibleText.map(async ({ selector, text }) => [
        `${selector}::${text}`,
        await countVisible(page, selector, text),
      ]),
    ),
  );
  const forbiddenTextCounts = Object.fromEntries(
    await Promise.all(
      spec.forbiddenVisibleText.map(async ({ selector, text }) => [
        `${selector}::${text}`,
        await countVisible(page, selector, text),
      ]),
    ),
  );
  const pageState = await page.evaluate(() => {
    const animations = document
      .getAnimations()
      .filter((animation) => animation.playState === "running");
    return {
      path: `${location.pathname}${location.search}${location.hash}`,
      lang: document.documentElement.lang,
      direction: document.documentElement.dir,
      dark: document.documentElement.classList.contains("dark"),
      overflow: Math.max(
        0,
        document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
      animations: animations.length,
    };
  });
  assert.equal(pageState.lang, spec.locale);
  assert.equal(pageState.direction, spec.locale === "en" ? "ltr" : "rtl");
  assert.equal(pageState.dark, spec.theme === "dark");
  return {
    urlPath: pageState.path,
    locale: spec.locale,
    direction: spec.locale === "en" ? "ltr" : "rtl",
    theme: spec.theme,
    expectedState: spec.expectedState,
    stateMarkerCount: await countVisible(
      page,
      spec.stateContract.marker.selector,
      spec.stateContract.marker.textIncludes,
    ),
    requiredLandmarkCounts,
    forbiddenStateCounts,
    requiredTextCounts,
    forbiddenTextCounts,
    horizontalOverflow: pageState.overflow,
    runningAnimations: pageState.animations,
    ...errors,
  };
}

async function collectAccessibility(
  page: Page,
): Promise<Gate8dAccessibilityEvidence> {
  return await page.evaluate(() => {
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    };
    const controls = Array.from(
      document.querySelectorAll(
        'button,input:not([type="hidden"]),select,textarea,[role="button"]',
      ),
    ).filter(visible);
    const unnamed = controls.filter((element) => {
      const label =
        element.getAttribute("aria-label") ||
        element.getAttribute("aria-labelledby") ||
        (element as HTMLElement).innerText ||
        (element as HTMLInputElement).value ||
        element.getAttribute("title");
      return !label?.trim();
    });
    const undersized = controls.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    });
    const ids = Array.from(document.querySelectorAll("[id]")).map(
      (element) => element.id,
    );
    const duplicates = ids.filter(
      (id, index) => id && ids.indexOf(id) !== index,
    );
    return {
      mainLandmarks: document.querySelectorAll("main").length,
      headingOnes: document.querySelectorAll("h1").length,
      unnamedInteractiveControls: unnamed.length,
      undersizedTouchTargets: undersized.length,
      duplicateIds: new Set(duplicates).size,
      skipLinkTargetExists:
        Boolean(document.querySelector('.rezno-skip-link[href="#main-content"]')) &&
        Boolean(document.querySelector("#main-content")),
      focusVisibleSupported: CSS.supports("selector(:focus-visible)"),
      reducedMotionRunningAnimations: document
        .getAnimations()
        .filter((animation) => animation.playState === "running").length,
    };
  });
}

async function collectPerformance(
  page: Page,
): Promise<Gate8dPerformanceEvidence> {
  const timing = await page.evaluate(() => {
    const navigation = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    const state = (
      window as typeof window & {
        __gate8dPerformance?: {
          cls: number;
          fcp: number;
          lcp: number;
          longTasks: number;
        };
      }
    ).__gate8dPerformance ?? { cls: 0, fcp: 0, lcp: 0, longTasks: 0 };
    return {
      ...state,
      load: navigation?.loadEventEnd || performance.now(),
    };
  });
  return {
    cls: Number(timing.cls.toFixed(4)),
    fcpMs: Math.round(timing.fcp || timing.load),
    lcpMs: timing.lcp ? Math.round(timing.lcp) : null,
    loadMs: Math.round(timing.load),
    longTasks: timing.longTasks,
    budgets: {
      clsMax: 0.1,
      fcpMaxMs: 3000,
      lcpMaxMs: 4000,
      loadMaxMs: 5000,
      longTasksMax: 5,
    },
  };
}

async function captureOne(
  browser: Browser,
  browserVersion: string,
  baseUrl: string,
  fixture: Fixture,
  spec: Gate8dCaptureSpec,
  outputDirectory: string,
): Promise<Gate8dCaptureEvidence> {
  await setGate8cVisualFixtureLocale(spec.role, spec.locale);
  const context = await configureContext(browser, baseUrl, fixture, spec);
  const page = await context.newPage();
  const errors = {
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    failedResources: [] as string[],
  };
  page.on("console", (message) => {
    if (message.type() === "error") errors.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => errors.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    errors.failedResources.push(
      `${request.method()} ${new URL(request.url()).pathname}: ${
        request.failure()?.errorText ?? "failed"
      }`,
    );
  });
  const route = routeFor(spec, fixture);
  await preparePage(page, baseUrl, route, spec);
  const dom = await collectDom(page, route, spec, errors);
  const accessibility = await collectAccessibility(page);
  const performance = await collectPerformance(page);
  const output = path.join(outputDirectory, spec.file);
  await page.screenshot({
    path: output,
    fullPage: false,
    animations: "disabled",
    caret: "hide",
    type: "png",
  });
  const bytes = await readFile(output);
  const image = await inspectGate8dPng(bytes);
  const evidence: Gate8dCaptureEvidence = {
    file: `docs/stage8/baselines/gate8d/${spec.file}`,
    route,
    browser: spec.browser,
    browserVersion,
    viewport: spec.viewport,
    viewportWidth: spec.width,
    viewportHeight: spec.height,
    zoom: spec.zoom,
    locale: spec.locale,
    direction: spec.locale === "en" ? "ltr" : "rtl",
    theme: spec.theme,
    role: spec.role,
    expectedState: spec.expectedState,
    families: spec.families,
    dom,
    accessibility,
    performance,
    image,
    semanticDigest: sha256(
      JSON.stringify({
        route,
        browser: spec.browser,
        viewport: spec.viewport,
        locale: spec.locale,
        theme: spec.theme,
        role: spec.role,
        expectedState: spec.expectedState,
        dom,
        accessibility,
      }),
    ),
    reviewPrompt: spec.reviewPrompt,
  };
  await validateGate8dCapture(evidence, bytes);
  await context.close();
  return evidence;
}

async function capturePass(
  baseUrl: string,
  fixture: Fixture,
  outputDirectory: string,
) {
  const evidence: Gate8dCaptureEvidence[] = [];
  for (const browserName of ["chromium", "firefox", "webkit"] as const) {
    const browser = await browserTypes[browserName].launch({ headless: true });
    try {
      const version = browser.version();
      for (const spec of gate8dCaptureSpecs.filter(
        (entry) => entry.browser === browserName,
      )) {
        evidence.push(
          await captureOne(
            browser,
            version,
            baseUrl,
            fixture,
            spec,
            outputDirectory,
          ),
        );
      }
    } finally {
      await browser.close();
    }
  }
  return evidence;
}

async function main() {
  assertGate8dCaptureContract();
  await mkdir(baselineDirectory, { recursive: true });
  const first = await mkdtemp(path.join(os.tmpdir(), "rezno-gate8d-first-"));
  const second = await mkdtemp(path.join(os.tmpdir(), "rezno-gate8d-second-"));
  const production = await startGate8dProductionHarness();
  let fixture: Fixture | undefined;
  try {
    fixture = await prepareGate8cVisualFixture();
    const firstPass = await capturePass(production.baseUrl, fixture, first);
    const secondPass = await capturePass(production.baseUrl, fixture, second);
    assert.equal(firstPass.length, 24);
    assert.equal(secondPass.length, 24);
    for (let index = 0; index < firstPass.length; index += 1) {
      const a = await readFile(path.join(first, gate8dCaptureSpecs[index].file));
      const b = await readFile(path.join(second, gate8dCaptureSpecs[index].file));
      assert.equal(a.compare(b), 0, `${gate8dCaptureSpecs[index].file} was not deterministic`);
      await copyFile(
        path.join(first, gate8dCaptureSpecs[index].file),
        path.join(baselineDirectory, gate8dCaptureSpecs[index].file),
      );
    }
    await production.assertOwnedResponder();
    const manifest: Gate8dVisualManifest = {
      schemaVersion: 1,
      gate: "8D",
      environment: "owned Next.js production build/server",
      sourceSha: production.attestation.gitSha,
      productionAttestation: production.attestation,
      capturePolicy: {
        reducedMotion: "reduce",
        animationPolicy: "no running non-progress animation at capture",
        sensitiveData:
          "deterministic fixtures.example identities with null phones",
        zoomEquivalence: "half CSS viewport dimensions with 2x reflow contract",
      },
      determinism: {
        passes: 2,
        identicalCaptureCount: 24,
        fixtureFingerprint: fixture.fixtureFingerprint,
      },
      captures: firstPass,
      humanReview: {
        status: "PENDING",
        record: "docs/stage8/gate8d-baseline-human-review.json",
      },
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await production.stop();
    if (fixture) await cleanupGate8cVisualFixture();
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
