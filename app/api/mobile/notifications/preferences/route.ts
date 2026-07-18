import type { NextRequest } from "next/server";

import { handleCustomerNotificationRequest, notificationData } from "@/features/notifications/api/http";
import { parseNotificationPreferencesRequest } from "@/features/notifications/api/validation";
import { getNotificationPreferences, updateNotificationPreferences } from "@/features/notifications/services/interaction-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerNotificationRequest(request, "preferences.read", async (context) =>
    notificationData(await getNotificationPreferences(context.personId)), 60);
}

export function PATCH(request: NextRequest) {
  return handleCustomerNotificationRequest(request, "preferences.update", async (context) =>
    notificationData(await updateNotificationPreferences(context, await parseNotificationPreferencesRequest(request))), 10);
}
