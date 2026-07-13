import type { NextRequest } from "next/server";

import { commerceCollection, commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseFavoriteQuery, parseFavoriteTarget } from "@/features/commerce/api/validation";
import { addFavoriteStore, listFavoriteStores } from "@/features/commerce/services/customer-favorite-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "favorites.stores.read", async ({ personId }) => {
    const result = await listFavoriteStores(personId, parseFavoriteQuery(request.nextUrl.searchParams));
    return commerceCollection(result.data, result.pageInfo);
  }, { limit: 60 });
}

export function POST(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "favorites.stores.mutate", async ({ personId }) =>
    commerceData(await addFavoriteStore(personId, await parseFavoriteTarget(request, "storeId"))),
  { limit: 30 });
}
