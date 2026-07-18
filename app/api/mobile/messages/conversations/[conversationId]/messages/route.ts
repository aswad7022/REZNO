import type { NextRequest } from "next/server";

import {
  handleCustomerMessageRequest,
  messageData,
} from "@/features/messages/api/http";
import {
  assertMobileMutationRequest,
  parseConversationId,
  parseMessageHistoryQuery,
  parseSendMessageRequest,
} from "@/features/messages/api/validation";
import { sendMessage } from "@/features/messages/services/delivery-service";
import { listMessages } from "@/features/messages/services/query-service";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleCustomerMessageRequest(
    request,
    "message-history",
    async (actor) => {
      const { conversationId } = await params;
      return messageData(
        await listMessages(
          actor,
          parseConversationId(conversationId),
          parseMessageHistoryQuery(request.nextUrl.searchParams),
        ),
      );
    },
  );
}

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handleCustomerMessageRequest(
    request,
    "message-send",
    async (actor) => {
      assertMobileMutationRequest(request);
      const { conversationId } = await params;
      const input = await parseSendMessageRequest(request);
      const result = await sendMessage(actor, {
        ...input,
        conversationId: parseConversationId(conversationId),
      });
      return messageData(result, result.replayed ? 200 : 201);
    },
    20,
  );
}
