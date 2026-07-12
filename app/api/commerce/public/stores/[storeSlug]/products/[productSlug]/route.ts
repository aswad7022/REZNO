import type { NextRequest } from "next/server";

import { getPublicProduct } from "@/features/commerce/public/catalog-service";
import { handlePublicCommerceRequest } from "@/features/commerce/public/http";
import { parsePublicSlug } from "@/features/commerce/public/query-validation";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productSlug: string; storeSlug: string }> },
) {
  return handlePublicCommerceRequest(
    request,
    "product-detail",
    async () => {
      const value = await params;
      return {
        data: await getPublicProduct(
          parsePublicSlug(value.storeSlug, "storeSlug"),
          parsePublicSlug(value.productSlug, "productSlug"),
        ),
      };
    },
    { limit: 120 },
  );
}
