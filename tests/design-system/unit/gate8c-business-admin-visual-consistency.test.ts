import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const readRepoFile = (relativePath: string) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

test("Gate 8C remains presentation-only and preserves deferred boundaries", () => {
  const scope = readRepoFile("docs/stage8/stage8-canonical-scope.md");
  const gate = readRepoFile(
    "docs/stage8/gate8c-business-admin-visual-consistency.md",
  );

  assert.match(scope, /Business and Admin Visual Consistency/);
  assert.match(gate, /Presentation-only: `YES`/);
  assert.match(
    gate,
    /DEFERRED_BY_OWNER — CODE MERGED, EXTERNAL VALIDATION NOT COMPLETED/,
  );
  assert.match(gate, /Stage 6 runtime: `NOT ACTIVATED`/);
  assert.match(gate, /Gate 8D: `NOT STARTED`/);
  assert.match(gate, /Artificial intelligence: `NOT STARTED`/);
});

test("Admin navigation is localized, responsive, permission-filtered, and directional", () => {
  const shell = readRepoFile("features/admin/components/admin-shell.tsx");
  const navigation = readRepoFile(
    "features/admin/components/admin-navigation.tsx",
  );

  assert.match(shell, /visibleLinks: AdminNavigationItem\[\]/);
  assert.match(shell, /hasAnyCommerceAdminPermission/);
  assert.match(shell, /AdminNavigation items=\{visibleLinks\}/);
  assert.match(shell, /DashboardLanguageSwitcher/);
  assert.match(shell, /DashboardThemeToggle/);
  assert.match(shell, /ArrowLeft className="size-4 rtl:rotate-180"/);
  assert.doesNotMatch(shell, /bg-slate|bg-white|text-slate/);

  assert.match(navigation, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(navigation, /focus-visible:ring-3/);
  assert.match(navigation, /side=\{locale === "en" \? "left" : "right"\}/);
  assert.match(navigation, /className="absolute end-3 top-3"/);
  assert.match(navigation, /min-h-11 min-w-11/);

  for (const locale of ["ar", "ckb", "en"]) {
    const messages = JSON.parse(readRepoFile(`messages/${locale}.json`)) as {
      Admin: {
        navigation: {
          items: Record<string, string>;
          label: string;
          open: string;
          close: string;
        };
      };
    };
    assert.ok(messages.Admin.navigation.label);
    assert.ok(messages.Admin.navigation.open);
    assert.ok(messages.Admin.navigation.close);
    assert.equal(Object.keys(messages.Admin.navigation.items).length, 14);
  }
});

test("Business and Admin shells share scoped semantic presentation contracts", () => {
  const dashboard = readRepoFile("components/dashboard/dashboard-layout.tsx");
  const css = readRepoFile("app/globals.css");

  assert.match(
    dashboard,
    /data-business-admin-surface=\{role === "business" \? "business" : undefined\}/,
  );
  assert.match(css, /\[data-business-admin-surface\] :is\(table\)/);
  assert.match(css, /overscroll|overflow-wrap/);
  assert.match(css, /position: sticky/);
  assert.match(css, /text-align: start/);
  assert.match(css, /inset-block-start/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("Operational states and wide data regions remain accessible", () => {
  const surfaces = readRepoFile(
    "components/operations/workspace-surface.tsx",
  );
  const loading = readRepoFile("app/admin/loading.tsx");
  const error = readRepoFile("app/admin/error.tsx");

  assert.match(surfaces, /role=\{tone === "error" \? "alert" : "status"\}/);
  assert.match(surfaces, /role="region"/);
  assert.match(surfaces, /aria-label=\{label\}/);
  assert.match(surfaces, /tabIndex=\{0\}/);
  assert.match(surfaces, /overscroll-x-contain/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(error, /tone="error"/);
  assert.match(error, /unstable_retry/);
});

test("Platform operations never infer runtime activation from stored records", () => {
  const jobs = readRepoFile("app/admin/platform-jobs/page.tsx");
  const operations = readRepoFile("app/admin/platform-operations/page.tsx");

  assert.match(jobs, /Stage 6 runtime is not activated/);
  assert.match(jobs, /configuration records, not proof of execution/);
  assert.match(operations, /Runtime state: \$\{overview\.runtime\.state\}/);
  assert.match(operations, /do not prove that automatic execution is connected/);
  assert.match(operations, /Confirm deployment connectivity/);
});

test("Scoped Business and Admin presentation uses semantic status colors", () => {
  const scopedFiles = [
    "features/admin/components/admin-shell.tsx",
    "features/admin/components/admin-access-not-configured.tsx",
    "app/admin/forbidden.tsx",
    "app/admin/access/page.tsx",
    "app/admin/users/[id]/page.tsx",
    "app/admin/businesses/[id]/page.tsx",
    "features/communications/components/manual-dispatch.tsx",
    "features/business-operations/components/operational-blocks-page.tsx",
    "features/bookings/components/business-calendar-page.tsx",
    "features/reviews/components/admin-reviews-page.tsx",
  ];
  const forbiddenLiteral =
    /(?:bg|text|border)-(?:slate|gray|zinc|red|green|emerald|amber|indigo)-/;

  for (const relativePath of scopedFiles) {
    assert.doesNotMatch(
      readRepoFile(relativePath),
      forbiddenLiteral,
      relativePath,
    );
  }
});

test("Gate 8C visual evidence is complete and byte-authenticated", () => {
  const manifest = JSON.parse(
    readRepoFile("docs/stage8/baselines/gate8c-baselines.json"),
  ) as {
    captures: Array<{
      file: string;
      locale: string;
      theme: string;
      viewport: string;
      sha256: string;
      families: string[];
    }>;
  };

  assert.ok(manifest.captures.length >= 16);
  assert.ok(manifest.captures.some((entry) => entry.viewport === "desktop"));
  assert.ok(manifest.captures.some((entry) => entry.viewport === "compact"));
  assert.ok(manifest.captures.some((entry) => entry.theme === "light"));
  assert.ok(manifest.captures.some((entry) => entry.theme === "dark"));
  assert.ok(manifest.captures.some((entry) => entry.locale === "en"));
  assert.ok(manifest.captures.some((entry) => entry.locale === "ar"));
  assert.ok(manifest.captures.some((entry) => entry.locale === "ckb"));

  const requiredFamilies = new Set([
    "bookings",
    "commerce",
    "communications",
    "dense-data",
    "dialog",
    "error",
    "form",
    "loading",
    "permission",
    "platform",
    "restaurant",
    "table",
  ]);
  const representedFamilies = new Set(
    manifest.captures.flatMap((entry) => entry.families),
  );
  for (const family of requiredFamilies) {
    assert.ok(representedFamilies.has(family), family);
  }

  for (const capture of manifest.captures) {
    const absolutePath = path.join(repoRoot, capture.file);
    assert.ok(existsSync(absolutePath), capture.file);
    const bytes = readFileSync(absolutePath);
    assert.ok(bytes.length > 1_000, capture.file);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), capture.sha256);
  }
});

test("Gate 8C does not create Migration 52 and preserves migration hashes", () => {
  const migrationRoot = path.join(repoRoot, "prisma/migrations");
  const migrationDirectories = readdirSync(migrationRoot, {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory());
  assert.equal(migrationDirectories.length, 51);

  const expected = new Map([
    [48, "04fa9fe4a87c7360ec3eb585951ff49c20e90675c74755d1127d716fbf009192"],
    [49, "6cd6ec39cc950600002f0b36529ea08460c539b8ced0176f37fbed2980a74f0c"],
    [50, "a16a9c7f2b61c12d35c154e8a4f2f655a568a508118caf46ee88ebe81fbc564d"],
    [51, "98fe060f7e9c2e1baa1e2a91c40bcad1a39915454f3b9445a55ef82fb86848f0"],
  ]);

  for (const [position, sha256] of expected) {
    const migration = migrationDirectories
      .map((entry) => entry.name)
      .sort()[position - 1];
    const bytes = readFileSync(path.join(migrationRoot, migration, "migration.sql"));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256);
  }
});
