import type { NextRequest } from "next/server";

import { serializeCustomerOrderSummary } from "@/features/commerce/api/dto";
import { commerceCollection, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseCustomerOrderQuery } from "@/features/commerce/api/validation";
import { listCustomerOrders } from "@/features/commerce/services/customer-order-query-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "orders.read", async ({ personId }) => {
    const result = await listCustomerOrders(personId, parseCustomerOrderQuery(request.nextUrl.searchParams));
    return commerceCollection(result.data.map(serializeCustomerOrderSummary), result.pageInfo);
  }, { limit: 60 });
}
