import type { FulfillmentMethod } from "../types/commerce";

export type CheckoutSemanticInput = {
  addressId: string | null;
  cartId: string;
  cartVersion: number;
  customerInstructions: string | null;
  fulfillmentMethod: FulfillmentMethod;
};

export type CheckoutAttempt = { key: string; signature: string };

export function checkoutSemanticSignature(input: CheckoutSemanticInput) {
  return JSON.stringify({
    addressId: input.fulfillmentMethod === "STORE_DELIVERY" ? input.addressId : null,
    cartId: input.cartId,
    cartVersion: input.cartVersion,
    customerInstructions: normalizeInstructions(input.customerInstructions),
    fulfillmentMethod: input.fulfillmentMethod,
  });
}

export function resolveCheckoutAttempt(
  current: CheckoutAttempt | null,
  input: CheckoutSemanticInput,
  createKey: () => string,
) {
  const signature = checkoutSemanticSignature(input);
  return current?.signature === signature ? current : { key: createKey(), signature };
}

export function normalizeInstructions(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  return normalized || null;
}

export function optimisticSet(current: ReadonlySet<string>, id: string, present: boolean) {
  const next = new Set(current);
  if (present) next.add(id);
  else next.delete(id);
  return next;
}

export function canRenderCustomerCancellation(order: {
  canCustomerCancel: boolean;
  paymentStatus: string;
}) {
  return order.canCustomerCancel && order.paymentStatus !== "PAID";
}

export function isLatestRequest(sequence: number, latest: number) {
  return sequence === latest;
}
