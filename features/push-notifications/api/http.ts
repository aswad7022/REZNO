import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolveBookingCustomerApiContext } from "@/features/bookings/api/auth";
import { BookingApiError } from "@/features/bookings/api/errors";
import { PushNotificationDomainError } from "@/features/push-notifications/domain/errors";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export async function handleCustomerPushRequest(
  request: NextRequest,
  scope: string,
  operation: (context: { personId: string; userId: string }) => Promise<unknown>,
) {
  try {
    const context = await resolveBookingCustomerApiContext(request);
    const rate = await consumeRateLimit(
      `push.customer.${scope}`,
      `person:${context.personId}`,
      { limit: 15, windowMs: 60_000 },
    );
    if (rate.unavailable) {
      return errorResponse(
        503,
        "SERVICE_UNAVAILABLE",
        "Push notifications are temporarily unavailable.",
        "1",
      );
    }
    if (!rate.success) {
      return errorResponse(
        429,
        "RATE_LIMITED",
        "Too many push notification requests.",
        String(rate.retryAfterSeconds),
      );
    }
    return NextResponse.json(
      { data: await operation(context) },
      { status: 200, headers: noStoreHeaders() },
    );
  } catch (error) {
    if (error instanceof BookingApiError || error instanceof PushNotificationDomainError) {
      return errorResponse(error.status, error.code, error.message);
    }
    return errorResponse(500, "INTERNAL_ERROR", "Push notification request failed.");
  }
}

export function pushRouteErrorResponse(error: unknown) {
  if (error instanceof PushNotificationDomainError) {
    return errorResponse(error.status, error.code, error.message);
  }
  return errorResponse(500, "INTERNAL_ERROR", "Push receipt request failed.");
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryAfter?: string,
) {
  return NextResponse.json(
    { error: { code, message } },
    {
      status,
      headers: {
        ...noStoreHeaders(),
        ...(retryAfter ? { "Retry-After": retryAfter } : {}),
      },
    },
  );
}

function noStoreHeaders() {
  return { "Cache-Control": "no-store, max-age=0" };
}
