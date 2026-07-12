import type { NextRequest } from "next/server";

import { listPublicStoreProducts } from "@/features/commerce/public/catalog-service";
import { handlePublicCommerceRequest } from "@/features/commerce/public/http";
import {
  parseProductCollectionQuery,
  parsePublicSlug,
} from "@/features/commerce/public/query-validation";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeSlug: string }> },
) {
  return handlePublicCommerceRequest(request, "store-products", async () => {
    const value = await params;
    const storeSlug = parsePublicSlug(value.storeSlug, "storeSlug");
    const query = parseProductCollectionQuery(request.nextUrl.searchParams, { fixedStore: storeSlug });
    return listPublicStoreProducts(storeSlug, query);
  });
}
