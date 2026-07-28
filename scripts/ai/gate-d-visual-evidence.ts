import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import sharp from "sharp";

import type {
  AiGateDExpectedState,
  AiGateDLocale,
  AiGateDTheme,
} from "./gate-d-capture-contract";

export const AI_GATE_D_PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export type AiGateDImageEvidence = {
  readonly format: "png";
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly entropy: number;
  readonly channels: number;
  readonly metadataFields: readonly string[];
};

export type AiGateDDomEvidence = {
  readonly route: "/customer/assistant";
  readonly locale: AiGateDLocale;
  readonly direction: "ltr" | "rtl";
  readonly theme: AiGateDTheme;
  readonly htmlLang: AiGateDLocale;
  readonly htmlDir: "ltr" | "rtl";
  readonly resolvedColorScheme: AiGateDTheme;
  readonly expectedState: AiGateDExpectedState;
  readonly mainLandmarks: number;
  readonly headingOnes: number;
  readonly requiredTextCounts: Record<string, number>;
  readonly forbiddenTextCounts: Record<string, number>;
  readonly horizontalOverflow: number;
  readonly developmentOverlayCount: number;
  readonly errorOverlayCount: number;
  readonly skeletonCount: number;
  readonly unnamedInteractiveControls: number;
  readonly undersizedTouchTargets: number;
  readonly runningAnimations: number;
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly failedResources: readonly string[];
};

export type AiGateDProductionAttestation = {
  readonly schemaVersion: 1;
  readonly sourceSha: string;
  readonly nodeEnv: "production";
  readonly hostname: "127.0.0.1";
  readonly ownedByHarness: true;
  readonly buildId: string;
  readonly providerRequestLimit: 3;
  readonly captureScriptSha256: string;
  readonly harnessMode: "owned-next-production-server";
};

export type AiGateDVisualCapture = {
  readonly file: string;
  readonly route: "/customer/assistant";
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly viewport: "compact" | "desktop";
  readonly locale: AiGateDLocale;
  readonly direction: "ltr" | "rtl";
  readonly theme: AiGateDTheme;
  readonly expectedState: AiGateDExpectedState;
  readonly providerRequestCount: 0;
  readonly image: AiGateDImageEvidence;
  readonly dom: AiGateDDomEvidence;
  readonly reviewPrompt: string;
};

export type AiGateDVisualManifest = {
  readonly schemaVersion: 1;
  readonly gate: "AI-D";
  readonly environment: "owned Next.js production build/server";
  readonly baseSha: string;
  readonly sourceSha: string;
  readonly gateCMergeSha: "0374452b33cdeffe491e7f102d05ca271463adde";
  readonly productionAttestation: AiGateDProductionAttestation;
  readonly capturePolicy: {
    readonly reducedMotion: "reduce";
    readonly provider: "mocked at REZNO API boundary; no Gemini call";
    readonly sensitiveData: "synthetic fixtures only";
  };
  readonly captures: readonly AiGateDVisualCapture[];
  readonly humanReview: {
    readonly status: "PASS";
    readonly record: "docs/ai/gate-d-baseline-human-review.json";
  };
};

export type AiGateDHumanReview = {
  readonly schemaVersion: 1;
  readonly reviewer: string;
  readonly independentFromCapture: true;
  readonly reviewedHeadSha: string;
  readonly reviewedAt: string;
  readonly captures: readonly {
    readonly file: string;
    readonly decision: "PASS";
    readonly notes: string;
    readonly sha256: string;
  }[];
};

export const aiGateDSha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

export async function inspectAiGateDPng(bytes: Buffer): Promise<AiGateDImageEvidence> {
  assert.equal(bytes.subarray(0, AI_GATE_D_PNG_SIGNATURE.length).compare(AI_GATE_D_PNG_SIGNATURE), 0);
  const image = sharp(bytes, { failOn: "error" });
  const metadata = await image.metadata();
  assert.equal(metadata.format, "png");
  assert.ok(metadata.width && metadata.height);
  const stats = await image.stats();
  return {
    format: "png",
    width: metadata.width,
    height: metadata.height,
    sha256: aiGateDSha256(bytes),
    entropy: stats.entropy,
    channels: stats.channels.length,
    metadataFields: [
      metadata.exif ? "exif" : "",
      metadata.icc ? "icc" : "",
      metadata.xmp ? "xmp" : "",
      metadata.iptc ? "iptc" : "",
    ].filter(Boolean),
  };
}

export function validateAiGateDDomEvidence(evidence: AiGateDDomEvidence) {
  assert.equal(evidence.route, "/customer/assistant");
  assert.equal(evidence.htmlLang, evidence.locale);
  assert.equal(evidence.htmlDir, evidence.direction);
  assert.equal(evidence.resolvedColorScheme, evidence.theme);
  assert.equal(evidence.mainLandmarks, 1);
  assert.equal(evidence.headingOnes, 1);
  assert.equal(evidence.horizontalOverflow, 0);
  assert.equal(evidence.developmentOverlayCount, 0);
  assert.equal(evidence.errorOverlayCount, 0);
  assert.equal(evidence.skeletonCount, 0);
  assert.equal(evidence.unnamedInteractiveControls, 0);
  assert.equal(evidence.undersizedTouchTargets, 0);
  assert.equal(evidence.runningAnimations, 0);
  assert.deepEqual(evidence.consoleErrors, []);
  assert.deepEqual(evidence.pageErrors, []);
  assert.deepEqual(evidence.failedResources, []);
  assert.equal(Object.values(evidence.requiredTextCounts).every((count) => count > 0), true);
  assert.equal(Object.values(evidence.forbiddenTextCounts).every((count) => count === 0), true);
}

export async function validateAiGateDVisualCapture(capture: AiGateDVisualCapture, bytes: Buffer) {
  validateAiGateDDomEvidence(capture.dom);
  assert.equal(capture.providerRequestCount, 0);
  const image = await inspectAiGateDPng(bytes);
  assert.deepEqual(image, capture.image);
  assert.equal(image.width, capture.viewportWidth);
  assert.equal(image.height, capture.viewportHeight);
  assert.ok(image.entropy >= 1.2, "Gate D screenshot is blank or near-uniform.");
  assert.deepEqual(image.metadataFields, []);
  assert.ok(capture.reviewPrompt.length >= 40);
}

export function validateAiGateDHumanReview(
  manifest: AiGateDVisualManifest,
  review: AiGateDHumanReview,
) {
  assert.equal(review.schemaVersion, 1);
  assert.equal(review.independentFromCapture, true);
  assert.equal(review.reviewedHeadSha, manifest.sourceSha);
  assert.equal(review.captures.length, manifest.captures.length);
  const entries = new Map(review.captures.map((entry) => [entry.file, entry]));
  for (const capture of manifest.captures) {
    const entry = entries.get(capture.file);
    assert.ok(entry, `Missing human review for ${capture.file}`);
    assert.equal(entry.decision, "PASS");
    assert.equal(entry.sha256, capture.image.sha256);
    assert.ok(entry.notes.length >= 40);
  }
}

export function validateAiGateDVisualManifest(manifest: AiGateDVisualManifest) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.gate, "AI-D");
  assert.equal(manifest.environment, "owned Next.js production build/server");
  assert.equal(manifest.gateCMergeSha, "0374452b33cdeffe491e7f102d05ca271463adde");
  assert.equal(manifest.productionAttestation.nodeEnv, "production");
  assert.equal(manifest.productionAttestation.hostname, "127.0.0.1");
  assert.equal(manifest.productionAttestation.ownedByHarness, true);
  assert.equal(manifest.productionAttestation.providerRequestLimit, 3);
  assert.equal(manifest.productionAttestation.sourceSha, manifest.sourceSha);
  assert.equal(manifest.capturePolicy.reducedMotion, "reduce");
  assert.equal(manifest.capturePolicy.provider, "mocked at REZNO API boundary; no Gemini call");
  assert.ok(manifest.captures.length >= 8);
  assert.equal(manifest.captures.every((capture) => capture.route === "/customer/assistant"), true);
  assert.equal(manifest.captures.every((capture) => capture.providerRequestCount === 0), true);
}
