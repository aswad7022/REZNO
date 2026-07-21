import type { NextRequest } from "next/server";

import { handleAdminPaymentRequest } from "@/features/payments/api/http";
import { parsePaymentListQuery } from "@/features/payments/api/validation";
import { listAdminPayments } from "@/features/payments/services/queries";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleAdminPaymentRequest("intents.list", "PAYMENTS_VIEW", async (context) => ({
    data: await listAdminPayments(context, parsePaymentListQuery(request.nextUrl)),
  }));
}
