import type { NextRequest } from "next/server";

import {
  handleCustomerMessageRequest,
  messageData,
} from "@/features/messages/api/http";
import { assertNoMessageQuery } from "@/features/messages/api/validation";
import { getUnreadMessageCount } from "@/features/messages/services/query-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerMessageRequest(request, "unread-count", async (actor) => {
    assertNoMessageQuery(request.nextUrl.searchParams);
    return messageData(await getUnreadMessageCount(actor));
  });
}
