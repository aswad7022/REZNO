import type { StoreStatus } from "@prisma/client";

import { COMMERCE_CURRENCY } from "@/features/commerce/domain/money";
import { isSafePublicImageUrl } from "@/lib/security/public-image-url";

export type StoreReadinessCheckKey =
  | "organization_active"
  | "lifecycle_valid"
  | "identity_valid"
  | "images_safe"
  | "support_phone_valid"
  | "currency_supported"
  | "money_valid"
  | "estimates_valid"
  | "fulfillment_enabled"
  | "delivery_complete"
  | "pickup_complete";

export interface StoreReadinessInput {
  organizationActive: boolean;
  status: StoreStatus;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  supportPhone: string | null;
  currency: string;
  deliveryFee: { isInteger(): boolean; isNegative(): boolean };
  minimumOrderValue: { isInteger(): boolean; isNegative(): boolean };
  preparationEstimateMinutes: number | null;
  deliveryEstimateMinutes: number | null;
  deliveryEnabled: boolean;
  deliveryCity: string | null;
  deliveryArea: string | null;
  pickupEnabled: boolean;
  pickupCity: string | null;
  pickupArea: string | null;
  pickupStreet: string | null;
}

export function evaluateStoreReadiness(store: StoreReadinessInput) {
  const boundedEstimate = (value: number | null) =>
    value === null || (Number.isInteger(value) && value >= 1 && value <= 10_080);
  const checks: Array<{ key: StoreReadinessCheckKey; ready: boolean }> = [
    { key: "organization_active", ready: store.organizationActive },
    { key: "lifecycle_valid", ready: store.status !== "ARCHIVED" },
    {
      key: "identity_valid",
      ready:
        store.name.trim().length >= 2 &&
        store.name.trim().length <= 120 &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(store.slug) &&
        store.slug.length <= 80 &&
        (!store.description || store.description.length <= 4_000),
    },
    {
      key: "images_safe",
      ready:
        (!store.logoUrl || isSafePublicImageUrl(store.logoUrl)) &&
        (!store.coverImageUrl || isSafePublicImageUrl(store.coverImageUrl)),
    },
    {
      key: "support_phone_valid",
      ready: !store.supportPhone || /^\+?[1-9]\d{6,14}$/.test(store.supportPhone),
    },
    { key: "currency_supported", ready: store.currency === COMMERCE_CURRENCY },
    {
      key: "money_valid",
      ready:
        !store.deliveryFee.isNegative() && store.deliveryFee.isInteger() &&
        !store.minimumOrderValue.isNegative() && store.minimumOrderValue.isInteger(),
    },
    {
      key: "estimates_valid",
      ready:
        boundedEstimate(store.preparationEstimateMinutes) &&
        boundedEstimate(store.deliveryEstimateMinutes),
    },
    { key: "fulfillment_enabled", ready: store.deliveryEnabled || store.pickupEnabled },
    {
      key: "delivery_complete",
      ready: !store.deliveryEnabled || Boolean(store.deliveryCity && store.deliveryArea),
    },
    {
      key: "pickup_complete",
      ready: !store.pickupEnabled || Boolean(store.pickupCity && store.pickupArea && store.pickupStreet),
    },
  ];
  return {
    checks,
    missing: checks.filter((check) => !check.ready).map((check) => check.key),
    ready: checks.every((check) => check.ready),
  };
}
