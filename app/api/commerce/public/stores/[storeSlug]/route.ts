import type { NextRequest } from "next/server";

import { getPublicStore } from "@/features/commerce/public/catalog-service";
import { handlePublicCommerceRequest } from "@/features/commerce/public/http";
import { parsePublicSlug } from "@/features/commerce/public/query-validation";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeSlug: string }> },
) {
  return handlePublicCommerceRequest(
    request,
    "store-detail",
    async () => {
      const value = await params;
      return { data: await getPublicStore(parsePublicSlug(value.storeSlug, "storeSlug")) };
    },
    { limit: 120 },
  );
}
