export type MobileNotificationCategory =
  | "ACCOUNT" | "ADMIN_ANNOUNCEMENT" | "BOOKINGS" | "COMMERCE" | "MESSAGES" | "RESTAURANT";

export type MobileNotificationDestinationKind =
  | "CUSTOMER_ACCOUNT" | "CUSTOMER_BOOKING" | "CUSTOMER_COMMERCE_ORDER"
  | "CUSTOMER_MESSAGES" | "CUSTOMER_RESTAURANT" | "NOTIFICATIONS";

export type MobileNotificationItem = {
  archived: boolean;
  body: string;
  bodyKey: string | null;
  category: MobileNotificationCategory;
  createdAt: string;
  destination: { href: string; kind: MobileNotificationDestinationKind; targetId: string | null };
  eventType: string;
  id: string;
  localizationVariables: Record<string, boolean | number | string> | null;
  mandatory: boolean;
  priority: "IMPORTANT" | "NORMAL";
  read: boolean;
  stateVersion: number;
  title: string;
  titleKey: string | null;
};

export type MobileNotificationInbox = {
  data: MobileNotificationItem[];
  inboxVersion: number;
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
  snapshot: string;
  unreadCount: number;
};

export type MobileNotificationPreferences = {
  adminAnnouncementsEnabled: boolean;
  bookingsEnabled: boolean;
  commerceEnabled: boolean;
  messagesEnabled: boolean;
  restaurantEnabled: boolean;
  version: number;
};

export type MobileOutboundChannel = "EMAIL" | "SMS" | "PUSH";

export type MobileOutboundPreferences = {
  kind: "OUTBOUND_PREFERENCES";
  version: number;
  categories: Record<MobileOutboundChannel, MobileNotificationCategory[]>;
  endpoints: Record<MobileOutboundChannel, {
    eligible: boolean;
    reason: "ELIGIBLE" | "INVALID_ENDPOINT" | "MISSING_ENDPOINT" | "UNVERIFIED_ENDPOINT";
  }>;
  mandatoryAccountEnabled: true;
};
