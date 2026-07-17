import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import { commerceError } from "@/features/commerce/domain/errors";
import { canonicalRequestJson, hashCheckoutRequest } from "@/features/commerce/domain/idempotency";
import { checkedInventoryResult, POSTGRES_INT_MAX } from "@/features/commerce/domain/inventory";
import { updateInventoryThresholdSchema } from "@/features/commerce/domain/product-input";
import { serializeInventorySummary } from "@/features/commerce/domain/product-dto";
import {
  assertMerchantCommerceContextCurrent,
  assertRenderedMerchantOrganization,
  resolveMerchantCommerceContext,
  type MerchantActorReference,
} from "@/features/commerce/services/authorization";
import {
  recordMerchantMutation,
  resolveMerchantMutationReplay,
} from "@/features/commerce/services/merchant-mutation";
import { lockInventoryItems, runCommerceSerializable } from "@/features/commerce/services/transaction";

export const merchantInventoryInclude = {
  variant: {
    include: {
      product: {
        include: {
          media: {
            orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
            select: { url: true },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.InventoryItemInclude;

export type MerchantInventoryRecord = Prisma.InventoryItemGetPayload<{
  include: typeof merchantInventoryInclude;
}>;

export async function adjustInventory(
  identity: MerchantActorReference,
  input: {
    expectedVersion: number;
    idempotencyKey: string;
    inventoryItemId: string;
    quantityDelta: number;
    reason: string;
  },
) {
  if (
    !Number.isSafeInteger(input.quantityDelta) ||
    input.quantityDelta === 0 ||
    Math.abs(input.quantityDelta) > POSTGRES_INT_MAX
  ) {
    commerceError("VALIDATION_ERROR", "Inventory adjustment must be a bounded nonzero integer.");
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion > POSTGRES_INT_MAX) {
    commerceError("VALIDATION_ERROR", "Inventory expected version is invalid.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey)) {
    commerceError("VALIDATION_ERROR", "Inventory adjustment idempotency key must be a UUID.");
  }
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length < 2 || reason.length > 500) {
    commerceError("VALIDATION_ERROR", "Inventory adjustment requires a bounded reason.");
  }
  const requestJson = canonicalRequestJson({
    expectedVersion: input.expectedVersion,
    inventoryItemId: input.inventoryItemId,
    quantityDelta: input.quantityDelta,
    reason,
  });

  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "INVENTORY_ADJUST", transaction);
    const movementKey = createHash("sha256")
      .update(`inventory-adjust:${context.organizationId}:${input.idempotencyKey.toLowerCase()}`)
      .digest("hex");
    const existingMovement = await transaction.stockMovement.findUnique({
      where: { idempotencyKey: movementKey },
      include: { inventoryItem: { include: merchantInventoryInclude } },
    });
    if (existingMovement) {
      const metadata = jsonObject(existingMovement.metadata);
      if (
        existingMovement.actorId !== context.personId ||
        existingMovement.inventoryItemId !== input.inventoryItemId ||
        metadata.membershipId !== context.membershipId ||
        metadata.request !== requestJson
      ) {
        commerceError("INVENTORY_CONFLICT", "Operation key was used for another adjustment.");
      }
      return existingMovement.inventoryItem;
    }

    const inventory = await transaction.inventoryItem.findFirst({
      where: {
        id: input.inventoryItemId,
        variant: { store: { organizationId: context.organizationId } },
      },
      include: merchantInventoryInclude,
    });
    if (!inventory) commerceError("NOT_FOUND", "Inventory item was not found.");
    assertInventoryStoreMutable(inventory.variant.product.storeId, await transaction.store.findUnique({
      where: { id: inventory.variant.product.storeId },
      select: { status: true },
    }));
    await lockInventoryItems(transaction, [inventory.id]);
    await assertMerchantCommerceContextCurrent(transaction, context, "INVENTORY_ADJUST");
    const locked = await transaction.inventoryItem.findUniqueOrThrow({
      where: { id: inventory.id },
      include: merchantInventoryInclude,
    });
    if (locked.version !== input.expectedVersion) {
      commerceError("STALE_VERSION", "Inventory changed. Refresh and retry.");
    }
    if (locked.version >= POSTGRES_INT_MAX) {
      commerceError("VALIDATION_ERROR", "Inventory version exceeds persistence capacity.");
    }
    let resultingOnHand: number;
    try {
      resultingOnHand = checkedInventoryResult(locked.onHand, input.quantityDelta);
    } catch {
      commerceError("VALIDATION_ERROR", "Inventory adjustment exceeds persistence capacity.");
    }
    if (resultingOnHand < locked.reserved) {
      commerceError("INSUFFICIENT_STOCK", "Adjustment would move on-hand stock below reserved stock.");
    }
    const updated = await transaction.inventoryItem.update({
      where: { id: locked.id },
      data: { onHand: resultingOnHand, version: { increment: 1 } },
      include: merchantInventoryInclude,
    });
    await transaction.stockMovement.create({
      data: {
        actorId: context.personId,
        actorType: "MERCHANT",
        idempotencyKey: movementKey,
        inventoryItemId: locked.id,
        metadata: {
          membershipId: context.membershipId,
          request: requestJson,
          requestHash: createHash("sha256").update(requestJson).digest("hex"),
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
    await transaction.businessAuditLog.create({
      data: {
        action: "commerce.inventory.adjust",
        actorMembershipId: context.membershipId,
        actorPersonId: context.personId,
        after: {
          onHand: updated.onHand,
          reserved: updated.reserved,
          version: updated.version,
        },
        before: {
          onHand: locked.onHand,
          reserved: locked.reserved,
          version: locked.version,
        },
        organizationId: context.organizationId,
        targetId: locked.id,
        targetType: "InventoryItem",
      },
    });
    return updated;
  });
}

export async function updateInventoryThreshold(
  identity: MerchantActorReference,
  rawInput: unknown,
) {
  const parsed = updateInventoryThresholdSchema.safeParse(rawInput);
  if (!parsed.success) commerceError("VALIDATION_ERROR", "Inventory threshold input is invalid.");
  const input = parsed.data;
  const requestHash = hashCheckoutRequest({ action: "commerce.inventory.threshold", ...input });
  return runCommerceSerializable(async (transaction) => {
    const actor = await resolveMerchantCommerceContext(identity, "INVENTORY_ADJUST", transaction);
    assertRenderedMerchantOrganization(actor, input.contextOrganizationId);
    const replay = await resolveMerchantMutationReplay(transaction, {
      actor,
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) {
      if (replay.targetId !== input.inventoryItemId || !replay.result || typeof replay.result !== "object") {
        commerceError("IDEMPOTENCY_CONFLICT", "Inventory threshold replay target is invalid.");
      }
      return replay.result;
    }
    const scoped = await transaction.inventoryItem.findFirst({
      where: {
        id: input.inventoryItemId,
        variant: { store: { organizationId: actor.organizationId } },
      },
      select: { id: true },
    });
    if (!scoped) commerceError("NOT_FOUND", "Inventory item was not found.");
    await lockInventoryItems(transaction, [scoped.id]);
    const inventory = await transaction.inventoryItem.findFirst({
      where: {
        id: scoped.id,
        variant: { store: { organizationId: actor.organizationId } },
      },
      include: merchantInventoryInclude,
    });
    if (!inventory) commerceError("NOT_FOUND", "Inventory item was not found.");
    const store = await transaction.store.findUnique({
      where: { id: inventory.variant.product.storeId },
      select: { status: true },
    });
    assertInventoryStoreMutable(inventory.variant.product.storeId, store);
    if (inventory.version !== input.expectedVersion) {
      commerceError("STALE_VERSION", "Inventory changed. Refresh and retry.");
    }
    if (inventory.version >= POSTGRES_INT_MAX) {
      commerceError("VALIDATION_ERROR", "Inventory version exceeds persistence capacity.");
    }
    await assertMerchantCommerceContextCurrent(transaction, actor, "INVENTORY_ADJUST");
    const updated = await transaction.inventoryItem.update({
      where: { id: inventory.id },
      data: { lowStockThreshold: input.lowStockThreshold, version: { increment: 1 } },
      include: merchantInventoryInclude,
    });
    const result = serializeInventorySummary(updated);
    await recordMerchantMutation(transaction, {
      action: "commerce.inventory.threshold",
      actor,
      after: { lowStockThreshold: updated.lowStockThreshold, version: updated.version },
      before: { lowStockThreshold: inventory.lowStockThreshold, version: inventory.version },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result,
      resultVersion: updated.updatedAt,
      targetId: inventory.id,
      targetType: "InventoryItem",
    });
    return result;
  });
}

function assertInventoryStoreMutable(storeId: string, store: { status: string } | null) {
  if (!store) commerceError("NOT_FOUND", "Merchant Store was not found.");
  if (store.status === "PENDING_REVIEW" || store.status === "ARCHIVED") {
    commerceError("INVALID_TRANSITION", `Inventory is read-only while Store is ${store.status}.`, {
      storeId,
    });
  }
}

function jsonObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}
