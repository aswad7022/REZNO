import type { CommerceCollection, FulfillmentMethod } from "../types/commerce";

export type CheckoutSemanticInput = {
  addressId: string | null;
  cartId: string;
  cartVersion: number;
  customerInstructions: string | null;
  fulfillmentMethod: FulfillmentMethod;
  paymentMethod?: "ONLINE_PROVIDER";
};

export type CheckoutAttempt = { key: string; signature: string };
export type OrderCancellationSemanticInput = {
  expectedVersion: string;
  orderId: string;
  reason: string;
};

export type CheckoutDraft = {
  addressId: string | null;
  attempt: CheckoutAttempt | null;
  cartId: string;
  customerInstructions: string;
  fulfillmentMethod: FulfillmentMethod;
  paymentMethod?: "ONLINE_PROVIDER";
  storeId: string;
};

export type ResourceLoadState = "error" | "idle" | "loading" | "ready";

export function checkoutDraftForCart(
  current: CheckoutDraft | null,
  cart: { id: string; store: { id: string } },
): CheckoutDraft {
  if (current?.cartId === cart.id && current.storeId === cart.store.id) return current;
  return {
    addressId: null,
    attempt: null,
    cartId: cart.id,
    customerInstructions: "",
    fulfillmentMethod: "CUSTOMER_PICKUP",
    storeId: cart.store.id,
  };
}

export function checkoutSemanticSignature(input: CheckoutSemanticInput) {
  return JSON.stringify({
    addressId: input.fulfillmentMethod === "STORE_DELIVERY" ? input.addressId : null,
    cartId: input.cartId,
    cartVersion: input.cartVersion,
    customerInstructions: normalizeInstructions(input.customerInstructions),
    fulfillmentMethod: input.fulfillmentMethod,
    paymentMethod: input.paymentMethod ?? null,
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

export function resolveOrderCancellationAttempt(
  current: CheckoutAttempt | null,
  input: OrderCancellationSemanticInput,
  createKey: () => string,
) {
  const signature = JSON.stringify({
    expectedVersion: input.expectedVersion,
    orderId: input.orderId,
    reason: input.reason.trim().replace(/\s+/g, " "),
  });
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

export function rollbackOptimisticSet(
  current: ReadonlySet<string>,
  id: string,
  optimisticPresent: boolean,
  previousPresent: boolean,
) {
  return current.has(id) === optimisticPresent
    ? optimisticSet(current, id, previousPresent)
    : new Set(current);
}

export function beginKeyedMutation(
  active: Map<string, number>,
  id: string,
  token: number,
) {
  if (active.has(id)) return false;
  active.set(id, token);
  return true;
}

export function finishKeyedMutation(
  active: Map<string, number>,
  id: string,
  token: number,
) {
  if (active.get(id) !== token) return false;
  active.delete(id);
  return true;
}

export function canRenderCustomerCancellation(order: {
  canCustomerCancel: boolean;
  expectedVersion?: string;
  paymentStatus: string;
}) {
  return order.canCustomerCancel && Boolean(order.expectedVersion) && order.paymentStatus !== "PAID";
}

export function isLatestRequest(sequence: number, latest: number) {
  return sequence === latest;
}

export function canApplyResourceSnapshot(
  requestSequence: number,
  latestSequence: number,
  startedRevision: number,
  currentRevision: number,
) {
  return isLatestRequest(requestSequence, latestSequence) && startedRevision === currentRevision;
}

export function canApplyCheckoutCompletion(input: {
  cartRequestIsLatest: boolean;
  currentCart: { id: string | undefined; version: number | undefined };
  latestSubmissionSequence: number;
  mounted: boolean;
  submissionSequence: number;
  submittedCart: { id: string; version: number };
}) {
  return input.mounted
    && isLatestRequest(input.submissionSequence, input.latestSubmissionSequence)
    && input.cartRequestIsLatest
    && input.currentCart.id === input.submittedCart.id
    && input.currentCart.version === input.submittedCart.version;
}

export function resolvedSetMembership(
  current: ReadonlySet<string>,
  id: string,
  state: ResourceLoadState,
) {
  return state === "ready" ? current.has(id) : undefined;
}

export async function collectAllCursorPages<T>(
  loadPage: (cursor?: string) => Promise<CommerceCollection<T>>,
  initialCursor?: string,
): Promise<CommerceCollection<T>> {
  const data: T[] = [];
  const seen = new Set<string>();
  let cursor = initialCursor;
  if (cursor) seen.add(cursor);
  while (true) {
    const page = await loadPage(cursor);
    data.push(...page.data);
    if (!page.pageInfo.hasNextPage) {
      return { data, pageInfo: { hasNextPage: false, nextCursor: null } };
    }
    const nextCursor = page.pageInfo.nextCursor;
    if (!nextCursor || seen.has(nextCursor)) throw new Error("Invalid cursor pagination response");
    seen.add(nextCursor);
    cursor = nextCursor;
  }
}

export function isConfirmedEmptyResource(state: ResourceLoadState, hasData: boolean) {
  return state === "ready" && !hasData;
}

export function hasBackDestination(historyLength: number, exitAvailable: boolean) {
  return historyLength > 0 || exitAvailable;
}
