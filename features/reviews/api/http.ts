import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { resolveBookingCustomerApiContext } from "@/features/bookings/api/auth";
import { BookingApiError } from "@/features/bookings/api/errors";
import { BookingDomainError } from "@/features/bookings/domain/errors";
import { ReviewDomainError } from "@/features/reviews/domain/errors";
import { logServerError } from "@/lib/logging/server";
import {
  consumeRateLimit,
  getRequestRateLimitIdentifierFromHeaders,
} from "@/lib/security/rate-limit";

const NO_STORE = "no-store, max-age=0";

type ReviewHttpResult = { body: unknown; status?: 200 | 201 };

export function reviewData(data: unknown, status: 200 | 201 = 200): ReviewHttpResult {
  return { body: { data }, status };
}

export function handleCustomerReviewRequest(
  request: NextRequest,
  scope: string,
  operation: (context: { personId: string; userId: string }) => Promise<ReviewHttpResult>,
  options: { limit?: number } = {},
) {
  return handleReviewRequest(async () => {
    const context = await resolveBookingCustomerApiContext(request);
    assertRateLimit(`review.customer.${scope}`, `person:${context.personId}`, options.limit ?? 60);
    return operation(context);
  }, NO_STORE);
}

export function handlePublicReviewRequest(
  request: NextRequest,
  scope: string,
  operation: () => Promise<ReviewHttpResult>,
  options: { limit?: number } = {},
) {
  return handleReviewRequest(async () => {
    const identifier = getRequestRateLimitIdentifierFromHeaders(
      request.headers,
      "mobile-review-public",
    );
    assertRateLimit(`review.public.${scope}`, identifier, options.limit ?? 120);
    return operation();
  }, "public, max-age=30, stale-while-revalidate=120");
}

async function handleReviewRequest(
  operation: () => Promise<ReviewHttpResult>,
  cacheControl: string,
) {
  try {
    const result = await operation();
    return NextResponse.json(result.body, {
      status: result.status ?? 200,
      headers: { "Cache-Control": cacheControl },
    });
  } catch (error) {
    const mapped = mapReviewError(error);
    if (mapped.status === 500) logServerError("api.mobile.reviews", error);
    return NextResponse.json(
      { error: { code: mapped.code, message: mapped.message, ...(mapped.details ? { details: mapped.details } : {}) } },
      {
        status: mapped.status,
        headers: {
          "Cache-Control": NO_STORE,
          ...(mapped.retryAfterSeconds ? { "Retry-After": String(mapped.retryAfterSeconds) } : {}),
        },
      },
    );
  }
}

function mapReviewError(error: unknown) {
  if (error instanceof BookingApiError) {
    return {
      code: error.code,
      status: error.status,
      message: error.message,
      details: error.details,
      retryAfterSeconds:
        error.code === "RATE_LIMITED" && typeof error.details?.retryAfterSeconds === "number"
          ? error.details.retryAfterSeconds
          : undefined,
    };
  }
  if (error instanceof ReviewDomainError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "FORBIDDEN" || error.code === "CUSTOMER_UNAVAILABLE"
          ? 403
          : error.code === "INVALID_REQUEST" || error.code === "INVALID_CURSOR"
            ? 400
            : 409;
    return { code: error.code, status, message: error.message, details: error.details };
  }
  if (error instanceof BookingDomainError) {
    return {
      code: error.code,
      status: error.code === "NOT_FOUND" ? 404 : 400,
      message: error.message,
      details: error.details,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    status: 500,
    message: "Review request could not be completed.",
  };
}

function assertRateLimit(scope: string, identifier: string, limit: number) {
  const result = consumeRateLimit(scope, identifier, { limit, windowMs: 60_000 });
  if (!result.success) {
    throw new BookingApiError("RATE_LIMITED", 429, "Too many requests.", {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}
