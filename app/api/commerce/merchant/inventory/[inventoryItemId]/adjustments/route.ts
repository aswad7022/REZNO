import type { NextRequest } from "next/server";

import { serializeMerchantInventory } from "@/features/commerce/api/dto";
import { commerceData, handleMerchantCommerceRequest } from "@/features/commerce/api/http";
import { parseInventoryAdjustment, parseRouteUuid } from "@/features/commerce/api/validation";
import { adjustInventory } from "@/features/commerce/services/inventory-service";

export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inventoryItemId: string }> },
) {
  return handleMerchantCommerceRequest(request, "inventory.adjust", "INVENTORY_ADJUST", async (context) => {
    const inventoryItemId = parseRouteUuid((await params).inventoryItemId, "inventoryItemId");
    const input = await parseInventoryAdjustment(request);
    const inventory = await adjustInventory(
      {
        contextOrganizationId: context.organizationId,
        membershipId: context.membershipId,
        personId: context.personId,
      },
      {
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.operationKey,
        inventoryItemId,
        quantityDelta: input.delta,
        reason: input.reason,
      },
    );
    return commerceData(serializeMerchantInventory(inventory));
  }, { limit: 30 });
}
