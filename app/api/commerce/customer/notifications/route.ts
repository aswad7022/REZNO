import type { NextRequest } from "next/server";

import { commerceCollection, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseFavoriteQuery } from "@/features/commerce/api/validation";
import { listCustomerNotifications } from "@/features/commerce/services/customer-notification-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "notifications.read", async ({ personId }) => {
    const result = await listCustomerNotifications(
      personId,
      parseFavoriteQuery(request.nextUrl.searchParams),
    );
    return commerceCollection(result.data, result.pageInfo);
  }, { limit: 60 });
}
