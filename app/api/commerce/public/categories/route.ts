import type { NextRequest } from "next/server";

import { listPublicCategories } from "@/features/commerce/public/catalog-service";
import { handlePublicCommerceRequest } from "@/features/commerce/public/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handlePublicCommerceRequest(request, "categories", async () => ({
    data: await listPublicCategories(),
    pageInfo: { hasNextPage: false, nextCursor: null },
  }));
}
