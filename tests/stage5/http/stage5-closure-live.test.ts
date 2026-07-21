import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const baseUrl =
  process.env.STAGE5_HTTP_BASE_URL ??
  process.env.MEDIA_HTTP_BASE_URL ??
  process.env.PAYMENT_HTTP_BASE_URL ??
  process.env.STORAGE_HTTP_BASE_URL ??
  process.env.COMMERCE_HTTP_BASE_URL;

test("Gate 5D production-route matrix remains executable in the accepted 5A–5C live suites", async () => {
  const [storage, media, payments] = await Promise.all([
    readFile(
      new URL("../../storage/http/managed-storage-live.test.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../../media/http/media-live.test.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../../payments/http/payment-live.test.ts", import.meta.url),
      "utf8",
    ),
  ]);

  for (const route of [
    "/api/storage/customer/sessions",
    "/api/storage/customer/assets",
    "/api/storage/customer/quota",
    "/api/storage/business/sessions",
    "/api/admin/storage/assets",
  ]) {
    assert.match(storage, new RegExp(escapeRegex(route)));
  }
  for (const route of [
    "/api/media/capabilities",
    "/api/media/customer/profile",
    "/api/media/business/profile",
  ]) {
    assert.match(media, new RegExp(escapeRegex(route)));
  }
  for (const route of [
    "/api/payments/customer/capabilities",
    "/api/payments/customer/intents",
    "/api/payments/business/intents",
    "/api/payments/admin/intents",
    "/api/payments/admin/reconciliation",
    "/api/payments/admin/settlements",
    "/api/payments/webhooks/deterministic",
    "/api/mobile/payments/intents",
  ]) {
    assert.match(payments, new RegExp(escapeRegex(route)));
  }
  for (const source of [storage, media, payments]) {
    assert.match(source, /NOT_CONFIGURED|providerConfigured/);
    assert.match(source, /prisma|postgresql:\/\//i);
  }
});

test("Gate 5D Web and Mobile closure remains regression-only and provider-truthful", async () => {
  const [
    customerMedia,
    businessMedia,
    customerPayments,
    businessPayments,
    adminPayments,
    mobile,
  ] = await Promise.all([
    readFile(new URL("../../../app/customer/profile/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../../../features/media/components/media-manager.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../../../app/customer/payments/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../app/business/payments/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../app/admin/payments/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../apps/mobile/src/api/payments.ts", import.meta.url), "utf8"),
  ]);
  assert.match(customerMedia, /CustomerProfile|avatar|media/i);
  assert.match(businessMedia, /BusinessMedia|media/i);
  for (const source of [customerPayments, businessPayments, adminPayments]) {
    assert.match(source, /payment/i);
    assert.doesNotMatch(source, /cardNumber|\bcvv\b|\bcvc\b/i);
  }
  assert.match(mobile, /api\/mobile\/payments/);
  assert.doesNotMatch(mobile, /cardNumber|\bcvv\b|\bcvc\b/i);
});

test(
  "unauthenticated live Stage 5 APIs fail closed and public capabilities report no provider",
  { skip: baseUrl ? false : "a Stage 5 HTTP base URL is required" },
  async () => {
    for (const [path, expectedStatus] of [
      ["/api/storage/customer/assets?limit=1", 403],
      ["/api/media/customer/profile", 403],
      ["/api/payments/customer/capabilities", 401],
      ["/api/mobile/payments/intents?limit=1", 401],
    ] as const) {
      const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
      assert.equal(response.status, expectedStatus, `${path}: ${response.status}`);
      assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
      const body = await response.text();
      assert.doesNotMatch(
        body,
        /PrismaClient|postgresql:\/\/|DATABASE_URL|BETTER_AUTH_SECRET|node_modules/i,
      );
    }

    const capabilities = await fetch(`${baseUrl}/api/media/capabilities`, {
      redirect: "manual",
    });
    assert.equal(capabilities.status, 200);
    assert.equal(capabilities.headers.get("cache-control"), "private, no-store, max-age=0");
    const payload = (await capabilities.json()) as {
      data: { directUploadAvailable: boolean; providerConfigured: boolean };
    };
    assert.equal(payload.data.providerConfigured, false);
    assert.equal(payload.data.directUploadAvailable, false);
  },
);

function escapeRegex(value: string) {
  return value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
}
