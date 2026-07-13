import type { NextRequest } from "next/server";

import { serializeCart } from "@/features/commerce/api/dto";
import { commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseCartItemUpdate, parseCartVersionRequest, parseRouteUuid } from "@/features/commerce/api/validation";
import { removeCartItem, updateCartItemQuantity } from "@/features/commerce/services/cart-service";

export const dynamic = "force-dynamic";

export function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ cartItemId: string }> },
) {
  return handleCustomerCommerceRequest(request, "cart.mutate", async ({ personId }) => {
    const cartItemId = parseRouteUuid((await params).cartItemId, "cartItemId");
    return commerceData(serializeCart(await updateCartItemQuantity(personId, {
      cartItemId,
      ...(await parseCartItemUpdate(request)),
    })));
  });
}

export function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ cartItemId: string }> },
) {
  return handleCustomerCommerceRequest(request, "cart.mutate", async ({ personId }) => {
    const cartItemId = parseRouteUuid((await params).cartItemId, "cartItemId");
    const expectedVersion = await parseCartVersionRequest(request);
    return commerceData(serializeCart(await removeCartItem(personId, { cartItemId, expectedVersion })));
  });
}
