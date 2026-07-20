import "server-only";

import { Prisma, type MediaContainer, type MediaContainerKind } from "@prisma/client";

import { mediaError } from "@/features/media/domain/errors";
import type { MediaTarget } from "@/features/media/domain/policy";
import type { StorageActor } from "@/features/storage/services/actor";
import { assertStorageActorCurrent } from "@/features/storage/services/actor";

export async function resolveWritableMediaTarget(
  transaction: Prisma.TransactionClient,
  actor: StorageActor,
  target: MediaTarget,
) {
  await assertStorageActorCurrent(transaction, actor);
  if (target.kind === "CUSTOMER_PROFILE") {
    if (actor.kind !== "customer") mediaError("FORBIDDEN", "Customer media belongs to the current Person.");
    return {
      kind: target.kind,
      organizationId: null,
      create: { kind: target.kind, personId: actor.personId },
      where: { kind: target.kind, personId: actor.personId },
    } as const;
  }
  if (actor.kind !== "business") mediaError("FORBIDDEN", "Business media requires an active Owner or Manager.");
  const organizationId = actor.organizationId;
  switch (target.kind) {
    case "BUSINESS_PROFILE":
      return {
        kind: target.kind,
        organizationId,
        create: { kind: target.kind, organizationId },
        where: { kind: target.kind, organizationId },
      } as const;
    case "SERVICE": {
      const service = await transaction.service.findFirst({
        where: { id: target.serviceId, organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
        select: { id: true },
      });
      if (!service) mediaError("NOT_FOUND", "Service was not found.");
      return {
        kind: target.kind,
        organizationId,
        create: { kind: target.kind, organizationId, serviceId: service.id },
        where: { kind: target.kind, serviceId: service.id },
      } as const;
    }
    case "STORE": {
      const store = await transaction.store.findFirst({
        where: { id: target.storeId, organizationId, status: { not: "ARCHIVED" } },
        select: { id: true },
      });
      if (!store) mediaError("NOT_FOUND", "Store was not found.");
      return {
        kind: target.kind,
        organizationId,
        create: { kind: target.kind, organizationId, storeId: store.id },
        where: { kind: target.kind, storeId: store.id },
      } as const;
    }
    case "PRODUCT": {
      const product = await transaction.product.findFirst({
        where: {
          id: target.productId,
          status: { not: "ARCHIVED" },
          store: { organizationId, status: { not: "ARCHIVED" } },
        },
        select: { id: true },
      });
      if (!product) mediaError("NOT_FOUND", "Product was not found.");
      return {
        kind: target.kind,
        organizationId,
        create: { kind: target.kind, organizationId, productId: product.id },
        where: { kind: target.kind, productId: product.id },
      } as const;
    }
    case "MENU_ITEM": {
      const menuItem = await transaction.menuItem.findFirst({
        where: {
          id: target.menuItemId,
          businessId: organizationId,
          category: { businessId: organizationId },
        },
        select: { id: true },
      });
      if (!menuItem) mediaError("NOT_FOUND", "Menu item was not found.");
      return {
        kind: target.kind,
        organizationId,
        create: { kind: target.kind, organizationId, menuItemId: menuItem.id },
        where: { kind: target.kind, menuItemId: menuItem.id },
      } as const;
    }
  }
}

export async function findAndLockContainer(
  transaction: Prisma.TransactionClient,
  where: Prisma.MediaContainerWhereInput,
) {
  const candidate = await transaction.mediaContainer.findFirst({ where, select: { id: true } });
  if (!candidate) return null;
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "MediaContainer" WHERE "id" = ${candidate.id}::uuid FOR UPDATE`,
  );
  return transaction.mediaContainer.findUnique({ where: { id: candidate.id } });
}

export async function assertProductVariant(
  transaction: Prisma.TransactionClient,
  container: MediaContainer,
  variantId: string | null,
) {
  if (!variantId) return null;
  if (container.kind !== "PRODUCT" || !container.productId) {
    mediaError("VALIDATION_ERROR", "Product variants are only legal for Product media.");
  }
  const variant = await transaction.productVariant.findFirst({
    where: {
      id: variantId,
      productId: container.productId,
      status: { not: "ARCHIVED" },
      product: { id: container.productId, store: { organizationId: container.organizationId! } },
    },
    select: { id: true },
  });
  if (!variant) mediaError("NOT_FOUND", "Product variant was not found.");
  return variant.id;
}

export function mediaContainerTargetWhere(
  kind: MediaContainerKind,
  id: string,
): Prisma.MediaContainerWhereInput {
  switch (kind) {
    case "CUSTOMER_PROFILE": return { kind, personId: id };
    case "BUSINESS_PROFILE": return { kind, organizationId: id };
    case "SERVICE": return { kind, serviceId: id };
    case "STORE": return { kind, storeId: id };
    case "PRODUCT": return { kind, productId: id };
    case "MENU_ITEM": return { kind, menuItemId: id };
  }
}
