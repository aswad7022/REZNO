import { decodePublicCursor, encodePublicCursor, publicQueryFingerprint } from "@/features/commerce/public/cursor";
import { commerceError } from "@/features/commerce/domain/errors";
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
  const rows = await prisma.notification.findMany({
    where: {
      audience: "USER",
      recipientPersonId: customer.personId,
      ...(cursorDate
        ? {
            OR: [
              { createdAt: { lt: cursorDate } },
              { createdAt: cursorDate, id: { lt: cursor!.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      body: true,
      createdAt: true,
      id: true,
      metadata: true,
      priority: true,
      title: true,
    },
    take: query.limit + 1,
  });
  const visible = rows.slice(0, query.limit);
  const candidateOrderIds = visible
    .map((row) => orderIdFromMetadata(row.metadata))
    .filter((value): value is string => Boolean(value));
  const ownedOrders = candidateOrderIds.length
    ? await prisma.order.findMany({
        where: { customerId: customer.personId, id: { in: candidateOrderIds } },
        select: { id: true },
      })
    : [];
  const ownedOrderIds = new Set(ownedOrders.map((order) => order.id));
  const last = visible.at(-1);

  return {
    data: visible.map((row) => {
      const orderId = orderIdFromMetadata(row.metadata);
      return {
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        orderId: orderId && ownedOrderIds.has(orderId) ? orderId : null,
        priority: row.priority,
        title: row.title,
      };
    }),
    pageInfo: {
      hasNextPage: rows.length > query.limit,
      nextCursor: rows.length > query.limit && last
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

function orderIdFromMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as NotificationMetadata;
  if (metadata.destination !== "/customer/notifications") return null;
  if (typeof metadata.eventType !== "string" || !metadata.eventType.startsWith("order.")) return null;
  if (
    typeof metadata.orderId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(metadata.orderId)
  ) return null;
  return metadata.orderId.toLowerCase();
}

function strictDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    commerceError("INVALID_CURSOR", "Notification cursor date is invalid.");
  }
  return date;
}
