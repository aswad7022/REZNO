import type { NextRequest } from "next/server";

import { handleAdminPaymentRequest } from "@/features/payments/api/http";
import { parseRefundRequest, paymentId, paymentIdempotencyKey } from "@/features/payments/api/validation";
import { requestAdminRefund } from "@/features/payments/services/refunds";

export function POST(request: NextRequest, { params }: { params: Promise<{ intentId: string }> }) {
  return handleAdminPaymentRequest("refunds.create", "PAYMENTS_REFUND", async (context) => ({
    data: await requestAdminRefund(context, {
      ...await parseRefundRequest(request),
      idempotencyKey: paymentIdempotencyKey(request),
      paymentIntentId: paymentId((await params).intentId, "intentId"),
    }),
    status: 201,
  }), 10);
}
