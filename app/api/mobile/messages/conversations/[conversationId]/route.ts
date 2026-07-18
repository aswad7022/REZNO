import type { NextRequest } from "next/server";

import {
  handleCustomerMessageRequest,
  messageData,
} from "@/features/messages/api/http";
import {
  assertNoMessageQuery,
  parseConversationId,
} from "@/features/messages/api/validation";
import { getConversationDetail } from "@/features/messages/services/query-service";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleCustomerMessageRequest(
    request,
    "conversation-detail",
    async (actor) => {
      assertNoMessageQuery(request.nextUrl.searchParams);
      const { conversationId } = await params;
      return messageData(
        await getConversationDetail(actor, parseConversationId(conversationId)),
      );
    },
  );
}
