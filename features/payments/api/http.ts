import "server-only";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { getCurrentAdminAccess } from "@/features/admin/services/admin-auth";
import { resolveCustomerApiContext, resolveMerchantApiContext, type CustomerApiContext, type MerchantApiContext } from "@/features/commerce/api/auth";
import { mapCommerceApiError } from "@/features/commerce/api/errors";
import type { CommerceAdminContext } from "@/features/commerce/services/authorization";
import { assertPaymentWebhookRequestAllowed } from "@/features/payments/api/webhook-guard";
import { PaymentDomainError } from "@/features/payments/domain/errors";
import { logServerError } from "@/lib/logging/server";
import { consumeRateLimit } from "@/lib/security/rate-limit-core";
import type { CommercePermission, PaymentProviderKind } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

export function paymentData(data: unknown, status: 200 | 201 | 202 = 200) {
  return { data, status };
}

export async function handleCustomerPaymentRequest(
  request: NextRequest,
  scope: string,
  operation: (context: CustomerApiContext) => Promise<{ data: unknown; status?: 200 | 201 }>,
  limit = 30,
) {
  return handlePaymentRequest(scope, async () => {
    const actor = await resolveCustomerApiContext(request);
    rateLimit("customer." + scope, "person:" + actor.personId, limit);
    return operation(actor);
  });
}

export async function handleBusinessPaymentRequest(
  request: NextRequest,
  scope: string,
  permission: CommercePermission,
  operation: (context: MerchantApiContext) => Promise<{ data: unknown; status?: 200 | 201 }>,
  limit = 30,
) {
  return handlePaymentRequest(scope, async () => {
    const actor = await resolveMerchantApiContext(request, permission);
    rateLimit("business." + scope, "person:" + actor.personId + ":organization:" + actor.organizationId, limit);
    return operation(actor);
  });
}

export async function handleAdminPaymentRequest(
  scope: string,
  permission: AdminPermission,
  operation: (context: CommerceAdminContext) => Promise<{ data: unknown; status?: 200 | 201 }>,
  limit = 30,
) {
  return handlePaymentRequest(scope, async () => {
    const state = await getCurrentAdminAccess();
    if (!state || (!state.isSuperAdmin && !state.permissions.includes(permission))) {
      throw new PaymentDomainError("FORBIDDEN", "Admin payment permission is required.");
    }
    const context: CommerceAdminContext = {
      adminAccessId: state.adminAccess?.id ?? null,
      isSuperAdmin: state.isSuperAdmin,
      personId: state.identity.person.id,
      permissions: state.permissions,
      source: state.source,
      userId: state.identity.session.user.id,
    };
    rateLimit("admin." + scope, "person:" + context.personId, limit);
    return operation(context);
  });
}

export async function handleProviderWebhookRequest(
  request: Request,
  scope: string,
  provider: PaymentProviderKind,
  operation: () => Promise<unknown>,
) {
  return handlePaymentRequest(scope, async () => {
    assertPaymentWebhookRequestAllowed(request, scope, provider);
    return { data: await operation(), status: 202 as const };
  });
}

async function handlePaymentRequest(
  scope: string,
  operation: () => Promise<{ data: unknown; status?: 200 | 201 | 202 }>,
) {
  try {
    const result = await operation();
    return NextResponse.json({ data: result.data }, { headers: NO_STORE, status: result.status ?? 200 });
  } catch (error) {
    if (error instanceof PaymentDomainError) {
      const retryAfter = error.code === "RATE_LIMITED" && error.details?.retryAfterSeconds
        ? String(error.details.retryAfterSeconds)
        : undefined;
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { headers: { ...NO_STORE, ...(retryAfter ? { "Retry-After": retryAfter } : {}) }, status: error.status },
      );
    }
    const mapped = mapCommerceApiError(error);
    if (mapped.code !== "INTERNAL_ERROR") {
      return NextResponse.json(
        { error: { code: mapped.code, message: mapped.message } },
        { headers: NO_STORE, status: mapped.status },
      );
    }
    logServerError("payments.http." + scope, error);
    return NextResponse.json(
      { error: { code: "PAYMENT_PROVIDER_FAILURE", message: "Payment request failed safely." } },
      { headers: NO_STORE, status: 500 },
    );
  }
}

function rateLimit(scope: string, actor: string, limit: number): void {
  const result = consumeRateLimit("payments." + scope, actor, { limit, windowMs: 60_000 });
  if (!result.success) {
    throw new PaymentDomainError("RATE_LIMITED", "Too many payment requests.");
  }
}
