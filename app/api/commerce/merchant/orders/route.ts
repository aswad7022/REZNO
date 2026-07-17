import type { NextRequest } from "next/server";

import { commerceCollection, handleMerchantCommerceRequest } from "@/features/commerce/api/http";
import { parseMerchantOrderQuery } from "@/features/commerce/api/validation";
import { listMerchantOrders } from "@/features/commerce/services/merchant-order-query-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleMerchantCommerceRequest(request, "orders.read", "ORDER_VIEW", async (context) => {
    const result = await listMerchantOrders({
      contextOrganizationId: context.organizationId,
      membershipId: context.membershipId,
      personId: context.personId,
    }, parseMerchantOrderQuery(request.nextUrl.searchParams));
    return commerceCollection(result.data, result.pageInfo);
  }, { limit: 120 });
}
