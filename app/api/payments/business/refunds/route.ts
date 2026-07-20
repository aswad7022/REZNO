import type { NextRequest } from "next/server";

import { handleBusinessPaymentRequest } from "@/features/payments/api/http";
import { parseRefundListQuery } from "@/features/payments/api/validation";
import { listBusinessRefunds } from "@/features/payments/services/queries";

export function GET(request: NextRequest) {
  return handleBusinessPaymentRequest(request, "refunds.list", "PAYMENT_VIEW", async (actor) => ({
    data: await listBusinessRefunds({
      contextOrganizationId: actor.organizationId,
      membershipId: actor.membershipId,
      personId: actor.personId,
    }, parseRefundListQuery(request.nextUrl)),
  }));
}
