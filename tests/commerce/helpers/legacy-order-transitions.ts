import type { FulfillmentStatus } from "@prisma/client";

import type { MerchantOrderFulfillmentInput } from "../../../features/commerce/domain/order-input";
import type { MerchantActorReference } from "../../../features/commerce/services/authorization";
import { orderTransitionResult, transitionOrderInclude } from "../../../features/commerce/domain/order-dto";
import {
  advanceOrderFulfillment as advanceOrderFulfillmentStrict,
  cancelCustomerOrder as cancelCustomerOrderStrict,
  confirmOrder as confirmOrderStrict,
  rejectOrder as rejectOrderStrict,
} from "../../../features/commerce/services/order-service";
import { prisma } from "../../../lib/db/prisma";

const legacyEnvelopeCache = new Map<string, Promise<{ expectedVersion: string; idempotencyKey: string }>>();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function confirmOrder(
  reference: MerchantActorReference,
  input: { idempotencyKey: string; orderId: string },
) {
  const envelope = await legacyEnvelope(input.orderId, input.idempotencyKey);
  return confirmOrderStrict(reference, { ...envelope, action: "confirm", orderId: input.orderId });
}

export async function rejectOrder(
  reference: MerchantActorReference,
  input: { idempotencyKey: string; orderId: string; reason: string },
) {
  const envelope = await legacyEnvelope(input.orderId, input.idempotencyKey);
  return rejectOrderStrict(reference, { ...envelope, action: "reject", orderId: input.orderId, reason: input.reason });
}

export async function advanceOrderFulfillment(
  reference: MerchantActorReference,
  input: { idempotencyKey: string; next: FulfillmentStatus; orderId: string; reason?: string },
) {
  const envelope = await legacyEnvelope(input.orderId, input.idempotencyKey);
  const actions: Partial<Record<FulfillmentStatus, MerchantOrderFulfillmentInput["action"]>> = {
    DELIVERY_FAILED: "delivery_failed",
    DELIVERED: "finalize_delivery",
    OUT_FOR_DELIVERY: "out_for_delivery",
    PICKED_UP: "finalize_pickup",
    PREPARING: "start_preparing",
    READY_FOR_PICKUP: "ready_for_pickup",
  };
  const action = actions[input.next];
  if (!action) throw new Error(`Unsupported legacy fulfillment target: ${input.next}`);
  return advanceOrderFulfillmentStrict(reference, {
    ...envelope,
    action,
    orderId: input.orderId,
    ...(action === "delivery_failed" ? { reason: input.reason } : {}),
  });
}

export async function cancelCustomerOrder(
  customerId: string,
  input: { orderId: string; reason: string },
) {
  const envelope = await legacyEnvelope(
    input.orderId,
    `customer:${customerId}:${input.reason.trim().replace(/\s+/g, " ")}`,
  );
  return cancelCustomerOrderStrict(customerId, { ...envelope, orderId: input.orderId, reason: input.reason });
}

export async function recordOfflinePaymentPaid(
  _reference: MerchantActorReference,
  input: { idempotencyKey: string; orderId: string },
) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: input.orderId },
    include: transitionOrderInclude,
  });
  if (order.status !== "COMPLETED" || order.paymentStatus !== "PAID") {
    throw new Error("The final handoff must atomically complete offline payment before this legacy assertion.");
  }
  return orderTransitionResult(order);
}

async function legacyEnvelope(orderId: string, callerKey: string) {
  const cacheKey = `${orderId}:${callerKey}`;
  const cached = legacyEnvelopeCache.get(cacheKey);
  if (cached) return cached;
  const pending = (async () => {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { updatedAt: true },
    });
    return {
      expectedVersion: order.updatedAt.toISOString(),
      idempotencyKey: UUID_PATTERN.test(callerKey) ? callerKey.toLowerCase() : crypto.randomUUID(),
    };
  })();
  legacyEnvelopeCache.set(cacheKey, pending);
  return pending;
}
