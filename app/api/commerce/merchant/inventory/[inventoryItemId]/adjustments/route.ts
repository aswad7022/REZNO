import type { NextRequest } from "next/server";

import { serializeMerchantInventory } from "@/features/commerce/api/dto";
import { commerceData, handleMerchantCommerceRequest } from "@/features/commerce/api/http";
import { parseInventoryAdjustment, parseRouteUuid } from "@/features/commerce/api/validation";
import { adjustInventory } from "@/features/commerce/services/inventory-service";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inventoryItemId: string }> },
) {
  return handleMerchantCommerceRequest(request, "inventory.adjust", "INVENTORY_ADJUST", async (context) => {
    const inventoryItemId = parseRouteUuid((await params).inventoryItemId, "inventoryItemId");
    const input = await parseInventoryAdjustment(request);
    await adjustInventory(
      {
        contextOrganizationId: context.organizationId,
        membershipId: context.membershipId,
        personId: context.personId,
      },
      {
        idempotencyKey: input.operationKey,
        inventoryItemId,
        quantityDelta: input.delta,
        reason: input.reason,
      },
    );
    const inventory = await prisma.inventoryItem.findFirst({
      where: {
        id: inventoryItemId,
        variant: { store: { organizationId: context.organizationId } },
      },
      include: { variant: { include: { product: true } } },
    });
    if (!inventory) throw new Error("Adjusted inventory could not be reloaded.");
    return commerceData(serializeMerchantInventory(inventory));
  }, { limit: 30 });
}
