import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import type { NotificationActorContext } from "../../../features/notifications/domain/contracts";
import { NotificationDomainError } from "../../../features/notifications/domain/errors";
import { setNotificationCursorSigningSecretForTests } from "../../../features/notifications/domain/cursor-signing";
import { createCanonicalNotifications } from "../../../features/notifications/services/producer";
import { listNotificationInbox } from "../../../features/notifications/services/inbox-service";
import {
  markAllNotificationsRead,
  mutateNotificationState,
} from "../../../features/notifications/services/interaction-service";
import { MessageDomainError } from "../../../features/messages/domain/errors";
import { setMessageCursorSigningSecretForTests } from "../../../features/messages/domain/cursor-signing";
import { markConversationReadForActor } from "../../../features/messages/services/conversation-read";
import {
  openBookingConversationForActor,
  sendMessage,
} from "../../../features/messages/services/delivery-service";
import {
  getConversationDetail,
  getUnreadMessageCount,
  listConversations,
  listMessages,
} from "../../../features/messages/services/query-service";
import { CommunicationDomainError } from "../../../features/communications/domain/errors";
import { setCommunicationCursorSigningSecretForTests } from "../../../features/communications/domain/cursor-signing";
import {
  DeterministicSinkProvider,
  setCommunicationTestProviderFactory,
} from "../../../features/communications/providers/provider";
import type { CommunicationAdminContext } from "../../../features/communications/services/admin-actor";
import {
  cancelCampaign,
  createCampaign,
  getCampaignPage,
  updateCampaign,
} from "../../../features/communications/services/campaigns";
import {
  claimDueDeliveries,
  manuallyDispatchDue,
  processClaimedDeliveries,
  releaseExpiredClaims,
  sendCampaignNow,
} from "../../../features/communications/services/dispatcher";
import {
  getOutboundPreferences,
  updateOutboundPreferences,
} from "../../../features/communications/services/preferences";
import { prisma } from "../../../lib/db/prisma";
import {
  createMessagingFixture,
  resetMessagingTestDatabase,
} from "../../messages/helpers/messaging-fixture";
import {
  ROTATED_COMMUNICATION_CURSOR_SECRET,
  TEST_COMMUNICATION_CURSOR_SECRET,
} from "../helpers/cursor-secret";
import { campaignInput } from "../helpers/fixture";
import {
  TEST_MESSAGE_CURSOR_SECRET,
  TEST_NOTIFICATION_CURSOR_SECRET,
} from "../../helpers/stage4-cursor-secret";

const notificationFailure = (code: string) => (error: unknown) =>
  error instanceof NotificationDomainError && error.code === code;
const messageFailure = (code: string) => (error: unknown) =>
  error instanceof MessageDomainError && error.code === code;
const communicationFailure = (code: string) => (error: unknown) =>
  error instanceof CommunicationDomainError && error.code === code;

test("Gate 4D scenarios A–J close Stage 4 as one PostgreSQL communications system", { concurrency: false }, async (t) => {
  setNotificationCursorSigningSecretForTests(TEST_NOTIFICATION_CURSOR_SECRET);
  setMessageCursorSigningSecretForTests(TEST_MESSAGE_CURSOR_SECRET);
  setCommunicationCursorSigningSecretForTests(TEST_COMMUNICATION_CURSOR_SECRET);
  setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel));
  await resetMessagingTestDatabase();
  const fixture = await createMessagingFixture("gate4d-closure");
  const { actors } = fixture;
  const access = await prisma.adminAccess.update({
    where: { userId: fixture.admin.userId },
    data: {
      permissions: [
        "MESSAGES_VIEW",
        "MESSAGES_SEND",
        "NOTIFICATIONS_VIEW",
        "NOTIFICATIONS_SEND",
        "COMMUNICATIONS_DISPATCH",
      ],
    },
  });
  const admin: CommunicationAdminContext = {
    adminAccessId: access.id,
    personId: fixture.admin.person.id,
    source: "database",
    userId: fixture.admin.userId,
  };
  await prisma.user.update({
    where: { id: fixture.customer.userId },
    data: { emailVerified: true },
  });
  const customerNotifications = {
    mode: "customer",
    personId: fixture.customer.person.id,
  } satisfies NotificationActorContext;
  let bookingConversationId = "";
  let laterMessageId = "";
  let optionalSuppressedCampaignId = "";

  t.after(async () => {
    setNotificationCursorSigningSecretForTests(undefined);
    setMessageCursorSigningSecretForTests(undefined);
    setCommunicationCursorSigningSecretForTests(undefined);
    setCommunicationTestProviderFactory(undefined);
    await resetMessagingTestDatabase();
    await prisma.$disconnect();
  });

  await t.test("A — Booking Message replay is exact and read reconciliation is personal", async () => {
    bookingConversationId = (await openBookingConversationForActor(actors.customer, fixture.booking.id)).id;
    const unrelatedKey = `gate4d:unrelated:${randomUUID()}`;
    await prisma.$transaction((transaction) => createCanonicalNotifications(transaction, [{
      audience: "USER",
      body: "A safe unrelated update.",
      category: "BOOKINGS",
      destinationKind: "NOTIFICATIONS",
      eventKey: unrelatedKey,
      eventType: "gate4d.unrelated",
      mandatory: false,
      priority: "NORMAL",
      recipientPersonId: actors.owner.personId,
      sourceId: fixture.booking.id,
      sourceType: "BOOKING",
      title: "Unrelated update",
    }]));
    const key = randomUUID();
    const sent = await sendMessage(actors.customer, {
      body: "Closure booking message",
      conversationId: bookingConversationId,
      idempotencyKey: key,
    });
    assert.deepEqual(await sendMessage(actors.customer, {
      body: "Closure booking message",
      conversationId: bookingConversationId,
      idempotencyKey: key,
    }), { ...sent, replayed: true });
    assert.equal(await prisma.message.count({ where: { idempotencyKey: key } }), 1);
    for (const recipient of [actors.owner.personId, actors.manager.personId]) {
      assert.equal(await prisma.notification.count({
        where: { eventKey: `message:${sent.message.id}:recipient:${recipient}` },
      }), 1);
    }
    assert.equal(await prisma.notification.count({
      where: { eventKey: `message:${sent.message.id}:recipient:${actors.customer.personId}` },
    }), 0);

    const ownerBefore = await getUnreadMessageCount(actors.owner);
    const managerBefore = await getUnreadMessageCount(actors.manager);
    await markConversationReadForActor({
      actor: actors.owner,
      conversationId: bookingConversationId,
      throughMessageId: sent.message.id,
    });
    assert.equal((await getUnreadMessageCount(actors.owner)).count, ownerBefore.count - 1);
    assert.equal((await getUnreadMessageCount(actors.manager)).count, managerBefore.count);
    const managerNotice = await prisma.notification.findUniqueOrThrow({
      where: { eventKey: `message:${sent.message.id}:recipient:${actors.manager.personId}` },
    });
    assert.equal(await prisma.notificationRecipientState.count({
      where: { notificationId: managerNotice.id, personId: actors.manager.personId },
    }), 0);
    const unrelated = await prisma.notification.findUniqueOrThrow({ where: { eventKey: unrelatedKey } });
    assert.equal(await prisma.notificationRecipientState.count({ where: { notificationId: unrelated.id } }), 0);
    const later = await sendMessage(actors.customer, {
      body: "Closure message after read boundary",
      conversationId: bookingConversationId,
      idempotencyKey: randomUUID(),
    });
    laterMessageId = later.message.id;
    assert.equal((await getUnreadMessageCount(actors.owner)).count, ownerBefore.count);
  });

  await t.test("B — Restaurant reservation reuses the Booking Conversation and current operational scope", async () => {
    const table = await prisma.restaurantTable.create({
      data: {
        branchId: fixture.branch.id,
        businessId: fixture.organization.id,
        capacity: 4,
        name: "Gate 4D table",
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
    assert.equal(detail.source?.kind, "RESTAURANT_RESERVATION");
    for (const actor of [actors.owner, actors.manager, actors.receptionist, actors.assignedStaff]) {
      assert.equal((await getConversationDetail(actor, bookingConversationId)).id, bookingConversationId);
    }
    for (const actor of [actors.unassignedStaff, actors.foreignOwner, actors.foreignCustomer]) {
      await assert.rejects(getConversationDetail(actor, bookingConversationId), messageFailure("NOT_FOUND"));
    }
    assert.equal(await prisma.conversation.count({ where: { bookingId: fixture.booking.id } }), 1);
  });

  await t.test("C — mark-all uses an authoritative boundary and keeps archive independent", async () => {
    const boundary = new Date();
    const beforeKey = `gate4d:before:${randomUUID()}`;
    const afterKey = `gate4d:after:${randomUUID()}`;
    await createDirectNotification(beforeKey, new Date(boundary.getTime() - 1_000), fixture.customer.person.id);
    const mutationKey = randomUUID();
    const read = await markAllNotificationsRead(customerNotifications, {
      expectedVersion: 0,
      idempotencyKey: mutationKey,
      snapshot: boundary,
    }, { now: () => boundary });
    assert.equal((await markAllNotificationsRead(customerNotifications, {
      expectedVersion: 0,
      idempotencyKey: mutationKey,
      snapshot: boundary,
    }, { now: () => boundary })).replayed, true);
    await assert.rejects(markAllNotificationsRead(customerNotifications, {
      expectedVersion: read.version,
      idempotencyKey: randomUUID(),
      snapshot: new Date(boundary.getTime() + 1),
    }, { now: () => boundary }), notificationFailure("VALIDATION_ERROR"));
    await createDirectNotification(afterKey, new Date(boundary.getTime() + 1), fixture.customer.person.id);
    const before = await prisma.notification.findUniqueOrThrow({ where: { eventKey: beforeKey } });
    const after = await prisma.notification.findUniqueOrThrow({ where: { eventKey: afterKey } });
    const unread = await listNotificationInbox(customerNotifications, { filter: "unread", limit: 50 });
    assert.equal(unread.data.some((item) => item.id === before.id), false);
    assert.equal(unread.data.some((item) => item.id === after.id), true);
    const archived = await mutateNotificationState(customerNotifications, {
      action: "ARCHIVE",
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      notificationId: before.id,
    });
    assert.equal(archived.archived, true);
    const archivedPage = await listNotificationInbox(customerNotifications, { filter: "archived", limit: 50 });
    assert.equal(archivedPage.data.find((item) => item.id === before.id)?.read, true);
  });

  await t.test("D — in-app Campaign replay creates one canonical Notification and redacted audit", async () => {
    const input = campaignInput({
      channels: ["IN_APP"],
      targetPersonId: fixture.customer.person.id,
    });
    const created = await createCampaign(admin, input);
    assert.deepEqual(await createCampaign(admin, input), created);
    const send = {
      campaignId: created.id,
      expectedVersion: created.version,
      idempotencyKey: randomUUID(),
    };
    const sent = await sendCampaignNow(admin, send);
    assert.deepEqual(await sendCampaignNow(admin, send), sent);
    assert.equal(await prisma.notification.count({ where: { sourceId: created.id } }), 1);
    const campaignNotification = await prisma.notification.findFirstOrThrow({ where: { sourceId: created.id } });
    const inbox = await listNotificationInbox(customerNotifications, { filter: "all", limit: 50 });
    assert.equal(inbox.data.some((item) => item.id === campaignNotification.id), true);
    assert.equal(await prisma.communicationCampaignMutation.count({ where: { campaignId: created.id } }), 2);
    const audit = JSON.stringify(await prisma.adminAuditLog.findMany({ where: { targetId: created.id } }));
    assert.doesNotMatch(audit, /Safe content|محتوى آمن|ناوەڕۆکی پارێزراو/);
    await assert.rejects(updateCampaign(admin, {
      ...campaignInput({ targetPersonId: fixture.customer.person.id }),
      campaignId: created.id,
      expectedVersion: sent.version,
      idempotencyKey: randomUUID(),
    }), communicationFailure("CAMPAIGN_NOT_EDITABLE"));
  });

  await t.test("E — optional preference changes only future Delivery eligibility", async () => {
    const initial = await getOutboundPreferences({
      personId: fixture.customer.person.id,
      userId: fixture.customer.userId,
    });
    const first = await createCampaign(admin, campaignInput({
      channels: ["EMAIL"],
      targetPersonId: fixture.customer.person.id,
    }));
    await sendCampaignNow(admin, {
      campaignId: first.id,
      expectedVersion: first.version,
      idempotencyKey: randomUUID(),
    });
    optionalSuppressedCampaignId = first.id;
    assert.equal(await prisma.outboundDelivery.count({
      where: { campaignId: first.id, status: "SUPPRESSED" },
    }), 1);
    const key = randomUUID();
    const preference = {
      categories: { EMAIL: ["ADMIN_ANNOUNCEMENT"] as const, PUSH: [] as const, SMS: [] as const },
      expectedVersion: initial.version,
      idempotencyKey: key,
    };
    const updated = await updateOutboundPreferences({
      personId: fixture.customer.person.id,
      userId: fixture.customer.userId,
    }, preference);
    assert.deepEqual(await updateOutboundPreferences({
      personId: fixture.customer.person.id,
      userId: fixture.customer.userId,
    }, preference), updated);
    const future = await createCampaign(admin, campaignInput({
      channels: ["EMAIL"],
      targetPersonId: fixture.customer.person.id,
    }));
    await sendCampaignNow(admin, {
      campaignId: future.id,
      expectedVersion: future.version,
      idempotencyKey: randomUUID(),
    });
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: future.id, status: "PENDING" } }), 1);
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: first.id, status: "SUPPRESSED" } }), 1);
  });

  await t.test("F — mandatory ACCOUNT bypasses opt-out but not endpoint, identity, or provider truth", async () => {
    await prisma.outboundPreference.update({
      where: { personId: fixture.customer.person.id },
      data: { emailCategories: [] },
    });
    const account = await createCampaign(admin, campaignInput({
      category: "ACCOUNT",
      channels: ["EMAIL"],
      mandatory: true,
      targetPersonId: fixture.customer.person.id,
    }));
    await sendCampaignNow(admin, {
      campaignId: account.id,
      expectedVersion: account.version,
      idempotencyKey: randomUUID(),
    });
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: account.id, status: "PENDING" } }), 1);

    const missing = await createCampaign(admin, campaignInput({
      category: "ACCOUNT",
      channels: ["EMAIL"],
      mandatory: true,
      targetPersonId: fixture.foreignCustomer.person.id,
    }));
    await sendCampaignNow(admin, {
      campaignId: missing.id,
      expectedVersion: missing.version,
      idempotencyKey: randomUUID(),
    });
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: missing.id, status: "SUPPRESSED" } }), 1);
    setCommunicationTestProviderFactory(undefined);
    const claimed = await claimDueDeliveries("gate4d:not-configured", 10);
    const result = await processClaimedDeliveries("gate4d:not-configured", claimed);
    assert.ok(result.permanentFailure >= 1);
    assert.equal(await prisma.outboundDelivery.count({
      where: { campaignId: account.id, lastProviderCode: "PROVIDER_NOT_CONFIGURED", status: "PERMANENT_FAILURE" },
    }), 1);
    setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel));
    await assert.rejects(createCampaign(admin, campaignInput({
      category: "ADMIN_ANNOUNCEMENT",
      mandatory: true,
      targetPersonId: fixture.customer.person.id,
    })), communicationFailure("VALIDATION_ERROR"));
  });

  await t.test("G — Role replacement and membership revocation invalidate access and old cursors", async () => {
    const secondBooking = await prisma.booking.create({
      data: {
        branchId: fixture.branch.id,
        customerId: fixture.customer.person.id,
        customerNameSnapshot: "PRIVATE CLOSURE CUSTOMER",
        endsAt: new Date("2026-09-17T11:00:00.000Z"),
        memberId: actors.assignedStaff.membershipId,
        organizationId: fixture.organization.id,
        priceSnapshot: "1",
        serviceNameSnapshot: "Gate 4D second booking",
        startsAt: new Date("2026-09-17T10:00:00.000Z"),
      },
    });
    await openBookingConversationForActor(actors.customer, secondBooking.id);
    for (const actor of [actors.owner, actors.manager, actors.receptionist, actors.assignedStaff]) {
      const page = await listConversations(actor, { limit: 1, mode: "all" });
      assert.ok(page.nextCursor);
      const replacement = await prisma.role.create({
        data: {
          isSystem: true,
          name: `Gate4D replacement ${actor.systemRole} ${randomUUID()}`,
          organizationId: actor.organizationId,
          systemRole: actor.systemRole,
        },
      });
      await prisma.organizationMember.update({
        where: { id: actor.membershipId },
        data: { roleId: replacement.id },
      });
      await assert.rejects(listConversations(actor, { limit: 1, mode: "all" }), messageFailure("FORBIDDEN"));
      await assert.rejects(getUnreadMessageCount(actor), messageFailure("FORBIDDEN"));
      const current = { ...actor, roleId: replacement.id };
      await assert.rejects(listConversations(current, {
        cursor: page.nextCursor!,
        limit: 1,
        mode: "all",
      }), messageFailure("INVALID_CURSOR"));
      assert.equal((await getConversationDetail(current, bookingConversationId)).id, bookingConversationId);
      await prisma.organizationMember.update({
        where: { id: actor.membershipId },
        data: { roleId: actor.roleId },
      });
    }
    await prisma.organizationMember.update({
      where: { id: actors.receptionist.membershipId },
      data: { status: "INACTIVE" },
    });
    await assert.rejects(getConversationDetail(actors.receptionist, bookingConversationId), messageFailure("FORBIDDEN"));
    await prisma.organizationMember.update({
      where: { id: actors.receptionist.membershipId },
      data: { status: "ACTIVE" },
    });
  });

  await t.test("H — Admin dispatch, send, view, and access revocation are independently current", async () => {
    const page = await getCampaignPage(admin, { cursor: null, pageSize: 1, status: null });
    assert.ok(page.nextCursor);
    await prisma.adminAccess.update({
      where: { id: access.id },
      data: { permissions: ["MESSAGES_VIEW", "MESSAGES_SEND", "NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND"] },
    });
    await assert.rejects(manuallyDispatchDue(admin, {
      batchSize: 1,
      claimOwner: "gate4d:permission",
      idempotencyKey: randomUUID(),
    }), communicationFailure("FORBIDDEN"));
    assert.ok((await getCampaignPage(admin, { cursor: null, pageSize: 1, status: null })).items.length > 0);
    await createCampaign(admin, campaignInput({ channels: ["IN_APP"], targetPersonId: fixture.customer.person.id }));
    await prisma.adminAccess.update({
      where: { id: access.id },
      data: { permissions: ["MESSAGES_VIEW", "NOTIFICATIONS_VIEW"] },
    });
    await assert.rejects(createCampaign(admin, campaignInput({
      channels: ["IN_APP"], targetPersonId: fixture.customer.person.id,
    })), communicationFailure("FORBIDDEN"));
    assert.ok((await getCampaignPage(admin, { cursor: null, pageSize: 1, status: null })).items.length > 0);
    await prisma.adminAccess.update({ where: { id: access.id }, data: { status: "REVOKED" } });
    await assert.rejects(getCampaignPage(admin, {
      cursor: page.nextCursor,
      pageSize: 1,
      status: null,
    }), communicationFailure("FORBIDDEN"));
    await prisma.adminAccess.update({
      where: { id: access.id },
      data: {
        permissions: [
          "MESSAGES_VIEW", "MESSAGES_SEND", "NOTIFICATIONS_VIEW", "NOTIFICATIONS_SEND", "COMMUNICATIONS_DISPATCH",
        ],
        status: "ACTIVE",
      },
    });
  });

  await t.test("I — concurrent claims, retry, expiry, and cancellation preserve exact attempts", async () => {
    await prisma.outboundPreference.update({
      where: { personId: fixture.customer.person.id },
      data: { emailCategories: ["ADMIN_ANNOUNCEMENT"] },
    });
    const created = await createCampaign(admin, campaignInput({
      channels: ["EMAIL"], targetPersonId: fixture.customer.person.id,
    }));
    await sendCampaignNow(admin, {
      campaignId: created.id, expectedVersion: created.version, idempotencyKey: randomUUID(),
    });
    const [left, right] = await Promise.all([
      claimDueDeliveries("gate4d:dispatcher-a", 50),
      claimDueDeliveries("gate4d:dispatcher-b", 50),
    ]);
    assert.equal(new Set([...left, ...right]).size, left.length + right.length);
    await Promise.all([
      processClaimedDeliveries("gate4d:dispatcher-a", left),
      processClaimedDeliveries("gate4d:dispatcher-b", right),
    ]);
    assert.equal(await prisma.outboundDeliveryAttempt.count({ where: { delivery: { campaignId: created.id } } }), 1);

    setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel, "TRANSIENT_FAILURE"));
    const retryCampaign = await createCampaign(admin, campaignInput({
      channels: ["EMAIL"], targetPersonId: fixture.customer.person.id,
    }));
    await sendCampaignNow(admin, {
      campaignId: retryCampaign.id, expectedVersion: retryCampaign.version, idempotencyKey: randomUUID(),
    });
    const retryIds = await claimDueDeliveries("gate4d:retry", 1);
    assert.equal((await processClaimedDeliveries("gate4d:retry", retryIds)).retryScheduled, 1);
    const retryDelivery = await prisma.outboundDelivery.findFirstOrThrow({ where: { campaignId: retryCampaign.id } });
    const retryAt = new Date("2027-01-01T10:00:00.000Z");
    await prisma.outboundDelivery.update({
      where: { id: retryDelivery.id },
      data: { nextAttemptAt: new Date(retryAt.getTime() - 1_000) },
    });
    setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel, "PERMANENT_FAILURE"));
    const permanentIds = await claimDueDeliveries("gate4d:permanent", 1, retryAt);
    await processClaimedDeliveries("gate4d:permanent", permanentIds, retryAt);
    assert.equal((await prisma.outboundDelivery.findUniqueOrThrow({ where: { id: retryDelivery.id } })).status, "PERMANENT_FAILURE");

    setCommunicationTestProviderFactory((channel) => new DeterministicSinkProvider(channel));
    const expiring = await createCampaign(admin, campaignInput({ channels: ["EMAIL"], targetPersonId: fixture.customer.person.id }));
    await sendCampaignNow(admin, { campaignId: expiring.id, expectedVersion: expiring.version, idempotencyKey: randomUUID() });
    const claimAt = new Date("2027-01-02T10:00:00.000Z");
    assert.equal((await claimDueDeliveries("gate4d:expiry", 1, claimAt)).length, 1);
    assert.equal(await releaseExpiredClaims(new Date(claimAt.getTime() + 6 * 60_000)), 1);

    const cancellable = await createCampaign(admin, campaignInput({ channels: ["EMAIL"], targetPersonId: fixture.customer.person.id }));
    const queued = await sendCampaignNow(admin, { campaignId: cancellable.id, expectedVersion: cancellable.version, idempotencyKey: randomUUID() });
    await cancelCampaign(admin, {
      campaignId: cancellable.id,
      expectedVersion: queued.version,
      idempotencyKey: randomUUID(),
      reason: "Gate 4D cancellation",
    });
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: cancellable.id, status: "CANCELLED" } }), 1);
  });

  await t.test("J — authenticated cursors reject public hashes, wrong scopes, rotation, and revocation first", async () => {
    const notificationPage = await listNotificationInbox(customerNotifications, { filter: "all", limit: 1 });
    assert.ok(notificationPage.pageInfo.nextCursor);
    await assert.rejects(listNotificationInbox(customerNotifications, {
      cursor: forgePublicSha(notificationPage.pageInfo.nextCursor!, { pageSize: 2 }),
      filter: "all",
      limit: 1,
    }), notificationFailure("INVALID_CURSOR"));
    const messagePage = await listMessages(actors.owner, bookingConversationId, { limit: 1 });
    assert.ok(messagePage.nextCursor);
    await assert.rejects(listMessages(actors.owner, bookingConversationId, {
      cursor: forgePublicSha(messagePage.nextCursor!, { conversationId: randomUUID() }),
      limit: 1,
    }), messageFailure("INVALID_CURSOR"));
    const campaigns = await getCampaignPage(admin, { cursor: null, pageSize: 1, status: null });
    assert.ok(campaigns.nextCursor);
    await assert.rejects(getCampaignPage(admin, {
      cursor: forgePublicSha(campaigns.nextCursor!, { filterFingerprint: "0".repeat(64) }),
      pageSize: 1,
      status: null,
    }), communicationFailure("INVALID_CURSOR"));
    setCommunicationCursorSigningSecretForTests(ROTATED_COMMUNICATION_CURSOR_SECRET);
    await assert.rejects(getCampaignPage(admin, {
      cursor: campaigns.nextCursor,
      pageSize: 1,
      status: null,
    }), communicationFailure("INVALID_CURSOR"));
    setCommunicationCursorSigningSecretForTests(TEST_COMMUNICATION_CURSOR_SECRET);
    await prisma.adminAccess.update({ where: { id: access.id }, data: { status: "REVOKED" } });
    await assert.rejects(getCampaignPage(admin, {
      cursor: campaigns.nextCursor,
      pageSize: 1,
      status: null,
    }), communicationFailure("FORBIDDEN"));
    await prisma.adminAccess.update({ where: { id: access.id }, data: { status: "ACTIVE" } });
    assert.equal(await prisma.message.count({ where: { id: laterMessageId } }), 1);
    assert.equal(await prisma.outboundDelivery.count({ where: { campaignId: optionalSuppressedCampaignId, status: "SUPPRESSED" } }), 1);
  });
});

async function createDirectNotification(eventKey: string, occurredAt: Date, recipientPersonId: string) {
  await prisma.$transaction((transaction) => createCanonicalNotifications(transaction, [{
    audience: "USER",
    body: "A safe Gate 4D boundary update.",
    category: "ACCOUNT",
    destinationKind: "NOTIFICATIONS",
    eventKey,
    eventType: "gate4d.boundary",
    mandatory: true,
    occurredAt,
    priority: "NORMAL",
    recipientPersonId,
    sourceType: "ACCOUNT",
    title: "Boundary update",
  }], { producedAt: occurredAt }));
}

function forgePublicSha(cursor: string, changes: Record<string, unknown>) {
  const decoded = {
    ...JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>,
    ...changes,
  };
  const { mac: _mac, ...core } = decoded;
  void _mac;
  return Buffer.from(JSON.stringify({
    ...decoded,
    mac: createHash("sha256").update(JSON.stringify(core)).digest("hex"),
  }), "utf8").toString("base64url");
}
