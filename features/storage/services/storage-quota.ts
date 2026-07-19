import "server-only";

import { Prisma, type StoragePurpose } from "@prisma/client";

import {
  ACTIVE_SESSION_RESERVATION_STATES,
  PROVIDER_RESIDENT_ASSET_STATES,
  purposeQuotaUsage,
} from "@/features/storage/domain/quota";
import type { StorageActor, StorageAdminActor } from "@/features/storage/services/actor";

export type StorageQuotaActor = StorageActor | StorageAdminActor;

export function storageQuotaOwnerFilter(actor: StorageQuotaActor) {
  if (actor.kind === "customer") {
    return {
      asset: { organizationId: null, ownerPersonId: actor.personId },
      session: { organizationId: null, ownerPersonId: actor.personId },
    } satisfies {
      asset: Prisma.StoredAssetWhereInput;
      session: Prisma.UploadSessionWhereInput;
    };
  }
  if (actor.kind === "business") {
    return {
      asset: { organizationId: actor.organizationId },
      session: { organizationId: actor.organizationId },
    } satisfies {
      asset: Prisma.StoredAssetWhereInput;
      session: Prisma.UploadSessionWhereInput;
    };
  }
  return {
    asset: {
      createdByPersonId: actor.personId,
      organizationId: null,
      ownerPersonId: null,
    },
    session: {
      actorPersonId: actor.personId,
      organizationId: null,
      ownerPersonId: null,
    },
  } satisfies {
    asset: Prisma.StoredAssetWhereInput;
    session: Prisma.UploadSessionWhereInput;
  };
}

export async function readPurposeQuotaUsage(
  transaction: Prisma.TransactionClient,
  actor: StorageQuotaActor,
  purpose: StoragePurpose,
  now: Date,
) {
  const owner = storageQuotaOwnerFilter(actor);
  const [stored, reserved] = await Promise.all([
    transaction.storedAsset.count({
      where: {
        ...owner.asset,
        purpose,
        state: { in: [...PROVIDER_RESIDENT_ASSET_STATES] },
      },
    }),
    transaction.uploadSession.count({
      where: {
        ...owner.session,
        expiresAt: { gt: now },
        purpose,
        state: { in: [...ACTIVE_SESSION_RESERVATION_STATES] },
      },
    }),
  ]);
  return { reserved, stored, used: purposeQuotaUsage(stored, reserved) };
}
