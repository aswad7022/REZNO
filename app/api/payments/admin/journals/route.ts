import type { NextRequest } from "next/server";

import { handleAdminPaymentRequest } from "@/features/payments/api/http";
import { parseJournalListQuery } from "@/features/payments/api/validation";
import { listAdminJournals } from "@/features/payments/services/journal-queries";

export function GET(request: NextRequest) {
  return handleAdminPaymentRequest("journals.list", "PAYMENTS_VIEW", async (context) => ({
    data: await listAdminJournals(context, parseJournalListQuery(request.nextUrl)),
  }));
}
