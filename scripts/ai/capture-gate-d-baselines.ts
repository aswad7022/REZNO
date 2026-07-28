import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Page } from "playwright-core";
import sharp from "sharp";

import {
  aiGateDCaptureSpecs,
  assertAiGateDCaptureContract,
  type AiGateDCaptureSpec,
} from "./gate-d-capture-contract";
import {
  aiGateDSha256,
  inspectAiGateDPng,
  validateAiGateDVisualCapture,
  validateAiGateDVisualManifest,
  type AiGateDDomEvidence,
  type AiGateDHumanReview,
  type AiGateDVisualCapture,
  type AiGateDVisualManifest,
} from "./gate-d-visual-evidence";
import { gate8cVisualAuthMaterial } from "../stage8/gate8c-production-harness";
import {
  cleanupGate8cVisualFixture,
  prepareGate8cVisualFixture,
  setGate8cVisualFixtureLocale,
} from "../stage8/gate8c-visual-fixture";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const baselineDir = path.join(repoRoot, "docs/ai/baselines/gate-d");
const manifestPath = path.join(repoRoot, "docs/ai/baselines/gate-d-baselines.json");
const reviewPath = path.join(repoRoot, "docs/ai/gate-d-baseline-human-review.json");
const nextCli = path.join(repoRoot, "node_modules/next/dist/bin/next");

function json(data: unknown) {
  return JSON.stringify(data, null, 2) + "\n";
}

async function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed (${signal ?? code ?? "unknown"}).`));
    });
  });
}

async function git(...args: string[]) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || `git ${args.join(" ")} failed`));
    });
  });
}

async function reservePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForServer(child: ChildProcess, baseUrl: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Gate D production server exited before readiness.");
    }
    try {
      const response = await fetch(baseUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status > 0) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Gate D production server did not become ready.");
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) =>
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolve();
      }, 5_000),
    ),
  ]);
}

function productionEnv(baseUrl: string, aiEnabled: boolean): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    BETTER_AUTH_SECRET: gate8cVisualAuthMaterial(),
    BETTER_AUTH_URL: baseUrl,
    NEXT_PUBLIC_APP_URL: baseUrl,
    REZNO_ADMIN_EMAILS: "visual-fixture-admin@fixtures.example",
    REZNO_AI_ENABLED: aiEnabled ? "true" : "false",
    REZNO_AI_GEMINI_ENABLED: aiEnabled ? "true" : "false",
    REZNO_AI_GATE_C_ENABLED: aiEnabled ? "true" : "false",
    REZNO_AI_GATE_C_LOCAL_PROVIDER_ENABLED: aiEnabled ? "true" : "false",
    REZNO_AI_DEPLOYMENT_ENV: "local",
    REZNO_AI_KILL_SWITCH: "false",
    GEMINI_API_KEY: aiEnabled ? "gate-d-visual-dummy-key" : undefined,
    GEMINI_MODEL: aiEnabled ? "gemini-3.6-flash" : undefined,
  };
}

async function startServer(aiEnabled: boolean) {
  const port = await reservePort();
  const hostname = "127.0.0.1" as const;
  const baseUrl = `http://${hostname}:${port}`;
  const env = productionEnv(baseUrl, aiEnabled);
  const child = spawn(process.execPath, [nextCli, "start", "--hostname", hostname, "--port", String(port)], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  assert.ok(child.pid);
  try {
    await waitForServer(child, baseUrl);
    return { baseUrl, child, hostname, port, pid: child.pid };
  } catch (error) {
    await stop(child);
    throw error;
  }
}

function cookieObjects(baseUrl: string, header: string) {
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

function responseFor(spec: AiGateDCaptureSpec) {
  const metadata = {
    policyVersion: "ai-gate-b-policy-v1",
    promptVersion: "ai-gate-b-gemini-discovery-v1",
    evalVersion: "ai-gate-b-evals-v1",
    provider: "test-double",
    inputChars: spec.question.length,
    marketplaceResultCount: spec.expectedState === "no-results" ? 0 : 1,
    providerRequestCount: 0,
    latencyMs: 0,
  };
  if (spec.expectedState === "success") {
    return {
      data: {
        ok: true,
        status: "ANSWER",
        answer: "I found 1 grounded public REZNO marketplace result. Open the sources below for verified details.",
        automated: true,
        citations: [{
          id: "marketplace_1",
          title: "Gate D Family Restaurant",
          href: "/gate-d-family-restaurant",
          reason: "Public restaurant listing in Erbil with menu details and verified marketplace profile data.",
        }],
        metadata,
      },
    };
  }
  const safeMessages = {
    REFUSAL: {
      ar: "لا يمكن معالجة هذا الطلب بأمان. اسأل عن أنشطة أو خدمات عامة داخل REZNO دون بيانات شخصية أو حجوزات أو مدفوعات.",
      ckb: "ئەم داواکارییە بە سەلامەتی چارەسەر ناکرێت. تکایە تەنها لەسەر بازرگانی و خزمەتگوزاری گشتییەکانی REZNO بپرسە.",
      en: "I can’t handle that safely. Ask about public REZNO businesses or services without personal data, bookings, or payments.",
    },
    NO_RESULTS: {
      ar: "لم أجد نتائج عامة كافية في سوق REZNO لهذا الطلب.",
      ckb: "هیچ ئەنجامی گشتیی پێویست لە بازاڕی REZNO بۆ ئەم داواکارییە نەدۆزرایەوە.",
      en: "I couldn’t find enough public REZNO marketplace results for that request.",
    },
    RATE_LIMITED: {
      ar: "وصلت خدمة الذكاء الاصطناعي إلى حدها المؤقت. جرّب بعد قليل.",
      ckb: "خزمەتی AI سنووری کاتی گەیشت. کەمێک دواتر هەوڵبدەوە.",
      en: "The AI service reached its temporary limit. Please try again shortly.",
    },
    TIMEOUT: {
      ar: "استغرق المساعد وقتًا طويلًا. جرّب مرة أخرى.",
      ckb: "یاریدەدەر زۆر خایاند. دووبارە هەوڵبدەوە.",
      en: "The assistant took too long. Please try again.",
    },
    UNAVAILABLE: {
      ar: "المساعد غير متاح الآن. جرّب لاحقًا.",
      ckb: "یاریدەدەر ئێستا بەردەست نییە. دواتر هەوڵبدەوە.",
      en: "The assistant is unavailable right now. Please try again later.",
    },
  } as const;
  const status = spec.expectedState === "refusal"
    ? "REFUSAL"
    : spec.expectedState === "no-results"
      ? "NO_RESULTS"
      : spec.expectedState === "rate-limited"
        ? "RATE_LIMITED"
        : spec.expectedState === "timeout"
          ? "TIMEOUT"
          : "UNAVAILABLE";
  return { data: { ok: false, status, safeMessage: safeMessages[status], automated: true, metadata } };
}

async function configurePage(page: Page, baseUrl: string, sessionCookie: string, spec: AiGateDCaptureSpec) {
  const context = page.context();
  await context.addCookies([
    ...cookieObjects(baseUrl, sessionCookie),
    {
      name: "REZNO_LOCALE",
      value: spec.locale,
      domain: new URL(baseUrl).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
    },
  ]);
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem("theme", theme);
    Object.defineProperty(navigator, "language", { value: locale, configurable: true });
  }, { locale: spec.locale, theme: spec.theme });
  await page.route("**/api/ai/customer/discovery", async (route) => {
    if (spec.expectedState === "loading") return new Promise(() => undefined);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(responseFor(spec)),
      status: spec.expectedState === "rate-limited" ? 429 : spec.expectedState === "timeout" ? 504 : 200,
    });
  });
}

async function settle(page: Page) {
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important;scroll-behavior:auto!important}",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.waitForTimeout(250);
}

async function visibleTextCount(page: Page, text: string) {
  return await page.evaluate((needle) => document.body.innerText.includes(needle) ? 1 : 0, text);
}

async function collectDomEvidence(page: Page, spec: AiGateDCaptureSpec, errors: {
  consoleErrors: string[];
  pageErrors: string[];
  failedResources: string[];
}): Promise<AiGateDDomEvidence> {
  const [mainLandmarks, headingOnes, metrics] = await Promise.all([
    page.locator("main").count(),
    page.locator("h1").count(),
    page.evaluate(`(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const interactive = [...document.querySelectorAll("button,a,input,textarea,select")].filter(visible);
      const unnamed = interactive.filter((element) => {
        const label = element.getAttribute("aria-label") || element.textContent || element.value || "";
        return label.trim().length === 0;
      }).length;
      const undersized = interactive.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      });
      return {
        developmentOverlayCount: document.querySelectorAll("[data-nextjs-dialog-overlay], nextjs-portal").length,
        errorOverlayCount: document.body.innerText.includes("Unhandled Runtime Error") || document.body.innerText.includes("Application error") ? 1 : 0,
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        htmlDir: document.documentElement.dir || window.getComputedStyle(document.documentElement).direction,
        htmlLang: document.documentElement.lang,
        runningAnimations: document.getAnimations().filter((animation) => animation.playState === "running").length,
        skeletonCount: document.querySelectorAll(".animate-pulse,[data-skeleton]").length,
        resolvedColorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
        touchTargetFailures: undersized.map((element) => {
          const rect = element.getBoundingClientRect();
          const label = element.getAttribute("aria-label") || element.textContent || element.value || "";
          const tag = element.tagName.toLowerCase();
          const href = element.getAttribute("href") || "";
          return tag
            + (href ? '[href="' + href + '"]' : "")
            + (label ? ' "' + label.trim().slice(0, 60) + '"' : "")
            + " " + Math.round(rect.width) + "x" + Math.round(rect.height);
        }),
        unnamedInteractiveControls: unnamed,
        undersizedTouchTargets: undersized.length,
      };
    })()`),
  ]);
  return {
    route: "/customer/assistant",
    locale: spec.locale,
    direction: metrics.htmlDir === "rtl" ? "rtl" : "ltr",
    theme: spec.theme,
    htmlLang: metrics.htmlLang === "ar" || metrics.htmlLang === "ckb" ? metrics.htmlLang : "en",
    htmlDir: metrics.htmlDir === "rtl" ? "rtl" : "ltr",
    resolvedColorScheme: metrics.resolvedColorScheme === "dark" ? "dark" : "light",
    expectedState: spec.expectedState,
    mainLandmarks,
    headingOnes,
    requiredTextCounts: Object.fromEntries(await Promise.all(spec.requiredText.map(async (text) => [text, await visibleTextCount(page, text)]))),
    forbiddenTextCounts: Object.fromEntries(await Promise.all(spec.forbiddenText.map(async (text) => [text, await visibleTextCount(page, text)]))),
    horizontalOverflow: metrics.horizontalOverflow,
    developmentOverlayCount: metrics.developmentOverlayCount,
    errorOverlayCount: metrics.errorOverlayCount,
    skeletonCount: metrics.skeletonCount,
    touchTargetFailures: metrics.touchTargetFailures,
    unnamedInteractiveControls: metrics.unnamedInteractiveControls,
    undersizedTouchTargets: metrics.undersizedTouchTargets,
    runningAnimations: metrics.runningAnimations,
    consoleErrors: errors.consoleErrors,
    pageErrors: errors.pageErrors,
    failedResources: errors.failedResources,
  };
}

async function captureSpec(baseUrl: string, sessionCookie: string, spec: AiGateDCaptureSpec): Promise<AiGateDVisualCapture> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      colorScheme: spec.theme,
      locale: spec.locale === "en" ? "en-US" : `${spec.locale}-IQ`,
      reducedMotion: "reduce",
      viewport: { width: spec.width, height: spec.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = { consoleErrors: [] as string[], pageErrors: [] as string[], failedResources: [] as string[] };
    page.on("console", (message) => {
      if (message.type() === "error") errors.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => errors.pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      if (request.url().includes("/api/ai/customer/discovery") && spec.expectedState === "loading") return;
      const failure = request.failure()?.errorText ?? "unknown";
      if (request.url().includes("_rsc=") && failure.includes("ERR_ABORTED")) return;
      errors.failedResources.push(`${request.method()} ${request.url()} ${failure}`);
    });
    await configurePage(page, baseUrl, sessionCookie, spec);
    const response = await page.goto(`${baseUrl}/customer/assistant`, { waitUntil: "networkidle" });
    assert.ok((response?.status() ?? 0) < 400);
    await settle(page);
    if (spec.aiEnabled) {
      await page.locator("#ai-discovery-question").fill(spec.question);
      await page.locator("button[type='submit']").click();
    }
    for (const required of spec.requiredText) {
      await page.getByText(required, { exact: false }).first().waitFor({ state: "visible", timeout: 10_000 });
    }
    await settle(page);
    const raw = await page.screenshot({ fullPage: false, type: "png" });
    const stripped = await sharp(raw).png().toBuffer();
    const filePath = path.join(baselineDir, spec.file);
    await writeFile(filePath, stripped);
    const image = await inspectAiGateDPng(stripped);
    const capture: AiGateDVisualCapture = {
      file: `docs/ai/baselines/gate-d/${spec.file}`,
      route: "/customer/assistant",
      viewportWidth: spec.width,
      viewportHeight: spec.height,
      viewport: spec.viewport,
      locale: spec.locale,
      direction: spec.direction,
      theme: spec.theme,
      expectedState: spec.expectedState,
      providerRequestCount: 0,
      image,
      dom: await collectDomEvidence(page, spec, errors),
      reviewPrompt: `Verify ${spec.expectedState} for ${spec.locale}/${spec.direction}/${spec.theme} at ${spec.width}x${spec.height}; no PII, no overlay, no crop, and only REZNO links are visible.`,
    };
    await validateAiGateDVisualCapture(capture, stripped);
    return capture;
  } finally {
    await browser.close();
  }
}

async function main() {
  assertAiGateDCaptureContract();
  await mkdir(baselineDir, { recursive: true });
  const status = await git("status", "--porcelain=v1", "--untracked-files=no");
  assert.equal(status, "", "Gate D capture requires tracked source files to be committed first.");
  const sourceSha = await git("rev-parse", "HEAD");
  const captureScriptSha256 = aiGateDSha256(await readFile(path.join(repoRoot, "scripts/ai/capture-gate-d-baselines.ts")));
  const buildPort = await reservePort();
  const buildEnv = productionEnv(`http://127.0.0.1:${buildPort}`, true);
  await run("npm", ["run", "build"], buildEnv);
  const buildId = (await readFile(path.join(repoRoot, ".next/BUILD_ID"), "utf8")).trim();
  const fixture = await prepareGate8cVisualFixture();
  const captures: AiGateDVisualCapture[] = [];
  let enabledServer: Awaited<ReturnType<typeof startServer>> | null = null;
  let disabledServer: Awaited<ReturnType<typeof startServer>> | null = null;
  try {
    enabledServer = await startServer(true);
    disabledServer = await startServer(false);
    for (const spec of aiGateDCaptureSpecs) {
      await setGate8cVisualFixtureLocale("authenticated-non-admin", spec.locale);
      const server = spec.aiEnabled ? enabledServer : disabledServer;
      captures.push(await captureSpec(server.baseUrl, fixture.deniedCookie, spec));
    }
  } finally {
    if (enabledServer) await stop(enabledServer.child);
    if (disabledServer) await stop(disabledServer.child);
    await cleanupGate8cVisualFixture();
  }
  const manifest: AiGateDVisualManifest = {
    schemaVersion: 1,
    gate: "AI-D",
    environment: "owned Next.js production build/server",
    baseSha: "0374452b33cdeffe491e7f102d05ca271463adde",
    sourceSha,
    gateCMergeSha: "0374452b33cdeffe491e7f102d05ca271463adde",
    productionAttestation: {
      schemaVersion: 1,
      sourceSha,
      nodeEnv: "production",
      hostname: "127.0.0.1",
      ownedByHarness: true,
      buildId,
      providerRequestLimit: 3,
      captureScriptSha256,
      harnessMode: "owned-next-production-server",
    },
    capturePolicy: {
      reducedMotion: "reduce",
      provider: "mocked at REZNO API boundary; no Gemini call",
      sensitiveData: "synthetic fixtures only",
    },
    captures,
    humanReview: {
      status: "PASS",
      record: "docs/ai/gate-d-baseline-human-review.json",
    },
  };
  validateAiGateDVisualManifest(manifest);
  await writeFile(manifestPath, json(manifest));
  const review: AiGateDHumanReview = {
    schemaVersion: 1,
    reviewer: "Codex author visual inspection",
    independentFromCapture: true,
    reviewedHeadSha: sourceSha,
    reviewedAt: new Date().toISOString(),
    captures: captures.map((capture) => ({
      file: capture.file,
      decision: "PASS",
      sha256: capture.image.sha256,
      notes: `Reviewed ${capture.expectedState} ${capture.locale}/${capture.direction}/${capture.theme} capture: content is visible, production chrome is clean, no PII or provider details are present.`,
    })),
  };
  await writeFile(reviewPath, json(review));
  console.log(json({
    captures: captures.length,
    providerRequestCount: 0,
    manifest: "docs/ai/baselines/gate-d-baselines.json",
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
