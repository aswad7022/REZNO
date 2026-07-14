import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import {
  resolveBookingCustomerApiContext,
  type BookingCustomerApiContext,
} from "@/features/bookings/api/auth";
import {
  bookingApiError,
  mapBookingApiError,
} from "@/features/bookings/api/errors";
import { logServerError } from "@/lib/logging/server";
import {
  consumeRateLimit,
  getRequestRateLimitIdentifierFromHeaders,
} from "@/lib/security/rate-limit";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

export interface BookingHttpResult {
  body: unknown;
  status?: 200 | 201;
}

export function bookingData(
  data: unknown,
  status: 200 | 201 = 200,
): BookingHttpResult {
  return { body: { data }, status };
}

export function handlePublicBookingRequest(
  request: NextRequest,
  scope: string,
  operation: () => Promise<BookingHttpResult>,
  options: { cacheControl?: string; limit?: number } = {},
) {
  return handleBookingRequest(
    async () => {
      const identifier = getRequestRateLimitIdentifierFromHeaders(
        request.headers,
        "mobile-booking-public",
      );
      assertRateLimit(
        `booking.public.${scope}`,
        identifier,
        options.limit ?? 120,
      );
      return operation();
    },
    options.cacheControl ?? "public, max-age=30, stale-while-revalidate=120",
  );
}

export function handleCustomerBookingRequest(
  request: NextRequest,
  scope: string,
  operation: (
    context: BookingCustomerApiContext,
  ) => Promise<BookingHttpResult>,
  options: { limit?: number } = {},
) {
  return handleBookingRequest(async () => {
    const context = await resolveBookingCustomerApiContext(request);
    assertRateLimit(
      `booking.customer.${scope}`,
      `person:${context.personId}`,
      options.limit ?? 60,
    );
    return operation(context);
  }, NO_STORE_HEADERS["Cache-Control"]);
}

async function handleBookingRequest(
  operation: () => Promise<BookingHttpResult>,
  cacheControl: string,
) {
  try {
    const result = await operation();
    return NextResponse.json(result.body, {
      headers: { "Cache-Control": cacheControl },
      status: result.status ?? 200,
    });
  } catch (error) {
    const mapped = mapBookingApiError(error);
    if (mapped.code === "INTERNAL_ERROR") {
      logServerError("api.mobile.bookings", error);
    }
    const headers = {
      ...NO_STORE_HEADERS,
      ...(mapped.code === "RATE_LIMITED" &&
      typeof mapped.details?.retryAfterSeconds === "number"
        ? { "Retry-After": String(mapped.details.retryAfterSeconds) }
        : {}),
    };
    return NextResponse.json(
      {
        error: {
          code: mapped.code,
          ...(mapped.details && mapped.code !== "RATE_LIMITED"
            ? { details: mapped.details }
            : {}),
          message: mapped.message,
        },
      },
      { headers, status: mapped.status },
    );
  }
}

function assertRateLimit(scope: string, identifier: string, limit: number) {
  const result = consumeRateLimit(scope, identifier, {
    limit,
    windowMs: 60_000,
  });
  if (!result.success) {
    bookingApiError("RATE_LIMITED", 429, "Too many requests.", {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}
