import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { resolveRestaurantReservationCustomer } from "@/features/restaurants/api/auth";
import {
  mapRestaurantReservationApiError,
  restaurantReservationApiError,
} from "@/features/restaurants/api/errors";
import { logServerError } from "@/lib/logging/server";
import {
  consumeRateLimit,
  getRequestRateLimitIdentifierFromHeaders,
} from "@/lib/security/rate-limit";

export interface RestaurantHttpResult {
  body: unknown;
  status?: 200 | 201;
}

export function restaurantData(data: unknown, status: 200 | 201 = 200) {
  return { body: { data }, status } satisfies RestaurantHttpResult;
}

export function handlePublicRestaurantRequest(
  request: NextRequest,
  scope: string,
  operation: () => Promise<RestaurantHttpResult>,
  options: { cacheControl?: string; limit?: number } = {},
) {
  return handleRestaurantRequest(async () => {
    const identifier = getRequestRateLimitIdentifierFromHeaders(
      request.headers,
      "mobile-restaurant-public",
    );
    assertRateLimit(`restaurant.public.${scope}`, identifier, options.limit ?? 120);
    return operation();
  }, options.cacheControl ?? "public, max-age=30, stale-while-revalidate=120");
}

export function handleCustomerRestaurantRequest(
  request: NextRequest,
  scope: string,
  operation: (context: { personId: string; userId: string }) => Promise<RestaurantHttpResult>,
  options: { limit?: number } = {},
) {
  return handleRestaurantRequest(async () => {
    const context = await resolveRestaurantReservationCustomer(request);
    assertRateLimit(
      `restaurant.customer.${scope}`,
      `person:${context.personId}`,
      options.limit ?? 60,
    );
    return operation(context);
  }, "no-store, max-age=0");
}

async function handleRestaurantRequest(
  operation: () => Promise<RestaurantHttpResult>,
  cacheControl: string,
) {
  try {
    const result = await operation();
    return NextResponse.json(result.body, {
      headers: { "Cache-Control": cacheControl },
      status: result.status ?? 200,
    });
  } catch (error) {
    const mapped = mapRestaurantReservationApiError(error);
    if (mapped.code === "INTERNAL_ERROR") {
      logServerError("api.mobile.restaurant-reservations", error);
    }
    return NextResponse.json(
      {
        error: {
          code: mapped.code,
          message: mapped.message,
          ...(mapped.details && mapped.code !== "RATE_LIMITED"
            ? { details: mapped.details }
            : {}),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          ...(mapped.code === "RATE_LIMITED" &&
          typeof mapped.details?.retryAfterSeconds === "number"
            ? { "Retry-After": String(mapped.details.retryAfterSeconds) }
            : {}),
        },
        status: mapped.status,
      },
    );
  }
}

function assertRateLimit(scope: string, identifier: string, limit: number) {
  const result = consumeRateLimit(scope, identifier, { limit, windowMs: 60_000 });
  if (!result.success) {
    restaurantReservationApiError("RATE_LIMITED", 429, "Too many requests.", {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}
