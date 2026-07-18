import type { NextRequest } from "next/server";

import { handleCustomerNotificationRequest, notificationData } from "@/features/notifications/api/http";
import { parseMarkAllRequest } from "@/features/notifications/api/validation";
import { markAllNotificationsRead } from "@/features/notifications/services/interaction-service";

export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return handleCustomerNotificationRequest(request, "mark-all", async (context) =>
    notificationData(await markAllNotificationsRead(context, await parseMarkAllRequest(request))), 10);
}
