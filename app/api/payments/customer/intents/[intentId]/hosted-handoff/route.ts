import type { NextRequest } from "next/server";

import { handleCustomerPaymentRequest } from "@/features/payments/api/http";
import {
  assertNoPaymentQuery,
  assertNoPaymentRequestBody,
  paymentId,
  paymentIdempotencyKey,
} from "@/features/payments/api/validation";
import { createCustomerHostedPaymentHandoff } from "@/features/payments/services/hosted-payment";

export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ intentId: string }> },
) {
  return handleCustomerPaymentRequest(
    request,
    "hosted-handoff.create",
    async ({ personId }) => {
      assertNoPaymentQuery(request.nextUrl);
      await assertNoPaymentRequestBody(request);
      return {
        data: await createCustomerHostedPaymentHandoff(
          personId,
          paymentId((await params).intentId, "intentId"),
          paymentIdempotencyKey(request),
        ),
      };
    },
    10,
  );
}
