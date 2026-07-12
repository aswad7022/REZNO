import { Prisma } from "@prisma/client";

import { commerceError } from "@/features/commerce/domain/errors";
import { decodePublicCursor, encodePublicCursor, publicQueryFingerprint } from "@/features/commerce/public/cursor";
import {
  serializePublicProductSummary,
  serializePublicStore,
  type PublicProductRecord,
} from "@/features/commerce/public/dto";
import {
  publicProductVisibilityWhere,
  publicStoreVisibilityWhere,
  publicVariantWhere,
} from "@/features/commerce/public/visibility";
import { requireActiveCommerceCustomer } from "@/features/commerce/services/authorization";
import { prisma } from "@/lib/db/prisma";

export interface FavoriteQuery {
  cursor?: string;
  limit: number;
}

const storeSelect = {
  coverImageUrl: true,
  currency: true,
  deliveryArea: true,
  deliveryCity: true,
  deliveryEnabled: true,
  deliveryEstimateMinutes: true,
  deliveryFee: true,
  description: true,
  id: true,
  logoUrl: true,
  minimumOrderValue: true,
  name: true,
  pickupArea: true,
  pickupCity: true,
  pickupEnabled: true,
  pickupInstructions: true,
  preparationEstimateMinutes: true,
  slug: true,
} satisfies Prisma.StoreSelect;

const productInclude = {
  category: { select: { displayOrder: true, id: true, name: true, slug: true } },
  media: {
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    select: { altText: true, id: true, mediaType: true, sortOrder: true, url: true },
  },
  store: { select: storeSelect },
  variants: {
    include: { inventory: { select: { onHand: true, reserved: true } } },
    orderBy: [{ isDefault: "desc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }],
    where: publicVariantWhere,
  },
} satisfies Prisma.ProductInclude;

export async function addFavoriteStore(customerId: string, storeId: string) {
  const customer = await requireActiveCommerceCustomer(customerId);
  const store = await prisma.store.findFirst({
    where: { id: storeId, ...publicStoreVisibilityWhere },
    select: storeSelect,
  });
  if (!store) commerceError("NOT_FOUND", "Store was not found.");
  const favorite = await createOrReadStoreFavorite(customer.personId, storeId);
  return { favoriteId: favorite.id, store: serializePublicStore(store) };
}

export async function removeFavoriteStore(customerId: string, storeId: string) {
  const customer = await requireActiveCommerceCustomer(customerId);
  const removed = await prisma.customerFavoriteStore.deleteMany({
    where: { customerId: customer.personId, storeId },
  });
  if (removed.count === 0) commerceError("FAVORITE_NOT_FOUND", "Favorite Store was not found.");
  return { deleted: true, storeId };
}

export async function listFavoriteStores(customerId: string, query: FavoriteQuery) {
  const customer = await requireActiveCommerceCustomer(customerId);
  const cursor = favoriteCursor(customer.personId, "stores", query.cursor);
  const rows = await prisma.customerFavoriteStore.findMany({
    where: {
      customerId: customer.personId,
      store: publicStoreVisibilityWhere,
      ...(cursor ? favoriteCursorWhere(cursor) : {}),
    },
    include: { store: { select: storeSelect } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
  });
  const visible = rows.slice(0, query.limit);
  return favoritePage(customer.personId, "stores", query.limit, rows.length, visible, (row) => ({
    favoritedAt: row.createdAt.toISOString(),
    favoriteId: row.id,
    store: serializePublicStore(row.store),
  }));
}

export async function addFavoriteProduct(customerId: string, productId: string) {
  const customer = await requireActiveCommerceCustomer(customerId);
  const product = await prisma.product.findFirst({
    where: { id: productId, ...publicProductVisibilityWhere },
    include: productInclude,
  });
  if (!product) commerceError("NOT_FOUND", "Product was not found.");
  const favorite = await createOrReadProductFavorite(customer.personId, productId);
  return {
    favoriteId: favorite.id,
    product: serializePublicProductSummary(product as PublicProductRecord),
  };
}

export async function removeFavoriteProduct(customerId: string, productId: string) {
  const customer = await requireActiveCommerceCustomer(customerId);
  const removed = await prisma.customerFavoriteProduct.deleteMany({
    where: { customerId: customer.personId, productId },
  });
  if (removed.count === 0) commerceError("FAVORITE_NOT_FOUND", "Favorite Product was not found.");
  return { deleted: true, productId };
}

export async function listFavoriteProducts(customerId: string, query: FavoriteQuery) {
  const customer = await requireActiveCommerceCustomer(customerId);
  const cursor = favoriteCursor(customer.personId, "products", query.cursor);
  const rows = await prisma.customerFavoriteProduct.findMany({
    where: {
      customerId: customer.personId,
      product: publicProductVisibilityWhere,
      ...(cursor ? favoriteCursorWhere(cursor) : {}),
    },
    include: { product: { include: productInclude } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
  });
  const visible = rows.slice(0, query.limit);
  return favoritePage(customer.personId, "products", query.limit, rows.length, visible, (row) => ({
    favoritedAt: row.createdAt.toISOString(),
    favoriteId: row.id,
    product: serializePublicProductSummary(row.product as PublicProductRecord),
  }));
}

export function favoriteFingerprint(customerId: string, collection: "products" | "stores") {
  return publicQueryFingerprint({ collection, customerId, scope: "customer-favorites" });
}

function favoriteCursor(customerId: string, collection: "products" | "stores", encoded?: string) {
  if (!encoded) return null;
  return decodePublicCursor(encoded, {
    fingerprint: favoriteFingerprint(customerId, collection),
    sort: "favorited_newest",
  });
}

function favoriteCursorWhere(cursor: { id: string; sortValue: string }) {
  const date = strictDate(cursor.sortValue);
  return { OR: [{ createdAt: { lt: date } }, { createdAt: date, id: { lt: cursor.id } }] };
}

function favoritePage<T extends { createdAt: Date; id: string }, R>(
  customerId: string,
  collection: "products" | "stores",
  limit: number,
  rowCount: number,
  visible: T[],
  serialize: (row: T) => R,
) {
  const last = visible.at(-1);
  return {
    data: visible.map(serialize),
    pageInfo: {
      hasNextPage: rowCount > limit,
      nextCursor: rowCount > limit && last
        ? encodePublicCursor({
            fingerprint: favoriteFingerprint(customerId, collection),
            id: last.id,
            sort: "favorited_newest",
            sortValue: last.createdAt.toISOString(),
          })
        : null,
    },
  };
}

function strictDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    commerceError("INVALID_CURSOR", "Favorite cursor date is invalid.");
  }
  return date;
}

async function createOrReadStoreFavorite(customerId: string, storeId: string) {
  try {
    return await prisma.customerFavoriteStore.create({ data: { customerId, storeId } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return prisma.customerFavoriteStore.findUniqueOrThrow({
      where: { customerId_storeId: { customerId, storeId } },
    });
  }
}

async function createOrReadProductFavorite(customerId: string, productId: string) {
  try {
    return await prisma.customerFavoriteProduct.create({ data: { customerId, productId } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return prisma.customerFavoriteProduct.findUniqueOrThrow({
      where: { customerId_productId: { customerId, productId } },
    });
  }
}
