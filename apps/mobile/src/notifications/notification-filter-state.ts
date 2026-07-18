import type { MobileNotificationInbox, MobileNotificationItem } from "../types/notifications";

export type MobileNotificationInboxFilter = "all" | "archived" | "important" | "read" | "unread";

export function notificationMatchesFilter(
  item: Pick<MobileNotificationItem, "archived" | "priority" | "read">,
  filter: MobileNotificationInboxFilter,
) {
  if (filter === "archived") return item.archived;
  if (item.archived) return false;
  if (filter === "important") return item.priority === "IMPORTANT";
  if (filter === "read") return item.read;
  if (filter === "unread") return !item.read;
  return true;
}

export function reconcileNotificationState(
  inbox: MobileNotificationInbox,
  filter: MobileNotificationInboxFilter,
  notificationId: string,
  result: { archived: boolean; readState: "READ" | "UNREAD" | null; version: number },
) {
  const previous = inbox.data.find((item) => item.id === notificationId);
  if (!previous) return inbox;
  const updated = {
    ...previous,
    archived: result.archived,
    read: result.readState === null ? previous.read : result.readState === "READ",
    stateVersion: result.version,
  };
  const wasUnread = !previous.archived && !previous.read;
  const isUnread = !updated.archived && !updated.read;
  return {
    ...inbox,
    data: inbox.data
      .map((item) => item.id === notificationId ? updated : item)
      .filter((item) => notificationMatchesFilter(item, filter)),
    pageInfo: { hasNextPage: false, nextCursor: null },
    unreadCount: Math.max(0, inbox.unreadCount + Number(isUnread) - Number(wasUnread)),
  };
}

export function reconcileMarkAllRead(
  inbox: MobileNotificationInbox,
  filter: MobileNotificationInboxFilter,
  result: { readThrough: string; version: number },
) {
  const readThrough = new Date(result.readThrough).getTime();
  const data = inbox.data.map((item) =>
    new Date(item.createdAt).getTime() <= readThrough ? { ...item, read: true } : item
  );
  const unreadCount = data.filter((item) => !item.archived && !item.read).length;
  return {
    ...inbox,
    data: data.filter((item) => notificationMatchesFilter(item, filter)),
    inboxVersion: result.version,
    pageInfo: { hasNextPage: false, nextCursor: null },
    unreadCount,
  };
}

export function mergeNotificationPage(
  current: MobileNotificationInbox,
  next: MobileNotificationInbox,
  filter: MobileNotificationInboxFilter,
) {
  const byId = new Map(current.data.map((item) => [item.id, item]));
  for (const item of next.data) byId.set(item.id, item);
  return {
    ...next,
    data: Array.from(byId.values()).filter((item) => notificationMatchesFilter(item, filter)),
  };
}
