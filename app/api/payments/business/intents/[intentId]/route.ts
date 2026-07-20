import type { NextRequest } from "next/server";

import { handleBusinessPaymentRequest } from "@/features/payments/api/http";
import { paymentId } from "@/features/payments/api/validation";
import { getBusinessPayment } from "@/features/payments/services/queries";

export function GET(request: NextRequest, { params }: { params: Promise<{ intentId: string }> }) {
  return handleBusinessPaymentRequest(request, "intents.detail", "PAYMENT_VIEW", async (actor) => ({
    data: await getBusinessPayment({
      contextOrganizationId: actor.organizationId,
      membershipId: actor.membershipId,
      personId: actor.personId,
    }, paymentId((await params).intentId, "intentId")),
  }));
}
