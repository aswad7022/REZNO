import type { NextRequest } from "next/server";

import { handleAdminPaymentRequest } from "@/features/payments/api/http";
import { parseReconciliationRequest, paymentIdempotencyKey } from "@/features/payments/api/validation";
import { runPaymentReconciliation } from "@/features/payments/services/reconciliation";

export function POST(request: NextRequest) {
  return handleAdminPaymentRequest("reconciliation.run", "PAYMENTS_RECONCILE", async (context) => ({
    data: await runPaymentReconciliation(context, {
      ...await parseReconciliationRequest(request),
      idempotencyKey: paymentIdempotencyKey(request),
    }),
  }), 5);
}
