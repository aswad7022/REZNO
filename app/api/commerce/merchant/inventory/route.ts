import type { NextRequest } from "next/server";

import { serializeMerchantInventory } from "@/features/commerce/api/dto";
import { commerceCollection, handleMerchantCommerceRequest } from "@/features/commerce/api/http";
import { parseMerchantInventoryQuery } from "@/features/commerce/api/validation";
import { listMerchantInventory } from "@/features/commerce/services/merchant-inventory-service";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleMerchantCommerceRequest(request, "inventory.read", "INVENTORY_VIEW", async (context) => {
    const result = await listMerchantInventory(
      {
        contextOrganizationId: context.organizationId,
        membershipId: context.membershipId,
        personId: context.personId,
      },
      parseMerchantInventoryQuery(request.nextUrl.searchParams),
    );
    return commerceCollection(result.data.map(serializeMerchantInventory), result.pageInfo);
  }, { limit: 120 });
}
