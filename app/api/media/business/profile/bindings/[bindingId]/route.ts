import type { NextRequest } from "next/server";
import { mediaAlt, mediaDetach } from "@/features/media/api/http";

const target = { kind: "BUSINESS_PROFILE" } as const;
type Context = { params: Promise<{ bindingId: string }> };
export async function DELETE(request: NextRequest, context: Context) {
  return mediaDetach(request, "business", target, (await context.params).bindingId);
}
export async function PATCH(request: NextRequest, context: Context) {
  return mediaAlt(request, "business", target, (await context.params).bindingId);
}
