import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { messageActorScopeKey } from "../../../features/messages/domain/contracts";
import { MessageDomainError } from "../../../features/messages/domain/errors";
import { setMessageAuthorizationTestHook } from "../../../features/messages/services/actor";
import {
  openBookingConversationForActor,
  sendMessage,
  setMessageRateLimitConsumerForTests,
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

async function waitForPostgresLock(pid: number) {
  for (let attempt = 0; attempt < 5_000; attempt += 1) {
    const [activity] = await prisma.$queryRaw<Array<{ waitEventType: string | null }>>(Prisma.sql`
      SELECT "wait_event_type" AS "waitEventType"
      FROM "pg_stat_activity"
      WHERE "pid" = ${pid}
    `);
    if (activity?.waitEventType === "Lock") return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail(`PostgreSQL backend ${pid} did not wait on the authorization lock.`);
}

async function readWhileAuthorizationMutationWaits<T>(
  actorScope: string,
  read: () => Promise<T>,
  mutate: (transaction: Prisma.TransactionClient) => Promise<unknown>,
) {
  const authorizationReached = deferred<void>();
  const releaseAuthorization = deferred<void>();
  let armed = true;
  setMessageAuthorizationTestHook(async (actor) => {
    if (!armed || messageActorScopeKey(actor) !== actorScope) return;
    armed = false;
    authorizationReached.resolve();
    await releaseAuthorization.promise;
  });
  const readPromise = read();
  let mutationPromise: Promise<unknown> | undefined;
  try {
    await authorizationReached.promise;
    const backendReady = deferred<number>();
    mutationPromise = prisma.$transaction(async (transaction) => {
      const [backend] = await transaction.$queryRaw<Array<{ pid: number }>>(
        Prisma.sql`SELECT pg_backend_pid()::integer AS "pid"`,
      );
      assert.ok(backend);
      backendReady.resolve(backend.pid);
      return mutate(transaction);
    });
    await waitForPostgresLock(await backendReady.promise);
    releaseAuthorization.resolve();
    const result = await readPromise;
    await mutationPromise;
    return result;
  } finally {
    releaseAuthorization.resolve();
    setMessageAuthorizationTestHook(undefined);
    await mutationPromise?.catch(() => undefined);
  }
}

test("Gate 4B review fixes keep reads atomic and start replay exact", { concurrency: false }, async (t) => {
  await resetMessagingTestDatabase();
  const fixture = await createMessagingFixture("gate4b-review");
  const { actors } = fixture;
  const bookingConversation = await openBookingConversationForActor(
    actors.customer,
    fixture.booking.id,
  );
  let adminUserConversationId = "";
  let adminUserReplayKey = "";
  const adminUserReplayBody = "Admin User exact replay after quota";

  t.after(async () => {
    setMessageAuthorizationTestHook(undefined);
    setMessageRateLimitConsumerForTests(undefined);
    await resetMessagingTestDatabase();
    await prisma.$disconnect();
  });

  await t.test("Customer and Admin USER/BUSINESS exact replay bypass exhausted quota", async () => {
    const calls = new Map<string, number>();
    setMessageRateLimitConsumerForTests((scope, identifier, options) => {
      const key = `${scope}:${identifier}`;
      const count = (calls.get(key) ?? 0) + 1;
      calls.set(key, count);
      const limit = scope === "message:start"
        ? 1
        : scope === "message:adminStart"
          ? 2
          : options.limit;
      return { retryAfterSeconds: count > limit ? 60 : 0, success: count <= limit };
    });
    try {
      const customerKey = randomUUID();
      const customerStart = await startCustomerBusinessConversation(actors.customer, {
        body: "Customer exact replay after quota",
        businessId: fixture.organization.id,
        idempotencyKey: customerKey,
      });
      const customerReplay = await startCustomerBusinessConversation(actors.customer, {
        body: "Customer exact replay after quota",
        businessId: fixture.organization.id,
        idempotencyKey: customerKey,
      });
      assert.equal(customerReplay.replayed, true);
      assert.equal(customerReplay.message.id, customerStart.message.id);
      assert.equal(calls.get(`message:start:${actors.customer.userId}`), 1);
      await assert.rejects(startCustomerBusinessConversation(actors.customer, {
        body: "Changed body",
        businessId: fixture.organization.id,
        idempotencyKey: customerKey,
      }), rejectsWith("IDEMPOTENCY_CONFLICT"));
      await assert.rejects(startCustomerBusinessConversation(actors.customer, {
        body: "Customer exact replay after quota",
        businessId: fixture.foreignOrganization.id,
        idempotencyKey: customerKey,
      }), rejectsWith("IDEMPOTENCY_CONFLICT"));
      await assert.rejects(startCustomerBusinessConversation(actors.customer, {
        body: "New start beyond quota",
        businessId: fixture.organization.id,
        idempotencyKey: randomUUID(),
      }), rejectsWith("RATE_LIMITED"));
      assert.equal(calls.get(`message:start:${actors.customer.userId}`), 2);

      const crossActor = await startCustomerBusinessConversation(actors.foreignCustomer, {
        body: "Cross-actor key is not a replay",
        businessId: fixture.foreignOrganization.id,
        idempotencyKey: customerKey,
      });
      assert.equal(crossActor.replayed, false);
      assert.notEqual(crossActor.message.id, customerStart.message.id);
      assert.equal(await prisma.message.count({ where: { idempotencyKey: customerKey } }), 2);
      assert.equal(await prisma.notification.count({
        where: { eventKey: { startsWith: `message:${customerStart.message.id}:recipient:` } },
      }), 2);

      await prisma.organization.update({
        where: { id: fixture.organization.id },
        data: { isActive: false },
      });
      try {
        await assert.rejects(startCustomerBusinessConversation(actors.customer, {
          body: "Customer exact replay after quota",
          businessId: fixture.organization.id,
          idempotencyKey: customerKey,
        }), rejectsWith("NOT_FOUND"));
      } finally {
        await prisma.organization.update({
          where: { id: fixture.organization.id },
          data: { isActive: true },
        });
      }

      adminUserReplayKey = randomUUID();
      const adminBusinessKey = randomUUID();
      const adminUser = await startAdminConversation(actors.admin, {
        body: adminUserReplayBody,
        idempotencyKey: adminUserReplayKey,
        targetId: actors.customer.personId,
        targetType: "USER",
      });
      adminUserConversationId = adminUser.conversationId;
      const adminBusiness = await startAdminConversation(actors.admin, {
        body: "Admin Business exact replay after quota",
        idempotencyKey: adminBusinessKey,
        targetId: fixture.organization.id,
        targetType: "BUSINESS",
      });
      for (const [key, body, targetId, targetType, messageId] of [
        [adminUserReplayKey, adminUserReplayBody, actors.customer.personId, "USER", adminUser.message.id],
        [adminBusinessKey, "Admin Business exact replay after quota", fixture.organization.id, "BUSINESS", adminBusiness.message.id],
      ] as const) {
        const replay = await startAdminConversation(actors.admin, {
          body,
          idempotencyKey: key,
          targetId,
          targetType,
        });
        assert.equal(replay.replayed, true);
        assert.equal(replay.message.id, messageId);
      }
      assert.equal(calls.get(`message:adminStart:${actors.admin.userId}`), 2);
      await assert.rejects(startAdminConversation(actors.admin, {
        body: "Changed Admin target type",
        idempotencyKey: adminUserReplayKey,
        targetId: fixture.organization.id,
        targetType: "BUSINESS",
      }), rejectsWith("IDEMPOTENCY_CONFLICT"));
      await assert.rejects(startAdminConversation(actors.admin, {
        body: "New Admin start beyond quota",
        idempotencyKey: randomUUID(),
        targetId: actors.customer.personId,
        targetType: "USER",
      }), rejectsWith("RATE_LIMITED"));
      assert.equal(calls.get(`message:adminStart:${actors.admin.userId}`), 3);
      for (const [key, messageId] of [
        [adminUserReplayKey, adminUser.message.id],
        [adminBusinessKey, adminBusiness.message.id],
      ]) {
        assert.equal(await prisma.message.count({
          where: { idempotencyKey: key, senderUserId: actors.admin.userId },
        }), 1);
        assert.equal(await prisma.adminAuditLog.count({
          where: { adminUserId: actors.admin.userId, idempotencyKey: key },
        }), 1);
        assert.ok(await prisma.notification.count({
          where: { eventKey: { startsWith: `message:${messageId}:recipient:` } },
        }) > 0);
      }
    } finally {
      setMessageRateLimitConsumerForTests(undefined);
    }
  });

  await t.test("membership, role, Person, and AdminAccess mutations wait for complete reads", async () => {
    const replacement = await prisma.role.create({ data: {
      isSystem: true,
      name: "Replacement owner",
      organizationId: fixture.organization.id,
      systemRole: "OWNER",
    } });
    const membershipRead = await readWhileAuthorizationMutationWaits(
      messageActorScopeKey(actors.owner),
      () => listConversations(actors.owner, { limit: 20, mode: "all" }),
      (transaction) => transaction.organizationMember.update({
        where: { id: actors.owner.membershipId },
        data: { status: "INACTIVE" },
      }),
    );
    assert.ok(membershipRead.data.length > 0);
    await assert.rejects(
      listConversations(actors.owner, { limit: 20, mode: "all" }),
      rejectsWith("FORBIDDEN"),
    );
    await prisma.organizationMember.update({
      where: { id: actors.owner.membershipId },
      data: { status: "ACTIVE" },
    });

    const ownerPage = await listConversations(actors.owner, { limit: 1, mode: "all" });
    assert.ok(ownerPage.nextCursor);
    const roleRead = await readWhileAuthorizationMutationWaits(
      messageActorScopeKey(actors.owner),
      () => listConversations(actors.owner, { limit: 20, mode: "all" }),
      (transaction) => transaction.organizationMember.update({
        where: { id: actors.owner.membershipId },
        data: { roleId: replacement.id },
      }),
    );
    assert.ok(roleRead.data.length > 0);
    await assert.rejects(
      listConversations(actors.owner, { limit: 20, mode: "all" }),
      rejectsWith("FORBIDDEN"),
    );
    await assert.rejects(listConversations(
      { ...actors.owner, roleId: replacement.id },
      { cursor: ownerPage.nextCursor!, limit: 1, mode: "all" },
    ), rejectsWith("INVALID_CURSOR"));
    await prisma.organizationMember.update({
      where: { id: actors.owner.membershipId },
      data: { roleId: actors.owner.roleId },
    });

    const customerRead = await readWhileAuthorizationMutationWaits(
      messageActorScopeKey(actors.customer),
      () => getUnreadMessageCount(actors.customer),
      (transaction) => transaction.person.update({
        where: { id: actors.customer.personId },
        data: { status: "INACTIVE" },
      }),
    );
    assert.ok(customerRead.count >= 0);
    await assert.rejects(
      listConversations(actors.customer, { limit: 20, mode: "all" }),
      rejectsWith("FORBIDDEN"),
    );
    await prisma.person.update({
      where: { id: actors.customer.personId },
      data: { status: "ACTIVE" },
    });

    const adminRead = await readWhileAuthorizationMutationWaits(
      messageActorScopeKey(actors.admin),
      () => getConversationDetail(actors.admin, adminUserConversationId),
      (transaction) => transaction.adminAccess.update({
        where: { userId: actors.admin.userId },
        data: { status: "REVOKED" },
      }),
    );
    assert.equal(adminRead.canReply, true);
    await assert.rejects(
      listConversations(actors.admin, { limit: 20, mode: "all" }),
      rejectsWith("FORBIDDEN"),
    );
    await prisma.adminAccess.update({
      where: { userId: actors.admin.userId },
      data: { status: "ACTIVE" },
    });
  });

  await t.test("current Admin grant refresh keeps read-only history and denies sends", async () => {
    await prisma.adminAccess.update({
      where: { userId: actors.admin.userId },
      data: { permissions: ["MESSAGES_VIEW"] },
    });
    try {
      const list = await listConversations(actors.admin, { limit: 20, mode: "all" });
      assert.ok(list.data.length >= 2);
      const detail = await getConversationDetail(actors.admin, adminUserConversationId);
      assert.equal(detail.canReply, false);
      assert.ok((await listMessages(actors.admin, detail.id, { limit: 20 })).data.length > 0);
      await assert.rejects(sendMessage(actors.admin, {
        body: "Read-only grant cannot reply",
        conversationId: bookingConversation.id,
        idempotencyKey: randomUUID(),
      }), rejectsWith("FORBIDDEN"));
      await assert.rejects(startAdminConversation(actors.admin, {
        body: adminUserReplayBody,
        idempotencyKey: adminUserReplayKey,
        targetId: actors.customer.personId,
        targetType: "USER",
      }), rejectsWith("FORBIDDEN"));
    } finally {
      await prisma.adminAccess.update({
        where: { userId: actors.admin.userId },
        data: { permissions: ["MESSAGES_SEND", "MESSAGES_VIEW"] },
      });
    }
    await prisma.adminAccess.update({
      where: { userId: actors.admin.userId },
      data: { permissions: ["MESSAGES_SEND"] },
    });
    try {
      await assert.rejects(
        listConversations(actors.admin, { limit: 20, mode: "all" }),
        rejectsWith("FORBIDDEN"),
      );
    } finally {
      await prisma.adminAccess.update({
        where: { userId: actors.admin.userId },
        data: { permissions: ["MESSAGES_SEND", "MESSAGES_VIEW"] },
      });
    }
  });
});
