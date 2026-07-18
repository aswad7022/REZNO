import type { NextRequest } from "next/server";

import { handleCustomerNotificationRequest, notificationData } from "@/features/notifications/api/http";
import { countUnreadNotifications } from "@/features/notifications/services/inbox-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerNotificationRequest(request, "count", async (context) =>
    notificationData({ unreadCount: await countUnreadNotifications(context) }), 120);
}
