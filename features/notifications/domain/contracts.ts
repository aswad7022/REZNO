import { createHash } from "node:crypto";

import type {
  CommercePermission,
  LanguageCode,
  NotificationAudience,
  NotificationCategory,
  NotificationDestinationKind,
  NotificationPriority,
  NotificationSourceType,
  SystemRole,
} from "@prisma/client";

import { notificationError } from "@/features/notifications/domain/errors";

export type NotificationLocale = "AR" | "EN" | "KU";

export interface CanonicalNotificationEvent {
  audience: NotificationAudience;
  body: string;
  bodyKey?: string;
  businessId?: string;
  createdByUserId?: string;
  category: NotificationCategory;
  destinationKind: NotificationDestinationKind;
  destinationTargetId?: string;
  eventKey: string;
  eventType: string;
  expiresAt?: Date;
  localizationVariables?: Record<string, boolean | number | string>;
  mandatory: boolean;
  occurredAt?: Date;
  priority: NotificationPriority;
  recipientPersonId?: string;
  sourceId?: string;
  sourceType: NotificationSourceType;
  title: string;
  titleKey?: string;
}

export type NotificationActorContext = {
  mode: "customer";
  personId: string;
} | {
  effectiveCommercePermissions: readonly CommercePermission[];
  membershipId: string;
  mode: "business";
  organizationId: string;
  personId: string;
  restaurant: boolean;
  roleId: string;
  systemRole: SystemRole;
};

export const notificationCategories = [
  "BOOKINGS",
  "RESTAURANT",
  "COMMERCE",
  "MESSAGES",
  "ACCOUNT",
  "ADMIN_ANNOUNCEMENT",
] as const satisfies readonly NotificationCategory[];

export const notificationDestinationKinds = [
  "NOTIFICATIONS",
  "CUSTOMER_BOOKING",
  "CUSTOMER_RESTAURANT",
  "CUSTOMER_COMMERCE_ORDER",
  "CUSTOMER_MESSAGES",
  "CUSTOMER_ACCOUNT",
  "BUSINESS_CALENDAR",
  "BUSINESS_BOOKING",
  "BUSINESS_RESTAURANT",
  "BUSINESS_COMMERCE_ORDER",
  "BUSINESS_MESSAGES",
  "BUSINESS_NOTIFICATIONS",
  "ADMIN_COMMERCE_STORES",
] as const satisfies readonly NotificationDestinationKind[];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9_]+)+$/;
const FORBIDDEN_VARIABLE_KEY = /(address|authorization|cookie|customer.*name|database|email|exception|instruction|phone|secret|session|token)/i;

export function notificationScopeKey(context: NotificationActorContext) {
  if (context.mode === "customer") return `customer:${context.personId}`;
  return `business:${context.organizationId}:${context.membershipId}:${context.roleId}:${context.systemRole}`;
}

export function notificationEventKey(input: {
  audience: NotificationAudience;
  businessId?: string;
  eventType: string;
  recipientPersonId?: string;
  sourceId?: string;
  sourceType: NotificationSourceType;
}) {
  const binding = [
    "notification-v1",
    input.sourceType,
    input.sourceId ?? "none",
    input.eventType,
    input.audience,
    input.businessId ?? "none",
    input.recipientPersonId ?? "none",
  ].join(":");
  return `notification:${createHash("sha256").update(binding).digest("hex")}`;
}

export function notificationRequestHash(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function validateCanonicalNotificationEvent(event: CanonicalNotificationEvent) {
  if (!EVENT_PATTERN.test(event.eventType) || event.eventType.length > 100) {
    notificationError("VALIDATION_ERROR", "Notification event type is invalid.");
  }
  if (!event.eventKey || event.eventKey.length > 200) {
    notificationError("VALIDATION_ERROR", "Notification event key is invalid.");
  }
  if (!event.title.trim() || event.title.length > 160 || !event.body.trim() || event.body.length > 2_000) {
    notificationError("VALIDATION_ERROR", "Notification fallback copy is invalid.");
  }
  if (event.titleKey && event.titleKey.length > 160) notificationError("VALIDATION_ERROR", "Notification title key is invalid.");
  if (event.bodyKey && event.bodyKey.length > 160) notificationError("VALIDATION_ERROR", "Notification body key is invalid.");
  if (event.sourceId && !UUID_PATTERN.test(event.sourceId)) notificationError("VALIDATION_ERROR", "Notification source ID is invalid.");
  if (event.destinationTargetId && !UUID_PATTERN.test(event.destinationTargetId)) notificationError("VALIDATION_ERROR", "Notification destination target is invalid.");
  if (event.audience === "USER" && !event.recipientPersonId) notificationError("VALIDATION_ERROR", "Direct Notification requires a Person.");
  if (event.audience !== "USER" && event.recipientPersonId) notificationError("VALIDATION_ERROR", "Only direct Notifications may bind a Person.");
  if (event.audience === "BUSINESS" && !event.businessId) notificationError("VALIDATION_ERROR", "Business Notification requires an Organization.");
  if (event.businessId && !UUID_PATTERN.test(event.businessId)) notificationError("VALIDATION_ERROR", "Notification Organization is invalid.");
  if (event.createdByUserId && !UUID_PATTERN.test(event.createdByUserId)) notificationError("VALIDATION_ERROR", "Notification creator is invalid.");
  sanitizeLocalizationVariables(event.localizationVariables);
}

export function sanitizeLocalizationVariables(
  value: Record<string, boolean | number | string> | undefined,
) {
  if (!value) return undefined;
  const entries = Object.entries(value);
  if (entries.length > 12) notificationError("VALIDATION_ERROR", "Notification variables are too large.");
  return Object.fromEntries(entries.map(([key, child]) => {
    if (!/^[a-z][a-zA-Z0-9]{0,39}$/.test(key) || FORBIDDEN_VARIABLE_KEY.test(key)) {
      notificationError("VALIDATION_ERROR", "Notification variables contain a forbidden field.");
    }
    if (typeof child === "string" && child.length > 160) notificationError("VALIDATION_ERROR", "Notification variable is too long.");
    if (typeof child === "number" && !Number.isFinite(child)) notificationError("VALIDATION_ERROR", "Notification variable is invalid.");
    return [key, child];
  }));
}

export function localeFromLanguage(language: LanguageCode | null | undefined): NotificationLocale {
  if (language === "AR") return "AR";
  if (language === "KU") return "KU";
  return "EN";
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
