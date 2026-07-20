import type { NextRequest } from "next/server";

import { handleAdminPaymentRequest } from "@/features/payments/api/http";
import { paymentId } from "@/features/payments/api/validation";
import { getAdminPayment } from "@/features/payments/services/queries";

export function GET(_request: NextRequest, { params }: { params: Promise<{ intentId: string }> }) {
  return handleAdminPaymentRequest("intents.detail", "PAYMENTS_VIEW", async (context) => ({
    data: await getAdminPayment(context, paymentId((await params).intentId, "intentId")),
  }));
}
