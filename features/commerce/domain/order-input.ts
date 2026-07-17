import { z } from "zod";

import { hashCheckoutRequest } from "@/features/commerce/domain/idempotency";

const uuid = z.string().uuid();
const version = z.string().datetime({ offset: true });
const reason = z.string().trim().min(2).max(500).transform((value) => value.replace(/\s+/g, " "));

const envelope = z.object({
  expectedVersion: version,
  idempotencyKey: uuid,
  orderId: uuid,
}).strict();

export const merchantOrderDecisionSchema = envelope.extend({
  action: z.enum(["confirm", "reject"]),
  reason: reason.optional(),
}).strict().superRefine((value, context) => {
  if (value.action === "reject" && !value.reason) {
    context.addIssue({ code: "custom", message: "Rejection requires a reason.", path: ["reason"] });
  }
  if (value.action === "confirm" && value.reason) {
    context.addIssue({ code: "custom", message: "Confirmation must not include a reason.", path: ["reason"] });
  }
});

export const merchantOrderFulfillmentSchema = envelope.extend({
  action: z.enum([
    "start_preparing",
    "ready_for_pickup",
    "out_for_delivery",
    "delivery_failed",
    "retry_delivery",
    "finalize_pickup",
    "finalize_delivery",
  ]),
  reason: reason.optional(),
}).strict().superRefine((value, context) => {
  if (value.action === "delivery_failed" && !value.reason) {
    context.addIssue({ code: "custom", message: "Delivery failure requires a reason.", path: ["reason"] });
  }
  if (value.action !== "delivery_failed" && value.reason) {
    context.addIssue({ code: "custom", message: "This transition must not include a reason.", path: ["reason"] });
  }
});

export const merchantOrderCancellationSchema = envelope.extend({
  reason,
  returnedStock: z.boolean(),
}).strict();

export const customerOrderCancellationSchema = envelope.extend({ reason }).strict();

export type MerchantOrderDecisionInput = z.input<typeof merchantOrderDecisionSchema>;
export type MerchantOrderFulfillmentInput = z.input<typeof merchantOrderFulfillmentSchema>;
export type MerchantOrderCancellationInput = z.input<typeof merchantOrderCancellationSchema>;
export type CustomerOrderCancellationInput = z.input<typeof customerOrderCancellationSchema>;
export type MerchantOrderAction =
  | MerchantOrderDecisionInput["action"]
  | MerchantOrderFulfillmentInput["action"]
  | "cancel";

export function orderMutationRequestHash(value: {
  action: string;
  expectedVersion: string;
  orderId: string;
  reason?: string | null;
  requestedFulfillmentStatus?: string | null;
  requestedOrderStatus?: string | null;
  requestedPaymentStatus?: string | null;
  returnedStock?: boolean;
}) {
  return hashCheckoutRequest({
    action: value.action,
    expectedVersion: value.expectedVersion,
    orderId: value.orderId,
    reason: value.reason ?? null,
    requestedFulfillmentStatus: value.requestedFulfillmentStatus ?? null,
    requestedOrderStatus: value.requestedOrderStatus ?? null,
    requestedPaymentStatus: value.requestedPaymentStatus ?? null,
    returnedStock: value.returnedStock ?? false,
  });
}
