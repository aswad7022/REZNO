import type {
  CommerceOrderStatus,
  FulfillmentStatus,
  OrderActorType,
  PaymentStatus,
  Prisma,
} from "@prisma/client";

import { commerceError } from "@/features/commerce/domain/errors";
import { stockMovementKey } from "@/features/commerce/domain/inventory";
import {
  assertCustomerCancellationAllowed,
  assertFulfillmentTransition,
  assertMerchantCancellationAllowed,
  assertOrderTransition,
  assertPaymentTransition,
} from "@/features/commerce/domain/order-state-machine";
import {
  assertAdminPermission,
  requireActiveCommerceCustomer,
  resolveMerchantCommerceContext,
  type CommerceAdminContext,
} from "@/features/commerce/services/authorization";
import {
  notifyCustomerCancellation,
  notifyCustomerOrderEvent,
} from "@/features/commerce/services/commerce-notification-service";
import type { MerchantIdentityInput } from "@/features/commerce/services/store-service";
import {
  lockInventoryItems,
  lockOrder,
  runCommerceSerializable,
} from "@/features/commerce/services/transaction";

const orderResultInclude = {
  address: true,
  history: { orderBy: { createdAt: "asc" as const } },
  items: true,
  payment: true,
  reservations: true,
} satisfies Prisma.OrderInclude;

type Transaction = Prisma.TransactionClient;

export async function getCustomerOrder(customerId: string, orderId: string) {
  const { prisma } = await import("@/lib/db/prisma");
  await requireActiveCommerceCustomer(customerId);
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    include: orderResultInclude,
  });
  if (!order) commerceError("NOT_FOUND", "Order was not found.");
  return order;
}

type TransitionReplayScope =
  | { actorId: string; actorType: "ADMIN" }
  | { actorId: string; actorType: "MERCHANT"; organizationId: string }
  | { actorType: "SYSTEM" };

interface TransitionReplayInput {
  idempotencyKey: string;
  newFulfillmentStatus?: FulfillmentStatus;
  newOrderStatus?: CommerceOrderStatus;
  newPaymentStatus?: PaymentStatus;
  orderId: string;
  reason?: string | null;
  scope: TransitionReplayScope;
}

async function replayTransition(transaction: Transaction, input: TransitionReplayInput) {
  if (input.scope.actorType === "MERCHANT") {
    const authorizedOrder = await transaction.order.findFirst({
      where: {
        id: input.orderId,
        store: { organizationId: input.scope.organizationId },
      },
      select: { id: true },
    });
    if (!authorizedOrder) commerceError("NOT_FOUND", "Order was not found.");
  }

  const existing = await transaction.orderStatusHistory.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: {
      actorId: true,
      actorType: true,
      newFulfillmentStatus: true,
      newOrderStatus: true,
      newPaymentStatus: true,
      order: { include: orderResultInclude },
      orderId: true,
      reason: true,
    },
  });
  if (!existing) return null;
  if (existing.orderId !== input.orderId) {
    commerceError("IDEMPOTENCY_CONFLICT", "Transition key belongs to another Order.");
  }
  const expectedActorId = input.scope.actorType === "SYSTEM" ? null : input.scope.actorId;
  if (
    existing.actorId !== expectedActorId ||
    existing.actorType !== input.scope.actorType ||
    existing.newFulfillmentStatus !== (input.newFulfillmentStatus ?? null) ||
    existing.newOrderStatus !== (input.newOrderStatus ?? null) ||
    existing.newPaymentStatus !== (input.newPaymentStatus ?? null) ||
    existing.reason !== (input.reason ?? null)
  ) {
    commerceError("IDEMPOTENCY_CONFLICT", "Transition key was already used for a different transition.");
  }
  return existing.order;
}

async function activeReservations(transaction: Transaction, orderId: string) {
  const reservations = await transaction.inventoryReservation.findMany({
    where: { orderId, status: "ACTIVE" },
    orderBy: { inventoryItemId: "asc" },
  });
  await lockInventoryItems(
    transaction,
    reservations.map((item) => item.inventoryItemId),
  );
  return transaction.inventoryReservation.findMany({
    where: { orderId, status: "ACTIVE" },
    orderBy: { inventoryItemId: "asc" },
  });
}

async function releaseActiveReservations(
  transaction: Transaction,
  input: {
    actorId?: string;
    actorType: OrderActorType;
    orderId: string;
    reason: string;
    reservationStatus: "EXPIRED" | "RELEASED";
  },
) {
  const reservations = await activeReservations(transaction, input.orderId);
  for (const reservation of reservations) {
    const changed = await transaction.inventoryReservation.updateMany({
      where: { id: reservation.id, status: "ACTIVE" },
      data: {
        releasedAt: new Date(),
        status: input.reservationStatus,
      },
    });
    if (changed.count === 0) continue;
    const inventory = await transaction.inventoryItem.findUniqueOrThrow({
      where: { id: reservation.inventoryItemId },
    });
    if (inventory.reserved < reservation.quantity) {
      commerceError("CONFLICT", "Reserved inventory is inconsistent.");
    }
    const resultingReserved = inventory.reserved - reservation.quantity;
    await transaction.inventoryItem.update({
      where: { id: inventory.id },
      data: { reserved: resultingReserved, version: { increment: 1 } },
    });
    await transaction.stockMovement.create({
      data: {
        actorId: input.actorId,
        actorType: input.actorType,
        idempotencyKey: stockMovementKey({
          action: input.reservationStatus === "EXPIRED" ? "expire-release" : "release",
          orderId: input.orderId,
          reservationId: reservation.id,
          variantId: reservation.productVariantId,
        }),
        inventoryItemId: inventory.id,
        onHandDelta: 0,
        orderId: input.orderId,
        quantity: reservation.quantity,
        reason: input.reason,
        reservationId: reservation.id,
        reservedDelta: -reservation.quantity,
        resultingOnHand: inventory.onHand,
        resultingReserved,
        type: "RELEASE",
      },
    });
  }
}

async function restockConsumedOrder(
  transaction: Transaction,
  input: {
    actorId?: string;
    actorType: OrderActorType;
    orderId: string;
    reason: string;
  },
) {
  const items = await transaction.orderItem.findMany({
    where: { orderId: input.orderId, productVariantId: { not: null } },
    select: { productVariantId: true, quantity: true },
    orderBy: { productVariantId: "asc" },
  });
  const variants = items.flatMap((item) => (item.productVariantId ? [item.productVariantId] : []));
  const inventories = await transaction.inventoryItem.findMany({
    where: { variantId: { in: variants } },
    orderBy: { id: "asc" },
  });
  await lockInventoryItems(
    transaction,
    inventories.map((item) => item.id),
  );
  const byVariant = new Map(
    (await transaction.inventoryItem.findMany({ where: { variantId: { in: variants } } })).map(
      (item) => [item.variantId, item],
    ),
  );
  for (const item of items) {
    if (!item.productVariantId) continue;
    const inventory = byVariant.get(item.productVariantId);
    if (!inventory) commerceError("CONFLICT", "Inventory item is missing for restock.");
    const key = stockMovementKey({
      action: "cancel-restock",
      orderId: input.orderId,
      variantId: item.productVariantId,
    });
    const prior = await transaction.stockMovement.findUnique({ where: { idempotencyKey: key } });
    if (prior) continue;
    const resultingOnHand = inventory.onHand + item.quantity;
    await transaction.inventoryItem.update({
      where: { id: inventory.id },
      data: { onHand: resultingOnHand, version: { increment: 1 } },
    });
    await transaction.stockMovement.create({
      data: {
        actorId: input.actorId,
        actorType: input.actorType,
        idempotencyKey: key,
        inventoryItemId: inventory.id,
        onHandDelta: item.quantity,
        orderId: input.orderId,
        quantity: item.quantity,
        reason: input.reason,
        reservedDelta: 0,
        resultingOnHand,
        resultingReserved: inventory.reserved,
        type: "RESTOCK",
      },
    });
  }
}

async function voidPayment(transaction: Transaction, orderId: string, now = new Date()) {
  await transaction.payment.updateMany({
    where: { orderId, status: "UNPAID" },
    data: { status: "VOIDED", voidedAt: now },
  });
}

export async function confirmOrder(
  identity: MerchantIdentityInput,
  input: { idempotencyKey: string; orderId: string },
) {
  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "ORDER_MANAGE", transaction);
    const replay = await replayTransition(transaction, {
      idempotencyKey: input.idempotencyKey,
      newOrderStatus: "CONFIRMED",
      orderId: input.orderId,
      scope: {
        actorId: context.personId,
        actorType: "MERCHANT",
        organizationId: context.organizationId,
      },
    });
    if (replay) return replay;
    await lockOrder(transaction, input.orderId);
    const order = await transaction.order.findFirst({
      where: { id: input.orderId, store: { organizationId: context.organizationId } },
    });
    if (!order) commerceError("NOT_FOUND", "Order was not found.");
    assertOrderTransition(order.status, "CONFIRMED");
    if (order.reservationExpiresAt <= new Date()) {
      commerceError("INVALID_TRANSITION", "Pending Order reservation has expired.");
    }
    const reservations = await activeReservations(transaction, order.id);
    if (reservations.length === 0) commerceError("CONFLICT", "No active reservations were found.");
    for (const reservation of reservations) {
      const inventory = await transaction.inventoryItem.findUniqueOrThrow({
        where: { id: reservation.inventoryItemId },
      });
      if (inventory.onHand < reservation.quantity || inventory.reserved < reservation.quantity) {
        commerceError("CONFLICT", "Inventory cannot consume this reservation.");
      }
      const resultingOnHand = inventory.onHand - reservation.quantity;
      const resultingReserved = inventory.reserved - reservation.quantity;
      await transaction.inventoryReservation.update({
        where: { id: reservation.id },
        data: { consumedAt: new Date(), status: "CONSUMED" },
      });
      await transaction.inventoryItem.update({
        where: { id: inventory.id },
        data: {
          onHand: resultingOnHand,
          reserved: resultingReserved,
          version: { increment: 1 },
        },
      });
      await transaction.stockMovement.create({
        data: {
          actorId: context.personId,
          actorType: "MERCHANT",
          idempotencyKey: stockMovementKey({
            action: "consume",
            orderId: order.id,
            reservationId: reservation.id,
            variantId: reservation.productVariantId,
          }),
          inventoryItemId: inventory.id,
          onHandDelta: -reservation.quantity,
          orderId: order.id,
          quantity: reservation.quantity,
          reservationId: reservation.id,
          reservedDelta: -reservation.quantity,
          resultingOnHand,
          resultingReserved,
          type: "CONSUME",
        },
      });
    }
    await transaction.order.update({
      where: { id: order.id },
      data: { confirmedAt: new Date(), status: "CONFIRMED" },
    });
    await transaction.orderStatusHistory.create({
      data: {
        actorId: context.personId,
        actorType: "MERCHANT",
        idempotencyKey: input.idempotencyKey,
        newOrderStatus: "CONFIRMED",
        orderId: order.id,
        previousOrderStatus: order.status,
      },
    });
    await notifyCustomerOrderEvent(transaction, order.id, "order.confirmed");
    return transaction.order.findUniqueOrThrow({ where: { id: order.id }, include: orderResultInclude });
  });
}

export async function rejectOrder(
  identity: MerchantIdentityInput,
  input: { idempotencyKey: string; orderId: string; reason: string },
) {
  const reason = requiredReason(input.reason);
  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "ORDER_MANAGE", transaction);
    const replay = await replayTransition(transaction, {
      idempotencyKey: input.idempotencyKey,
      newFulfillmentStatus: "CANCELLED",
      newOrderStatus: "REJECTED",
      newPaymentStatus: "VOIDED",
      orderId: input.orderId,
      reason,
      scope: {
        actorId: context.personId,
        actorType: "MERCHANT",
        organizationId: context.organizationId,
      },
    });
    if (replay) return replay;
    await lockOrder(transaction, input.orderId);
    const order = await transaction.order.findFirst({
      where: { id: input.orderId, store: { organizationId: context.organizationId } },
    });
    if (!order) commerceError("NOT_FOUND", "Order was not found.");
    assertOrderTransition(order.status, "REJECTED");
    await releaseActiveReservations(transaction, {
      actorId: context.personId,
      actorType: "MERCHANT",
      orderId: order.id,
      reason,
      reservationStatus: "RELEASED",
    });
    await voidPayment(transaction, order.id);
    await transaction.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: "CANCELLED", paymentStatus: "VOIDED", rejectionReason: reason, status: "REJECTED" },
    });
    await transaction.orderStatusHistory.create({
      data: {
        actorId: context.personId,
        actorType: "MERCHANT",
        idempotencyKey: input.idempotencyKey,
        newFulfillmentStatus: "CANCELLED",
        newOrderStatus: "REJECTED",
        newPaymentStatus: "VOIDED",
        orderId: order.id,
        previousFulfillmentStatus: order.fulfillmentStatus,
        previousOrderStatus: order.status,
        previousPaymentStatus: order.paymentStatus,
        reason,
      },
    });
    await notifyCustomerOrderEvent(transaction, order.id, "order.rejected");
    return transaction.order.findUniqueOrThrow({ where: { id: order.id }, include: orderResultInclude });
  });
}

export async function cancelCustomerOrder(
  customerId: string,
  input: { orderId: string; reason: string },
) {
  const reason = requiredReason(input.reason);
  return runCommerceSerializable(async (transaction) => {
    const customer = await requireActiveCommerceCustomer(customerId, transaction);
    await lockOrder(transaction, input.orderId);
    const order = await transaction.order.findFirst({
      where: { id: input.orderId, customerId: customer.personId },
    });
    if (!order) commerceError("NOT_FOUND", "Order was not found.");
    if (order.paymentStatus === "PAID") {
      commerceError("ORDER_NOT_CANCELLABLE", "Paid Orders require an approved refund policy.");
    }
    assertCustomerCancellationAllowed({
      fulfillmentStatus: order.fulfillmentStatus,
      orderStatus: order.status,
      reason,
    });
    if (order.status === "PENDING") {
      await releaseActiveReservations(transaction, {
        actorId: customer.personId,
        actorType: "CUSTOMER",
        orderId: order.id,
        reason,
        reservationStatus: "RELEASED",
      });
    } else {
      await restockConsumedOrder(transaction, {
        actorId: customer.personId,
        actorType: "CUSTOMER",
        orderId: order.id,
        reason,
      });
    }
    return finishCancellation(transaction, order, {
      actorId: customer.personId,
      actorType: "CUSTOMER",
      idempotencyKey: `order:${order.id}:customer-cancelled`,
      reason,
    });
  });
}

export async function cancelMerchantOrder(
  identity: MerchantIdentityInput,
  input: { idempotencyKey: string; orderId: string; reason: string },
) {
  const reason = requiredReason(input.reason);
  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "ORDER_CANCEL", transaction);
    const replay = await replayTransition(transaction, {
      idempotencyKey: input.idempotencyKey,
      newFulfillmentStatus: "CANCELLED",
      newOrderStatus: "CANCELLED",
      newPaymentStatus: "VOIDED",
      orderId: input.orderId,
      reason,
      scope: {
        actorId: context.personId,
        actorType: "MERCHANT",
        organizationId: context.organizationId,
      },
    });
    if (replay) return replay;
    await lockOrder(transaction, input.orderId);
    const order = await transaction.order.findFirst({
      where: { id: input.orderId, store: { organizationId: context.organizationId } },
    });
    if (!order) commerceError("NOT_FOUND", "Order was not found.");
    assertMerchantCancellationAllowed({
      fulfillmentStatus: order.fulfillmentStatus,
      orderStatus: order.status,
      reason,
    });
    if (order.status === "PENDING") {
      await releaseActiveReservations(transaction, {
        actorId: context.personId,
        actorType: "MERCHANT",
        orderId: order.id,
        reason,
        reservationStatus: "RELEASED",
      });
    } else {
      await restockConsumedOrder(transaction, {
        actorId: context.personId,
        actorType: "MERCHANT",
        orderId: order.id,
        reason,
      });
    }
    return finishCancellation(transaction, order, {
      actorId: context.personId,
      actorType: "MERCHANT",
      idempotencyKey: input.idempotencyKey,
      reason,
    });
  });
}

export async function cancelOrderByAdmin(
  context: CommerceAdminContext,
  input: { idempotencyKey: string; orderId: string; reason: string },
) {
  assertAdminPermission(context, "COMMERCE_ORDERS_MANAGE");
  const reason = requiredReason(input.reason);
  return runCommerceSerializable(async (transaction) => {
    const replay = await replayTransition(transaction, {
      idempotencyKey: input.idempotencyKey,
      newFulfillmentStatus: "CANCELLED",
      newOrderStatus: "CANCELLED",
      newPaymentStatus: "VOIDED",
      orderId: input.orderId,
      reason,
      scope: { actorId: context.userId, actorType: "ADMIN" },
    });
    if (replay) return replay;
    await lockOrder(transaction, input.orderId);
    const order = await transaction.order.findUnique({ where: { id: input.orderId } });
    if (!order) commerceError("NOT_FOUND", "Order was not found.");
    assertMerchantCancellationAllowed({
      fulfillmentStatus: order.fulfillmentStatus,
      orderStatus: order.status,
      reason,
    });
    if (order.status === "PENDING") {
      await releaseActiveReservations(transaction, {
        actorId: context.userId,
        actorType: "ADMIN",
        orderId: order.id,
        reason,
        reservationStatus: "RELEASED",
      });
    } else {
      await restockConsumedOrder(transaction, {
        actorId: context.userId,
        actorType: "ADMIN",
        orderId: order.id,
        reason,
      });
    }
    return finishCancellation(transaction, order, {
      actorId: context.userId,
      actorType: "ADMIN",
      idempotencyKey: input.idempotencyKey,
      reason,
    });
  });
}

async function finishCancellation(
  transaction: Transaction,
  order: {
    fulfillmentStatus: FulfillmentStatus;
    id: string;
    paymentStatus: "PAID" | "UNPAID" | "VOIDED";
    status: CommerceOrderStatus;
  },
  input: {
    actorId: string;
    actorType: OrderActorType;
    idempotencyKey: string;
    reason: string;
  },
) {
  if (order.paymentStatus === "PAID") {
    commerceError("INVALID_TRANSITION", "Paid Orders cannot be cancelled without a refund policy.");
  }
  await voidPayment(transaction, order.id);
  await transaction.order.update({
    where: { id: order.id },
    data: {
      cancellationReason: input.reason,
      cancelledAt: new Date(),
      fulfillmentStatus: "CANCELLED",
      paymentStatus: "VOIDED",
      status: "CANCELLED",
    },
  });
  await transaction.orderStatusHistory.create({
    data: {
      actorId: input.actorId,
      actorType: input.actorType,
      idempotencyKey: input.idempotencyKey,
      newFulfillmentStatus: "CANCELLED",
      newOrderStatus: "CANCELLED",
      newPaymentStatus: "VOIDED",
      orderId: order.id,
      previousFulfillmentStatus: order.fulfillmentStatus,
      previousOrderStatus: order.status,
      previousPaymentStatus: order.paymentStatus,
      reason: input.reason,
    },
  });
  if (input.actorType === "CUSTOMER") {
    await notifyCustomerCancellation(transaction, order.id);
  } else {
    await notifyCustomerOrderEvent(transaction, order.id, "order.cancelled");
  }
  return transaction.order.findUniqueOrThrow({ where: { id: order.id }, include: orderResultInclude });
}

export async function advanceOrderFulfillment(
  identity: MerchantIdentityInput,
  input: { idempotencyKey: string; next: FulfillmentStatus; orderId: string; reason?: string },
) {
  const reason = input.reason?.trim() || null;
  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "ORDER_MANAGE", transaction);
    const replay = await replayTransition(transaction, {
      idempotencyKey: input.idempotencyKey,
      newFulfillmentStatus: input.next,
      orderId: input.orderId,
      reason,
      scope: {
        actorId: context.personId,
        actorType: "MERCHANT",
        organizationId: context.organizationId,
      },
    });
    if (replay) return replay;
    await lockOrder(transaction, input.orderId);
    const order = await transaction.order.findFirst({
      where: { id: input.orderId, store: { organizationId: context.organizationId } },
    });
    if (!order) commerceError("NOT_FOUND", "Order was not found.");
    if (order.status !== "CONFIRMED") commerceError("INVALID_TRANSITION", "Order is not confirmed.");
    assertFulfillmentTransition(order.fulfillmentMethod, order.fulfillmentStatus, input.next);
    if (input.next === "DELIVERY_FAILED" && !reason) {
      commerceError("VALIDATION_ERROR", "Delivery failure requires a reason.");
    }
    await transaction.order.update({ where: { id: order.id }, data: { fulfillmentStatus: input.next } });
    await transaction.orderStatusHistory.create({
      data: {
        actorId: context.personId,
        actorType: "MERCHANT",
        idempotencyKey: input.idempotencyKey,
        newFulfillmentStatus: input.next,
        orderId: order.id,
        previousFulfillmentStatus: order.fulfillmentStatus,
        reason,
      },
    });
    const notificationEvent = fulfillmentNotificationEvent(input.next);
    if (notificationEvent) await notifyCustomerOrderEvent(transaction, order.id, notificationEvent);
    return transaction.order.findUniqueOrThrow({ where: { id: order.id }, include: orderResultInclude });
  });
}

export async function recordOfflinePaymentPaid(
  identity: MerchantIdentityInput,
  input: { idempotencyKey: string; orderId: string },
) {
  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "ORDER_MANAGE", transaction);
    const replay = await replayTransition(transaction, {
      idempotencyKey: input.idempotencyKey,
      newOrderStatus: "COMPLETED",
      newPaymentStatus: "PAID",
      orderId: input.orderId,
      scope: {
        actorId: context.personId,
        actorType: "MERCHANT",
        organizationId: context.organizationId,
      },
    });
    if (replay) return replay;
    await lockOrder(transaction, input.orderId);
    const order = await transaction.order.findFirst({
      where: { id: input.orderId, store: { organizationId: context.organizationId } },
      include: { payment: true },
    });
    if (!order || !order.payment) commerceError("NOT_FOUND", "Order payment was not found.");
    if (order.status !== "CONFIRMED") commerceError("INVALID_TRANSITION", "Order is not confirmed.");
    if (order.fulfillmentStatus !== "DELIVERED" && order.fulfillmentStatus !== "PICKED_UP") {
      commerceError("INVALID_TRANSITION", "Offline payment can be recorded only after handoff.");
    }
    assertPaymentTransition(order.paymentStatus, "PAID");
    assertOrderTransition(order.status, "COMPLETED");
    const now = new Date();
    await transaction.payment.update({
      where: { orderId: order.id },
      data: {
        paidAt: now,
        recordedById: context.personId,
        recordedByType: "MERCHANT",
        status: "PAID",
      },
    });
    await transaction.order.update({
      where: { id: order.id },
      data: { completedAt: now, paymentStatus: "PAID", status: "COMPLETED" },
    });
    await transaction.orderStatusHistory.create({
      data: {
        actorId: context.personId,
        actorType: "MERCHANT",
        idempotencyKey: input.idempotencyKey,
        newOrderStatus: "COMPLETED",
        newPaymentStatus: "PAID",
        orderId: order.id,
        previousOrderStatus: order.status,
        previousPaymentStatus: order.paymentStatus,
      },
    });
    return transaction.order.findUniqueOrThrow({ where: { id: order.id }, include: orderResultInclude });
  });
}

export async function expirePendingOrderInTransaction(
  transaction: Transaction,
  orderId: string,
  now: Date,
) {
  await lockOrder(transaction, orderId);
  const order = await transaction.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PENDING" || order.reservationExpiresAt > now) return null;
  const idempotencyKey = `order:${order.id}:expired`;
  const replay = await replayTransition(transaction, {
    idempotencyKey,
    newFulfillmentStatus: "CANCELLED",
    newOrderStatus: "EXPIRED",
    newPaymentStatus: "VOIDED",
    orderId: order.id,
    reason: "PENDING_RESERVATION_EXPIRED",
    scope: { actorType: "SYSTEM" },
  });
  if (replay) return replay;
  await releaseActiveReservations(transaction, {
    actorType: "SYSTEM",
    orderId: order.id,
    reason: "PENDING_RESERVATION_EXPIRED",
    reservationStatus: "EXPIRED",
  });
  await voidPayment(transaction, order.id, now);
  await transaction.order.update({
    where: { id: order.id },
    data: { fulfillmentStatus: "CANCELLED", paymentStatus: "VOIDED", status: "EXPIRED" },
  });
  await transaction.orderStatusHistory.create({
    data: {
      actorType: "SYSTEM",
      idempotencyKey,
      newFulfillmentStatus: "CANCELLED",
      newOrderStatus: "EXPIRED",
      newPaymentStatus: "VOIDED",
      orderId: order.id,
      previousFulfillmentStatus: order.fulfillmentStatus,
      previousOrderStatus: order.status,
      previousPaymentStatus: order.paymentStatus,
      reason: "PENDING_RESERVATION_EXPIRED",
    },
  });
  await notifyCustomerOrderEvent(transaction, order.id, "order.expired");
  return transaction.order.findUniqueOrThrow({ where: { id: order.id }, include: orderResultInclude });
}

function fulfillmentNotificationEvent(status: FulfillmentStatus) {
  if (status === "PREPARING") return "order.preparing" as const;
  if (status === "READY_FOR_PICKUP") return "order.ready_for_pickup" as const;
  if (status === "OUT_FOR_DELIVERY") return "order.out_for_delivery" as const;
  if (status === "DELIVERED") return "order.delivered" as const;
  return null;
}

function requiredReason(value: string) {
  const reason = value.trim();
  if (reason.length < 2 || reason.length > 500) {
    commerceError("VALIDATION_ERROR", "A reason between 2 and 500 characters is required.");
  }
  return reason;
}
