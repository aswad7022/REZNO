import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { campaignCategories } from "../../../features/communications/domain/contracts";
import { STAGE_4_CLOSURE } from "../../../features/communications/domain/stage4-closure";
import { resolveOutboundProvider } from "../../../features/communications/providers/provider";
import type { MessageActor } from "../../../features/messages/domain/contracts";
import {
  decodeMessageCursor,
  encodeMessageCursor,
  messageFilterFingerprint,
} from "../../../features/messages/domain/cursor";
import {
  MESSAGE_CURSOR_SIGNING_INFO,
  setMessageCursorSigningSecretForTests,
} from "../../../features/messages/domain/cursor-signing";
import { MessageDomainError } from "../../../features/messages/domain/errors";
import {
  notificationCategories,
  notificationDestinationKinds,
  notificationEventKey,
  notificationScopeKey,
} from "../../../features/notifications/domain/contracts";
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
  notificationFilterFingerprint,
} from "../../../features/notifications/domain/cursor";
import {
  NOTIFICATION_CURSOR_SIGNING_INFO,
  setNotificationCursorSigningSecretForTests,
} from "../../../features/notifications/domain/cursor-signing";
import { NotificationDomainError } from "../../../features/notifications/domain/errors";
import { COMMUNICATION_CURSOR_SIGNING_INFO } from "../../../features/communications/domain/cursor-signing";
import {
  ROTATED_MESSAGE_CURSOR_SECRET,
  ROTATED_NOTIFICATION_CURSOR_SECRET,
  TEST_MESSAGE_CURSOR_SECRET,
  TEST_NOTIFICATION_CURSOR_SECRET,
} from "../../helpers/stage4-cursor-secret";
import {
  stage4ClosureIds,
  STAGE4_CLOSURE_CONFIRMATION_ENV,
  STAGE4_CLOSURE_FIXTURE,
  validateStage4ClosureEnvironment,
} from "../../../scripts/staging/stage4-communications-closure-fixture";

const ids = Array.from({ length: 12 }, () => randomUUID());
const now = "2026-07-19T12:00:00.000000Z";
const customer = {
  mode: "customer" as const,
  personId: ids[0]!,
};
const messageCustomer: MessageActor = {
  kind: "customer",
  personId: ids[0]!,
  userId: "closure-customer",
};
const business: MessageActor = {
  kind: "business",
  membershipId: ids[1]!,
  organizationId: ids[2]!,
  personId: ids[3]!,
  roleId: ids[4]!,
  systemRole: "OWNER",
  userId: "closure-owner",
};

test("Gate 4D registry locks ownership, invariants, provider truth, and later-stage boundaries", () => {
  assert.deepEqual(Object.values(STAGE_4_CLOSURE.gates), ["ACCEPTED", "ACCEPTED", "ACCEPTED", "ACTIVE"]);
  assert.equal(STAGE_4_CLOSURE.identity.includes("CURRENT_MEMBERSHIP_ROLE"), true);
  assert.equal(STAGE_4_CLOSURE.state.includes("AUTHORITATIVE_MARK_ALL_SNAPSHOT"), true);
  assert.equal(STAGE_4_CLOSURE.exactOnce.includes("CAMPAIGN_PERSON_CHANNEL_DELIVERY"), true);
  assert.equal(STAGE_4_CLOSURE.providers.EMAIL, "NOT_CONFIGURED");
  assert.equal(STAGE_4_CLOSURE.providers.SMS, "NOT_CONFIGURED");
  assert.equal(STAGE_4_CLOSURE.providers.PUSH, "NOT_CONFIGURED");
  assert.equal(STAGE_4_CLOSURE.scheduler.automaticProductionScheduler, "NOT_CONNECTED");
  assert.equal(STAGE_4_CLOSURE.scheduler.batchMaximum, 50);
  assert.equal(STAGE_4_CLOSURE.deferred.stage5.includes("ATTACHMENTS"), true);
  assert.equal(STAGE_4_CLOSURE.deferred.stage6.includes("AUTOMATIC_SCHEDULER"), true);
  assert.equal(STAGE_4_CLOSURE.deferred.stage7.includes("PHYSICAL_DEVICE_QA"), true);
  assert.equal(STAGE_4_CLOSURE.deferred.stage8.includes("BROAD_VISUAL_REDESIGN"), true);
  assert.equal(STAGE_4_CLOSURE.deferred.ai.includes("ASSISTANT"), true);
});

test("Gate 4A and Gate 4C categories, destinations, and event identities remain canonical", () => {
  assert.deepEqual(campaignCategories, notificationCategories);
  for (const destination of [
    "NOTIFICATIONS",
    "CUSTOMER_MESSAGES",
    "CUSTOMER_ACCOUNT",
    "BUSINESS_MESSAGES",
    "BUSINESS_NOTIFICATIONS",
  ] as const) assert.equal(notificationDestinationKinds.includes(destination), true);
  assert.equal(notificationDestinationKinds.some((kind) => /https|javascript|data:/i.test(kind)), false);
  const input = {
    audience: "USER" as const,
    eventType: "admin.communication_campaign",
    recipientPersonId: ids[0],
    sourceId: ids[5],
    sourceType: "ADMIN_ANNOUNCEMENT" as const,
  };
  assert.equal(notificationEventKey(input), notificationEventKey({ ...input }));
  assert.notEqual(notificationEventKey(input), notificationEventKey({ ...input, recipientPersonId: ids[6] }));
});

test("Stage 4 error code registry exactly reflects the stable domain sources", async () => {
  const sources = await Promise.all([
    readFile(new URL("../../../features/notifications/domain/errors.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../features/messages/domain/errors.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../features/communications/domain/errors.ts", import.meta.url), "utf8"),
  ]);
  for (const [index, family] of (["notification", "message", "communication"] as const).entries()) {
    const source = sources[index]!;
    const found = [...source.matchAll(/^\s*\| "([A-Z_]+)"/gm)].map((match) => match[1]);
    assert.deepEqual(found, [...STAGE_4_CLOSURE.errors[family]]);
  }
});

test("message-arrival copy and Admin campaign audits remain content-redacted", async () => {
  const [delivery, campaign, dispatcher] = await Promise.all([
    readFile(new URL("../../../features/messages/services/delivery-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../features/communications/services/campaigns.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../features/communications/services/dispatcher.ts", import.meta.url), "utf8"),
  ]);
  assert.match(delivery, /A new message is waiting\. Open the conversation to read it\./);
  assert.doesNotMatch(delivery, /body:\s*message\.body[\s\S]{0,500}eventType:\s*"message\.received"/);
  const auditBlock = campaign.slice(campaign.indexOf("export async function recordCampaignMutation"), campaign.indexOf("export async function mutationReplay"));
  assert.doesNotMatch(auditBlock, /localizedContent|plainText|inApp|email|sms|push/i);
  assert.match(auditBlock, /targetPersonId/);
  assert.match(dispatcher, /notificationEventKey\([\s\S]{0,400}admin\.communication_campaign/);
});

test("all Stage 4 cursor signers are server-only and domain-separated", async () => {
  const paths = [
    "../../../features/notifications/domain/cursor-signing.ts",
    "../../../features/messages/domain/cursor-signing.ts",
    "../../../features/communications/domain/cursor-signing.ts",
  ];
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of sources) {
    assert.match(source, /^import "server-only";/);
    assert.match(source, /hkdfSync/);
    assert.match(source, /timingSafeEqual/);
    assert.match(source, /NODE_ENV === "production"/);
  }
  assert.equal(new Set([
    NOTIFICATION_CURSOR_SIGNING_INFO,
    MESSAGE_CURSOR_SIGNING_INFO,
    COMMUNICATION_CURSOR_SIGNING_INFO,
  ]).size, 3);
  assert.equal(NOTIFICATION_CURSOR_SIGNING_INFO, "rezno:notifications:cursor-signing:v3");
  assert.equal(MESSAGE_CURSOR_SIGNING_INFO, "rezno:messages:cursor-signing:v3");
  assert.equal(COMMUNICATION_CURSOR_SIGNING_INFO, "rezno:communications:cursor-signing:v3");
});

test("Notification cursor v3 rejects public-SHA forgery, tamper, scope reuse, future time, and key rotation", { concurrency: false }, (t) => {
  setNotificationCursorSigningSecretForTests(TEST_NOTIFICATION_CURSOR_SECRET);
  t.after(() => setNotificationCursorSigningSecretForTests(undefined));
  const filter = notificationFilterFingerprint({ category: "MESSAGES", filter: "unread" });
  const expectation = { context: customer, filter, pageSize: 20 };
  const cursor = encodeNotificationCursor({
    filter,
    id: ids[5]!,
    pageSize: 20,
    scope: notificationScopeKey(customer),
    snapshot: "2026-07-19T11:00:00.000000Z",
    sortValue: "2026-07-19T10:00:00.000000Z",
  });
  assert.equal(decodeNotificationCursor(cursor, expectation, now).version, 3);
  for (const attack of [
    forgeSha(cursor, { scope: `customer:${ids[6]}` }),
    forgeSha(cursor, { pageSize: 10 }),
    forgeSha(cursor, { filter: notificationFilterFingerprint({ filter: "read" }) }),
    forgeSha(cursor, { snapshot: "2026-07-19T11:30:00.000000Z" }),
    forge(cursor, { kind: "MESSAGE_CURSOR" }),
    forge(cursor, { version: 1 }),
    forge(cursor, { version: 2 }),
    forge(cursor, { mac: flipMac(cursor) }),
    "malformed",
  ]) assert.throws(() => decodeNotificationCursor(attack, expectation, now), NotificationDomainError);
  const future = encodeNotificationCursor({
    filter,
    id: ids[5]!,
    pageSize: 20,
    scope: notificationScopeKey(customer),
    snapshot: "2026-07-19T12:00:00.001000Z",
    sortValue: "2026-07-19T11:00:00.000000Z",
  });
  assert.throws(() => decodeNotificationCursor(future, expectation, now), NotificationDomainError);
  setNotificationCursorSigningSecretForTests(ROTATED_NOTIFICATION_CURSOR_SECRET);
  assert.throws(() => decodeNotificationCursor(cursor, expectation, now), NotificationDomainError);
});

test("Conversation and Message cursor v3 rejects actor, role, resource, kind, public-SHA, and wrong-key reuse", { concurrency: false }, (t) => {
  setMessageCursorSigningSecretForTests(TEST_MESSAGE_CURSOR_SECRET);
  t.after(() => setMessageCursorSigningSecretForTests(undefined));
  const filter = messageFilterFingerprint({ mode: "unread" });
  const expectation = { actor: messageCustomer, filter, kind: "conversation" as const, pageSize: 20 };
  const cursor = encodeMessageCursor({
    filter,
    id: ids[5]!,
    kind: "conversation",
    pageSize: 20,
    scope: "customer:" + ids[0],
    snapshot: "2026-07-19T11:00:00.000000Z",
    sortValue: "2026-07-19T10:00:00.000000Z",
  });
  assert.equal(decodeMessageCursor(cursor, expectation, now).version, 3);
  assert.throws(() => decodeMessageCursor(cursor, { ...expectation, actor: business }, now), MessageDomainError);
  assert.throws(() => decodeMessageCursor(cursor, { ...expectation, pageSize: 10 }, now), MessageDomainError);
  assert.throws(() => decodeMessageCursor(cursor, { ...expectation, filter: messageFilterFingerprint({ mode: "all" }) }, now), MessageDomainError);
  for (const attack of [
    forgeSha(cursor, { scope: "customer:" + ids[6] }),
    forgeSha(cursor, { kind: "MESSAGE_CURSOR", conversationId: ids[7] }),
    forge(cursor, { version: 1 }),
    forge(cursor, { version: 2 }),
    forge(cursor, { mac: flipMac(cursor) }),
    "malformed",
  ]) assert.throws(() => decodeMessageCursor(attack, expectation, now), MessageDomainError);
  setMessageCursorSigningSecretForTests(ROTATED_MESSAGE_CURSOR_SECRET);
  assert.throws(() => decodeMessageCursor(cursor, expectation, now), MessageDomainError);
});

test("production providers remain truthful and never imply human delivery", async () => {
  for (const channel of ["EMAIL", "SMS", "PUSH"] as const) {
    const result = await resolveOutboundProvider(channel).send({
      channel,
      deliveryId: ids[7]!,
      endpoint: "redacted@example.invalid",
      locale: "EN",
      plainText: "Safe test content",
      providerIdempotencyKey: `closure:${channel}`,
      safePlatformHref: "/notifications",
    });
    assert.equal(result.outcome, "NOT_CONFIGURED");
    assert.equal(result.providerMessageId, null);
    assert.equal(result.safeCode, "PROVIDER_NOT_CONFIGURED");
  }
});

test("AR, EN, and CKB Stage 4 localization keys are complete and mobile maps retain all locales", async () => {
  const [arRaw, enRaw, ckbRaw, mobileNotifications, mobileMessages] = await Promise.all([
    readFile(new URL("../../../messages/ar.json", import.meta.url), "utf8"),
    readFile(new URL("../../../messages/en.json", import.meta.url), "utf8"),
    readFile(new URL("../../../messages/ckb.json", import.meta.url), "utf8"),
    readFile(new URL("../../../apps/mobile/src/screens/customer-notification-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../apps/mobile/src/screens/customer-messaging-center.tsx", import.meta.url), "utf8"),
  ]);
  const locales = [arRaw, enRaw, ckbRaw].map((raw) => JSON.parse(raw).Stage4Communications as Record<string, string>);
  assert.deepEqual(Object.keys(locales[0]!).sort(), Object.keys(locales[1]!).sort());
  assert.deepEqual(Object.keys(locales[1]!).sort(), Object.keys(locales[2]!).sort());
  for (const locale of locales) {
    assert.equal(Object.values(locale).every((value) => typeof value === "string" && value.trim().length > 0), true);
  }
  for (const source of [mobileNotifications, mobileMessages]) {
    for (const locale of ["ar:", "ckb:", "en:"]) assert.match(source, new RegExp(locale));
    assert.doesNotMatch(source, /\btr:/);
  }
});

test("Gate 4D staging fixture is exact-ID, deterministic, confirmation-gated, and production-refusing", async () => {
  const allowed = {
    DATABASE_URL: "postgresql://placeholder.invalid/rezno_staging",
    NODE_ENV: "test",
    REZNO_ENV: "staging",
    [STAGE4_CLOSURE_CONFIRMATION_ENV]: STAGE4_CLOSURE_FIXTURE,
  } as NodeJS.ProcessEnv;
  assert.deepEqual(validateStage4ClosureEnvironment(allowed), { database: "rezno_staging" });
  for (const environment of [
    { ...allowed, [STAGE4_CLOSURE_CONFIRMATION_ENV]: "wrong" },
    { ...allowed, DATABASE_URL: "mysql://placeholder.invalid/rezno_staging" },
    { ...allowed, DATABASE_URL: "postgresql://placeholder.invalid/rezno" },
    { ...allowed, DATABASE_URL: "postgresql://placeholder.invalid/rezno_production" },
    { ...allowed, REZNO_ENV: "live" },
    { ...allowed, NODE_ENV: "production" },
  ]) assert.throws(() => validateStage4ClosureEnvironment(environment as NodeJS.ProcessEnv));
  const values = JSON.stringify(stage4ClosureIds);
  assert.equal(new Set(values.match(/[a-f0-9]{8}-[a-f0-9-]{27}/g) ?? []).size > 30, true);
  const source = await readFile(new URL("../../../scripts/staging/stage4-communications-closure-fixture.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /randomUUID|migrate reset|db push|TRUNCATE|deleteMany\(\{\s*\}\)/i);
  assert.match(source, /ownership collision/);
  assert.match(source, /stage4ClosureFingerprint/);
  assert.match(source, /The exact rezno_staging database is required/);
  assert.match(source, /cleanupStage4ClosureFixture/);
  assert.match(source, /localizedContent: fixtureNotificationLocalizedContent/);
  assert.match(source, /const fixtureNotificationLocalizedContent = \{\s*AR: \{ title:/);
  assert.match(source, /const fixtureLocalizedContent = \{\s*AR: \{ inApp:/);
  const smokeSource = await readFile(new URL("../../../scripts/staging/smoke-stage4-communications-closure.ts", import.meta.url), "utf8");
  assert.match(smokeSource, /groupBy\(\{[\s\S]*orderBy: \{ status: "asc" \}/);
});

function envelope(cursor: string) {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown> & { mac: string };
}

function encode(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function forge(cursor: string, changes: Record<string, unknown>) {
  return encode({ ...envelope(cursor), ...changes });
}

function forgeSha(cursor: string, changes: Record<string, unknown>) {
  const changed = { ...envelope(cursor), ...changes };
  const { mac: _mac, ...core } = changed;
  void _mac;
  return encode({
    ...changed,
    mac: createHash("sha256").update(JSON.stringify(core)).digest("hex"),
  });
}

function flipMac(cursor: string) {
  const mac = envelope(cursor).mac;
  return `${mac[0] === "0" ? "1" : "0"}${mac.slice(1)}`;
}
