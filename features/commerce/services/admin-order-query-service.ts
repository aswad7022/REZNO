import "server-only";

import {
  Prisma,
  type CommerceOrderStatus,
  type FulfillmentMethod,
  type FulfillmentStatus,
  type PaymentStatus,
} from "@prisma/client";
import { z } from "zod";

import {
  adminActorScope,
  adminFilterFingerprint,
  assertDateRange,
  assertAdminPageLimit,
  decodeAdminCursor,
  encodeAdminCursor,
} from "@/features/commerce/domain/admin-commerce";
import { commerceError } from "@/features/commerce/domain/errors";
import { decimalString } from "@/features/commerce/domain/money";
import {
  assertAdminPermission,
  assertCommerceAdminCurrent,
  type CommerceAdminContext,
} from "@/features/commerce/services/authorization";
import { prisma } from "@/lib/db/prisma";
import { safePublicImageUrlOrNull } from "@/lib/security/public-image-url";

const uuid = z.string().uuid();

export interface AdminOrderListQuery {
  createdFrom?: Date;
  createdTo?: Date;
  cursor?: string;
  deliveryFailure?: boolean;
  fulfillmentMethod?: FulfillmentMethod;
  fulfillmentStatus?: FulfillmentStatus;
  limit: number;
  orderStatus?: CommerceOrderStatus;
  organizationId?: string;
  overdue?: boolean;
  paymentStatus?: PaymentStatus;
  query?: string;
  storeId?: string;
  updatedFrom?: Date;
  updatedTo?: Date;
}

const adminOrderListInclude = {
  _count: { select: { items: true } },
  items: { select: { quantity: true } },
  store: { select: { id: true, name: true, organization: { select: { id: true, name: true } } } },
} satisfies Prisma.OrderInclude;

type AdminOrderListRecord = Prisma.OrderGetPayload<{ include: typeof adminOrderListInclude }>;

export async function listAdminOrders(context: CommerceAdminContext, query: AdminOrderListQuery) {
  assertAdminPermission(context, "COMMERCE_ORDERS_VIEW");
  assertAdminPageLimit(query.limit);
  assertDateRange(query.createdFrom, query.createdTo);
  assertDateRange(query.updatedFrom, query.updatedTo);
  for (const [field, value] of [["Organization", query.organizationId], ["Store", query.storeId]] as const) {
    if (value && !uuid.safeParse(value).success) commerceError("VALIDATION_ERROR", `${field} filter must be a UUID.`);
  }
  const search = query.query?.trim().slice(0, 120) || undefined;
  const evaluationTime = new Date();
  const filter = adminFilterFingerprint({
    createdFrom: query.createdFrom?.toISOString(), createdTo: query.createdTo?.toISOString(),
    deliveryFailure: query.deliveryFailure, fulfillmentMethod: query.fulfillmentMethod,
    fulfillmentStatus: query.fulfillmentStatus, orderStatus: query.orderStatus,
    organizationId: query.organizationId, overdue: query.overdue, paymentStatus: query.paymentStatus,
    query: search, storeId: query.storeId, updatedFrom: query.updatedFrom?.toISOString(),
    updatedTo: query.updatedTo?.toISOString(),
  });
  const actor = adminActorScope(context);
  const cursor = query.cursor
    ? decodeAdminCursor(query.cursor, { actor, filter, kind: "orders", permission: "COMMERCE_ORDERS_VIEW", target: "all" })
    : null;
  const snapshot = cursor?.snapshotDate ?? evaluationTime;
  const where: Prisma.OrderWhereInput = {
    createdAt: { gte: query.createdFrom, lte: query.createdTo },
    fulfillmentMethod: query.fulfillmentMethod,
    fulfillmentStatus: query.deliveryFailure === true ? "DELIVERY_FAILED" : query.fulfillmentStatus,
    paymentStatus: query.paymentStatus,
    status: query.orderStatus,
    storeId: query.storeId,
    store: { organizationId: query.organizationId },
    updatedAt: {
      gte: query.updatedFrom,
      lte: query.updatedTo && query.updatedTo.getTime() < snapshot.getTime() ? query.updatedTo : snapshot,
    },
    ...(query.overdue === true ? { reservationExpiresAt: { lte: evaluationTime }, status: "PENDING" } : {}),
    ...(query.overdue === false ? { NOT: { reservationExpiresAt: { lte: evaluationTime }, status: "PENDING" } } : {}),
    ...(search ? { orderNumber: { contains: search, mode: "insensitive" } } : {}),
    ...(cursor ? { AND: [{ OR: [
      { updatedAt: { lt: cursor.sortDate } },
      { updatedAt: cursor.sortDate, id: { lt: cursor.id } },
    ] }] } : {}),
  };
  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_ORDERS_VIEW");
    const rows = await transaction.order.findMany({
      where,
      include: adminOrderListInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const visible = rows.slice(0, query.limit);
    const last = visible.at(-1);
    return {
      data: visible.map((order) => adminOrderSummary(order, evaluationTime)),
      evaluationTime: evaluationTime.toISOString(),
      pageInfo: {
        hasNextPage: rows.length > query.limit,
        nextCursor: rows.length > query.limit && last ? encodeAdminCursor({
          actor, filter, id: last.id, kind: "orders", permission: "COMMERCE_ORDERS_VIEW",
          snapshot: snapshot.toISOString(), sortValue: last.updatedAt.toISOString(), target: "all",
        }) : null,
      },
    };
  });
}

export async function getAdminOrderDetail(context: CommerceAdminContext, rawOrderId: string) {
  const parsedId = uuid.safeParse(rawOrderId);
  if (!parsedId.success) commerceError("VALIDATION_ERROR", "Order ID must be a UUID.");
  assertAdminPermission(context, "COMMERCE_ORDERS_VIEW");
  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_ORDERS_VIEW");
    const order = await transaction.order.findUnique({
      where: { id: parsedId.data },
      include: {
        address: true,
        history: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 },
        items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        payment: true,
        reservations: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        stockMovements: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 },
        store: { select: { id: true, name: true, organization: { select: { id: true, name: true } } } },
      },
    });
    if (!order) commerceError("NOT_FOUND", "Order was not found.");
    const merchantAudit = await transaction.businessAuditLog.findMany({
      where: { targetId: order.id, targetType: "Order" },
      select: { action: true, createdAt: true, id: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    const adminAudit = await transaction.adminAuditLog.findMany({
      where: { targetId: order.id, targetType: "Order" },
      select: { action: true, createdAt: true, id: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    const canManage = context.isSuperAdmin || context.permissions.includes("COMMERCE_ORDERS_MANAGE");
    const allowed = adminOrderActions(order, new Date());
    return {
      adminAudit: adminAudit.map(serializeAuditSummary),
      merchantAudit: merchantAudit.map(serializeAuditSummary),
      order: {
        address: order.address ? {
          additionalDetails: order.address.additionalDetails,
          area: order.address.area,
          city: order.address.city,
          landmark: order.address.landmark,
          phone: order.address.phone,
          recipientName: order.address.recipientName,
          street: order.address.street,
        } : null,
        cancellationReason: order.cancellationReason,
        completedAt: order.completedAt?.toISOString() ?? null,
        confirmedAt: order.confirmedAt?.toISOString() ?? null,
        createdAt: order.createdAt.toISOString(),
        customer: { displayName: order.customerNameSnapshot, phone: order.customerPhoneSnapshot },
        customerInstructions: order.customerInstructions,
        fulfillmentMethod: order.fulfillmentMethod,
        fulfillmentStatus: order.fulfillmentStatus,
        grandTotal: decimalString(order.grandTotal),
        history: order.history.map((item) => ({
          actorType: item.actorType, createdAt: item.createdAt.toISOString(), id: item.id,
          newFulfillmentStatus: item.newFulfillmentStatus, newOrderStatus: item.newOrderStatus,
          newPaymentStatus: item.newPaymentStatus, previousFulfillmentStatus: item.previousFulfillmentStatus,
          previousOrderStatus: item.previousOrderStatus, previousPaymentStatus: item.previousPaymentStatus,
          reason: item.reason,
        })),
        id: order.id,
        items: order.items.map((item) => ({
          imageUrl: safePublicImageUrlOrNull(item.imageUrlSnapshot), lineTotal: decimalString(item.lineTotal),
          productName: item.productNameSnapshot, quantity: item.quantity, sku: item.skuSnapshot,
          unitPrice: decimalString(item.unitPrice), variantTitle: item.variantTitleSnapshot,
        })),
        orderNumber: order.orderNumber,
        payment: order.payment ? {
          amount: decimalString(order.payment.amount), currency: order.payment.currency,
          method: order.payment.method, status: order.payment.status,
        } : null,
        paymentStatus: order.paymentStatus,
        reservationExpiresAt: order.reservationExpiresAt.toISOString(),
        reservations: order.reservations.map((item) => ({ id: item.id, quantity: item.quantity, status: item.status })),
        status: order.status,
        stockMovements: order.stockMovements.map((item) => ({
          actorType: item.actorType, createdAt: item.createdAt.toISOString(), id: item.id,
          onHandDelta: item.onHandDelta, quantity: item.quantity, reservedDelta: item.reservedDelta, type: item.type,
        })),
        store: { id: order.store.id, name: order.store.name, organization: order.store.organization },
        updatedAt: order.updatedAt.toISOString(),
      },
      ...(canManage && (allowed.cancel || allowed.expire) ? {
        expectedVersion: order.updatedAt.toISOString(), permittedActions: allowed,
      } : {}),
    };
  });
}

function adminOrderSummary(order: AdminOrderListRecord, evaluationTime: Date) {
  return {
    createdAt: order.createdAt.toISOString(), fulfillmentMethod: order.fulfillmentMethod,
    fulfillmentStatus: order.fulfillmentStatus, id: order.id, itemCount: order._count.items,
    orderNumber: order.orderNumber,
    organization: order.store.organization,
    overdue: order.status === "PENDING" && order.reservationExpiresAt <= evaluationTime,
    paymentStatus: order.paymentStatus, status: order.status,
    store: { id: order.store.id, name: order.store.name },
    totalQuantity: order.items.reduce((total, item) => total + item.quantity, 0),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function adminOrderActions(order: {
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;
  reservationExpiresAt: Date;
  status: CommerceOrderStatus;
}, now: Date) {
  if (order.paymentStatus !== "UNPAID") return { cancel: false, expire: false, returnedStockRequired: false };
  return {
    cancel: (order.status === "PENDING" || order.status === "CONFIRMED") &&
      !["DELIVERED", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(order.fulfillmentStatus),
    expire: order.status === "PENDING" && order.reservationExpiresAt <= now,
    returnedStockRequired: order.fulfillmentStatus === "DELIVERY_FAILED",
  };
}

function serializeAuditSummary(entry: { action: string; createdAt: Date; id: string }) {
  return { ...entry, createdAt: entry.createdAt.toISOString() };
}
