import type { NextRequest } from "next/server";

import { handleCustomerPaymentRequest } from "@/features/payments/api/http";
import { parseCapabilityQuery } from "@/features/payments/api/validation";
import { getCustomerPaymentCapabilities } from "@/features/payments/services/capabilities";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerPaymentRequest(request, "capabilities.read", async ({ personId }) => ({
    data: await getCustomerPaymentCapabilities(personId, parseCapabilityQuery(request.nextUrl)),
  }));
}
