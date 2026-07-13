import type { Prisma } from "@prisma/client";

export const publicVariantWhere = {
  archivedAt: null,
  status: "ACTIVE" as const,
} satisfies Prisma.ProductVariantWhereInput;

export const publicStoreVisibilityWhere = {
  archivedAt: null,
  publishedAt: { not: null },
  status: "ACTIVE" as const,
} satisfies Prisma.StoreWhereInput;

export const publicProductVisibilityWhere = {
  archivedAt: null,
  category: { status: "ACTIVE" as const },
  publishedAt: { not: null },
  status: "PUBLISHED" as const,
  store: publicStoreVisibilityWhere,
  variants: { some: publicVariantWhere },
} satisfies Prisma.ProductWhereInput;
