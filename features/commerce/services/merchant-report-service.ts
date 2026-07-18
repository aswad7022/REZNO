import "server-only";

import { Prisma } from "@prisma/client";

import { commerceError } from "@/features/commerce/domain/errors";
import { merchantStoreInclude, storeReadiness } from "@/features/commerce/domain/store-dto";
import {
  assertMerchantCommerceContextCurrent,
  resolveMerchantCommerceContext,
  type MerchantActorReference,
} from "@/features/commerce/services/authorization";
import { prisma } from "@/lib/db/prisma";

const MAX_REPORT_DAYS = 90;

export async function getMerchantCommerceReports(
  reference: MerchantActorReference,
  query: { from?: Date; now?: Date; to?: Date },
) {
  const evaluationTime = query.now ?? new Date();
  const defaultTo = new Date(Date.UTC(
    evaluationTime.getUTCFullYear(),
    evaluationTime.getUTCMonth(),
    evaluationTime.getUTCDate(),
  ) - 1);
  const to = query.to ?? defaultTo;
  const from = query.from ?? new Date(to.getTime() - (30 * 86_400_000) + 1);
  if (from > to) commerceError("VALIDATION_ERROR", "Report start must not be after its end.");
  if (to.getTime() - from.getTime() > MAX_REPORT_DAYS * 86_400_000) {
    commerceError("VALIDATION_ERROR", `Commerce operational reports are limited to ${MAX_REPORT_DAYS} days.`);
  }
  const actor = await resolveMerchantCommerceContext(reference, "REPORTS_VIEW");
  if (!actor.storeId) {
    return emptyReport(from, to, evaluationTime);
  }
  const storeId = actor.storeId;
  return prisma.$transaction(async (transaction) => {
    await assertMerchantCommerceContextCurrent(transaction, actor, "REPORTS_VIEW");
    const store = await transaction.store.findFirst({
      where: { id: storeId, organizationId: actor.organizationId },
      include: merchantStoreInclude,
    });
    if (!store) commerceError("NOT_FOUND", "Merchant Store was not found.");
    const orderStatuses = await transaction.order.groupBy({
      by: ["status"],
      where: { storeId: store.id, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const fulfillmentStatuses = await transaction.order.groupBy({
      by: ["fulfillmentStatus"],
      where: { storeId: store.id, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const fulfillmentMethods = await transaction.order.groupBy({
      by: ["fulfillmentMethod"],
      where: { storeId: store.id, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const units = await transaction.orderItem.aggregate({
      where: { order: { storeId: store.id, createdAt: { gte: from, lte: to } } },
      _sum: { quantity: true },
    });
    const topProducts = await transaction.$queryRaw<Array<{
      productId: string | null;
      productName: string;
      quantity: bigint;
    }>>(Prisma.sql`
        SELECT oi."productId", MIN(oi."productNameSnapshot") AS "productName", SUM(oi."quantity")::bigint AS "quantity"
        FROM "OrderItem" oi
        JOIN "Order" o ON o."id" = oi."orderId"
        WHERE o."storeId" = CAST(${store.id} AS uuid)
          AND o."createdAt" >= ${from}
          AND o."createdAt" <= ${to}
        GROUP BY oi."productId"
        ORDER BY SUM(oi."quantity") DESC, MIN(oi."productNameSnapshot") ASC
        LIMIT 10
      `);
    const inventory = await transaction.$queryRaw<Array<{
      lowStock: bigint;
      outOfStockProducts: bigint;
      outOfStockVariants: bigint;
    }>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (
            WHERE i."lowStockThreshold" IS NOT NULL
              AND i."onHand" - i."reserved" <= i."lowStockThreshold"
          )::bigint AS "lowStock",
          COUNT(*) FILTER (WHERE i."onHand" - i."reserved" <= 0)::bigint AS "outOfStockVariants",
          COUNT(DISTINCT v."productId") FILTER (
            WHERE NOT EXISTS (
              SELECT 1
              FROM "ProductVariant" v2
              JOIN "InventoryItem" i2 ON i2."variantId" = v2."id"
              WHERE v2."productId" = v."productId"
                AND v2."status" = 'ACTIVE'::"ProductVariantStatus"
                AND v2."archivedAt" IS NULL
                AND i2."onHand" - i2."reserved" > 0
            )
          )::bigint AS "outOfStockProducts"
        FROM "InventoryItem" i
        JOIN "ProductVariant" v ON v."id" = i."variantId"
        WHERE v."storeId" = CAST(${store.id} AS uuid)
          AND v."status" = 'ACTIVE'::"ProductVariantStatus"
          AND v."archivedAt" IS NULL
      `);
    const activeProducts = await transaction.product.count({
      where: { storeId: store.id, status: "PUBLISHED", publishedAt: { not: null } },
    });
    const statusMap = Object.fromEntries(orderStatuses.map((row) => [row.status, row._count._all]));
    const readiness = storeReadiness(store);
    return {
      evaluatedAt: evaluationTime.toISOString(),
      fulfillmentMethods: Object.fromEntries(fulfillmentMethods.map((row) => [row.fulfillmentMethod, row._count._all])),
      fulfillmentStatuses: Object.fromEntries(fulfillmentStatuses.map((row) => [row.fulfillmentStatus, row._count._all])),
      inventory: {
        lowStock: Number(inventory[0]?.lowStock ?? 0),
        outOfStockProducts: Number(inventory[0]?.outOfStockProducts ?? 0),
        outOfStockVariants: Number(inventory[0]?.outOfStockVariants ?? 0),
      },
      orders: {
        byStatus: statusMap,
        cancelledRejectedExpired: (statusMap.CANCELLED ?? 0) + (statusMap.REJECTED ?? 0) + (statusMap.EXPIRED ?? 0),
        completed: statusMap.COMPLETED ?? 0,
        unitsOrdered: units._sum.quantity ?? 0,
      },
      products: {
        active: activeProducts,
        topByOrderedQuantity: topProducts.map((row) => ({
          productId: row.productId,
          productName: row.productName,
          quantity: Number(row.quantity),
        })),
      },
      range: { from: from.toISOString(), maximumDays: MAX_REPORT_DAYS, to: to.toISOString() },
      store: {
        id: store.id,
        publicVisible: store.status === "ACTIVE" && Boolean(store.publishedAt) && !store.archivedAt,
        readiness: { missing: readiness.missing, ready: readiness.ready },
        status: store.status,
      },
    };
  });
}

function emptyReport(from: Date, to: Date, evaluationTime: Date) {
  return {
    evaluatedAt: evaluationTime.toISOString(), fulfillmentMethods: {}, fulfillmentStatuses: {},
    inventory: { lowStock: 0, outOfStockProducts: 0, outOfStockVariants: 0 },
    orders: { byStatus: {}, cancelledRejectedExpired: 0, completed: 0, unitsOrdered: 0 },
    products: { active: 0, topByOrderedQuantity: [] },
    range: { from: from.toISOString(), maximumDays: MAX_REPORT_DAYS, to: to.toISOString() },
    store: null,
  };
}
