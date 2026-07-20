import type { NextRequest } from "next/server";
import { mediaAlt, mediaDetach, mediaRouteResponse } from "@/features/media/api/http";
import { mediaRouteUuid } from "@/features/media/api/validation";

type Context = { params: Promise<{ bindingId: string; productId: string }> };
async function target(context: Context) { return { kind: "PRODUCT", productId: mediaRouteUuid((await context.params).productId, "productId") } as const; }
export async function DELETE(request: NextRequest, context: Context) { return mediaRouteResponse("product.binding.route", async () => mediaDetach(request, "business", await target(context), (await context.params).bindingId)); }
export async function PATCH(request: NextRequest, context: Context) { return mediaRouteResponse("product.binding.route", async () => mediaAlt(request, "business", await target(context), (await context.params).bindingId)); }
