import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  effectiveNormalizedAdminPermissions,
  invalidAdminPermissionDependencies,
} from "../../../features/admin/config/permissions";
import {
  campaignFinalStatus,
  communicationRequestHash,
  createCampaignSchema,
  hasUnsafeContent,
  localeFromPersonLanguage,
  preferenceUpdateSchema,
  retryDelayMilliseconds,
  safeEmailHtml,
  scheduleCampaignSchema,
} from "../../../features/communications/domain/validation";
import {
  communicationAdminCursorScope,
  communicationCursorFilterFingerprint,
  decodeAttemptCursor,
  decodeCampaignCursor,
  decodeDeliveryCursor,
  encodeAttemptCursor,
  encodeCampaignCursor,
  encodeDeliveryCursor,
} from "../../../features/communications/domain/cursor";
import { deterministicSinkEnabled } from "../../../features/communications/providers/provider";
import { GATE_4D_BOUNDARY } from "../../../features/communications/domain/contracts";
import { validateCanonicalNotificationEvent } from "../../../features/notifications/domain/contracts";

const localizedContent = {
  AR: { inApp: { title: "عنوان", body: "نص" }, email: { subject: "عنوان", plainText: "نص" }, sms: { text: "نص" }, push: { title: "عنوان", body: "نص" } },
  EN: { inApp: { title: "Title", body: "Body" }, email: { subject: "Subject", plainText: "Body" }, sms: { text: "Text" }, push: { title: "Title", body: "Body" } },
  CKB: { inApp: { title: "ناونیشان", body: "دەق" }, email: { subject: "ناونیشان", plainText: "دەق" }, sms: { text: "دەق" }, push: { title: "ناونیشان", body: "دەق" } },
};

function input(overrides: Record<string, unknown> = {}) {
  return {
    audience: "ALL",
    targetPersonId: null,
    targetOrganizationId: null,
    channels: ["IN_APP", "EMAIL", "SMS", "PUSH"],
    category: "ADMIN_ANNOUNCEMENT",
    priority: "NORMAL",
    mandatory: false,
    destinationKind: "NOTIFICATIONS",
    destinationTargetId: null,
    localizedContent,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

test("Gate 4C domain contracts are strict, bounded, and deterministic", async (t) => {
  await t.test("accepts a complete localized campaign and rejects unknown fields", () => {
    assert.equal(createCampaignSchema.safeParse(input()).success, true);
    assert.equal(createCampaignSchema.safeParse(input({ forgedActorId: randomUUID() })).success, false);
  });

  await t.test("enforces audience targets and destination allowlists", () => {
    assert.equal(createCampaignSchema.safeParse(input({ audience: "USER" })).success, false);
    assert.equal(createCampaignSchema.safeParse(input({ audience: "USER", targetPersonId: randomUUID(), destinationKind: "CUSTOMER_ACCOUNT" })).success, true);
    assert.equal(createCampaignSchema.safeParse(input({ audience: "ALL", destinationKind: "CUSTOMER_ACCOUNT" })).success, false);
    assert.equal(createCampaignSchema.safeParse(input({ audience: "BUSINESS", targetOrganizationId: randomUUID(), targetPersonId: randomUUID() })).success, false);
  });

  await t.test("allows mandatory only for ACCOUNT and rejects duplicate channels", () => {
    assert.equal(createCampaignSchema.safeParse(input({ mandatory: true })).success, false);
    assert.equal(createCampaignSchema.safeParse(input({ category: "ACCOUNT", mandatory: true })).success, true);
    assert.equal(createCampaignSchema.safeParse(input({ channels: ["EMAIL", "EMAIL"] })).success, false);
  });

  await t.test("requires selected copy for every AR, EN, and CKB locale", () => {
    const missing = structuredClone(localizedContent);
    delete (missing.CKB as { email?: unknown }).email;
    assert.equal(createCampaignSchema.safeParse(input({ localizedContent: missing })).success, false);
  });

  await t.test("rejects HTML, scripts, arbitrary URLs, controls, and email header injection", () => {
    for (const unsafe of ["<script>alert(1)</script>", "<b>raw</b>", "javascript:alert(1)", "data:text/html,x", "https://attacker.example/path", "www.attacker.example", "ok\u0000bad"]) {
      assert.equal(hasUnsafeContent(unsafe), true);
    }
    const header = structuredClone(localizedContent);
    header.EN.email.subject = "Subject\r\nBcc: hidden@example.invalid";
    assert.equal(createCampaignSchema.safeParse(input({ localizedContent: header })).success, false);
  });

  await t.test("canonical hashes ignore object key order and bind changed content", () => {
    assert.equal(communicationRequestHash({ b: 2, a: 1 }), communicationRequestHash({ a: 1, b: 2 }));
    assert.notEqual(communicationRequestHash({ a: 1 }), communicationRequestHash({ a: 2 }));
  });

  await t.test("schedule contract accepts canonical UTC only", () => {
    const base = { campaignId: randomUUID(), expectedVersion: 1, idempotencyKey: randomUUID() };
    assert.equal(scheduleCampaignSchema.safeParse({ ...base, scheduledAt: "2026-08-01T12:00:00.000Z" }).success, true);
    assert.equal(scheduleCampaignSchema.safeParse({ ...base, scheduledAt: "2026-08-01T15:00:00+03:00" }).success, false);
  });

  await t.test("preference matrix rejects missing/unknown channels and normalizes duplicates", () => {
    const base = { expectedVersion: 1, idempotencyKey: randomUUID() };
    assert.equal(preferenceUpdateSchema.safeParse({ ...base, categories: { EMAIL: [], SMS: [], PUSH: [] } }).success, true);
    assert.equal(preferenceUpdateSchema.safeParse({ ...base, categories: { EMAIL: [], SMS: [] } }).success, false);
    assert.equal(preferenceUpdateSchema.safeParse({ ...base, categories: { EMAIL: [], SMS: [], PUSH: [], WHATSAPP: [] } }).success, false);
    const normalized = preferenceUpdateSchema.parse({ ...base, categories: { EMAIL: ["MESSAGES", "MESSAGES"], SMS: [], PUSH: [] } });
    assert.deepEqual(normalized.categories.EMAIL, ["MESSAGES"]);
  });

  await t.test("retry policy is stepped and capped at five attempts", () => {
    assert.equal(retryDelayMilliseconds(1), 60_000);
    assert.equal(retryDelayMilliseconds(2), 300_000);
    assert.equal(retryDelayMilliseconds(4), 7_200_000);
    assert.equal(retryDelayMilliseconds(5), null);
  });

  await t.test("campaign final state distinguishes complete, partial, and failed", () => {
    const base = { total: 1, pending: 0, claimed: 0, accepted: 0, retryScheduled: 0, permanentFailure: 0, suppressed: 1, cancelled: 0 };
    assert.equal(campaignFinalStatus(base, false), "COMPLETED");
    assert.equal(campaignFinalStatus({ ...base, suppressed: 0, permanentFailure: 1 }, false), "FAILED");
    assert.equal(campaignFinalStatus({ ...base, total: 2, suppressed: 0, accepted: 1, permanentFailure: 1 }, false), "PARTIAL_FAILURE");
    assert.equal(campaignFinalStatus({ ...base, pending: 1, suppressed: 0 }, false), null);
  });

  await t.test("locale mapping preserves AR/CKB and falls back to EN", () => {
    assert.equal(localeFromPersonLanguage("AR"), "AR");
    assert.equal(localeFromPersonLanguage("KU"), "CKB");
    assert.equal(localeFromPersonLanguage("TR"), "EN");
  });

  await t.test("typed reporting cursors bind kind, Admin, parent, filter, page size, and snapshot", () => {
    const campaignId = randomUUID();
    const deliveryId = randomUUID();
    const adminScope = communicationAdminCursorScope({
      adminAccessId: randomUUID(), personId: randomUUID(), source: "database", userId: randomUUID(),
    });
    const otherAdminScope = communicationAdminCursorScope({
      adminAccessId: randomUUID(), personId: randomUUID(), source: "database", userId: randomUUID(),
    });
    const filterFingerprint = communicationCursorFilterFingerprint({ status: "DRAFT" });
    const snapshot = new Date("2026-07-18T12:00:00.000Z");
    const sortTimestamp = new Date("2026-07-18T11:00:00.000Z");
    const authoritativeNow = new Date("2026-07-18T13:00:00.000Z");
    const common = {
      adminScope, filterFingerprint, pageSize: 20, snapshot, sortTimestamp, tieBreakerId: randomUUID(),
    };
    const campaignCursor = encodeCampaignCursor(common);
    const deliveryCursor = encodeDeliveryCursor({ ...common, parentId: campaignId });
    const attemptCursor = encodeAttemptCursor({ ...common, parentId: deliveryId });

    assert.equal(decodeCampaignCursor(campaignCursor, {
      adminScope, filterFingerprint, pageSize: 20,
    }, authoritativeNow).snapshotDate.toISOString(), snapshot.toISOString());
    assert.equal(decodeDeliveryCursor(deliveryCursor, {
      adminScope, filterFingerprint, pageSize: 20, parentId: campaignId,
    }, authoritativeNow).parentId, campaignId);
    assert.equal(decodeAttemptCursor(attemptCursor, {
      adminScope, filterFingerprint, pageSize: 20, parentId: deliveryId,
    }, authoritativeNow).parentId, deliveryId);

    const invalid = /cursor is invalid/i;
    assert.throws(() => decodeDeliveryCursor(campaignCursor, {
      adminScope, filterFingerprint, pageSize: 20, parentId: campaignId,
    }, authoritativeNow), invalid);
    assert.throws(() => decodeDeliveryCursor(deliveryCursor, {
      adminScope, filterFingerprint, pageSize: 20, parentId: randomUUID(),
    }, authoritativeNow), invalid);
    assert.throws(() => decodeAttemptCursor(attemptCursor, {
      adminScope, filterFingerprint, pageSize: 20, parentId: randomUUID(),
    }, authoritativeNow), invalid);
    assert.throws(() => decodeCampaignCursor(campaignCursor, {
      adminScope: otherAdminScope, filterFingerprint, pageSize: 20,
    }, authoritativeNow), invalid);
    assert.throws(() => decodeCampaignCursor(campaignCursor, {
      adminScope, filterFingerprint: communicationCursorFilterFingerprint({ status: null }), pageSize: 20,
    }, authoritativeNow), invalid);
    assert.throws(() => decodeCampaignCursor(campaignCursor, {
      adminScope, filterFingerprint, pageSize: 50,
    }, authoritativeNow), invalid);
    assert.throws(() => decodeCampaignCursor("not-a-cursor", {
      adminScope, filterFingerprint, pageSize: 20,
    }, authoritativeNow), invalid);

    const tampered = JSON.parse(Buffer.from(campaignCursor, "base64url").toString("utf8")) as Record<string, unknown>;
    tampered.tieBreakerId = randomUUID();
    assert.throws(() => decodeCampaignCursor(Buffer.from(JSON.stringify(tampered)).toString("base64url"), {
      adminScope, filterFingerprint, pageSize: 20,
    }, authoritativeNow), invalid);
    const unsupported = { ...tampered, version: 2 };
    assert.throws(() => decodeCampaignCursor(Buffer.from(JSON.stringify(unsupported)).toString("base64url"), {
      adminScope, filterFingerprint, pageSize: 20,
    }, authoritativeNow), invalid);
    const futureCursor = encodeCampaignCursor({
      ...common,
      snapshot: new Date("2026-07-18T14:00:00.000Z"),
      sortTimestamp: new Date("2026-07-18T13:30:00.000Z"),
    });
    assert.throws(() => decodeCampaignCursor(futureCursor, {
      adminScope, filterFingerprint, pageSize: 20,
    }, authoritativeNow), invalid);
    assert.equal(
      communicationCursorFilterFingerprint({ status: "DRAFT", channel: "EMAIL" }),
      communicationCursorFilterFingerprint({ channel: "EMAIL", status: "DRAFT" }),
    );
  });

  await t.test("safe email HTML escapes plain text", () => {
    const html = safeEmailHtml("A & B < C", "https://rezno.app/customer/notifications");
    assert.match(html, /A &amp; B &lt; C/);
    assert.doesNotMatch(html, /< C/);
  });

  await t.test("deterministic sink requires every non-production guard", () => {
    const allowed = {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://localhost/rezno_stage4c_test",
      REZNO_ENV: "test",
      REZNO_OUTBOUND_SINK: "enabled",
      REZNO_OUTBOUND_SINK_CONFIRM: "rezno-stage4c-sink",
    } as NodeJS.ProcessEnv;
    assert.equal(deterministicSinkEnabled(allowed), true);
    assert.equal(deterministicSinkEnabled({ ...allowed, NODE_ENV: "production" }), false);
    assert.equal(deterministicSinkEnabled({ ...allowed, DATABASE_URL: "postgresql://localhost/rezno_live" }), false);
    assert.equal(deterministicSinkEnabled({ ...allowed, REZNO_OUTBOUND_SINK_CONFIRM: "wrong" }), false);
  });

  await t.test("Admin permission dependencies are transitive", () => {
    assert.deepEqual(effectiveNormalizedAdminPermissions(["COMMUNICATIONS_DISPATCH", "NOTIFICATIONS_SEND"]), []);
    assert.deepEqual(
      effectiveNormalizedAdminPermissions(["COMMUNICATIONS_DISPATCH", "NOTIFICATIONS_SEND", "NOTIFICATIONS_VIEW"]),
      ["COMMUNICATIONS_DISPATCH", "NOTIFICATIONS_SEND", "NOTIFICATIONS_VIEW"],
    );
    assert.deepEqual(invalidAdminPermissionDependencies(["COMMUNICATIONS_DISPATCH"]), [
      { permission: "COMMUNICATIONS_DISPATCH", requires: "NOTIFICATIONS_SEND" },
    ]);
  });

  await t.test("Gate 4D remains an explicit non-started boundary", () => {
    assert.equal(GATE_4D_BOUNDARY.gate4cMustNotStart, true);
    assert.equal(GATE_4D_BOUNDARY.owner, "Gate 4D");
  });

  await t.test("Gate 4A creator binding accepts canonical opaque Better Auth User IDs", () => {
    assert.doesNotThrow(() => validateCanonicalNotificationEvent({
      audience: "ALL",
      body: "Safe body",
      category: "ADMIN_ANNOUNCEMENT",
      createdByUserId: "WV0yfOt6coiQt4NrA3K32wjpTsJd1qYO",
      destinationKind: "NOTIFICATIONS",
      eventKey: `notification:${"a".repeat(64)}`,
      eventType: "admin.communication_campaign",
      mandatory: false,
      priority: "NORMAL",
      sourceId: randomUUID(),
      sourceType: "ADMIN_ANNOUNCEMENT",
      title: "Safe title",
    }));
  });
});
