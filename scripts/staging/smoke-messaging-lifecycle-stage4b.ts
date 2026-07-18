import assert from "node:assert/strict";

import type { MessageActor } from "../../features/messages/domain/contracts";
import { MessageDomainError } from "../../features/messages/domain/errors";
import { markConversationReadForActor } from "../../features/messages/services/conversation-read";
import {
  sendMessage,
  startCustomerBusinessConversation,
} from "../../features/messages/services/delivery-service";
import {
  getConversationDetail,
  getUnreadMessageCount,
  listConversations,
  listMessages,
} from "../../features/messages/services/query-service";
import { prisma } from "../../lib/db/prisma";
import { seedCommerceAdminStage3dFixture } from "./commerce-admin-stage3d-seed-core";
import { seedCommerceMerchantStoreStage3aFixture } from "./commerce-merchant-store-stage3a-seed-core";
import { seedCommerceOrdersFulfillmentStage3cFixture } from "./commerce-orders-fulfillment-stage3c-seed-core";
import { seedCommerceProductsInventoryStage3bFixture } from "./commerce-products-inventory-stage3b-seed-core";
import { MESSAGING_STAGE4B_FIXTURE } from "./messaging-lifecycle-stage4b-fixture";
import { seedNotificationCenterStage4aFixture } from "./notification-center-stage4a-fixture";

const { id, userId } = MESSAGING_STAGE4B_FIXTURE;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const confirmation = process.env.MESSAGING_STAGE4B_SMOKE_CONFIRM;
  const environment = (process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
  if (!databaseUrl) throw new Error("Staging database access is required.");
  if (confirmation !== "REZNO_MESSAGING_STAGE4B_SMOKE") {
    throw new Error("Exact Stage 4B smoke confirmation is required.");
  }
  if (["prod", "production", "live"].some((value) => environment.includes(value))) {
    throw new Error("Stage 4B smoke refuses production environments.");
  }
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!/(rezno_staging|stage4b|test)/i.test(databaseName)) {
    throw new Error("Stage 4B smoke requires an explicit staging/test database.");
  }

  const customer: MessageActor = { kind: "customer", personId: id(4_100), userId: userId(1) };
  const secondCustomer: MessageActor = { kind: "customer", personId: id(4_101), userId: userId(2) };
  const business = (
    person: number,
    membership: number,
    role: number,
    systemRole: "MANAGER" | "OWNER" | "RECEPTIONIST" | "STAFF",
    user: number,
  ): MessageActor => ({
    kind: "business",
    membershipId: id(membership),
    organizationId: id(4_201),
    personId: id(person),
    roleId: id(role),
    systemRole,
    userId: userId(user),
  });
  const owner = business(4_102, 4_401, 4_301, "OWNER", 3);
  const manager = business(4_103, 4_402, 4_302, "MANAGER", 4);
  const receptionist = business(4_104, 4_403, 4_303, "RECEPTIONIST", 5);
  const assignedStaff = business(4_105, 4_404, 4_304, "STAFF", 6);
  const unassignedStaff = business(4_106, 4_405, 4_305, "STAFF", 7);
  const revokedStaff = business(4_108, 4_407, 4_307, "STAFF", 9);
  const foreignOwner: MessageActor = {
    kind: "business",
    membershipId: id(4_406),
    organizationId: id(4_202),
    personId: id(4_101),
    roleId: id(4_306),
    systemRole: "OWNER",
    userId: userId(2),
  };
  const inactiveCustomer: MessageActor = {
    kind: "customer",
    personId: id(4_109),
    userId: userId(10),
  };
  const admin: MessageActor = {
    adminSource: "database",
    canSend: true,
    kind: "admin",
    personId: id(4_107),
    userId: userId(8),
  };
  const readOnlyAdmin: MessageActor = {
    adminSource: "database",
    canSend: false,
    kind: "admin",
    personId: id(4_110),
    userId: userId(11),
  };
  const secondAdmin: MessageActor = {
    adminSource: "database",
    canSend: true,
    kind: "admin",
    personId: id(4_111),
    userId: userId(12),
  };
  const bookingConversationId = id(4_950);
  const generalConversationId = id(4_951);
  const adminUserConversationId = id(4_952);
  const adminBusinessConversationId = id(4_953);
  const priorBaseline = await priorFixtureFingerprints();

  const [
    customerPage,
    ownerPage,
    managerPage,
    receptionistPage,
    staffPage,
    unassignedPage,
    foreignPage,
    secondCustomerPage,
    adminPage,
    readOnlyAdminPage,
    secondAdminPage,
  ] = await Promise.all([
    listConversations(customer, { limit: 20, mode: "all" }),
    listConversations(owner, { limit: 20, mode: "all" }),
    listConversations(manager, { limit: 20, mode: "all" }),
    listConversations(receptionist, { limit: 20, mode: "all" }),
    listConversations(assignedStaff, { limit: 20, mode: "all" }),
    listConversations(unassignedStaff, { limit: 20, mode: "all" }),
    listConversations(foreignOwner, { limit: 20, mode: "all" }),
    listConversations(secondCustomer, { limit: 20, mode: "all" }),
    listConversations(admin, { limit: 20, mode: "all" }),
    listConversations(readOnlyAdmin, { limit: 20, mode: "all" }),
    listConversations(secondAdmin, { limit: 20, mode: "all" }),
  ]);
  assert.ok(customerPage.nextCursor);
  assert.ok(ownerPage.nextCursor);
  assert.ok(managerPage.nextCursor);
  assert.deepEqual(receptionistPage.data.map((item) => item.id), [bookingConversationId]);
  assert.deepEqual(staffPage.data.map((item) => item.id), [bookingConversationId]);
  assert.equal(unassignedPage.data.length, 0);
  assert.equal(foreignPage.data.length, 0);
  assert.equal(secondCustomerPage.data.length, 0);
  assert.equal(readOnlyAdminPage.data.length, 0);
  assert.equal(secondAdminPage.data.length, 0);
  assert.deepEqual(new Set(adminPage.data.map((item) => item.id)), new Set([
    adminUserConversationId,
    adminBusinessConversationId,
  ]));
  assert.equal((await getConversationDetail(customer, bookingConversationId)).source?.kind, "RESTAURANT_RESERVATION");
  assert.equal((await getConversationDetail(owner, generalConversationId)).id, generalConversationId);
  await assert.rejects(
    getConversationDetail(receptionist, generalConversationId),
    (error) => error instanceof MessageDomainError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    getConversationDetail(customer, adminBusinessConversationId),
    (error) => error instanceof MessageDomainError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    getConversationDetail(unassignedStaff, bookingConversationId),
    (error) => error instanceof MessageDomainError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    getConversationDetail(foreignOwner, bookingConversationId),
    (error) => error instanceof MessageDomainError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    getConversationDetail(secondAdmin, adminUserConversationId),
    (error) => error instanceof MessageDomainError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    listConversations(revokedStaff, { limit: 20, mode: "all" }),
    (error) => error instanceof MessageDomainError && error.code === "FORBIDDEN",
  );
  await assert.rejects(
    listConversations(inactiveCustomer, { limit: 20, mode: "all" }),
    (error) => error instanceof MessageDomainError && error.code === "FORBIDDEN",
  );
  await assert.rejects(
    listConversations(
      { ...owner, personId: id(4_101), userId: userId(2) },
      { limit: 20, mode: "all" },
    ),
    (error) => error instanceof MessageDomainError && error.code === "FORBIDDEN",
  );
  const customerSecondPage = await listConversations(customer, {
    cursor: customerPage.nextCursor!,
    limit: 20,
    mode: "all",
  });
  assert.ok(customerSecondPage.data.length > 0);
  assert.equal(
    new Set([...customerPage.data, ...customerSecondPage.data].map((item) => item.id)).size,
    customerPage.data.length + customerSecondPage.data.length,
  );
  const serializedLists = JSON.stringify({
    adminPage,
    customerPage,
    managerPage,
    ownerPage,
  });
  assert.doesNotMatch(serializedLists, /@messaging-stage4b\.rezno\.invalid|private customer snapshot|authUserId|customerNameSnapshot|priceSnapshot/);

  const firstMessages = await listMessages(owner, bookingConversationId, { limit: 20 });
  assert.equal(firstMessages.data.length, 20);
  assert.ok(firstMessages.nextCursor);
  const olderMessages = await listMessages(owner, bookingConversationId, {
    cursor: firstMessages.nextCursor!,
    limit: 20,
  });
  assert.equal(olderMessages.data.length, 16);
  assert.equal(new Set([...firstMessages.data, ...olderMessages.data].map((item) => item.id)).size, 36);
  await assert.rejects(
    listMessages(manager, bookingConversationId, { cursor: firstMessages.nextCursor!, limit: 20 }),
    (error) => error instanceof MessageDomainError && error.code === "INVALID_CURSOR",
  );
  const ownerUnreadBeforeRead = (await getUnreadMessageCount(owner)).count;
  const managerUnreadBeforeRead = (await getUnreadMessageCount(manager)).count;
  const customerUnreadBeforeSends = (await getUnreadMessageCount(customer)).count;
  assert.ok(ownerUnreadBeforeRead > 0);
  assert.ok(managerUnreadBeforeRead > 0);

  const read = await markConversationReadForActor({
    actor: owner,
    conversationId: bookingConversationId,
    throughMessageId: id(6_023),
  });
  assert.equal(read.authorized, true);
  assert.equal(read.updatedCount, 2);
  assert.equal((await getUnreadMessageCount(manager)).count, managerUnreadBeforeRead);
  const ownerUnreadAfterRead = (await getUnreadMessageCount(owner)).count;
  const notifications = await prisma.notification.findMany({
    where: {
      eventKey: { in: [20, 22].map((index) =>
        `message:${id(6_000 + index)}:recipient:${id(4_102)}`) },
    },
    include: { recipientStates: true },
  });
  assert.equal(notifications.length, 2);
  assert.equal(notifications.every((item) =>
    item.recipientStates.some((state) => state.personId === id(4_102) && state.readState === "READ")), true);

  const customerSend = await startCustomerBusinessConversation(customer, {
    body: "Stage 4B staging customer replay sentinel",
    businessId: id(4_201),
    idempotencyKey: id(8_001),
  });
  assert.equal(customerSend.conversationId, generalConversationId);
  assert.equal(customerSend.replayed, false);
  const customerReplay = await startCustomerBusinessConversation(customer, {
    body: "Stage 4B staging customer replay sentinel",
    businessId: id(4_201),
    idempotencyKey: id(8_001),
  });
  assert.equal(customerReplay.replayed, true);
  assert.equal(customerReplay.message.id, customerSend.message.id);
  await assert.rejects(
    startCustomerBusinessConversation(customer, {
      body: "Stage 4B changed replay sentinel",
      businessId: id(4_201),
      idempotencyKey: id(8_001),
    }),
    (error) => error instanceof MessageDomainError && error.code === "IDEMPOTENCY_CONFLICT",
  );
  assert.equal((await getUnreadMessageCount(owner)).count, ownerUnreadAfterRead + 1);

  const ownerSend = await sendMessage(owner, {
    body: "Stage 4B Owner staging send",
    conversationId: bookingConversationId,
    idempotencyKey: id(8_002),
  });
  const managerSend = await sendMessage(manager, {
    body: "Stage 4B Manager staging send",
    conversationId: bookingConversationId,
    idempotencyKey: id(8_003),
  });
  const receptionistSend = await sendMessage(receptionist, {
    body: "Stage 4B Receptionist staging send",
    conversationId: bookingConversationId,
    idempotencyKey: id(8_004),
  });
  const staffSend = await sendMessage(assignedStaff, {
    body: "Stage 4B assigned Staff staging send",
    conversationId: bookingConversationId,
    idempotencyKey: id(8_005),
  });
  assert.equal((await getUnreadMessageCount(customer)).count, customerUnreadBeforeSends + 4);

  const adminUserSend = await sendMessage(admin, {
    body: "Stage 4B Admin User staging send",
    conversationId: adminUserConversationId,
    idempotencyKey: id(8_006),
  });
  const adminBusinessSend = await sendMessage(admin, {
    body: "Stage 4B Admin Business staging send",
    conversationId: adminBusinessConversationId,
    idempotencyKey: id(8_007),
  });
  await assert.rejects(
    sendMessage(readOnlyAdmin, {
      body: "Read-only Admin must not send",
      conversationId: adminUserConversationId,
      idempotencyKey: id(8_008),
    }),
    (error) => error instanceof MessageDomainError && error.code === "FORBIDDEN",
  );
  await assert.rejects(
    sendMessage(secondAdmin, {
      body: "Second Admin must not take over",
      conversationId: adminUserConversationId,
      idempotencyKey: id(8_009),
    }),
    (error) => error instanceof MessageDomainError && error.code === "NOT_FOUND",
  );

  const customerNotificationKey =
    `message:${customerSend.message.id}:recipient:${id(4_102)}`;
  const [customerNotifications, customerMessageCount] = await Promise.all([
    prisma.notification.findMany({
      where: { eventKey: { startsWith: `message:${customerSend.message.id}:recipient:` } },
      include: { recipientStates: true },
      orderBy: { recipientPersonId: "asc" },
    }),
    prisma.message.count({
      where: { idempotencyKey: id(8_001), senderUserId: userId(1) },
    }),
  ]);
  assert.equal(customerNotifications.length, 2);
  assert.deepEqual(
    customerNotifications.map((notification) => notification.recipientPersonId),
    [id(4_102), id(4_103)],
  );
  const customerNotification = customerNotifications.find(
    (notification) => notification.eventKey === customerNotificationKey,
  );
  assert.ok(customerNotification);
  assert.equal(customerMessageCount, 1);
  assert.equal(customerNotification.recipientStates.some((state) =>
    state.personId === id(4_102) && state.readState === "READ"), false);
  assert.doesNotMatch(
    JSON.stringify(customerNotification),
    /Stage 4B staging customer replay sentinel/,
  );
  assert.match(customerNotification.body, /new message/i);

  const audits = await prisma.adminAuditLog.findMany({
    where: { adminUserId: userId(8), action: "admin.message.send" },
  });
  const serializedAudits = JSON.stringify(audits);
  assert.equal(serializedAudits.includes("Admin/User fixture message"), false);
  assert.equal(serializedAudits.includes("Stage 4B Admin User staging send"), false);
  assert.equal(serializedAudits.includes("Stage 4B Admin Business staging send"), false);
  assert.deepEqual(await priorFixtureFingerprints(), priorBaseline);

  process.stdout.write(
    `Stage 4B smoke passed. customer=${customerPage.data.length} owner=${ownerPage.data.length} manager=${managerPage.data.length} receptionist=${receptionistPage.data.length} assignedStaff=${staffPage.data.length} unassigned=denied foreign=isolated revoked=denied inactive=denied admin=${adminPage.data.length} readOnlyAdmin=denied secondAdmin=isolated messages=${firstMessages.data.length + olderMessages.data.length} sends=${[customerSend, ownerSend, managerSend, receptionistSend, staffSend, adminUserSend, adminBusinessSend].length} replay=exact reconciled=${read.updatedCount} notification=exact-once pii=absent priorFingerprints=unchanged\n`,
  );
}

async function priorFixtureFingerprints() {
  const stage4a = await seedNotificationCenterStage4aFixture(prisma);
  const stage3a = await seedCommerceMerchantStoreStage3aFixture(prisma);
  const stage3b = await seedCommerceProductsInventoryStage3bFixture(prisma);
  const stage3c = await seedCommerceOrdersFulfillmentStage3cFixture(prisma);
  const stage3d = await seedCommerceAdminStage3dFixture(prisma);
  return {
    stage3a: stage3a.fingerprint,
    stage3b: stage3b.fingerprint,
    stage3c: stage3c.fingerprint,
    stage3d: stage3d.fingerprint,
    stage4a: stage4a.fingerprint,
  };
}

void main().finally(async () => {
  await prisma.$disconnect();
}).catch((error) => {
  const message = error instanceof Error &&
    /^(Staging database access|Exact Stage 4B smoke confirmation|Stage 4B smoke refuses|Stage 4B smoke requires)/.test(error.message)
    ? error.message
    : process.env.NODE_ENV === "test" && error instanceof Error
      ? error.stack ?? error.message
    : "Stage 4B smoke failed; inspect secure server logs.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
