import "server-only";

import type { AdminPermission } from "@/features/admin/config/permissions";
import { firstCommerceAdminPermission } from "@/features/admin/config/permissions";
import { commerceError } from "@/features/commerce/domain/errors";
import { assertCommerceAdminCurrent, type CommerceAdminContext } from "@/features/commerce/services/authorization";
import { prisma } from "@/lib/db/prisma";

export async function getAdminCommerceOverview(context: CommerceAdminContext) {
  const available = new Set<AdminPermission>(context.permissions);
  const hubPermission = context.isSuperAdmin ? "COMMERCE_STORES_VIEW" : firstCommerceAdminPermission(available);
  if (!hubPermission) commerceError("FORBIDDEN", "A Commerce Admin permission is required.");
  const can = (permission: AdminPermission) => context.isSuperAdmin || available.has(permission);
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, hubPermission);
    const stores = can("COMMERCE_STORES_VIEW") ? {
      pendingReview: await transaction.store.count({ where: { status: "PENDING_REVIEW" } }),
      suspended: await transaction.store.count({ where: { status: "SUSPENDED" } }),
    } : null;
    const categories = can("COMMERCE_CATALOG_VIEW") ? {
      active: await transaction.marketplaceCategory.count({ where: { status: "ACTIVE" } }),
      inactiveOrArchived: await transaction.marketplaceCategory.count({
        where: { status: { in: ["INACTIVE", "ARCHIVED"] } },
      }),
    } : null;
    const products = can("COMMERCE_CATALOG_VIEW")
      ? await transaction.product.count({ where: { status: "SUSPENDED" } })
      : null;
    const inventory = can("COMMERCE_INVENTORY_VIEW")
      ? await transaction.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS "count"
          FROM "InventoryItem"
          WHERE "lowStockThreshold" IS NOT NULL
            AND "onHand" - "reserved" <= "lowStockThreshold"
        `
      : null;
    const orders = can("COMMERCE_ORDERS_VIEW") ? {
      overduePending: await transaction.order.count({
        where: { status: "PENDING", reservationExpiresAt: { lte: now } },
      }),
      deliveryFailures: await transaction.order.count({
        where: { fulfillmentStatus: "DELIVERY_FAILED", status: "CONFIRMED" },
      }),
    } : null;
    const audit = can("AUDIT_LOG_VIEW")
      ? await transaction.adminAuditLog.count({
          where: { action: { startsWith: "commerce." }, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
        })
      : null;
    return {
      audit: audit === null ? null : { recentActions: audit },
      categories,
      inventory: inventory === null ? null : { lowStock: Number(inventory[0]?.count ?? 0) },
      orders,
      products: products === null ? null : { suspended: products },
      stores,
      evaluatedAt: now.toISOString(),
    };
  });
}
