import type { NextRequest } from "next/server";

import { listPublicProducts } from "@/features/commerce/public/catalog-service";
import { handlePublicCommerceRequest } from "@/features/commerce/public/http";
import { parseProductCollectionQuery } from "@/features/commerce/public/query-validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handlePublicCommerceRequest(request, "products", async () =>
    listPublicProducts(parseProductCollectionQuery(request.nextUrl.searchParams)),
  );
}
