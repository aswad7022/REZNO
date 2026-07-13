import type { NextRequest } from "next/server";

import { serializeCart } from "@/features/commerce/api/dto";
import { commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseAddCartItem } from "@/features/commerce/api/validation";
import { addCartItem } from "@/features/commerce/services/cart-service";

export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return handleCustomerCommerceRequest(request, "cart.mutate", async ({ personId }) =>
    commerceData(serializeCart(await addCartItem(personId, await parseAddCartItem(request)))),
  );
}
