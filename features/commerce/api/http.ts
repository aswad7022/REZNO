import type { CommercePermission } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  resolveCustomerApiContext,
  resolveMerchantApiContext,
  type CustomerApiContext,
  type MerchantApiContext,
} from "@/features/commerce/api/auth";
import { commerceApiError, mapCommerceApiError } from "@/features/commerce/api/errors";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

export interface CommerceHttpResult {
  body: unknown;
  status?: 200 | 201;
}

export function commerceData(data: unknown, status: 200 | 201 = 200): CommerceHttpResult {
  return { body: { data }, status };
}

export function commerceCollection(
  data: unknown[],
  pageInfo: { hasNextPage: boolean; nextCursor: string | null } = {
    hasNextPage: false,
    nextCursor: null,
  },
) {
  return { body: { data, pageInfo }, status: 200 as const };
}

export async function handleCustomerCommerceRequest(
  request: NextRequest,
  scope: string,
  operation: (context: CustomerApiContext) => Promise<CommerceHttpResult>,
  options: { limit?: number } = {},
) {
  return handleAuthenticatedRequest(async () => {
    const context = await resolveCustomerApiContext(request);
    assertAuthenticatedRateLimit(`commerce.customer.${scope}`, `person:${context.personId}`, options.limit ?? 60);
    return operation(context);
  });
}

export async function handleMerchantCommerceRequest(
  request: NextRequest,
  scope: string,
  permission: CommercePermission,
  operation: (context: MerchantApiContext) => Promise<CommerceHttpResult>,
  options: { limit?: number } = {},
) {
  return handleAuthenticatedRequest(async () => {
    const context = await resolveMerchantApiContext(request, permission);
    assertAuthenticatedRateLimit(
      `commerce.merchant.${scope}`,
      `user:${context.userId}:organization:${context.organizationId}`,
      options.limit ?? 60,
    );
    return operation(context);
  });
}

async function handleAuthenticatedRequest(operation: () => Promise<CommerceHttpResult>) {
  try {
    const result = await operation();
    return NextResponse.json(result.body, { headers: NO_STORE_HEADERS, status: result.status ?? 200 });
  } catch (error) {
    const mapped = mapCommerceApiError(error);
    const responseHeaders = {
      ...NO_STORE_HEADERS,
      ...(mapped.code === "RATE_LIMITED" && mapped.details?.retryAfterSeconds
        ? { "Retry-After": String(mapped.details.retryAfterSeconds) }
        : {}),
    };
    return NextResponse.json(
      {
        error: {
          code: mapped.code,
          ...(mapped.details && mapped.code !== "RATE_LIMITED" ? { details: mapped.details } : {}),
          message: mapped.message,
        },
      },
      { headers: responseHeaders, status: mapped.status },
    );
  }
}

function assertAuthenticatedRateLimit(scope: string, identifier: string, limit: number) {
  const result = consumeRateLimit(scope, identifier, { limit, windowMs: 60_000 });
  if (!result.success) {
    commerceApiError(
      "RATE_LIMITED",
      429,
      "Too many requests.",
      { retryAfterSeconds: result.retryAfterSeconds },
    );
  }
}
