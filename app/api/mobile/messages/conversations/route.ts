import type { NextRequest } from "next/server";

import {
  handleCustomerMessageRequest,
  messageData,
} from "@/features/messages/api/http";
import {
  assertMobileMutationRequest,
  parseConversationListQuery,
  parseStartConversationRequest,
} from "@/features/messages/api/validation";
import { startCustomerBusinessConversation } from "@/features/messages/services/delivery-service";
import { listConversations } from "@/features/messages/services/query-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerMessageRequest(request, "conversation-list", async (actor) =>
    messageData(
      await listConversations(
        actor,
        parseConversationListQuery(request.nextUrl.searchParams),
      ),
    ),
  );
}

export function POST(request: NextRequest) {
  return handleCustomerMessageRequest(
    request,
    "conversation-start",
    async (actor) => {
      assertMobileMutationRequest(request);
      const result = await startCustomerBusinessConversation(
        actor,
        await parseStartConversationRequest(request),
      );
      return messageData(result, result.replayed ? 200 : 201);
    },
    10,
  );
}
