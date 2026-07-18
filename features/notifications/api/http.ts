import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolveBookingCustomerApiContext } from "@/features/bookings/api/auth";
import { BookingApiError } from "@/features/bookings/api/errors";
import { NotificationDomainError } from "@/features/notifications/domain/errors";
import type { NotificationActorContext } from "@/features/notifications/domain/contracts";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";

type NotificationHttpResult = { body: unknown; status?: 200 | 201 };

export function notificationData(data: unknown, status: 200 | 201 = 200): NotificationHttpResult {
  return { body: { data }, status };
}

export async function handleCustomerNotificationRequest(
  request: NextRequest,
  scope: string,
  operation: (context: NotificationActorContext) => Promise<NotificationHttpResult>,
  limit = 60,
) {
  try {
    const identity = await resolveBookingCustomerApiContext(request);
    const rate = consumeRateLimit(`notification.customer.${scope}`, `person:${identity.personId}`, { limit, windowMs: 60_000 });
    if (!rate.success) {
      return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests." } }, {
        headers: { "Cache-Control": "no-store, max-age=0", "Retry-After": String(rate.retryAfterSeconds) }, status: 429,
      });
    }
    const result = await operation({ mode: "customer", personId: identity.personId });
    return NextResponse.json(result.body, { headers: { "Cache-Control": "no-store, max-age=0" }, status: result.status ?? 200 });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped.status === 500) logServerError("api.mobile.notifications", error);
    return NextResponse.json({ error: { code: mapped.code, ...(mapped.details ? { details: mapped.details } : {}), message: mapped.message } }, {
      headers: { "Cache-Control": "no-store, max-age=0" }, status: mapped.status,
    });
  }
}

function mapError(error: unknown) {
  if (error instanceof BookingApiError) {
    return { code: error.code, details: error.details, message: error.message, status: error.status };
  }
  if (error instanceof NotificationDomainError) {
    const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 :
      error.code === "IDEMPOTENCY_CONFLICT" || error.code === "STALE_VERSION" ? 409 : 400;
    return { code: error.code, details: error.details, message: error.message, status };
  }
  return { code: "INTERNAL_ERROR", message: "Notification request failed.", status: 500 };
}
