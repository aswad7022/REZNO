import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { resolveBookingCustomerApiContext } from "@/features/bookings/api/auth";
import { BookingApiError } from "@/features/bookings/api/errors";
import type { CustomerMessageActor } from "@/features/messages/domain/contracts";
import { MessageDomainError } from "@/features/messages/domain/errors";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Vary: "Cookie",
} as const;

export interface MessageHttpResult {
  body: unknown;
  status?: 200 | 201;
}

export function messageData(
  data: unknown,
  status: 200 | 201 = 200,
): MessageHttpResult {
  return { body: { data }, status };
}

export async function handleCustomerMessageRequest(
  request: NextRequest,
  scope: string,
  operation: (actor: CustomerMessageActor) => Promise<MessageHttpResult>,
  limit: number | null = 120,
) {
  try {
    const identity = await resolveBookingCustomerApiContext(request);
    const rate = limit === null
      ? null
      : consumeRateLimit(
          `message.customer.${scope}`,
          `person:${identity.personId}`,
          { limit, windowMs: 60_000 },
        );
    if (rate && !rate.success) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests." } },
        {
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(rate.retryAfterSeconds),
          },
          status: 429,
        },
      );
    }
    const result = await operation({
      kind: "customer",
      personId: identity.personId,
      userId: identity.userId,
    });
    return NextResponse.json(result.body, {
      headers: NO_STORE_HEADERS,
      status: result.status ?? 200,
    });
  } catch (error) {
    const mapped = mapMessageHttpError(error);
    if (mapped.status === 500) {
      logServerError("api.mobile.messages", error, { scope });
    }
    return NextResponse.json(
      { error: { code: mapped.code, message: mapped.message } },
      { headers: NO_STORE_HEADERS, status: mapped.status },
    );
  }
}

function mapMessageHttpError(error: unknown) {
  if (error instanceof MessageDomainError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  if (error instanceof BookingApiError) {
    return {
      code:
        error.code === "UNAUTHENTICATED"
          ? "UNAUTHENTICATED"
          : error.code === "RATE_LIMITED"
            ? "RATE_LIMITED"
            : "FORBIDDEN",
      message: error.message,
      status: error.status,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "Messaging request failed.",
    status: 500,
  };
}
