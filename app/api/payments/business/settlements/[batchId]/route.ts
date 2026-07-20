import type { NextRequest } from "next/server";

import { handleBusinessPaymentRequest } from "@/features/payments/api/http";
import { paymentId } from "@/features/payments/api/validation";
import { getBusinessSettlement } from "@/features/payments/services/settlements";

export function GET(request: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  return handleBusinessPaymentRequest(request, "settlements.detail", "SETTLEMENT_VIEW", async (actor) => ({
    data: await getBusinessSettlement({
      contextOrganizationId: actor.organizationId,
      membershipId: actor.membershipId,
      personId: actor.personId,
    }, paymentId((await params).batchId, "batchId")),
  }));
}
