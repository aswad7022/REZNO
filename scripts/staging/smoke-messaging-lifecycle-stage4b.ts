import assert from "node:assert/strict";

import type { MessageActor } from "../../features/messages/domain/contracts";
import { MessageDomainError } from "../../features/messages/domain/errors";
import { markConversationReadForActor } from "../../features/messages/services/conversation-read";
import {
  getConversationDetail,
  getUnreadMessageCount,
  listConversations,
  listMessages,
} from "../../features/messages/services/query-service";
import { prisma } from "../../lib/db/prisma";
import { MESSAGING_STAGE4B_FIXTURE } from "./messaging-lifecycle-stage4b-fixture";

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
  const admin: MessageActor = {
    adminSource: "database",
    canSend: true,
    kind: "admin",
    personId: id(4_107),
    userId: userId(8),
  };
  const bookingConversationId = id(4_950);
  const generalConversationId = id(4_951);
  const adminUserConversationId = id(4_952);
  const adminBusinessConversationId = id(4_953);

  const [customerPage, ownerPage, managerPage, receptionistPage, staffPage, unassignedPage, adminPage] = await Promise.all([
    listConversations(customer, { limit: 20, mode: "all" }),
    listConversations(owner, { limit: 20, mode: "all" }),
    listConversations(manager, { limit: 20, mode: "all" }),
    listConversations(receptionist, { limit: 20, mode: "all" }),
    listConversations(assignedStaff, { limit: 20, mode: "all" }),
    listConversations(unassignedStaff, { limit: 20, mode: "all" }),
    listConversations(admin, { limit: 20, mode: "all" }),
  ]);
  assert.ok(customerPage.nextCursor);
  assert.ok(ownerPage.nextCursor);
  assert.ok(managerPage.nextCursor);
  assert.deepEqual(receptionistPage.data.map((item) => item.id), [bookingConversationId]);
  assert.deepEqual(staffPage.data.map((item) => item.id), [bookingConversationId]);
  assert.equal(unassignedPage.data.length, 0);
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
  assert.ok((await getUnreadMessageCount(owner)).count > 0);
  assert.ok((await getUnreadMessageCount(manager)).count > 0);

  const read = await markConversationReadForActor({
    actor: owner,
    conversationId: bookingConversationId,
    throughMessageId: id(6_023),
  });
  assert.equal(read.authorized, true);
  assert.equal(read.updatedCount, 2);
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
  const audit = await prisma.adminAuditLog.findFirstOrThrow({
    where: { adminUserId: userId(8), action: "admin.message.send" },
  });
  assert.equal(JSON.stringify(audit).includes("Admin/User fixture message"), false);

  process.stdout.write(
    `Stage 4B smoke passed. customer=${customerPage.data.length} owner=${ownerPage.data.length} manager=${managerPage.data.length} receptionist=${receptionistPage.data.length} assignedStaff=${staffPage.data.length} admin=${adminPage.data.length} messages=${firstMessages.data.length + olderMessages.data.length} reconciled=${read.updatedCount}\n`,
  );
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
