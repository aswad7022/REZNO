import type { NextRequest } from "next/server";

import { handleAdminPaymentRequest } from "@/features/payments/api/http";
import { parseSettlementPreview, paymentIdempotencyKey } from "@/features/payments/api/validation";
import { previewSettlement } from "@/features/payments/services/settlements";

export function POST(request: NextRequest) {
  return handleAdminPaymentRequest("settlements.preview", "SETTLEMENTS_MANAGE", async (context) => ({
    data: await previewSettlement(context, {
      ...await parseSettlementPreview(request),
      idempotencyKey: paymentIdempotencyKey(request),
    }),
    status: 201,
  }), 5);
}
