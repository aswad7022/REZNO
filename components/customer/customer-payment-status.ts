import type { PaymentIntentStatus } from "@prisma/client";

export type CustomerPaymentTone = "error" | "info" | "success" | "warning";

export function customerPaymentTone(
  status: PaymentIntentStatus,
): CustomerPaymentTone {
  if (status === "CAPTURED" || status === "REFUNDED") {
    return "success";
  }
  if (status === "FAILED" || status === "CANCELLED" || status === "EXPIRED") {
    return "error";
  }
  if (
    status === "PARTIALLY_CAPTURED"
    || status === "PARTIALLY_REFUNDED"
    || status === "REQUIRES_ACTION"
    || status === "PROCESSING"
  ) {
    return "warning";
  }
  return "info";
}
