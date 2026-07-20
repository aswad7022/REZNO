import type { NextRequest } from "next/server";

import { handleBusinessPaymentRequest } from "@/features/payments/api/http";
import { parseSettlementListQuery } from "@/features/payments/api/validation";
import { paymentError } from "@/features/payments/domain/errors";
import { listBusinessSettlements } from "@/features/payments/services/settlements";

export function GET(request: NextRequest) {
  return handleBusinessPaymentRequest(request, "settlements.list", "SETTLEMENT_VIEW", async (actor) => {
    const query = parseSettlementListQuery(request.nextUrl);
    if (query.organizationId || query.status) paymentError("VALIDATION_ERROR", "Business settlement filters are server-scoped.");
    return { data: await listBusinessSettlements({
      contextOrganizationId: actor.organizationId,
      membershipId: actor.membershipId,
      personId: actor.personId,
    }, query) };
  });
}
