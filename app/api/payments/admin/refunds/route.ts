import type { NextRequest } from "next/server";

import { handleAdminPaymentRequest } from "@/features/payments/api/http";
import { parseRefundListQuery } from "@/features/payments/api/validation";
import { listAdminRefunds } from "@/features/payments/services/queries";

export function GET(request: NextRequest) {
  return handleAdminPaymentRequest("refunds.list", "PAYMENTS_VIEW", async (context) => ({
    data: await listAdminRefunds(context, parseRefundListQuery(request.nextUrl)),
  }));
}
