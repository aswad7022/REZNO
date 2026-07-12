import { Prisma } from "@prisma/client";

import { assertIqdAmount, decimalString } from "@/features/commerce/domain/money";
import { decodePublicCursor, encodePublicCursor } from "@/features/commerce/public/cursor";
import {
  serializePublicCategory,
  serializePublicProductDetail,
  serializePublicProductSummary,
  serializePublicStore,
  type PublicProductRecord,
  type PublicStoreRecord,
} from "@/features/commerce/public/dto";
import { publicCommerceError } from "@/features/commerce/public/errors";
import type {
  ProductCollectionQuery,
  StoreCollectionQuery,
} from "@/features/commerce/public/query-validation";
import type { PublicPageInfo } from "@/features/commerce/public/types";
import {
  publicProductVisibilityWhere,
  publicStoreVisibilityWhere,
  publicVariantWhere,
} from "@/features/commerce/public/visibility";
import { prisma } from "@/lib/db/prisma";

const ARABIC_TRANSLATE_FROM = "أإآٱىـ";
const ARABIC_TRANSLATE_TO = "ااااي";
const ARABIC_DIACRITICS_SQL_PATTERN = "[ؐ-ًؚ-ٰٟۖ-ۭ]";

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

type StoreCandidate = { createdAt: Date; id: string; name: string };
type ProductCandidate = { createdAt: Date; id: string; minPrice: Prisma.Decimal; name: string };

export async function listPublicCategories() {
  const categories = await prisma.marketplaceCategory.findMany({
    where: {
      status: "ACTIVE",
      products: { some: publicProductVisibilityWhere },
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    select: { displayOrder: true, id: true, name: true, slug: true },
  });
  return categories.map(serializePublicCategory);
}

export async function listPublicStores(query: StoreCollectionQuery) {
  const cursor = query.cursor
    ? decodePublicCursor(query.cursor, { fingerprint: query.fingerprint, sort: query.sort })
    : null;
  const conditions: Prisma.Sql[] = [
    Prisma.sql`s."status" = 'ACTIVE'::"StoreStatus"`,
    Prisma.sql`s."archivedAt" IS NULL`,
    Prisma.sql`s."publishedAt" IS NOT NULL`,
  ];
  if (query.query) conditions.push(searchCondition(storeSearchExpression(), query.query));
  if (query.fulfillment === "delivery") conditions.push(Prisma.sql`s."deliveryEnabled" = true`);
  if (query.fulfillment === "pickup") conditions.push(Prisma.sql`s."pickupEnabled" = true`);
  if (query.category) {
    conditions.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM "Product" p
        JOIN "MarketplaceCategory" c ON c."id" = p."categoryId"
        WHERE p."storeId" = s."id"
          AND p."status" = 'PUBLISHED'::"ProductStatus"
          AND p."archivedAt" IS NULL
          AND p."publishedAt" IS NOT NULL
          AND c."status" = 'ACTIVE'::"MarketplaceCategoryStatus"
          AND c."slug" = ${query.category}
          AND EXISTS (
            SELECT 1 FROM "ProductVariant" pv
            WHERE pv."productId" = p."id"
              AND pv."status" = 'ACTIVE'::"ProductVariantStatus"
              AND pv."archivedAt" IS NULL
          )
      )
    `);
  }
  if (cursor) conditions.push(storeCursorCondition(query.sort, cursor.sortValue, cursor.id));
  const rows = await prisma.$queryRaw<StoreCandidate[]>(Prisma.sql`
    SELECT s."id", s."name", s."createdAt"
    FROM "Store" s
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY ${storeOrderBy(query.sort)}
    LIMIT ${query.limit + 1}
  `);
  const visibleRows = rows.slice(0, query.limit);
  const stores = await loadStoresInOrder(visibleRows.map((row) => row.id));
  return {
    data: stores.map(serializePublicStore),
    pageInfo: pageInfo(rows.length > query.limit, visibleRows.at(-1), query, storeSortValue),
  };
}

export async function getPublicStore(storeSlug: string) {
  const store = await prisma.store.findFirst({
    where: { slug: storeSlug, ...publicStoreVisibilityWhere },
    select: storeSelect,
  });
  if (!store) publicCommerceError("NOT_FOUND", 404, "Store not found.");
  return serializePublicStore(store);
}

export async function listPublicProducts(query: ProductCollectionQuery) {
  const cursor = query.cursor
    ? decodePublicCursor(query.cursor, { fingerprint: query.fingerprint, sort: query.sort })
    : null;
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p."status" = 'PUBLISHED'::"ProductStatus"`,
    Prisma.sql`p."archivedAt" IS NULL`,
    Prisma.sql`p."publishedAt" IS NOT NULL`,
    Prisma.sql`s."status" = 'ACTIVE'::"StoreStatus"`,
    Prisma.sql`s."archivedAt" IS NULL`,
    Prisma.sql`s."publishedAt" IS NOT NULL`,
    Prisma.sql`c."status" = 'ACTIVE'::"MarketplaceCategoryStatus"`,
  ];
  if (query.query) conditions.push(searchCondition(productSearchExpression(), query.query));
  if (query.store) conditions.push(Prisma.sql`s."slug" = ${query.store}`);
  if (query.category) conditions.push(Prisma.sql`c."slug" = ${query.category}`);
  if (query.inStock !== undefined) conditions.push(Prisma.sql`vv."in_stock" = ${query.inStock}`);
  if (query.minPrice || query.maxPrice) conditions.push(productPriceRangeCondition(query));
  if (cursor) conditions.push(productCursorCondition(query.sort, cursor.sortValue, cursor.id));
  const rows = await prisma.$queryRaw<ProductCandidate[]>(Prisma.sql`
    WITH visible_variants AS (
      SELECT
        pv."productId",
        MIN(pv."price") AS "minPrice",
        BOOL_OR(COALESCE(ii."onHand" - ii."reserved" > 0, false)) AS "in_stock"
      FROM "ProductVariant" pv
      LEFT JOIN "InventoryItem" ii ON ii."variantId" = pv."id"
      WHERE pv."status" = 'ACTIVE'::"ProductVariantStatus"
        AND pv."archivedAt" IS NULL
      GROUP BY pv."productId"
    )
    SELECT p."id", p."name", p."createdAt", vv."minPrice"
    FROM "Product" p
    JOIN "Store" s ON s."id" = p."storeId"
    JOIN "MarketplaceCategory" c ON c."id" = p."categoryId"
    JOIN visible_variants vv ON vv."productId" = p."id"
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY ${productOrderBy(query.sort)}
    LIMIT ${query.limit + 1}
  `);
  const visibleRows = rows.slice(0, query.limit);
  const products = await loadProductsInOrder(visibleRows.map((row) => row.id));
  return {
    data: products.map(serializePublicProductSummary),
    pageInfo: pageInfo(rows.length > query.limit, visibleRows.at(-1), query, productSortValue),
  };
}

export async function listPublicStoreProducts(storeSlug: string, query: ProductCollectionQuery) {
  await getPublicStore(storeSlug);
  return listPublicProducts({ ...query, store: storeSlug });
}

export async function getPublicProduct(storeSlug: string, productSlug: string) {
  const product = await prisma.product.findFirst({
    where: {
      ...publicProductVisibilityWhere,
      slug: productSlug,
      store: { slug: storeSlug, ...publicStoreVisibilityWhere },
    },
    include: productInclude,
  });
  if (!product) publicCommerceError("NOT_FOUND", 404, "Product not found.");
  return serializePublicProductDetail(product as PublicProductRecord);
}

async function loadStoresInOrder(ids: string[]): Promise<PublicStoreRecord[]> {
  if (ids.length === 0) return [];
  const records = await prisma.store.findMany({
    where: { id: { in: ids }, ...publicStoreVisibilityWhere },
    select: storeSelect,
  });
  const byId = new Map(records.map((record) => [record.id, record]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

async function loadProductsInOrder(ids: string[]): Promise<PublicProductRecord[]> {
  if (ids.length === 0) return [];
  const records = await prisma.product.findMany({
    where: { id: { in: ids }, ...publicProductVisibilityWhere },
    include: productInclude,
  });
  const byId = new Map(records.map((record) => [record.id, record]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)! as PublicProductRecord] : []));
}

function normalizedDatabaseExpression(parts: Prisma.Sql[]) {
  const combined = Prisma.sql`(${Prisma.join(parts, " || ' ' || ")})`;
  return Prisma.sql`
    btrim(
      regexp_replace(
        regexp_replace(
          translate(lower(normalize(${combined}, NFKC)), ${ARABIC_TRANSLATE_FROM}, ${ARABIC_TRANSLATE_TO}),
          ${ARABIC_DIACRITICS_SQL_PATTERN}, '', 'g'
        ),
        '\\s+', ' ', 'g'
      )
    )
  `;
}

function storeSearchExpression() {
  return normalizedDatabaseExpression([
    Prisma.sql`COALESCE(s."name", '')`,
    Prisma.sql`COALESCE(s."description", '')`,
  ]);
}

function productSearchExpression() {
  return normalizedDatabaseExpression([
    Prisma.sql`COALESCE(p."name", '')`,
    Prisma.sql`COALESCE(p."description", '')`,
    Prisma.sql`COALESCE(c."name", '')`,
    Prisma.sql`COALESCE(s."name", '')`,
  ]);
}

function searchCondition(expression: Prisma.Sql, query: string) {
  const escaped = query.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return Prisma.sql`${expression} ILIKE ${`%${escaped}%`} ESCAPE '\\'`;
}

function storeOrderBy(sort: StoreCollectionQuery["sort"]) {
  if (sort === "name_asc") return Prisma.sql`s."name" ASC, s."id" ASC`;
  return Prisma.sql`s."createdAt" DESC, s."id" DESC`;
}

function productOrderBy(sort: ProductCollectionQuery["sort"]) {
  if (sort === "name_asc") return Prisma.sql`p."name" ASC, p."id" ASC`;
  if (sort === "price_asc") return Prisma.sql`vv."minPrice" ASC, p."id" ASC`;
  if (sort === "price_desc") return Prisma.sql`vv."minPrice" DESC, p."id" DESC`;
  return Prisma.sql`p."createdAt" DESC, p."id" DESC`;
}

function storeCursorCondition(sort: StoreCollectionQuery["sort"], value: string, id: string) {
  if (sort === "name_asc") {
    return Prisma.sql`(s."name" > ${value} OR (s."name" = ${value} AND s."id" > CAST(${id} AS uuid)))`;
  }
  const date = cursorDate(value);
  return Prisma.sql`(s."createdAt" < ${date} OR (s."createdAt" = ${date} AND s."id" < CAST(${id} AS uuid)))`;
}

function productCursorCondition(sort: ProductCollectionQuery["sort"], value: string, id: string) {
  if (sort === "name_asc") {
    return Prisma.sql`(p."name" > ${value} OR (p."name" = ${value} AND p."id" > CAST(${id} AS uuid)))`;
  }
  if (sort === "price_asc" || sort === "price_desc") {
    const price = cursorPrice(value);
    const comparator = sort === "price_asc" ? Prisma.sql`>` : Prisma.sql`<`;
    return Prisma.sql`(
      vv."minPrice" ${comparator} ${price}
      OR (vv."minPrice" = ${price} AND p."id" ${comparator} CAST(${id} AS uuid))
    )`;
  }
  const date = cursorDate(value);
  return Prisma.sql`(p."createdAt" < ${date} OR (p."createdAt" = ${date} AND p."id" < CAST(${id} AS uuid)))`;
}

function productPriceRangeCondition(query: Pick<ProductCollectionQuery, "maxPrice" | "minPrice">) {
  const priceConditions: Prisma.Sql[] = [
    Prisma.sql`pv_filter."productId" = p."id"`,
    Prisma.sql`pv_filter."status" = 'ACTIVE'::"ProductVariantStatus"`,
    Prisma.sql`pv_filter."archivedAt" IS NULL`,
  ];
  if (query.minPrice) priceConditions.push(Prisma.sql`pv_filter."price" >= ${query.minPrice}`);
  if (query.maxPrice) priceConditions.push(Prisma.sql`pv_filter."price" <= ${query.maxPrice}`);
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "ProductVariant" pv_filter
    WHERE ${Prisma.join(priceConditions, " AND ")}
  )`;
}

function cursorDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    publicCommerceError("INVALID_CURSOR", 400, "The cursor sort value is invalid.");
  }
  return date;
}

function cursorPrice(value: string) {
  try {
    return assertIqdAmount(value, "cursor price", { allowZero: true });
  } catch {
    return publicCommerceError("INVALID_CURSOR", 400, "The cursor sort value is invalid.");
  }
}

function storeSortValue(row: StoreCandidate, sort: StoreCollectionQuery["sort"]) {
  return sort === "name_asc" ? row.name : row.createdAt.toISOString();
}

function productSortValue(row: ProductCandidate, sort: ProductCollectionQuery["sort"]) {
  if (sort === "name_asc") return row.name;
  if (sort === "price_asc" || sort === "price_desc") return decimalString(row.minPrice);
  return row.createdAt.toISOString();
}

function pageInfo<Row extends { id: string }, Query extends { fingerprint: string; sort: string }>(
  hasNextPage: boolean,
  lastRow: Row | undefined,
  query: Query,
  sortValue: (row: Row, sort: Query["sort"]) => string,
): PublicPageInfo {
  return {
    hasNextPage,
    nextCursor:
      hasNextPage && lastRow
        ? encodePublicCursor({
            fingerprint: query.fingerprint,
            id: lastRow.id,
            sort: query.sort,
            sortValue: sortValue(lastRow, query.sort),
          })
        : null,
  };
}
