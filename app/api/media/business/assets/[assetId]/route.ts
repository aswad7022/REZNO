import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { mediaErrorResponse } from "@/features/media/api/http";
import { assertNoMediaQuery, mediaRouteUuid } from "@/features/media/api/validation";
import { createBusinessMediaDownloadTarget } from "@/features/media/services/delivery";
import { resolveStorageActorFromRequest } from "@/features/storage/services/web-actor";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";

export async function GET(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  try {
    assertNoMediaQuery(request);
    const actor = await resolveStorageActorFromRequest(request, "business");
    if (actor.kind !== "business") throw new Error("Business actor resolution failed.");
    const rate = consumeRateLimit("media.business.delivery", `person:${actor.personId}`, { limit: 60, windowMs: 60_000 });
    if (!rate.success) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many media requests." } },
        { headers: { "Cache-Control": "no-store", "Retry-After": String(rate.retryAfterSeconds) }, status: 429 },
      );
    }
    const { assetId } = await context.params;
    const target = await createBusinessMediaDownloadTarget(actor, mediaRouteUuid(assetId, "assetId"));
    return NextResponse.redirect(target.url, {
      headers: { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" },
      status: 307,
    });
  } catch (error) {
    return mediaErrorResponse(error, "business.delivery");
  }
}
