import type { NextRequest } from "next/server";

import { serializeCheckoutReceipt } from "@/features/commerce/api/dto";
import { commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseCheckoutRequest, parseIdempotencyKey } from "@/features/commerce/api/validation";
import { createPendingOrder } from "@/features/commerce/services/checkout-service";

export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "checkout", async ({ personId }) => {
    const idempotencyKey = parseIdempotencyKey(request);
    const input = await parseCheckoutRequest(request);
    const order = await createPendingOrder({ ...input, customerId: personId, idempotencyKey });
    return commerceData(serializeCheckoutReceipt(order), 201);
  }, { limit: 10 });
}
