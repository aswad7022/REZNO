import { createHash } from "node:crypto";

import sharp from "sharp";

import {
  gate8cCanonicalJson,
  gate8cSha256,
  type Gate8cProductionAttestation,
} from "./gate8c-production-harness";

export const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export type Gate8cLocale = "ar" | "ckb" | "en";
export type Gate8cDirection = "ltr" | "rtl";
export type Gate8cTheme = "dark" | "light";
export type Gate8cViewport = "compact" | "desktop";
export type Gate8cExpectedState =
  | "dialog-open"
  | "empty"
  | "error"
  | "final"
  | "loading"
  | "permission-denied";

export interface Gate8cSelectorContract {
  selector: string;
  minCount?: number;
  textIncludes?: string;
  requireVisible?: boolean;
  requireInViewport?: boolean;
}

export interface Gate8cForbiddenSelectorContract {
  selector: string;
  description: string;
  viewportOnly?: boolean;
}

export interface Gate8cVisibleTextContract {
  selector: string;
  text: string;
  language: Gate8cLocale | "technical";
  requireInViewport?: boolean;
}

export interface Gate8cForbiddenTextContract {
  selector: string;
  text: string;
  language: Gate8cLocale;
  viewportOnly?: boolean;
}

export interface Gate8cStateContract {
  marker: Gate8cSelectorContract;
  forbiddenInViewport?: Gate8cForbiddenSelectorContract[];
}

export interface Gate8cPagePreflight {
  pathname: string;
  route: string;
  locale: string;
  direction: string;
  theme: string;
  observedState: string;
  viewport: { width: number; height: number };
  localeEvidence: {
    browserLocale: string;
    cookieLocale: Gate8cLocale;
    fixtureLanguage: string;
    fixtureUserId: string;
  };
  documentReadyState: string;
  fontsReady: boolean;
  requiredLandmarks: Array<{
    selector: string;
    count: number;
    matchedText?: boolean;
    visibleCount: number;
    inViewportCount: number;
  }>;
  forbiddenStates: Array<{
    selector: string;
    count: number;
    inViewportCount: number;
  }>;
  requiredVisibleText: Array<{
    selector: string;
    text: string;
    count: number;
    visibleCount: number;
    inViewportCount: number;
  }>;
  forbiddenVisibleText: Array<{
    selector: string;
    text: string;
    count: number;
    visibleCount: number;
    inViewportCount: number;
  }>;
  stateEvidence: {
    marker: string;
    count: number;
    visibleCount: number;
    inViewportCount: number;
    conflictingStates: Array<{
      selector: string;
      count: number;
      inViewportCount: number;
    }>;
  };
  horizontalOverflowPx: number;
  mainWidthRatio: number;
  runningAnimations: number;
  consoleErrors: string[];
  pageErrors: string[];
  failedResources: string[];
  responseErrors: string[];
  sensitiveTextMatches: string[];
  nonSyntheticEmails: string[];
  realisticPhoneMatches: string[];
  visibleTextSha256: string;
  screenshotScope: "viewport";
}

export interface Gate8cVisualMetrics {
  entropy: number;
  maxChannelStandardDeviation: number;
  approximateUniqueColors: number;
  contentWidthRatio: number;
  contentHeightRatio: number;
  contentPixelRatio: number;
  edgeDensity: number;
}

export interface Gate8cCaptureEvidence {
  file: string;
  route: string;
  viewport: Gate8cViewport;
  viewportWidth: number;
  viewportHeight: number;
  locale: Gate8cLocale;
  direction: Gate8cDirection;
  theme: Gate8cTheme;
  role: string;
  expectedState: Gate8cExpectedState;
  requiredLandmarks: Gate8cSelectorContract[];
  forbiddenStates: Gate8cForbiddenSelectorContract[];
  requiredVisibleText: Gate8cVisibleTextContract[];
  forbiddenVisibleText: Gate8cForbiddenTextContract[];
  languageExceptions: string[];
  stateContract: Gate8cStateContract;
  expectedMime: "image/png";
  expectedFormat: "png";
  actualWidth: number;
  actualHeight: number;
  sha256: string;
  families: string[];
  visualMetrics: Gate8cVisualMetrics;
  preflight: Gate8cPagePreflight;
  humanReview: {
    result: "PENDING" | "PASS";
    reviewedAt: string;
    notes: string;
  };
}

export interface Gate8cVisualManifest {
  gate: "8C";
  baseSha: string;
  capturedAt: string;
  environment: string;
  productionAttestation: Gate8cProductionAttestation;
  determinism: {
    passes: 2;
    fixtureFingerprint: string;
    identicalCaptureCount: number;
    identicalPreflightCount: number;
    semanticManifestSha256: string;
  };
  capturePolicy: {
    browser: string;
    fixtures: string;
    motion: string;
    screenshotScope: string;
    sensitiveData: string;
    localeEvidence: string;
    productionProvenance: string;
    determinism: string;
    humanReview: string;
  };
  captures: Gate8cCaptureEvidence[];
}

function normalizeGate8cDigits(value: string) {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const eastern = "۰۱۲۳۴۵۶۷۸۹";
  return [...value]
    .map((character) => {
      const arabicIndex = arabic.indexOf(character);
      if (arabicIndex >= 0) return String(arabicIndex);
      const easternIndex = eastern.indexOf(character);
      if (easternIndex >= 0) return String(easternIndex);
      return character;
    })
    .join("");
}

export function inspectGate8cVisibleTextPrivacy(text: string) {
  const normalized = normalizeGate8cDigits(text);
  const sensitivePatterns = [
    /postgresql:\/\/\S+/giu,
    /session_token\s*=\s*\S+/giu,
    /Bearer\s+[A-Za-z0-9._~+/=-]+/giu,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/giu,
    /\b(?:token|cookie|secret)\s*[:=]\s*[A-Za-z0-9._~+/=-]{12,}\b/giu,
  ];
  const sensitiveTextMatches = sensitivePatterns.flatMap(
    (pattern) => normalized.match(pattern) ?? [],
  );
  const emails =
    normalized.match(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
    ) ?? [];
  const nonSyntheticEmails = emails.filter(
    (email) => !email.toLowerCase().endsWith("@fixtures.example"),
  );
  const realisticPhoneMatches = [
    ...new Set(
      [
        ...(normalized.match(
          /(?:^|[^\w])\+\d(?:[\s().-]*\d){7,14}(?=$|[^\w])/gu,
        ) ?? []),
        ...(normalized.match(
          /(?:^|[^\d])(?:964)?0?7[3-9]\d{8}(?=$|[^\d])/gu,
        ) ?? []),
      ].map((match) => match.replace(/\D/gu, "")),
    ),
  ];
  return {
    nonSyntheticEmails,
    realisticPhoneMatches,
    sensitiveTextMatches,
  };
}

function roundMetric(value: number) {
  return Number(value.toFixed(4));
}

function pixelDistance(
  pixels: Uint8Array,
  offset: number,
  reference: readonly number[],
) {
  return Math.max(
    Math.abs((pixels[offset] ?? 0) - (reference[0] ?? 0)),
    Math.abs((pixels[offset + 1] ?? 0) - (reference[1] ?? 0)),
    Math.abs((pixels[offset + 2] ?? 0) - (reference[2] ?? 0)),
  );
}

export async function inspectPng(
  bytes: Buffer,
): Promise<{
  format: string;
  width: number;
  height: number;
  sha256: string;
  metrics: Gate8cVisualMetrics;
}> {
  if (
    bytes.length < PNG_SIGNATURE.length ||
    !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new Error("Visual evidence is not a PNG by magic bytes.");
  }

  const image = sharp(bytes, { failOn: "error" });
  const metadata = await image.metadata();
  if (metadata.format !== "png" || !metadata.width || !metadata.height) {
    throw new Error("Visual evidence is not a decodable PNG.");
  }

  const stats = await image.stats();
  const { data, info } = await image
    .clone()
    .resize(96, 96, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const width = info.width;
  const height = info.height;
  const cornerOffsets = [
    0,
    (width - 1) * channels,
    (height - 1) * width * channels,
    (height * width - 1) * channels,
  ];
  const background = [0, 1, 2].map((channel) => {
    const values = cornerOffsets
      .map((offset) => data[offset + channel] ?? 0)
      .sort((left, right) => left - right);
    return Math.round(((values[1] ?? 0) + (values[2] ?? 0)) / 2);
  });

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let contentPixels = 0;
  let edges = 0;
  let edgeComparisons = 0;
  const colors = new Set<string>();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      colors.add(`${red >> 3}:${green >> 3}:${blue >> 3}`);
      if (pixelDistance(data, offset, background) >= 14) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        contentPixels += 1;
      }
      if (x > 0) {
        edgeComparisons += 1;
        if (
          pixelDistance(data, offset, [
            data[offset - channels] ?? 0,
            data[offset - channels + 1] ?? 0,
            data[offset - channels + 2] ?? 0,
          ]) >= 18
        ) {
          edges += 1;
        }
      }
      if (y > 0) {
        edgeComparisons += 1;
        const previousRow = offset - width * channels;
        if (
          pixelDistance(data, offset, [
            data[previousRow] ?? 0,
            data[previousRow + 1] ?? 0,
            data[previousRow + 2] ?? 0,
          ]) >= 18
        ) {
          edges += 1;
        }
      }
    }
  }

  const contentWidth = maxX >= minX ? maxX - minX + 1 : 0;
  const contentHeight = maxY >= minY ? maxY - minY + 1 : 0;
  const maxChannelStandardDeviation = Math.max(
    ...stats.channels.slice(0, 3).map((channel) => channel.stdev),
  );

  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    metrics: {
      entropy: roundMetric(stats.entropy),
      maxChannelStandardDeviation: roundMetric(maxChannelStandardDeviation),
      approximateUniqueColors: colors.size,
      contentWidthRatio: roundMetric(contentWidth / width),
      contentHeightRatio: roundMetric(contentHeight / height),
      contentPixelRatio: roundMetric(contentPixels / (width * height)),
      edgeDensity: roundMetric(edges / Math.max(1, edgeComparisons)),
    },
  };
}

function assertFiniteMetric(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} is not finite.`);
  }
}

export function validateGate8cPagePreflight(
  evidence: Pick<
    Gate8cCaptureEvidence,
    | "route"
    | "locale"
    | "direction"
    | "theme"
    | "expectedState"
    | "viewportWidth"
    | "viewportHeight"
    | "requiredLandmarks"
    | "forbiddenStates"
    | "requiredVisibleText"
    | "forbiddenVisibleText"
    | "stateContract"
    | "preflight"
  >,
) {
  const { preflight } = evidence;
  if (preflight.route !== evidence.route) {
    throw new Error("Preflight route does not match the manifest route.");
  }
  if (preflight.locale !== evidence.locale) {
    throw new Error("Preflight locale does not match the manifest locale.");
  }
  if (preflight.direction !== evidence.direction) {
    throw new Error("Preflight direction does not match the manifest direction.");
  }
  if (preflight.theme !== evidence.theme) {
    throw new Error("Preflight theme does not match the manifest theme.");
  }
  if (preflight.observedState !== evidence.expectedState) {
    throw new Error("Measured page state does not match the manifest state.");
  }
  if (
    preflight.viewport.width !== evidence.viewportWidth ||
    preflight.viewport.height !== evidence.viewportHeight
  ) {
    throw new Error("Preflight viewport does not match the manifest viewport.");
  }
  const readyStateValid =
    preflight.documentReadyState === "complete" ||
    (evidence.expectedState === "loading" &&
      ["interactive", "loading"].includes(preflight.documentReadyState));
  if (!readyStateValid || !preflight.fontsReady) {
    throw new Error("The page was captured before the document and fonts settled.");
  }
  if (preflight.screenshotScope !== "viewport") {
    throw new Error("Gate 8C evidence must use a viewport screenshot.");
  }
  const expectedFixtureLanguage =
    evidence.locale === "ar" ? "AR" : evidence.locale === "ckb" ? "KU" : "EN";
  const expectedBrowserLocale =
    evidence.locale === "ar"
      ? "ar-IQ"
      : evidence.locale === "ckb"
        ? "ckb-IQ"
        : "en-US";
  if (
    preflight.localeEvidence.cookieLocale !== evidence.locale ||
    preflight.localeEvidence.fixtureLanguage !== expectedFixtureLanguage ||
    preflight.localeEvidence.browserLocale !== expectedBrowserLocale ||
    !preflight.localeEvidence.fixtureUserId
  ) {
    throw new Error(
      "Route/session/fixture locale evidence does not match the visible locale.",
    );
  }
  if (preflight.horizontalOverflowPx > 1) {
    throw new Error("The page has unexpected horizontal overflow.");
  }
  if (preflight.mainWidthRatio < 0.72) {
    throw new Error("The primary content collapsed into a narrow strip.");
  }
  if (preflight.runningAnimations !== 0) {
    throw new Error("Animations were still running at capture time.");
  }
  for (const [label, errors] of [
    ["console", preflight.consoleErrors],
    ["page", preflight.pageErrors],
    ["resource", preflight.failedResources],
    ["response", preflight.responseErrors],
    ["sensitive-content", preflight.sensitiveTextMatches],
    ["non-synthetic-email", preflight.nonSyntheticEmails],
    ["realistic-phone", preflight.realisticPhoneMatches],
  ] as const) {
    if (errors.length > 0) {
      throw new Error(`Unacceptable ${label} errors were present at capture time.`);
    }
  }
  for (const required of evidence.requiredLandmarks) {
    const measured = preflight.requiredLandmarks.find(
      (entry) => entry.selector === required.selector,
    );
    if (!measured || measured.count < (required.minCount ?? 1)) {
      throw new Error(`Required landmark is missing: ${required.selector}`);
    }
    if (required.textIncludes && measured.matchedText !== true) {
      throw new Error(
        `Required landmark text is missing: ${required.selector}`,
      );
    }
    if (required.requireVisible !== false && measured.visibleCount < 1) {
      throw new Error(`Required landmark is not visible: ${required.selector}`);
    }
    if (required.requireInViewport && measured.inViewportCount < 1) {
      throw new Error(
        `Required landmark is outside the capture viewport: ${required.selector}`,
      );
    }
  }
  for (const forbidden of evidence.forbiddenStates) {
    const measured = preflight.forbiddenStates.find(
      (entry) => entry.selector === forbidden.selector,
    );
    const present = forbidden.viewportOnly
      ? (measured?.inViewportCount ?? 0) !== 0
      : (measured?.count ?? 0) !== 0;
    if (!measured || present) {
      throw new Error(`Forbidden page state is present: ${forbidden.description}`);
    }
  }
  for (const required of evidence.requiredVisibleText) {
    const measured = preflight.requiredVisibleText.find(
      (entry) =>
        entry.selector === required.selector && entry.text === required.text,
    );
    if (!measured || measured.visibleCount < 1) {
      throw new Error(
        `Required visible ${required.language} text is missing: ${required.text}`,
      );
    }
    if (required.requireInViewport !== false && measured.inViewportCount < 1) {
      throw new Error(
        `Required visible text is outside the capture viewport: ${required.text}`,
      );
    }
  }
  for (const forbidden of evidence.forbiddenVisibleText) {
    const measured = preflight.forbiddenVisibleText.find(
      (entry) =>
        entry.selector === forbidden.selector && entry.text === forbidden.text,
    );
    const present = forbidden.viewportOnly !== false
      ? (measured?.inViewportCount ?? 0) > 0
      : (measured?.visibleCount ?? 0) > 0;
    if (!measured || present) {
      throw new Error(
        `Forbidden visible ${forbidden.language} text is present: ${forbidden.text}`,
      );
    }
  }
  const state = preflight.stateEvidence;
  if (
    state.marker !== evidence.stateContract.marker.selector ||
    state.count < (evidence.stateContract.marker.minCount ?? 1) ||
    state.visibleCount < 1 ||
    (evidence.stateContract.marker.requireInViewport !== false &&
      state.inViewportCount < 1)
  ) {
    throw new Error(
      `Expected ${evidence.expectedState} state marker is not visibly proven.`,
    );
  }
  for (const forbidden of evidence.stateContract.forbiddenInViewport ?? []) {
    const measured = state.conflictingStates.find(
      (entry) => entry.selector === forbidden.selector,
    );
    if (!measured || measured.inViewportCount !== 0) {
      throw new Error(
        `Expected ${evidence.expectedState} state conflicts with ${forbidden.description}.`,
      );
    }
  }
  if (!/^[a-f0-9]{64}$/.test(preflight.visibleTextSha256)) {
    throw new Error("Visible page text fingerprint is missing.");
  }
}

export function semanticGate8cCaptureDigest(
  captures: Gate8cCaptureEvidence[],
) {
  return gate8cSha256(
    gate8cCanonicalJson(
      captures.map((capture) =>
        Object.fromEntries(
          Object.entries(capture).filter(([key]) => key !== "humanReview"),
        ),
      ),
    ),
  );
}

export async function validateGate8cCapture(
  evidence: Gate8cCaptureEvidence,
  bytes: Buffer,
) {
  validateGate8cPagePreflight(evidence);
  const inspected = await inspectPng(bytes);
  if (inspected.format !== evidence.expectedFormat) {
    throw new Error("Decoded image format does not match the manifest.");
  }
  if (
    inspected.width !== evidence.actualWidth ||
    inspected.height !== evidence.actualHeight ||
    inspected.width !== evidence.viewportWidth ||
    inspected.height !== evidence.viewportHeight
  ) {
    throw new Error("Decoded image dimensions do not match the manifest.");
  }
  if (inspected.sha256 !== evidence.sha256) {
    throw new Error("Visual evidence SHA-256 does not match the manifest.");
  }
  const metrics = inspected.metrics;
  for (const [label, value] of Object.entries(metrics)) {
    assertFiniteMetric(value, label);
  }
  if (
    metrics.entropy < 1.2 ||
    metrics.maxChannelStandardDeviation < 8 ||
    metrics.approximateUniqueColors < 32 ||
    metrics.contentPixelRatio < 0.01 ||
    metrics.contentWidthRatio < 0.65 ||
    metrics.contentHeightRatio < 0.35 ||
    metrics.edgeDensity < 0.002
  ) {
    throw new Error("Visual evidence is blank, near-uniform, or unintentionally narrow.");
  }
  for (const [key, measured] of Object.entries(metrics)) {
    const recorded =
      evidence.visualMetrics[key as keyof Gate8cVisualMetrics];
    if (Math.abs(Number(recorded) - Number(measured)) > 0.0001) {
      throw new Error(`Recorded visual metric does not match: ${key}`);
    }
  }
  if (
    evidence.humanReview.result !== "PASS" ||
    !evidence.humanReview.reviewedAt ||
    !evidence.humanReview.notes.trim()
  ) {
    throw new Error("Human visual review is not documented.");
  }
  return inspected;
}
