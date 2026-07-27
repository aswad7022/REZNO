import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const readRepoFile = (relativePath: string) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

test("Gate 8B has a presentation-only customer boundary", () => {
  const scope = readRepoFile("docs/stage8/stage8-canonical-scope.md");
  const implementation = readRepoFile(
    "docs/stage8/gate8b-customer-web-mobile-polish.md",
  );
  const customerLayout = readRepoFile("app/customer/layout.tsx");

  assert.match(scope, /Gate 8B — Customer Web and Mobile Polish/);
  assert.match(customerLayout, /data-customer-surface="dashboard"/);
  assert.match(implementation, /Presentation-only/);
  assert.match(implementation, /Gate 8C: `NOT STARTED`/);
  assert.match(implementation, /Migration 52: `NOT CREATED`/);
  assert.match(
    implementation,
    /DEFERRED_BY_OWNER — CODE MERGED, EXTERNAL VALIDATION NOT COMPLETED/,
  );
});

test("Gate 8B web customer state primitive is truthful and accessible", () => {
  const state = readRepoFile("components/customer/customer-state.tsx");
  const loading = readRepoFile("components/customer/customer-loading.tsx");
  const customerError = readRepoFile("app/customer/error.tsx");
  const rootError = readRepoFile("app/error.tsx");
  const offline = readRepoFile("app/offline/page.tsx");
  const notFound = readRepoFile("app/not-found.tsx");
  const forbidden = readRepoFile("app/forbidden.tsx");

  for (const tone of [
    "empty",
    "error",
    "info",
    "loading",
    "offline",
    "permission",
    "success",
  ]) {
    assert.match(state, new RegExp(`${tone}:\\s*\\{`));
  }
  assert.match(state, /role=\{tone === "error" \? "alert" : "status"\}/);
  assert.match(state, /aria-busy=\{tone === "loading" \|\| undefined\}/);
  assert.match(state, /motion-reduce:animate-none/);
  assert.match(state, /w-full min-w-0 max-w-full/);
  assert.match(state, /break-words/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(customerError, /tone="error"/);
  assert.match(rootError, /tone="error"/);
  assert.match(rootError, /className="w-full max-w-xl"/);
  assert.match(offline, /tone="offline"/);
  assert.match(notFound, /tone="empty"/);
  assert.match(forbidden, /tone="permission"/);
});

test("Gate 8B public discovery handles location permission without false success", () => {
  const location = readRepoFile(
    "features/location/components/location-permission-button.tsx",
  );
  const marketplace = readRepoFile("app/marketplace/page.tsx");
  const publicHeader = readRepoFile(
    "components/public-site/public-header.tsx",
  );
  const themeToggle = readRepoFile(
    "components/dashboard/dashboard-theme-toggle.tsx",
  );

  assert.match(marketplace, /data-customer-surface="marketplace"/);
  assert.match(publicHeader, /data-customer-surface="public-navigation"/);
  assert.match(location, /aria-busy=\{status === "loading"\}/);
  assert.match(location, /disabled=\{status === "loading"\}/);
  assert.match(location, /role="status"/);
  assert.match(location, /rezno-status-warning/);
  assert.match(location, /timeout: 8000/);
  assert.match(location, /maximumAge: 300000/);
  assert.match(themeToggle, /useSyncExternalStore\(/);
  assert.match(themeToggle, /disabled=\{!mounted\}/);
  assert.match(themeToggle, /mounted && resolvedTheme === "dark"/);
});

test("Gate 8B customer payment presentation is localized and server-authoritative", () => {
  const list = readRepoFile("app/customer/payments/page.tsx");
  const detail = readRepoFile("app/customer/payments/[intentId]/page.tsx");

  assert.match(list, /getTranslations\("CustomerPayments"\)/);
  assert.match(detail, /getTranslations\("CustomerPayments"\)/);
  assert.match(detail, /getCustomerPaymentIntent\(person\.id, intentId\)/);
  assert.match(detail, /providerActionDescription/);
  assert.match(detail, /CustomerStatusBadge/);
  assert.doesNotMatch(detail, /marks? a payment paid/i);

  for (const locale of ["ar", "ckb", "en"]) {
    const messages = JSON.parse(readRepoFile(`messages/${locale}.json`)) as {
      CustomerPayments: {
        attemptStatus: Record<string, string>;
        description: string;
        emptyDescription: string;
        refundStatus: Record<string, string>;
        status: Record<string, string>;
      };
    };
    assert.ok(messages.CustomerPayments.description.length > 12);
    assert.ok(messages.CustomerPayments.emptyDescription.length > 12);
    assert.deepEqual(
      Object.keys(messages.CustomerPayments.status).sort(),
      [
        "AUTHORIZED",
        "CANCELLED",
        "CAPTURED",
        "CREATED",
        "EXPIRED",
        "FAILED",
        "PARTIALLY_CAPTURED",
        "PARTIALLY_REFUNDED",
        "PROCESSING",
        "REFUNDED",
        "REQUIRES_ACTION",
      ],
    );
    assert.deepEqual(
      Object.keys(messages.CustomerPayments.attemptStatus).sort(),
      [
        "AUTHORIZED",
        "CANCELLED",
        "CAPTURED",
        "CLAIMED",
        "CREATED",
        "EXPIRED",
        "FAILED",
        "PROCESSING",
        "REQUIRES_ACTION",
      ],
    );
    assert.deepEqual(
      Object.keys(messages.CustomerPayments.refundStatus).sort(),
      ["CANCELLED", "FAILED", "PROCESSING", "REQUESTED", "SUCCEEDED"],
    );
  }
  assert.match(detail, /t\(`attemptStatus\.\$\{attempt\.status\}`\)/);
  assert.match(detail, /t\(`refundStatus\.\$\{refund\.status\}`\)/);
});

test("Gate 8B mobile avatar and payment surfaces use semantic tokens and 44px targets", () => {
  const avatar = readRepoFile(
    "apps/mobile/src/components/customer-avatar-manager.tsx",
  );
  const payment = readRepoFile(
    "apps/mobile/src/components/hosted-payment-controller.tsx",
  );
  const app = readRepoFile("apps/mobile/App.tsx");

  assert.doesNotMatch(avatar, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  assert.match(avatar, /theme\.colors\.accent/);
  assert.match(avatar, /theme\.colors\.danger/);
  assert.match(avatar, /theme\.colors\.success/);
  assert.match(avatar, /theme\.colors\.warning/);
  assert.match(avatar, /minHeight: 44/);
  assert.match(avatar, /minWidth: 44/);
  assert.match(avatar, /hitSlop=\{8\}/);
  assert.match(avatar, /writingDirection: "rtl"/);
  assert.match(avatar, /writingDirection: "ltr"/);
  assert.match(avatar, /if \(status === "SUCCESS"\)/);
  assert.doesNotMatch(
    avatar,
    /status === "SUCCESS" \|\| status === "CANCELLED" \|\| status === "EXPIRED"/,
  );
  assert.match(
    avatar,
    /accessibilityLiveRegion=\{messageTone === "danger" \? "assertive" : "polite"\}/,
  );
  assert.match(payment, /minHeight: 44/);
  assert.match(payment, /minWidth: 44/);
  assert.match(app, /accessibilityRole="alert"/);
  assert.match(app, /\{text\.marketplaceRetry\}/);
});

test("Gate 8B mobile upload and hosted-payment messages remain truthful", () => {
  const avatar = readRepoFile(
    "apps/mobile/src/components/customer-avatar-manager.tsx",
  );
  const payment = readRepoFile(
    "apps/mobile/src/components/hosted-payment-controller.tsx",
  );

  for (const contract of [
    /operation remains saved for later verification/,
    /preview is temporarily unavailable/,
    /did not replace newer content|Newer content was not replaced/,
    /Retries stopped at the safe limit/,
  ]) {
    assert.match(avatar, contract);
  }
  assert.match(payment, /Payment was not marked successful/);
  assert.match(payment, /server confirmed the payment status/i);
  assert.match(payment, /accessibilityLiveRegion="polite"/);
});

test("Gate 8B baselines cover platforms, directions, themes, states, and required surfaces", () => {
  const manifest = JSON.parse(
    readRepoFile("docs/stage8/baselines/gate8b-baselines.json"),
  ) as {
    reducedMotionEvidence: {
      automatedContracts: string[];
      visualEmulationAvailable: boolean;
    };
    captures: Array<{
      capturePixels: string;
      direction: "ltr" | "rtl";
      file: string;
      locale: "ar" | "ckb" | "en";
      platform: "android-like" | "ios-like" | "web";
      reducedMotion: boolean;
      sha256: string;
      state: string;
      surface: string;
      theme: "dark" | "light";
      viewport: string;
    }>;
  };

  assert.ok(manifest.captures.length >= 12);
  assert.deepEqual(
    new Set(manifest.captures.map((capture) => capture.direction)),
    new Set(["ltr", "rtl"]),
  );
  assert.deepEqual(
    new Set(manifest.captures.map((capture) => capture.theme)),
    new Set(["dark", "light"]),
  );
  assert.deepEqual(
    new Set(manifest.captures.map((capture) => capture.locale)),
    new Set(["ar", "ckb", "en"]),
  );
  assert.deepEqual(
    new Set(manifest.captures.map((capture) => capture.platform)),
    new Set(["android-like", "ios-like", "web"]),
  );
  assert.equal(manifest.reducedMotionEvidence.visualEmulationAvailable, false);
  assert.ok(manifest.reducedMotionEvidence.automatedContracts.length >= 2);
  assert.ok(
    manifest.reducedMotionEvidence.automatedContracts.some((contract) =>
      contract.includes("motion-reduce"),
    ),
  );

  const surfaceText = manifest.captures
    .map((capture) => `${capture.surface}:${capture.state}`)
    .join("\n");
  for (const required of [
    "public",
    "search",
    "profile",
    "booking",
    "restaurant",
    "commerce",
    "payment",
    "account",
    "notifications",
    "messages",
    "loading",
    "empty",
    "error",
    "offline",
  ]) {
    assert.match(surfaceText, new RegExp(required));
  }

  for (const capture of manifest.captures) {
    assert.match(capture.capturePixels, /^\d+x\d+/);
    const bytes = readFileSync(
      path.join(repoRoot, "docs/stage8/baselines", capture.file),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      capture.sha256,
    );
  }
});

test("Gate 8B leaves schema and migrations unchanged", () => {
  const migrationRoot = path.join(repoRoot, "prisma/migrations");
  const migrations = readdirSync(migrationRoot, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  );
  assert.equal(migrations.length, 51);

  const expected = new Map([
    [
      "prisma/migrations/20260723180000_communications_payment_automation/migration.sql",
      "04fa9fe4a87c7360ec3eb585951ff49c20e90675c74755d1127d716fbf009192",
    ],
    [
      "prisma/migrations/20260724180000_platform_operations_closure/migration.sql",
      "6cd6ec39cc950600002f0b36529ea08460c539b8ced0176f37fbed2980a74f0c",
    ],
    [
      "prisma/migrations/20260726173000_hosted_payment_handoff_action/migration.sql",
      "a16a9c7f2b61c12d35c154e8a4f2f655a568a508118caf46ee88ebe81fbc564d",
    ],
    [
      "prisma/migrations/20260726203000_device_push_notifications/migration.sql",
      "98fe060f7e9c2e1baa1e2a91c40bcad1a39915454f3b9445a55ef82fb86848f0",
    ],
  ]);

  for (const [relativePath, expectedHash] of expected) {
    const bytes = readFileSync(path.join(repoRoot, relativePath));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      expectedHash,
    );
  }
});
