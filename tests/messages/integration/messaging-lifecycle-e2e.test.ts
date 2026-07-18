import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { MessageDomainError } from "../../../features/messages/domain/errors";
import { messageActorScopeKey } from "../../../features/messages/domain/contracts";
import { canAccessConversation } from "../../../features/messages/policies/conversation-access";
import { markConversationReadForActor } from "../../../features/messages/services/conversation-read";
import {
  openBookingConversationForActor,
  sendMessage,
  startAdminConversation,
  startCustomerBusinessConversation,
} from "../../../features/messages/services/delivery-service";
import {
  getConversationDetail,
  getUnreadMessageCount,
  listConversations,
  listMessages,
} from "../../../features/messages/services/query-service";
import { prisma } from "../../../lib/db/prisma";
import {
  createMessagingFixture,
  resetMessagingTestDatabase,
} from "../helpers/messaging-fixture";

function rejectsWith(code: string) {
  return (error: unknown) =>
    error instanceof MessageDomainError && error.code === code;
}

test("Gate 4B canonical Conversation and Message lifecycle", { concurrency: false }, async (t) => {
  await resetMessagingTestDatabase();
  const fixture = await createMessagingFixture("gate4b-e2e");
  const { actors } = fixture;
  let bookingConversationId = "";
  let generalConversationId = "";

  t.after(async () => {
    await resetMessagingTestDatabase();
    await prisma.$disconnect();
  });

  await t.test("concurrent Booking opens converge on one canonical Conversation", async () => {
    const opened = await Promise.all(
      Array.from({ length: 8 }, () =>
        openBookingConversationForActor(actors.customer, fixture.booking.id),
      ),
    );
    assert.equal(new Set(opened.map((item) => item.id)).size, 1);
    bookingConversationId = opened[0]!.id;
    assert.equal(await prisma.conversation.count({
      where: { bookingId: fixture.booking.id },
    }), 1);
    const row = await prisma.conversation.findUniqueOrThrow({
      where: { id: bookingConversationId },
    });
    assert.equal(row.identityKey, `customer-business:booking:${fixture.booking.id}`);
    assert.equal(row.type, "CUSTOMER_BUSINESS");
    await assert.rejects(
      openBookingConversationForActor(actors.foreignCustomer, fixture.booking.id),
      rejectsWith("NOT_FOUND"),
    );
    await assert.rejects(
      openBookingConversationForActor(actors.foreignOwner, fixture.booking.id),
      rejectsWith("NOT_FOUND"),
    );
  });

  await t.test("participant matrix permits only the exact Customer and legal Business roles", async () => {
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: bookingConversationId },
      select: {
        adminUserId: true,
        booking: { select: { customerId: true, memberId: true, organizationId: true } },
        businessId: true,
        customerId: true,
        type: true,
      },
    });
    for (const actor of [
      actors.customer,
      actors.owner,
      actors.manager,
      actors.receptionist,
      actors.assignedStaff,
    ]) {
      assert.equal(canAccessConversation(conversation, actor), true);
      assert.equal((await getConversationDetail(actor, bookingConversationId)).id, bookingConversationId);
    }
    for (const actor of [
      actors.foreignCustomer,
      actors.foreignOwner,
      actors.unassignedStaff,
      actors.admin,
    ]) {
      assert.equal(canAccessConversation(conversation, actor), false);
      await assert.rejects(
        getConversationDetail(actor, bookingConversationId),
        rejectsWith("NOT_FOUND"),
      );
    }
  });

  await t.test("first Customer Message is atomic and a failed first Message leaves no Conversation", async () => {
    const failedBusiness = await prisma.organization.create({
      data: { name: "Gate 4B failed start", slug: `failed-${randomUUID()}` },
    });
    const failedBranch = await prisma.branch.create({
      data: { name: "Failed", organizationId: failedBusiness.id, slug: "failed" },
    });
    await prisma.booking.create({
      data: {
        branchId: failedBranch.id,
        customerId: fixture.customer.person.id,
        customerNameSnapshot: "Private",
        endsAt: new Date("2026-09-20T11:00:00.000Z"),
        organizationId: failedBusiness.id,
        priceSnapshot: "1",
        serviceNameSnapshot: "Failed",
        startsAt: new Date("2026-09-20T10:00:00.000Z"),
      },
    });
    await assert.rejects(startCustomerBusinessConversation(actors.customer, {
      body: "   ",
      businessId: failedBusiness.id,
      idempotencyKey: randomUUID(),
    }), rejectsWith("VALIDATION_ERROR"));
    assert.equal(await prisma.conversation.count({
      where: { businessId: failedBusiness.id, customerId: actors.customer.personId },
    }), 0);

    const started = await startCustomerBusinessConversation(actors.customer, {
      body: "General help request",
      businessId: fixture.organization.id,
      idempotencyKey: randomUUID(),
    });
    generalConversationId = started.conversationId;
    assert.equal(started.replayed, false);
    assert.equal(await prisma.conversation.count({
      where: {
        businessId: fixture.organization.id,
        bookingId: null,
        customerId: fixture.customer.person.id,
      },
    }), 1);
    assert.equal(await prisma.message.count({ where: { conversationId: generalConversationId } }), 1);
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: generalConversationId },
    });
    assert.equal(conversation.lastMessageAt.toISOString(), started.message.createdAt);
    assert.equal(conversation.identityKey,
      `customer-business:general:${fixture.organization.id}:${fixture.customer.person.id}`);
    await assert.rejects(startCustomerBusinessConversation(actors.foreignCustomer, {
      body: "No prior relationship",
      businessId: fixture.organization.id,
      idempotencyKey: randomUUID(),
    }), rejectsWith("NOT_FOUND"));
  });

  await t.test("general Organization scope denies Receptionist/Staff and allows Owner/Manager", async () => {
    for (const actor of [actors.owner, actors.manager, actors.customer]) {
      assert.equal((await getConversationDetail(actor, generalConversationId)).id, generalConversationId);
    }
    for (const actor of [actors.receptionist, actors.assignedStaff, actors.unassignedStaff, actors.foreignOwner]) {
      await assert.rejects(getConversationDetail(actor, generalConversationId), rejectsWith("NOT_FOUND"));
    }
  });

  await t.test("exact replay and concurrent replay create one Message, one activity update and no duplicate notifications", async () => {
    const firstKey = randomUUID();
    const first = await sendMessage(actors.customer, {
      body: "Booking message one",
      conversationId: bookingConversationId,
      idempotencyKey: firstKey,
    });
    const replay = await sendMessage(actors.customer, {
      body: "Booking message one",
      conversationId: bookingConversationId,
      idempotencyKey: firstKey,
    });
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.message, first.message);
    await assert.rejects(sendMessage(actors.customer, {
      body: "Different body",
      conversationId: bookingConversationId,
      idempotencyKey: firstKey,
    }), rejectsWith("IDEMPOTENCY_CONFLICT"));

    const concurrentKey = randomUUID();
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () => sendMessage(actors.customer, {
        body: "One concurrent Message",
        conversationId: bookingConversationId,
        idempotencyKey: concurrentKey,
      })),
    );
    assert.equal(new Set(concurrent.map((item) => item.message.id)).size, 1);
    assert.equal(await prisma.message.count({
      where: { senderUserId: actors.customer.userId, idempotencyKey: concurrentKey },
    }), 1);
    const createdIds = [first.message.id, concurrent[0]!.message.id];
    assert.equal(await prisma.notification.count({
      where: {
        eventType: "message.received",
        sourceId: bookingConversationId,
        eventKey: { startsWith: `message:` },
      },
    }), 8);
    for (const notification of await prisma.notification.findMany({
      where: { sourceId: bookingConversationId, sourceType: "CONVERSATION" },
      select: { body: true, destinationKind: true, eventKey: true, title: true },
    })) {
      assert.equal(notification.destinationKind, "BUSINESS_MESSAGES");
      assert.equal(notification.body.includes("Booking message"), false);
      assert.match(notification.eventKey ?? "", /^message:[0-9a-f-]+:recipient:[0-9a-f-]+$/i);
      assert.equal(notification.title, "New message");
    }
    assert.equal((await prisma.conversation.findUniqueOrThrow({
      where: { id: bookingConversationId },
    })).lastMessageAt.toISOString(), concurrent[0]!.message.createdAt);
    assert.equal(createdIds.length, 2);
  });

  await t.test("notifications target only legal direct participants", async () => {
    const recipients = await prisma.notification.findMany({
      where: { sourceId: bookingConversationId },
      select: { recipientPersonId: true },
      distinct: ["recipientPersonId"],
    });
    assert.deepEqual(new Set(recipients.map((item) => item.recipientPersonId)), new Set([
      actors.owner.personId,
      actors.manager.personId,
      actors.receptionist.personId,
      actors.assignedStaff.personId,
    ]));
    const ownerReply = await sendMessage(actors.owner, {
      body: "Confirmed from business",
      conversationId: bookingConversationId,
      idempotencyKey: randomUUID(),
    });
    const customerNotice = await prisma.notification.findFirstOrThrow({
      where: {
        destinationKind: "CUSTOMER_MESSAGES",
        eventKey: { startsWith: `message:${ownerReply.message.id}:` },
        recipientPersonId: actors.customer.personId,
      },
    });
    assert.equal(customerNotice.body.includes(ownerReply.message.body), false);
    assert.equal(await prisma.notification.count({
      where: { eventKey: { startsWith: `message:${ownerReply.message.id}:` } },
    }), 1);
  });

  await t.test("read state is per Person/scope, monotonic and reconciles only matching notifications", async () => {
    const beforeOwner = await getUnreadMessageCount(actors.owner);
    const beforeManager = await getUnreadMessageCount(actors.manager);
    const ownerConversations = await listConversations(actors.owner, {
      limit: 50,
      mode: "all",
    });
    const bookingUnread = ownerConversations.data.find(
      (item) => item.id === bookingConversationId,
    )!.unreadCount;
    assert.ok(beforeOwner.count >= 2);
    assert.ok(beforeManager.count >= 2);
    const page = await listMessages(actors.owner, bookingConversationId, { limit: 30 });
    const boundary = page.data.find((item) => !item.own)!;
    const read = await markConversationReadForActor({
      actor: actors.owner,
      conversationId: bookingConversationId,
      throughMessageId: boundary.id,
    });
    assert.equal(read.authorized, true);
    assert.equal(read.boundary?.id, boundary.id);
    const replay = await markConversationReadForActor({
      actor: actors.owner,
      conversationId: bookingConversationId,
      throughMessageId: boundary.id,
    });
    assert.equal(replay.updatedCount, 0);
    assert.equal(replay.version, read.version);
    assert.equal(
      (await getUnreadMessageCount(actors.owner)).count,
      beforeOwner.count - bookingUnread,
    );
    assert.equal((await getUnreadMessageCount(actors.manager)).count, beforeManager.count);
    const ownerStates = await prisma.notificationRecipientState.findMany({
      where: {
        notification: { sourceId: bookingConversationId, sourceType: "CONVERSATION" },
        personId: actors.owner.personId,
      },
    });
    assert.ok(ownerStates.length >= 2);
    assert.equal(ownerStates.every((state) => state.readState === "READ"), true);
    assert.equal(await prisma.notificationRecipientState.count({
      where: {
        notification: { sourceId: bookingConversationId },
        personId: actors.manager.personId,
      },
    }), 0);

    const after = await sendMessage(actors.customer, {
      body: "After owner watermark",
      conversationId: bookingConversationId,
      idempotencyKey: randomUUID(),
    });
    assert.equal(
      (await getUnreadMessageCount(actors.owner)).count,
      beforeOwner.count - bookingUnread + 1,
    );
    const ownerLaterNotification = await prisma.notification.findFirstOrThrow({
      where: {
        eventKey: `message:${after.message.id}:recipient:${actors.owner.personId}`,
      },
    });
    assert.equal(await prisma.notificationRecipientState.count({
      where: { notificationId: ownerLaterNotification.id, personId: actors.owner.personId },
    }), 0);
    const oldMessage = page.data.at(-1)!;
    const monotonic = await markConversationReadForActor({
      actor: actors.owner,
      conversationId: bookingConversationId,
      throughMessageId: oldMessage.id,
    });
    assert.equal(monotonic.version, read.version);
    assert.equal(
      (await getUnreadMessageCount(actors.owner)).count,
      beforeOwner.count - bookingUnread + 1,
    );
  });

  await t.test("same-timestamp tie-breakers and legacy Message.readAt do not corrupt unread state", async () => {
    const conversation = await prisma.conversation.create({
      data: {
        businessId: fixture.organization.id,
        customerId: fixture.customer.person.id,
        identityKey: `legacy:${randomUUID()}`,
        type: "CUSTOMER_BUSINESS",
      },
    });
    const sameTime = new Date("2026-01-15T10:00:00.000Z");
    const messageIds = [randomUUID(), randomUUID()].sort();
    await prisma.message.createMany({
      data: messageIds.map((id) => ({
        body: `<script>alert(&quot;${id}&quot;)</script>`,
        conversationId: conversation.id,
        createdAt: sameTime,
        id,
        readAt: new Date("2099-01-01T00:00:00.000Z"),
        senderUserId: actors.customer.userId,
      })),
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: sameTime },
    });
    await markConversationReadForActor({
      actor: actors.owner,
      conversationId: conversation.id,
      throughMessageId: messageIds[0],
    });
    const list = await listConversations(actors.owner, {
      limit: 50,
      mode: "unread",
    });
    const summary = list.data.find((item) => item.id === conversation.id);
    assert.equal(summary?.unreadCount, 1);
    const history = await listMessages(actors.owner, conversation.id, { limit: 10 });
    assert.deepEqual(history.data.map((item) => item.id), [...messageIds].reverse());
    assert.match(history.data[0]!.body, /<script>/);
  });

  await t.test("Conversation and Message pagination are stable and scope-bound", async () => {
    const paginationConversation = await prisma.conversation.create({
      data: {
        businessId: fixture.organization.id,
        customerId: fixture.customer.person.id,
        identityKey: `legacy:${randomUUID()}`,
        type: "CUSTOMER_BUSINESS",
      },
    });
    const baseTime = new Date("2026-02-01T10:00:00.000Z");
    const rows = Array.from({ length: 55 }, (_, index) => ({
      body: `history-${index.toString().padStart(2, "0")}`,
      conversationId: paginationConversation.id,
      createdAt: new Date(baseTime.getTime() + index * 1000),
      id: randomUUID(),
      senderUserId: index % 2 ? actors.owner.userId : actors.customer.userId,
    }));
    await prisma.message.createMany({ data: rows });
    await prisma.conversation.update({
      where: { id: paginationConversation.id },
      data: { lastMessageAt: rows.at(-1)!.createdAt },
    });
    const first = await listMessages(actors.owner, paginationConversation.id, { limit: 20 });
    assert.equal(first.data.length, 20);
    assert.ok(first.nextCursor);
    const second = await listMessages(actors.owner, paginationConversation.id, {
      cursor: first.nextCursor!,
      limit: 20,
    });
    assert.equal(second.data.length, 20);
    assert.equal(new Set([...first.data, ...second.data].map((item) => item.id)).size, 40);
    await assert.rejects(listMessages(actors.manager, paginationConversation.id, {
      cursor: first.nextCursor!,
      limit: 20,
    }), rejectsWith("INVALID_CURSOR"));
    await assert.rejects(listMessages(actors.owner, bookingConversationId, {
      cursor: first.nextCursor!,
      limit: 20,
    }), rejectsWith("INVALID_CURSOR"));

    for (let index = 0; index < 24; index += 1) {
      await prisma.conversation.create({
        data: {
          businessId: fixture.organization.id,
          customerId: fixture.customer.person.id,
          identityKey: `legacy:${randomUUID()}`,
          lastMessageAt: new Date(baseTime.getTime() + index),
          type: "CUSTOMER_BUSINESS",
        },
      });
    }
    const conversationsOne = await listConversations(actors.customer, {
      limit: 10,
      mode: "all",
    });
    assert.equal(conversationsOne.data.length, 10);
    assert.ok(conversationsOne.nextCursor);
    const conversationsTwo = await listConversations(actors.customer, {
      cursor: conversationsOne.nextCursor!,
      limit: 10,
      mode: "all",
    });
    assert.equal(new Set([
      ...conversationsOne.data,
      ...conversationsTwo.data,
    ].map((item) => item.id)).size, 20);
    await assert.rejects(listConversations(actors.foreignCustomer, {
      cursor: conversationsOne.nextCursor!,
      limit: 10,
      mode: "all",
    }), rejectsWith("INVALID_CURSOR"));
  });

  await t.test("Admin USER/BUSINESS starts are canonical, personal, audited and replay-safe", async () => {
    const userKey = randomUUID();
    const user = await startAdminConversation(actors.admin, {
      body: "Admin user support",
      idempotencyKey: userKey,
      targetId: actors.customer.personId,
      targetType: "USER",
    });
    const replay = await startAdminConversation(actors.admin, {
      body: "Admin user support",
      idempotencyKey: userKey,
      targetId: actors.customer.personId,
      targetType: "USER",
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.message.id, user.message.id);
    const business = await startAdminConversation(actors.admin, {
      body: "Admin business support",
      idempotencyKey: randomUUID(),
      targetId: fixture.organization.id,
      targetType: "BUSINESS",
    });
    assert.notEqual(user.conversationId, business.conversationId);
    assert.equal((await getConversationDetail(actors.customer, user.conversationId)).type, "ADMIN_USER");
    assert.equal((await getConversationDetail(actors.owner, business.conversationId)).type, "ADMIN_BUSINESS");
    await assert.rejects(getConversationDetail(actors.manager, user.conversationId), rejectsWith("NOT_FOUND"));
    await assert.rejects(getConversationDetail(actors.customer, business.conversationId), rejectsWith("NOT_FOUND"));
    assert.equal(await prisma.adminAuditLog.count({
      where: { adminUserId: actors.admin.userId, idempotencyKey: userKey },
    }), 1);
    const audit = await prisma.adminAuditLog.findFirstOrThrow({
      where: { adminUserId: actors.admin.userId, idempotencyKey: userKey },
    });
    const serialized = JSON.stringify(audit);
    assert.equal(serialized.includes("Admin user support"), false);
    assert.equal(serialized.includes(fixture.customer.person.displayName ?? "impossible"), false);
    assert.match(serialized, new RegExp(user.message.id));
    assert.match(serialized, new RegExp(user.conversationId));
  });

  await t.test("Restaurant-linked Booking uses the typed source without a parallel Conversation model", async () => {
    const table = await prisma.restaurantTable.create({
      data: {
        branchId: fixture.branch.id,
        businessId: fixture.organization.id,
        capacity: 4,
        name: "Gate 4B table",
      },
    });
    await prisma.restaurantReservationDetails.create({
      data: {
        bookingId: fixture.booking.id,
        branchId: fixture.branch.id,
        businessId: fixture.organization.id,
        guestCount: 2,
        reservationDateTime: fixture.booking.startsAt,
        tableId: table.id,
      },
    });
    const detail = await getConversationDetail(actors.customer, bookingConversationId);
    assert.deepEqual(detail.source, {
      bookingId: fixture.booking.id,
      kind: "RESTAURANT_RESERVATION",
      label: fixture.booking.serviceNameSnapshot,
      startsAt: fixture.booking.startsAt.toISOString(),
    });
  });

  await t.test("current identity revalidation rejects stale role and inactive membership", async () => {
    const replacement = await prisma.role.create({
      data: {
        isSystem: true,
        name: "Replacement owner",
        organizationId: fixture.organization.id,
        systemRole: "OWNER",
      },
    });
    await prisma.organizationMember.update({
      where: { id: actors.owner.membershipId },
      data: { roleId: replacement.id },
    });
    await assert.rejects(listConversations(actors.owner, {
      limit: 20,
      mode: "all",
    }), rejectsWith("FORBIDDEN"));
    const currentOwner = { ...actors.owner, roleId: replacement.id };
    assert.ok((await listConversations(currentOwner, { limit: 20, mode: "all" })).data.length > 0);
    await prisma.organizationMember.update({
      where: { id: actors.owner.membershipId },
      data: { status: "INACTIVE" },
    });
    await assert.rejects(getUnreadMessageCount(currentOwner), rejectsWith("FORBIDDEN"));
  });

  await t.test("read-state rows retain exact owner and boundary constraints", async () => {
    const rows = await prisma.conversationReadState.findMany();
    assert.ok(rows.length >= 2);
    for (const row of rows) {
      assert.equal(Boolean(row.personId) !== Boolean(row.adminUserId), true);
      assert.equal(Boolean(row.lastReadMessageCreatedAt), Boolean(row.lastReadMessageId));
      assert.ok(row.scopeKey.length <= 180);
    }
    const ownerRow = rows.find((row) => row.scopeKey === messageActorScopeKey(actors.owner));
    assert.ok(ownerRow);
  });
});
