import type { NextRequest } from "next/server";

import { serializeCustomerOrderDetail } from "@/features/commerce/api/dto";
import { commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import {
  parseCancellationRequest,
  parseRouteUuid,
} from "@/features/commerce/api/validation";
import { cancelCustomerOrder } from "@/features/commerce/services/order-service";

export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  return handleCustomerCommerceRequest(request, "orders.cancel", async ({ personId }) => {
    const orderId = parseRouteUuid((await params).orderId, "orderId");
    const { reason } = await parseCancellationRequest(request);
    const order = await cancelCustomerOrder(personId, { orderId, reason });
    return commerceData(serializeCustomerOrderDetail(order));
  }, { limit: 10 });
}
