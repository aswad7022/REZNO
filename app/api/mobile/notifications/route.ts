import type { NextRequest } from "next/server";

import { handleCustomerNotificationRequest, notificationData } from "@/features/notifications/api/http";
import { parseNotificationInboxQuery } from "@/features/notifications/api/validation";
import { listNotificationInbox } from "@/features/notifications/services/inbox-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerNotificationRequest(request, "list", async (context) =>
    notificationData(await listNotificationInbox(context, parseNotificationInboxQuery(request.nextUrl.searchParams))), 120);
}
