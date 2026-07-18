import type { ConversationType } from "@prisma/client";

export interface ConversationSourceDto {
  bookingId: string;
  kind: "BOOKING" | "RESTAURANT_RESERVATION";
  label: string;
  startsAt: string;
}

export interface ConversationSummaryDto {
  kind: "CONVERSATION_SUMMARY";
  id: string;
  type: ConversationType;
  title: string;
  participantLabel: string;
  source: ConversationSourceDto | null;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  unread: boolean;
  destination: string;
}

export interface ConversationDetailDto {
  kind: "CONVERSATION_DETAIL";
  id: string;
  type: ConversationType;
  title: string;
  participantLabel: string;
  source: ConversationSourceDto | null;
  canReply: boolean;
}

export interface MessageSummaryDto {
  kind: "MESSAGE_SUMMARY";
  id: string;
  body: string;
  createdAt: string;
  own: boolean;
  sender: "ADMIN" | "BUSINESS" | "CUSTOMER" | "YOU";
}

export interface MessagePageDto {
  kind: "MESSAGE_PAGE";
  data: MessageSummaryDto[];
  nextCursor: string | null;
  snapshot: string;
}

export interface MessageSendResultDto {
  kind: "MESSAGE_SEND_RESULT";
  message: MessageSummaryDto;
  replayed: boolean;
}

export interface MessageUnreadCountDto {
  kind: "MESSAGE_UNREAD_COUNT";
  count: number;
  display: string;
}
