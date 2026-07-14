import type { Prisma } from "@prisma/client";

import {
  canAccessConversation,
  type ConversationActor,
} from "@/features/messages/policies/conversation-access";
import { prisma } from "@/lib/db/prisma";

type ConversationReadDatabase = Prisma.TransactionClient | typeof prisma;

export async function markConversationReadForActor({
  actor,
  conversationId,
  currentUserId,
  database = prisma,
}: {
  actor: ConversationActor;
  conversationId: string;
  currentUserId: string;
  database?: ConversationReadDatabase;
}): Promise<{ authorized: boolean; updatedCount: number }> {
  const conversation = await database.conversation.findUnique({
    where: { id: conversationId },
    select: {
      adminUserId: true,
      businessId: true,
      customerId: true,
      type: true,
    },
  });
  if (!conversation || !canAccessConversation(conversation, actor)) {
    return { authorized: false, updatedCount: 0 };
  }

  const result = await database.message.updateMany({
    where: {
      conversationId,
      senderUserId: { not: currentUserId },
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return { authorized: true, updatedCount: result.count };
}
