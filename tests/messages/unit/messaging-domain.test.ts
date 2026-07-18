import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  assertMobileMutationRequest,
  parseConversationListQuery,
  parseMarkConversationReadRequest,
  parseMessageHistoryQuery,
  parseSendMessageRequest,
  parseStartConversationRequest,
} from "../../../features/messages/api/validation";
import type { MessageActor } from "../../../features/messages/domain/contracts";
import {
  decodeMessageCursor,
  encodeMessageCursor,
  messageFilterFingerprint,
} from "../../../features/messages/domain/cursor";
import { MessageDomainError } from "../../../features/messages/domain/errors";
import {
  adminBusinessConversationIdentity,
  adminUserConversationIdentity,
  bookingConversationIdentity,
  generalConversationIdentity,
} from "../../../features/messages/domain/identity";
import { canAccessConversation } from "../../../features/messages/policies/conversation-access";
import { canAccessBusinessMessagesDestination } from "../../../features/notifications/domain/destination-policy";

const ids = Array.from({ length: 10 }, () => randomUUID());
const customer: MessageActor = {
  kind: "customer",
  personId: ids[0]!,
  userId: "customer-user",
};
const owner: MessageActor = {
  kind: "business",
  membershipId: ids[1]!,
  organizationId: ids[2]!,
  personId: ids[3]!,
  roleId: ids[4]!,
  systemRole: "OWNER",
  userId: "owner-user",
};

test("canonical identities are stable, scoped and distinct", () => {
  assert.equal(
    bookingConversationIdentity(ids[5]!),
    `customer-business:booking:${ids[5]}`,
  );
  assert.equal(
    generalConversationIdentity(ids[2]!, ids[0]!),
    `customer-business:general:${ids[2]}:${ids[0]}`,
  );
  assert.notEqual(
    adminUserConversationIdentity("admin", ids[0]!),
    adminBusinessConversationIdentity("admin", ids[2]!),
  );
});

test("participant policy covers Customer, Owner, Manager, Receptionist, Staff and Admin boundaries", () => {
  const general = {
    adminUserId: null,
    businessId: ids[2]!,
    customerId: ids[0]!,
    type: "CUSTOMER_BUSINESS" as const,
  };
  const booking = {
    ...general,
    booking: {
      customerId: ids[0]!,
      memberId: ids[1]!,
      organizationId: ids[2]!,
    },
  };
  assert.equal(canAccessConversation(general, customer), true);
  assert.equal(canAccessConversation(general, owner), true);
  assert.equal(canAccessConversation(general, { ...owner, systemRole: "MANAGER" }), true);
  assert.equal(canAccessConversation(general, { ...owner, systemRole: "RECEPTIONIST" }), false);
  assert.equal(canAccessConversation(general, { ...owner, systemRole: "STAFF" }), false);
  assert.equal(canAccessConversation(booking, { ...owner, systemRole: "RECEPTIONIST" }), true);
  assert.equal(canAccessConversation(booking, { ...owner, systemRole: "STAFF" }), true);
  assert.equal(canAccessConversation(booking, {
    ...owner,
    membershipId: ids[6]!,
    systemRole: "STAFF",
  }), false);
  assert.equal(canAccessConversation(general, {
    kind: "admin",
    userId: "admin",
  }), false);
  const adminUser = {
    adminUserId: "admin",
    businessId: null,
    customerId: ids[0]!,
    type: "ADMIN_USER" as const,
  };
  assert.equal(canAccessConversation(adminUser, { kind: "admin", userId: "admin" }), true);
  assert.equal(canAccessConversation(adminUser, { kind: "admin", userId: "other" }), false);
  assert.equal(canAccessConversation(adminUser, customer), true);
});

test("typed Business Message destinations follow the same booking assignment policy", () => {
  const context = {
    effectiveCommercePermissions: [],
    membershipId: ids[1]!,
    mode: "business" as const,
    organizationId: ids[2]!,
    personId: ids[3]!,
    restaurant: false,
    roleId: ids[4]!,
    systemRole: "STAFF" as const,
  };
  assert.equal(canAccessBusinessMessagesDestination(context), false);
  assert.equal(canAccessBusinessMessagesDestination(context, {
    booking: { memberId: ids[1]!, organizationId: ids[2]! },
    businessId: ids[2]!,
  }), true);
  assert.equal(canAccessBusinessMessagesDestination(context, {
    booking: { memberId: ids[6]!, organizationId: ids[2]! },
    businessId: ids[2]!,
  }), false);
  assert.equal(canAccessBusinessMessagesDestination({
    ...context,
    systemRole: "RECEPTIONIST",
  }, {
    booking: { memberId: null, organizationId: ids[2]! },
    businessId: ids[2]!,
  }), true);
});

test("conversation and Message cursors bind page size, filter, actor and Conversation", () => {
  const filter = messageFilterFingerprint({ mode: "all" });
  const cursor = encodeMessageCursor({
    filter,
    id: ids[5]!,
    kind: "conversation",
    pageSize: 20,
    scope: `customer:${ids[0]}`,
    snapshot: "2026-07-18T10:00:00.000Z",
    sortValue: "2026-07-18T09:00:00.000Z",
  });
  assert.equal(decodeMessageCursor(cursor, {
    actor: customer,
    filter,
    kind: "conversation",
    pageSize: 20,
  }).id, ids[5]);
  for (const expected of [
    { actor: { ...customer, personId: ids[6]! }, filter, kind: "conversation" as const, pageSize: 20 },
    { actor: customer, filter: messageFilterFingerprint({ mode: "unread" }), kind: "conversation" as const, pageSize: 20 },
    { actor: customer, filter, kind: "conversation" as const, pageSize: 10 },
  ]) {
    assert.throws(() => decodeMessageCursor(cursor, expected), MessageDomainError);
  }
  const messageCursor = encodeMessageCursor({
    conversationId: ids[8]!,
    filter: messageFilterFingerprint({ conversationId: ids[8] }),
    id: ids[9]!,
    kind: "message",
    pageSize: 30,
    scope: `customer:${ids[0]}`,
    snapshot: "2026-07-18T10:00:00.000Z",
    sortValue: "2026-07-18T09:00:00.000Z",
  });
  assert.throws(() => decodeMessageCursor(messageCursor, {
    actor: customer,
    conversationId: ids[7]!,
    filter: messageFilterFingerprint({ conversationId: ids[7] }),
    kind: "message",
    pageSize: 30,
  }), MessageDomainError);
});

test("HTTP validation rejects duplicate fields, actor IDs, malformed UUIDs/cursors and unsafe mutation origins", async () => {
  assert.deepEqual(
    parseConversationListQuery(new URLSearchParams("mode=unread&limit=20")),
    { cursor: undefined, limit: 20, mode: "unread", search: undefined },
  );
  assert.deepEqual(parseMessageHistoryQuery(new URLSearchParams("limit=30")), {
    cursor: undefined,
    limit: 30,
  });
  for (const query of ["limit=51", "limit=10&limit=10", "cursor=***", "personId=x"] ) {
    assert.throws(() => parseConversationListQuery(new URLSearchParams(query)), MessageDomainError);
  }
  const key = randomUUID();
  const request = (body: unknown, headers: Record<string, string> = {}) => new Request("https://rezno.invalid/api/mobile/messages", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "idempotency-key": key, ...headers },
    method: "POST",
  });
  assert.deepEqual(await parseSendMessageRequest(request({ body: "hello" })), {
    body: "hello",
    idempotencyKey: key,
  });
  assert.deepEqual(await parseStartConversationRequest(request({
    body: "hello",
    businessId: ids[2],
  })), { body: "hello", businessId: ids[2], idempotencyKey: key });
  assert.deepEqual(await parseMarkConversationReadRequest(request({
    throughMessageId: ids[5],
  })), { throughMessageId: ids[5] });
  await assert.rejects(parseSendMessageRequest(request({ body: "x", personId: ids[0] })), MessageDomainError);
  await assert.rejects(parseStartConversationRequest(request({ body: "x", businessId: "bad" })), MessageDomainError);
  await assert.rejects(parseSendMessageRequest(new Request("https://rezno.invalid", {
    body: JSON.stringify({ body: "x" }),
    headers: { "content-type": "application/json", "idempotency-key": "bad" },
    method: "POST",
  })), MessageDomainError);
  assert.throws(() => assertMobileMutationRequest(request({ body: "x" })), MessageDomainError);
  assert.doesNotThrow(() => assertMobileMutationRequest(request({ body: "x" }, { "expo-origin": "rezno://" })));
});

test("mobile production wiring exposes list, thread, read, send, unread, source navigation and three locales", async () => {
  const [app, api, screen] = await Promise.all([
    readFile(new URL("../../../apps/mobile/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../apps/mobile/src/api/messages.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../apps/mobile/src/screens/customer-messaging-center.tsx", import.meta.url), "utf8"),
  ]);
  for (const token of [
    "messageApi.unreadCount", "CustomerMessagingCenter", "CUSTOMER_MESSAGES",
  ]) assert.match(app, new RegExp(token));
  for (const path of [
    "conversations", "markRead", "messages", "send", "start", "unreadCount",
  ]) assert.match(api, new RegExp(path));
  for (const token of [
    "randomUUID", "markRead", "onOpenSource", "ar:", "ckb:", "en:",
  ]) assert.match(screen, new RegExp(token));
});

test("Stage 4B staging fixture is confirmation-gated, production-refusing, bounded and rerunnable", async () => {
  const [actorService, deliveryService, fixture, queryService, seed, smoke] = await Promise.all([
    readFile(new URL("../../../features/messages/services/actor.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../features/messages/services/delivery-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../scripts/staging/messaging-lifecycle-stage4b-fixture.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../features/messages/services/query-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../scripts/staging/seed-messaging-lifecycle-stage4b.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../scripts/staging/smoke-messaging-lifecycle-stage4b.ts", import.meta.url), "utf8"),
  ]);
  assert.match(actorService, /FOR SHARE OF membership, person, organization, role/);
  assert.match(actorService, /FOR SHARE OF access/);
  assert.match(actorService, /test hooks are unavailable in production/);
  assert.match(deliveryService, /Messaging rate-limit test hooks are unavailable in production/);
  assert.match(deliveryService, /findReplayCandidate[\s\S]+if \(!existing\) enforceStartRate/);
  assert.doesNotMatch(queryService, /\bprisma\./);
  assert.match(queryService, /messagingSerializable/);
  assert.match(fixture, /ownership collision/);
  assert.match(fixture, /fingerprint/);
  assert.match(fixture, /length: 12/);
  assert.match(fixture, /length: 36/);
  assert.match(fixture, /length: 22/);
  assert.match(fixture, /MESSAGES_VIEW/);
  assert.match(fixture, /status: "INACTIVE"/);
  assert.match(fixture, /REZNO_MESSAGING_STAGE4B_FIXTURE/);
  assert.match(seed, /refuses production environments/);
  assert.match(seed, /rezno_staging\|stage4b\|test/);
  assert.match(smoke, /REZNO_MESSAGING_STAGE4B_SMOKE/);
  assert.match(smoke, /INVALID_CURSOR/);
  assert.match(smoke, /reconciled/);
});
