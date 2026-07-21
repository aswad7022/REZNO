import type { NextRequest } from "next/server";

import { handleAdminPaymentRequest } from "@/features/payments/api/http";
import { parseVersionedMutation, paymentId, paymentIdempotencyKey } from "@/features/payments/api/validation";
import { finalizeSettlement } from "@/features/payments/services/settlements";

export function POST(request: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  return handleAdminPaymentRequest("settlements.finalize", "SETTLEMENTS_MANAGE", async (context) => ({
    data: await finalizeSettlement(context, paymentId((await params).batchId, "batchId"), {
      ...await parseVersionedMutation(request),
      idempotencyKey: paymentIdempotencyKey(request),
    }),
  }), 5);
}
