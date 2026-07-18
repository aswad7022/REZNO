import "server-only";

import { Prisma } from "@prisma/client";

import {
  canAccessOrganizationConversations,
  canOperateBookings,
} from "@/features/identity/policies/authorization";
import type {
  AdminMessageActor,
  CustomerMessageActor,
  MessageActor,
} from "@/features/messages/domain/contracts";
import {
  isUuid,
  messageActorScopeKey,
  messageRequestHash,
} from "@/features/messages/domain/contracts";
import { normalizeMessageBody } from "@/features/messages/domain/body";
import type { MessageSendResultDto } from "@/features/messages/domain/dto";
import { messageError } from "@/features/messages/domain/errors";
import {
  adminBusinessConversationIdentity,
  adminUserConversationIdentity,
  bookingConversationIdentity,
  generalConversationIdentity,
} from "@/features/messages/domain/identity";
import { canAccessConversation } from "@/features/messages/policies/conversation-access";
import { assertMessageActorCurrent } from "@/features/messages/services/actor";
import { toMessageSummary } from "@/features/messages/services/query-service";
import { messagingSerializable } from "@/features/messages/services/transaction";
import { createCanonicalNotifications } from "@/features/notifications/services/producer";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";

type MessageRateLimitConsumer = typeof consumeRateLimit;

let messageRateLimitConsumer: MessageRateLimitConsumer = consumeRateLimit;

export function setMessageRateLimitConsumerForTests(
  consumer: MessageRateLimitConsumer | undefined,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Messaging rate-limit test hooks are unavailable in production.",
    );
  }
  messageRateLimitConsumer = consumer ?? consumeRateLimit;
}

export interface SendMessageInput {
  body: unknown;
  conversationId: string;
  idempotencyKey: string;
  sourceAction?: "reply";
}

export async function sendMessage(
  actor: MessageActor,
  input: SendMessageInput,
): Promise<MessageSendResultDto> {
  assertIds(input.conversationId, input.idempotencyKey);
  const body = normalizeMessageBody(input.body);
  const sourceAction = input.sourceAction ?? "reply";
  const existing = await findReplayCandidate(
    actor.userId,
    input.idempotencyKey,
  );
  if (!existing) enforceSendRate(actor.userId);
  return messagingSerializable(async (transaction) => {
    const currentActor = await assertMessageActorCurrent(
      transaction,
      actor,
      actor.kind === "admin" ? "MESSAGES_SEND" : "MESSAGES_VIEW",
    );
    await lockConversation(transaction, input.conversationId);
    const conversation = await getDeliveryConversation(
      transaction,
      input.conversationId,
    );
    if (!conversation || !canAccessConversation(conversation, currentActor)) {
      messageError("NOT_FOUND", "Conversation was not found in this scope.");
    }
    return deliverMessage(transaction, currentActor, conversation, {
      body,
      idempotencyKey: input.idempotencyKey,
      sourceAction,
    });
  });
}

export async function openBookingConversationForActor(
  actor: Exclude<MessageActor, AdminMessageActor>,
  bookingId: string,
) {
  if (!isUuid(bookingId)) {
    messageError("VALIDATION_ERROR", "Booking ID is invalid.");
  }
  return messagingSerializable(async (transaction) => {
    const currentActor = await assertMessageActorCurrent(transaction, actor);
    if (currentActor.kind === "admin") {
      messageError("FORBIDDEN", "A Booking participant is required.");
    }
    const booking = await transaction.booking.findFirst({
      where: {
        id: bookingId,
        organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      },
      select: {
        customerId: true,
        id: true,
        memberId: true,
        organizationId: true,
      },
    });
    if (!booking || !canOpenBooking(currentActor, booking)) {
      messageError("NOT_FOUND", "Booking Conversation was not found.");
    }
    const identityKey = bookingConversationIdentity(booking.id);
    const existing = await transaction.conversation.findUnique({
      where: { identityKey },
      select: { id: true },
    });
    if (existing) return existing;
    return transaction.conversation.create({
      data: {
        bookingId: booking.id,
        businessId: booking.organizationId,
        customerId: booking.customerId,
        identityKey,
        type: "CUSTOMER_BUSINESS",
      },
      select: { id: true },
    });
  });
}

export async function startCustomerBusinessConversation(
  actor: CustomerMessageActor,
  input: { body: unknown; businessId: string; idempotencyKey: string },
): Promise<MessageSendResultDto & { conversationId: string }> {
  assertIds(input.businessId, input.idempotencyKey);
  const body = normalizeMessageBody(input.body);
  const existing = await findReplayCandidate(
    actor.userId,
    input.idempotencyKey,
  );
  if (!existing) enforceStartRate(actor.userId);
  return messagingSerializable(async (transaction) => {
    const currentActor = await assertMessageActorCurrent(transaction, actor);
    if (currentActor.kind !== "customer") {
      messageError("FORBIDDEN", "A Customer identity is required.");
    }
    const replay = await findTransactionalReplayCandidate(
      transaction,
      currentActor.userId,
      input.idempotencyKey,
    );
    if (replay) {
      assertExactCustomerStartReplay(replay, currentActor, {
        body,
        businessId: input.businessId,
      });
      await assertCustomerBusinessTarget(
        transaction,
        currentActor,
        input.businessId,
      );
      await lockConversation(transaction, replay.conversation.id);
      const result = await deliverMessage(
        transaction,
        currentActor,
        replay.conversation,
        {
          body,
          idempotencyKey: input.idempotencyKey,
          sourceAction: "customer-start",
        },
      );
      return { ...result, conversationId: replay.conversation.id };
    }
    const business = await assertCustomerBusinessTarget(
      transaction,
      currentActor,
      input.businessId,
    );
    const identityKey = generalConversationIdentity(
      business.id,
      currentActor.personId,
    );
    const conversation =
      (await transaction.conversation.findUnique({
        where: { identityKey },
        select: deliveryConversationSelect,
      })) ??
      (await transaction.conversation.create({
        data: {
          businessId: business.id,
          customerId: currentActor.personId,
          identityKey,
          type: "CUSTOMER_BUSINESS",
        },
        select: deliveryConversationSelect,
      }));
    await lockConversation(transaction, conversation.id);
    const result = await deliverMessage(
      transaction,
      currentActor,
      conversation,
      {
        body,
        idempotencyKey: input.idempotencyKey,
        sourceAction: "customer-start",
      },
    );
    return { ...result, conversationId: conversation.id };
  });
}

export async function startAdminConversation(
  actor: AdminMessageActor,
  input: {
    body: unknown;
    idempotencyKey: string;
    targetId: string;
    targetType: "BUSINESS" | "USER";
  },
): Promise<MessageSendResultDto & { conversationId: string }> {
  assertIds(input.targetId, input.idempotencyKey);
  const body = normalizeMessageBody(input.body);
  const existing = await findReplayCandidate(
    actor.userId,
    input.idempotencyKey,
  );
  if (!existing) enforceAdminStartRate(actor.userId);
  return messagingSerializable(async (transaction) => {
    const currentActor = await assertMessageActorCurrent(
      transaction,
      actor,
      "MESSAGES_SEND",
    );
    if (currentActor.kind !== "admin") {
      messageError("FORBIDDEN", "An Admin identity is required.");
    }
    const sourceAction =
      input.targetType === "USER" ? "admin-user-start" : "admin-business-start";
    const replay = await findTransactionalReplayCandidate(
      transaction,
      currentActor.userId,
      input.idempotencyKey,
    );
    if (replay) {
      assertExactAdminStartReplay(replay, currentActor, {
        body,
        sourceAction,
        targetId: input.targetId,
        targetType: input.targetType,
      });
      await assertAdminTarget(transaction, input.targetId, input.targetType);
      await lockConversation(transaction, replay.conversation.id);
      const result = await deliverMessage(
        transaction,
        currentActor,
        replay.conversation,
        {
          body,
          idempotencyKey: input.idempotencyKey,
          sourceAction,
        },
      );
      return { ...result, conversationId: replay.conversation.id };
    }
    const target = await assertAdminTarget(
      transaction,
      input.targetId,
      input.targetType,
    );
    const identityKey =
      input.targetType === "USER"
        ? adminUserConversationIdentity(currentActor.userId, target.id)
        : adminBusinessConversationIdentity(currentActor.userId, target.id);
    const conversation =
      (await transaction.conversation.findUnique({
        where: { identityKey },
        select: deliveryConversationSelect,
      })) ??
      (await transaction.conversation.create({
        data: {
          adminUserId: currentActor.userId,
          businessId: input.targetType === "BUSINESS" ? target.id : null,
          customerId: input.targetType === "USER" ? target.id : null,
          identityKey,
          type: input.targetType === "USER" ? "ADMIN_USER" : "ADMIN_BUSINESS",
        },
        select: deliveryConversationSelect,
      }));
    await lockConversation(transaction, conversation.id);
    const result = await deliverMessage(
      transaction,
      currentActor,
      conversation,
      {
        body,
        idempotencyKey: input.idempotencyKey,
        sourceAction,
      },
    );
    return { ...result, conversationId: conversation.id };
  });
}

const deliveryConversationSelect = {
  adminUserId: true,
  bookingId: true,
  businessId: true,
  customerId: true,
  id: true,
  identityKey: true,
  type: true,
  booking: {
    select: { customerId: true, memberId: true, organizationId: true },
  },
  customer: { select: { authUserId: true } },
} satisfies Prisma.ConversationSelect;

type DeliveryConversation = Prisma.ConversationGetPayload<{
  select: typeof deliveryConversationSelect;
}>;

type TransactionalReplayCandidate = {
  body: string;
  conversation: DeliveryConversation;
  conversationId: string;
  createdAt: Date;
  id: string;
  requestHash: string | null;
  senderUserId: string;
  sourceAction: string | null;
};

async function getDeliveryConversation(
  transaction: Prisma.TransactionClient,
  conversationId: string,
) {
  return transaction.conversation.findUnique({
    where: { id: conversationId },
    select: deliveryConversationSelect,
  });
}

async function deliverMessage(
  transaction: Prisma.TransactionClient,
  actor: MessageActor,
  conversation: DeliveryConversation,
  input: { body: string; idempotencyKey: string; sourceAction: string },
): Promise<MessageSendResultDto> {
  const requestHash = messageRequestHash({
    action: input.sourceAction,
    actorScope: messageActorScopeKey(actor),
    body: input.body,
    conversationId: conversation.id,
    senderPersonId: actor.personId,
    senderUserId: actor.userId,
  });
  const replay = await transaction.message.findUnique({
    where: {
      senderUserId_idempotencyKey: {
        idempotencyKey: input.idempotencyKey,
        senderUserId: actor.userId,
      },
    },
    select: {
      body: true,
      conversationId: true,
      createdAt: true,
      id: true,
      requestHash: true,
      senderUserId: true,
      sourceAction: true,
    },
  });
  if (replay) {
    if (
      replay.requestHash !== requestHash ||
      replay.conversationId !== conversation.id ||
      replay.sourceAction !== input.sourceAction
    ) {
      messageError(
        "IDEMPOTENCY_CONFLICT",
        "Message idempotency key was used for different input.",
      );
    }
    return {
      kind: "MESSAGE_SEND_RESULT",
      message: toMessageSummary(replay, actor, conversation),
      replayed: true,
    };
  }
  const message = await transaction.message.create({
    data: {
      body: input.body,
      conversationId: conversation.id,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      senderUserId: actor.userId,
      sourceAction: input.sourceAction,
    },
    select: { body: true, createdAt: true, id: true, senderUserId: true },
  });
  await transaction.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.createdAt },
  });
  const recipients = await messageRecipients(transaction, conversation, actor);
  await createCanonicalNotifications(
    transaction,
    recipients.map((recipient) => ({
      audience: "USER" as const,
      body: "A new message is waiting. Open the conversation to read it.",
      bodyKey: "notifications.message.received.body",
      ...(conversation.businessId
        ? { businessId: conversation.businessId }
        : {}),
      category: "MESSAGES" as const,
      destinationKind: recipient.destination,
      destinationTargetId: conversation.id,
      eventKey: `message:${message.id}:recipient:${recipient.personId}`,
      eventType: "message.received",
      mandatory: false,
      occurredAt: message.createdAt,
      priority: "NORMAL" as const,
      recipientPersonId: recipient.personId,
      sourceId: conversation.id,
      sourceType: "CONVERSATION" as const,
      title: "New message",
      titleKey: "notifications.message.received.title",
    })),
    { producedAt: message.createdAt },
  );
  if (actor.kind === "admin") {
    await transaction.adminAuditLog.create({
      data: {
        action: "admin.message.send",
        adminUserId: actor.userId,
        idempotencyKey: input.idempotencyKey,
        metadata: {
          conversationId: conversation.id,
          messageId: message.id,
          targetId: conversation.customerId ?? conversation.businessId,
          targetType: conversation.type,
        },
        requestHash,
        result: { conversationId: conversation.id, messageId: message.id },
        resultVersion: message.createdAt,
        targetId: conversation.id,
        targetType: conversation.type,
      },
    });
  }
  return {
    kind: "MESSAGE_SEND_RESULT",
    message: toMessageSummary(message, actor, conversation),
    replayed: false,
  };
}

async function messageRecipients(
  transaction: Prisma.TransactionClient,
  conversation: DeliveryConversation,
  actor: MessageActor,
) {
  if (conversation.type === "CUSTOMER_BUSINESS") {
    if (actor.kind === "customer") {
      return businessRecipients(transaction, conversation, actor.personId);
    }
    return directPersonRecipient(
      conversation.customerId,
      actor,
      "CUSTOMER_MESSAGES",
    );
  }
  if (conversation.type === "ADMIN_USER") {
    if (actor.kind === "admin") {
      return directPersonRecipient(
        conversation.customerId,
        actor,
        "CUSTOMER_MESSAGES",
      );
    }
    return adminRecipient(transaction, conversation, actor.personId);
  }
  if (actor.kind === "admin") {
    return businessRecipients(transaction, conversation, actor.personId);
  }
  return adminRecipient(transaction, conversation, actor.personId);
}

async function businessRecipients(
  transaction: Prisma.TransactionClient,
  conversation: DeliveryConversation,
  senderPersonId: string,
) {
  if (!conversation.businessId) return [];
  const memberships = await transaction.organizationMember.findMany({
    where: {
      deletedAt: null,
      organizationId: conversation.businessId,
      status: "ACTIVE",
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      person: { deletedAt: null, isOnboarded: true, status: "ACTIVE" },
      role: { organizationId: conversation.businessId },
    },
    select: {
      id: true,
      personId: true,
      role: { select: { systemRole: true } },
    },
  });
  return memberships.flatMap((membership) => {
    if (membership.personId === senderPersonId) return [];
    const systemRole = membership.role.systemRole;
    const allowed =
      canAccessOrganizationConversations(systemRole) ||
      (conversation.type === "CUSTOMER_BUSINESS" &&
        Boolean(conversation.booking) &&
        ((systemRole === "RECEPTIONIST" && canOperateBookings(systemRole)) ||
          (systemRole === "STAFF" &&
            conversation.booking?.memberId === membership.id)));
    return allowed
      ? [
          {
            destination: "BUSINESS_MESSAGES" as const,
            personId: membership.personId,
          },
        ]
      : [];
  });
}

function directPersonRecipient(
  personId: string | null,
  actor: MessageActor,
  destination: "CUSTOMER_MESSAGES",
) {
  return personId && personId !== actor.personId
    ? [{ destination, personId }]
    : [];
}

async function adminRecipient(
  transaction: Prisma.TransactionClient,
  conversation: DeliveryConversation,
  senderPersonId: string,
) {
  if (!conversation.adminUserId) return [];
  const person = await transaction.person.findFirst({
    where: {
      authUserId: conversation.adminUserId,
      deletedAt: null,
      isOnboarded: true,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return person && person.id !== senderPersonId
    ? [{ destination: "NOTIFICATIONS" as const, personId: person.id }]
    : [];
}

function canOpenBooking(
  actor: Exclude<MessageActor, AdminMessageActor>,
  booking: {
    customerId: string;
    memberId: string | null;
    organizationId: string;
  },
) {
  if (actor.kind === "customer") return booking.customerId === actor.personId;
  if (booking.organizationId !== actor.organizationId) return false;
  if (canAccessOrganizationConversations(actor.systemRole)) return true;
  if (actor.systemRole === "RECEPTIONIST") {
    return canOperateBookings(actor.systemRole);
  }
  return (
    actor.systemRole === "STAFF" && booking.memberId === actor.membershipId
  );
}

async function lockConversation(
  transaction: Prisma.TransactionClient,
  conversationId: string,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Conversation" WHERE "id" = ${conversationId}::uuid FOR UPDATE`,
  );
}

async function findReplayCandidate(userId: string, idempotencyKey: string) {
  const { prisma } = await import("@/lib/db/prisma");
  return prisma.message.findUnique({
    where: {
      senderUserId_idempotencyKey: { idempotencyKey, senderUserId: userId },
    },
    select: { id: true },
  });
}

async function findTransactionalReplayCandidate(
  transaction: Prisma.TransactionClient,
  userId: string,
  idempotencyKey: string,
): Promise<TransactionalReplayCandidate | null> {
  return transaction.message.findUnique({
    where: {
      senderUserId_idempotencyKey: { idempotencyKey, senderUserId: userId },
    },
    select: {
      body: true,
      conversation: { select: deliveryConversationSelect },
      conversationId: true,
      createdAt: true,
      id: true,
      requestHash: true,
      senderUserId: true,
      sourceAction: true,
    },
  });
}

function assertExactCustomerStartReplay(
  replay: TransactionalReplayCandidate,
  actor: CustomerMessageActor,
  input: { body: string; businessId: string },
) {
  const conversation = replay.conversation;
  const exactIdentity = generalConversationIdentity(
    input.businessId,
    actor.personId,
  );
  if (
    replay.sourceAction !== "customer-start" ||
    conversation.adminUserId !== null ||
    conversation.bookingId !== null ||
    conversation.businessId !== input.businessId ||
    conversation.customerId !== actor.personId ||
    conversation.identityKey !== exactIdentity ||
    conversation.type !== "CUSTOMER_BUSINESS" ||
    replay.requestHash !==
      messageRequestHash({
        action: "customer-start",
        actorScope: messageActorScopeKey(actor),
        body: input.body,
        conversationId: conversation.id,
        senderPersonId: actor.personId,
        senderUserId: actor.userId,
      })
  ) {
    replayConflict();
  }
}

function assertExactAdminStartReplay(
  replay: TransactionalReplayCandidate,
  actor: AdminMessageActor,
  input: {
    body: string;
    sourceAction: "admin-business-start" | "admin-user-start";
    targetId: string;
    targetType: "BUSINESS" | "USER";
  },
) {
  const conversation = replay.conversation;
  const expectedType =
    input.targetType === "USER" ? "ADMIN_USER" : "ADMIN_BUSINESS";
  const exactIdentity =
    input.targetType === "USER"
      ? adminUserConversationIdentity(actor.userId, input.targetId)
      : adminBusinessConversationIdentity(actor.userId, input.targetId);
  if (
    replay.sourceAction !== input.sourceAction ||
    conversation.adminUserId !== actor.userId ||
    conversation.bookingId !== null ||
    conversation.businessId !==
      (input.targetType === "BUSINESS" ? input.targetId : null) ||
    conversation.customerId !==
      (input.targetType === "USER" ? input.targetId : null) ||
    conversation.identityKey !== exactIdentity ||
    conversation.type !== expectedType ||
    replay.requestHash !==
      messageRequestHash({
        action: input.sourceAction,
        actorScope: messageActorScopeKey(actor),
        body: input.body,
        conversationId: conversation.id,
        senderPersonId: actor.personId,
        senderUserId: actor.userId,
      })
  ) {
    replayConflict();
  }
}

async function assertCustomerBusinessTarget(
  transaction: Prisma.TransactionClient,
  actor: CustomerMessageActor,
  businessId: string,
) {
  const business = await transaction.organization.findFirst({
    where: {
      bookings: { some: { customerId: actor.personId } },
      deletedAt: null,
      id: businessId,
      isActive: true,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!business) {
    messageError("NOT_FOUND", "Business is not available for messaging.");
  }
  return business;
}

async function assertAdminTarget(
  transaction: Prisma.TransactionClient,
  targetId: string,
  targetType: "BUSINESS" | "USER",
) {
  const target =
    targetType === "USER"
      ? await transaction.person.findFirst({
          where: {
            deletedAt: null,
            id: targetId,
            isOnboarded: true,
            status: "ACTIVE",
          },
          select: { id: true },
        })
      : await transaction.organization.findFirst({
          where: {
            deletedAt: null,
            id: targetId,
            isActive: true,
            status: "ACTIVE",
          },
          select: { id: true },
        });
  if (!target) messageError("NOT_FOUND", "Admin Message target was not found.");
  return target;
}

function replayConflict(): never {
  messageError(
    "IDEMPOTENCY_CONFLICT",
    "Message idempotency key was used for different input.",
  );
}

function assertIds(targetId: string, idempotencyKey: string) {
  if (!isUuid(targetId) || !isUuid(idempotencyKey)) {
    messageError("VALIDATION_ERROR", "Messaging identifiers are invalid.");
  }
}

function enforceSendRate(userId: string) {
  const result = messageRateLimitConsumer("message:send", userId, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!result.success) {
    messageError("RATE_LIMITED", "Too many Messages were sent.");
  }
}

function enforceStartRate(userId: string) {
  const result = messageRateLimitConsumer("message:start", userId, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!result.success) {
    messageError("RATE_LIMITED", "Too many Conversations were started.");
  }
}

function enforceAdminStartRate(userId: string) {
  const result = messageRateLimitConsumer("message:adminStart", userId, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!result.success) {
    messageError("RATE_LIMITED", "Too many Admin Conversations were started.");
  }
}
