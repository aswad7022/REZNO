import { Prisma } from "@prisma/client";

import {
  decodePublicCursor,
  encodePublicCursor,
  publicQueryFingerprint,
} from "@/features/commerce/public/cursor";
import { resolveMerchantCommerceContext } from "@/features/commerce/services/authorization";
import type { MerchantIdentityInput } from "@/features/commerce/services/store-service";
import { prisma } from "@/lib/db/prisma";

export interface MerchantInventoryQuery {
  availability?: "in_stock" | "out_of_stock";
  cursor?: string;
  fingerprint: string;
  limit: number;
  query?: string;
}

const INVENTORY_SORT = "updated_desc";

export async function listMerchantInventory(
  identity: MerchantIdentityInput,
  query: MerchantInventoryQuery,
) {
  const context = await resolveMerchantCommerceContext(identity, "INVENTORY_VIEW");
  const scopedFingerprint = publicQueryFingerprint({
    base: query.fingerprint,
    organizationId: context.organizationId,
    scope: "merchant-inventory-organization",
  });
  const cursor = query.cursor
    ? decodePublicCursor(query.cursor, { fingerprint: scopedFingerprint, sort: INVENTORY_SORT })
    : null;
  const conditions: Prisma.Sql[] = [
    Prisma.sql`s."organizationId" = CAST(${context.organizationId} AS uuid)`,
  ];
  if (query.query) {
    const escaped = query.query.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    conditions.push(Prisma.sql`(
      p."name" ILIKE ${`%${escaped}%`} ESCAPE '\\'
      OR pv."sku" ILIKE ${`%${escaped}%`} ESCAPE '\\'
      OR pv."optionValues"::text ILIKE ${`%${escaped}%`} ESCAPE '\\'
    )`);
  }
  if (query.availability === "in_stock") {
    conditions.push(Prisma.sql`i."onHand" - i."reserved" > 0`);
  }
  if (query.availability === "out_of_stock") {
    conditions.push(Prisma.sql`i."onHand" - i."reserved" <= 0`);
  }
  if (cursor) {
    const updatedAt = new Date(cursor.sortValue);
    if (Number.isNaN(updatedAt.getTime()) || updatedAt.toISOString() !== cursor.sortValue) {
      throw new Error("Invalid inventory cursor date.");
    }
    conditions.push(Prisma.sql`(
      i."updatedAt" < ${updatedAt}
      OR (i."updatedAt" = ${updatedAt} AND i."id" < CAST(${cursor.id} AS uuid))
    )`);
  }
  const candidates = await prisma.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
    SELECT i."id", i."updatedAt"
    FROM "InventoryItem" i
    JOIN "ProductVariant" pv ON pv."id" = i."variantId"
    JOIN "Product" p ON p."id" = pv."productId"
    JOIN "Store" s ON s."id" = pv."storeId"
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY i."updatedAt" DESC, i."id" DESC
    LIMIT ${query.limit + 1}
  `);
  const visible = candidates.slice(0, query.limit);
  const records = await prisma.inventoryItem.findMany({
    where: { id: { in: visible.map((item) => item.id) } },
    include: { variant: { include: { product: true } } },
  });
  const byId = new Map(records.map((item) => [item.id, item]));
  const data = visible.flatMap((item) => (byId.has(item.id) ? [byId.get(item.id)!] : []));
  const last = visible.at(-1);
  return {
    data,
    pageInfo: {
      hasNextPage: candidates.length > query.limit,
      nextCursor:
        candidates.length > query.limit && last
          ? encodePublicCursor({
              fingerprint: scopedFingerprint,
              id: last.id,
              sort: INVENTORY_SORT,
              sortValue: last.updatedAt.toISOString(),
            })
          : null,
    },
  };
}
