import type { CommercePermission, Prisma } from "@prisma/client";

import { decimalString } from "@/features/commerce/domain/money";
import { evaluateProductReadiness } from "@/features/commerce/domain/product-readiness";
import { safePublicImageUrlOrNull } from "@/lib/security/public-image-url";

export const merchantProductInclude = {
  category: { select: { id: true, name: true, slug: true, status: true } },
  media: {
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    select: {
      altText: true,
      id: true,
      mediaType: true,
      sortOrder: true,
      url: true,
      variantId: true,
    },
  },
  store: {
    select: {
      archivedAt: true,
      id: true,
      organization: {
        select: { deletedAt: true, isActive: true, status: true },
      },
      publishedAt: true,
      status: true,
    },
  },
  variants: {
    include: {
      inventory: {
        select: {
          id: true,
          lowStockThreshold: true,
          onHand: true,
          reserved: true,
          updatedAt: true,
          version: true,
        },
      },
    },
    orderBy: [{ isDefault: "desc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.ProductInclude;

export type MerchantProductRecord = Prisma.ProductGetPayload<{
  include: typeof merchantProductInclude;
}>;

export type MerchantProductMode = "management" | "read-only" | "summary";

export function serializeMerchantProduct(
  product: MerchantProductRecord,
  permissions: readonly CommercePermission[],
  mode: MerchantProductMode,
) {
  const readiness = evaluateProductReadiness({
    categoryStatus: product.category.status,
    description: product.description,
    media: product.media,
    name: product.name,
    organization: product.store.organization,
    productArchivedAt: product.archivedAt,
    slug: product.slug,
    store: product.store,
    variants: product.variants,
  });
  const activeVariants = product.variants.filter(
    (variant) => variant.status === "ACTIVE" && !variant.archivedAt,
  );
  const available = product.variants.reduce(
    (total, variant) =>
      total + Math.max(0, (variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0)),
    0,
  );
  const canUpdate = permissions.includes("PRODUCT_UPDATE") && editableStore(product.store.status);
  const canArchive =
    permissions.includes("PRODUCT_ARCHIVE") &&
    editableStore(product.store.status) &&
    product.status !== "ARCHIVED";
  const safeMedia = product.media.flatMap((item) => {
    const url = safePublicImageUrlOrNull(item.url);
    return url
      ? [{
          altText: item.altText,
          id: item.id,
          mediaType: item.mediaType,
          sortOrder: item.sortOrder,
          url,
          variantId: item.variantId,
        }]
      : [];
  });
  const base = {
    activeVariantCount: activeVariants.length,
    availableQuantity: available,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
      status: product.category.status,
    },
    description: product.description,
    id: product.id,
    name: product.name,
    primaryMediaUrl: safeMedia[0]?.url ?? null,
    publishedAt: product.publishedAt?.toISOString() ?? null,
    readiness,
    slug: product.slug,
    status: product.status,
    totalVariantCount: product.variants.length,
    updatedAt: product.updatedAt.toISOString(),
  };
  if (mode === "summary") {
    return {
      ...base,
      ...(canUpdate || canArchive ? { expectedVersion: product.updatedAt.toISOString() } : {}),
      permittedActions: { archive: canArchive, update: canUpdate },
    };
  }
  const variants = product.variants.map((variant) => ({
    archivedAt: variant.archivedAt?.toISOString() ?? null,
    compareAtPrice: variant.compareAtPrice ? decimalString(variant.compareAtPrice) : null,
    currency: "IQD" as const,
    id: variant.id,
    inventory: variant.inventory
      ? {
          available: variant.inventory.onHand - variant.inventory.reserved,
          id: variant.inventory.id,
          lowStockThreshold: variant.inventory.lowStockThreshold,
          onHand: variant.inventory.onHand,
          reserved: variant.inventory.reserved,
          updatedAt: variant.inventory.updatedAt.toISOString(),
          version: variant.inventory.version,
        }
      : null,
    isDefault: variant.isDefault,
    optionValues: variant.optionValues,
    price: decimalString(variant.price),
    sku: variant.sku,
    status: variant.status,
    title: variant.title,
  }));
  if (mode === "read-only") return { ...base, variants };
  return {
    ...base,
    expectedVersion: product.updatedAt.toISOString(),
    media: safeMedia,
    permittedActions: {
      addMedia: canUpdate && product.media.length < 12,
      archive: canArchive,
      createVariant: canUpdate,
      publish:
        canUpdate && product.status === "DRAFT" && readiness.ready && product.store.status === "ACTIVE",
      unpublish: canUpdate && product.status === "PUBLISHED",
      update: canUpdate,
    },
    unsafeMediaIds: canUpdate
      ? product.media.filter((item) => !safePublicImageUrlOrNull(item.url)).map((item) => item.id)
      : [],
    variants,
  };
}

function editableStore(status: string) {
  return status === "DRAFT" || status === "ACTIVE" || status === "REJECTED" || status === "SUSPENDED";
}

export function serializeInventorySummary(item: {
  id: string;
  lowStockThreshold: number | null;
  onHand: number;
  reserved: number;
  updatedAt: Date;
  version: number;
  variant: {
    archivedAt: Date | null;
    id: string;
    optionValues: unknown;
    sku: string;
    status: string;
    title: string;
    product: {
      id: string;
      media: Array<{ url: string }>;
      name: string;
      status: string;
    };
  };
}) {
  const available = item.onHand - item.reserved;
  return {
    available,
    id: item.id,
    lowStock: item.lowStockThreshold !== null && available <= item.lowStockThreshold,
    lowStockThreshold: item.lowStockThreshold,
    onHand: item.onHand,
    primaryMediaUrl: safePublicImageUrlOrNull(item.variant.product.media[0]?.url),
    product: {
      id: item.variant.product.id,
      name: item.variant.product.name,
      status: item.variant.product.status,
    },
    reserved: item.reserved,
    updatedAt: item.updatedAt.toISOString(),
    variant: {
      id: item.variant.id,
      optionValues: item.variant.optionValues,
      sku: item.variant.sku,
      status: item.variant.status,
      title: item.variant.title,
    },
    version: item.version,
  };
}

export function serializeStockMovement(movement: {
  actorType: string;
  createdAt: Date;
  id: string;
  onHandDelta: number;
  quantity: number;
  reason: string | null;
  reservedDelta: number;
  resultingOnHand: number;
  resultingReserved: number;
  type: string;
}) {
  return {
    actorType: movement.actorType,
    createdAt: movement.createdAt.toISOString(),
    id: movement.id,
    onHandDelta: movement.onHandDelta,
    quantity: movement.quantity,
    reason: movement.reason,
    reservedDelta: movement.reservedDelta,
    resultingOnHand: movement.resultingOnHand,
    resultingReserved: movement.resultingReserved,
    type: movement.type,
  };
}
