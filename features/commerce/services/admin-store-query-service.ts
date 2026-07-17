import "server-only";

import type { Prisma, StoreStatus } from "@prisma/client";
import { z } from "zod";

import {
  adminActorScope,
  adminFilterFingerprint,
  assertDateRange,
  assertAdminPageLimit,
  decodeAdminCursor,
  encodeAdminCursor,
} from "@/features/commerce/domain/admin-commerce";
import { commerceError } from "@/features/commerce/domain/errors";
import { merchantStoreInclude, storeReadiness } from "@/features/commerce/domain/store-dto";
import {
  assertAdminPermission,
  assertCommerceAdminCurrent,
  type CommerceAdminContext,
} from "@/features/commerce/services/authorization";
import { prisma } from "@/lib/db/prisma";
import { isSafePublicImageUrl, safePublicImageUrlOrNull } from "@/lib/security/public-image-url";

const uuid = z.string().uuid();

export interface AdminStoreListQuery {
  cursor?: string;
  limit: number;
  publicVisible?: boolean;
  readinessIssue?: boolean;
  search?: string;
  status?: StoreStatus;
  submittedFrom?: Date;
  submittedTo?: Date;
  updatedFrom?: Date;
  updatedTo?: Date;
}

export async function listAdminStores(context: CommerceAdminContext, query: AdminStoreListQuery) {
  assertAdminPermission(context, "COMMERCE_STORES_VIEW");
  assertAdminPageLimit(query.limit);
  assertDateRange(query.submittedFrom, query.submittedTo);
  assertDateRange(query.updatedFrom, query.updatedTo);
  const search = query.search?.trim().slice(0, 120) || undefined;
  const sort = query.status === "PENDING_REVIEW" ? "submitted_asc" as const : "updated_desc" as const;
  const filter = adminFilterFingerprint({
    publicVisible: query.publicVisible,
    readinessIssue: query.readinessIssue,
    search,
    status: query.status,
    submittedFrom: query.submittedFrom?.toISOString(),
    submittedTo: query.submittedTo?.toISOString(),
    updatedFrom: query.updatedFrom?.toISOString(),
    updatedTo: query.updatedTo?.toISOString(),
  });
  const actor = adminActorScope(context);
  const cursor = query.cursor ? decodeAdminCursor(query.cursor, {
    actor,
    filter,
    kind: `stores:${sort}`,
    permission: "COMMERCE_STORES_VIEW",
    target: "all",
  }) : null;
  const snapshot = cursor?.snapshotDate ?? new Date();
  const where: Prisma.StoreWhereInput = {
    status: query.status,
    submittedAt: { gte: query.submittedFrom, lte: query.submittedTo },
    updatedAt: {
      gte: query.updatedFrom,
      lte: query.updatedTo && query.updatedTo.getTime() < snapshot.getTime() ? query.updatedTo : snapshot,
    },
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
      { organization: { name: { contains: search, mode: "insensitive" } } },
    ] } : {}),
    ...(cursor ? sort === "submitted_asc" ? {
      AND: [{ OR: [
        { submittedAt: { gt: cursor.sortDate } },
        { submittedAt: cursor.sortDate, id: { gt: cursor.id } },
      ] }],
    } : {
      AND: [{ OR: [
        { updatedAt: { lt: cursor.sortDate } },
        { updatedAt: cursor.sortDate, id: { lt: cursor.id } },
      ] }],
    } : {}),
  };
  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_STORES_VIEW");
    const needsPostFilter = query.readinessIssue !== undefined || query.publicVisible !== undefined;
    const scanLimit = needsPostFilter ? Math.min(query.limit * 5 + 1, 251) : query.limit + 1;
    const rows = await transaction.store.findMany({
      where,
      include: merchantStoreInclude,
      orderBy: sort === "submitted_asc"
        ? [{ submittedAt: "asc" }, { id: "asc" }]
        : [{ updatedAt: "desc" }, { id: "desc" }],
      take: scanLimit,
    });
    const filtered = rows.filter((store) => {
      const readiness = storeReadiness(store);
      const publicVisible = isPublicStore(store);
      return (query.readinessIssue === undefined || !readiness.ready === query.readinessIssue) &&
        (query.publicVisible === undefined || publicVisible === query.publicVisible);
    });
    const visible = filtered.slice(0, query.limit);
    const hasFilteredNext = filtered.length > query.limit;
    const hasScannedNext = needsPostFilter && rows.length === scanLimit;
    const hasNextPage = hasFilteredNext || hasScannedNext;
    const cursorAnchor = hasFilteredNext ? visible.at(-1) : hasScannedNext ? rows.at(-1) : undefined;
    const sortValue = cursorAnchor
      ? (sort === "submitted_asc" ? cursorAnchor.submittedAt : cursorAnchor.updatedAt)
      : null;
    return {
      data: visible.map(adminStoreSummary),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage && cursorAnchor && sortValue ? encodeAdminCursor({
          actor,
          filter,
          id: cursorAnchor.id,
          kind: `stores:${sort}`,
          permission: "COMMERCE_STORES_VIEW",
          snapshot: snapshot.toISOString(),
          sortValue: sortValue.toISOString(),
          target: "all",
        }) : null,
      },
    };
  });
}

export async function getAdminStoreDetail(
  context: CommerceAdminContext,
  rawStoreId: string,
  query: { auditCursor?: string; auditLimit?: number } = {},
) {
  const parsedId = uuid.safeParse(rawStoreId);
  if (!parsedId.success) commerceError("VALIDATION_ERROR", "Store ID must be a UUID.");
  assertAdminPermission(context, "COMMERCE_STORES_VIEW");
  const auditLimit = query.auditLimit ?? 20;
  assertAdminPageLimit(auditLimit);
  const actor = adminActorScope(context);
  const filter = adminFilterFingerprint({ storeId: parsedId.data });
  const auditCursor = query.auditCursor ? decodeAdminCursor(query.auditCursor, {
    actor,
    filter,
    kind: "store-audit",
    permission: "COMMERCE_STORES_VIEW",
    target: parsedId.data,
  }) : null;
  const snapshot = auditCursor?.snapshotDate ?? new Date();
  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_STORES_VIEW");
    const store = await transaction.store.findUnique({
      where: { id: parsedId.data },
      include: merchantStoreInclude,
    });
    if (!store) commerceError("NOT_FOUND", "Store was not found.");
    const products = await transaction.product.count({ where: { storeId: store.id } });
    const inventory = await transaction.inventoryItem.count({ where: { variant: { storeId: store.id } } });
    const orders = await transaction.order.count({ where: { storeId: store.id } });
    const activeOrders = await transaction.order.count({
      where: { storeId: store.id, status: { in: ["PENDING", "CONFIRMED"] } },
    });
    const activeReservations = await transaction.inventoryReservation.count({
      where: { productVariant: { storeId: store.id }, status: "ACTIVE" },
    });
    const audit = await transaction.adminAuditLog.findMany({
      where: {
        targetId: store.id,
        targetType: "Store",
        createdAt: { lte: snapshot },
        ...(auditCursor ? { OR: [
          { createdAt: { lt: auditCursor.sortDate } },
          { createdAt: auditCursor.sortDate, id: { lt: auditCursor.id } },
        ] } : {}),
      },
      select: { action: true, createdAt: true, id: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: auditLimit + 1,
    });
    const visibleAudit = audit.slice(0, auditLimit);
    const last = visibleAudit.at(-1);
    const canReview = context.isSuperAdmin || context.permissions.includes("COMMERCE_STORES_REVIEW");
    return {
      activeOrderBlockers: { activeOrders, activeReservations },
      audit: {
        data: visibleAudit.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
        pageInfo: {
          hasNextPage: audit.length > auditLimit,
          nextCursor: audit.length > auditLimit && last ? encodeAdminCursor({
            actor,
            filter,
            id: last.id,
            kind: "store-audit",
            permission: "COMMERCE_STORES_VIEW",
            snapshot: snapshot.toISOString(),
            sortValue: last.createdAt.toISOString(),
            target: store.id,
          }) : null,
        },
      },
      counts: { inventory, orders, products },
      organization: {
        active: store.organization.isActive && store.organization.status === "ACTIVE" && !store.organization.deletedAt,
        id: store.organization.id,
        name: store.organization.name,
      },
      profile: adminStoreProfile(store),
      publicVisible: isPublicStore(store),
      readiness: storeReadiness(store),
      ...(canReview ? {
        expectedVersion: store.updatedAt.toISOString(),
        permittedActions: {
          approve: store.status === "PENDING_REVIEW",
          reactivate: store.status === "SUSPENDED",
          reject: store.status === "PENDING_REVIEW",
          suspend: store.status === "ACTIVE",
        },
      } : {}),
    };
  });
}

function adminStoreSummary(store: Prisma.StoreGetPayload<{ include: typeof merchantStoreInclude }>) {
  const readiness = storeReadiness(store);
  return {
    id: store.id,
    name: store.name,
    organization: { id: store.organization.id, name: store.organization.name },
    publicVisible: isPublicStore(store),
    readiness: { missing: readiness.missing, ready: readiness.ready },
    slug: store.slug,
    status: store.status,
    submittedAt: store.submittedAt?.toISOString() ?? null,
    updatedAt: store.updatedAt.toISOString(),
  };
}

function adminStoreProfile(store: Prisma.StoreGetPayload<{ include: typeof merchantStoreInclude }>) {
  return {
    coverImageUrl: safePublicImageUrlOrNull(store.coverImageUrl),
    currency: store.currency,
    deliveryArea: store.deliveryArea,
    deliveryCity: store.deliveryCity,
    deliveryEnabled: store.deliveryEnabled,
    description: store.description,
    id: store.id,
    logoUrl: safePublicImageUrlOrNull(store.logoUrl),
    name: store.name,
    pickupArea: store.pickupArea,
    pickupCity: store.pickupCity,
    pickupEnabled: store.pickupEnabled,
    slug: store.slug,
    status: store.status,
    supportPhone: store.supportPhone,
    unsafeCoverPresent: Boolean(store.coverImageUrl && !isSafePublicImageUrl(store.coverImageUrl)),
    unsafeLogoPresent: Boolean(store.logoUrl && !isSafePublicImageUrl(store.logoUrl)),
  };
}

function isPublicStore(store: Prisma.StoreGetPayload<{ include: typeof merchantStoreInclude }>) {
  return store.status === "ACTIVE" && Boolean(store.publishedAt) && !store.archivedAt &&
    store.organization.isActive && store.organization.status === "ACTIVE" && !store.organization.deletedAt;
}
