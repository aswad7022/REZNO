import "server-only";

import { createHash } from "node:crypto";
import type {
  CommerceOrderStatus,
  FulfillmentStatus,
  OrderActorType,
  PaymentStatus,
  Prisma,
} from "@prisma/client";

import { commerceError } from "@/features/commerce/domain/errors";
import { assertInventoryInteger, POSTGRES_INT_MAX, stockMovementKey } from "@/features/commerce/domain/inventory";
import {
  customerOrderCancellationSchema,
  merchantOrderCancellationSchema,
  merchantOrderDecisionSchema,
  merchantOrderFulfillmentSchema,
  orderMutationRequestHash,
  type CustomerOrderCancellationInput,
  type MerchantOrderCancellationInput,
  type MerchantOrderDecisionInput,
  type MerchantOrderFulfillmentInput,
} from "@/features/commerce/domain/order-input";
import {
  orderTransitionResult,
  transitionOrderInclude,
  type OrderTransitionReplayResult,
} from "@/features/commerce/domain/order-dto";
import {
  assertCustomerCancellationAllowed,
  assertFulfillmentTransition,
  assertMerchantCancellationAllowed,
  assertOrderTransition,
  assertPaymentTransition,
} from "@/features/commerce/domain/order-state-machine";
import {
  assertMerchantCommerceContextCurrent,
  requireActiveCommerceCustomer,
  resolveMerchantCommerceContext,
  type MerchantActorReference,
  type MerchantCommerceContext,
} from "@/features/commerce/services/authorization";
import {
  notifyCustomerCancellation,
  notifyCustomerOrderEvent,
  notifyOrderExpired,
} from "@/features/commerce/services/commerce-notification-service";
import {
  lockInventoryItems,
  lockOrder,
  runCommerceSerializable,
} from "@/features/commerce/services/transaction";

type Transaction = Prisma.TransactionClient;
type MerchantScope = {
  actorId: string;
  actorType: "MERCHANT";
  membershipId: string;
  organizationId: string;
};
type CustomerScope = { actorId: string; actorType: "CUSTOMER"; customerId: string };
type SystemScope = { actorType: "SYSTEM" };
type ReplayScope = MerchantScope | CustomerScope | SystemScope;

const mutationOrderInclude = {
  items: {
    orderBy: [{ productVariantId: "asc" as const }, { id: "asc" as const }],
    select: { id: true, productVariantId: true, quantity: true },
  },
  payment: true,
  reservations: {
    orderBy: [{ inventoryItemId: "asc" as const }, { id: "asc" as const }],
  },
  store: {
    select: { archivedAt: true, organizationId: true, status: true },
  },
} satisfies Prisma.OrderInclude;

type MutationOrder = Prisma.OrderGetPayload<{ include: typeof mutationOrderInclude }>;

interface ReplayEnvelope {
  expectedVersion: string;
  idempotencyKey: string;
  orderId: string;
  requestHash: string;
}
type ScopedReplayEnvelope = ReplayEnvelope & { scope: ReplayScope };

export async function getCustomerOrder(customerId: string, orderId: string) {
  const { prisma } = await import("@/lib/db/prisma");
  await requireActiveCommerceCustomer(customerId);
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    include: { address: true, history: true, items: true, payment: true, reservations: true },
  });
  if (!order) commerceError("NOT_FOUND", "Order was not found.");
  return order;
}

export async function confirmOrder(
  reference: MerchantActorReference,
  rawInput: MerchantOrderDecisionInput,
) {
  const input = parseDecision(rawInput, "confirm");
  return merchantMutation(reference, "ORDER_MANAGE", input, async (transaction, actor, order, now) => {
    assertOperationalStore(order);
    const expired = await expireIfOverdue(transaction, order, now, input, merchantScope(actor));
    if (expired) return expired;
    assertExpectedVersion(order, input.expectedVersion);
    assertOrderPaymentConsistency(order);
    assertOrderTransition(order.status, "CONFIRMED");
    await consumeReservations(transaction, order, actor.personId, now);
    await transaction.order.update({
      where: { id: order.id },
      data: { confirmedAt: now, status: "CONFIRMED" },
    });
    return finishMerchantTransition(transaction, actor, order, input, {
      action: "commerce.order.confirm",
      newOrderStatus: "CONFIRMED",
      notify: "order.confirmed",
    });
  });
}

export async function rejectOrder(
  reference: MerchantActorReference,
  rawInput: MerchantOrderDecisionInput,
) {
  const input = parseDecision(rawInput, "reject");
  return merchantMutation(reference, "ORDER_MANAGE", input, async (transaction, actor, order, now) => {
    assertOperationalStore(order);
    const expired = await expireIfOverdue(transaction, order, now, input, merchantScope(actor));
    if (expired) return expired;
    assertExpectedVersion(order, input.expectedVersion);
    assertOrderPaymentConsistency(order);
    assertOrderTransition(order.status, "REJECTED");
    await releaseReservations(transaction, order, {
      actorId: actor.personId,
      actorType: "MERCHANT",
      now,
      reason: input.reason!,
      status: "RELEASED",
    });
    await voidUnpaidPayment(transaction, order, now);
    await transaction.order.update({
      where: { id: order.id },
      data: {
        cancelledAt: now,
        fulfillmentStatus: "CANCELLED",
        paymentStatus: "VOIDED",
        rejectionReason: input.reason,
        status: "REJECTED",
      },
    });
    return finishMerchantTransition(transaction, actor, order, input, {
      action: "commerce.order.reject",
      newFulfillmentStatus: "CANCELLED",
      newOrderStatus: "REJECTED",
      newPaymentStatus: "VOIDED",
      notify: "order.rejected",
      reason: input.reason,
    });
  });
}

export async function advanceOrderFulfillment(
  reference: MerchantActorReference,
  rawInput: MerchantOrderFulfillmentInput,
) {
  if (rawInput.action === "finalize_pickup" || rawInput.action === "finalize_delivery") {
    return finalizeOrderHandoff(reference, rawInput);
  }
  const input = parseFulfillment(rawInput);
  const next = fulfillmentTarget(input.action);
  return merchantMutation(reference, "ORDER_MANAGE", input, async (transaction, actor, order) => {
    assertOperationalStore(order);
    assertExpectedVersion(order, input.expectedVersion);
    assertOrderPaymentConsistency(order);
    if (order.status !== "CONFIRMED") commerceError("INVALID_TRANSITION", "Order is not confirmed.");
    assertFulfillmentTransition(order.fulfillmentMethod, order.fulfillmentStatus, next);
    await transaction.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: next },
    });
    return finishMerchantTransition(transaction, actor, order, input, {
      action: `commerce.order.${input.action}`,
      newFulfillmentStatus: next,
      notify: fulfillmentNotification(next),
      reason: input.reason,
    });
  });
}

export async function finalizeOrderHandoff(
  reference: MerchantActorReference,
  rawInput: MerchantOrderFulfillmentInput,
) {
  const input = parseFulfillment(rawInput);
  if (input.action !== "finalize_pickup" && input.action !== "finalize_delivery") {
    commerceError("VALIDATION_ERROR", "A final handoff action is required.");
  }
  const next = input.action === "finalize_pickup" ? "PICKED_UP" : "DELIVERED";
  return merchantMutation(reference, "ORDER_MANAGE", input, async (transaction, actor, order, now) => {
    assertOperationalStore(order);
    assertExpectedVersion(order, input.expectedVersion);
    assertOrderPaymentConsistency(order);
    if (order.status !== "CONFIRMED") commerceError("INVALID_TRANSITION", "Order is not confirmed.");
    assertFulfillmentTransition(order.fulfillmentMethod, order.fulfillmentStatus, next);
    assertPaymentTransition(order.paymentStatus, "PAID");
    assertOrderTransition(order.status, "COMPLETED");
    await transaction.payment.update({
      where: { orderId: order.id },
      data: {
        paidAt: now,
        recordedById: actor.personId,
        recordedByType: "MERCHANT",
        status: "PAID",
      },
    });
    await transaction.order.update({
      where: { id: order.id },
      data: {
        completedAt: now,
        fulfillmentStatus: next,
        paymentStatus: "PAID",
        status: "COMPLETED",
      },
    });
    return finishMerchantTransition(transaction, actor, order, input, {
      action: `commerce.order.${input.action}`,
      newFulfillmentStatus: next,
      newOrderStatus: "COMPLETED",
      newPaymentStatus: "PAID",
      notify: next === "PICKED_UP" ? "order.picked_up" : "order.delivered",
    });
  });
}

export async function cancelMerchantOrder(
  reference: MerchantActorReference,
  rawInput: MerchantOrderCancellationInput,
) {
  const parsed = merchantOrderCancellationSchema.safeParse(rawInput);
  if (!parsed.success) commerceError("VALIDATION_ERROR", "Merchant Order cancellation input is invalid.");
  const input = withHash(parsed.data, {
    action: "merchant_cancel",
    requestedFulfillmentStatus: "CANCELLED",
    requestedOrderStatus: "CANCELLED",
    requestedPaymentStatus: "VOIDED",
  });
  return merchantMutation(reference, "ORDER_CANCEL", input, async (transaction, actor, order, now) => {
    assertOperationalStore(order);
    const expired = await expireIfOverdue(transaction, order, now, input, merchantScope(actor));
    if (expired) return expired;
    assertExpectedVersion(order, input.expectedVersion);
    assertOrderPaymentConsistency(order);
    if (order.fulfillmentStatus === "OUT_FOR_DELIVERY") {
      commerceError("INVALID_TRANSITION", "Report delivery failure before cancelling physical stock in transit.");
    }
    if (order.fulfillmentStatus === "DELIVERY_FAILED" && !input.returnedStock) {
      commerceError("VALIDATION_ERROR", "Delivery-failure cancellation requires confirmed stock return.");
    }
    if (order.fulfillmentStatus !== "DELIVERY_FAILED" && input.returnedStock) {
      commerceError("VALIDATION_ERROR", "Stock-return confirmation is allowed only after delivery failure.");
    }
    assertMerchantCancellationAllowed({
      fulfillmentStatus: order.fulfillmentStatus,
      orderStatus: order.status,
      reason: input.reason,
    });
    if (order.paymentStatus === "PAID") commerceError("INVALID_TRANSITION", "Paid Orders cannot be cancelled.");
    if (order.status === "PENDING") {
      await releaseReservations(transaction, order, {
        actorId: actor.personId,
        actorType: "MERCHANT",
        now,
        reason: input.reason,
        status: "RELEASED",
      });
    } else {
      await restockConsumedReservations(transaction, order, {
        actorId: actor.personId,
        actorType: "MERCHANT",
        reason: input.reason,
      });
    }
    await voidUnpaidPayment(transaction, order, now);
    await transaction.order.update({
      where: { id: order.id },
      data: {
        cancellationReason: input.reason,
        cancelledAt: now,
        fulfillmentStatus: "CANCELLED",
        paymentStatus: "VOIDED",
        status: "CANCELLED",
      },
    });
    return finishMerchantTransition(transaction, actor, order, input, {
      action: "commerce.order.cancel",
      newFulfillmentStatus: "CANCELLED",
      newOrderStatus: "CANCELLED",
      newPaymentStatus: "VOIDED",
      notify: "order.cancelled",
      reason: input.reason,
    });
  });
}

export async function cancelCustomerOrder(
  customerId: string,
  rawInput: CustomerOrderCancellationInput,
) {
  const parsed = customerOrderCancellationSchema.safeParse(rawInput);
  if (!parsed.success) commerceError("VALIDATION_ERROR", "Customer Order cancellation input is invalid.");
  const input = withHash(parsed.data, {
    action: "customer_cancel",
    requestedFulfillmentStatus: "CANCELLED",
    requestedOrderStatus: "CANCELLED",
    requestedPaymentStatus: "VOIDED",
  });
  return runCommerceSerializable(async (transaction) => {
    const customer = await requireActiveCommerceCustomer(customerId, transaction);
    const scope: CustomerScope = { actorId: customer.personId, actorType: "CUSTOMER", customerId: customer.personId };
    const replay = await resolveTransitionReplay(transaction, { ...input, scope });
    if (replay) return replay;
    await lockOrder(transaction, input.orderId);
    const order = await transaction.order.findFirst({
      where: { customerId: customer.personId, id: input.orderId },
      include: mutationOrderInclude,
    });
    if (!order) commerceError("NOT_FOUND", "Order was not found.");
    const now = new Date();
    assertOperationalStore(order);
    const expired = await expireIfOverdue(transaction, order, now, input, scope);
    if (expired) return expired;
    assertExpectedVersion(order, input.expectedVersion);
    assertOrderPaymentConsistency(order);
    assertCustomerCancellationAllowed({
      fulfillmentStatus: order.fulfillmentStatus,
      orderStatus: order.status,
      reason: input.reason,
    });
    if (order.paymentStatus === "PAID") commerceError("ORDER_NOT_CANCELLABLE", "Paid Orders cannot be cancelled.");
    if (order.status === "PENDING") {
      await releaseReservations(transaction, order, {
        actorId: customer.personId,
        actorType: "CUSTOMER",
        now,
        reason: input.reason,
        status: "RELEASED",
      });
    } else {
      await restockConsumedReservations(transaction, order, {
        actorId: customer.personId,
        actorType: "CUSTOMER",
        reason: input.reason,
      });
    }
    await voidUnpaidPayment(transaction, order, now);
    await transaction.order.update({
      where: { id: order.id },
      data: {
        cancellationReason: input.reason,
        cancelledAt: now,
        fulfillmentStatus: "CANCELLED",
        paymentStatus: "VOIDED",
        status: "CANCELLED",
      },
    });
    const result = await loadTransitionResult(transaction, order.id);
    await createHistory(transaction, order, input, scope, result, {
      newFulfillmentStatus: "CANCELLED",
      newOrderStatus: "CANCELLED",
      newPaymentStatus: "VOIDED",
      reason: input.reason,
    });
    await notifyCustomerCancellation(transaction, order.id);
    return result;
  });
}

export async function expirePendingOrder(
  orderId: string,
  now = new Date(),
) {
  return runCommerceSerializable((transaction) => expirePendingOrderInTransaction(transaction, orderId, now));
}

export async function expirePendingOrderInTransaction(
  transaction: Transaction,
  orderId: string,
  now: Date,
) {
  await lockOrder(transaction, orderId);
  const order = await transaction.order.findUnique({ where: { id: orderId }, include: mutationOrderInclude });
  if (!order || order.status !== "PENDING" || order.reservationExpiresAt > now) return null;
  assertOperationalStore(order);
  const expectedVersion = order.updatedAt.toISOString();
  const input = withHash({
    expectedVersion,
    idempotencyKey: deterministicUuid(`commerce-order-expire:${order.id}`),
    orderId: order.id,
  }, {
    action: "system_expire",
    requestedFulfillmentStatus: "CANCELLED",
    requestedOrderStatus: "EXPIRED",
    requestedPaymentStatus: "VOIDED",
  });
  const replay = await resolveTransitionReplay(transaction, { ...input, scope: { actorType: "SYSTEM" } });
  if (replay) return replay;
  return expireLockedOrder(transaction, order, now, input, { actorType: "SYSTEM" });
}

async function merchantMutation<T extends ReplayEnvelope>(
  reference: MerchantActorReference,
  permission: "ORDER_MANAGE" | "ORDER_CANCEL",
  input: T,
  operation: (
    transaction: Transaction,
    actor: MerchantCommerceContext,
    order: MutationOrder,
    now: Date,
  ) => Promise<OrderTransitionReplayResult>,
) {
  return runCommerceSerializable(async (transaction) => {
    const actor = await resolveMerchantCommerceContext(reference, permission, transaction);
    const scope = merchantScope(actor);
    const replay = await resolveTransitionReplay(transaction, { ...input, scope });
    if (replay) return replay;
    await lockOrder(transaction, input.orderId);
    const order = await transaction.order.findFirst({
      where: { id: input.orderId, store: { organizationId: actor.organizationId } },
      include: mutationOrderInclude,
    });
    if (!order) commerceError("NOT_FOUND", "Order was not found.");
    await assertMerchantCommerceContextCurrent(transaction, actor, permission);
    return operation(transaction, actor, order, new Date());
  });
}

async function finishMerchantTransition(
  transaction: Transaction,
  actor: MerchantCommerceContext,
  order: MutationOrder,
  input: ReplayEnvelope,
  policy: {
    action: string;
    newFulfillmentStatus?: FulfillmentStatus;
    newOrderStatus?: CommerceOrderStatus;
    newPaymentStatus?: PaymentStatus;
    notify?: Parameters<typeof notifyCustomerOrderEvent>[2];
    reason?: string | null;
  },
) {
  const result = await loadTransitionResult(transaction, order.id);
  await createHistory(transaction, order, input, merchantScope(actor), result, policy);
  await transaction.businessAuditLog.create({
    data: {
      action: policy.action,
      actorMembershipId: actor.membershipId,
      actorPersonId: actor.personId,
      after: auditState(result, policy.reason),
      before: auditState(order, policy.reason),
      organizationId: actor.organizationId,
      targetId: order.id,
      targetType: "Order",
    },
  });
  if (policy.notify) await notifyCustomerOrderEvent(transaction, order.id, policy.notify);
  return result;
}

async function createHistory(
  transaction: Transaction,
  order: MutationOrder,
  input: ReplayEnvelope,
  scope: ReplayScope,
  result: OrderTransitionReplayResult,
  policy: {
    ledgerActorType?: OrderActorType;
    newFulfillmentStatus?: FulfillmentStatus;
    newOrderStatus?: CommerceOrderStatus;
    newPaymentStatus?: PaymentStatus;
    reason?: string | null;
  },
) {
  const ledgerActorType = policy.ledgerActorType ?? scope.actorType;
  await transaction.orderStatusHistory.create({
    data: {
      actorId: ledgerActorType === "SYSTEM" || scope.actorType === "SYSTEM" ? undefined : scope.actorId,
      actorType: ledgerActorType,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        expectedVersion: input.expectedVersion,
        gate: "stage3c",
        ...(scope.actorType === "MERCHANT" ? { membershipId: scope.membershipId } : {}),
        replayActorId: scope.actorType === "SYSTEM" ? null : scope.actorId,
        replayActorType: scope.actorType,
        requestHash: input.requestHash,
        result,
        resultVersion: result.updatedAt,
      },
      newFulfillmentStatus: policy.newFulfillmentStatus,
      newOrderStatus: policy.newOrderStatus,
      newPaymentStatus: policy.newPaymentStatus,
      orderId: order.id,
      previousFulfillmentStatus: policy.newFulfillmentStatus ? order.fulfillmentStatus : undefined,
      previousOrderStatus: policy.newOrderStatus ? order.status : undefined,
      previousPaymentStatus: policy.newPaymentStatus ? order.paymentStatus : undefined,
      reason: policy.reason,
    },
  });
}

async function resolveTransitionReplay(
  transaction: Transaction,
  input: ScopedReplayEnvelope,
): Promise<OrderTransitionReplayResult | null> {
  const existing = await transaction.orderStatusHistory.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: {
      actorId: true,
      actorType: true,
      metadata: true,
      orderId: true,
      order: { select: { customerId: true, store: { select: { organizationId: true } } } },
    },
  });
  if (!existing) return null;
  const metadata = jsonObject(existing.metadata);
  const replayActorType = metadata.replayActorType;
  const replayActorId = metadata.replayActorId;
  if (
    (input.scope.actorType === "MERCHANT" && existing.order.store.organizationId !== input.scope.organizationId) ||
    (input.scope.actorType === "CUSTOMER" && existing.order.customerId !== input.scope.customerId)
  ) {
    commerceError("NOT_FOUND", "Order was not found.");
  }
  if (
    existing.orderId !== input.orderId ||
    metadata.gate !== "stage3c" ||
    metadata.requestHash !== input.requestHash ||
    metadata.expectedVersion !== input.expectedVersion ||
    replayActorType !== input.scope.actorType ||
    (input.scope.actorType !== "SYSTEM" && replayActorId !== input.scope.actorId) ||
    (input.scope.actorType === "MERCHANT" && metadata.membershipId !== input.scope.membershipId)
  ) {
    commerceError("IDEMPOTENCY_CONFLICT", "Order transition key was already used in another scope.");
  }
  const result = replayResult(metadata.result);
  if (!result || metadata.resultVersion !== result.updatedAt) {
    commerceError("CONFLICT", "Order transition replay result is unavailable.");
  }
  return result;
}

async function expireIfOverdue(
  transaction: Transaction,
  order: MutationOrder,
  now: Date,
  input: ReplayEnvelope,
  triggerScope: MerchantScope | CustomerScope,
) {
  if (order.status !== "PENDING" || order.reservationExpiresAt > now) return null;
  return expireLockedOrder(transaction, order, now, input, triggerScope);
}

async function expireLockedOrder(
  transaction: Transaction,
  order: MutationOrder,
  now: Date,
  input: ReplayEnvelope,
  replayScope: ReplayScope,
) {
  await releaseReservations(transaction, order, {
    actorType: "SYSTEM",
    now,
    reason: "PENDING_RESERVATION_EXPIRED",
    status: "EXPIRED",
  });
  await voidUnpaidPayment(transaction, order, now);
  await transaction.order.update({
    where: { id: order.id },
    data: {
      cancelledAt: now,
      fulfillmentStatus: "CANCELLED",
      paymentStatus: "VOIDED",
      status: "EXPIRED",
    },
  });
  const result = await loadTransitionResult(transaction, order.id);
  await createHistory(transaction, order, input, replayScope, result, {
    ledgerActorType: "SYSTEM",
    newFulfillmentStatus: "CANCELLED",
    newOrderStatus: "EXPIRED",
    newPaymentStatus: "VOIDED",
    reason: "PENDING_RESERVATION_EXPIRED",
  });
  await notifyOrderExpired(transaction, order.id);
  return result;
}

async function consumeReservations(
  transaction: Transaction,
  order: MutationOrder,
  actorId: string,
  now: Date,
) {
  assertReservationCompleteness(order, "ACTIVE");
  await lockInventoryItems(transaction, order.reservations.map((item) => item.inventoryItemId));
  const inventories = await lockedInventoryMap(transaction, order.reservations.map((item) => item.inventoryItemId));
  for (const reservation of order.reservations) {
    if (reservation.status !== "ACTIVE" || reservation.expiresAt <= now) {
      commerceError("INVENTORY_CONFLICT", "Order reservation is no longer active.");
    }
    const inventory = inventories.get(reservation.inventoryItemId);
    if (
      !inventory ||
      inventory.variantId !== reservation.productVariantId ||
      inventory.onHand < reservation.quantity ||
      inventory.reserved < reservation.quantity
    ) {
      commerceError("INVENTORY_CONFLICT", "Inventory cannot consume this reservation.");
    }
    if (inventory.version >= POSTGRES_INT_MAX) commerceError("INVENTORY_CONFLICT", "Inventory version is exhausted.");
    const resultingOnHand = inventory.onHand - reservation.quantity;
    const resultingReserved = inventory.reserved - reservation.quantity;
    await transaction.inventoryReservation.update({
      where: { id: reservation.id },
      data: { consumedAt: now, status: "CONSUMED" },
    });
    await transaction.inventoryItem.update({
      where: { id: inventory.id },
      data: { onHand: resultingOnHand, reserved: resultingReserved, version: { increment: 1 } },
    });
    await transaction.stockMovement.create({
      data: {
        actorId,
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
    inventory.onHand = resultingOnHand;
    inventory.reserved = resultingReserved;
    inventory.version += 1;
  }
}

async function releaseReservations(
  transaction: Transaction,
  order: MutationOrder,
  input: {
    actorId?: string;
    actorType: OrderActorType;
    now: Date;
    reason: string;
    status: "EXPIRED" | "RELEASED";
  },
) {
  assertReservationCompleteness(order, "ACTIVE");
  await lockInventoryItems(transaction, order.reservations.map((item) => item.inventoryItemId));
  const inventories = await lockedInventoryMap(transaction, order.reservations.map((item) => item.inventoryItemId));
  for (const reservation of order.reservations) {
    const inventory = inventories.get(reservation.inventoryItemId);
    if (
      !inventory ||
      inventory.variantId !== reservation.productVariantId ||
      reservation.status !== "ACTIVE" ||
      inventory.reserved < reservation.quantity
    ) {
      commerceError("INVENTORY_CONFLICT", "Reserved Inventory is inconsistent.");
    }
    if (inventory.version >= POSTGRES_INT_MAX) commerceError("INVENTORY_CONFLICT", "Inventory version is exhausted.");
    const resultingReserved = inventory.reserved - reservation.quantity;
    await transaction.inventoryReservation.update({
      where: { id: reservation.id },
      data: { releasedAt: input.now, status: input.status },
    });
    await transaction.inventoryItem.update({
      where: { id: inventory.id },
      data: { reserved: resultingReserved, version: { increment: 1 } },
    });
    await transaction.stockMovement.create({
      data: {
        actorId: input.actorId,
        actorType: input.actorType,
        idempotencyKey: stockMovementKey({
          action: input.status === "EXPIRED" ? "expire-release" : "release",
          orderId: order.id,
          reservationId: reservation.id,
          variantId: reservation.productVariantId,
        }),
        inventoryItemId: inventory.id,
        onHandDelta: 0,
        orderId: order.id,
        quantity: reservation.quantity,
        reason: input.reason,
        reservationId: reservation.id,
        reservedDelta: -reservation.quantity,
        resultingOnHand: inventory.onHand,
        resultingReserved,
        type: "RELEASE",
      },
    });
    inventory.reserved = resultingReserved;
    inventory.version += 1;
  }
}

async function restockConsumedReservations(
  transaction: Transaction,
  order: MutationOrder,
  input: { actorId: string; actorType: "CUSTOMER" | "MERCHANT"; reason: string },
) {
  assertReservationCompleteness(order, "CONSUMED");
  await lockInventoryItems(transaction, order.reservations.map((item) => item.inventoryItemId));
  const inventories = await lockedInventoryMap(transaction, order.reservations.map((item) => item.inventoryItemId));
  const groups = new Map<string, { inventoryItemId: string; quantity: number; variantId: string }>();
  for (const reservation of order.reservations) {
    if (reservation.status !== "CONSUMED") commerceError("INVENTORY_CONFLICT", "Consumed reservation is missing.");
    const key = `${reservation.inventoryItemId}:${reservation.productVariantId}`;
    const group = groups.get(key) ?? {
      inventoryItemId: reservation.inventoryItemId,
      quantity: 0,
      variantId: reservation.productVariantId,
    };
    group.quantity += reservation.quantity;
    groups.set(key, group);
  }
  for (const group of [...groups.values()].sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId))) {
    const inventory = inventories.get(group.inventoryItemId);
    if (!inventory || inventory.variantId !== group.variantId) {
      commerceError("INVENTORY_CONFLICT", "Inventory item is missing for restock.");
    }
    if (inventory.version >= POSTGRES_INT_MAX) commerceError("INVENTORY_CONFLICT", "Inventory version is exhausted.");
    let resultingOnHand: number;
    try {
      resultingOnHand = assertInventoryInteger(inventory.onHand + group.quantity, "resultingOnHand");
    } catch {
      commerceError("INVENTORY_CONFLICT", "Inventory restock exceeds persistence capacity.");
    }
    await transaction.inventoryItem.update({
      where: { id: inventory.id },
      data: { onHand: resultingOnHand, version: { increment: 1 } },
    });
    await transaction.stockMovement.create({
      data: {
        actorId: input.actorId,
        actorType: input.actorType,
        idempotencyKey: stockMovementKey({
          action: "cancel-restock",
          orderId: order.id,
          variantId: group.variantId,
        }),
        inventoryItemId: inventory.id,
        onHandDelta: group.quantity,
        orderId: order.id,
        quantity: group.quantity,
        reason: input.reason,
        reservedDelta: 0,
        resultingOnHand,
        resultingReserved: inventory.reserved,
        type: "RESTOCK",
      },
    });
    inventory.onHand = resultingOnHand;
    inventory.version += 1;
  }
}

async function lockedInventoryMap(transaction: Transaction, ids: string[]) {
  const rows = await transaction.inventoryItem.findMany({ where: { id: { in: [...new Set(ids)] } } });
  return new Map(rows.map((item) => [item.id, item]));
}

function assertReservationCompleteness(order: MutationOrder, status: "ACTIVE" | "CONSUMED") {
  const items = new Map(order.items.map((item) => [item.id, item]));
  if (
    items.size === 0 ||
    order.items.some((item) => !item.productVariantId) ||
    order.reservations.length !== items.size ||
    order.reservations.some((reservation) => {
      const item = items.get(reservation.orderItemId);
      return reservation.status !== status ||
        !item ||
        item.productVariantId !== reservation.productVariantId ||
        item.quantity !== reservation.quantity;
    }) ||
    new Set(order.reservations.map((reservation) => reservation.orderItemId)).size !== items.size
  ) {
    commerceError("INVENTORY_CONFLICT", `Order ${status.toLowerCase()} reservation set is incomplete.`);
  }
}

function assertOperationalStore(order: MutationOrder) {
  if (order.store.archivedAt || (order.store.status !== "ACTIVE" && order.store.status !== "SUSPENDED")) {
    commerceError("CONFLICT", "A nonterminal Order exists under a non-operational Store.", {
      kind: "ORDER_STORE_INTEGRITY",
    });
  }
}

function assertExpectedVersion(order: { updatedAt: Date }, expectedVersion: string) {
  if (order.updatedAt.toISOString() !== expectedVersion) {
    commerceError("STALE_VERSION", "Order changed. Refresh and retry.");
  }
}

function assertOrderPaymentConsistency(order: MutationOrder) {
  const payment = order.payment;
  if (
    !payment ||
    !payment.amount.equals(order.grandTotal) ||
    payment.currency !== order.currency ||
    payment.method !== order.paymentMethod ||
    payment.status !== order.paymentStatus
  ) {
    commerceError("CONFLICT", "Order and Payment aggregate is inconsistent.", {
      kind: "ORDER_PAYMENT_INTEGRITY",
    });
  }
}

async function voidUnpaidPayment(transaction: Transaction, order: MutationOrder, now: Date) {
  if (!order.payment || order.payment.status !== "UNPAID" || order.paymentStatus !== "UNPAID") {
    commerceError("INVALID_TRANSITION", "Only an unpaid offline Payment can be voided.");
  }
  await transaction.payment.update({
    where: { orderId: order.id },
    data: { status: "VOIDED", voidedAt: now },
  });
}

async function loadTransitionResult(transaction: Transaction, orderId: string) {
  const order = await transaction.order.findUniqueOrThrow({
    where: { id: orderId },
    include: transitionOrderInclude,
  });
  return orderTransitionResult(order);
}

function parseDecision(rawInput: MerchantOrderDecisionInput, expected: "confirm" | "reject") {
  const parsed = merchantOrderDecisionSchema.safeParse(rawInput);
  if (!parsed.success || parsed.data.action !== expected) {
    commerceError("VALIDATION_ERROR", "Merchant Order decision input is invalid.");
  }
  return withHash(parsed.data, {
    action: parsed.data.action,
    requestedFulfillmentStatus: parsed.data.action === "reject" ? "CANCELLED" : null,
    requestedOrderStatus: parsed.data.action === "confirm" ? "CONFIRMED" : "REJECTED",
    requestedPaymentStatus: parsed.data.action === "reject" ? "VOIDED" : null,
  });
}

function parseFulfillment(rawInput: MerchantOrderFulfillmentInput) {
  const parsed = merchantOrderFulfillmentSchema.safeParse(rawInput);
  if (!parsed.success) commerceError("VALIDATION_ERROR", "Merchant Order fulfillment input is invalid.");
  const target = fulfillmentTarget(parsed.data.action);
  const final = parsed.data.action === "finalize_pickup" || parsed.data.action === "finalize_delivery";
  return withHash(parsed.data, {
    action: parsed.data.action,
    requestedFulfillmentStatus: target,
    requestedOrderStatus: final ? "COMPLETED" : null,
    requestedPaymentStatus: final ? "PAID" : null,
  });
}

function withHash<T extends {
  expectedVersion: string;
  idempotencyKey: string;
  orderId: string;
  reason?: string;
  returnedStock?: boolean;
}>(
  value: T,
  requested: {
    action: string;
    requestedFulfillmentStatus?: string | null;
    requestedOrderStatus?: string | null;
    requestedPaymentStatus?: string | null;
  },
) {
  return {
    ...value,
    requestHash: orderMutationRequestHash({
      ...requested,
      expectedVersion: value.expectedVersion,
      orderId: value.orderId,
      reason: value.reason,
      returnedStock: value.returnedStock,
    }),
  };
}

function fulfillmentTarget(action: MerchantOrderFulfillmentInput["action"]): FulfillmentStatus {
  const targets: Record<MerchantOrderFulfillmentInput["action"], FulfillmentStatus> = {
    delivery_failed: "DELIVERY_FAILED",
    finalize_delivery: "DELIVERED",
    finalize_pickup: "PICKED_UP",
    out_for_delivery: "OUT_FOR_DELIVERY",
    ready_for_pickup: "READY_FOR_PICKUP",
    retry_delivery: "OUT_FOR_DELIVERY",
    start_preparing: "PREPARING",
  };
  return targets[action];
}

function fulfillmentNotification(status: FulfillmentStatus) {
  if (status === "PREPARING") return "order.preparing" as const;
  if (status === "READY_FOR_PICKUP") return "order.ready_for_pickup" as const;
  if (status === "OUT_FOR_DELIVERY") return "order.out_for_delivery" as const;
  if (status === "DELIVERY_FAILED") return "order.delivery_failed" as const;
  return undefined;
}

function merchantScope(actor: MerchantCommerceContext): MerchantScope {
  return {
    actorId: actor.personId,
    actorType: "MERCHANT",
    membershipId: actor.membershipId,
    organizationId: actor.organizationId,
  };
}

function deterministicUuid(value: string) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function auditState(value: {
  fulfillmentStatus: string;
  orderNumber?: string;
  paymentStatus: string;
  status: string;
}, reason?: string | null) {
  return {
    fulfillmentStatus: value.fulfillmentStatus,
    orderNumber: value.orderNumber,
    paymentStatus: value.paymentStatus,
    reason: reason ?? null,
    status: value.status,
  };
}

function jsonObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function replayResult(value: Prisma.JsonValue | undefined): OrderTransitionReplayResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, Prisma.JsonValue>;
  if (
    typeof item.id !== "string" ||
    typeof item.orderNumber !== "string" ||
    typeof item.status !== "string" ||
    typeof item.fulfillmentStatus !== "string" ||
    typeof item.paymentStatus !== "string" ||
    typeof item.updatedAt !== "string" ||
    !Array.isArray(item.reservations)
  ) return null;
  return value as unknown as OrderTransitionReplayResult;
}
