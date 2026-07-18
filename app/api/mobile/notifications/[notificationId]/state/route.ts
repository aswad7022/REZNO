import type { NextRequest } from "next/server";

import { handleCustomerNotificationRequest, notificationData } from "@/features/notifications/api/http";
import { parseNotificationStateRequest } from "@/features/notifications/api/validation";
import { mutateNotificationState } from "@/features/notifications/services/interaction-service";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ notificationId: string }> }) {
  return handleCustomerNotificationRequest(request, "state", async (context) => {
    const { notificationId } = await params;
    return notificationData(await mutateNotificationState(context, await parseNotificationStateRequest(request, notificationId)));
  }, 30);
}
