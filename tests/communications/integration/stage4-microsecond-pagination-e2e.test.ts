import assert from "node:assert/strict";
import test from "node:test";

import { Prisma } from "@prisma/client";

import type { NotificationActorContext } from "../../../features/notifications/domain/contracts";
import { setNotificationCursorSigningSecretForTests } from "../../../features/notifications/domain/cursor-signing";
import { listNotificationInbox } from "../../../features/notifications/services/inbox-service";
import { setMessageCursorSigningSecretForTests } from "../../../features/messages/domain/cursor-signing";
import {
  listConversations,
  listMessages,
} from "../../../features/messages/services/query-service";
import { setCommunicationCursorSigningSecretForTests } from "../../../features/communications/domain/cursor-signing";
import type { CommunicationAdminContext } from "../../../features/communications/services/admin-actor";
import {
  createCampaign,
  getCampaignPage,
} from "../../../features/communications/services/campaigns";
import {
  getAttemptPage,
  getDeliveryPage,
} from "../../../features/communications/services/reporting";
import { prisma } from "../../../lib/db/prisma";
import {
  createMessagingFixture,
  resetMessagingTestDatabase,
} from "../../messages/helpers/messaging-fixture";
import {
  TEST_MESSAGE_CURSOR_SECRET,
  TEST_NOTIFICATION_CURSOR_SECRET,
} from "../../helpers/stage4-cursor-secret";
import { TEST_COMMUNICATION_CURSOR_SECRET } from "../helpers/cursor-secret";
import { campaignInput } from "../helpers/fixture";

const MICROSECONDS = [
  "2026-07-19T09:00:00.123900Z",
  "2026-07-19T09:00:00.123800Z",
  "2026-07-19T09:00:00.123700Z",
  "2026-07-19T09:00:00.123600Z",
  "2026-07-19T09:00:00.123500Z",
  "2026-07-19T09:00:00.123400Z",
  "2026-07-19T09:00:00.123400Z",
] as const;

const IDS = [1, 2, 3, 4, 5, 6, 7].map(
  (value) => `d4000000-0000-4000-8000-${String(value).padStart(12, "0")}`,
);

const EXPECTED_IDS = [...IDS.slice(0, 5), IDS[6]!, IDS[5]!];
const SUBJECT_PREFIX = "gate4d-microsecond-conversation";

test("Stage 4 cursor families preserve PostgreSQL microseconds end to end", { concurrency: false }, async (t) => {
  setNotificationCursorSigningSecretForTests(TEST_NOTIFICATION_CURSOR_SECRET);
  setMessageCursorSigningSecretForTests(TEST_MESSAGE_CURSOR_SECRET);
  setCommunicationCursorSigningSecretForTests(TEST_COMMUNICATION_CURSOR_SECRET);
  await resetMessagingTestDatabase();
  const fixture = await createMessagingFixture("gate4d-microseconds");
  const access = await prisma.adminAccess.update({
    where: { userId: fixture.admin.userId },
    data: {
      permissions: [
        "MESSAGES_VIEW",
        "MESSAGES_SEND",
        "NOTIFICATIONS_VIEW",
        "NOTIFICATIONS_SEND",
      ],
    },
  });
  const notificationActor = {
    mode: "customer",
    personId: fixture.customer.person.id,
  } satisfies NotificationActorContext;
  const communicationAdmin = {
    adminAccessId: access.id,
    personId: fixture.admin.person.id,
    source: "database",
    userId: fixture.admin.userId,
  } satisfies CommunicationAdminContext;

  t.after(async () => {
    setNotificationCursorSigningSecretForTests(undefined);
    setMessageCursorSigningSecretForTests(undefined);
    setCommunicationCursorSigningSecretForTests(undefined);
    await resetMessagingTestDatabase();
    await prisma.$disconnect();
  });

  const notificationIds = await seedNotifications(fixture.customer.person.id);
  const { conversationIds, messageIds } = await seedConversationsAndMessages(fixture);
  const campaignIds = await seedCampaigns(communicationAdmin, fixture.customer.person.id);
  const { deliveryIds, attemptIds } = await seedDeliveriesAndAttempts(
    campaignIds[0]!,
  );

  await t.test("Notification continuation is exact and excludes a post-page-one row", async () => {
    const first = await listNotificationInbox(notificationActor, {
      filter: "all",
      limit: 1,
    });
    assert.deepEqual(first.data.map((item) => item.id), [notificationIds[0]]);
    const cursor = exactEnvelope(first.pageInfo.nextCursor);
    const postSnapshotId = "d4000000-0000-4000-8000-000000000099";
    await prisma.notification.create({
      data: notificationData(postSnapshotId, fixture.customer.person.id, "post-snapshot"),
    });
    await setExactTimestamp(
      "Notification",
      postSnapshotId,
      nextMicrosecondWithinMillisecond(cursor.snapshot),
    );
    const collected = await collectNotificationIds(notificationActor, first);
    assert.deepEqual(collected, notificationIds);
    assert.equal(collected.includes(postSnapshotId), false);
  });

  await t.test("Conversation and unread Conversation continuation are exact", async () => {
    for (const mode of ["all", "unread"] as const) {
      const collected = await collectConversationIds(fixture.actors.customer, mode);
      assert.deepEqual(collected, conversationIds);
    }
  });

  await t.test("Message history continuation is exact", async () => {
    const collected = await collectMessageIds(
      fixture.actors.customer,
      conversationIds[0]!,
    );
    assert.deepEqual(collected, messageIds);
  });

  await t.test("Campaign continuation is exact", async () => {
    const collected: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await getCampaignPage(communicationAdmin, {
        cursor,
        pageSize: 1,
        status: "DRAFT",
      });
      collected.push(...page.items.map((item) => item.id));
      assertCursorV3(page.nextCursor);
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(collected, campaignIds);
  });

  await t.test("Delivery continuation is exact", async () => {
    const collected: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await getDeliveryPage(communicationAdmin, {
        campaignId: campaignIds[0],
        cursor,
        pageSize: 1,
        status: null,
      });
      collected.push(...page.items.map((item) => item.id));
      assertCursorV3(page.nextCursor);
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(collected, deliveryIds);
  });

  await t.test("Attempt continuation is exact", async () => {
    const collected: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await getAttemptPage(communicationAdmin, {
        cursor,
        deliveryId: deliveryIds[0],
        pageSize: 1,
      });
      collected.push(...page.items.map((item) => item.id));
      assertCursorV3(page.nextCursor);
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(collected, attemptIds);
  });

  await t.test("all continuation plans keep timestamp/id indexes usable", async () => {
    const plans = await paginationPlans({
      campaignId: campaignIds[0]!,
      conversationId: conversationIds[0]!,
      customerId: fixture.customer.person.id,
      deliveryId: deliveryIds[0]!,
    });
    for (const [name, plan] of Object.entries(plans)) {
      assert.match(plan, /Index (?:Only )?Scan|Bitmap Index Scan/, `${name}: ${plan}`);
      assert.doesNotMatch(plan, /(date_trunc|to_char|extract)\([^\n]*(createdAt|lastMessageAt)/i);
    }
  });
});

async function seedNotifications(personId: string) {
  await prisma.notification.createMany({
    data: IDS.map((id, index) => notificationData(id, personId, String(index))),
  });
  await setExactTimestamps("Notification", IDS);
  return EXPECTED_IDS;
}

function notificationData(id: string, personId: string, suffix: string) {
  return {
    audience: "USER" as const,
    body: "Safe microsecond body",
    category: "MESSAGES" as const,
    destinationKind: "NOTIFICATIONS" as const,
    eventKey: `gate4d:microsecond:${suffix}:${id}`,
    eventType: "gate4d.microsecond.pagination",
    id,
    mandatory: false,
    occurredAt: new Date("2026-07-19T09:00:00.000Z"),
    priority: "NORMAL" as const,
    recipientPersonId: personId,
    sourceType: "CONVERSATION" as const,
    title: "Microsecond pagination",
  };
}

async function seedConversationsAndMessages(
  fixture: Awaited<ReturnType<typeof createMessagingFixture>>,
) {
  await prisma.conversation.createMany({
    data: IDS.map((id, index) => ({
      adminUserId: fixture.admin.userId,
      customerId: fixture.customer.person.id,
      id,
      identityKey: `gate4d:microsecond:conversation:${index}`,
      lastMessageAt: new Date("2026-07-19T09:00:00.000Z"),
      subject: `${SUBJECT_PREFIX}-${index}`,
      type: "ADMIN_USER" as const,
    })),
  });
  await setExactTimestamps("Conversation", IDS, "lastMessageAt");
  const conversationIds = EXPECTED_IDS;

  const messageIds = IDS.map((_, index) =>
    `d5000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  await prisma.message.createMany({
    data: messageIds.map((id, index) => ({
      body: `Microsecond message ${index}`,
      conversationId: IDS[0]!,
      createdAt: new Date("2026-07-19T09:00:00.000Z"),
      id,
      senderUserId: fixture.admin.userId,
    })),
  });
  await setExactTimestamps("Message", messageIds);
  for (let index = 1; index < IDS.length; index += 1) {
    await prisma.message.create({
      data: {
        body: `Unread conversation ${index}`,
        conversationId: IDS[index]!,
        senderUserId: fixture.admin.userId,
      },
    });
  }
  return {
    conversationIds,
    messageIds: [...messageIds.slice(0, 5), messageIds[6]!, messageIds[5]!],
  };
}

async function seedCampaigns(
  admin: CommunicationAdminContext,
  personId: string,
) {
  const ids: string[] = [];
  for (let index = 0; index < IDS.length; index += 1) {
    ids.push((await createCampaign(admin, campaignInput({
      idempotencyKey: `d6000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      targetPersonId: personId,
    }))).id);
  }
  await setExactTimestamps("CommunicationCampaign", ids);
  return [
    ...ids.slice(0, 5),
    ...ids.slice(5).sort((left, right) => right.localeCompare(left)),
  ];
}

async function seedDeliveriesAndAttempts(campaignId: string) {
  const people = await prisma.person.findMany({
    orderBy: { id: "asc" },
    select: { id: true },
    take: IDS.length,
  });
  assert.equal(people.length, IDS.length);
  const deliveryIds = IDS.map((_, index) =>
    `d7000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  await prisma.outboundDelivery.createMany({
    data: deliveryIds.map((id, index) => ({
      campaignId,
      channel: "EMAIL" as const,
      endpointType: "EMAIL",
      id,
      locale: "EN",
      personId: people[index]!.id,
    })),
  });
  await setExactTimestamps("OutboundDelivery", deliveryIds);

  const attemptIds = IDS.slice(0, 5).map((_, index) =>
    `d8000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  await prisma.outboundDeliveryAttempt.createMany({
    data: attemptIds.map((id, index) => ({
      attemptNumber: index + 1,
      claimOwner: "gate4d-microsecond-test",
      deliveryId: deliveryIds[0]!,
      id,
      startedAt: new Date("2026-07-19T09:00:00.000Z"),
    })),
  });
  const attemptTimestamps = [
    MICROSECONDS[0],
    MICROSECONDS[1],
    MICROSECONDS[2],
    MICROSECONDS[3],
    MICROSECONDS[3],
  ];
  for (let index = 0; index < attemptIds.length; index += 1) {
    await setExactTimestamp(
      "OutboundDeliveryAttempt",
      attemptIds[index]!,
      attemptTimestamps[index]!,
    );
  }
  return {
    attemptIds: [...attemptIds.slice(0, 3), attemptIds[4]!, attemptIds[3]!],
    deliveryIds: [...deliveryIds.slice(0, 5), deliveryIds[6]!, deliveryIds[5]!],
  };
}

async function collectNotificationIds(
  actor: NotificationActorContext,
  first: Awaited<ReturnType<typeof listNotificationInbox>>,
) {
  const ids = first.data.map((item) => item.id);
  let cursor = first.pageInfo.nextCursor;
  while (cursor) {
    const page = await listNotificationInbox(actor, {
      cursor,
      filter: "all",
      limit: 1,
    });
    ids.push(...page.data.map((item) => item.id));
    assertCursorV3(page.pageInfo.nextCursor);
    cursor = page.pageInfo.nextCursor;
  }
  return ids;
}

async function collectConversationIds(
  actor: Parameters<typeof listConversations>[0],
  mode: "all" | "unread",
) {
  const ids: string[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await listConversations(actor, {
      cursor: cursor ?? undefined,
      limit: 1,
      mode,
      search: SUBJECT_PREFIX,
    });
    ids.push(...page.data.map((item) => item.id));
    assertCursorV3(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);
  return ids;
}

async function collectMessageIds(
  actor: Parameters<typeof listMessages>[0],
  conversationId: string,
) {
  const ids: string[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await listMessages(actor, conversationId, {
      cursor: cursor ?? undefined,
      limit: 1,
    });
    ids.push(...page.data.map((item) => item.id));
    assertCursorV3(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);
  return ids;
}

async function setExactTimestamps(
  table: "CommunicationCampaign" | "Conversation" | "Message" | "Notification" | "OutboundDelivery" | "OutboundDeliveryAttempt",
  ids: string[],
  column: "createdAt" | "lastMessageAt" = "createdAt",
) {
  for (let index = 0; index < ids.length; index += 1) {
    await setExactTimestamp(table, ids[index]!, MICROSECONDS[index]!, column);
  }
}

async function setExactTimestamp(
  table: "CommunicationCampaign" | "Conversation" | "Message" | "Notification" | "OutboundDelivery" | "OutboundDeliveryAttempt",
  id: string,
  timestamp: string,
  column: "createdAt" | "lastMessageAt" = "createdAt",
) {
  const tableSql = {
    CommunicationCampaign: Prisma.sql`"CommunicationCampaign"`,
    Conversation: Prisma.sql`"Conversation"`,
    Message: Prisma.sql`"Message"`,
    Notification: Prisma.sql`"Notification"`,
    OutboundDelivery: Prisma.sql`"OutboundDelivery"`,
    OutboundDeliveryAttempt: Prisma.sql`"OutboundDeliveryAttempt"`,
  }[table];
  const columnSql = column === "createdAt"
    ? Prisma.sql`"createdAt"`
    : Prisma.sql`"lastMessageAt"`;
  await prisma.$executeRaw(Prisma.sql`
    UPDATE ${tableSql}
    SET ${columnSql} = ${timestamp}::timestamptz
    WHERE "id" = ${id}::uuid
  `);
}

function exactEnvelope(cursor: string | null) {
  assert.ok(cursor);
  const envelope = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
    snapshot: string;
    version: number;
  };
  assert.equal(envelope.version, 3);
  assert.match(envelope.snapshot, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
  return envelope;
}

function assertCursorV3(cursor: string | null) {
  if (!cursor) return;
  const envelope = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
    snapshot?: string;
    snapshotTimestamp?: string;
    sortTimestamp?: string;
    sortValue?: string;
    version: number;
  };
  assert.equal(envelope.version, 3);
  for (const timestamp of [
    envelope.snapshot ?? envelope.snapshotTimestamp,
    envelope.sortValue ?? envelope.sortTimestamp,
  ]) assert.match(timestamp ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
}

function nextMicrosecondWithinMillisecond(timestamp: string) {
  const match = /^(.*\.)(\d{3})(\d{3})Z$/.exec(timestamp);
  assert.ok(match);
  const micros = Number(match[3]);
  assert.ok(micros < 999, "database snapshot must leave one microsecond in its millisecond");
  return `${match[1]}${match[2]}${String(micros + 1).padStart(3, "0")}Z`;
}

async function paginationPlans(input: {
  campaignId: string;
  conversationId: string;
  customerId: string;
  deliveryId: string;
}) {
  const snapshot = "2026-07-19T09:00:01.000000Z";
  const anchor = "2026-07-19T09:00:00.123700Z";
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SET LOCAL enable_seqscan = off`;
    const queries = {
      notification: Prisma.sql`SELECT "id" FROM "Notification" WHERE "recipientPersonId" = ${input.customerId}::uuid AND "createdAt" <= ${snapshot}::timestamptz AND ("createdAt", "id") < (${anchor}::timestamptz, ${IDS[2]}::uuid) ORDER BY "createdAt" DESC, "id" DESC LIMIT 2`,
      conversation: Prisma.sql`SELECT "id" FROM "Conversation" WHERE "customerId" = ${input.customerId}::uuid AND "lastMessageAt" <= ${snapshot}::timestamptz AND ("lastMessageAt", "id") < (${anchor}::timestamptz, ${IDS[2]}::uuid) ORDER BY "lastMessageAt" DESC, "id" DESC LIMIT 2`,
      unreadConversation: Prisma.sql`SELECT conversation."id" FROM "Conversation" conversation WHERE conversation."customerId" = ${input.customerId}::uuid AND conversation."lastMessageAt" <= ${snapshot}::timestamptz AND (conversation."lastMessageAt", conversation."id") < (${anchor}::timestamptz, ${IDS[2]}::uuid) AND EXISTS (SELECT 1 FROM "Message" message WHERE message."conversationId" = conversation."id") ORDER BY conversation."lastMessageAt" DESC, conversation."id" DESC LIMIT 2`,
      message: Prisma.sql`SELECT "id" FROM "Message" WHERE "conversationId" = ${input.conversationId}::uuid AND "createdAt" <= ${snapshot}::timestamptz AND ("createdAt", "id") < (${anchor}::timestamptz, ${IDS[2]}::uuid) ORDER BY "createdAt" DESC, "id" DESC LIMIT 2`,
      campaign: Prisma.sql`SELECT "id" FROM "CommunicationCampaign" WHERE "createdAt" <= ${snapshot}::timestamptz AND ("createdAt", "id") < (${anchor}::timestamptz, ${IDS[2]}::uuid) ORDER BY "createdAt" DESC, "id" DESC LIMIT 2`,
      delivery: Prisma.sql`SELECT "id" FROM "OutboundDelivery" WHERE "campaignId" = ${input.campaignId}::uuid AND "createdAt" <= ${snapshot}::timestamptz AND ("createdAt", "id") < (${anchor}::timestamptz, ${IDS[2]}::uuid) ORDER BY "createdAt" DESC, "id" DESC LIMIT 2`,
      attempt: Prisma.sql`SELECT "id" FROM "OutboundDeliveryAttempt" WHERE "deliveryId" = ${input.deliveryId}::uuid AND "createdAt" <= ${snapshot}::timestamptz AND ("createdAt", "id") < (${anchor}::timestamptz, ${IDS[2]}::uuid) ORDER BY "createdAt" DESC, "id" DESC LIMIT 2`,
    };
    const plans: Record<string, string> = {};
    for (const [name, query] of Object.entries(queries)) {
      const rows = await transaction.$queryRaw<Array<{ "QUERY PLAN": string }>>(
        Prisma.sql`EXPLAIN (COSTS OFF) ${query}`,
      );
      plans[name] = rows.map((row) => row["QUERY PLAN"]).join("\n");
    }
    return plans;
  });
}
