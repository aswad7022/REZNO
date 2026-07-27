import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  inspectPng,
  validateGate8cCapture,
  type Gate8cCaptureEvidence,
} from "../../../scripts/stage8/gate8c-visual-evidence";

const width = 390;
const height = 844;
const file = "docs/stage8/baselines/gate8c/fixture.png";

async function representativePng(
  imageWidth = width,
  imageHeight = height,
) {
  return sharp(
    Buffer.from(`
      <svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="background" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="#111827"/>
            <stop offset="1" stop-color="#1f2937"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#background)"/>
        <rect x="20" y="24" width="${imageWidth - 40}" height="72" rx="14" fill="#f59e0b"/>
        <rect x="20" y="120" width="${imageWidth - 40}" height="240" rx="18" fill="#f8fafc"/>
        <rect x="36" y="148" width="${imageWidth - 72}" height="24" rx="8" fill="#334155"/>
        <rect x="36" y="190" width="${Math.max(40, imageWidth - 130)}" height="16" rx="6" fill="#94a3b8"/>
        <rect x="20" y="388" width="${imageWidth - 40}" height="400" rx="18" fill="#0f766e"/>
        <text x="36" y="68" fill="#111827" font-size="24">REZNO Gate 8C</text>
      </svg>
    `),
  )
    .png()
    .toBuffer();
}

async function validEvidence() {
  const bytes = await representativePng();
  const inspected = await inspectPng(bytes);
  const forbiddenStates = [
    {
      selector: '[aria-busy="true"]',
      description: "loading state on a final capture",
    },
    {
      selector: "nextjs-portal",
      description: "Next.js development overlay",
    },
  ];
  const evidence: Gate8cCaptureEvidence = {
    file,
    route: "/admin",
    viewport: "compact",
    viewportWidth: width,
    viewportHeight: height,
    locale: "en",
    direction: "ltr",
    theme: "dark",
    role: "root-super-admin",
    expectedState: "final",
    requiredLandmarks: [
      { selector: "main#main-content" },
      { selector: "h1", textIncludes: "REZNO" },
    ],
    forbiddenStates,
    expectedMime: "image/png",
    expectedFormat: "png",
    actualWidth: inspected.width,
    actualHeight: inspected.height,
    sha256: inspected.sha256,
    families: ["dense-data"],
    visualMetrics: inspected.metrics,
    preflight: {
      pathname: "/admin",
      route: "/admin",
      locale: "en",
      direction: "ltr",
      theme: "dark",
      expectedState: "final",
      viewport: { width, height },
      documentReadyState: "complete",
      fontsReady: true,
      requiredLandmarks: [
        { selector: "main#main-content", count: 1 },
        { selector: "h1", count: 1, matchedText: true },
      ],
      forbiddenStates: forbiddenStates.map(({ selector }) => ({
        selector,
        count: 0,
      })),
      horizontalOverflowPx: 0,
      mainWidthRatio: 0.92,
      runningAnimations: 0,
      consoleErrors: [],
      pageErrors: [],
      failedResources: [],
      responseErrors: [],
      sensitiveTextMatches: [],
      nonSyntheticEmails: [],
      screenshotScope: "viewport",
    },
    humanReview: {
      result: "PASS",
      reviewedAt: "2026-07-27",
      notes: "Reviewed as complete and viewport-contained.",
    },
  };
  return { bytes, evidence };
}

test("Gate 8C evidence validator accepts a complete PNG and page preflight", async () => {
  const { bytes, evidence } = await validEvidence();
  await validateGate8cCapture(evidence, bytes);
});

test("Gate 8C evidence validator rejects JPEG bytes with a .png filename", async () => {
  const { evidence } = await validEvidence();
  const bytes = await sharp(await representativePng()).jpeg().toBuffer();
  await assert.rejects(
    validateGate8cCapture(evidence, bytes),
    /not a PNG by magic bytes/,
  );
});

test("Gate 8C evidence validator rejects a blank image", async () => {
  const { evidence } = await validEvidence();
  const bytes = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#ffffff",
    },
  })
    .png()
    .toBuffer();
  const inspected = await inspectPng(bytes);
  const blankEvidence = {
    ...evidence,
    sha256: inspected.sha256,
    visualMetrics: inspected.metrics,
  };
  await assert.rejects(
    validateGate8cCapture(blankEvidence, bytes),
    /blank, near-uniform, or unintentionally narrow/,
  );
});

test("Gate 8C evidence validator rejects screenshot dimensions that differ from the manifest", async () => {
  const { evidence } = await validEvidence();
  const bytes = await representativePng(width + 1, height);
  const inspected = await inspectPng(bytes);
  const wrongDimensions = {
    ...evidence,
    actualWidth: width + 1,
    sha256: inspected.sha256,
    visualMetrics: inspected.metrics,
  };
  await assert.rejects(
    validateGate8cCapture(wrongDimensions, bytes),
    /dimensions do not match/,
  );
});

test("Gate 8C evidence validator rejects a final state that still contains a skeleton", async () => {
  const { bytes, evidence } = await validEvidence();
  const finalWithSkeleton = structuredClone(evidence);
  finalWithSkeleton.forbiddenStates.push({
    selector: '[data-slot="skeleton"]',
    description: "skeleton on a final capture",
  });
  finalWithSkeleton.preflight.forbiddenStates.push({
    selector: '[data-slot="skeleton"]',
    count: 2,
  });
  await assert.rejects(
    validateGate8cCapture(finalWithSkeleton, bytes),
    /Forbidden page state is present/,
  );
});

test("Gate 8C evidence validator rejects a compact page collapsed into a narrow strip", async () => {
  const { bytes, evidence } = await validEvidence();
  const narrow = structuredClone(evidence);
  narrow.preflight.mainWidthRatio = 0.24;
  await assert.rejects(
    validateGate8cCapture(narrow, bytes),
    /collapsed into a narrow strip/,
  );
});

test("Gate 8C evidence validator rejects a development overlay", async () => {
  const { bytes, evidence } = await validEvidence();
  const overlay = structuredClone(evidence);
  overlay.preflight.forbiddenStates.find(
    ({ selector }) => selector === "nextjs-portal",
  )!.count = 1;
  await assert.rejects(
    validateGate8cCapture(overlay, bytes),
    /Next.js development overlay/,
  );
});

test("Gate 8C evidence validator rejects an automatically pending human review", async () => {
  const { bytes, evidence } = await validEvidence();
  evidence.humanReview = {
    result: "PENDING",
    reviewedAt: "",
    notes: "Pending human review.",
  };

  await assert.rejects(
    validateGate8cCapture(evidence, bytes),
    /Human visual review is not documented/,
  );
});

test("Gate 8C evidence validator rejects route, locale, and state manifest mismatches", async (t) => {
  const { bytes, evidence } = await validEvidence();

  await t.test("route mismatch", async () => {
    const mismatch = structuredClone(evidence);
    mismatch.preflight.route = "/admin/access";
    await assert.rejects(
      validateGate8cCapture(mismatch, bytes),
      /route does not match/,
    );
  });
  await t.test("locale mismatch", async () => {
    const mismatch = structuredClone(evidence);
    mismatch.preflight.locale = "ar";
    await assert.rejects(
      validateGate8cCapture(mismatch, bytes),
      /locale does not match/,
    );
  });
  await t.test("state mismatch", async () => {
    const mismatch = structuredClone(evidence);
    mismatch.preflight.expectedState = "loading";
    await assert.rejects(
      validateGate8cCapture(mismatch, bytes),
      /state does not match/,
    );
  });
});
