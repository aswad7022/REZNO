import type { NextRequest } from "next/server";

import { commerceApiError } from "@/features/commerce/api/errors";
import { commerceData, handleMerchantCommerceRequest } from "@/features/commerce/api/http";
import { parseRouteUuid } from "@/features/commerce/api/validation";
import { getMerchantOrderDetail } from "@/features/commerce/services/merchant-order-query-service";

export const dynamic = "force-dynamic";

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  return handleMerchantCommerceRequest(request, "orders.read", "ORDER_VIEW", async (context) => {
    const orderId = parseRouteUuid((await params).orderId, "orderId");
    const cursor = request.nextUrl.searchParams.get("historyCursor") ?? undefined;
    if (request.nextUrl.searchParams.size > (cursor ? 1 : 0) || (cursor && cursor.length > 2048)) {
      commerceApiError("INVALID_REQUEST", 400, "Invalid Merchant Order history query.");
    }
    const result = await getMerchantOrderDetail({
      contextOrganizationId: context.organizationId,
      membershipId: context.membershipId,
      personId: context.personId,
    }, orderId, cursor);
    return commerceData(result.order);
  }, { limit: 120 });
}
