export type MobileConversationSource = {
  bookingId: string;
  kind: "BOOKING" | "RESTAURANT_RESERVATION";
  label: string;
  startsAt: string;
};

export type MobileConversationSummary = {
  destination: string;
  id: string;
  kind: "CONVERSATION_SUMMARY";
  lastMessageAt: string;
  lastMessagePreview: string;
  participantLabel: string;
  source: MobileConversationSource | null;
  title: string;
  type: "ADMIN_USER" | "CUSTOMER_BUSINESS";
  unread: boolean;
  unreadCount: number;
};

export type MobileConversationPage = {
  data: MobileConversationSummary[];
  nextCursor: string | null;
  snapshot: string;
};

export type MobileConversationDetail = {
  canReply: boolean;
  id: string;
  kind: "CONVERSATION_DETAIL";
  participantLabel: string;
  source: MobileConversationSource | null;
  title: string;
  type: "ADMIN_USER" | "CUSTOMER_BUSINESS";
};

export type MobileMessage = {
  body: string;
  createdAt: string;
  id: string;
  kind: "MESSAGE_SUMMARY";
  own: boolean;
  sender: "ADMIN" | "BUSINESS" | "CUSTOMER" | "YOU";
};

export type MobileMessagePage = {
  data: MobileMessage[];
  kind: "MESSAGE_PAGE";
  nextCursor: string | null;
  snapshot: string;
};

export type MobileMessageSendResult = {
  kind: "MESSAGE_SEND_RESULT";
  message: MobileMessage;
  replayed: boolean;
};

export type MobileMessageUnreadCount = {
  count: number;
  display: string;
  kind: "MESSAGE_UNREAD_COUNT";
};
