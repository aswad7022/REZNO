import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  validateGate8cCapture,
  type Gate8cVisualManifest,
} from "./gate8c-visual-evidence";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const manifestPath = path.join(
  repoRoot,
  "docs/stage8/baselines/gate8c-baselines.json",
);
const reviewPath = path.join(
  repoRoot,
  "docs/stage8/gate8c-baseline-human-review.json",
);
const confirmation = process.env.GATE8C_VISUAL_REVIEW_CONFIRM;

interface HumanReviewRecord {
  gate: "8C";
  evidenceSetSha256: string;
  productionBuildId: string;
  reviewedAt: string;
  reviewer: "human";
  captures: Array<{
    file: string;
    sha256: string;
    result: "PASS";
    visibleLanguage: true;
    visibleState: true;
    viewportThemeDirection: true;
    noPii: true;
    noOverflowOrOverlay: true;
    notes: string;
  }>;
}

assert.equal(
  confirmation,
  "I_OPENED_AND_REVIEWED_ALL_24_GATE8C_PNGS",
  "Fresh per-image human review confirmation is required.",
);

async function main() {
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as Gate8cVisualManifest;
  const review = JSON.parse(
    await readFile(reviewPath, "utf8"),
  ) as HumanReviewRecord;

  assert.equal(review.gate, "8C");
  assert.equal(review.reviewer, "human");
  assert.match(review.reviewedAt, /^\d{4}-\d{2}-\d{2}$/u);
  assert.equal(
    review.evidenceSetSha256,
    manifest.determinism.semanticManifestSha256,
  );
  assert.equal(
    review.productionBuildId,
    manifest.productionAttestation.buildId,
  );
  assert.equal(manifest.captures.length, 24);
  assert.equal(review.captures.length, 24);
  assert.equal(
    new Set(review.captures.map((capture) => capture.file)).size,
    24,
  );
  assert.equal(
    new Set(review.captures.map((capture) => capture.notes.trim())).size,
    24,
    "Each PNG needs an image-specific human note.",
  );

  for (const capture of manifest.captures) {
    assert.equal(
      capture.humanReview.result,
      "PENDING",
      `${capture.file} is not awaiting a fresh review.`,
    );
    const reviewed = review.captures.find(
      (entry) => entry.file === capture.file,
    );
    assert.ok(reviewed, `${capture.file} lacks a human review record.`);
    assert.equal(reviewed.sha256, capture.sha256);
    assert.equal(reviewed.result, "PASS");
    assert.equal(reviewed.visibleLanguage, true);
    assert.equal(reviewed.visibleState, true);
    assert.equal(reviewed.viewportThemeDirection, true);
    assert.equal(reviewed.noPii, true);
    assert.equal(reviewed.noOverflowOrOverlay, true);
    assert.ok(reviewed.notes.trim().length >= 24);
    capture.humanReview = {
      result: "PASS",
      reviewedAt: review.reviewedAt,
      notes: reviewed.notes.trim(),
    };
    await validateGate8cCapture(
      capture,
      await readFile(path.join(repoRoot, capture.file)),
    );
  }

  manifest.capturePolicy.humanReview =
    "Fresh external record binds every PNG hash to visible language/state, viewport-theme-direction, privacy, overflow/overlay checks, and an image-specific human note";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `Recorded fresh human review for ${manifest.captures.length}/24 Gate 8C captures.\n`,
  );
}

void main();
