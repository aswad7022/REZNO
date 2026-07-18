"use server";

import { requireAdminPermission } from "@/features/admin/services/admin-auth";
import type { AdminNotificationActionState } from "@/features/notifications/types";

export async function createAdminNotification(
  _state: AdminNotificationActionState,
  _formData: FormData,
): Promise<AdminNotificationActionState> {
  void _state;
  void _formData;
  await requireAdminPermission("NOTIFICATIONS_SEND");
  return {
    status: "error",
    message: "تم إيقاف مسار الإشعارات القديم. استخدم مركز الاتصالات الجديد.",
  };
}
