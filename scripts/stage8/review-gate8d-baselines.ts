import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  validateGate8dCapture,
  validateGate8dHumanReview,
  type Gate8dHumanReview,
  type Gate8dVisualManifest,
} from "./gate8d-visual-evidence";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const manifestPath = path.join(
  repoRoot,
  "docs/stage8/baselines/gate8d-baselines.json",
);
const reviewPath = path.join(
  repoRoot,
  "docs/stage8/gate8d-baseline-human-review.json",
);

async function main() {
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as Gate8dVisualManifest;
  const review = JSON.parse(
    await readFile(reviewPath, "utf8"),
  ) as Gate8dHumanReview;

  assert.equal(manifest.captures.length, 24);
  for (const capture of manifest.captures) {
    const bytes = await readFile(path.join(repoRoot, capture.file));
    await validateGate8dCapture(capture, bytes);
  }
  validateGate8dHumanReview(manifest, review);
  manifest.humanReview.status = "PASS";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log("Gate 8D independent visual review accepted: 24/24.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
