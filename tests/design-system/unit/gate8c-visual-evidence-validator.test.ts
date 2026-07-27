import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  inspectGate8cVisibleTextPrivacy,
  inspectPng,
  validateGate8cCapture,
  type Gate8cCaptureEvidence,
} from "../../../scripts/stage8/gate8c-visual-evidence";
import {
  sealGate8cProductionAttestation,
  validateGate8cProductionAttestation,
  type Gate8cProductionAttestation,
} from "../../../scripts/stage8/gate8c-production-harness";

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
    requiredVisibleText: [
      {
        selector: "h1",
        text: "REZNO",
        language: "en",
        requireInViewport: true,
      },
      {
        selector: "main",
        text: "Gate 8C",
        language: "technical",
        requireInViewport: true,
      },
    ],
    forbiddenVisibleText: [
      {
        selector: "h1",
        text: "ريزنو",
        language: "ar",
        viewportOnly: true,
      },
    ],
    languageExceptions: ["REZNO", "Gate 8C"],
    stateContract: {
      marker: { selector: "main#main-content", requireInViewport: true },
    },
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
      observedState: "final",
      viewport: { width, height },
      localeEvidence: {
        browserLocale: "en-US",
        cookieLocale: "en",
        fixtureLanguage: "EN",
        fixtureUserId: "fixture-user",
      },
      documentReadyState: "complete",
      fontsReady: true,
      requiredLandmarks: [
        {
          selector: "main#main-content",
          count: 1,
          visibleCount: 1,
          inViewportCount: 1,
        },
        {
          selector: "h1",
          count: 1,
          matchedText: true,
          visibleCount: 1,
          inViewportCount: 1,
        },
      ],
      forbiddenStates: forbiddenStates.map(({ selector }) => ({
        selector,
        count: 0,
        inViewportCount: 0,
      })),
      requiredVisibleText: [
        {
          selector: "h1",
          text: "REZNO",
          count: 1,
          visibleCount: 1,
          inViewportCount: 1,
        },
        {
          selector: "main",
          text: "Gate 8C",
          count: 1,
          visibleCount: 1,
          inViewportCount: 1,
        },
      ],
      forbiddenVisibleText: [
        {
          selector: "h1",
          text: "ريزنو",
          count: 0,
          visibleCount: 0,
          inViewportCount: 0,
        },
      ],
      stateEvidence: {
        marker: "main#main-content",
        count: 1,
        visibleCount: 1,
        inViewportCount: 1,
        conflictingStates: [],
      },
      horizontalOverflowPx: 0,
      mainWidthRatio: 0.92,
      runningAnimations: 0,
      consoleErrors: [],
      pageErrors: [],
      failedResources: [],
      responseErrors: [],
      sensitiveTextMatches: [],
      nonSyntheticEmails: [],
      realisticPhoneMatches: [],
      visibleTextSha256: "a".repeat(64),
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
    inViewportCount: 2,
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
    mismatch.preflight.observedState = "loading";
    await assert.rejects(
      validateGate8cCapture(mismatch, bytes),
      /state does not match/,
    );
  });
});

test("Gate 8C evidence rejects HTML locale labels that contradict visible language", async (t) => {
  const { bytes, evidence } = await validEvidence();

  await t.test("lang=en with Arabic visible content", async () => {
    const mismatch = structuredClone(evidence);
    mismatch.preflight.requiredVisibleText[0]!.visibleCount = 0;
    mismatch.preflight.requiredVisibleText[0]!.inViewportCount = 0;
    mismatch.preflight.forbiddenVisibleText[0]!.count = 1;
    mismatch.preflight.forbiddenVisibleText[0]!.visibleCount = 1;
    mismatch.preflight.forbiddenVisibleText[0]!.inViewportCount = 1;
    await assert.rejects(
      validateGate8cCapture(mismatch, bytes),
      /Required visible en text is missing|Forbidden visible ar text/,
    );
  });

  await t.test("lang=ar with English visible content", async () => {
    const mismatch = structuredClone(evidence);
    mismatch.locale = "ar";
    mismatch.direction = "rtl";
    mismatch.preflight.locale = "ar";
    mismatch.preflight.direction = "rtl";
    mismatch.preflight.localeEvidence = {
      browserLocale: "ar-IQ",
      cookieLocale: "ar",
      fixtureLanguage: "AR",
      fixtureUserId: "fixture-user",
    };
    mismatch.requiredVisibleText[0]!.language = "ar";
    mismatch.requiredVisibleText[0]!.text = "مركز التحكم";
    mismatch.preflight.requiredVisibleText[0]!.text = "مركز التحكم";
    mismatch.preflight.requiredVisibleText[0]!.visibleCount = 0;
    mismatch.preflight.requiredVisibleText[0]!.inViewportCount = 0;
    await assert.rejects(
      validateGate8cCapture(mismatch, bytes),
      /Required visible ar text is missing/,
    );
  });

  await t.test("locale cookie and fixture language mismatch", async () => {
    const mismatch = structuredClone(evidence);
    mismatch.preflight.localeEvidence.cookieLocale = "ar";
    mismatch.preflight.localeEvidence.fixtureLanguage = "AR";
    await assert.rejects(
      validateGate8cCapture(mismatch, bytes),
      /Route\/session\/fixture locale evidence/,
    );
  });
});

test("Gate 8C evidence rejects realistic contact data and credentials", async (t) => {
  const { bytes, evidence } = await validEvidence();
  for (const [label, field, value] of [
    ["Latin-digit phone", "realisticPhoneMatches", "+9647501234567"],
    ["Arabic-digit phone", "realisticPhoneMatches", "+٩٦٤٧٥٠١٢٣٤٥٦٧"],
    ["non-fixture email", "nonSyntheticEmails", "person@example.com"],
    ["token", "sensitiveTextMatches", "Bearer fixture-token-value"],
  ] as const) {
    await t.test(label, async () => {
      const mismatch = structuredClone(evidence);
      mismatch.preflight[field].push(value);
      await assert.rejects(
        validateGate8cCapture(mismatch, bytes),
        /Unacceptable .* errors/,
      );
    });
  }
});

test("Gate 8C privacy inspection detects Latin/Arabic phones, non-fixture email, and credentials", () => {
  const inspected = inspectGate8cVisibleTextPrivacy(
    [
      "visual-fixture-owner@fixtures.example",
      "person@outside.example",
      "+9647501234567",
      "+٩٦٤٧٥٠١٢٣٤٥٦٨",
      "Bearer credential-shaped-token",
    ].join(" "),
  );
  assert.deepEqual(inspected.nonSyntheticEmails, ["person@outside.example"]);
  assert.equal(inspected.realisticPhoneMatches.length, 2);
  assert.equal(inspected.sensitiveTextMatches.length, 1);
});

test("Gate 8C empty evidence requires a measured empty marker without visible form, table, or loading state", async () => {
  const { bytes, evidence } = await validEvidence();
  const empty = structuredClone(evidence);
  empty.expectedState = "empty";
  empty.preflight.observedState = "empty";
  empty.stateContract = {
    marker: {
      selector: '[data-state="empty"]',
      requireInViewport: true,
    },
    forbiddenInViewport: [
      { selector: "form", description: "form" },
      { selector: "table", description: "table" },
      { selector: '[aria-busy="true"]', description: "loading" },
    ],
  };
  empty.preflight.stateEvidence = {
    marker: '[data-state="empty"]',
    count: 1,
    visibleCount: 1,
    inViewportCount: 1,
    conflictingStates: [
      { selector: "form", count: 1, inViewportCount: 1 },
      { selector: "table", count: 0, inViewportCount: 0 },
      { selector: '[aria-busy="true"]', count: 0, inViewportCount: 0 },
    ],
  };
  await assert.rejects(
    validateGate8cCapture(empty, bytes),
    /empty state conflicts with form/,
  );
});

function validProductionAttestation(): Gate8cProductionAttestation {
  return sealGate8cProductionAttestation({
    schemaVersion: 1,
    gitSha: "a".repeat(40),
    buildId: "gate8c-build",
    buildCommand: ["npm", "run", "build"],
    startCommand: [
      "/usr/local/bin/node",
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "43123",
    ],
    nodeEnv: "production",
    pid: 4321,
    port: 43123,
    hostname: "127.0.0.1",
    startedAt: "2026-07-27T15:00:00.000Z",
    ownedByHarness: true,
    ownershipCheck: "spawned-child-alive-and-exclusive-port",
    buildFiles: {
      ".next/BUILD_ID": "b".repeat(64),
      ".next/app-path-routes-manifest.json": "c".repeat(64),
      ".next/build-manifest.json": "d".repeat(64),
    },
    captureScriptSha256: "e".repeat(64),
    harnessScriptSha256: "f".repeat(64),
  });
}

test("Gate 8C production attestation rejects external, development, mismatched, incomplete, and tampered provenance", async (t) => {
  const expected = {
    buildId: "gate8c-build",
    captureScriptSha256: "e".repeat(64),
    gitSha: "a".repeat(40),
    harnessScriptSha256: "f".repeat(64),
    ownerPid: 4321,
  };
  validateGate8cProductionAttestation(validProductionAttestation(), expected);

  const cases: Array<[string, (value: Gate8cProductionAttestation) => void, RegExp]> = [
    [
      "external localhost",
      (value) => {
        value.ownedByHarness = false as true;
      },
      /ownership attestation/,
    ],
    [
      "next dev",
      (value) => {
        value.startCommand = ["next", "dev"];
      },
      /not served by next start/,
    ],
    [
      "BUILD_ID mismatch",
      (value) => {
        value.buildId = "other-build";
      },
      /BUILD_ID/,
    ],
    [
      "commit mismatch",
      (value) => {
        value.gitSha = "9".repeat(40);
      },
      /commit/,
    ],
    [
      "missing build hash",
      (value) => {
        delete value.buildFiles[".next/BUILD_ID"];
      },
      /missing build hash/,
    ],
    [
      "unowned PID",
      (value) => {
        value.pid = 9876;
      },
      /PID is not owned/,
    ],
    [
      "tampered attestation",
      (value) => {
        value.startedAt = "2026-07-27T16:00:00.000Z";
      },
      /integrity hash/,
    ],
  ];
  for (const [label, mutate, pattern] of cases) {
    await t.test(label, () => {
      const candidate = structuredClone(validProductionAttestation());
      mutate(candidate);
      assert.throws(
        () => validateGate8cProductionAttestation(candidate, expected),
        pattern,
      );
    });
  }
});
