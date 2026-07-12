import type {
  CommerceOrderStatus,
  FulfillmentMethod,
  FulfillmentStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";

import { decodePublicCursor, encodePublicCursor, publicQueryFingerprint } from "@/features/commerce/public/cursor";
import { commerceError } from "@/features/commerce/domain/errors";
import { requireActiveCommerceCustomer } from "@/features/commerce/services/authorization";
import { prisma } from "@/lib/db/prisma";

export interface CustomerOrderQuery {
  cursor?: string;
  fulfillmentMethod?: FulfillmentMethod;
  fulfillmentStatus?: FulfillmentStatus;
  limit: number;
  paymentStatus?: PaymentStatus;
  sort: "newest" | "oldest";
  status?: CommerceOrderStatus;
  storeSlug?: string;
}

export const customerOrderInclude = {
  address: true,
  history: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  items: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  payment: true,
} satisfies Prisma.OrderInclude;

export type CustomerOrderRecord = Prisma.OrderGetPayload<{ include: typeof customerOrderInclude }>;

export async function listCustomerOrders(customerId: string, query: CustomerOrderQuery) {
  const customer = await requireActiveCommerceCustomer(customerId);
  const sort = query.sort;
  const fingerprint = customerOrderFingerprint(customer.personId, query);
  const cursor = query.cursor
    ? decodePublicCursor(query.cursor, { fingerprint, sort: `orders_${sort}` })
    : null;
  const cursorDate = cursor ? strictCursorDate(cursor.sortValue) : null;
  const direction = sort === "newest" ? "desc" as const : "asc" as const;
  const where: Prisma.OrderWhereInput = {
    customerId: customer.personId,
    fulfillmentMethod: query.fulfillmentMethod,
    fulfillmentStatus: query.fulfillmentStatus,
    paymentStatus: query.paymentStatus,
    status: query.status,
    storeSlugSnapshot: query.storeSlug,
    ...(cursorDate
      ? {
          OR: sort === "newest"
            ? [
                { createdAt: { lt: cursorDate } },
                { createdAt: cursorDate, id: { lt: cursor!.id } },
              ]
            : [
                { createdAt: { gt: cursorDate } },
                { createdAt: cursorDate, id: { gt: cursor!.id } },
              ],
        }
      : {}),
  };
  const records = await prisma.order.findMany({
    where,
    include: customerOrderInclude,
    orderBy: [{ createdAt: direction }, { id: direction }],
    take: query.limit + 1,
  });
  const data = records.slice(0, query.limit);
  const last = data.at(-1);
  return {
    data,
    pageInfo: {
      hasNextPage: records.length > query.limit,
      nextCursor: records.length > query.limit && last
        ? encodePublicCursor({
            fingerprint,
            id: last.id,
            sort: `orders_${sort}`,
            sortValue: last.createdAt.toISOString(),
          })
        : null,
    },
  };
}

export async function getCustomerOrderDetail(customerId: string, orderId: string) {
  await requireActiveCommerceCustomer(customerId);
  const order = await prisma.order.findFirst({
    where: { customerId, id: orderId },
    include: customerOrderInclude,
  });
  if (!order) commerceError("NOT_FOUND", "Order was not found.");
  return order;
}

export function customerOrderFingerprint(customerId: string, query: CustomerOrderQuery) {
  return publicQueryFingerprint({
    customerId,
    fulfillmentMethod: query.fulfillmentMethod,
    fulfillmentStatus: query.fulfillmentStatus,
    paymentStatus: query.paymentStatus,
    scope: "customer-orders",
    sort: query.sort,
    status: query.status,
    storeSlug: query.storeSlug,
  });
}

function strictCursorDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    commerceError("INVALID_CURSOR", "Order cursor date is invalid.");
  }
  return date;
}
