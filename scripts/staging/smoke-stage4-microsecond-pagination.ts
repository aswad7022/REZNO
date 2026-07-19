import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import type { CommunicationAdminContext } from "../../features/communications/services/admin-actor";
import { CommunicationDomainError } from "../../features/communications/domain/errors";
import { getCampaignPage } from "../../features/communications/services/campaigns";
import { getAttemptPage, getDeliveryPage } from "../../features/communications/services/reporting";
import type { CustomerMessageActor } from "../../features/messages/domain/contracts";
import { listConversations, listMessages } from "../../features/messages/services/query-service";
import type { NotificationActorContext } from "../../features/notifications/domain/contracts";
import { NotificationDomainError } from "../../features/notifications/domain/errors";
import { listNotificationInbox } from "../../features/notifications/services/inbox-service";
import { prisma } from "../../lib/db/prisma";
import {
  stage4ClosureIds,
  STAGE4_CLOSURE_FIXTURE,
  validateStage4ClosureEnvironment,
} from "./stage4-communications-closure-fixture";

const EXACT_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const SUBJECT_PREFIX = "gate4d-staging-microsecond";
const notificationIds = ids("e4000000", 7);
const messageIds = ids("e5000000", 7);
const campaignIds = ids("e6000000", 7);
const deliveryIds = ids("e7000000", 7);
const attemptIds = ids("e8000000", 5);
const conversationIds = ids("e9000000", 7);
const unreadMessageIds = ids("ea000000", 6);
const postSnapshotNotificationId = "eb000000-0000-4000-8000-000000000001";
const expectedSeven = <T>(values: T[]) => [...values.slice(0, 5), values[6]!, values[5]!];
const expectedFive = <T>(values: T[]) => [...values.slice(0, 3), values[4]!, values[3]!];
let smokeStage = "INITIALIZATION";

async function main() {
  smokeStage = "ENVIRONMENT";
  validateStage4ClosureEnvironment(process.env);
  await cleanupPrecisionFixture();

  let cleanup: Awaited<ReturnType<typeof cleanupPrecisionFixture>> | undefined;
  try {
    smokeStage = "SEED";
    const exactTimestamps = await seedPrecisionFixture();
    smokeStage = "PAGINATION";
    const checks = await runPrecisionChecks(exactTimestamps);
    smokeStage = "CLEANUP";
    cleanup = await cleanupPrecisionFixture();
    await assertPrecisionFixtureAbsent();

    const evidence = {
      checks,
      cleanup,
      exactTimestampContract: "YYYY-MM-DDTHH:mm:ss.ffffffZ",
      fixture: `${STAGE4_CLOSURE_FIXTURE}:microsecond-pagination`,
      timestampFingerprint: createHash("sha256").update(JSON.stringify(exactTimestamps)).digest("hex"),
    };
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally {
    if (!cleanup) await cleanupPrecisionFixture();
  }
}

async function seedPrecisionFixture() {
  const prefixRows = await prisma.$queryRaw<Array<{ prefix: string }>>(Prisma.sql`
    SELECT to_char(
      date_trunc('milliseconds', clock_timestamp() - interval '50 milliseconds') AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS'
    ) AS prefix
  `);
  const prefix = prefixRows[0]?.prefix;
  if (!prefix) throw new Error("Exact staging timestamp prefix is unavailable.");
  const exactTimestamps = ["900", "800", "700", "600", "500", "400", "400"].map(
    (suffix) => `${prefix}${suffix}Z`,
  );
  if (!exactTimestamps.every((value) => EXACT_TIMESTAMP_PATTERN.test(value))) {
    throw new Error("Exact staging timestamp generation failed.");
  }

  const customer = stage4ClosureIds.identities["customer-b"];
  const adminUserId = stage4ClosureIds.identities["full-admin"].user;
  await prisma.notification.createMany({
    data: notificationIds.map((id, index) => ({
      audience: "USER",
      body: "Safe staging precision evidence",
      category: "MESSAGES",
      destinationKind: "NOTIFICATIONS",
      eventKey: `${STAGE4_CLOSURE_FIXTURE}:microsecond:notification:${index}`,
      eventType: "gate4d.microsecond.pagination",
      id,
      mandatory: false,
      recipientPersonId: customer.person,
      sourceType: "CONVERSATION",
      title: "Staging precision evidence",
    })),
  });

  await prisma.conversation.createMany({
    data: conversationIds.map((id, index) => ({
      adminUserId,
      customerId: customer.person,
      id,
      identityKey: `${STAGE4_CLOSURE_FIXTURE}:microsecond:conversation:${index}`,
      subject: `${SUBJECT_PREFIX}-${index}`,
      type: "ADMIN_USER",
    })),
  });
  await prisma.message.createMany({
    data: [
      ...messageIds.map((id, index) => ({
        body: `Staging precision Message ${index}`,
        conversationId: conversationIds[0]!,
        id,
        senderUserId: adminUserId,
      })),
      ...unreadMessageIds.map((id, index) => ({
        body: `Staging unread precision Message ${index}`,
        conversationId: conversationIds[index + 1]!,
        id,
        senderUserId: adminUserId,
      })),
    ],
  });

  const localizedContent = {
    EN: { inApp: { body: "Safe staging precision evidence", title: "Gate 4D precision" } },
  } satisfies Prisma.InputJsonValue;
  await prisma.communicationCampaign.createMany({
    data: campaignIds.map((id) => ({
      audience: "USER",
      category: "ADMIN_ANNOUNCEMENT",
      channels: ["IN_APP"],
      createdByAdminUserId: adminUserId,
      destinationKind: "NOTIFICATIONS",
      id,
      localizedContent,
      mandatory: false,
      status: "DRAFT",
      targetPersonId: customer.person,
      updatedByAdminUserId: adminUserId,
    })),
  });

  const people = Object.values(stage4ClosureIds.identities).slice(0, deliveryIds.length);
  await prisma.outboundDelivery.createMany({
    data: deliveryIds.map((id, index) => ({
      campaignId: campaignIds[0]!,
      channel: "EMAIL",
      endpointType: "EMAIL",
      id,
      locale: "EN",
      personId: people[index]!.person,
    })),
  });
  await prisma.outboundDeliveryAttempt.createMany({
    data: attemptIds.map((id, index) => ({
      attemptNumber: index + 1,
      claimOwner: "gate4d-staging-microsecond",
      deliveryId: deliveryIds[0]!,
      id,
      startedAt: new Date(0),
    })),
  });

  await setExactTimestamps("Notification", notificationIds, exactTimestamps);
  await setExactTimestamps("Conversation", conversationIds, exactTimestamps, "lastMessageAt");
  await setExactTimestamps("Message", messageIds, exactTimestamps);
  await setExactTimestamps("CommunicationCampaign", campaignIds, exactTimestamps);
  await setExactTimestamps("OutboundDelivery", deliveryIds, exactTimestamps);
  await setExactTimestamps(
    "OutboundDeliveryAttempt",
    attemptIds,
    [exactTimestamps[0]!, exactTimestamps[1]!, exactTimestamps[2]!, exactTimestamps[3]!, exactTimestamps[3]!],
  );
  return exactTimestamps;
}

async function runPrecisionChecks(exactTimestamps: string[]) {
  const customer = stage4ClosureIds.identities["customer-b"];
  const customerActor: CustomerMessageActor = {
    kind: "customer",
    personId: customer.person,
    userId: customer.user,
  };
  const notificationActor = {
    mode: "customer",
    personId: customer.person,
  } satisfies NotificationActorContext;
  const otherNotificationActor = {
    mode: "customer",
    personId: stage4ClosureIds.identities["customer-a"].person,
  } satisfies NotificationActorContext;
  const adminAccess = await prisma.adminAccess.findUniqueOrThrow({
    where: { userId: stage4ClosureIds.identities["full-admin"].user },
  });
  const admin: CommunicationAdminContext = {
    adminAccessId: adminAccess.id,
    personId: stage4ClosureIds.identities["full-admin"].person,
    source: "database",
    userId: stage4ClosureIds.identities["full-admin"].user,
  };
  const notificationFrom = new Date(exactTimestamps[0]!);

  smokeStage = "NOTIFICATION";
  const firstNotification = await listNotificationInbox(notificationActor, {
    filter: "all",
    from: notificationFrom,
    limit: 1,
  });
  smokeStage = "NOTIFICATION_CURSOR";
  const notificationCursor = requiredCursor(firstNotification.pageInfo.nextCursor);
  const notificationEnvelope = cursorEnvelope(notificationCursor);
  smokeStage = "NOTIFICATION_POST_SNAPSHOT";
  await prisma.notification.create({
    data: {
      audience: "USER",
      body: "Safe post-snapshot staging evidence",
      category: "MESSAGES",
      destinationKind: "NOTIFICATIONS",
      eventKey: `${STAGE4_CLOSURE_FIXTURE}:microsecond:post-snapshot`,
      eventType: "gate4d.microsecond.post-snapshot",
      id: postSnapshotNotificationId,
      mandatory: false,
      recipientPersonId: customer.person,
      sourceType: "CONVERSATION",
      title: "Post-snapshot staging evidence",
    },
  });
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Notification"
    SET "createdAt" = ${notificationEnvelope.snapshot}::timestamptz + interval '1 microsecond'
    WHERE "id" = ${postSnapshotNotificationId}::uuid
  `);
  smokeStage = "NOTIFICATION_CONTINUATION";
  const notifications = await collectNotificationIds(notificationActor, firstNotification, notificationFrom);
  smokeStage = "NOTIFICATION_SEQUENCE";
  assertSequence(
    notifications.filter((id) => notificationIds.includes(id)),
    expectedSeven(notificationIds),
    "Notification",
  );
  if (notifications.includes(postSnapshotNotificationId)) throw new Error("Post-snapshot Notification was admitted.");

  smokeStage = "NOTIFICATION_CROSS_SCOPE";
  await expectFailure(
    () => listNotificationInbox(otherNotificationActor, {
      cursor: notificationCursor,
      filter: "all",
      from: notificationFrom,
      limit: 1,
    }),
    isInvalidNotificationCursor,
  );
  smokeStage = "NOTIFICATION_V1";
  await expectFailure(
    () => listNotificationInbox(notificationActor, {
      cursor: mutateCursor(notificationCursor, { version: 1 }),
      filter: "all",
      from: notificationFrom,
      limit: 1,
    }),
    isInvalidNotificationCursor,
  );
  smokeStage = "NOTIFICATION_V2";
  await expectFailure(
    () => listNotificationInbox(notificationActor, {
      cursor: mutateCursor(notificationCursor, { version: 2 }),
      filter: "all",
      from: notificationFrom,
      limit: 1,
    }),
    isInvalidNotificationCursor,
  );
  smokeStage = "NOTIFICATION_HMAC";
  await expectFailure(
    () => listNotificationInbox(notificationActor, {
      cursor: mutateCursor(notificationCursor, { pageSize: 2 }),
      filter: "all",
      from: notificationFrom,
      limit: 1,
    }),
    isInvalidNotificationCursor,
  );

  smokeStage = "CONVERSATION";
  const conversations = await collectConversationIds(customerActor, "all");
  assertSequence(conversations, expectedSeven(conversationIds), "Conversation");
  const unreadConversations = await collectConversationIds(customerActor, "unread");
  assertSequence(unreadConversations, expectedSeven(conversationIds), "unread Conversation");
  smokeStage = "MESSAGE";
  const messages = await collectMessageIds(customerActor, conversationIds[0]!);
  assertSequence(messages, expectedSeven(messageIds), "Message");

  smokeStage = "CAMPAIGN";
  const campaigns = await collectCampaignIds(admin);
  assertSequence(campaigns.filter((id) => campaignIds.includes(id)), expectedSeven(campaignIds), "Campaign");
  smokeStage = "DELIVERY";
  const deliveries = await collectDeliveryIds(admin);
  assertSequence(deliveries, expectedSeven(deliveryIds), "Delivery");
  smokeStage = "ATTEMPT";
  const attempts = await collectAttemptIds(admin);
  assertSequence(attempts, expectedFive(attemptIds), "Attempt");

  smokeStage = "CROSS_RESOURCE";
  const campaignFirst = await getCampaignPage(admin, { cursor: null, pageSize: 1, status: "DRAFT" });
  const campaignCursor = requiredCursor(campaignFirst.nextCursor);
  await expectFailure(
    () => getDeliveryPage(admin, {
      campaignId: campaignIds[0],
      cursor: campaignCursor,
      pageSize: 1,
      status: null,
    }),
    isInvalidCommunicationCursor,
  );

  return {
    attempt: attempts.length,
    campaign: campaignIds.length,
    committedPartialMillisecondIncluded: true,
    conversation: conversations.length,
    crossResourceRejected: true,
    crossScopeRejected: true,
    delivery: deliveries.length,
    exactEqualUuidTieBreak: true,
    hmacTamperRejected: true,
    message: messages.length,
    noDuplicates: true,
    noSkips: true,
    notification: notificationIds.length,
    postPageOneExcluded: true,
    unreadConversation: unreadConversations.length,
    version1Rejected: true,
    version2Rejected: true,
  };
}

async function collectNotificationIds(
  actor: NotificationActorContext,
  first: Awaited<ReturnType<typeof listNotificationInbox>>,
  from: Date,
) {
  const collected = first.data.map((item) => item.id);
  let cursor = first.pageInfo.nextCursor;
  while (cursor) {
    assertCursorV3(cursor);
    const page = await listNotificationInbox(actor, { cursor, filter: "all", from, limit: 1 });
    collected.push(...page.data.map((item) => item.id));
    cursor = page.pageInfo.nextCursor;
  }
  return collected;
}

async function collectConversationIds(actor: CustomerMessageActor, mode: "all" | "unread") {
  const collected: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await listConversations(actor, { cursor, limit: 1, mode, search: SUBJECT_PREFIX });
    collected.push(...page.data.map((item) => item.id));
    if (page.nextCursor) assertCursorV3(page.nextCursor);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return collected;
}

async function collectMessageIds(actor: CustomerMessageActor, conversationId: string) {
  const collected: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await listMessages(actor, conversationId, { cursor, limit: 1 });
    collected.push(...page.data.map((item) => item.id));
    if (page.nextCursor) assertCursorV3(page.nextCursor);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return collected;
}

async function collectCampaignIds(admin: CommunicationAdminContext) {
  const collected: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await getCampaignPage(admin, { cursor, pageSize: 1, status: "DRAFT" });
    collected.push(...page.items.map((item) => item.id));
    if (page.nextCursor) assertCursorV3(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);
  return collected;
}

async function collectDeliveryIds(admin: CommunicationAdminContext) {
  const collected: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await getDeliveryPage(admin, {
      campaignId: campaignIds[0],
      cursor,
      pageSize: 1,
      status: null,
    });
    collected.push(...page.items.map((item) => item.id));
    if (page.nextCursor) assertCursorV3(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);
  return collected;
}

async function collectAttemptIds(admin: CommunicationAdminContext) {
  const collected: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await getAttemptPage(admin, {
      cursor,
      deliveryId: deliveryIds[0],
      pageSize: 1,
    });
    collected.push(...page.items.map((item) => item.id));
    if (page.nextCursor) assertCursorV3(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);
  return collected;
}

async function setExactTimestamps(
  table: "CommunicationCampaign" | "Conversation" | "Message" | "Notification" | "OutboundDelivery" | "OutboundDeliveryAttempt",
  rowIds: string[],
  timestamps: string[],
  column: "createdAt" | "lastMessageAt" = "createdAt",
) {
  for (let index = 0; index < rowIds.length; index += 1) {
    const tableSql = {
      CommunicationCampaign: Prisma.sql`"CommunicationCampaign"`,
      Conversation: Prisma.sql`"Conversation"`,
      Message: Prisma.sql`"Message"`,
      Notification: Prisma.sql`"Notification"`,
      OutboundDelivery: Prisma.sql`"OutboundDelivery"`,
      OutboundDeliveryAttempt: Prisma.sql`"OutboundDeliveryAttempt"`,
    }[table];
    const columnSql = column === "createdAt" ? Prisma.sql`"createdAt"` : Prisma.sql`"lastMessageAt"`;
    await prisma.$executeRaw(Prisma.sql`
      UPDATE ${tableSql}
      SET ${columnSql} = ${timestamps[index]}::timestamptz
      WHERE "id" = ${rowIds[index]}::uuid
    `);
  }
}

async function cleanupPrecisionFixture() {
  return prisma.$transaction(async (transaction) => ({
    attempts: (await transaction.outboundDeliveryAttempt.deleteMany({ where: { id: { in: attemptIds } } })).count,
    deliveries: (await transaction.outboundDelivery.deleteMany({ where: { id: { in: deliveryIds } } })).count,
    campaigns: (await transaction.communicationCampaign.deleteMany({ where: { id: { in: campaignIds } } })).count,
    messages: (await transaction.message.deleteMany({ where: { id: { in: [...messageIds, ...unreadMessageIds] } } })).count,
    conversations: (await transaction.conversation.deleteMany({ where: { id: { in: conversationIds } } })).count,
    notifications: (await transaction.notification.deleteMany({
      where: { id: { in: [...notificationIds, postSnapshotNotificationId] } },
    })).count,
  }));
}

async function assertPrecisionFixtureAbsent() {
  const counts = await Promise.all([
    prisma.outboundDeliveryAttempt.count({ where: { id: { in: attemptIds } } }),
    prisma.outboundDelivery.count({ where: { id: { in: deliveryIds } } }),
    prisma.communicationCampaign.count({ where: { id: { in: campaignIds } } }),
    prisma.message.count({ where: { id: { in: [...messageIds, ...unreadMessageIds] } } }),
    prisma.conversation.count({ where: { id: { in: conversationIds } } }),
    prisma.notification.count({ where: { id: { in: [...notificationIds, postSnapshotNotificationId] } } }),
  ]);
  if (counts.some((count) => count !== 0)) throw new Error("Precision fixture cleanup was incomplete.");
}

function cursorEnvelope(cursor: string) {
  const envelope = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
    snapshot: string;
    version: number;
  };
  if (envelope.version !== 3 || !EXACT_TIMESTAMP_PATTERN.test(envelope.snapshot)) {
    throw new Error("Cursor does not preserve the exact v3 timestamp contract.");
  }
  return envelope;
}

function assertCursorV3(cursor: string) {
  const envelope = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
  if (envelope.version !== 3) throw new Error("Unexpected staging cursor version.");
  for (const key of ["snapshot", "snapshotTimestamp", "sortTimestamp", "sortValue"]) {
    const value = envelope[key];
    if (typeof value === "string" && !EXACT_TIMESTAMP_PATTERN.test(value)) {
      throw new Error("Staging cursor contains a non-exact timestamp.");
    }
  }
}

function mutateCursor(cursor: string, changes: Record<string, unknown>) {
  const envelope = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
  return Buffer.from(JSON.stringify({ ...envelope, ...changes }), "utf8").toString("base64url");
}

function assertSequence(actual: string[], expected: string[], family: string) {
  if (actual.length !== new Set(actual).size) throw new Error(`${family} pagination returned a duplicate.`);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${family} pagination skipped or reordered a row.`);
}

async function expectFailure(run: () => Promise<unknown>, predicate: (error: unknown) => boolean) {
  try {
    await run();
  } catch (error) {
    if (predicate(error)) return;
    throw error;
  }
  throw new Error("Staging precision smoke expected a safe cursor rejection.");
}

function requiredCursor(cursor: string | null) {
  if (!cursor) throw new Error("Staging precision pagination cursor is missing.");
  return cursor;
}

function ids(prefix: string, count: number) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
}

const isInvalidNotificationCursor = (error: unknown) =>
  error instanceof NotificationDomainError && error.code === "INVALID_CURSOR";
const isInvalidCommunicationCursor = (error: unknown) =>
  error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR";

main()
  .catch(() => {
    process.stderr.write(`Gate 4D microsecond staging smoke failed safely at ${smokeStage}.\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
