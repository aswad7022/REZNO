import type { NextRequest } from "next/server";

import {
  handleCustomerMessageRequest,
  messageData,
} from "@/features/messages/api/http";
import {
  assertMobileMutationRequest,
  parseConversationId,
  parseMarkConversationReadRequest,
} from "@/features/messages/api/validation";
import { messageError } from "@/features/messages/domain/errors";
import { markConversationReadForActor } from "@/features/messages/services/conversation-read";

export const dynamic = "force-dynamic";

export function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleCustomerMessageRequest(
    request,
    "conversation-read",
    async (actor) => {
      assertMobileMutationRequest(request);
      const { conversationId } = await params;
      const result = await markConversationReadForActor({
        actor,
        conversationId: parseConversationId(conversationId),
        ...(await parseMarkConversationReadRequest(request)),
      });
      if (!result.authorized) {
        messageError("NOT_FOUND", "Conversation was not found in this scope.");
      }
      return messageData(result);
    },
    60,
  );
}
