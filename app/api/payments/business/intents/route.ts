import type { NextRequest } from "next/server";

import { handleBusinessPaymentRequest } from "@/features/payments/api/http";
import { parsePaymentListQuery } from "@/features/payments/api/validation";
import { listBusinessPayments } from "@/features/payments/services/queries";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleBusinessPaymentRequest(request, "intents.list", "PAYMENT_VIEW", async (actor) => ({
    data: await listBusinessPayments({
      contextOrganizationId: actor.organizationId,
      membershipId: actor.membershipId,
      personId: actor.personId,
    }, parsePaymentListQuery(request.nextUrl)),
  }));
}
