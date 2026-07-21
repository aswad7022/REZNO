import type { NextRequest } from "next/server";

import { handleBusinessPaymentRequest } from "@/features/payments/api/http";
import { parseRefundRequest, paymentId, paymentIdempotencyKey } from "@/features/payments/api/validation";
import { requestBusinessRefund } from "@/features/payments/services/refunds";

export function POST(request: NextRequest, { params }: { params: Promise<{ intentId: string }> }) {
  return handleBusinessPaymentRequest(request, "refunds.create", "PAYMENT_REFUND", async (actor) => ({
    data: await requestBusinessRefund({
      contextOrganizationId: actor.organizationId,
      membershipId: actor.membershipId,
      personId: actor.personId,
    }, {
      ...await parseRefundRequest(request),
      idempotencyKey: paymentIdempotencyKey(request),
      paymentIntentId: paymentId((await params).intentId, "intentId"),
    }),
    status: 201,
  }), 10);
}
