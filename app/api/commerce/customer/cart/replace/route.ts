import type { NextRequest } from "next/server";

import { serializeCart } from "@/features/commerce/api/dto";
import { commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseCartReplacement } from "@/features/commerce/api/validation";
import { replaceCustomerCart } from "@/features/commerce/services/cart-service";

export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "cart.replace", async ({ personId }) =>
    commerceData(serializeCart(await replaceCustomerCart(personId, await parseCartReplacement(request)))),
  { limit: 30 });
}
