import type { NextRequest } from "next/server";

import { commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseRouteUuid } from "@/features/commerce/api/validation";
import { removeFavoriteStore } from "@/features/commerce/services/customer-favorite-service";

export const dynamic = "force-dynamic";

export function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> },
) {
  return handleCustomerCommerceRequest(request, "favorites.stores.mutate", async ({ personId }) => {
    const storeId = parseRouteUuid((await params).storeId, "storeId");
    return commerceData(await removeFavoriteStore(personId, storeId));
  }, { limit: 30 });
}
