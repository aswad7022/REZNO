import type { NextRequest } from "next/server";

import { handleCustomerPaymentRequest } from "@/features/payments/api/http";
import {
  assertNoPaymentQuery,
  parseHostedReturn,
  paymentId,
} from "@/features/payments/api/validation";
import { consumeCustomerHostedPaymentReturn } from "@/features/payments/services/hosted-payment";

export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ intentId: string }> },
) {
  return handleCustomerPaymentRequest(
    request,
    "hosted-return.consume",
    async ({ personId }) => {
      assertNoPaymentQuery(request.nextUrl);
      return {
        data: await consumeCustomerHostedPaymentReturn(
        personId,
        paymentId((await params).intentId, "intentId"),
        (await parseHostedReturn(request)).state,
      ),
      };
    },
    20,
  );
}
