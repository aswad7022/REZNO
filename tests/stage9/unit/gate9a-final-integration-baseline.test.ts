import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  GATE9A_CRITICAL_MIGRATION_HASHES,
  GATE9A_ENVIRONMENT_MATRIX,
  GATE9A_EXPECTED_MIGRATION_COUNT,
  GATE9A_PERFORMANCE_BUDGETS,
  GATE9A_RELEASE_INVENTORY,
  STAGE9_GATE9A_BASE_SHA,
  STAGE9_GATE9A_BRANCH,
  STAGE9_GATE9A_VERSION,
  STAGE9_OFFICIAL_STATE,
  evaluateGate9APerformanceSnapshot,
  findGate9AInventoryGaps,
  gate9ARequiresNoExternalSecrets,
  validateGate9AEnvironment,
  type Gate9APerformanceSnapshot,
} from "../../../features/stage9/gate9a";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

function read(file: string) {
  return readFileSync(path.join(repoRoot, file), "utf8");
}

function walkFiles(root: string): string[] {
  const absoluteRoot = path.join(repoRoot, root);
  if (!existsSync(absoluteRoot)) return [];
  return readdirSync(absoluteRoot).flatMap((entry) => {
    const absolute = path.join(absoluteRoot, entry);
    const relative = path.relative(repoRoot, absolute);
    if (statSync(absolute).isDirectory()) return walkFiles(relative);
    return relative;
  });
}

function appRouteFromFile(file: string) {
  if (file === "app/page.tsx") return "/";
  if (file.endsWith("/page.tsx")) return `/${file.slice("app/".length, -"/page.tsx".length)}`;
  if (file.endsWith("/route.ts")) return `/${file.slice("app/".length, -"/route.ts".length)}`;
  return null;
}

test("Gate 9A records the official transition state without starting later gates", () => {
  assert.equal(STAGE9_GATE9A_BASE_SHA, "71e022d6144ac5f508dfabd7432cbf963d5d1693");
  assert.equal(STAGE9_GATE9A_BRANCH, "feat/stage9-final-integration-baseline");
  assert.equal(STAGE9_GATE9A_VERSION, "stage9-gate9a-final-integration-baseline-v1");
  assert.deepEqual(STAGE9_OFFICIAL_STATE.stagesClosed, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(STAGE9_OFFICIAL_STATE.aiGatesClosed, ["A", "B", "C", "D"]);
  assert.equal(STAGE9_OFFICIAL_STATE.activeGate, "9A");
  assert.deepEqual(STAGE9_OFFICIAL_STATE.notStarted, ["9B", "9C", "9D"]);
  assert.match(STAGE9_OFFICIAL_STATE.stage6Runtime, /NOT ACTIVATED/);
  assert.match(STAGE9_OFFICIAL_STATE.stage7ExternalValidation, /DEFERRED_BY_OWNER/);
  assert.equal(STAGE9_OFFICIAL_STATE.stagingProductionAi, "DISABLED");
  assert.deepEqual(STAGE9_OFFICIAL_STATE.protectedPrs, ["#100"]);
});

test("Gate 9A release inventory covers implemented critical routes and mobile entry points", () => {
  const implementedRoutes = walkFiles("app")
    .map(appRouteFromFile)
    .filter((route): route is string => Boolean(route));
  const mobileFiles = walkFiles("apps/mobile/src");
  assert.deepEqual(findGate9AInventoryGaps(implementedRoutes, mobileFiles), []);

  const domains = GATE9A_RELEASE_INVENTORY.map((item) => item.domain).join("\n");
  for (const required of [
    "Identity",
    "Business operations",
    "Restaurant",
    "Commerce",
    "Notifications",
    "Managed storage",
    "Durable platform jobs",
    "Brand",
    "AI foundation",
  ]) {
    assert.match(domains, new RegExp(required));
  }
  assert.equal(
    GATE9A_RELEASE_INVENTORY.every(
      (item) => item.tests.length > 0 && item.evidence.length > 0,
    ),
    true,
  );
  assert.equal(
    GATE9A_RELEASE_INVENTORY.some((item) => item.gate9aCoverage === "direct-postgres"),
    true,
  );
});

test("Gate 9A environment matrix is explicit, redacted, and fails closed for unsafe production posture", () => {
  assert.equal(
    new Set(GATE9A_ENVIRONMENT_MATRIX.map((item) => item.name)).size,
    GATE9A_ENVIRONMENT_MATRIX.length,
  );
  assert.equal(
    new Set(GATE9A_ENVIRONMENT_MATRIX.map((item) => item.timing)).size,
    4,
  );

  const ciEnv = {
    DATABASE_URL: "postgresql://rezno_ci:rezno_ci_password@127.0.0.1:5432/rezno_gate9a_test?schema=public",
    BETTER_AUTH_SECRET: "rezno-ci-only-not-a-production-secret",
    BETTER_AUTH_URL: "http://127.0.0.1:3000",
    REZNO_AI_ENABLED: "false",
    REZNO_AI_KILL_SWITCH: "true",
    REZNO_AI_GEMINI_ENABLED: "false",
    REZNO_PAYMENT_PROVIDER: "NOT_CONFIGURED",
    REZNO_STORAGE_PROVIDER: "NOT_CONFIGURED",
    REZNO_PLATFORM_RUNTIME_ENABLED: "false",
  };
  assert.equal(validateGate9AEnvironment(ciEnv, "ci").ok, true);
  assert.deepEqual(gate9ARequiresNoExternalSecrets(ciEnv), []);

  const production = validateGate9AEnvironment({
    ...ciEnv,
    DATABASE_URL: "postgresql://placeholder.invalid/rezno",
    BETTER_AUTH_SECRET: "not-a-production-secret",
    GEMINI_API_KEY: "placeholder-gemini-key",
    REZNO_AI_ENABLED: "true",
    REZNO_PAYMENT_PROVIDER: "DETERMINISTIC_TEST",
    REZNO_STORAGE_PROVIDER: "DETERMINISTIC_TEST",
  }, "production");
  assert.equal(production.ok, false);
  assert.equal(
    production.findings.some((finding) => finding.code === "PRODUCTION_PLACEHOLDER"),
    true,
  );
  assert.equal(
    production.findings.some((finding) => finding.code === "PRODUCTION_TEST_PROVIDER"),
    true,
  );
  assert.equal(
    production.findings.some((finding) => finding.code === "PRODUCTION_EXTERNAL_RUNTIME_ACTIVE"),
    true,
  );
  assert.equal(JSON.stringify(production).includes("placeholder-gemini-key"), false);

  const conflict = validateGate9AEnvironment({
    ...ciEnv,
    REZNO_AI_DEPLOYMENT_ENV: "local",
    VERCEL_ENV: "production",
  }, "ci");
  assert.equal(conflict.ok, false);
  assert.equal(
    conflict.findings.some((finding) => finding.code === "CONFLICTING_DEPLOYMENT_ENV"),
    true,
  );

  const unknown = validateGate9AEnvironment({
    ...ciEnv,
    REZNO_UNREVIEWED_RUNTIME_SECRET: "secret-value-never-leaked",
  }, "ci");
  assert.equal(unknown.ok, true);
  assert.equal(
    unknown.findings.some((finding) => finding.code === "UNKNOWN_VARIABLE"),
    true,
  );
  assert.equal(JSON.stringify(unknown).includes("secret-value-never-leaked"), false);
});

test("Gate 9A performance budgets bind current route counts and reject clear regressions", () => {
  const appRoutes = walkFiles("app")
    .filter((file) => file.endsWith("/page.tsx") || file.endsWith("/route.ts"))
    .length;
  const mobileSourceFiles = walkFiles("apps/mobile/src")
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .length;
  const queryValidation = read("features/commerce/public/query-validation.ts");
  assert.match(queryValidation, /MAX_PUBLIC_LIMIT = 50/);
  assert.match(queryValidation, /MAX_PUBLIC_QUERY_LENGTH = 100/);

  const current: Gate9APerformanceSnapshot = {
    ...GATE9A_PERFORMANCE_BUDGETS,
    nextRouteCount: appRoutes,
    mobileExpoModuleCount: mobileSourceFiles,
  };
  assert.deepEqual(evaluateGate9APerformanceSnapshot(current), []);

  const regressed: Gate9APerformanceSnapshot = {
    ...current,
    aiProviderConcurrencyLimit: GATE9A_PERFORMANCE_BUDGETS.aiProviderConcurrencyLimit + 1,
    httpBodyBytes: GATE9A_PERFORMANCE_BUDGETS.httpBodyBytes + 1,
    nextRouteCount: GATE9A_PERFORMANCE_BUDGETS.nextRouteCount + 1,
  };
  assert.deepEqual(
    evaluateGate9APerformanceSnapshot(regressed).map((finding) => finding.key).sort(),
    ["aiProviderConcurrencyLimit", "httpBodyBytes", "nextRouteCount"],
  );
});

test("Gate 9A migration baseline remains exactly at 51 migrations with approved late-stage hashes", () => {
  const migrationDirs = readdirSync(path.join(repoRoot, "prisma/migrations"))
    .filter((entry) => statSync(path.join(repoRoot, "prisma/migrations", entry)).isDirectory())
    .sort();
  assert.equal(migrationDirs.length, GATE9A_EXPECTED_MIGRATION_COUNT);
  assert.equal(
    migrationDirs.some((entry) => entry.includes("migration_52") || entry.includes("stage9")),
    false,
  );

  for (const [migration, expectedHash] of Object.entries(GATE9A_CRITICAL_MIGRATION_HASHES)) {
    const sql = readFileSync(path.join(repoRoot, "prisma/migrations", migration, "migration.sql"));
    const actual = createHash("sha256").update(sql).digest("hex");
    assert.equal(actual, expectedHash, migration);
  }
});
