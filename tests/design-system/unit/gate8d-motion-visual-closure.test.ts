import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { reznoBrandFoundation } from "../../../design-system/brand-foundation";
import {
  assertGate8dCaptureContract,
  gate8dCaptureSpecs,
} from "../../../scripts/stage8/gate8d-capture-contract";
import {
  inspectGate8dPng,
  validateGate8dAccessibility,
  validateGate8dCapture,
  validateGate8dDom,
  validateGate8dHumanReview,
  validateGate8dPerformance,
  type Gate8dHumanReview,
  type Gate8dVisualManifest,
} from "../../../scripts/stage8/gate8d-visual-evidence";
import { validateGate8dAttestation } from "../../../scripts/stage8/gate8d-production-harness";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");
const manifestFile = "docs/stage8/baselines/gate8d-baselines.json";
const reviewFile = "docs/stage8/gate8d-baseline-human-review.json";

function collectTsxFiles(dir: string): string[] {
  const absolute = path.join(repoRoot, dir);
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(relative);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [relative] : [];
  });
}

test("Gate 8D owns final motion, browser, accessibility, and performance closure only", () => {
  const scope = read("docs/stage8/stage8-canonical-scope.md");
  const gate = read("docs/stage8/gate8d-motion-visual-closure.md");
  const closure = read("docs/stage8/stage8-closure.md");
  assert.match(scope, /Motion, Visual QA (?:&|and) Stage Closure/);
  assert.match(gate, /Presentation-only: `YES`/);
  assert.match(gate, /Stage 6 runtime: `NOT ACTIVATED`/);
  assert.match(
    gate,
    /DEFERRED_BY_OWNER — CODE MERGED, EXTERNAL VALIDATION NOT COMPLETED/,
  );
  assert.match(gate, /Artificial intelligence: `NOT STARTED`/);
  assert.match(gate, /Migration 52: `NOT CREATED`/);
  assert.match(closure, /becomes effective only when the exact Gate 8D head/);
  assert.match(closure, /Artificial intelligence is `NOT STARTED`/);
  assert.match(
    closure,
    /DEFERRED_BY_OWNER — CODE MERGED, EXTERNAL VALIDATION NOT COMPLETED/,
  );
});

test("Web and Mobile consume one bounded motion contract with deterministic reduced motion", () => {
  const css = read("app/globals.css");
  const mobile = read("apps/mobile/src/theme/motion.ts");
  const page = read("components/dashboard/dashboard-page-motion.tsx");
  const profile = read(
    "features/marketplace/components/public-profile-motion.tsx",
  );
  for (const [token, duration] of Object.entries(
    reznoBrandFoundation.motion.duration,
  )) {
    assert.match(css, new RegExp(`--motion-duration-${token}: ${duration}ms`));
  }
  assert.deepEqual(reznoBrandFoundation.motion.easing.enter, [0.16, 1, 0.3, 1]);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation-iteration-count: 1 !important/);
  assert.match(mobile, /preference === "reduced" \? 0 : duration/);
  assert.match(mobile, /preference === "reduced" \? 1 : scale/);
  assert.match(page, /reznoBrandFoundation\.motion/);
  assert.match(profile, /reznoBrandFoundation\.motion/);
  assert.doesNotMatch(page, /duration:\s*0\.\d+/);
  assert.doesNotMatch(profile, /duration:\s*0\.\d+/);
});

test("Directional primitives use logical placement and reduced-motion fallbacks", () => {
  for (const file of [
    "components/ui/dialog.tsx",
    "components/ui/sheet.tsx",
    "components/ui/dropdown-menu.tsx",
    "components/ui/select.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /motion-reduce:/, file);
    assert.doesNotMatch(source, /[\s"'`](?:right|left)-[23]\b/, file);
    assert.doesNotMatch(source, /\bduration-(?:100|200)\b/, file);
  }
  assert.match(read("components/ui/dialog.tsx"), /rtl:translate-x-1\/2/);
  assert.match(
    read("components/ui/dropdown-menu.tsx"),
    /rtl:rotate-180/,
  );
});

test("Skip navigation, focus, touch, and live-state foundations remain explicit", () => {
  const layout = read("app/layout.tsx");
  const css = read("app/globals.css");
  assert.match(layout, /className="rezno-skip-link"/);
  assert.match(layout, /href="#main-content"/);
  assert.match(css, /\.rezno-skip-link:focus-visible/);
  assert.match(css, /--control-min-size: 2\.75rem/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\[aria-busy="true"\]/);
  for (const locale of ["ar", "en", "ckb"]) {
    const messages = JSON.parse(read(`messages/${locale}.json`));
    assert.ok(messages.Accessibility.skipToContent);
  }
  const filesWithMain = [
    ...collectTsxFiles("app"),
    ...collectTsxFiles("features/marketplace/components"),
  ].filter((file) => read(file).includes("<main"));
  const missingTarget = filesWithMain.filter((file) => {
    const source = read(file);
    return /<main\b/.test(source) && !/<main\b[^>]*\bid="main-content"/s.test(source);
  });
  assert.deepEqual(missingTarget, []);
});

test("Gate 8D cross-browser contract covers all browsers, viewports, directions, themes, and roles", () => {
  assertGate8dCaptureContract();
  assert.equal(gate8dCaptureSpecs.length, 24);
  assert.deepEqual(
    [...new Set(gate8dCaptureSpecs.map((entry) => entry.browser))].sort(),
    ["chromium", "firefox", "webkit"],
  );
  assert.deepEqual(
    [...new Set(gate8dCaptureSpecs.map((entry) => entry.viewport))].sort(),
    [
      "desktop",
      "mobile-compact",
      "mobile-large",
      "tablet-landscape",
      "tablet-portrait",
      "wide-desktop",
      "zoom-200",
    ],
  );
  assert.ok(gate8dCaptureSpecs.some((entry) => entry.locale === "en"));
  assert.ok(gate8dCaptureSpecs.some((entry) => entry.locale === "ar"));
  assert.ok(gate8dCaptureSpecs.some((entry) => entry.locale === "ckb"));
  assert.ok(gate8dCaptureSpecs.some((entry) => entry.theme === "light"));
  assert.ok(gate8dCaptureSpecs.some((entry) => entry.theme === "dark"));
  assert.ok(
    gate8dCaptureSpecs
      .filter((entry) =>
        entry.file.includes("business-notification-preferences-table"),
      )
      .every(
        (entry) =>
          entry.scrollTo === "table" &&
          entry.scrollOffsetY === -96 &&
          entry.height === 900,
      ),
    "Notification evidence must show the table below the sticky header.",
  );
});

test("Gate 8D evidence is production-attested, deterministic, browser-authenticated, and human-reviewed", async () => {
  assert.ok(existsSync(path.join(repoRoot, manifestFile)));
  assert.ok(existsSync(path.join(repoRoot, reviewFile)));
  const manifest = JSON.parse(read(manifestFile)) as Gate8dVisualManifest;
  const review = JSON.parse(read(reviewFile)) as Gate8dHumanReview;
  assert.equal(manifest.environment, "owned Next.js production build/server");
  assert.equal(manifest.determinism.passes, 2);
  assert.equal(manifest.determinism.identicalCaptureCount, 24);
  assert.equal(manifest.captures.length, 24);
  assert.equal(manifest.humanReview.status, "PASS");
  validateGate8dAttestation(manifest.productionAttestation, {
    gitSha: manifest.sourceSha,
    captureScriptSha256: manifest.productionAttestation.captureScriptSha256,
    harnessScriptSha256: manifest.productionAttestation.harnessScriptSha256,
  });
  validateGate8dHumanReview(manifest, review);
  for (const capture of manifest.captures) {
    const bytes = readFileSync(path.join(repoRoot, capture.file));
    await validateGate8dCapture(capture, bytes);
  }
  execFileSync("git", ["merge-base", "--is-ancestor", manifest.sourceSha, "HEAD"], {
    cwd: repoRoot,
  });
  const filesAfterSource = execFileSync(
    "git",
    ["diff", "--name-only", `${manifest.sourceSha}..HEAD`],
    { cwd: repoRoot, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  assert.deepEqual(
    filesAfterSource.filter(
      (file) =>
        !(
          file === manifestFile ||
          file === reviewFile ||
          file.startsWith("docs/stage8/baselines/gate8d/")
        ),
    ),
    [],
  );
});

test("Gate 8D validator rejects forged format, blank images, stale DOM, a11y, performance, and review evidence", async () => {
  const onePixelPng = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  await assert.rejects(() => inspectGate8dPng(Buffer.from("not png")));
  const blank = await inspectGate8dPng(onePixelPng);
  assert.equal(blank.width, 1);
  const manifest = JSON.parse(read(manifestFile)) as Gate8dVisualManifest;
  const forgedBlank = structuredClone(manifest.captures[0]);
  forgedBlank.viewportWidth = blank.width;
  forgedBlank.viewportHeight = blank.height;
  forgedBlank.image = blank;
  await assert.rejects(() => validateGate8dCapture(forgedBlank, onePixelPng));
  const dom = structuredClone(manifest.captures[0].dom);
  dom.horizontalOverflow = 1;
  assert.throws(() => validateGate8dDom(dom));
  dom.horizontalOverflow = 0;
  dom.consoleErrors = ["development overlay"];
  assert.throws(() => validateGate8dDom(dom));
  const accessibility = structuredClone(
    manifest.captures[0].accessibility,
  );
  accessibility.unnamedInteractiveControls = 1;
  assert.throws(() => validateGate8dAccessibility(accessibility));
  const performance = structuredClone(manifest.captures[0].performance);
  performance.cls = 0.2;
  assert.throws(() => validateGate8dPerformance(performance));
  const review = JSON.parse(read(reviewFile)) as Gate8dHumanReview;
  review.captures[0].sha256 = "0".repeat(64);
  assert.throws(() => validateGate8dHumanReview(manifest, review));
});

test("Gate 8D production harness owns build/start and rejects dirty or external provenance", () => {
  const harness = read("scripts/stage8/gate8d-production-harness.ts");
  const capture = read("scripts/stage8/capture-gate8d-baselines.ts");
  assert.match(harness, /git\("status", "--porcelain"/);
  assert.match(harness, /\["npm", "run", "build"\]/);
  assert.match(harness, /"start"/);
  assert.match(harness, /"127\.0\.0\.1"/);
  assert.match(harness, /child\.pid/);
  assert.match(harness, /\.next\/BUILD_ID/);
  assert.match(capture, /startGate8dProductionHarness/);
  assert.match(capture, /assertOwnedResponder/);
  assert.doesNotMatch(capture, /VISUAL_BASE_URL|localhost:3000/);
});

test("Gate 8D keeps database, AI, runtime activation, and external validation out of scope", () => {
  const migrationRoot = path.join(repoRoot, "prisma/migrations");
  const migrations = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(migrations.length, 51);
  const hashes = [
    "04fa9fe4a87c7360ec3eb585951ff49c20e90675c74755d1127d716fbf009192",
    "6cd6ec39cc950600002f0b36529ea08460c539b8ced0176f37fbed2980a74f0c",
    "a16a9c7f2b61c12d35c154e8a4f2f655a568a508118caf46ee88ebe81fbc564d",
    "98fe060f7e9c2e1baa1e2a91c40bcad1a39915454f3b9445a55ef82fb86848f0",
  ];
  for (let index = 47; index <= 50; index += 1) {
    const bytes = readFileSync(
      path.join(migrationRoot, migrations[index], "migration.sql"),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      hashes[index - 47],
    );
  }
});
