import "server-only";

import { Prisma } from "@prisma/client";

import { mediaError } from "@/features/media/domain/errors";
import { mediaSlotPolicy } from "@/features/media/domain/slot-registry";
import { isUuid } from "@/features/storage/domain/policy";
import { createDownloadTarget } from "@/features/storage/services/storage-assets";
import type { StorageBusinessActor, StorageCustomerActor } from "@/features/storage/services/actor";
import { assertStorageActorCurrent } from "@/features/storage/services/actor";
import { mediaSerializable } from "@/features/media/services/transaction";
import { resolveWritableMediaTarget } from "@/features/media/services/targets";

export async function createPublicMediaDownloadTarget(assetId: string) {
  if (!isUuid(assetId)) mediaError("VALIDATION_ERROR", "assetId must be a UUID.");
  await assertPublicBinding(assetId);
  const target = await createDownloadTarget(null, assetId);
  await assertPublicBinding(assetId);
  return target;
}

export async function createPrivateAvatarDownloadTarget(actor: StorageCustomerActor, assetId: string) {
  if (!isUuid(assetId)) mediaError("VALIDATION_ERROR", "assetId must be a UUID.");
  await assertPrivateAvatarBinding(actor, assetId);
  const target = await createDownloadTarget(actor, assetId);
  await assertPrivateAvatarBinding(actor, assetId);
  return target;
}

async function assertPrivateAvatarBinding(actor: StorageCustomerActor, assetId: string) {
  await mediaSerializable(async (transaction) => {
    await assertStorageActorCurrent(transaction, actor);
    const binding = await transaction.mediaBinding.findFirst({
      where: {
        assetId,
        slot: "CUSTOMER_AVATAR",
        state: "ACTIVE",
        container: { kind: "CUSTOMER_PROFILE", personId: actor.personId },
        asset: { ownerPersonId: actor.personId, organizationId: null, state: "READY", visibility: "PRIVATE" },
      },
      select: { id: true },
    });
    if (!binding) mediaError("NOT_FOUND", "Customer avatar was not found.");
  });
}

export async function createBusinessMediaDownloadTarget(actor: StorageBusinessActor, assetId: string) {
  if (!isUuid(assetId)) mediaError("VALIDATION_ERROR", "assetId must be a UUID.");
  await assertBusinessBinding(actor, assetId);
  const target = await createDownloadTarget(actor, assetId);
  await assertBusinessBinding(actor, assetId);
  return target;
}

async function assertBusinessBinding(actor: StorageBusinessActor, assetId: string) {
  await mediaSerializable(async (transaction) => {
    await assertStorageActorCurrent(transaction, actor);
    const binding = await transaction.mediaBinding.findFirst({
      where: {
        assetId,
        state: "ACTIVE",
        container: { organizationId: actor.organizationId },
        asset: {
          organizationId: actor.organizationId,
          ownerPersonId: null,
          state: "READY",
          visibility: "PUBLIC",
        },
      },
      include: { asset: true, container: true },
    });
    if (!binding
      || binding.asset.purpose !== mediaSlotPolicy(binding.slot).purpose
      || !mediaSlotPolicy(binding.slot).publicDeliveryAllowed) {
      mediaError("NOT_FOUND", "Business media was not found.");
    }
    await resolveWritableMediaTarget(transaction, actor, businessTarget(binding.container));
  });
}

function businessTarget(container: {
  kind: string;
  menuItemId: string | null;
  productId: string | null;
  serviceId: string | null;
  storeId: string | null;
}) {
  switch (container.kind) {
    case "BUSINESS_PROFILE": return { kind: "BUSINESS_PROFILE" } as const;
    case "SERVICE": return { kind: "SERVICE", serviceId: container.serviceId! } as const;
    case "STORE": return { kind: "STORE", storeId: container.storeId! } as const;
    case "PRODUCT": return { kind: "PRODUCT", productId: container.productId! } as const;
    case "MENU_ITEM": return { kind: "MENU_ITEM", menuItemId: container.menuItemId! } as const;
    default: mediaError("NOT_FOUND", "Business media was not found.");
  }
}

async function assertPublicBinding(assetId: string) {
  return mediaSerializable(async (transaction) => {
    const binding = await transaction.mediaBinding.findFirst({
      where: { assetId, state: "ACTIVE" },
      include: { asset: true, container: true },
    });
    if (!binding
      || binding.asset.state !== "READY"
      || binding.asset.visibility !== "PUBLIC"
      || binding.asset.purpose !== mediaSlotPolicy(binding.slot).purpose
      || !mediaSlotPolicy(binding.slot).publicDeliveryAllowed
      || !(await publicTargetIsLegal(transaction, binding.container))) {
      mediaError("NOT_FOUND", "Public media was not found.");
    }
  });
}

async function publicTargetIsLegal(transaction: Prisma.TransactionClient, container: {
  kind: string;
  menuItemId: string | null;
  organizationId: string | null;
  productId: string | null;
  serviceId: string | null;
  storeId: string | null;
}) {
  switch (container.kind) {
    case "BUSINESS_PROFILE":
      return Boolean(await transaction.organization.findFirst({
        where: {
          id: container.organizationId!,
          deletedAt: null,
          isActive: true,
          status: "ACTIVE",
          settings: { bookingEnabled: true, marketplaceVisible: true },
        },
        select: { id: true },
      }));
    case "SERVICE":
      return Boolean(await transaction.service.findFirst({
        where: {
          id: container.serviceId!, deletedAt: null, status: "ACTIVE",
          organization: {
            deletedAt: null,
            isActive: true,
            status: "ACTIVE",
            settings: { bookingEnabled: true, marketplaceVisible: true },
          },
        }, select: { id: true },
      }));
    case "STORE":
      return Boolean(await transaction.store.findFirst({
        where: {
          id: container.storeId!,
          archivedAt: null,
          publishedAt: { not: null },
          status: "ACTIVE",
          organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
        },
        select: { id: true },
      }));
    case "PRODUCT":
      return Boolean(await transaction.product.findFirst({
        where: {
          id: container.productId!,
          archivedAt: null,
          category: { status: "ACTIVE" },
          publishedAt: { not: null },
          status: "PUBLISHED",
          store: {
            archivedAt: null,
            publishedAt: { not: null },
            status: "ACTIVE",
            organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
          },
          variants: { some: { archivedAt: null, status: "ACTIVE" } },
        },
        select: { id: true },
      }));
    case "MENU_ITEM":
      return Boolean(await transaction.menuItem.findFirst({
        where: {
          id: container.menuItemId!,
          isAvailable: true,
          category: { businessId: container.organizationId!, isActive: true },
          business: {
            deletedAt: null,
            isActive: true,
            status: "ACTIVE",
            settings: { bookingEnabled: true, marketplaceVisible: true },
          },
        },
        select: { id: true },
      }));
    default:
      return false;
  }
}
