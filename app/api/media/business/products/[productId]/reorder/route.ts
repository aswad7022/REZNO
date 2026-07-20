import type { NextRequest } from "next/server";
import { mediaReorder, mediaRouteResponse } from "@/features/media/api/http";
import { mediaRouteUuid } from "@/features/media/api/validation";

type Context = { params: Promise<{ productId: string }> };
export async function POST(request: NextRequest, context: Context) {
  return mediaRouteResponse("product.reorder.route", async () => mediaReorder(request, "business", {
    kind: "PRODUCT",
    productId: mediaRouteUuid((await context.params).productId, "productId"),
  }));
}
