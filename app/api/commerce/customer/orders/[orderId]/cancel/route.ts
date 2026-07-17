import type { NextRequest } from "next/server";

import { serializeCustomerOrderDetail } from "@/features/commerce/api/dto";
import { commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import {
  parseCancellationRequest,
  parseIdempotencyKey,
  parseRouteUuid,
} from "@/features/commerce/api/validation";
import { cancelCustomerOrder } from "@/features/commerce/services/order-service";
import { getCustomerOrderDetail } from "@/features/commerce/services/customer-order-query-service";

export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  return handleCustomerCommerceRequest(request, "orders.cancel", async ({ personId }) => {
    const orderId = parseRouteUuid((await params).orderId, "orderId");
    const { expectedVersion, reason } = await parseCancellationRequest(request);
    await cancelCustomerOrder(personId, {
      expectedVersion,
      idempotencyKey: parseIdempotencyKey(request),
      orderId,
      reason,
    });
    return commerceData(serializeCustomerOrderDetail(await getCustomerOrderDetail(personId, orderId)));
  }, { limit: 10 });
}
