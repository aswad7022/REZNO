import { mediaErrorResponse } from "@/features/media/api/http";
import { assertNoMediaQuery, mediaRouteUuid } from "@/features/media/api/validation";
import { createPublicMediaDownloadTarget } from "@/features/media/services/delivery";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";
import { getRequestRateLimitIdentifierFromHeaders } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    assertNoMediaQuery(request);
    const rate = consumeRateLimit(
      "media.public.delivery",
      getRequestRateLimitIdentifierFromHeaders(request.headers, "media-public"),
      { limit: 120, windowMs: 60_000 },
    );
    if (!rate.success) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many media requests." } },
        { headers: { "Cache-Control": "no-store", "Retry-After": String(rate.retryAfterSeconds) }, status: 429 },
      );
    }
    const { assetId } = await context.params;
    const target = await createPublicMediaDownloadTarget(mediaRouteUuid(assetId, "assetId"));
    return NextResponse.redirect(target.url, {
      headers: { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" },
      status: 307,
    });
  } catch (error) {
    return mediaErrorResponse(error, "public.delivery");
  }
}
