import type { NextRequest } from "next/server";

import { handleCustomerPaymentRequest } from "@/features/payments/api/http";
import { parseCreateIntent, parsePaymentListQuery, paymentIdempotencyKey } from "@/features/payments/api/validation";
import { createCustomerPaymentIntent } from "@/features/payments/services/payment-intents";
import { listCustomerPayments } from "@/features/payments/services/queries";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerPaymentRequest(request, "intents.list", async ({ personId }) => ({
    data: await listCustomerPayments(personId, parsePaymentListQuery(request.nextUrl)),
  }));
}

export function POST(request: NextRequest) {
  return handleCustomerPaymentRequest(request, "intents.create", async ({ personId }) => ({
    data: await createCustomerPaymentIntent(personId, {
      ...await parseCreateIntent(request),
      idempotencyKey: paymentIdempotencyKey(request),
    }),
    status: 201,
  }), 10);
}
