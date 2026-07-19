import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import {
  COMMUNICATION_CURSOR_ENVELOPE_VERSION,
  communicationAdminCursorScope,
  communicationCursorFilterFingerprint,
  decodeAttemptCursor,
  decodeCampaignCursor,
  decodeDeliveryCursor,
  encodeAttemptCursor,
  encodeCampaignCursor,
  encodeDeliveryCursor,
} from "../../../features/communications/domain/cursor";
import {
  COMMUNICATION_CURSOR_MAC_BYTES,
  COMMUNICATION_CURSOR_SIGNING_INFO,
  setCommunicationCursorSigningSecretForTests,
} from "../../../features/communications/domain/cursor-signing";
import {
  ROTATED_COMMUNICATION_CURSOR_SECRET,
  TEST_COMMUNICATION_CURSOR_SECRET,
} from "../helpers/cursor-secret";

type Envelope = Record<string, unknown> & { mac: string };

const invalid = /cursor is invalid/i;
const campaignId = randomUUID();
const deliveryId = randomUUID();
const otherCampaignId = randomUUID();
const otherDeliveryId = randomUUID();
const adminScope = communicationAdminCursorScope({
  adminAccessId: randomUUID(),
  personId: randomUUID(),
  source: "database",
  userId: randomUUID(),
});
const otherAdminScope = communicationAdminCursorScope({
  adminAccessId: randomUUID(),
  personId: randomUUID(),
  source: "database",
  userId: randomUUID(),
});
const filterFingerprint = communicationCursorFilterFingerprint({ status: "DRAFT" });
const otherFilterFingerprint = communicationCursorFilterFingerprint({ status: null });
const snapshot = "2026-07-19T12:00:00.000000Z";
const sortTimestamp = "2026-07-19T11:00:00.000000Z";
const authoritativeNow = "2026-07-19T13:00:00.000000Z";
const common = {
  adminScope,
  filterFingerprint,
  pageSize: 20,
  snapshot,
  sortTimestamp,
  tieBreakerId: randomUUID(),
};

test("communication cursor v3 uses authenticated canonical envelopes", { concurrency: false }, async (t) => {
  setCommunicationCursorSigningSecretForTests(TEST_COMMUNICATION_CURSOR_SECRET);
  t.after(() => setCommunicationCursorSigningSecretForTests(undefined));

  const campaignCursor = encodeCampaignCursor(common);
  const deliveryCursor = encodeDeliveryCursor({ ...common, parentId: campaignId });
  const attemptCursor = encodeAttemptCursor({ ...common, parentId: deliveryId });

  await t.test("valid Campaign, Delivery, and Attempt cursors use fixed-length version-3 MACs", () => {
    for (const cursor of [campaignCursor, deliveryCursor, attemptCursor]) {
      const envelope = decodeEnvelope(cursor);
      assert.equal(envelope.version, COMMUNICATION_CURSOR_ENVELOPE_VERSION);
      assert.equal(envelope.mac.length, COMMUNICATION_CURSOR_MAC_BYTES * 2);
      assert.match(envelope.mac, /^[a-f0-9]{64}$/);
      assert.equal("checksum" in envelope, false);
    }
    assert.equal(COMMUNICATION_CURSOR_SIGNING_INFO, "rezno:communications:cursor-signing:v3");
    assert.equal(decodeCampaignCursor(campaignCursor, campaignExpectation(), authoritativeNow).version, 3);
    assert.equal(decodeDeliveryCursor(deliveryCursor, deliveryExpectation(), authoritativeNow).parentId, campaignId);
    assert.equal(decodeAttemptCursor(attemptCursor, attemptExpectation(), authoritativeNow).parentId, deliveryId);
  });

  await t.test("canonical MAC input is stable when envelope JSON fields are reordered", () => {
    const envelope = decodeEnvelope(campaignCursor);
    const reordered = {
      mac: envelope.mac,
      tieBreakerId: envelope.tieBreakerId,
      sortTimestamp: envelope.sortTimestamp,
      snapshotTimestamp: envelope.snapshotTimestamp,
      parentId: envelope.parentId,
      pageSize: envelope.pageSize,
      filterFingerprint: envelope.filterFingerprint,
      adminScope: envelope.adminScope,
      kind: envelope.kind,
      version: envelope.version,
    };
    assert.equal(
      decodeCampaignCursor(encodeEnvelope(reordered), campaignExpectation(), authoritativeNow).tieBreakerId,
      common.tieBreakerId,
    );
  });

  await t.test("version 1 and unsupported versions are rejected without downgrade", () => {
    const legacy: Record<string, unknown> = { ...decodeEnvelope(campaignCursor) };
    delete legacy.mac;
    legacy.version = 1;
    legacy.checksum = oldPublicChecksum(legacy);
    assert.throws(() => decodeCampaignCursor(encodeEnvelope(legacy), campaignExpectation(), authoritativeNow), invalid);
    assert.throws(() => decodeCampaignCursor(forge(campaignCursor, { version: 2 }), campaignExpectation(), authoritativeNow), invalid);
  });

  await t.test("a recomputed public SHA cannot forge any authenticated cursor field", () => {
    const campaignForgeries = [
      { filterFingerprint: otherFilterFingerprint },
      { pageSize: 50 },
      { snapshotTimestamp: "2026-07-19T12:30:00.000000Z" },
      { sortTimestamp: "2026-07-19T10:30:00.000000Z" },
      { kind: "OUTBOUND_DELIVERY_CURSOR" },
      { adminScope: otherAdminScope },
    ];
    for (const changes of campaignForgeries) {
      assert.throws(() => decodeCampaignCursor(
        forgeWithOldPublicChecksum(campaignCursor, changes),
        campaignExpectation(),
        authoritativeNow,
      ), invalid);
    }
    assert.throws(() => decodeDeliveryCursor(
      forgeWithOldPublicChecksum(deliveryCursor, { parentId: otherCampaignId }),
      deliveryExpectation(),
      authoritativeNow,
    ), invalid);
    assert.throws(() => decodeAttemptCursor(
      forgeWithOldPublicChecksum(attemptCursor, { parentId: otherDeliveryId }),
      attemptExpectation(),
      authoritativeNow,
    ), invalid);
  });

  await t.test("MAC bit flips, truncation, oversizing, invalid encoding, and payload reuse fail", () => {
    const campaignEnvelope = decodeEnvelope(campaignCursor);
    const deliveryEnvelope = decodeEnvelope(deliveryCursor);
    const flipped = `${campaignEnvelope.mac[0] === "0" ? "1" : "0"}${campaignEnvelope.mac.slice(1)}`;
    for (const mac of [
      flipped,
      campaignEnvelope.mac.slice(0, -2),
      campaignEnvelope.mac.repeat(3),
      `${campaignEnvelope.mac.slice(0, -1)}!`,
      deliveryEnvelope.mac,
    ]) {
      assert.throws(() => decodeCampaignCursor(
        forge(campaignCursor, { mac }),
        campaignExpectation(),
        authoritativeNow,
      ), invalid);
    }
  });

  await t.test("wrong-key MAC and secret rotation invalidate outstanding cursors", () => {
    setCommunicationCursorSigningSecretForTests(ROTATED_COMMUNICATION_CURSOR_SECRET);
    assert.throws(() => decodeCampaignCursor(campaignCursor, campaignExpectation(), authoritativeNow), invalid);
    const rotatedCursor = encodeCampaignCursor(common);
    setCommunicationCursorSigningSecretForTests(TEST_COMMUNICATION_CURSOR_SECRET);
    assert.throws(() => decodeCampaignCursor(rotatedCursor, campaignExpectation(), authoritativeNow), invalid);
  });

  await t.test("missing, short, low-entropy, and repository-placeholder secrets fail closed", () => {
    for (const secret of [
      null,
      "too-short",
      "x".repeat(32),
      "replace-with-at-least-32-random-characters",
      "better-auth-secret-12345678901234567890",
    ]) {
      setCommunicationCursorSigningSecretForTests(secret);
      assert.throws(() => decodeCampaignCursor(campaignCursor, campaignExpectation(), authoritativeNow), invalid);
      assert.throws(() => encodeCampaignCursor(common), invalid);
    }
    setCommunicationCursorSigningSecretForTests(TEST_COMMUNICATION_CURSOR_SECRET);
  });

  await t.test("scope, parent, filter, page size, future snapshot, and malformed input stay rejected", () => {
    assert.throws(() => decodeCampaignCursor(campaignCursor, {
      ...campaignExpectation(), adminScope: otherAdminScope,
    }, authoritativeNow), invalid);
    assert.throws(() => decodeDeliveryCursor(deliveryCursor, {
      ...deliveryExpectation(), parentId: otherCampaignId,
    }, authoritativeNow), invalid);
    assert.throws(() => decodeAttemptCursor(attemptCursor, {
      ...attemptExpectation(), parentId: otherDeliveryId,
    }, authoritativeNow), invalid);
    assert.throws(() => decodeCampaignCursor(campaignCursor, {
      ...campaignExpectation(), filterFingerprint: otherFilterFingerprint,
    }, authoritativeNow), invalid);
    assert.throws(() => decodeCampaignCursor(campaignCursor, {
      ...campaignExpectation(), pageSize: 50,
    }, authoritativeNow), invalid);
    const futureCursor = encodeCampaignCursor({
      ...common,
      snapshot: "2026-07-19T14:00:00.000000Z",
      sortTimestamp: "2026-07-19T13:30:00.000000Z",
    });
    assert.throws(() => decodeCampaignCursor(futureCursor, campaignExpectation(), authoritativeNow), invalid);
    assert.throws(() => decodeCampaignCursor("malformed", campaignExpectation(), authoritativeNow), invalid);
  });
});

function campaignExpectation() {
  return { adminScope, filterFingerprint, pageSize: 20 };
}

function deliveryExpectation() {
  return { ...campaignExpectation(), parentId: campaignId };
}

function attemptExpectation() {
  return { ...campaignExpectation(), parentId: deliveryId };
}

function decodeEnvelope(cursor: string): Envelope {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Envelope;
}

function encodeEnvelope(envelope: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

function forge(cursor: string, changes: Record<string, unknown>): string {
  return encodeEnvelope({ ...decodeEnvelope(cursor), ...changes });
}

function forgeWithOldPublicChecksum(
  cursor: string,
  changes: Record<string, unknown>,
): string {
  const envelope = { ...decodeEnvelope(cursor), ...changes };
  envelope.mac = oldPublicChecksum(envelope);
  return encodeEnvelope(envelope);
}

function oldPublicChecksum(envelope: Record<string, unknown>): string {
  const legacyCore = {
    adminScope: envelope.adminScope,
    filterFingerprint: envelope.filterFingerprint,
    kind: envelope.kind,
    pageSize: envelope.pageSize,
    parentId: envelope.parentId,
    snapshotTimestamp: envelope.snapshotTimestamp,
    sortTimestamp: envelope.sortTimestamp,
    tieBreakerId: envelope.tieBreakerId,
  };
  return createHash("sha256")
    .update(`rezno-communications-cursor:${JSON.stringify(legacyCore)}`)
    .digest("hex");
}
