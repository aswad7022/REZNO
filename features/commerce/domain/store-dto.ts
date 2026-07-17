import type { Prisma } from "@prisma/client";

import { decimalString } from "@/features/commerce/domain/money";
import { evaluateStoreReadiness } from "@/features/commerce/domain/store-readiness";
import {
  isSafePublicImageUrl,
  safePublicImageUrlOrNull,
} from "@/lib/security/public-image-url";

export const merchantStoreInclude = {
  organization: {
    select: { deletedAt: true, id: true, isActive: true, name: true, status: true },
  },
} satisfies Prisma.StoreInclude;

export type MerchantStoreRecord = Prisma.StoreGetPayload<{ include: typeof merchantStoreInclude }>;

export function storeReadiness(store: MerchantStoreRecord) {
  return evaluateStoreReadiness({
    ...store,
    organizationActive:
      store.organization.deletedAt === null &&
      store.organization.isActive &&
      store.organization.status === "ACTIVE",
  });
}

export function ownerManagementStoreDto(store: MerchantStoreRecord) {
  const unsafeCoverPresent = Boolean(store.coverImageUrl && !isSafePublicImageUrl(store.coverImageUrl));
  const unsafeLogoPresent = Boolean(store.logoUrl && !isSafePublicImageUrl(store.logoUrl));
  return {
    archiveReason: store.archiveReason,
    archivedAt: store.archivedAt?.toISOString() ?? null,
    coverImageUrl: safePublicImageUrlOrNull(store.coverImageUrl),
    createdAt: store.createdAt.toISOString(),
    currency: store.currency,
    deliveryArea: store.deliveryArea,
    deliveryCity: store.deliveryCity,
    deliveryEnabled: store.deliveryEnabled,
    deliveryEstimateMinutes: store.deliveryEstimateMinutes,
    deliveryFee: store.deliveryFee.toFixed(0),
    description: store.description,
    expectedVersion: store.updatedAt.toISOString(),
    id: store.id,
    logoUrl: safePublicImageUrlOrNull(store.logoUrl),
    minimumOrderValue: store.minimumOrderValue.toFixed(0),
    name: store.name,
    organizationName: store.organization.name,
    pickupAdditionalDetails: store.pickupAdditionalDetails,
    pickupArea: store.pickupArea,
    pickupCity: store.pickupCity,
    pickupEnabled: store.pickupEnabled,
    pickupInstructions: store.pickupInstructions,
    pickupStreet: store.pickupStreet,
    preparationEstimateMinutes: store.preparationEstimateMinutes,
    publishedAt: store.publishedAt?.toISOString() ?? null,
    readiness: storeReadiness(store),
    reviewReason: store.reviewReason,
    reviewedAt: store.reviewedAt?.toISOString() ?? null,
    slug: store.slug,
    status: store.status,
    submittedAt: store.submittedAt?.toISOString() ?? null,
    supportPhone: store.supportPhone,
    suspendedAt: store.suspendedAt?.toISOString() ?? null,
    suspensionReason: store.suspensionReason,
    unsafeCoverPresent,
    unsafeLogoPresent,
  };
}

export function merchantReadOnlyStoreDto(store: MerchantStoreRecord) {
  return {
    currency: store.currency,
    deliveryArea: store.deliveryArea,
    deliveryCity: store.deliveryCity,
    deliveryEnabled: store.deliveryEnabled,
    deliveryEstimateMinutes: store.deliveryEstimateMinutes,
    deliveryFee: decimalString(store.deliveryFee),
    id: store.id,
    minimumOrderValue: decimalString(store.minimumOrderValue),
    name: store.name,
    pickupArea: store.pickupArea,
    pickupCity: store.pickupCity,
    pickupEnabled: store.pickupEnabled,
    pickupInstructions: store.pickupInstructions,
    pickupStreet: store.pickupStreet,
    preparationEstimateMinutes: store.preparationEstimateMinutes,
    slug: store.slug,
    status: store.status,
    supportPhone: store.supportPhone,
  };
}
