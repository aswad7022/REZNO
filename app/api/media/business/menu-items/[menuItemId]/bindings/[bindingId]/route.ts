import type { NextRequest } from "next/server";
import { mediaAlt, mediaDetach, mediaRouteResponse } from "@/features/media/api/http";
import { mediaRouteUuid } from "@/features/media/api/validation";

type Context = { params: Promise<{ bindingId: string; menuItemId: string }> };
async function target(context: Context) { return { kind: "MENU_ITEM", menuItemId: mediaRouteUuid((await context.params).menuItemId, "menuItemId") } as const; }
export async function DELETE(request: NextRequest, context: Context) { return mediaRouteResponse("menu-item.binding.route", async () => mediaDetach(request, "business", await target(context), (await context.params).bindingId)); }
export async function PATCH(request: NextRequest, context: Context) { return mediaRouteResponse("menu-item.binding.route", async () => mediaAlt(request, "business", await target(context), (await context.params).bindingId)); }
