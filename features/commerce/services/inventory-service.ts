import { commerceError } from "@/features/commerce/domain/errors";
import { resolveMerchantCommerceContext } from "@/features/commerce/services/authorization";
import type { MerchantIdentityInput } from "@/features/commerce/services/store-service";
import {
  lockInventoryItems,
  runCommerceSerializable,
} from "@/features/commerce/services/transaction";

export async function adjustInventory(
  identity: MerchantIdentityInput,
  input: {
    idempotencyKey: string;
    quantityDelta: number;
    reason: string;
    variantId: string;
  },
) {
  if (!Number.isInteger(input.quantityDelta) || input.quantityDelta === 0) {
    commerceError("VALIDATION_ERROR", "Inventory adjustment must be a nonzero integer.");
  }
  const reason = input.reason.trim();
  if (reason.length < 2 || reason.length > 500) {
    commerceError("VALIDATION_ERROR", "Inventory adjustment requires a reason.");
  }
  if (input.idempotencyKey.trim().length < 8 || input.idempotencyKey.length > 200) {
    commerceError("VALIDATION_ERROR", "Inventory adjustment idempotency key is invalid.");
  }

  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "INVENTORY_ADJUST", transaction);
    const existingMovement = await transaction.stockMovement.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { inventoryItem: true },
    });
    if (existingMovement) return existingMovement.inventoryItem;

    const inventory = await transaction.inventoryItem.findFirst({
      where: {
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
        idempotencyKey: input.idempotencyKey,
        inventoryItemId: locked.id,
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
