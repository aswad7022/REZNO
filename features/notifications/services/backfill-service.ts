import "server-only";

import { type BookingStatus, type PrismaClient } from "@prisma/client";

import type { CanonicalNotificationEvent } from "@/features/notifications/domain/contracts";
import { createCanonicalNotifications } from "@/features/notifications/services/producer";

export interface NotificationBackfillOptions {
  batchSize?: number;
  dryRun: boolean;
}

export interface NotificationBackfillReport {
  candidates: { bookingHistory: number; pendingChanges: number; reviewRequests: number };
  created: number;
  domainFingerprintAfter: DomainFingerprint;
  domainFingerprintBefore: DomainFingerprint;
  dryRun: boolean;
  suppressed: number;
}

type DomainFingerprint = {
  bookingChangeRequests: number;
  bookingStatusHistory: number;
  bookings: number;
  reviews: number;
};

export async function backfillNotificationCenter(
  client: PrismaClient,
  options: NotificationBackfillOptions,
): Promise<NotificationBackfillReport> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 250, 1), 1_000);
  const before = await domainFingerprint(client);
  const candidates = {
    bookingHistory: await client.bookingStatusHistory.count(),
    pendingChanges: await client.bookingChangeRequest.count({ where: { status: "PENDING" } }),
    reviewRequests: await client.booking.count({ where: {
      status: "COMPLETED", review: null, customer: { deletedAt: null, isOnboarded: true, status: "ACTIVE" },
    } }),
  };
  let created = 0;
  let suppressed = 0;
  if (!options.dryRun) {
    for (const source of [historyEvents, pendingChangeEvents, reviewRequestEvents] as const) {
      let cursor: string | undefined;
      for (;;) {
        const page = await source(client, batchSize, cursor);
        if (page.events.length === 0) break;
        const result = await client.$transaction((transaction) => createCanonicalNotifications(transaction, page.events), {
          isolationLevel: "ReadCommitted",
        });
        created += result.created;
        suppressed += result.suppressed;
        cursor = page.cursor;
        if (!page.hasMore) break;
      }
    }
  }
  const after = await domainFingerprint(client);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("Notification backfill changed a protected domain ledger.");
  }
  return {
    candidates,
    created,
    domainFingerprintAfter: after,
    domainFingerprintBefore: before,
    dryRun: options.dryRun,
    suppressed,
  };
}

async function historyEvents(client: PrismaClient, take: number, cursor?: string) {
  const rows = await client.bookingStatusHistory.findMany({
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { booking: { select: {
      customerId: true, id: true, organizationId: true, restaurantReservation: { select: { id: true } },
    } } },
    orderBy: { id: "asc" },
    take: take + 1,
  });
  const page = rows.slice(0, take);
  return {
    cursor: page.at(-1)?.id,
    events: page.map((row) => statusHistoryEvent(row)),
    hasMore: rows.length > take,
  };
}

function statusHistoryEvent(row: {
  booking: { customerId: string; id: string; organizationId: string; restaurantReservation: { id: string } | null };
  createdAt: Date;
  id: string;
  toStatus: BookingStatus;
}): CanonicalNotificationEvent {
  const restaurant = Boolean(row.booking.restaurantReservation);
  const copy = statusCopy(row.toStatus, restaurant);
  return {
    audience: "USER",
    body: copy.body,
    bodyKey: `notifications.${restaurant ? "restaurant" : "booking"}.status.${row.toStatus.toLowerCase()}.body`,
    businessId: row.booking.organizationId,
    category: restaurant ? "RESTAURANT" : "BOOKINGS",
    destinationKind: restaurant ? "CUSTOMER_RESTAURANT" : "CUSTOMER_BOOKING",
    destinationTargetId: row.booking.id,
    eventKey: `backfill:booking-history:${row.id}:customer:${row.booking.customerId}`,
    eventType: `${restaurant ? "restaurant" : "booking"}.status.${row.toStatus.toLowerCase()}`,
    mandatory: true,
    occurredAt: row.createdAt,
    priority: row.toStatus === "CANCELLED" || row.toStatus === "NO_SHOW" ? "IMPORTANT" : "NORMAL",
    recipientPersonId: row.booking.customerId,
    sourceId: row.booking.id,
    sourceType: restaurant ? "RESTAURANT_RESERVATION" : "BOOKING",
    title: copy.title,
    titleKey: `notifications.${restaurant ? "restaurant" : "booking"}.status.${row.toStatus.toLowerCase()}.title`,
  };
}

async function pendingChangeEvents(client: PrismaClient, take: number, cursor?: string) {
  const rows = await client.bookingChangeRequest.findMany({
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where: { status: "PENDING" },
    include: { booking: { select: { customerId: true, id: true, organizationId: true } } },
    orderBy: { id: "asc" },
    take: take + 1,
  });
  const page = rows.slice(0, take);
  return {
    cursor: page.at(-1)?.id,
    events: page.map((row): CanonicalNotificationEvent => {
      const customerRequested = row.requestedByPersonId === row.booking.customerId;
      return {
        audience: customerRequested ? "BUSINESS" : "USER",
        body: customerRequested
          ? "A customer requested a booking change. Review the proposed time."
          : "A business proposed a booking change. Open the booking to respond.",
        bodyKey: `notifications.booking.${customerRequested ? "change-requested" : "change-proposed"}.body`,
        businessId: row.booking.organizationId,
        category: "BOOKINGS",
        destinationKind: customerRequested ? "BUSINESS_BOOKING" : "CUSTOMER_BOOKING",
        destinationTargetId: row.booking.id,
        eventKey: `backfill:booking-change:${row.id}:${customerRequested ? "business" : `customer:${row.booking.customerId}`}`,
        eventType: customerRequested ? "booking.change-requested" : "booking.change-proposed",
        mandatory: true,
        occurredAt: row.createdAt,
        priority: "IMPORTANT",
        ...(customerRequested ? {} : { recipientPersonId: row.booking.customerId }),
        sourceId: row.id,
        sourceType: "BOOKING_CHANGE_REQUEST",
        title: customerRequested ? "Booking change requested" : "Booking change proposed",
        titleKey: `notifications.booking.${customerRequested ? "change-requested" : "change-proposed"}.title`,
      };
    }),
    hasMore: rows.length > take,
  };
}

async function reviewRequestEvents(client: PrismaClient, take: number, cursor?: string) {
  const rows = await client.booking.findMany({
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where: { status: "COMPLETED", review: null, customer: { deletedAt: null, isOnboarded: true, status: "ACTIVE" } },
    select: { createdAt: true, customerId: true, id: true, organizationId: true, updatedAt: true },
    orderBy: { id: "asc" },
    take: take + 1,
  });
  const page = rows.slice(0, take);
  return {
    cursor: page.at(-1)?.id,
    events: page.map((booking): CanonicalNotificationEvent => ({
      audience: "USER",
      body: "Your service is complete. Open the booking to share a review.",
      bodyKey: "notifications.booking.review-request.body",
      businessId: booking.organizationId,
      category: "BOOKINGS",
      destinationKind: "CUSTOMER_BOOKING",
      destinationTargetId: booking.id,
      eventKey: `backfill:booking:${booking.id}:review-request:${booking.customerId}`,
      eventType: "booking.review-request",
      mandatory: false,
      occurredAt: booking.updatedAt ?? booking.createdAt,
      priority: "NORMAL",
      recipientPersonId: booking.customerId,
      sourceId: booking.id,
      sourceType: "BOOKING",
      title: "Share your experience",
      titleKey: "notifications.booking.review-request.title",
    })),
    hasMore: rows.length > take,
  };
}

function statusCopy(status: BookingStatus, restaurant: boolean) {
  const subject = restaurant ? "Restaurant reservation" : "Booking";
  if (status === "CANCELLED") return { body: `${subject} was cancelled. Open it for current details.`, title: `${subject} cancelled` };
  if (status === "COMPLETED") return { body: `${subject} was completed.`, title: `${subject} completed` };
  if (status === "NO_SHOW") return { body: `${subject} was recorded as a no-show.`, title: `${subject} status updated` };
  if (status === "CONFIRMED") return { body: `${subject} was confirmed.`, title: `${subject} confirmed` };
  return { body: `${subject} is pending.`, title: `${subject} pending` };
}

async function domainFingerprint(client: PrismaClient): Promise<DomainFingerprint> {
  const [bookings, bookingStatusHistory, bookingChangeRequests, reviews] = await Promise.all([
    client.booking.count(), client.bookingStatusHistory.count(), client.bookingChangeRequest.count(), client.review.count(),
  ]);
  return { bookingChangeRequests, bookingStatusHistory, bookings, reviews };
}
