import "server-only";

import { Prisma } from "@prisma/client";

import type { MessageActor } from "@/features/messages/domain/contracts";
import { messageActorScopeKey } from "@/features/messages/domain/contracts";
import { messageError } from "@/features/messages/domain/errors";
import { canAccessConversation } from "@/features/messages/policies/conversation-access";
import { assertMessageActorCurrent } from "@/features/messages/services/actor";
import { messagingSerializable } from "@/features/messages/services/transaction";

export async function markConversationReadForActor({
  actor,
  conversationId,
  throughMessageId,
}: {
  actor: MessageActor;
  conversationId: string;
  throughMessageId?: string;
}): Promise<{
  authorized: boolean;
  boundary: { createdAt: string; id: string } | null;
  updatedCount: number;
  version: number;
}> {
  return messagingSerializable(async (transaction) => {
    const currentActor = await assertMessageActorCurrent(transaction, actor);
    const conversation = await transaction.conversation.findUnique({
      where: { id: conversationId },
      select: {
        adminUserId: true,
        businessId: true,
        customerId: true,
        type: true,
        booking: {
          select: { customerId: true, memberId: true, organizationId: true },
        },
      },
    });
    if (!conversation || !canAccessConversation(conversation, currentActor)) {
      return {
        authorized: false,
        boundary: null,
        updatedCount: 0,
        version: 0,
      };
    }
    const boundary = throughMessageId
      ? await transaction.message.findFirst({
          where: { conversationId, id: throughMessageId },
          select: { createdAt: true, id: true },
        })
      : await transaction.message.findFirst({
          where: { conversationId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { createdAt: true, id: true },
        });
    if (throughMessageId && !boundary) {
      messageError("NOT_FOUND", "Read boundary Message was not found.");
    }
    if (!boundary) {
      return {
        authorized: true,
        boundary: null,
        updatedCount: 0,
        version: 0,
      };
    }
    const scopeKey = messageActorScopeKey(currentActor);
    const current = await transaction.conversationReadState.findUnique({
      where: { conversationId_scopeKey: { conversationId, scopeKey } },
    });
    if (
      current?.lastReadMessageCreatedAt &&
      current.lastReadMessageId &&
      tupleAtOrAfter(
        current.lastReadMessageCreatedAt,
        current.lastReadMessageId,
        boundary.createdAt,
        boundary.id,
      )
    ) {
      return {
        authorized: true,
        boundary: {
          createdAt: current.lastReadMessageCreatedAt.toISOString(),
          id: current.lastReadMessageId,
        },
        updatedCount: 0,
        version: current.version,
      };
    }
    const owner = currentActor.kind === "admin"
      ? { adminUserId: currentActor.userId, personId: null }
      : { adminUserId: null, personId: currentActor.personId };
    const state = current
      ? await transaction.conversationReadState.update({
          where: { id: current.id },
          data: {
            lastReadMessageCreatedAt: boundary.createdAt,
            lastReadMessageId: boundary.id,
            version: { increment: 1 },
          },
        })
      : await transaction.conversationReadState.create({
          data: {
            ...owner,
            conversationId,
            lastReadMessageCreatedAt: boundary.createdAt,
            lastReadMessageId: boundary.id,
            scopeKey,
          },
        });
    const updatedCount = await reconcileMessageNotifications(
      transaction,
      currentActor,
      conversationId,
      boundary,
    );
    return {
      authorized: true,
      boundary: { createdAt: boundary.createdAt.toISOString(), id: boundary.id },
      updatedCount,
      version: state.version,
    };
  });
}

async function reconcileMessageNotifications(
  transaction: Prisma.TransactionClient,
  actor: MessageActor,
  conversationId: string,
  boundary: { createdAt: Date; id: string },
) {
  const messages = await transaction.message.findMany({
    where: {
      conversationId,
      senderUserId: { not: actor.userId },
      OR: [
        { createdAt: { lt: boundary.createdAt } },
        { createdAt: boundary.createdAt, id: { lte: boundary.id } },
      ],
    },
    select: { id: true },
  });
  if (messages.length === 0) return 0;
  const keys = messages.flatMap((message) => [
    `message:${message.id}:recipient:${actor.personId}`,
    `message:${message.id}:customer:${actor.personId}`,
    `message:${message.id}:business:${actor.personId}`,
    `message:${message.id}:admin:${actor.personId}`,
  ]);
  const notifications = await transaction.notification.findMany({
    where: {
      category: "MESSAGES",
      eventKey: { in: keys },
      eventType: "message.received",
      recipientPersonId: actor.personId,
      sourceId: conversationId,
      sourceType: "CONVERSATION",
    },
    select: { id: true },
  });
  if (notifications.length === 0) return 0;
  const notificationIds = notifications.map((notification) => notification.id);
  const existing = await transaction.notificationRecipientState.findMany({
    where: { notificationId: { in: notificationIds }, personId: actor.personId },
    select: { notificationId: true },
  });
  const existingIds = new Set(existing.map((state) => state.notificationId));
  const changedAt = new Date();
  await transaction.notificationRecipientState.updateMany({
    where: {
      notificationId: { in: notificationIds },
      personId: actor.personId,
    },
    data: {
      readState: "READ",
      readStateChangedAt: changedAt,
      version: { increment: 1 },
    },
  });
  await transaction.notificationRecipientState.createMany({
    data: notificationIds
      .filter((id) => !existingIds.has(id))
      .map((notificationId) => ({
        notificationId,
        personId: actor.personId,
        readState: "READ" as const,
        readStateChangedAt: changedAt,
      })),
    skipDuplicates: true,
  });
  return notificationIds.length;
}

function tupleAtOrAfter(
  leftDate: Date,
  leftId: string,
  rightDate: Date,
  rightId: string,
) {
  return leftDate > rightDate ||
    (leftDate.getTime() === rightDate.getTime() && leftId >= rightId);
}
