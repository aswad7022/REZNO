import type { NextRequest } from "next/server";

import { listPublicStores } from "@/features/commerce/public/catalog-service";
import { handlePublicCommerceRequest } from "@/features/commerce/public/http";
import { parseStoreCollectionQuery } from "@/features/commerce/public/query-validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handlePublicCommerceRequest(request, "stores", async () => {
    const result = await listPublicStores(parseStoreCollectionQuery(request.nextUrl.searchParams));
    return result;
  });
}
