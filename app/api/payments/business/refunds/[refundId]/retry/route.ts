import type { NextRequest } from "next/server";

import { handleBusinessPaymentRequest } from "@/features/payments/api/http";
import { parseVersionedMutation, paymentId, paymentIdempotencyKey } from "@/features/payments/api/validation";
import { retryBusinessRefund } from "@/features/payments/services/refunds";

export function POST(request: NextRequest, { params }: { params: Promise<{ refundId: string }> }) {
  return handleBusinessPaymentRequest(request, "refunds.retry", "PAYMENT_REFUND", async (actor) => ({
    data: await retryBusinessRefund({
      contextOrganizationId: actor.organizationId,
      membershipId: actor.membershipId,
      personId: actor.personId,
    }, paymentId((await params).refundId, "refundId"), {
      ...await parseVersionedMutation(request),
      idempotencyKey: paymentIdempotencyKey(request),
    }),
  }), 10);
}
