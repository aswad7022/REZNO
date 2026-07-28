import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { AiGateBProviderError, validateAiGateBProviderOutput, toAiGateBMarketplaceResults } from "../../../features/ai/gate-b";
import {
  AI_GATE_D_CLOSURE_VERSION,
  AI_GATE_D_MAX_LIVE_PROVIDER_REQUESTS,
  runAiGateDRedTeamSuite,
} from "../../../features/ai/gate-d";
import {
  aiGateDCaptureSpecs,
  assertAiGateDCaptureContract,
} from "../../../scripts/ai/gate-d-capture-contract";
import {
  inspectAiGateDPng,
  validateAiGateDDomEvidence,
  validateAiGateDHumanReview,
  validateAiGateDVisualCapture,
  validateAiGateDVisualManifest,
  type AiGateDDomEvidence,
  type AiGateDHumanReview,
  type AiGateDVisualManifest,
} from "../../../scripts/ai/gate-d-visual-evidence";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");
const readJson = <T>(file: string) => JSON.parse(read(file)) as T;

const marketplaceSource = {
  id: "90000000-0000-4000-8000-000000000001",
  slug: "gate-d-family-restaurant",
  name: "Gate D Family Restaurant",
  description: "Synthetic public marketplace restaurant.",
  city: "Erbil",
  categoryName: "Restaurant",
  matchingServiceName: "Breakfast",
  startingPrice: "12.00",
  averageRating: 4.6,
  reviewCount: 18,
  serviceCount: 4,
  vertical: "RESTAURANT" as const,
  hasMenu: true,
  hasTables: true,
};

function validDom(overrides: Partial<AiGateDDomEvidence> = {}): AiGateDDomEvidence {
  return {
    consoleErrors: [],
    developmentOverlayCount: 0,
    direction: "ltr",
    errorOverlayCount: 0,
    expectedState: "success",
    failedResources: [],
    forbiddenTextCounts: { "Application error": 0 },
    headingOnes: 1,
    htmlDir: "ltr",
    htmlLang: "en",
    horizontalOverflow: 0,
    locale: "en",
    mainLandmarks: 1,
    pageErrors: [],
    requiredTextCounts: { "REZNO AI": 1 },
    route: "/customer/assistant",
    runningAnimations: 0,
    resolvedColorScheme: "light",
    skeletonCount: 0,
    touchTargetFailures: [],
    theme: "light",
    unnamedInteractiveControls: 0,
    undersizedTouchTargets: 0,
    ...overrides,
  };
}

test("AI Gate D red-team suite passes 100% and bounds provider requests", async () => {
  const report = await runAiGateDRedTeamSuite();
  assert.equal(report.version, AI_GATE_D_CLOSURE_VERSION);
  assert.equal(report.total, 32);
  assert.equal(report.passed, report.total);
  assert.equal(report.preProviderRefusals, 16);
  assert.equal(report.postProviderRejections, 7);
  assert.equal(report.outageDrills, 7);
  assert.equal(report.groundedSuccesses, 1);
  assert.equal(report.providerRequestCount, 11);
});

test("AI Gate D refuses unsupported provider availability claims", () => {
  const context = {
    locale: "en" as const,
    modelId: "gemini-3.6-flash",
    results: toAiGateBMarketplaceResults([marketplaceSource]),
    metadata: {
      policyVersion: "ai-gate-b-policy-v1" as const,
      promptVersion: "ai-gate-b-gemini-discovery-v1" as const,
      evalVersion: "ai-gate-b-evals-v1" as const,
      provider: "test-double" as const,
      modelId: "gemini-3.6-flash",
      inputChars: 20,
      marketplaceResultCount: 1,
      providerRequestCount: 1,
    },
  };
  for (const claim of [
    "Gate D Family Restaurant has tables available tonight.",
    "المطعم متاح للحجز اليوم.",
    "ئەم چێشتخانەیە ئەمشەو بەردەستە.",
  ]) {
    assert.throws(() => validateAiGateBProviderOutput({
      status: "ANSWER",
      answer: claim,
      items: [{ citationId: "marketplace_1", title: "Gate D", reason: claim }],
    }, context), AiGateBProviderError);
  }
});

test("AI Gate D Web assistant uses single-flight generation fencing and accessible states", () => {
  const source = read("features/ai/components/customer-discovery-assistant.tsx");
  assert.match(source, /generationRef/);
  assert.match(source, /generationRef\.current !== generation/);
  assert.match(source, /abortRef\.current !== controller/);
  assert.match(source, /navigator !== "undefined" && !navigator\.onLine/);
  assert.match(source, /credentials: "same-origin"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-atomic="true"/);
  assert.match(source, /resultRef\.current\?\.focus/);
  assert.doesNotMatch(source, /GEMINI_API_KEY|generativelanguage|gemini-3\.6/);
});

test("AI Gate D client and mobile bundles do not contain Gemini secrets or direct provider calls", () => {
  const clientFiles = [
    "features/ai/components/customer-discovery-assistant.tsx",
    "app/customer/assistant/page.tsx",
    "apps/mobile/src/screens/rezno-ai-coming-soon-screen.tsx",
    "apps/mobile/src/components/mobile-chrome.tsx",
    "apps/mobile/src/config/api-base-url.ts",
  ];
  const combined = clientFiles.map(read).join("\n");
  assert.doesNotMatch(combined, /GEMINI_API_KEY|x-goog-api-key|generativelanguage\.googleapis\.com|createGeminiGateBProvider/);
  assert.match(read("apps/mobile/src/screens/rezno-ai-coming-soon-screen.tsx"), /EXPO_PUBLIC_REZNO_AI_ENABLED/);
});

test("AI Gate D capture contract covers required states, languages, viewports, and themes", () => {
  assertAiGateDCaptureContract();
  assert.equal(aiGateDCaptureSpecs.length, 8);
  assert.deepEqual([...new Set(aiGateDCaptureSpecs.map((spec) => spec.expectedState))].sort(), [
    "disabled",
    "loading",
    "no-results",
    "rate-limited",
    "refusal",
    "success",
    "timeout",
    "unavailable",
  ]);
  assert.deepEqual([...new Set(aiGateDCaptureSpecs.map((spec) => spec.locale))].sort(), ["ar", "ckb", "en"]);
  assert.deepEqual([...new Set(aiGateDCaptureSpecs.map((spec) => spec.viewport))].sort(), ["compact", "desktop"]);
  assert.equal(aiGateDCaptureSpecs.some((spec) => spec.theme === "dark"), true);
  assert.equal(aiGateDCaptureSpecs.some((spec) => spec.theme === "light"), true);
});

test("AI Gate D visual evidence manifest, PNGs, and human review are complete", async () => {
  const manifestFile = "docs/ai/baselines/gate-d-baselines.json";
  const reviewFile = "docs/ai/gate-d-baseline-human-review.json";
  assert.equal(existsSync(path.join(repoRoot, manifestFile)), true, "Gate D visual manifest must exist.");
  const manifest = readJson<AiGateDVisualManifest>(manifestFile);
  validateAiGateDVisualManifest(manifest);
  assert.equal(manifest.sourceSha.length, 40);
  assert.equal(manifest.captures.length, aiGateDCaptureSpecs.length);
  for (const capture of manifest.captures) {
    const bytes = readFileSync(path.join(repoRoot, capture.file));
    await validateAiGateDVisualCapture(capture, bytes);
  }
  const review = readJson<AiGateDHumanReview>(reviewFile);
  validateAiGateDHumanReview(manifest, review);
});

test("AI Gate D visual validator rejects broken evidence", async () => {
  const jpeg = await sharp({
    create: {
      background: "white",
      channels: 3,
      height: 20,
      width: 20,
    },
  }).jpeg().toBuffer();
  await assert.rejects(() => inspectAiGateDPng(jpeg));
  const blankPng = await sharp({
    create: {
      background: "white",
      channels: 3,
      height: 100,
      width: 100,
    },
  }).png().toBuffer();
  const blankImage = await inspectAiGateDPng(blankPng);
  await assert.rejects(() => validateAiGateDVisualCapture({
    dom: validDom(),
    expectedState: "success",
    file: "blank.png",
    image: blankImage,
    locale: "en",
    direction: "ltr",
    providerRequestCount: 0,
    reviewPrompt: "This intentionally blank capture should be rejected by entropy.",
    route: "/customer/assistant",
    theme: "light",
    viewport: "desktop",
    viewportHeight: 100,
    viewportWidth: 100,
  }, blankPng));
  assert.throws(() => validateAiGateDDomEvidence(validDom({ horizontalOverflow: 1 })));
  assert.throws(() => validateAiGateDDomEvidence(validDom({ developmentOverlayCount: 1 })));
  assert.throws(() => validateAiGateDDomEvidence(validDom({ requiredTextCounts: { "Missing": 0 } })));
  assert.throws(() => validateAiGateDDomEvidence(validDom({ forbiddenTextCounts: { "Skeleton": 1 } })));
});

test("AI Gate D documentation, CI, and migrations preserve the closure boundary", () => {
  const canonical = read("docs/ai/ai-canonical-scope.md");
  const docs = [
    canonical,
    read("docs/ai/gate-d-canonical-closure-scope.md"),
    read("docs/ai/gate-d-test-plan.md"),
    read("docs/ai/gate-d-red-team-results.md"),
    read("docs/ai/gate-d-accessibility-review.md"),
    read("docs/ai/gate-d-browser-device-evidence.md"),
    read("docs/ai/gate-d-security-privacy-review.md"),
    read("docs/ai/gate-d-outage-rollback-drills.md"),
    read("docs/ai/gate-d-rollout-rollback-checklist.md"),
    read("docs/ai/gate-d-production-readiness-gaps.md"),
    read("docs/ai/gate-d-final-closure-evidence.md"),
  ].join("\n");
  assert.match(canonical, /Gate A: `CLOSED`/);
  assert.match(canonical, /Gate B: `CLOSED`/);
  assert.match(canonical, /Gate C: `CLOSED`/);
  assert.match(canonical, /Gate C merge: `0374452b33cdeffe491e7f102d05ca271463adde`/);
  assert.match(canonical, /Gate D: `ACTIVE — AUTHOR IMPLEMENTATION`/);
  assert.match(docs, /Customer discovery only/);
  assert.match(docs, /read-only/);
  assert.match(docs, /providerRequestCount=0/);
  assert.match(docs, /NOT_RUN — LOCAL SECRET UNAVAILABLE|provider requests used: [0-3]/);
  assert.match(docs, /Stage 6 runtime: `DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`/);
  assert.match(docs, /Migration 52: `NOT CREATED`/);
  assert.doesNotMatch(docs, /(?:^|\n)#+\s*AI Gate E\b|Gate E:\s*`/i);
  const packageJson = read("package.json");
  const ci = read(".github/workflows/marketplace-pr-ci.yml");
  assert.match(packageJson, /"test:ai-gate-d"/);
  assert.match(ci, /Run AI Gate D closure contracts/);
  assert.equal(readdirSync(path.join(repoRoot, "prisma/migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length, 51);
  assert.equal(existsSync(path.join(repoRoot, "prisma/migrations/20260728000000_ai_gate_d")), false);
  assert.equal(AI_GATE_D_MAX_LIVE_PROVIDER_REQUESTS, 3);
});
