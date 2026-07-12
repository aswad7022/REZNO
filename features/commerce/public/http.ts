import { NextResponse, type NextRequest } from "next/server";

import { publicCommerceErrorResponse } from "@/features/commerce/public/errors";
import {
  configuredTrustedProxyHeader,
  consumeRateLimit,
  getRateLimitIdentifierFromHeaders,
} from "@/lib/security/rate-limit-core";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
} as const;

export async function handlePublicCommerceRequest<T>(
  request: NextRequest,
  scope: string,
  operation: () => Promise<T>,
  options: { limit?: number } = {},
) {
  const identifier = getRateLimitIdentifierFromHeaders(
    request.headers,
    "commerce-public-unknown",
    { trustedProxyHeader: configuredTrustedProxyHeader() },
  );
  const rateLimit = consumeRateLimit(`commerce.public.${scope}`, identifier, {
    limit: options.limit ?? 60,
    windowMs: 60_000,
  });
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests." } },
      {
        headers: { ...NO_STORE_HEADERS, "Retry-After": String(rateLimit.retryAfterSeconds) },
        status: 429,
      },
    );
  }
  try {
    return NextResponse.json(await operation(), { headers: NO_STORE_HEADERS });
  } catch (error) {
    const mapped = publicCommerceErrorResponse(error);
    return NextResponse.json(mapped.body, { headers: NO_STORE_HEADERS, status: mapped.status });
  }
}
