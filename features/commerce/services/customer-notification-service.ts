import type { Prisma } from "@prisma/client";

import { decodePublicCursor, encodePublicCursor, publicQueryFingerprint } from "@/features/commerce/public/cursor";
import { commerceError } from "@/features/commerce/domain/errors";
import type { CommerceNotificationEvent } from "@/features/commerce/domain/notification-events";
import { requireActiveCommerceCustomer } from "@/features/commerce/services/authorization";
import { prisma } from "@/lib/db/prisma";

export interface CustomerNotificationQuery {
  cursor?: string;
  limit: number;
}

type NotificationMetadata = {
  destination?: unknown;
  eventType?: unknown;
  orderId?: unknown;
};

const CUSTOMER_NOTIFICATION_EVENTS = [
  "order.created",
  "order.confirmed",
  "order.rejected",
  "order.preparing",
  "order.ready_for_pickup",
  "order.out_for_delivery",
  "order.delivered",
  "order.cancelled",
  "order.expired",
] as const satisfies readonly CommerceNotificationEvent[];

const CUSTOMER_NOTIFICATION_EVENT_SET: ReadonlySet<string> = new Set(CUSTOMER_NOTIFICATION_EVENTS);

const customerNotificationSelect = {
  body: true,
  createdAt: true,
  id: true,
  metadata: true,
  priority: true,
  title: true,
} satisfies Prisma.NotificationSelect;

type CustomerNotificationCandidate = Prisma.NotificationGetPayload<{
  select: typeof customerNotificationSelect;
}>;

type AuthorizedCustomerNotification = CustomerNotificationCandidate & {
  customerMetadata: { eventType: string; orderId: string };
};

export async function listCustomerNotifications(
  customerId: string,
  query: CustomerNotificationQuery,
) {
  const customer = await requireActiveCommerceCustomer(customerId);
  const fingerprint = publicQueryFingerprint({
    customerId: customer.personId,
    scope: "customer-notifications",
  });
  const cursor = query.cursor
    ? decodePublicCursor(query.cursor, { fingerprint, sort: "notifications_newest" })
    : null;
  const cursorDate = cursor ? strictDate(cursor.sortValue) : null;
  const targetSize = query.limit + 1;
  const batchSize = targetSize;
  const authorized: AuthorizedCustomerNotification[] = [];
  let scanCursor = cursorDate && cursor
    ? { createdAt: cursorDate, id: cursor.id }
    : null;

  while (authorized.length < targetSize) {
    const candidates = await prisma.notification.findMany({
      where: customerNotificationCandidateWhere(customer.personId, scanCursor),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: customerNotificationSelect,
      take: batchSize,
    });
    if (candidates.length === 0) break;

    const candidateMetadata = new Map(
      candidates.map((row) => [row.id, customerNotificationMetadata(row.metadata)]),
    );
    const candidateOrderIds = Array.from(new Set(
      candidates
        .map((row) => candidateMetadata.get(row.id)?.orderId)
        .filter((value): value is string => Boolean(value)),
    ));
    const ownedOrders = candidateOrderIds.length
      ? await prisma.order.findMany({
          where: { customerId: customer.personId, id: { in: candidateOrderIds } },
          select: { id: true },
        })
      : [];
    const ownedOrderIds = new Set(ownedOrders.map((order) => order.id));

    for (const candidate of candidates) {
      const metadata = candidateMetadata.get(candidate.id);
      if (!metadata || !ownedOrderIds.has(metadata.orderId)) continue;
      authorized.push({ ...candidate, customerMetadata: metadata });
      if (authorized.length === targetSize) break;
    }

    const lastCandidate = candidates.at(-1)!;
    scanCursor = { createdAt: lastCandidate.createdAt, id: lastCandidate.id };
    if (candidates.length < batchSize) break;
  }

  const page = authorized.slice(0, query.limit);
  const last = page.at(-1);

  return {
    data: page.map((row) => ({
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      orderId: row.customerMetadata.orderId,
      priority: row.priority,
      title: row.title,
    })),
    pageInfo: {
      hasNextPage: authorized.length > query.limit,
      nextCursor: authorized.length > query.limit && last
        ? encodePublicCursor({
            fingerprint,
            id: last.id,
            sort: "notifications_newest",
            sortValue: last.createdAt.toISOString(),
          })
        : null,
    },
  };
}

function customerNotificationCandidateWhere(
  customerId: string,
  cursor: { createdAt: Date; id: string } | null,
): Prisma.NotificationWhereInput {
  return {
    AND: [
      { metadata: { path: ["destination"], equals: "/customer/notifications" } },
      {
        OR: CUSTOMER_NOTIFICATION_EVENTS.map((eventType) => ({
          metadata: { path: ["eventType"], equals: eventType },
        })),
      },
    ],
    audience: "USER",
    eventKey: { not: null, startsWith: "commerce:" },
    recipientPersonId: customerId,
    ...(cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };
}

function customerNotificationMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as NotificationMetadata;
  if (
    typeof metadata.eventType !== "string" ||
    !CUSTOMER_NOTIFICATION_EVENT_SET.has(metadata.eventType)
  ) return null;
  // Destination is centrally generated and is an additional defense, not the event authorization boundary.
  if (metadata.destination !== "/customer/notifications") return null;
  if (
    typeof metadata.orderId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(metadata.orderId)
  ) return null;
  return { eventType: metadata.eventType, orderId: metadata.orderId.toLowerCase() };
}

function strictDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    commerceError("INVALID_CURSOR", "Notification cursor date is invalid.");
  }
  return date;
}
