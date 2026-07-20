import type { NextRequest } from "next/server";

import { handleAdminPaymentRequest } from "@/features/payments/api/http";
import { parseSettlementListQuery } from "@/features/payments/api/validation";
import { listAdminSettlements } from "@/features/payments/services/settlements";

export function GET(request: NextRequest) {
  return handleAdminPaymentRequest("settlements.list", "SETTLEMENTS_VIEW", async (context) => ({
    data: await listAdminSettlements(context, parseSettlementListQuery(request.nextUrl)),
  }));
}
