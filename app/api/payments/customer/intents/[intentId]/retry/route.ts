import type { NextRequest } from "next/server";

import { handleCustomerPaymentRequest } from "@/features/payments/api/http";
import { paymentId, paymentIdempotencyKey } from "@/features/payments/api/validation";
import { submitCustomerPaymentIntent } from "@/features/payments/services/payment-intents";

export function POST(request: NextRequest, { params }: { params: Promise<{ intentId: string }> }) {
  return handleCustomerPaymentRequest(request, "intents.retry", async ({ personId }) => ({
    data: await submitCustomerPaymentIntent(
      personId,
      paymentId((await params).intentId, "intentId"),
      paymentIdempotencyKey(request),
    ),
  }), 10);
}
