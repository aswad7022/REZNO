import type { NextRequest } from "next/server";

import { handleAdminPaymentRequest } from "@/features/payments/api/http";
import { paymentId } from "@/features/payments/api/validation";
import { getAdminSettlement } from "@/features/payments/services/settlements";

export function GET(_request: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  return handleAdminPaymentRequest("settlements.detail", "SETTLEMENTS_VIEW", async (context) => ({
    data: await getAdminSettlement(context, paymentId((await params).batchId, "batchId")),
  }));
}
