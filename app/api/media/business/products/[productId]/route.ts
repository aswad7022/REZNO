import type { NextRequest } from "next/server";
import { mediaAttach, mediaGet, mediaRouteResponse } from "@/features/media/api/http";
import { mediaRouteUuid } from "@/features/media/api/validation";

type Context = { params: Promise<{ productId: string }> };
async function target(context: Context) { return { kind: "PRODUCT", productId: mediaRouteUuid((await context.params).productId, "productId") } as const; }
export async function GET(request: NextRequest, context: Context) { return mediaRouteResponse("product.route", async () => mediaGet(request, "business", await target(context))); }
export async function POST(request: NextRequest, context: Context) { return mediaRouteResponse("product.route", async () => mediaAttach(request, "business", await target(context))); }
