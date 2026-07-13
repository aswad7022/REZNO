import type { NextRequest } from "next/server";

import { serializeCustomerOrderDetail } from "@/features/commerce/api/dto";
import { commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseRouteUuid } from "@/features/commerce/api/validation";
import { getCustomerOrderDetail } from "@/features/commerce/services/customer-order-query-service";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  return handleCustomerCommerceRequest(request, "orders.read", async ({ personId }) => {
    const orderId = parseRouteUuid((await params).orderId, "orderId");
    return commerceData(serializeCustomerOrderDetail(await getCustomerOrderDetail(personId, orderId)));
  }, { limit: 120 });
}
