import type { NextRequest } from "next/server";

import { serializeCustomerAddress } from "@/features/commerce/api/dto";
import { commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseAddressUpdate, parseRouteUuid } from "@/features/commerce/api/validation";
import { archiveCustomerAddress, updateCustomerAddress } from "@/features/commerce/services/customer-service";

export const dynamic = "force-dynamic";

export function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ addressId: string }> },
) {
  return handleCustomerCommerceRequest(request, "addresses.mutate", async ({ personId }) => {
    const addressId = parseRouteUuid((await params).addressId, "addressId");
    return commerceData(serializeCustomerAddress(await updateCustomerAddress(personId, addressId, await parseAddressUpdate(request))));
  }, { limit: 30 });
}

export function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ addressId: string }> },
) {
  return handleCustomerCommerceRequest(request, "addresses.mutate", async ({ personId }) => {
    const addressId = parseRouteUuid((await params).addressId, "addressId");
    await archiveCustomerAddress(personId, addressId);
    return commerceData({ deleted: true, id: addressId });
  }, { limit: 30 });
}
