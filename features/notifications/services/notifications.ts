import "server-only";

import { resolveNotificationActor } from "@/features/notifications/services/context";
import { listNotificationInbox } from "@/features/notifications/services/inbox-service";
import type { DashboardNotification } from "@/features/notifications/types";
import type { DashboardRole } from "@/types/dashboard";

export async function getDashboardNotifications(
  role: DashboardRole,
  take = 8,
): Promise<DashboardNotification[]> {
  return (await getDashboardNotificationSummary(role, take)).items;
}

export async function getDashboardNotificationSummary(
  role: DashboardRole,
  take = 8,
): Promise<{ items: DashboardNotification[]; unreadCount: number }> {
  const mode = role === "business" ? "business" : "customer";
  const context = await resolveNotificationActor(mode);
  const result = await listNotificationInbox(context, {
    filter: "unread",
    limit: Math.max(1, Math.min(take, 50)),
  });
  return { items: result.data.map((item) => ({
    body: item.body,
    createdAt: item.createdAt,
    customerName: "",
    href: item.destination.href,
    id: item.id,
    kind: "ADMIN_ANNOUNCEMENT" as const,
    priority: item.priority,
    serviceName: item.title,
    title: item.title,
  })), unreadCount: result.unreadCount };
}
