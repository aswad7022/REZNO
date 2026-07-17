import { createHash } from "node:crypto";
import type { Prisma, StoreStatus } from "@prisma/client";

import {
  decodeAdminStoreCursor,
  encodeAdminStoreCursor,
  strictAdminCursorDate,
} from "@/features/commerce/domain/admin-store-cursor";
import { commerceError } from "@/features/commerce/domain/errors";
import { canonicalRequestJson } from "@/features/commerce/domain/idempotency";
import {
  adminReviewStoreDto,
  merchantStoreInclude,
  ownerManagementStoreDto,
} from "@/features/commerce/domain/store-dto";
import {
  assertCommerceAdminCurrent,
  assertAdminPermission,
  type CommerceAdminContext,
} from "@/features/commerce/services/authorization";
import { prisma } from "@/lib/db/prisma";

export interface AdminStoreListQuery {
  cursor?: string;
  limit: number;
  search?: string;
  status?: StoreStatus;
  submittedFrom?: Date;
  submittedTo?: Date;
}

export async function listAdminStores(
  context: CommerceAdminContext,
  query: AdminStoreListQuery,
) {
  assertAdminPermission(context, "COMMERCE_STORES_VIEW");
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50) {
    commerceError("VALIDATION_ERROR", "Admin Store page size must be between 1 and 50.");
  }
  const search = query.search?.trim().slice(0, 120) || undefined;
  const sort = query.status === "PENDING_REVIEW" ? "submitted_asc" as const : "updated_desc" as const;
  const filter = createHash("sha256").update(canonicalRequestJson({
    search,
    status: query.status,
    submittedFrom: query.submittedFrom?.toISOString(),
    submittedTo: query.submittedTo?.toISOString(),
  })).digest("hex");
  const actor = `${context.source}:${context.userId}:COMMERCE_STORES_VIEW`;
  const cursor = query.cursor
    ? decodeAdminStoreCursor(query.cursor, { actor, filter, sort })
    : null;
  const snapshot = cursor ? strictAdminCursorDate(cursor.snapshot) : new Date();
  const sortValue = cursor ? strictAdminCursorDate(cursor.sortValue) : null;
  const where: Prisma.StoreWhereInput = {
    status: query.status,
    submittedAt: {
      gte: query.submittedFrom,
      lte: query.submittedTo ?? (sort === "submitted_asc" ? snapshot : undefined),
      not: sort === "submitted_asc" ? null : undefined,
    },
    updatedAt: sort === "updated_desc" ? { lte: snapshot } : undefined,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
            { organization: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(cursor && sortValue
      ? sort === "submitted_asc"
        ? {
            AND: [{ OR: [
              { submittedAt: { gt: sortValue } },
              { submittedAt: sortValue, id: { gt: cursor.id } },
            ] }],
          }
        : {
            AND: [{ OR: [
              { updatedAt: { lt: sortValue } },
              { updatedAt: sortValue, id: { lt: cursor.id } },
            ] }],
          }
      : {}),
  };

  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_STORES_VIEW");
    const [rows, total] = await Promise.all([
      transaction.store.findMany({
        where,
        include: merchantStoreInclude,
        orderBy: sort === "submitted_asc"
          ? [{ submittedAt: "asc" }, { id: "asc" }]
          : [{ updatedAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
      }),
      transaction.store.count({ where: { ...where, AND: undefined } }),
    ]);
    const visible = rows.slice(0, query.limit);
    const last = visible.at(-1);
    return {
      data: visible.map((store) => ({
        ...ownerManagementStoreDto(store),
        organization: { id: store.organization.id, name: store.organization.name },
      })),
      pageInfo: {
        hasNextPage: rows.length > query.limit,
        nextCursor: rows.length > query.limit && last
          ? encodeAdminStoreCursor({
              actor,
              filter,
              id: last.id,
              snapshot: snapshot.toISOString(),
              sort,
              sortValue: (sort === "submitted_asc" ? last.submittedAt! : last.updatedAt).toISOString(),
            })
          : null,
        total,
      },
    };
  });
}

export async function getAdminStoreDetail(
  context: CommerceAdminContext,
  storeId: string,
) {
  assertAdminPermission(context, "COMMERCE_STORES_VIEW");
  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_STORES_VIEW");
    const store = await transaction.store.findUnique({
      where: { id: storeId },
      include: merchantStoreInclude,
    });
    if (!store) commerceError("NOT_FOUND", "Store was not found.");
    const [products, inventory, orders, audit] = await Promise.all([
      transaction.product.count({ where: { storeId } }),
      transaction.inventoryItem.count({ where: { variant: { storeId } } }),
      transaction.order.count({ where: { storeId } }),
      transaction.adminAuditLog.findMany({
        where: { targetId: storeId, targetType: "Store" },
        select: { action: true, createdAt: true, id: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
      }),
    ]);
    return adminReviewStoreDto(store, {
      audit,
      canReview: context.isSuperAdmin || context.permissions.includes("COMMERCE_STORES_REVIEW"),
      counts: { inventory, orders, products },
    });
  });
}
