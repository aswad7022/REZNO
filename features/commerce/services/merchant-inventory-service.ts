import "server-only";

import { Prisma } from "@prisma/client";

import { commerceError } from "@/features/commerce/domain/errors";
import {
  decodeMerchantCursor,
  encodeMerchantCursor,
  merchantCursorFingerprint,
} from "@/features/commerce/domain/merchant-cursor";
import {
  serializeInventorySummary,
  serializeStockMovement,
} from "@/features/commerce/domain/product-dto";
import { resolveMerchantCommerceContext } from "@/features/commerce/services/authorization";
import type { MerchantActorReference } from "@/features/commerce/services/authorization";
import {
  merchantInventoryInclude,
  type MerchantInventoryRecord,
} from "@/features/commerce/services/inventory-service";
import { prisma } from "@/lib/db/prisma";
import { resolvePublicMediaBatch } from "@/features/media/services/media-query";

export interface MerchantInventoryQuery {
  availability?: "in_stock" | "out_of_stock";
  cursor?: string;
  fingerprint?: string;
  limit: number;
  lowStock?: boolean;
  productStatus?: "DRAFT" | "PUBLISHED" | "SUSPENDED" | "ARCHIVED";
  query?: string;
  variantStatus?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
}

export interface MovementQuery {
  cursor?: string;
  limit: number;
}

export async function listMerchantInventory(
  identity: MerchantActorReference,
  query: MerchantInventoryQuery,
) {
  const actor = await resolveMerchantCommerceContext(identity, "INVENTORY_VIEW");
  if (!actor.storeId) return emptyPage<MerchantInventoryRecord>();
  const filter = merchantCursorFingerprint({
    availability: query.availability,
    lowStock: query.lowStock === undefined ? undefined : String(query.lowStock),
    productStatus: query.productStatus,
    query: query.query,
    variantStatus: query.variantStatus,
  });
  const actorScope = `${actor.membershipId}:${actor.personId}`;
  const cursor = query.cursor
    ? decodeMerchantCursor(query.cursor, {
        actor: actorScope,
        filter,
        kind: "inventory",
        target: actor.storeId,
      })
    : null;
  const snapshot = cursor?.snapshotDate ?? new Date();
  const conditions: Prisma.Sql[] = [
    Prisma.sql`pv."storeId" = CAST(${actor.storeId} AS uuid)`,
    Prisma.sql`i."updatedAt" <= ${snapshot}`,
  ];
  if (query.query) {
    const escaped = query.query.trim().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    conditions.push(Prisma.sql`(
      p."name" ILIKE ${`%${escaped}%`} ESCAPE '\\'
      OR pv."sku" ILIKE ${`%${escaped}%`} ESCAPE '\\'
      OR pv."title" ILIKE ${`%${escaped}%`} ESCAPE '\\'
      OR pv."optionValues"::text ILIKE ${`%${escaped}%`} ESCAPE '\\'
    )`);
  }
  if (query.availability === "in_stock") conditions.push(Prisma.sql`i."onHand" - i."reserved" > 0`);
  if (query.availability === "out_of_stock") conditions.push(Prisma.sql`i."onHand" - i."reserved" <= 0`);
  if (query.lowStock === true) {
    conditions.push(Prisma.sql`i."lowStockThreshold" IS NOT NULL AND i."onHand" - i."reserved" <= i."lowStockThreshold"`);
  }
  if (query.lowStock === false) {
    conditions.push(Prisma.sql`(i."lowStockThreshold" IS NULL OR i."onHand" - i."reserved" > i."lowStockThreshold")`);
  }
  if (query.productStatus) conditions.push(Prisma.sql`p."status" = CAST(${query.productStatus} AS "ProductStatus")`);
  if (query.variantStatus) conditions.push(Prisma.sql`pv."status" = CAST(${query.variantStatus} AS "ProductVariantStatus")`);
  if (cursor) {
    conditions.push(Prisma.sql`(
      i."updatedAt" < ${cursor.sortDate}
      OR (i."updatedAt" = ${cursor.sortDate} AND i."id" < CAST(${cursor.id} AS uuid))
    )`);
  }
  const candidates = await prisma.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
    SELECT i."id", i."updatedAt"
    FROM "InventoryItem" i
    JOIN "ProductVariant" pv ON pv."id" = i."variantId"
    JOIN "Product" p ON p."id" = pv."productId"
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY i."updatedAt" DESC, i."id" DESC
    LIMIT ${query.limit + 1}
  `);
  const visible = candidates.slice(0, query.limit);
  const records = await prisma.inventoryItem.findMany({
    where: { id: { in: visible.map((item) => item.id) } },
    include: merchantInventoryInclude,
  });
  const byId = new Map(records.map((item) => [item.id, item]));
  const data = await withCanonicalInventoryMedia(
    visible.flatMap((item) => byId.has(item.id) ? [byId.get(item.id)!] : []),
  );
  const last = visible.at(-1);
  return {
    data,
    pageInfo: {
      hasNextPage: candidates.length > query.limit,
      nextCursor: candidates.length > query.limit && last
        ? encodeMerchantCursor({
            actor: actorScope,
            filter,
            id: last.id,
            kind: "inventory",
            snapshot: snapshot.toISOString(),
            sortValue: last.updatedAt.toISOString(),
            target: actor.storeId,
          })
        : null,
    },
  };
}

export async function getMerchantInventoryDetail(
  identity: MerchantActorReference,
  inventoryItemId: string,
  query: MovementQuery,
) {
  const actor = await resolveMerchantCommerceContext(identity, "INVENTORY_VIEW");
  const inventory = await prisma.inventoryItem.findFirst({
    where: {
      id: inventoryItemId,
      variant: { store: { organizationId: actor.organizationId } },
    },
    include: merchantInventoryInclude,
  });
  if (!inventory) commerceError("NOT_FOUND", "Inventory item was not found.");
  const [projectedInventory] = await withCanonicalInventoryMedia([inventory]);
  const movementPage = await listMovementPage(actor, inventory.id, query);
  const mutable =
    inventory.variant.status !== "ARCHIVED" &&
    !inventory.variant.archivedAt &&
    inventory.variant.product.status !== "ARCHIVED" &&
    !inventory.variant.product.archivedAt;
  return {
    actor,
    inventory: serializeInventorySummary(projectedInventory!),
    movements: movementPage,
    permittedActions: {
      adjust: mutable && actor.permissions.includes("INVENTORY_ADJUST"),
      threshold: mutable && actor.permissions.includes("INVENTORY_ADJUST"),
    },
  };
}

async function withCanonicalInventoryMedia(items: readonly MerchantInventoryRecord[]) {
  const products = [...new Map(items.map((item) => [item.variant.product.id, item.variant.product])).values()];
  const media = await resolvePublicMediaBatch(products.map((product) => ({
    id: product.id,
    kind: "PRODUCT" as const,
    legacyValues: product.media.map((item) => item.url),
    slot: "PRODUCT_IMAGE" as const,
  })));
  return items.map((item) => ({
    ...item,
    variant: {
      ...item.variant,
      product: {
        ...item.variant.product,
        media: (media.get(`PRODUCT:${item.variant.product.id}:PRODUCT_IMAGE`) ?? []).map((reference) => ({
          url: reference.stableDeliveryPath,
        })),
      },
    },
  }));
}

async function listMovementPage(
  actor: Awaited<ReturnType<typeof resolveMerchantCommerceContext>>,
  inventoryItemId: string,
  query: MovementQuery,
) {
  const filter = merchantCursorFingerprint({ inventoryItemId, limit: String(query.limit) });
  const actorScope = `${actor.membershipId}:${actor.personId}`;
  const cursor = query.cursor
    ? decodeMerchantCursor(query.cursor, {
        actor: actorScope,
        filter,
        kind: "movements",
        target: inventoryItemId,
      })
    : null;
  const snapshot = cursor?.snapshotDate ?? new Date();
  const records = await prisma.stockMovement.findMany({
    where: {
      inventoryItemId,
      createdAt: { lte: snapshot },
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.sortDate } },
              { createdAt: cursor.sortDate, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
  });
  const visible = records.slice(0, query.limit);
  const last = visible.at(-1);
  return {
    data: visible.map(serializeStockMovement),
    pageInfo: {
      hasNextPage: records.length > query.limit,
      nextCursor: records.length > query.limit && last
        ? encodeMerchantCursor({
            actor: actorScope,
            filter,
            id: last.id,
            kind: "movements",
            snapshot: snapshot.toISOString(),
            sortValue: last.createdAt.toISOString(),
            target: inventoryItemId,
          })
        : null,
    },
  };
}

function emptyPage<T>() {
  return { data: [] as T[], pageInfo: { hasNextPage: false, nextCursor: null } };
}
