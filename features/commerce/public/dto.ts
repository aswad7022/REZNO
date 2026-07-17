import type { Prisma } from "@prisma/client";

import { decimalString } from "@/features/commerce/domain/money";
import type {
  PublicCategoryDto,
  PublicProductDetailDto,
  PublicProductSummaryDto,
  PublicStoreSummaryDto,
} from "@/features/commerce/public/types";
import { safePublicImageUrlOrNull } from "@/lib/security/public-image-url";

export interface PublicStoreRecord {
  coverImageUrl: string | null;
  currency: string;
  deliveryArea: string | null;
  deliveryCity: string | null;
  deliveryEnabled: boolean;
  deliveryEstimateMinutes: number | null;
  deliveryFee: Prisma.Decimal;
  description: string | null;
  id: string;
  logoUrl: string | null;
  minimumOrderValue: Prisma.Decimal;
  name: string;
  pickupArea: string | null;
  pickupCity: string | null;
  pickupEnabled: boolean;
  pickupInstructions: string | null;
  preparationEstimateMinutes: number | null;
  slug: string;
}

export interface PublicProductRecord {
  category: { displayOrder: number; id: string; name: string; slug: string };
  description: string | null;
  id: string;
  media: Array<{
    altText: string | null;
    id: string;
    mediaType: "IMAGE" | "VIDEO";
    sortOrder: number;
    url: string;
  }>;
  name: string;
  slug: string;
  store: PublicStoreRecord;
  variants: Array<{
    compareAtPrice: Prisma.Decimal | null;
    currency: string;
    id: string;
    inventory: { onHand: number; reserved: number } | null;
    isDefault: boolean;
    optionValues: unknown;
    price: Prisma.Decimal;
    title: string;
  }>;
}

export function serializePublicCategory(value: PublicCategoryDto): PublicCategoryDto {
  return { displayOrder: value.displayOrder, id: value.id, name: value.name, slug: value.slug };
}

export function serializePublicStore(value: PublicStoreRecord): PublicStoreSummaryDto {
  return {
    coverImageUrl: safePublicImageUrlOrNull(value.coverImageUrl),
    currency: "IQD",
    delivery: {
      area: value.deliveryArea,
      city: value.deliveryCity,
      enabled: value.deliveryEnabled,
      estimateMinutes: value.deliveryEstimateMinutes,
      fee: decimalString(value.deliveryFee),
    },
    description: value.description,
    id: value.id,
    logoUrl: safePublicImageUrlOrNull(value.logoUrl),
    minimumOrderValue: decimalString(value.minimumOrderValue),
    name: value.name,
    pickup: {
      area: value.pickupArea,
      city: value.pickupCity,
      enabled: value.pickupEnabled,
      instructions: value.pickupInstructions,
    },
    preparationEstimateMinutes: value.preparationEstimateMinutes,
    slug: value.slug,
  };
}

export function serializePublicProductSummary(value: PublicProductRecord): PublicProductSummaryDto {
  const prices = value.variants.map((variant) => variant.price).sort((left, right) => left.comparedTo(right));
  const lowest = prices[0];
  const highest = prices.at(-1);
  if (!lowest || !highest) throw new Error("A public Product requires an active Variant.");
  return {
    category: serializePublicCategory(value.category),
    currency: "IQD",
    description: value.description,
    highestPrice: highest.equals(lowest) ? null : decimalString(highest),
    id: value.id,
    inStock: value.variants.some(
      (variant) => Boolean(variant.inventory && variant.inventory.onHand - variant.inventory.reserved > 0),
    ),
    lowestPrice: decimalString(lowest),
    name: value.name,
    primaryMediaUrl: value.media.map((item) => safePublicImageUrlOrNull(item.url)).find(Boolean) ?? null,
    productSlug: value.slug,
    slug: value.slug,
    store: serializePublicStore(value.store),
    storeSlug: value.store.slug,
  };
}

export function serializePublicProductDetail(value: PublicProductRecord): PublicProductDetailDto {
  return {
    ...serializePublicProductSummary(value),
    media: value.media.flatMap((item) => {
      const url = safePublicImageUrlOrNull(item.url);
      return url ? [{
        altText: item.altText,
        id: item.id,
        mediaType: item.mediaType,
        sortOrder: item.sortOrder,
        url,
      }] : [];
    }),
    variants: value.variants.map((variant) => ({
      compareAtPrice: variant.compareAtPrice ? decimalString(variant.compareAtPrice) : null,
      currency: "IQD",
      id: variant.id,
      inStock: Boolean(variant.inventory && variant.inventory.onHand - variant.inventory.reserved > 0),
      isDefault: variant.isDefault,
      optionValues: variant.optionValues,
      price: decimalString(variant.price),
      title: variant.title,
    })),
  };
}
