import type { NextRequest } from "next/server";

import { handleBusinessPaymentRequest } from "@/features/payments/api/http";
import { parseJournalListQuery } from "@/features/payments/api/validation";
import { listBusinessJournals } from "@/features/payments/services/journal-queries";

export function GET(request: NextRequest) {
  return handleBusinessPaymentRequest(request, "journals.list", "SETTLEMENT_VIEW", async (actor) => ({
    data: await listBusinessJournals({
      contextOrganizationId: actor.organizationId,
      membershipId: actor.membershipId,
      personId: actor.personId,
    }, parseJournalListQuery(request.nextUrl)),
  }));
}
