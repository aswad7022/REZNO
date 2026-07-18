import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { createCanonicalNotifications } from "../../features/notifications/services/producer";

export const MESSAGING_STAGE4B_FIXTURE = {
  confirmation: "REZNO_MESSAGING_STAGE4B_FIXTURE",
  marker: "rezno-qa-messaging-lifecycle-stage4b",
  id: (value: number) =>
    `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`,
  userId: (value: number) => `rezno-qa-messaging-stage4b-user-${value}`,
} as const;

export async function seedMessagingLifecycleStage4bFixture(client: PrismaClient) {
  const { id, marker, userId } = MESSAGING_STAGE4B_FIXTURE;
  const personIds = Array.from({ length: 8 }, (_, index) => id(4_100 + index));
  const userIds = Array.from({ length: 8 }, (_, index) => userId(index + 1));
  const organizationIds = [id(4_201), id(4_202)];
  const roleIds = Array.from({ length: 6 }, (_, index) => id(4_301 + index));
  const membershipIds = Array.from({ length: 6 }, (_, index) => id(4_401 + index));
  const conversationIds = [
    id(4_950), id(4_951), id(4_952), id(4_953),
    ...Array.from({ length: 22 }, (_, index) => id(5_000 + index)),
  ];
  const notificationEventKeys = [20, 22].map(
    (index) => `message:${id(6_000 + index)}:recipient:${personIds[2]}`,
  );

  await client.$transaction(async (transaction) => {
    const [existingPeople, existingUsers, existingOrganizations, existingConversations, existingNotifications] = await Promise.all([
      transaction.person.findMany({ where: { id: { in: personIds } }, select: { authUserId: true } }),
      transaction.user.findMany({ where: { id: { in: userIds } }, select: { email: true } }),
      transaction.organization.findMany({ where: { id: { in: organizationIds } }, select: { slug: true } }),
      transaction.conversation.findMany({ where: { id: { in: conversationIds } }, select: { identityKey: true } }),
      transaction.notification.findMany({
        where: { eventKey: { in: notificationEventKeys } },
        select: { recipientPersonId: true, sourceId: true },
      }),
    ]);
    const owned =
      existingPeople.every((row) => row.authUserId.startsWith("rezno-qa-messaging-stage4b-user-")) &&
      existingUsers.every((row) => row.email.endsWith("@messaging-stage4b.rezno.invalid")) &&
      existingOrganizations.every((row) => row.slug.startsWith("rezno-qa-messaging-stage4b-")) &&
      existingConversations.every((row) =>
        row.identityKey.includes("00000000-0000-4000-8000-") ||
        row.identityKey.startsWith(`${marker}:legacy:`)) &&
      existingNotifications.every((row) =>
        row.sourceId === conversationIds[0] && row.recipientPersonId === personIds[2]);
    if (!owned) {
      throw new Error("Stage 4B fixture ownership collision detected; no data was changed.");
    }

    await transaction.notification.deleteMany({ where: { eventKey: { in: notificationEventKeys } } });
    await transaction.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await transaction.booking.deleteMany({ where: { id: id(4_601) } });
    await transaction.restaurantTable.deleteMany({ where: { id: id(4_701) } });
    await transaction.organizationMember.deleteMany({ where: { id: { in: membershipIds } } });
    await transaction.role.deleteMany({ where: { id: { in: roleIds } } });
    await transaction.branch.deleteMany({ where: { id: { in: [id(4_501), id(4_502)] } } });
    await transaction.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await transaction.person.deleteMany({ where: { id: { in: personIds } } });
    await transaction.user.deleteMany({ where: { id: { in: userIds } } });

    await transaction.user.createMany({
      data: userIds.map((value, index) => ({
        email: `${marker}-${index + 1}@messaging-stage4b.rezno.invalid`,
        id: value,
        name: `Stage 4B QA ${index + 1}`,
      })),
    });
    await transaction.person.createMany({
      data: personIds.map((personId, index) => ({
        authUserId: userIds[index]!,
        displayName: `Stage 4B Person ${index + 1}`,
        firstName: `QA-${index + 1}`,
        id: personId,
        isOnboarded: true,
        preferredLanguage: index % 3 === 0 ? "AR" : index % 3 === 1 ? "EN" : "KU",
        status: "ACTIVE",
      })),
    });
    await transaction.adminAccess.create({
      data: {
        permissions: ["MESSAGES_SEND", "MESSAGES_VIEW"],
        userId: userIds[7]!,
      },
    });
    await transaction.organization.createMany({
      data: [
        {
          id: organizationIds[0]!,
          name: "Stage 4B Messaging Business",
          slug: "rezno-qa-messaging-stage4b-business",
          vertical: "RESTAURANT",
        },
        {
          id: organizationIds[1]!,
          name: "Stage 4B Foreign Business",
          slug: "rezno-qa-messaging-stage4b-foreign",
          vertical: "OTHER",
        },
      ],
    });
    await transaction.branch.createMany({
      data: [
        { id: id(4_501), name: "Messaging Main", organizationId: organizationIds[0]!, slug: "main" },
        { id: id(4_502), name: "Messaging Foreign", organizationId: organizationIds[1]!, slug: "foreign" },
      ],
    });
    const roleRows = [
      [roleIds[0]!, organizationIds[0]!, "OWNER"],
      [roleIds[1]!, organizationIds[0]!, "MANAGER"],
      [roleIds[2]!, organizationIds[0]!, "RECEPTIONIST"],
      [roleIds[3]!, organizationIds[0]!, "STAFF"],
      [roleIds[4]!, organizationIds[0]!, "STAFF"],
      [roleIds[5]!, organizationIds[1]!, "OWNER"],
    ] as const;
    await transaction.role.createMany({
      data: roleRows.map(([roleId, organizationId, systemRole]) => ({
        id: roleId,
        isSystem: true,
        name: `${systemRole}-${roleId.slice(-3)}`,
        organizationId,
        systemRole,
      })),
    });
    await transaction.organizationMember.createMany({
      data: [
        { id: membershipIds[0]!, organizationId: organizationIds[0]!, personId: personIds[2]!, roleId: roleIds[0]! },
        { id: membershipIds[1]!, organizationId: organizationIds[0]!, personId: personIds[3]!, roleId: roleIds[1]! },
        { id: membershipIds[2]!, organizationId: organizationIds[0]!, personId: personIds[4]!, roleId: roleIds[2]! },
        { id: membershipIds[3]!, organizationId: organizationIds[0]!, personId: personIds[5]!, roleId: roleIds[3]! },
        { id: membershipIds[4]!, organizationId: organizationIds[0]!, personId: personIds[6]!, roleId: roleIds[4]! },
        { id: membershipIds[5]!, organizationId: organizationIds[1]!, personId: personIds[1]!, roleId: roleIds[5]! },
      ],
    });
    await transaction.booking.create({
      data: {
        branchId: id(4_501),
        customerId: personIds[0]!,
        customerNameSnapshot: "Stage 4B private customer snapshot",
        endsAt: new Date("2026-09-01T11:00:00.000Z"),
        id: id(4_601),
        memberId: membershipIds[3]!,
        organizationId: organizationIds[0]!,
        priceSnapshot: "25000",
        serviceNameSnapshot: "Stage 4B table reservation",
        startsAt: new Date("2026-09-01T10:00:00.000Z"),
      },
    });
    const table = await transaction.restaurantTable.create({
      data: {
        branchId: id(4_501),
        businessId: organizationIds[0]!,
        capacity: 4,
        id: id(4_701),
        name: "Messaging QA table",
      },
    });
    await transaction.restaurantReservationDetails.create({
      data: {
        bookingId: id(4_601),
        branchId: id(4_501),
        businessId: organizationIds[0]!,
        guestCount: 2,
        id: id(4_702),
        reservationDateTime: new Date("2026-09-01T10:00:00.000Z"),
        tableId: table.id,
      },
    });

    await transaction.conversation.createMany({
      data: [
        {
          bookingId: id(4_601), businessId: organizationIds[0]!, customerId: personIds[0]!,
          id: conversationIds[0]!, identityKey: `customer-business:booking:${id(4_601)}`,
          lastMessageAt: new Date("2026-07-17T12:35:00.000Z"), type: "CUSTOMER_BUSINESS",
        },
        {
          businessId: organizationIds[0]!, customerId: personIds[0]!, id: conversationIds[1]!,
          identityKey: `customer-business:general:${organizationIds[0]}:${personIds[0]}`,
          lastMessageAt: new Date("2026-07-17T11:00:00.000Z"), type: "CUSTOMER_BUSINESS",
        },
        {
          adminUserId: userIds[7]!, customerId: personIds[0]!, id: conversationIds[2]!,
          identityKey: `admin-user:${userIds[7]}:${personIds[0]}`,
          lastMessageAt: new Date("2026-07-17T10:00:00.000Z"), type: "ADMIN_USER",
        },
        {
          adminUserId: userIds[7]!, businessId: organizationIds[0]!, id: conversationIds[3]!,
          identityKey: `admin-business:${userIds[7]}:${organizationIds[0]}`,
          lastMessageAt: new Date("2026-07-17T09:00:00.000Z"), type: "ADMIN_BUSINESS",
        },
        ...conversationIds.slice(4).map((conversationId, index) => ({
          businessId: organizationIds[0]!,
          customerId: personIds[0]!,
          id: conversationId,
          identityKey: `${marker}:legacy:${conversationId}`,
          lastMessageAt: new Date(1_752_841_800_000 - index * 60_000),
          type: "CUSTOMER_BUSINESS" as const,
        })),
      ],
    });
    const messageTime = new Date("2026-07-17T12:00:00.000Z");
    const history = Array.from({ length: 36 }, (_, index) => ({
      body: `Stage 4B bounded message ${String(index).padStart(2, "0")}`,
      conversationId: conversationIds[0]!,
      createdAt: new Date(messageTime.getTime() + Math.floor(index / 2) * 60_000),
      id: id(6_000 + index),
      idempotencyKey: index < 2 ? id(6_100 + index) : null,
      requestHash: index < 2 ? String(index).repeat(64) : null,
      senderUserId: index % 2 === 0 ? userIds[0]! : userIds[2]!,
      sourceAction: index < 2 ? "reply" : null,
    }));
    await transaction.message.createMany({
      data: [
        ...history,
        { body: "General fixture message", conversationId: conversationIds[1]!, id: id(6_200), senderUserId: userIds[0]! },
        { body: "Admin/User fixture message", conversationId: conversationIds[2]!, id: id(6_201), senderUserId: userIds[7]! },
        { body: "Admin/Business fixture message", conversationId: conversationIds[3]!, id: id(6_202), senderUserId: userIds[7]! },
        ...conversationIds.slice(4).map((conversationId, index) => ({
          body: `Conversation page fixture ${String(index).padStart(2, "0")}`,
          conversationId,
          createdAt: new Date(1_752_841_800_000 - index * 60_000),
          id: id(6_300 + index),
          senderUserId: userIds[0]!,
        })),
      ],
    });
    await transaction.conversationReadState.createMany({
      data: [
        {
          conversationId: conversationIds[0]!, id: id(7_001),
          lastReadMessageCreatedAt: history[19]!.createdAt, lastReadMessageId: history[19]!.id,
          personId: personIds[2]!, scopeKey: `business:${personIds[2]}:${organizationIds[0]}:${membershipIds[0]}:${roleIds[0]}:OWNER`,
        },
        {
          conversationId: conversationIds[0]!, id: id(7_002),
          lastReadMessageCreatedAt: history[9]!.createdAt, lastReadMessageId: history[9]!.id,
          personId: personIds[3]!, scopeKey: `business:${personIds[3]}:${organizationIds[0]}:${membershipIds[1]}:${roleIds[1]}:MANAGER`,
        },
        {
          conversationId: conversationIds[0]!, id: id(7_003),
          lastReadMessageCreatedAt: history[34]!.createdAt, lastReadMessageId: history[34]!.id,
          personId: personIds[0]!, scopeKey: `customer:${personIds[0]}`,
        },
      ],
    });
    await createCanonicalNotifications(transaction, history
      .slice(20, 24)
      .filter((_, index) => index % 2 === 0)
      .map((message, index) => ({
      audience: "USER" as const,
      body: "A new message is waiting. Open the conversation to read it.",
      category: "MESSAGES" as const,
      destinationKind: "BUSINESS_MESSAGES" as const,
      destinationTargetId: conversationIds[0]!,
      eventKey: `message:${message.id}:recipient:${personIds[2]}`,
      eventType: "message.received",
      mandatory: false,
      occurredAt: message.createdAt,
      priority: "NORMAL" as const,
      recipientPersonId: personIds[2]!,
      sourceId: conversationIds[0]!,
      sourceType: "CONVERSATION" as const,
        title: `Stage 4B message notification ${index + 1}`,
      })));
    await transaction.adminAuditLog.create({
      data: {
        action: "admin.message.send",
        adminUserId: userIds[7]!,
        idempotencyKey: id(7_100),
        metadata: { conversationId: conversationIds[2], messageId: id(6_201), targetId: personIds[0], targetType: "ADMIN_USER" },
        requestHash: "a".repeat(64),
        result: { conversationId: conversationIds[2], messageId: id(6_201) },
        targetId: conversationIds[2],
        targetType: "ADMIN_USER",
      },
    });
  }, { isolationLevel: "Serializable", timeout: 30_000 });

  const [conversations, messages, readStates, notifications, audits] = await Promise.all([
    client.conversation.count({ where: { id: { in: conversationIds } } }),
    client.message.findMany({ where: { conversationId: { in: conversationIds } }, orderBy: { id: "asc" }, select: { id: true } }),
    client.conversationReadState.count({ where: { conversationId: { in: conversationIds } } }),
    client.notification.findMany({ where: { eventKey: { in: notificationEventKeys } }, orderBy: { eventKey: "asc" }, select: { eventKey: true } }),
    client.adminAuditLog.count({ where: { adminUserId: userIds[7]!, action: "admin.message.send" } }),
  ]);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    audits,
    conversations,
    messages: messages.map((item) => item.id),
    notifications: notifications.map((item) => item.eventKey),
    readStates,
  })).digest("hex");
  return {
    audits,
    conversations,
    fingerprint,
    messages: messages.length,
    notifications: notifications.length,
    readStates,
  };
}
