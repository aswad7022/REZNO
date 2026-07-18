import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolveBookingCustomerApiContext } from "@/features/bookings/api/auth";
import { BookingApiError } from "@/features/bookings/api/errors";
import { CommunicationDomainError } from "@/features/communications/domain/errors";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";

export async function handleCustomerCommunicationRequest(
  request: NextRequest,
  scope: string,
  operation: (context: { personId: string; userId: string }) => Promise<unknown>,
  limit = 30,
) {
  try {
    const context = await resolveBookingCustomerApiContext(request);
    const rate = consumeRateLimit(
      `communication.customer.${scope}`,
      `person:${context.personId}`,
      { limit, windowMs: 60_000 },
    );
    if (!rate.success) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests." } },
        {
          status: 429,
          headers: { "Cache-Control": "no-store, max-age=0", "Retry-After": String(rate.retryAfterSeconds) },
        },
      );
    }
    return NextResponse.json(
      { data: await operation(context) },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const mapped = mapError(error);
    return NextResponse.json(
      { error: { code: mapped.code, message: mapped.message } },
      { status: mapped.status, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
function mapError(error: unknown) {
  if (error instanceof BookingApiError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  if (error instanceof CommunicationDomainError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  return { code: "INTERNAL_ERROR", message: "Communication request failed.", status: 500 };
}
