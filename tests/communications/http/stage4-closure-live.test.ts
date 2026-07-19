import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const baseUrl = process.env.COMMUNICATION_HTTP_BASE_URL ?? process.env.COMMERCE_HTTP_BASE_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const oidcToken = process.env.VERCEL_OIDC_TOKEN ?? "";

function protectedHeaders() {
  const headers = new Headers();
  if (bypass) headers.set("x-vercel-protection-bypass", bypass);
  else if (oidcToken) headers.set("x-vercel-trusted-oidc-idp-token", oidcToken);
  return headers;
}

test("Gate 4D production-route closure matrix remains executable in the Gate 4A–4C live suites", async () => {
  const [notifications, messages, communications] = await Promise.all([
    readFile(new URL("../../notifications/http/notification-center-live.test.ts", import.meta.url), "utf8"),
    readFile(new URL("../../messages/http/messaging-live.test.ts", import.meta.url), "utf8"),
    readFile(new URL("./stage4c-live.test.ts", import.meta.url), "utf8"),
  ]);
  for (const route of [
    "/customer/notifications",
    "/business/notifications",
    "/business/communications",
    "/api/mobile/notifications",
    "/api/mobile/notifications/count",
    "/api/mobile/notifications/mark-all-read",
    "/api/mobile/notifications/preferences",
  ]) assert.match(notifications, new RegExp(escapeRegex(route)));
  for (const route of [
    "/customer/messages",
    "/business/messages",
    "/admin/messages",
    "/api/mobile/messages/conversations",
    "/api/mobile/messages/unread-count",
  ]) assert.match(messages, new RegExp(escapeRegex(route)));
  for (const route of [
    "/admin/communications",
    "/admin/notifications",
    "/api/mobile/notifications/outbound-preferences",
  ]) assert.match(communications, new RegExp(escapeRegex(route)));
  for (const source of [notifications, messages, communications]) {
    assert.match(source, /text\/x-component|\brsc\b/i);
    assert.match(source, /Prisma|postgresql:\/\//);
  }
  assert.match(notifications, /forgePublicShaCursor/);
  assert.match(messages, /forgePublicShaCursor/);
  assert.match(communications, /forgeWithOldPublicChecksum/);
});

test("Gate 4D operational copy uses localized current truth and safe error fallbacks", async () => {
  const [businessHub, editor, adminList, adminDetail, adminError] = await Promise.all([
    readFile(new URL("../../../app/business/communications/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/communications/components/campaign-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../app/admin/communications/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../app/admin/communications/[campaignId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../app/admin/communications/error.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(businessHub, /getTranslations\("Stage4Communications"\)/);
  assert.doesNotMatch(businessHub, /Messaging completion is owned by Stage 4B|deferred to Stage 4C/);
  for (const source of [editor, adminList, adminDetail, adminError]) {
    assert.match(source, /Stage4Communications/);
    assert.doesNotMatch(source, /result\.message/);
  }
  assert.match(editor, /noScheduler/);
  assert.match(editor, /snapshotCreated/);
});

test("unauthenticated live Stage 4 mobile endpoints fail closed", {
  skip: baseUrl ? false : "COMMUNICATION_HTTP_BASE_URL or COMMERCE_HTTP_BASE_URL is required",
}, async () => {
  for (const path of [
    "/api/mobile/notifications?filter=all&limit=1",
    "/api/mobile/notifications/preferences",
    "/api/mobile/notifications/outbound-preferences",
    "/api/mobile/messages/conversations?mode=all&limit=1",
    "/api/mobile/messages/unread-count",
  ]) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: protectedHeaders(),
      redirect: "manual",
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    const body = await response.text();
    assert.doesNotMatch(body, /PrismaClient|postgresql:\/\/|DATABASE_URL|BETTER_AUTH_SECRET|node_modules/i);
  }
});

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
