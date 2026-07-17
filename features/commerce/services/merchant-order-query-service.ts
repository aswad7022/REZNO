import "server-only";

import type {
  CommerceOrderStatus,
  FulfillmentMethod,
  FulfillmentStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";

import { commerceError } from "@/features/commerce/domain/errors";
import {
  decodeMerchantCursor,
  encodeMerchantCursor,
  merchantCursorFingerprint,
} from "@/features/commerce/domain/merchant-cursor";
import { merchantOrderDateRangeError } from "@/features/commerce/domain/merchant-order-filter-policy";
import {
  merchantOrderDetail,
  merchantOrderSummary,
} from "@/features/commerce/domain/order-dto";
import {
  resolveMerchantCommerceContext,
  type MerchantActorReference,
} from "@/features/commerce/services/authorization";
import { prisma } from "@/lib/db/prisma";

export type MerchantOrderQueue =
  | "pending"
  | "active"
  | "ready"
  | "delivery_issues"
  | "completed"
  | "closed"
  | "all";

export interface MerchantOrderQuery {
  actionableOnly?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  cursor?: string;
  fulfillmentMethod?: FulfillmentMethod;
  fulfillmentStatus?: FulfillmentStatus;
  limit: number;
  overduePending?: boolean;
  paymentStatus?: PaymentStatus;
  query?: string;
  queue: MerchantOrderQueue;
  status?: CommerceOrderStatus;
  updatedFrom?: Date;
  updatedTo?: Date;
}

export interface MerchantOrderQueryOptions {
  clock?: () => Date;
}

const summarySelect = {
  _count: { select: { items: true } },
  createdAt: true,
  currency: true,
  customerNameSnapshot: true,
  fulfillmentMethod: true,
  fulfillmentStatus: true,
  grandTotal: true,
  id: true,
  orderNumber: true,
  paymentMethod: true,
  paymentStatus: true,
  reservationExpiresAt: true,
  status: true,
  storeNameSnapshot: true,
  updatedAt: true,
} satisfies Prisma.OrderSelect;

export async function listMerchantOrders(
  reference: MerchantActorReference,
  query: MerchantOrderQuery,
  options: MerchantOrderQueryOptions = {},
) {
  const actor = await resolveMerchantCommerceContext(reference, "ORDER_VIEW");
  if (!actor.storeId) commerceError("NOT_FOUND", "Merchant Store was not found.");
  validateQuery(query);
  const actorKey = merchantOrderActorKey(actor);
  const filter = merchantCursorFingerprint({
    actionableOnly: query.actionableOnly ?? null,
    createdFrom: query.createdFrom?.toISOString(),
    createdTo: query.createdTo?.toISOString(),
    fulfillmentMethod: query.fulfillmentMethod,
    fulfillmentStatus: query.fulfillmentStatus,
    overduePending: query.overduePending ?? null,
    paymentStatus: query.paymentStatus,
    query: query.query,
    queue: query.queue,
    status: query.status,
    updatedFrom: query.updatedFrom?.toISOString(),
    updatedTo: query.updatedTo?.toISOString(),
  });
  const cursor = query.cursor
    ? decodeMerchantCursor(query.cursor, {
        actor: actorKey,
        filter,
        kind: "orders",
        target: actor.storeId,
      })
    : null;
  const evaluationTime = cursor?.snapshotDate ?? (options.clock ?? systemClock)();
  if (Number.isNaN(evaluationTime.getTime())) {
    commerceError("VALIDATION_ERROR", "Order evaluation time is invalid.");
  }
  const sort = queueSort(query.queue);
  const baseWhere: Prisma.OrderWhereInput = {
    AND: [
      { storeId: actor.storeId },
      queueWhere(query.queue),
      ...(query.actionableOnly ? [{
        OR: [
          { reservationExpiresAt: { gt: evaluationTime }, status: "PENDING" as const },
          { status: "CONFIRMED" as const },
        ],
      }] : []),
      ...(query.createdFrom || query.createdTo
        ? [{ createdAt: { gte: query.createdFrom, lte: query.createdTo } }]
        : []),
      ...(query.fulfillmentMethod ? [{ fulfillmentMethod: query.fulfillmentMethod }] : []),
      ...(query.fulfillmentStatus ? [{ fulfillmentStatus: query.fulfillmentStatus }] : []),
      ...(query.paymentStatus ? [{ paymentStatus: query.paymentStatus }] : []),
      ...(query.overduePending
        ? [{ reservationExpiresAt: { lte: evaluationTime }, status: "PENDING" as const }]
        : []),
      ...(query.query ? [{ orderNumber: { contains: query.query, mode: "insensitive" as const } }] : []),
      ...(query.status ? [{ status: query.status }] : []),
      ...(query.updatedFrom || query.updatedTo
        ? [{ updatedAt: { gte: query.updatedFrom, lte: query.updatedTo } }]
        : []),
    ],
  };
  const snapshotWhere: Prisma.OrderWhereInput = sort.field === "updatedAt"
    ? { updatedAt: { lte: evaluationTime } }
    : { createdAt: { lte: evaluationTime } };
  const cursorWhere = cursor
    ? orderCursorWhere(sort.field, sort.direction, cursor.sortDate, cursor.id)
    : {};
  const rows = await prisma.order.findMany({
    where: { AND: [baseWhere, snapshotWhere, cursorWhere] },
    orderBy: orderBy(sort.field, sort.direction),
    select: summarySelect,
    take: query.limit + 1,
  });
  const dataRows = rows.slice(0, query.limit);
  const quantities = dataRows.length
    ? await prisma.orderItem.groupBy({
        by: ["orderId"],
        where: { orderId: { in: dataRows.map((order) => order.id) } },
        _sum: { quantity: true },
      })
    : [];
  const totalByOrder = new Map(quantities.map((row) => [row.orderId, row._sum.quantity ?? 0]));
  const canMutate = actor.permissions.includes("ORDER_MANAGE") || actor.permissions.includes("ORDER_CANCEL");
  const last = dataRows.at(-1);
  const nextCursor = rows.length > query.limit && last
    ? encodeMerchantCursor({
        actor: actorKey,
        filter,
        id: last.id,
        kind: "orders",
        snapshot: evaluationTime.toISOString(),
        sortValue: last[sort.field].toISOString(),
        target: actor.storeId,
      })
    : null;
  const statusCounts = await prisma.order.groupBy({
    by: ["status"],
    where: { storeId: actor.storeId },
    _count: { _all: true },
  });
  return {
    actor,
    counts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])),
    data: dataRows.map((order) => merchantOrderSummary(
      order,
      totalByOrder.get(order.id) ?? 0,
      canMutate,
      evaluationTime,
    )),
    pageInfo: { hasNextPage: Boolean(nextCursor), nextCursor },
    snapshot: evaluationTime.toISOString(),
  };
}

export async function getMerchantOrderDetail(
  reference: MerchantActorReference,
  orderId: string,
  historyCursor?: string,
) {
  const actor = await resolveMerchantCommerceContext(reference, "ORDER_VIEW");
  if (!actor.storeId) commerceError("NOT_FOUND", "Merchant Store was not found.");
  const actorKey = merchantOrderActorKey(actor);
  const filter = merchantCursorFingerprint({ orderId, scope: "merchant-order-history" });
  const cursor = historyCursor
    ? decodeMerchantCursor(historyCursor, {
        actor: actorKey,
        filter,
        kind: "order_history",
        target: orderId,
      })
    : null;
  const snapshot = cursor?.snapshotDate ?? new Date();
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId: actor.storeId },
    include: {
      address: true,
      items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      payment: true,
      reservations: { orderBy: [{ productVariantId: "asc" }, { id: "asc" }] },
    },
  });
  if (!order) commerceError("NOT_FOUND", "Order was not found.");
  const historyRows = await prisma.orderStatusHistory.findMany({
    where: {
      orderId,
      createdAt: { lte: snapshot },
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.sortDate } },
              { createdAt: cursor.sortDate, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 51,
  });
  const history = historyRows.slice(0, 50);
  const last = history.at(-1);
  const nextCursor = historyRows.length > 50 && last
    ? encodeMerchantCursor({
        actor: actorKey,
        filter,
        id: last.id,
        kind: "order_history",
        snapshot: snapshot.toISOString(),
        sortValue: last.createdAt.toISOString(),
        target: orderId,
      })
    : null;
  return {
    actor,
    order: merchantOrderDetail({
      ...order,
      history,
      historyHasNextPage: Boolean(nextCursor),
      historyNextCursor: nextCursor,
    }, {
      canCancel: actor.permissions.includes("ORDER_CANCEL"),
      canManage: actor.permissions.includes("ORDER_MANAGE"),
    }),
  };
}

function merchantOrderActorKey(actor: {
  membershipId: string;
  organizationId: string;
  personId: string;
  storeId: string | null;
}) {
  return `${actor.personId}:${actor.membershipId}:${actor.organizationId}:${actor.storeId ?? "none"}`;
}

function queueWhere(queue: MerchantOrderQueue): Prisma.OrderWhereInput {
  if (queue === "pending") return { status: "PENDING" };
  if (queue === "active") return { status: "CONFIRMED" };
  if (queue === "ready") return { status: "CONFIRMED", fulfillmentStatus: "READY_FOR_PICKUP" };
  if (queue === "delivery_issues") return { status: "CONFIRMED", fulfillmentStatus: "DELIVERY_FAILED" };
  if (queue === "completed") return { status: "COMPLETED" };
  if (queue === "closed") return { status: { in: ["CANCELLED", "REJECTED", "EXPIRED"] } };
  return {};
}

function queueSort(queue: MerchantOrderQueue): {
  direction: "asc" | "desc";
  field: "createdAt" | "reservationExpiresAt" | "updatedAt";
} {
  if (queue === "pending") return { direction: "asc", field: "reservationExpiresAt" };
  if (queue === "active" || queue === "ready" || queue === "delivery_issues") {
    return { direction: "desc", field: "updatedAt" };
  }
  return { direction: "desc", field: "createdAt" };
}

function orderBy(
  field: "createdAt" | "reservationExpiresAt" | "updatedAt",
  direction: "asc" | "desc",
) {
  return [{ [field]: direction }, { id: direction }] as Prisma.OrderOrderByWithRelationInput[];
}

function orderCursorWhere(
  field: "createdAt" | "reservationExpiresAt" | "updatedAt",
  direction: "asc" | "desc",
  date: Date,
  id: string,
): Prisma.OrderWhereInput {
  return {
    OR: direction === "asc"
      ? [{ [field]: { gt: date } }, { [field]: date, id: { gt: id } }]
      : [{ [field]: { lt: date } }, { [field]: date, id: { lt: id } }],
  };
}

function validateQuery(query: MerchantOrderQuery) {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50) {
    commerceError("VALIDATION_ERROR", "Order page limit must be between 1 and 50.");
  }
  if (query.query && (query.query.length > 80 || !/^[\p{L}\p{N}-]+$/u.test(query.query))) {
    commerceError("VALIDATION_ERROR", "Order search is invalid.");
  }
  for (const date of [query.createdFrom, query.createdTo, query.updatedFrom, query.updatedTo]) {
    if (date && Number.isNaN(date.getTime())) commerceError("VALIDATION_ERROR", "Order date filter is invalid.");
  }
  for (const [from, to] of [[query.createdFrom, query.createdTo], [query.updatedFrom, query.updatedTo]]) {
    const error = merchantOrderDateRangeError(from, to);
    if (error === "ORDER") commerceError("VALIDATION_ERROR", "Order date range is invalid.");
    if (error === "TOO_WIDE") commerceError("VALIDATION_ERROR", "Order date range cannot exceed 366 days.");
  }
}

function systemClock() {
  return new Date();
}
