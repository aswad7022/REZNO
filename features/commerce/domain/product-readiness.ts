import type { Prisma } from "@prisma/client";

import { isCommerceAmountWithinPersistenceCapacity } from "@/features/commerce/domain/money";
import { isSafePublicImageUrl } from "@/lib/security/public-image-url";

export const PRODUCT_READINESS_KEYS = [
  "organization.active",
  "store.active",
  "category.active",
  "product.identity",
  "variants.present",
  "variants.default",
  "variants.valid",
  "media.safe",
] as const;

export type ProductReadinessKey = (typeof PRODUCT_READINESS_KEYS)[number];

export interface ProductReadinessInput {
  categoryStatus: string;
  description: string | null;
  media: readonly { url: string }[];
  name: string;
  organization: { deletedAt: Date | null; isActive: boolean; status: string };
  productArchivedAt: Date | null;
  slug: string;
  store: { archivedAt: Date | null; publishedAt: Date | null; status: string };
  variants: readonly {
    archivedAt: Date | null;
    compareAtPrice: Prisma.Decimal | null;
    currency: string;
    inventory: { id: string } | null;
    isDefault: boolean;
    optionKey: string;
    price: Prisma.Decimal;
    sku: string;
    status: string;
  }[];
}

export function evaluateProductReadiness(input: ProductReadinessInput) {
  const active = input.variants.filter(
    (variant) => variant.status === "ACTIVE" && variant.archivedAt === null,
  );
  const checks: Record<ProductReadinessKey, boolean> = {
    "organization.active":
      input.organization.status === "ACTIVE" &&
      input.organization.isActive &&
      input.organization.deletedAt === null,
    "store.active":
      input.store.status === "ACTIVE" &&
      input.store.archivedAt === null &&
      input.store.publishedAt !== null,
    "category.active": input.categoryStatus === "ACTIVE",
    "product.identity":
      input.productArchivedAt === null &&
      input.name.trim().length >= 2 &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) &&
      (input.description?.length ?? 0) <= 8_000,
    "variants.present": active.length > 0,
    "variants.default": active.filter((variant) => variant.isDefault).length === 1,
    "variants.valid": active.every(
      (variant) =>
        Boolean(variant.sku && variant.optionKey && variant.inventory) &&
        variant.currency === "IQD" &&
        variant.price.isInteger() &&
        variant.price.greaterThan(0) &&
        isCommerceAmountWithinPersistenceCapacity(variant.price) &&
        (!variant.compareAtPrice ||
          (variant.compareAtPrice.isInteger() &&
            variant.compareAtPrice.greaterThan(variant.price) &&
            isCommerceAmountWithinPersistenceCapacity(variant.compareAtPrice))),
    ),
    "media.safe": input.media.every((item) => isSafePublicImageUrl(item.url)),
  };
  const missing = PRODUCT_READINESS_KEYS.filter((key) => !checks[key]);
  return { checks, missing, ready: missing.length === 0 };
}
