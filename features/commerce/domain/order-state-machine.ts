import { commerceError } from "./errors";

export type CommerceOrderState =
  | "PENDING"
  | "CONFIRMED"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";
export type CommerceFulfillmentState =
  | "UNFULFILLED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "PICKED_UP"
  | "DELIVERY_FAILED"
  | "CANCELLED";
export type CommercePaymentState = "UNPAID" | "PAID" | "VOIDED";
export type CommerceFulfillmentMethod = "STORE_DELIVERY" | "CUSTOMER_PICKUP";

const ORDER_TRANSITIONS: Readonly<Record<CommerceOrderState, readonly CommerceOrderState[]>> = {
  CANCELLED: [],
  COMPLETED: [],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  EXPIRED: [],
  PENDING: ["CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED"],
  REJECTED: [],
};

const PICKUP_TRANSITIONS: Readonly<Partial<Record<CommerceFulfillmentState, readonly CommerceFulfillmentState[]>>> = {
  PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["PICKED_UP", "CANCELLED"],
  UNFULFILLED: ["PREPARING", "CANCELLED"],
};
const DELIVERY_TRANSITIONS: Readonly<Partial<Record<CommerceFulfillmentState, readonly CommerceFulfillmentState[]>>> = {
  DELIVERY_FAILED: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED", "CANCELLED"],
  PREPARING: ["OUT_FOR_DELIVERY", "CANCELLED"],
  UNFULFILLED: ["PREPARING", "CANCELLED"],
};

export function assertOrderTransition(from: CommerceOrderState, to: CommerceOrderState) {
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    commerceError("INVALID_TRANSITION", `Order cannot transition from ${from} to ${to}.`);
  }
}

export function assertFulfillmentTransition(
  method: CommerceFulfillmentMethod,
  from: CommerceFulfillmentState,
  to: CommerceFulfillmentState,
) {
  const transitions = method === "CUSTOMER_PICKUP" ? PICKUP_TRANSITIONS : DELIVERY_TRANSITIONS;
  if (!(transitions[from] ?? []).includes(to)) {
    commerceError(
      "INVALID_TRANSITION",
      `${method} fulfillment cannot transition from ${from} to ${to}.`,
    );
  }
}

export function assertPaymentTransition(from: CommercePaymentState, to: CommercePaymentState) {
  if (from !== "UNPAID" || (to !== "PAID" && to !== "VOIDED")) {
    commerceError("INVALID_TRANSITION", `Payment cannot transition from ${from} to ${to}.`);
  }
}

export function assertCustomerCancellationAllowed(input: {
  fulfillmentStatus: CommerceFulfillmentState;
  orderStatus: CommerceOrderState;
  reason: string;
}) {
  assertCancellationReason(input.reason);
  if (
    input.orderStatus !== "PENDING" &&
    !(input.orderStatus === "CONFIRMED" && input.fulfillmentStatus === "UNFULFILLED")
  ) {
    commerceError("ORDER_NOT_CANCELLABLE", "The customer can no longer cancel this Order.");
  }
}

export function assertMerchantCancellationAllowed(input: {
  fulfillmentStatus: CommerceFulfillmentState;
  orderStatus: CommerceOrderState;
  reason: string;
}) {
  assertCancellationReason(input.reason);
  if (
    (input.orderStatus !== "PENDING" && input.orderStatus !== "CONFIRMED") ||
    input.fulfillmentStatus === "DELIVERED" ||
    input.fulfillmentStatus === "PICKED_UP"
  ) {
    commerceError("INVALID_TRANSITION", "The merchant can no longer cancel this Order.");
  }
}

export function assertCancellationReason(reason: string) {
  if (reason.trim().length < 2 || reason.trim().length > 500) {
    commerceError("VALIDATION_ERROR", "A cancellation reason between 2 and 500 characters is required.");
  }
}
