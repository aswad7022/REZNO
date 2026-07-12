import type { NextRequest } from "next/server";

import { serializeCart } from "@/features/commerce/api/dto";
import { commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseCartVersionRequest } from "@/features/commerce/api/validation";
import { clearCustomerCart, getCustomerCart } from "@/features/commerce/services/cart-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "cart.read", async ({ personId }) =>
    commerceData(serializeCart(await getCustomerCart(personId))),
  { limit: 120 });
}

export function DELETE(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "cart.mutate", async ({ personId }) => {
    await clearCustomerCart(personId, await parseCartVersionRequest(request));
    return commerceData(null);
  });
}
