import type {
  CommerceOrderStatus,
  FulfillmentMethod,
  FulfillmentStatus,
  PaymentStatus,
} from "@prisma/client";

import {
  publicQueryFingerprint,
} from "@/features/commerce/public/cursor";

export interface CustomerOrderQuery {
  cursor?: string;
  fulfillmentMethod?: FulfillmentMethod;
  fulfillmentStatus?: FulfillmentStatus;
  limit: number;
  paymentStatus?: PaymentStatus;
  sort: "newest" | "oldest";
  status?: CommerceOrderStatus;
  storeSlug?: string;
}

export function customerOrderFingerprint(
  customerId: string,
  query: CustomerOrderQuery,
) {
  return publicQueryFingerprint({
    customerId,
    fulfillmentMethod: query.fulfillmentMethod,
    fulfillmentStatus: query.fulfillmentStatus,
    paymentStatus: query.paymentStatus,
    scope: "customer-orders",
    sort: query.sort,
    status: query.status,
    storeSlug: query.storeSlug,
  });
}
