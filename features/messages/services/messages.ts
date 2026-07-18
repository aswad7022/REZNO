import "server-only";

import { resolveMessageActor } from "@/features/messages/services/web-actor";
import {
  getUnreadMessageCount as getCanonicalUnreadMessageCount,
  listConversations,
} from "@/features/messages/services/query-service";
import type { DashboardRole } from "@/types/dashboard";

export interface DashboardMessagePreview {
  id: string;
  href: string;
  title: string;
  preview: string;
  createdAt: Date;
  unread: boolean;
}

export async function getDashboardMessagePreviews(
  role: DashboardRole | "admin",
  limit = 5,
): Promise<DashboardMessagePreview[]> {
  const actor = await resolveMessageActor(role);
  const result = await listConversations(actor, {
    limit: Math.max(1, Math.min(limit, 50)),
    mode: "all",
  });
  return result.data.map((conversation) => ({
    createdAt: new Date(conversation.lastMessageAt),
    href: conversation.destination,
    id: conversation.id,
    preview: conversation.lastMessagePreview,
    title: conversation.title,
    unread: conversation.unread,
  }));
}

export async function getUnreadMessageCount(
  role: DashboardRole | "admin",
) {
  const actor = await resolveMessageActor(role);
  return (await getCanonicalUnreadMessageCount(actor)).count;
}
