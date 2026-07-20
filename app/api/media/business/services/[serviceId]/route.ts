import type { NextRequest } from "next/server";
import { mediaAttach, mediaGet, mediaRouteResponse } from "@/features/media/api/http";
import { mediaRouteUuid } from "@/features/media/api/validation";

type Context = { params: Promise<{ serviceId: string }> };
async function target(context: Context) { return { kind: "SERVICE", serviceId: mediaRouteUuid((await context.params).serviceId, "serviceId") } as const; }
export async function GET(request: NextRequest, context: Context) { return mediaRouteResponse("service.route", async () => mediaGet(request, "business", await target(context))); }
export async function POST(request: NextRequest, context: Context) { return mediaRouteResponse("service.route", async () => mediaAttach(request, "business", await target(context))); }
export async function PUT(request: NextRequest, context: Context) { return mediaRouteResponse("service.route", async () => mediaAttach(request, "business", await target(context), true)); }
