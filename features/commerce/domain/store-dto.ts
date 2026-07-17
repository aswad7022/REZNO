import type { Prisma } from "@prisma/client";

import { decimalString } from "@/features/commerce/domain/money";
import { evaluateStoreReadiness } from "@/features/commerce/domain/store-readiness";

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
  return {
    archiveReason: store.archiveReason,
    archivedAt: store.archivedAt?.toISOString() ?? null,
    coverImageUrl: store.coverImageUrl,
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
    logoUrl: store.logoUrl,
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

export function adminReviewStoreDto(
  store: MerchantStoreRecord,
  input: {
    audit: Array<{ action: string; createdAt: Date; id: string }>;
    counts: { inventory: number; orders: number; products: number };
    canReview: boolean;
  },
) {
  const publicVisible =
    store.status === "ACTIVE" &&
    store.publishedAt !== null &&
    store.archivedAt === null &&
    store.organization.deletedAt === null &&
    store.organization.isActive &&
    store.organization.status === "ACTIVE";
  return {
    audit: input.audit.map((entry) => ({
      action: entry.action,
      createdAt: entry.createdAt.toISOString(),
      id: entry.id,
    })),
    counts: input.counts,
    expectedVersion: store.updatedAt.toISOString(),
    organization: { id: store.organization.id, name: store.organization.name },
    permittedActions: input.canReview
      ? {
          approve: store.status === "PENDING_REVIEW",
          reactivate: store.status === "SUSPENDED",
          reject: store.status === "PENDING_REVIEW",
          suspend: store.status === "ACTIVE",
        }
      : { approve: false, reactivate: false, reject: false, suspend: false },
    profile: ownerManagementStoreDto(store),
    publicVisible,
  };
}
