import { NextResponse } from "next/server";

import {
  completeMobileCustomerOnboardingProfile,
  CustomerOnboardingPhoneError,
  CustomerOnboardingUnavailableError,
} from "@/features/onboarding/services/customer-onboarding";
import { auth } from "@/lib/auth/auth";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return onboardingError(
        "UNAUTHENTICATED",
        "Authentication is required.",
        401,
      );
    }

    const rateLimit = consumeRateLimit(
      "mobile.onboarding.customer",
      `user:${session.user.id}`,
      { limit: 10, windowMs: 60_000 },
    );
    if (!rateLimit.success) {
      return onboardingError("RATE_LIMITED", "Too many requests.", 429, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }

    const body = await request.json().catch(() => ({}));
    const phone = isRecord(body) ? body.phone : undefined;
    const data = await completeMobileCustomerOnboardingProfile(
      session.user.id,
      phone,
    );
    return NextResponse.json(
      { data },
      { headers: NO_STORE_HEADERS, status: 200 },
    );
  } catch (error) {
    if (error instanceof CustomerOnboardingPhoneError) {
      return onboardingError(error.code, error.message, 400);
    }

    if (error instanceof CustomerOnboardingUnavailableError) {
      return onboardingError(
        "PROFILE_UNAVAILABLE",
        "An active customer profile is required.",
        403,
      );
    }

    logServerError("mobile-customer-onboarding", error);
    return onboardingError(
      "INTERNAL_ERROR",
      "Customer setup could not be completed.",
      500,
    );
  }
}

function onboardingError(
  code:
    | "INTERNAL_ERROR"
    | "PHONE_INVALID"
    | "PHONE_REQUIRED"
    | "PROFILE_UNAVAILABLE"
    | "RATE_LIMITED"
    | "UNAUTHENTICATED",
  message: string,
  status: 400 | 401 | 403 | 429 | 500,
  headers: Record<string, string> = {},
) {
  return NextResponse.json(
    { error: { code, message } },
    { headers: { ...NO_STORE_HEADERS, ...headers }, status },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
