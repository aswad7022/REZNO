import type { Prisma } from "@prisma/client";

import { decimalString } from "@/features/commerce/domain/money";
import type { MerchantOrderAction } from "@/features/commerce/domain/order-input";
import { safePublicImageUrlOrNull } from "@/lib/security/public-image-url";

export const transitionOrderInclude = {
  payment: true,
  reservations: {
    orderBy: [{ productVariantId: "asc" as const }, { id: "asc" as const }],
    select: { id: true, productVariantId: true, quantity: true, status: true },
  },
} satisfies Prisma.OrderInclude;

export type TransitionOrderRecord = Prisma.OrderGetPayload<{
  include: typeof transitionOrderInclude;
}>;

export function orderTransitionResult(order: TransitionOrderRecord) {
  return {
    completedAt: order.completedAt?.toISOString() ?? null,
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    fulfillmentStatus: order.fulfillmentStatus,
    id: order.id,
    orderNumber: order.orderNumber,
    payment: order.payment
      ? {
          method: order.payment.method,
          paidAt: order.payment.paidAt?.toISOString() ?? null,
          status: order.payment.status,
        }
      : null,
    paymentStatus: order.paymentStatus,
    reservations: order.reservations.map((reservation) => ({
      id: reservation.id,
      productVariantId: reservation.productVariantId,
      quantity: reservation.quantity,
      status: reservation.status,
    })),
    status: order.status,
    updatedAt: order.updatedAt.toISOString(),
  } as const;
}

export type OrderTransitionReplayResult = ReturnType<typeof orderTransitionResult>;

export function merchantOrderSummary(order: {
  _count: { items: number };
  createdAt: Date;
  currency: string;
  customerNameSnapshot: string;
  fulfillmentMethod: string;
  fulfillmentStatus: string;
  grandTotal: Prisma.Decimal;
  id: string;
  orderNumber: string;
  paymentMethod: string;
  paymentStatus: string;
  reservationExpiresAt: Date;
  status: string;
  storeNameSnapshot: string;
  updatedAt: Date;
}, totalQuantity: number, canMutate: boolean, evaluationTime: Date) {
  return {
    createdAt: order.createdAt.toISOString(),
    currency: order.currency,
    customerDisplayName: order.customerNameSnapshot,
    ...(canMutate ? { expectedVersion: order.updatedAt.toISOString() } : {}),
    fulfillmentMethod: order.fulfillmentMethod,
    fulfillmentStatus: order.fulfillmentStatus,
    grandTotal: decimalString(order.grandTotal),
    id: order.id,
    itemCount: order._count.items,
    orderNumber: order.orderNumber,
    overdue: order.status === "PENDING" && order.reservationExpiresAt <= evaluationTime,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    reservationExpiresAt: order.status === "PENDING" ? order.reservationExpiresAt.toISOString() : null,
    status: order.status,
    store: { name: order.storeNameSnapshot },
    totalQuantity,
    updatedAt: order.updatedAt.toISOString(),
  };
}

export function merchantOrderDetail(order: MerchantOrderDetailRecord, capabilities: {
  canCancel: boolean;
  canManage: boolean;
}) {
  const common = {
    cancellationReason: order.cancellationReason,
    completedAt: order.completedAt?.toISOString() ?? null,
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    currency: order.currency,
    customer: {
      displayName: order.customerNameSnapshot,
      phone: order.customerPhoneSnapshot,
    },
    customerInstructions: order.customerInstructions,
    delivery: order.fulfillmentMethod === "STORE_DELIVERY" && order.address
      ? {
          additionalDetails: order.address.additionalDetails,
          area: order.address.area,
          city: order.address.city,
          landmark: order.address.landmark,
          phone: order.address.phone,
          recipientName: order.address.recipientName,
          street: order.address.street,
        }
      : null,
    deliveryFee: decimalString(order.deliveryFee),
    discountTotal: decimalString(order.discountTotal),
    fulfillmentMethod: order.fulfillmentMethod,
    fulfillmentStatus: order.fulfillmentStatus,
    grandTotal: decimalString(order.grandTotal),
    history: order.history.map((item) => ({
      actorType: item.actorType,
      createdAt: item.createdAt.toISOString(),
      id: item.id,
      newFulfillmentStatus: item.newFulfillmentStatus,
      newOrderStatus: item.newOrderStatus,
      newPaymentStatus: item.newPaymentStatus,
      previousFulfillmentStatus: item.previousFulfillmentStatus,
      previousOrderStatus: item.previousOrderStatus,
      previousPaymentStatus: item.previousPaymentStatus,
      reason: item.reason,
    })),
    historyPageInfo: { hasNextPage: order.historyHasNextPage, nextCursor: order.historyNextCursor },
    id: order.id,
    items: order.items.map((item) => ({
      currency: item.currency,
      imageUrl: safePublicImageUrlOrNull(item.imageUrlSnapshot),
      lineTotal: decimalString(item.lineTotal),
      optionValues: item.optionValuesSnapshot,
      productName: item.productNameSnapshot,
      quantity: item.quantity,
      sku: item.skuSnapshot,
      unitPrice: decimalString(item.unitPrice),
      variantTitle: item.variantTitleSnapshot,
    })),
    orderNumber: order.orderNumber,
    payment: order.payment
      ? {
          amount: decimalString(order.payment.amount),
          currency: order.payment.currency,
          method: order.payment.method,
          paidAt: order.payment.paidAt?.toISOString() ?? null,
          status: order.payment.status,
        }
      : null,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    pickup: order.fulfillmentMethod === "CUSTOMER_PICKUP"
      ? { address: order.pickupAddressSnapshot, instructions: order.pickupInstructionsSnapshot }
      : null,
    rejectionReason: order.rejectionReason,
    reservationExpiresAt: order.reservationExpiresAt.toISOString(),
    reservations: reservationSummary(order.reservations),
    status: order.status,
    store: { name: order.storeNameSnapshot, phone: order.storePhoneSnapshot },
    subtotal: decimalString(order.subtotal),
    taxTotal: decimalString(order.taxTotal),
    updatedAt: order.updatedAt.toISOString(),
  };
  if (!capabilities.canManage && !capabilities.canCancel) {
    return { ...common, mode: "read_only" as const };
  }
  return {
    ...common,
    allowedActions: allowedMerchantOrderActions(order, capabilities),
    expectedVersion: order.updatedAt.toISOString(),
    mode: "management" as const,
  };
}

export type MerchantOrderDetailRecord = Prisma.OrderGetPayload<{
  include: {
    address: true;
    items: true;
    payment: true;
    reservations: true;
  };
}> & {
  history: Array<Prisma.OrderStatusHistoryGetPayload<Record<string, never>>>;
  historyHasNextPage: boolean;
  historyNextCursor: string | null;
};

function reservationSummary(reservations: Array<{ quantity: number; status: string }>) {
  const totals = new Map<string, number>();
  for (const reservation of reservations) {
    totals.set(reservation.status, (totals.get(reservation.status) ?? 0) + reservation.quantity);
  }
  return [...totals.entries()].map(([status, quantity]) => ({ quantity, status }));
}

function allowedMerchantOrderActions(order: {
  fulfillmentMethod: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  reservationExpiresAt: Date;
  status: string;
}, capabilities: { canCancel: boolean; canManage: boolean }): MerchantOrderAction[] {
  if (order.status === "PENDING") {
    return order.reservationExpiresAt <= new Date()
      ? []
      : [
          ...(capabilities.canManage ? ["confirm", "reject"] as const : []),
          ...(capabilities.canCancel ? ["cancel"] as const : []),
        ];
  }
  if (order.status !== "CONFIRMED" || order.paymentStatus !== "UNPAID") return [];
  const fulfillment: Record<string, MerchantOrderAction[]> = order.fulfillmentMethod === "CUSTOMER_PICKUP"
    ? {
        PREPARING: ["ready_for_pickup"],
        READY_FOR_PICKUP: ["finalize_pickup"],
        UNFULFILLED: ["start_preparing"],
      }
    : {
        DELIVERY_FAILED: ["retry_delivery"],
        OUT_FOR_DELIVERY: ["delivery_failed", "finalize_delivery"],
        PREPARING: ["out_for_delivery"],
        UNFULFILLED: ["start_preparing"],
      };
  const actions = capabilities.canManage ? [...(fulfillment[order.fulfillmentStatus] ?? [])] : [];
  if (capabilities.canCancel && order.fulfillmentStatus !== "OUT_FOR_DELIVERY") actions.push("cancel");
  return actions;
}
