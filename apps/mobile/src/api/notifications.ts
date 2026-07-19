import { mobileApiRequest } from "./client";
import type {
  MobileNotificationInbox,
  MobileNotificationItem,
  MobileOutboundPreferences,
  MobileNotificationPreferences,
} from "../types/notifications";

type Data<T> = { data: T };

export const notificationApi = {
  count: async () => (await authenticated<{ unreadCount: number }>("/api/mobile/notifications/count")).unreadCount,
  list: (input: { cursor?: string; filter?: "all" | "archived" | "important" | "read" | "unread" } = {}) =>
    authenticated<MobileNotificationInbox>("/api/mobile/notifications", "GET", undefined, undefined, {
      cursor: input.cursor, filter: input.filter ?? "all", limit: 20,
    }),
  markAllRead: (expectedVersion: number, snapshot: string, idempotencyKey: string) =>
    authenticated<{ readThrough: string; replayed: boolean; version: number }>(
      "/api/mobile/notifications/mark-all-read", "POST", { expectedVersion, snapshot }, { "Idempotency-Key": idempotencyKey },
    ),
  preferences: () => authenticated<MobileNotificationPreferences>("/api/mobile/notifications/preferences"),
  outboundPreferences: () => authenticated<MobileOutboundPreferences>("/api/mobile/notifications/outbound-preferences"),
  updateOutboundPreferences: (
    preferences: MobileOutboundPreferences["categories"],
    expectedVersion: number,
    idempotencyKey: string,
  ) => authenticated<MobileOutboundPreferences>(
    "/api/mobile/notifications/outbound-preferences",
    "PATCH",
    { categories: preferences, expectedVersion },
    { "Idempotency-Key": idempotencyKey },
  ),
  updatePreferences: (
    preferences: Omit<MobileNotificationPreferences, "version">,
    expectedVersion: number,
    idempotencyKey: string,
  ) => authenticated<MobileNotificationPreferences & { replayed: boolean }>(
    "/api/mobile/notifications/preferences", "PATCH", { ...preferences, expectedVersion }, { "Idempotency-Key": idempotencyKey },
  ),
  updateState: (
    notification: Pick<MobileNotificationItem, "id" | "stateVersion">,
    action: "ARCHIVE" | "MARK_READ" | "MARK_UNREAD" | "RESTORE",
    idempotencyKey: string,
  ) => authenticated<{ archived: boolean; readState: "READ" | "UNREAD" | null; replayed: boolean; version: number }>(
    `/api/mobile/notifications/${notification.id}/state`, "PATCH",
    { action, expectedVersion: notification.stateVersion }, { "Idempotency-Key": idempotencyKey },
  ),
};

async function authenticated<T>(
  path: string,
  method: "GET" | "PATCH" | "POST" = "GET",
  body?: unknown,
  headers?: Record<string, string>,
  params?: Record<string, boolean | string | number | undefined>,
) {
  return (await mobileApiRequest<Data<T>>(path, { authenticated: true, body, headers, method, params })).data;
}
