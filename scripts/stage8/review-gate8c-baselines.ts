import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  validateGate8cCapture,
  type Gate8cCaptureEvidence,
} from "./gate8c-visual-evidence";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const manifestPath = path.join(
  repoRoot,
  "docs/stage8/baselines/gate8c-baselines.json",
);
const confirmation = process.env.GATE8C_VISUAL_REVIEW_CONFIRM;
const reviewedAt = process.env.GATE8C_VISUAL_REVIEW_DATE ?? "";

assert.equal(
  confirmation,
  "I_REVIEWED_EACH_GATE8C_CAPTURE",
  "Explicit per-image human review confirmation is required.",
);
assert.match(
  reviewedAt,
  /^\d{4}-\d{2}-\d{2}$/,
  "GATE8C_VISUAL_REVIEW_DATE must be YYYY-MM-DD.",
);

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    capturePolicy: { humanReview: string };
    captures: Gate8cCaptureEvidence[];
  };

  assert.equal(manifest.captures.length, 24);
  for (const capture of manifest.captures) {
    assert.equal(
      capture.humanReview.result,
      "PENDING",
      `${capture.file} is not awaiting review.`,
    );
    const reviewNote = capture.humanReview.notes.replace(
      /^Pending human review:\s*/,
      "",
    );
    const approved: Gate8cCaptureEvidence = {
      ...capture,
      humanReview: {
        result: "PASS",
        reviewedAt,
        notes: reviewNote,
      },
    };
    const bytes = await readFile(path.join(repoRoot, capture.file));
    await validateGate8cCapture(approved, bytes);
    capture.humanReview = approved.humanReview;
  }

  manifest.capturePolicy.humanReview =
    "Each capture reviewed individually for completeness, clipping, repetition, overlays, locale, direction, and theme";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `Recorded explicit human review for ${manifest.captures.length} Gate 8C captures.\n`,
  );
}

void main();
