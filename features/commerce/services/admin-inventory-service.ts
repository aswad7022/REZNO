import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type ProductStatus, type ProductVariantStatus } from "@prisma/client";
import { z } from "zod";

import {
  adminActorScope,
  adminFilterFingerprint,
  assertAdminPageLimit,
  decodeAdminCursor,
  encodeAdminCursor,
} from "@/features/commerce/domain/admin-commerce";
import { commerceError } from "@/features/commerce/domain/errors";
import { checkedInventoryResult, POSTGRES_INT_MAX } from "@/features/commerce/domain/inventory";
import {
  adminMutationHash,
  objectReplay,
  recordAdminMutation,
  resolveAdminMutationReplay,
} from "@/features/commerce/services/admin-mutation";
import {
  assertAdminPermission,
  assertCommerceAdminCurrent,
  type CommerceAdminContext,
} from "@/features/commerce/services/authorization";
import { lockInventoryItems, runCommerceSerializable } from "@/features/commerce/services/transaction";
import { prisma } from "@/lib/db/prisma";
import { safePublicImageUrlOrNull } from "@/lib/security/public-image-url";

const uuid = z.string().uuid();
export const adminInventoryCorrectionSchema = z.object({
  expectedVersion: z.number().int().min(0).max(POSTGRES_INT_MAX),
  idempotencyKey: z.string().uuid(),
  inventoryItemId: uuid,
  quantityDelta: z.number().int().min(-POSTGRES_INT_MAX).max(POSTGRES_INT_MAX).refine((value) => value !== 0),
  reason: z.string().trim().min(2).max(500).transform((value) => value.replace(/\s+/g, " ")),
}).strict();

export interface AdminInventoryListQuery {
  availability?: "in_stock" | "out_of_stock";
  cursor?: string;
  limit: number;
  lowStock?: boolean;
  organizationId?: string;
  productStatus?: ProductStatus;
  query?: string;
  reserved?: boolean;
  storeId?: string;
  variantStatus?: ProductVariantStatus;
}

const adminInventoryInclude = {
  variant: {
    include: {
      product: {
        include: {
          media: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }], select: { url: true }, take: 1 },
          store: { select: { archivedAt: true, id: true, name: true, organization: { select: { id: true, name: true } }, status: true } },
        },
      },
    },
  },
} satisfies Prisma.InventoryItemInclude;

type AdminInventoryRecord = Prisma.InventoryItemGetPayload<{ include: typeof adminInventoryInclude }>;

export async function listAdminInventory(context: CommerceAdminContext, query: AdminInventoryListQuery) {
  assertAdminPermission(context, "COMMERCE_INVENTORY_VIEW");
  assertAdminPageLimit(query.limit);
  for (const [field, value] of [["Organization", query.organizationId], ["Store", query.storeId]] as const) {
    if (value && !uuid.safeParse(value).success) commerceError("VALIDATION_ERROR", `${field} filter must be a UUID.`);
  }
  const search = query.query?.trim().slice(0, 120) || undefined;
  const filter = adminFilterFingerprint({
    availability: query.availability,
    lowStock: query.lowStock,
    organizationId: query.organizationId,
    productStatus: query.productStatus,
    query: search,
    reserved: query.reserved,
    storeId: query.storeId,
    variantStatus: query.variantStatus,
  });
  const actor = adminActorScope(context);
  const cursor = query.cursor
    ? decodeAdminCursor(query.cursor, {
        actor,
        filter,
        kind: "inventory",
        permission: "COMMERCE_INVENTORY_VIEW",
        target: "all",
      })
    : null;
  const snapshot = cursor?.snapshotDate ?? new Date();
  const conditions: Prisma.Sql[] = [Prisma.sql`i."updatedAt" <= ${snapshot}`];
  if (query.organizationId) conditions.push(Prisma.sql`s."organizationId" = CAST(${query.organizationId} AS uuid)`);
  if (query.storeId) conditions.push(Prisma.sql`s."id" = CAST(${query.storeId} AS uuid)`);
  if (query.productStatus) conditions.push(Prisma.sql`p."status" = CAST(${query.productStatus} AS "ProductStatus")`);
  if (query.variantStatus) conditions.push(Prisma.sql`v."status" = CAST(${query.variantStatus} AS "ProductVariantStatus")`);
  if (query.availability === "in_stock") conditions.push(Prisma.sql`i."onHand" - i."reserved" > 0`);
  if (query.availability === "out_of_stock") conditions.push(Prisma.sql`i."onHand" - i."reserved" <= 0`);
  if (query.lowStock === true) conditions.push(Prisma.sql`i."lowStockThreshold" IS NOT NULL AND i."onHand" - i."reserved" <= i."lowStockThreshold"`);
  if (query.lowStock === false) conditions.push(Prisma.sql`(i."lowStockThreshold" IS NULL OR i."onHand" - i."reserved" > i."lowStockThreshold")`);
  if (query.reserved === true) conditions.push(Prisma.sql`i."reserved" > 0`);
  if (query.reserved === false) conditions.push(Prisma.sql`i."reserved" = 0`);
  if (search) {
    const escaped = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    conditions.push(Prisma.sql`(p."name" ILIKE ${`%${escaped}%`} ESCAPE '\\' OR v."title" ILIKE ${`%${escaped}%`} ESCAPE '\\' OR v."sku" ILIKE ${`%${escaped}%`} ESCAPE '\\')`);
  }
  if (cursor) conditions.push(Prisma.sql`(i."updatedAt" < ${cursor.sortDate} OR (i."updatedAt" = ${cursor.sortDate} AND i."id" < CAST(${cursor.id} AS uuid)))`);
  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_INVENTORY_VIEW");
    const candidates = await transaction.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
      SELECT i."id", i."updatedAt"
      FROM "InventoryItem" i
      JOIN "ProductVariant" v ON v."id" = i."variantId"
      JOIN "Product" p ON p."id" = v."productId"
      JOIN "Store" s ON s."id" = v."storeId"
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY i."updatedAt" DESC, i."id" DESC
      LIMIT ${query.limit + 1}
    `);
    const visible = candidates.slice(0, query.limit);
    const records = await transaction.inventoryItem.findMany({
      where: { id: { in: visible.map((item) => item.id) } },
      include: adminInventoryInclude,
    });
    const byId = new Map(records.map((item) => [item.id, item]));
    const data = visible.flatMap((item) => byId.has(item.id) ? [adminInventorySummary(byId.get(item.id)!)] : []);
    const last = visible.at(-1);
    return {
      data,
      pageInfo: {
        hasNextPage: candidates.length > query.limit,
        nextCursor: candidates.length > query.limit && last
          ? encodeAdminCursor({
              actor,
              filter,
              id: last.id,
              kind: "inventory",
              permission: "COMMERCE_INVENTORY_VIEW",
              snapshot: snapshot.toISOString(),
              sortValue: last.updatedAt.toISOString(),
              target: "all",
            })
          : null,
      },
    };
  });
}

export async function getAdminInventoryDetail(
  context: CommerceAdminContext,
  rawInventoryItemId: string,
  query: { cursor?: string; limit: number },
) {
  const parsedId = uuid.safeParse(rawInventoryItemId);
  if (!parsedId.success) commerceError("VALIDATION_ERROR", "Inventory ID must be a UUID.");
  assertAdminPermission(context, "COMMERCE_INVENTORY_VIEW");
  assertAdminPageLimit(query.limit);
  const actor = adminActorScope(context);
  const filter = adminFilterFingerprint({ inventoryItemId: parsedId.data });
  const cursor = query.cursor
    ? decodeAdminCursor(query.cursor, {
        actor,
        filter,
        kind: "stock-movements",
        permission: "COMMERCE_INVENTORY_VIEW",
        target: parsedId.data,
      })
    : null;
  const snapshot = cursor?.snapshotDate ?? new Date();
  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_INVENTORY_VIEW");
    const item = await transaction.inventoryItem.findUnique({
      where: { id: parsedId.data },
      include: adminInventoryInclude,
    });
    if (!item) commerceError("NOT_FOUND", "Inventory item was not found.");
    const movements = await transaction.stockMovement.findMany({
      where: {
        inventoryItemId: item.id,
        createdAt: { lte: snapshot },
        ...(cursor ? { OR: [
          { createdAt: { lt: cursor.sortDate } },
          { createdAt: cursor.sortDate, id: { lt: cursor.id } },
        ] } : {}),
      },
      select: {
        actorType: true,
        createdAt: true,
        id: true,
        onHandDelta: true,
        quantity: true,
        reason: true,
        reservedDelta: true,
        resultingOnHand: true,
        resultingReserved: true,
        type: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const activeReservations = await transaction.inventoryReservation.count({
      where: { inventoryItemId: item.id, status: "ACTIVE" },
    });
    const visible = movements.slice(0, query.limit);
    const last = visible.at(-1);
    const mutable = item.variant.product.store.status !== "ARCHIVED" && !item.variant.product.store.archivedAt &&
      item.variant.product.status !== "ARCHIVED" && !item.variant.product.archivedAt &&
      item.variant.status !== "ARCHIVED" && !item.variant.archivedAt;
    const canManage = context.isSuperAdmin || context.permissions.includes("COMMERCE_INVENTORY_MANAGE");
    return {
      activeReservations,
      inventory: adminInventorySummary(item),
      movements: {
        data: visible.map((movement) => ({ ...movement, createdAt: movement.createdAt.toISOString() })),
        pageInfo: {
          hasNextPage: movements.length > query.limit,
          nextCursor: movements.length > query.limit && last
            ? encodeAdminCursor({
                actor,
                filter,
                id: last.id,
                kind: "stock-movements",
                permission: "COMMERCE_INVENTORY_VIEW",
                snapshot: snapshot.toISOString(),
                sortValue: last.createdAt.toISOString(),
                target: item.id,
              })
            : null,
        },
      },
      ...(canManage && mutable ? { expectedVersion: item.version, permittedActions: { correct: true } } : {}),
    };
  });
}

export async function correctAdminInventory(context: CommerceAdminContext, rawInput: unknown) {
  const parsed = adminInventoryCorrectionSchema.safeParse(rawInput);
  if (!parsed.success) commerceError("VALIDATION_ERROR", "Inventory correction input is invalid.");
  const input = parsed.data;
  const action = "commerce.inventory.admin-correct";
  const requestHash = adminMutationHash({ action, ...input });
  return runCommerceSerializable(async (transaction) => {
    const replay = await resolveAdminMutationReplay(transaction, {
      action,
      context,
      idempotencyKey: input.idempotencyKey,
      permission: "COMMERCE_INVENTORY_MANAGE",
      requestHash,
      targetId: input.inventoryItemId,
      targetType: "InventoryItem",
      validateResult: objectReplay<ReturnType<typeof adminInventorySummary>>,
    });
    if (replay) return replay;
    await lockInventoryItems(transaction, [input.inventoryItemId]);
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_INVENTORY_MANAGE");
    const item = await transaction.inventoryItem.findUnique({
      where: { id: input.inventoryItemId },
      include: adminInventoryInclude,
    });
    if (!item) commerceError("NOT_FOUND", "Inventory item was not found.");
    if (item.version !== input.expectedVersion) commerceError("STALE_VERSION", "Inventory changed. Refresh and retry.");
    if (
      item.variant.product.store.status === "ARCHIVED" || item.variant.product.store.archivedAt ||
      item.variant.product.status === "ARCHIVED" || item.variant.product.archivedAt ||
      item.variant.status === "ARCHIVED" || item.variant.archivedAt ||
      item.variant.product.storeId !== item.variant.storeId
    ) {
      commerceError("INVALID_TRANSITION", "Archived or inconsistent Inventory relationships cannot be corrected.");
    }
    if (item.version >= POSTGRES_INT_MAX) commerceError("INVENTORY_CONFLICT", "Inventory version is exhausted.");
    let resultingOnHand: number;
    try {
      resultingOnHand = checkedInventoryResult(item.onHand, input.quantityDelta);
    } catch {
      commerceError("VALIDATION_ERROR", "Inventory correction exceeds PostgreSQL Int capacity.");
    }
    if (resultingOnHand < item.reserved) {
      commerceError("INSUFFICIENT_STOCK", "Inventory correction cannot move on-hand stock below reserved stock.");
    }
    const updated = await transaction.inventoryItem.update({
      where: { id: item.id },
      data: { onHand: resultingOnHand, version: { increment: 1 } },
      include: adminInventoryInclude,
    });
    await transaction.stockMovement.create({
      data: {
        actorId: context.userId,
        actorType: "ADMIN",
        idempotencyKey: createHash("sha256").update(`admin-inventory:${context.userId}:${input.idempotencyKey}`).digest("hex"),
        inventoryItemId: item.id,
        metadata: { adminAccessId: context.adminAccessId, actorSource: context.source, requestHash },
        onHandDelta: input.quantityDelta,
        quantity: Math.abs(input.quantityDelta),
        reason: input.reason,
        reservedDelta: 0,
        resultingOnHand,
        resultingReserved: item.reserved,
        type: input.quantityDelta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
      },
    });
    const result = adminInventorySummary(updated);
    await recordAdminMutation(transaction, {
      action,
      after: { onHand: updated.onHand, reserved: updated.reserved, version: updated.version },
      before: { onHand: item.onHand, reserved: item.reserved, version: item.version },
      context,
      idempotencyKey: input.idempotencyKey,
      permission: "COMMERCE_INVENTORY_MANAGE",
      reason: input.reason,
      requestHash,
      result: result as Prisma.InputJsonValue,
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "InventoryItem",
    });
    return result;
  });
}

function adminInventorySummary(item: AdminInventoryRecord) {
  const available = item.onHand - item.reserved;
  return {
    available,
    id: item.id,
    lowStock: item.lowStockThreshold !== null && available <= item.lowStockThreshold,
    lowStockThreshold: item.lowStockThreshold,
    onHand: item.onHand,
    organization: {
      id: item.variant.product.store.organization.id,
      name: item.variant.product.store.organization.name,
    },
    primaryMediaUrl: safePublicImageUrlOrNull(item.variant.product.media[0]?.url),
    product: { id: item.variant.product.id, name: item.variant.product.name, status: item.variant.product.status },
    reserved: item.reserved,
    store: { id: item.variant.product.store.id, name: item.variant.product.store.name, status: item.variant.product.store.status },
    updatedAt: item.updatedAt.toISOString(),
    variant: { id: item.variant.id, sku: item.variant.sku, status: item.variant.status, title: item.variant.title },
    version: item.version,
  };
}
