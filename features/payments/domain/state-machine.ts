import type {
  PaymentAttemptStatus,
  PaymentIntentStatus,
  PaymentRefundStatus,
  PaymentStatus,
} from "@prisma/client";

import { paymentError } from "./errors";

const INTENT_TRANSITIONS: Readonly<Record<PaymentIntentStatus, readonly PaymentIntentStatus[]>> = {
  CREATED: ["PROCESSING", "REQUIRES_ACTION", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED", "EXPIRED"],
  REQUIRES_ACTION: ["PROCESSING", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED", "EXPIRED"],
  PROCESSING: ["REQUIRES_ACTION", "AUTHORIZED", "PARTIALLY_CAPTURED", "CAPTURED", "FAILED", "CANCELLED", "EXPIRED"],
  AUTHORIZED: ["PROCESSING", "PARTIALLY_CAPTURED", "CAPTURED", "CANCELLED", "EXPIRED"],
  PARTIALLY_CAPTURED: ["PROCESSING", "PARTIALLY_CAPTURED", "CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"],
  CAPTURED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  REFUNDED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

const ATTEMPT_TRANSITIONS: Readonly<Record<PaymentAttemptStatus, readonly PaymentAttemptStatus[]>> = {
  CREATED: ["CLAIMED", "CANCELLED", "EXPIRED"],
  CLAIMED: ["PROCESSING", "CREATED", "FAILED", "CANCELLED", "EXPIRED"],
  PROCESSING: ["REQUIRES_ACTION", "AUTHORIZED", "CAPTURED", "FAILED"],
  REQUIRES_ACTION: ["PROCESSING", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED", "EXPIRED"],
  AUTHORIZED: ["PROCESSING", "CAPTURED", "CANCELLED", "EXPIRED"],
  CAPTURED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

const REFUND_TRANSITIONS: Readonly<Record<PaymentRefundStatus, readonly PaymentRefundStatus[]>> = {
  REQUESTED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: [],
  FAILED: ["PROCESSING", "CANCELLED"],
  CANCELLED: [],
};

export function assertPaymentIntentTransition(from: PaymentIntentStatus, to: PaymentIntentStatus): void {
  if (from === to && (from === "PARTIALLY_CAPTURED" || from === "PARTIALLY_REFUNDED")) return;
  if (!INTENT_TRANSITIONS[from].includes(to)) {
    paymentError("PAYMENT_STATE_CONFLICT", "Payment intent cannot move from " + from + " to " + to + ".");
  }
}

export function assertPaymentAttemptTransition(from: PaymentAttemptStatus, to: PaymentAttemptStatus): void {
  if (!ATTEMPT_TRANSITIONS[from].includes(to)) {
    paymentError("PAYMENT_STATE_CONFLICT", "Payment attempt cannot move from " + from + " to " + to + ".");
  }
}

export function assertPaymentRefundTransition(from: PaymentRefundStatus, to: PaymentRefundStatus): void {
  if (!REFUND_TRANSITIONS[from].includes(to)) {
    paymentError("REFUND_NOT_ALLOWED", "Payment refund cannot move from " + from + " to " + to + ".");
  }
}

interface DecimalLike {
  equals(value: unknown): boolean;
  isZero(): boolean;
}

export function targetPaymentStatus(input: {
  amount: DecimalLike;
  capturedAmount: DecimalLike;
  refundedAmount: DecimalLike;
  status: PaymentIntentStatus;
}): PaymentStatus {
  if (input.refundedAmount.equals(input.capturedAmount) && !input.refundedAmount.isZero()) return "REFUNDED";
  if (!input.refundedAmount.isZero()) return "PARTIALLY_REFUNDED";
  if (input.capturedAmount.equals(input.amount)) return "PAID";
  if ((input.status === "CANCELLED" || input.status === "EXPIRED") && input.capturedAmount.isZero()) return "VOIDED";
  return "UNPAID";
}

export function paymentIntentStatusForTotals(input: {
  amount: DecimalLike;
  capturedAmount: DecimalLike;
  refundedAmount: DecimalLike;
}): PaymentIntentStatus {
  if (!input.refundedAmount.isZero()) {
    return input.refundedAmount.equals(input.capturedAmount) ? "REFUNDED" : "PARTIALLY_REFUNDED";
  }
  if (input.capturedAmount.equals(input.amount)) return "CAPTURED";
  if (!input.capturedAmount.isZero()) return "PARTIALLY_CAPTURED";
  return "PROCESSING";
}
