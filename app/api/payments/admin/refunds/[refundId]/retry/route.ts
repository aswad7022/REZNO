import type { NextRequest } from "next/server";

import { handleAdminPaymentRequest } from "@/features/payments/api/http";
import { parseVersionedMutation, paymentId, paymentIdempotencyKey } from "@/features/payments/api/validation";
import { retryAdminRefund } from "@/features/payments/services/refunds";

export function POST(request: NextRequest, { params }: { params: Promise<{ refundId: string }> }) {
  return handleAdminPaymentRequest("refunds.retry", "PAYMENTS_REFUND", async (context) => ({
    data: await retryAdminRefund(context, paymentId((await params).refundId, "refundId"), {
      ...await parseVersionedMutation(request),
      idempotencyKey: paymentIdempotencyKey(request),
    }),
  }), 10);
}
