import type { NextRequest } from "next/server";

import { serializeCustomerAddress } from "@/features/commerce/api/dto";
import { commerceData, handleCustomerCommerceRequest } from "@/features/commerce/api/http";
import { parseRouteUuid } from "@/features/commerce/api/validation";
import { setDefaultCustomerAddress } from "@/features/commerce/services/customer-service";

export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ addressId: string }> },
) {
  return handleCustomerCommerceRequest(request, "addresses.mutate", async ({ personId }) => {
    const addressId = parseRouteUuid((await params).addressId, "addressId");
    return commerceData(serializeCustomerAddress(await setDefaultCustomerAddress(personId, addressId)));
  }, { limit: 30 });
}
