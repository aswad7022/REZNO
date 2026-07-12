import type { NextRequest } from "next/server";

import { commerceCollection, commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseFavoriteQuery, parseFavoriteTarget } from "@/features/commerce/api/validation";
import { addFavoriteProduct, listFavoriteProducts } from "@/features/commerce/services/customer-favorite-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "favorites.products.read", async ({ personId }) => {
    const result = await listFavoriteProducts(personId, parseFavoriteQuery(request.nextUrl.searchParams));
    return commerceCollection(result.data, result.pageInfo);
  }, { limit: 60 });
}

export function POST(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "favorites.products.mutate", async ({ personId }) =>
    commerceData(await addFavoriteProduct(personId, await parseFavoriteTarget(request, "productId"))),
  { limit: 30 });
}
