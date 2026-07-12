import { createHash } from "node:crypto";

import { commerceError } from "@/features/commerce/domain/errors";
import { canonicalRequestJson } from "@/features/commerce/domain/idempotency";
import { resolveMerchantCommerceContext } from "@/features/commerce/services/authorization";
import type { MerchantIdentityInput } from "@/features/commerce/services/store-service";
import { lockInventoryItems, runCommerceSerializable } from "@/features/commerce/services/transaction";

export async function adjustInventory(
  identity: MerchantIdentityInput,
  input: {
    idempotencyKey: string;
    inventoryItemId?: string;
    quantityDelta: number;
    reason: string;
    variantId?: string;
  },
) {
  if (!Number.isInteger(input.quantityDelta) || input.quantityDelta === 0) {
    commerceError("VALIDATION_ERROR", "Inventory adjustment must be a nonzero integer.");
  }
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length < 2 || reason.length > 500) {
    commerceError("VALIDATION_ERROR", "Inventory adjustment requires a reason.");
  }
  if (input.idempotencyKey.trim().length < 8 || input.idempotencyKey.length > 200) {
    commerceError("VALIDATION_ERROR", "Inventory adjustment idempotency key is invalid.");
  }
  if (Boolean(input.inventoryItemId) === Boolean(input.variantId)) {
    commerceError("VALIDATION_ERROR", "Exactly one Inventory or Variant target is required.");
  }

  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "INVENTORY_ADJUST", transaction);
    const movementKey = createHash("sha256")
      .update(`inventory-adjust:${context.organizationId}:${input.idempotencyKey.trim()}`)
      .digest("hex");
    const existingMovement = await transaction.stockMovement.findUnique({
      where: { idempotencyKey: movementKey },
      include: { inventoryItem: true },
    });
    if (existingMovement) {
      const sameRequest =
        existingMovement.actorId === context.personId &&
        existingMovement.inventoryItemId === (input.inventoryItemId ?? existingMovement.inventoryItemId) &&
        existingMovement.onHandDelta === input.quantityDelta &&
        existingMovement.reason === reason &&
        (!input.variantId || existingMovement.inventoryItem.variantId === input.variantId);
      if (!sameRequest) commerceError("INVENTORY_CONFLICT", "Operation key was used for another adjustment.");
      return existingMovement.inventoryItem;
    }

    const inventory = await transaction.inventoryItem.findFirst({
      where: {
        id: input.inventoryItemId,
        variantId: input.variantId,
        variant: { store: { organizationId: context.organizationId } },
      },
    });
    if (!inventory) commerceError("NOT_FOUND", "Inventory item was not found.");
    await lockInventoryItems(transaction, [inventory.id]);
    const locked = await transaction.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
    const resultingOnHand = locked.onHand + input.quantityDelta;
    if (resultingOnHand < locked.reserved || resultingOnHand < 0) {
      commerceError("INSUFFICIENT_STOCK", "Adjustment would make inventory invalid.");
    }
    const updated = await transaction.inventoryItem.update({
      where: { id: locked.id },
      data: { onHand: resultingOnHand, version: { increment: 1 } },
    });
    await transaction.stockMovement.create({
      data: {
        actorId: context.personId,
        actorType: "MERCHANT",
        idempotencyKey: movementKey,
        inventoryItemId: locked.id,
        metadata: {
          request: canonicalRequestJson({
            inventoryItemId: inventory.id,
            quantityDelta: input.quantityDelta,
            reason,
          }),
        },
        onHandDelta: input.quantityDelta,
        quantity: Math.abs(input.quantityDelta),
        reason,
        reservedDelta: 0,
        resultingOnHand,
        resultingReserved: locked.reserved,
        type: input.quantityDelta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
      },
    });
    return updated;
  });
}
