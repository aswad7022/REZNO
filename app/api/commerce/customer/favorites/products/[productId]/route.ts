import type { NextRequest } from "next/server";

import { commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseRouteUuid } from "@/features/commerce/api/validation";
import { removeFavoriteProduct } from "@/features/commerce/services/customer-favorite-service";

export const dynamic = "force-dynamic";

export function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  return handleCustomerCommerceRequest(request, "favorites.products.mutate", async ({ personId }) => {
    const productId = parseRouteUuid((await params).productId, "productId");
    return commerceData(await removeFavoriteProduct(personId, productId));
  }, { limit: 30 });
}
