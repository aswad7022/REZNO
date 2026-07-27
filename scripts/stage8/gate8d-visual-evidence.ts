import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import sharp from "sharp";

import type {
  Gate8dBrowser,
  Gate8dViewport,
} from "./gate8d-capture-contract";
import type {
  Gate8cExpectedState,
  Gate8cLocale,
  Gate8cTheme,
} from "./gate8c-visual-evidence";
import type { Gate8cVisualRole } from "./gate8c-visual-fixture";

export const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export interface Gate8dProductionAttestation {
  schemaVersion: 1;
  gitSha: string;
  buildId: string;
  nodeEnv: "production";
  hostname: "127.0.0.1";
  port: number;
  pid: number;
  ownedByHarness: true;
  buildCommand: readonly ["npm", "run", "build"];
  startCommand: readonly string[];
  captureScriptSha256: string;
  harnessScriptSha256: string;
  buildManifestSha256: string;
}

export interface Gate8dDomEvidence {
  urlPath: string;
  locale: Gate8cLocale;
  direction: "ltr" | "rtl";
  theme: Gate8cTheme;
  expectedState: Gate8cExpectedState;
  stateMarkerCount: number;
  requiredLandmarkCounts: Record<string, number>;
  forbiddenStateCounts: Record<string, number>;
  requiredTextCounts: Record<string, number>;
  forbiddenTextCounts: Record<string, number>;
  horizontalOverflow: number;
  runningAnimations: number;
  consoleErrors: string[];
  pageErrors: string[];
  failedResources: string[];
}

export interface Gate8dAccessibilityEvidence {
  mainLandmarks: number;
  headingOnes: number;
  unnamedInteractiveControls: number;
  undersizedTouchTargets: number;
  undersizedTouchTargetSamples: string[];
  duplicateIds: number;
  skipLinkTargetExists: boolean;
  focusVisibleSupported: boolean;
  reducedMotionRunningAnimations: number;
}

export interface Gate8dPerformanceEvidence {
  cls: number;
  fcpMs: number;
  lcpMs: number | null;
  loadMs: number;
  longTasks: number;
  budgets: {
    clsMax: 0.1;
    fcpMaxMs: 3000;
    lcpMaxMs: 4000;
    loadMaxMs: 5000;
    longTasksMax: 5;
  };
}

export interface Gate8dImageEvidence {
  format: "png";
  width: number;
  height: number;
  sha256: string;
  entropy: number;
  channels: number;
  metadataFields: string[];
}

export interface Gate8dCaptureEvidence {
  file: string;
  route: string;
  browser: Gate8dBrowser;
  browserVersion: string;
  viewport: Gate8dViewport;
  viewportWidth: number;
  viewportHeight: number;
  zoom: 1 | 2;
  locale: Gate8cLocale;
  direction: "ltr" | "rtl";
  theme: Gate8cTheme;
  role: Gate8cVisualRole;
  expectedState: Gate8cExpectedState;
  families: string[];
  dom: Gate8dDomEvidence;
  accessibility: Gate8dAccessibilityEvidence;
  performance: Gate8dPerformanceEvidence;
  image: Gate8dImageEvidence;
  semanticDigest: string;
  reviewPrompt: string;
}

export interface Gate8dHumanReview {
  schemaVersion: 1;
  reviewer: string;
  independentFromCapture: true;
  reviewedHeadSha: string;
  reviewedAt: string;
  captures: Array<{
    file: string;
    decision: "PASS";
    notes: string;
    sha256: string;
  }>;
}

export interface Gate8dVisualManifest {
  schemaVersion: 1;
  gate: "8D";
  environment: "owned Next.js production build/server";
  sourceSha: string;
  productionAttestation: Gate8dProductionAttestation;
  capturePolicy: {
    reducedMotion: "reduce";
    animationPolicy: "no running non-progress animation at capture";
    sensitiveData: "deterministic fixtures.example identities with null phones";
    zoomEquivalence: "half CSS viewport dimensions with 2x reflow contract";
  };
  determinism: {
    passes: 2;
    identicalCaptureCount: number;
    fixtureFingerprint: string;
  };
  captures: Gate8dCaptureEvidence[];
  humanReview: {
    status: "PENDING" | "PASS";
    record: string;
  };
}

export const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

export async function inspectGate8dPng(
  bytes: Buffer,
): Promise<Gate8dImageEvidence> {
  assert.equal(
    bytes.subarray(0, PNG_SIGNATURE.length).compare(PNG_SIGNATURE),
    0,
    "Visual evidence must have PNG magic bytes.",
  );
  const image = sharp(bytes, { failOn: "error" });
  const metadata = await image.metadata();
  assert.equal(metadata.format, "png");
  assert.ok(metadata.width && metadata.height);
  const stats = await image.stats();
  const metadataFields = [
    metadata.exif ? "exif" : "",
    metadata.icc ? "icc" : "",
    metadata.xmp ? "xmp" : "",
    metadata.iptc ? "iptc" : "",
  ].filter(Boolean);
  return {
    format: "png",
    width: metadata.width,
    height: metadata.height,
    sha256: sha256(bytes),
    entropy: stats.entropy,
    channels: stats.channels.length,
    metadataFields,
  };
}

export function validateGate8dDom(evidence: Gate8dDomEvidence) {
  assert.equal(evidence.stateMarkerCount > 0, true);
  assert.equal(evidence.horizontalOverflow, 0);
  assert.equal(evidence.runningAnimations, 0);
  assert.deepEqual(evidence.consoleErrors, []);
  assert.deepEqual(evidence.pageErrors, []);
  assert.deepEqual(evidence.failedResources, []);
  assert.equal(Object.values(evidence.requiredLandmarkCounts).every(Boolean), true);
  assert.equal(Object.values(evidence.requiredTextCounts).every(Boolean), true);
  assert.equal(Object.values(evidence.forbiddenStateCounts).every((n) => n === 0), true);
  assert.equal(Object.values(evidence.forbiddenTextCounts).every((n) => n === 0), true);
}

export function validateGate8dAccessibility(
  evidence: Gate8dAccessibilityEvidence,
) {
  assert.equal(evidence.mainLandmarks, 1);
  assert.equal(evidence.headingOnes, 1);
  assert.equal(evidence.unnamedInteractiveControls, 0);
  assert.equal(evidence.undersizedTouchTargets, 0);
  assert.deepEqual(evidence.undersizedTouchTargetSamples, []);
  assert.equal(evidence.duplicateIds, 0);
  assert.equal(evidence.skipLinkTargetExists, true);
  assert.equal(evidence.focusVisibleSupported, true);
  assert.equal(evidence.reducedMotionRunningAnimations, 0);
}

export function validateGate8dPerformance(
  evidence: Gate8dPerformanceEvidence,
) {
  assert.ok(evidence.cls <= evidence.budgets.clsMax);
  assert.ok(evidence.fcpMs <= evidence.budgets.fcpMaxMs);
  if (evidence.lcpMs !== null) {
    assert.ok(evidence.lcpMs <= evidence.budgets.lcpMaxMs);
  }
  assert.ok(evidence.loadMs <= evidence.budgets.loadMaxMs);
  assert.ok(evidence.longTasks <= evidence.budgets.longTasksMax);
}

export async function validateGate8dCapture(
  capture: Gate8dCaptureEvidence,
  bytes: Buffer,
) {
  validateGate8dDom(capture.dom);
  validateGate8dAccessibility(capture.accessibility);
  validateGate8dPerformance(capture.performance);
  const image = await inspectGate8dPng(bytes);
  assert.deepEqual(image, capture.image);
  assert.equal(image.width, capture.viewportWidth);
  assert.equal(image.height, capture.viewportHeight);
  assert.ok(image.entropy > 2, "Screenshot is blank or near-uniform.");
  assert.deepEqual(image.metadataFields, []);
}

export function validateGate8dHumanReview(
  manifest: Gate8dVisualManifest,
  review: Gate8dHumanReview,
) {
  assert.equal(review.independentFromCapture, true);
  assert.equal(review.reviewedHeadSha, manifest.sourceSha);
  assert.equal(review.captures.length, manifest.captures.length);
  const reviewed = new Map(review.captures.map((entry) => [entry.file, entry]));
  for (const capture of manifest.captures) {
    const entry = reviewed.get(capture.file);
    assert.ok(entry, `Missing human review for ${capture.file}`);
    assert.equal(entry.decision, "PASS");
    assert.equal(entry.sha256, capture.image.sha256);
    assert.ok(entry.notes.length >= 40);
  }
}
