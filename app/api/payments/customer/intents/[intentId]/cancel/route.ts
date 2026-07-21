import type { NextRequest } from "next/server";

import { handleCustomerPaymentRequest } from "@/features/payments/api/http";
import { parseVersionedMutation, paymentId, paymentIdempotencyKey } from "@/features/payments/api/validation";
import { cancelCustomerPaymentIntent } from "@/features/payments/services/payment-intents";

export function POST(request: NextRequest, { params }: { params: Promise<{ intentId: string }> }) {
  return handleCustomerPaymentRequest(request, "intents.cancel", async ({ personId }) => ({
    data: await cancelCustomerPaymentIntent(personId, paymentId((await params).intentId, "intentId"), {
      ...await parseVersionedMutation(request),
      idempotencyKey: paymentIdempotencyKey(request),
    }),
  }), 10);
}
