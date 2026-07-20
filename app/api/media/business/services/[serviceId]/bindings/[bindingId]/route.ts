import type { NextRequest } from "next/server";
import { mediaAlt, mediaDetach, mediaRouteResponse } from "@/features/media/api/http";
import { mediaRouteUuid } from "@/features/media/api/validation";

type Context = { params: Promise<{ bindingId: string; serviceId: string }> };
async function target(context: Context) { return { kind: "SERVICE", serviceId: mediaRouteUuid((await context.params).serviceId, "serviceId") } as const; }
export async function DELETE(request: NextRequest, context: Context) { return mediaRouteResponse("service.binding.route", async () => mediaDetach(request, "business", await target(context), (await context.params).bindingId)); }
export async function PATCH(request: NextRequest, context: Context) { return mediaRouteResponse("service.binding.route", async () => mediaAlt(request, "business", await target(context), (await context.params).bindingId)); }
