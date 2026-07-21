import type { NextRequest } from "next/server";

import { handleCustomerPaymentRequest } from "@/features/payments/api/http";
import { paymentId } from "@/features/payments/api/validation";
import { getCustomerPaymentIntent } from "@/features/payments/services/payment-intents";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest, { params }: { params: Promise<{ intentId: string }> }) {
  return handleCustomerPaymentRequest(request, "return.read", async ({ personId }) => ({
    data: await getCustomerPaymentIntent(personId, paymentId((await params).intentId, "intentId")),
  }));
}
