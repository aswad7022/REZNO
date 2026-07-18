import type { NotificationCategory, Prisma } from "@prisma/client";

import {
  sanitizeLocalizationVariables,
  sanitizeLocalizedNotificationContent,
  type CanonicalNotificationEvent,
  validateCanonicalNotificationEvent,
} from "@/features/notifications/domain/contracts";

export async function createCanonicalNotifications(
  transaction: Prisma.TransactionClient,
  events: readonly CanonicalNotificationEvent[],
  options: { producedAt?: Date } = {},
) {
  if (events.length === 0) return { created: 0, suppressed: 0 };
  events.forEach(validateCanonicalNotificationEvent);
  const directPersonIds = Array.from(new Set(events
    .filter((event) => event.audience === "USER" && !event.mandatory)
    .map((event) => event.recipientPersonId!)
  ));
  const preferences = directPersonIds.length
    ? await transaction.notificationPreference.findMany({
        where: { personId: { in: directPersonIds } },
      })
    : [];
  const preferenceByPerson = new Map(preferences.map((item) => [item.personId, item]));
  const deliverable = events.filter((event) =>
    event.mandatory ||
    event.audience !== "USER" ||
    categoryEnabled(preferenceByPerson.get(event.recipientPersonId!), event.category)
  );
  if (deliverable.length === 0) return { created: 0, suppressed: events.length };
  const producedAt = options.producedAt ?? new Date();
  const result = await transaction.notification.createMany({
    data: deliverable.map((event) => {
      const occurredAt = event.occurredAt ?? producedAt;
      return {
        audience: event.audience,
        body: event.body.trim(),
        bodyKey: event.bodyKey,
        businessId: event.businessId,
        category: event.category,
        createdAt: occurredAt,
        createdByUserId: event.createdByUserId,
        destinationKind: event.destinationKind,
        destinationTargetId: event.destinationTargetId,
        eventKey: event.eventKey,
        eventType: event.eventType,
        expiresAt: event.expiresAt,
        localizationVariables: sanitizeLocalizationVariables(event.localizationVariables),
        localizedContent: sanitizeLocalizedNotificationContent(event.localizedContent),
        mandatory: event.mandatory,
        metadata: compatibilityMetadata(event),
        occurredAt,
        priority: event.priority,
        recipientPersonId: event.recipientPersonId,
        sourceId: event.sourceId,
        sourceType: event.sourceType,
        title: event.title.trim(),
        titleKey: event.titleKey,
      };
    }),
    skipDuplicates: true,
  });
  return { created: result.count, suppressed: events.length - deliverable.length };
}

function categoryEnabled(
  preference: {
    adminAnnouncementsEnabled: boolean;
    bookingsEnabled: boolean;
    commerceEnabled: boolean;
    messagesEnabled: boolean;
    restaurantEnabled: boolean;
  } | undefined,
  category: NotificationCategory,
) {
  if (category === "ACCOUNT") return true;
  if (!preference) return true;
  if (category === "BOOKINGS") return preference.bookingsEnabled;
  if (category === "RESTAURANT") return preference.restaurantEnabled;
  if (category === "COMMERCE") return preference.commerceEnabled;
  if (category === "MESSAGES") return preference.messagesEnabled;
  return preference.adminAnnouncementsEnabled;
}

function compatibilityMetadata(event: CanonicalNotificationEvent) {
  const destination = legacyDestination(event);
  return {
    schemaVersion: 1,
    eventType: event.eventType,
    destinationKind: event.destinationKind,
    ...(destination ? { destination } : {}),
    ...(event.destinationKind === "CUSTOMER_COMMERCE_ORDER" && event.destinationTargetId
      ? { orderDestination: `/customer/orders/${event.destinationTargetId}` }
      : {}),
    ...(event.sourceType === "COMMERCE_ORDER" && event.sourceId ? { orderId: event.sourceId } : {}),
    ...(event.sourceType === "BOOKING" || event.sourceType === "RESTAURANT_RESERVATION"
      ? { bookingId: event.sourceId }
      : {}),
    ...(event.sourceType === "STORE" ? { storeId: event.sourceId } : {}),
    ...(event.titleKey ? { titleKey: event.titleKey } : {}),
    ...(event.bodyKey ? { bodyKey: event.bodyKey } : {}),
    ...(event.localizationVariables ? { variables: sanitizeLocalizationVariables(event.localizationVariables) } : {}),
  };
}

function legacyDestination(event: CanonicalNotificationEvent) {
  switch (event.destinationKind) {
    case "CUSTOMER_COMMERCE_ORDER": return "/customer/notifications";
    case "BUSINESS_COMMERCE_ORDER": return event.destinationTargetId ? `/business/commerce/orders/${event.destinationTargetId}` : "/business/notifications";
    case "BUSINESS_NOTIFICATIONS": return "/business/notifications";
    case "ADMIN_COMMERCE_STORES": return "/admin/commerce/stores";
    default: return undefined;
  }
}
