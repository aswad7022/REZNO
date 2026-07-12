import "server-only";

import { headers } from "next/headers";

import { logServerError } from "@/lib/logging/server";
import {
  configuredTrustedProxyHeader,
  consumeRateLimit,
  getRateLimitIdentifierFromHeaders,
} from "@/lib/security/rate-limit-core";

export { consumeRateLimit };

export function getRequestRateLimitIdentifierFromHeaders(
  headerStore: Headers,
  fallback = "unknown-client",
) {
  return getRateLimitIdentifierFromHeaders(headerStore, fallback, {
    trustedProxyHeader: configuredTrustedProxyHeader(),
  });
}

export async function getRequestRateLimitIdentifier(fallback: string) {
  try {
    return getRequestRateLimitIdentifierFromHeaders(await headers(), fallback);
  } catch (error) {
    logServerError("rateLimit.identifier", error);
    return getRateLimitIdentifierFromHeaders(new Headers(), fallback);
  }
}
