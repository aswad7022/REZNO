import type {
  MobileConversationDetail,
  MobileConversationPage,
  MobileMessagePage,
  MobileMessageSendResult,
  MobileMessageUnreadCount,
} from "../types/messages";
import { mobileApiRequest } from "./client";

type Data<T> = { data: T };

export const messageApi = {
  conversation: (conversationId: string) =>
    authenticated<MobileConversationDetail>(
      `/api/mobile/messages/conversations/${conversationId}`,
    ),
  conversations: (input: {
    cursor?: string;
    mode?: "admin" | "all" | "booking" | "unread";
  } = {}) =>
    authenticated<MobileConversationPage>(
      "/api/mobile/messages/conversations",
      "GET",
      undefined,
      undefined,
      { cursor: input.cursor, limit: 20, mode: input.mode ?? "all" },
    ),
  markRead: (conversationId: string, throughMessageId?: string) =>
    authenticated<{
      authorized: true;
      boundary: { createdAt: string; id: string } | null;
      updatedCount: number;
      version: number;
    }>(
      `/api/mobile/messages/conversations/${conversationId}/read`,
      "PATCH",
      { throughMessageId },
    ),
  messages: (conversationId: string, cursor?: string) =>
    authenticated<MobileMessagePage>(
      `/api/mobile/messages/conversations/${conversationId}/messages`,
      "GET",
      undefined,
      undefined,
      { cursor, limit: 30 },
    ),
  send: (
    conversationId: string,
    body: string,
    idempotencyKey: string,
  ) =>
    authenticated<MobileMessageSendResult>(
      `/api/mobile/messages/conversations/${conversationId}/messages`,
      "POST",
      { body },
      { "Idempotency-Key": idempotencyKey },
    ),
  start: (businessId: string, body: string, idempotencyKey: string) =>
    authenticated<MobileMessageSendResult & { conversationId: string }>(
      "/api/mobile/messages/conversations",
      "POST",
      { body, businessId },
      { "Idempotency-Key": idempotencyKey },
    ),
  unreadCount: () =>
    authenticated<MobileMessageUnreadCount>(
      "/api/mobile/messages/unread-count",
    ),
};

async function authenticated<T>(
  path: string,
  method: "GET" | "PATCH" | "POST" = "GET",
  body?: unknown,
  headers?: Record<string, string>,
  params?: Record<string, string | number | undefined>,
) {
  return (
    await mobileApiRequest<Data<T>>(path, {
      authenticated: true,
      body,
      headers,
      method,
      params,
    })
  ).data;
}
