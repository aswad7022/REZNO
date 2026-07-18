import "server-only";

import { Prisma, type ProductStatus, type StoreStatus } from "@prisma/client";
import { z } from "zod";

import {
  adminActorScope,
  adminFilterFingerprint,
  assertDateRange,
  assertAdminPageLimit,
  decodeAdminCursor,
  encodeAdminCursor,
} from "@/features/commerce/domain/admin-commerce";
import { normalizeCommerceText } from "@/features/commerce/domain/catalog";
import { commerceError } from "@/features/commerce/domain/errors";
import { decimalString } from "@/features/commerce/domain/money";
import { evaluateProductReadiness } from "@/features/commerce/domain/product-readiness";
import {
  adminMutationHash,
  assertAdminExpectedDateVersion,
  objectReplay,
  recordAdminMutation,
  resolveAdminMutationReplay,
} from "@/features/commerce/services/admin-mutation";
import {
  assertAdminPermission,
  assertCommerceAdminCurrent,
  type CommerceAdminContext,
} from "@/features/commerce/services/authorization";
import { lockProduct, runCommerceSerializable } from "@/features/commerce/services/transaction";
import { prisma } from "@/lib/db/prisma";
import { isSafePublicImageUrl, safePublicImageUrlOrNull } from "@/lib/security/public-image-url";

const productIdSchema = z.string().uuid();
export const adminProductModerationSchema = z.object({
  action: z.enum(["clear", "suspend"]),
  expectedVersion: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
  productId: productIdSchema,
  reason: z.string().trim().min(2).max(1_000).transform((value) => value.replace(/\s+/g, " ")),
}).strict();

export interface AdminProductListQuery {
  categoryId?: string;
  cursor?: string;
  limit: number;
  readinessIssue?: boolean;
  search?: string;
  status?: ProductStatus;
  storeStatus?: StoreStatus;
  unsafeMedia?: boolean;
  updatedFrom?: Date;
  updatedTo?: Date;
}

const adminProductInclude = {
  category: { select: { id: true, name: true, slug: true, status: true } },
  media: {
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    select: { altText: true, id: true, mediaType: true, sortOrder: true, url: true, variantId: true },
  },
  store: {
    select: {
      archivedAt: true,
      id: true,
      name: true,
      organization: {
        select: { deletedAt: true, id: true, isActive: true, name: true, status: true },
      },
      publishedAt: true,
      slug: true,
      status: true,
    },
  },
  variants: {
    include: {
      inventory: { select: { id: true, lowStockThreshold: true, onHand: true, reserved: true, version: true } },
    },
    orderBy: [{ isDefault: "desc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.ProductInclude;

type AdminProductRecord = Prisma.ProductGetPayload<{ include: typeof adminProductInclude }>;

export async function listAdminProducts(
  context: CommerceAdminContext,
  query: AdminProductListQuery,
) {
  assertAdminPermission(context, "COMMERCE_CATALOG_VIEW");
  assertAdminPageLimit(query.limit);
  assertDateRange(query.updatedFrom, query.updatedTo);
  const search = query.search?.trim().slice(0, 120) || undefined;
  if (query.categoryId && !productIdSchema.safeParse(query.categoryId).success) {
    commerceError("VALIDATION_ERROR", "Category filter must be a UUID.");
  }
  const filter = adminFilterFingerprint({
    categoryId: query.categoryId,
    readinessIssue: query.readinessIssue,
    search,
    status: query.status,
    storeStatus: query.storeStatus,
    unsafeMedia: query.unsafeMedia,
    updatedFrom: query.updatedFrom?.toISOString(),
    updatedTo: query.updatedTo?.toISOString(),
  });
  const actor = adminActorScope(context);
  const cursor = query.cursor
    ? decodeAdminCursor(query.cursor, {
        actor,
        filter,
        kind: "products",
        permission: "COMMERCE_CATALOG_VIEW",
        target: "all",
      })
    : null;
  const snapshot = cursor?.snapshotDate ?? new Date();
  const where: Prisma.ProductWhereInput = {
    categoryId: query.categoryId,
    status: query.status,
    store: { status: query.storeStatus },
    updatedAt: { gte: query.updatedFrom, lte: query.updatedTo && query.updatedTo < snapshot ? query.updatedTo : snapshot },
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { normalizedSearchText: { contains: normalizeCommerceText(search) } },
            { slug: { contains: search.toLowerCase(), mode: "insensitive" } },
            { store: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(cursor
      ? {
          AND: [{ OR: [
            { updatedAt: { lt: cursor.sortDate } },
            { updatedAt: cursor.sortDate, id: { lt: cursor.id } },
          ] }],
        }
      : {}),
  };
  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_CATALOG_VIEW");
    const needsPostFilter = query.readinessIssue !== undefined || query.unsafeMedia !== undefined;
    const scanLimit = needsPostFilter ? Math.min(query.limit * 5 + 1, 251) : query.limit + 1;
    const rows = await transaction.product.findMany({
      where,
      include: adminProductInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: scanLimit,
    });
    const filtered = rows.filter((item) => {
      const readiness = productReadiness(item);
      const unsafe = item.media.some((media) => !isSafePublicImageUrl(media.url));
      return (query.readinessIssue === undefined || (!readiness.ready) === query.readinessIssue) &&
        (query.unsafeMedia === undefined || unsafe === query.unsafeMedia);
    });
    const visible = filtered.slice(0, query.limit);
    const hasFilteredNext = filtered.length > query.limit;
    const hasScannedNext = needsPostFilter && rows.length === scanLimit;
    const hasNextPage = hasFilteredNext || hasScannedNext;
    const cursorAnchor = hasFilteredNext ? visible.at(-1) : hasScannedNext ? rows.at(-1) : undefined;
    return {
      data: visible.map(adminProductSummary),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage && cursorAnchor
          ? encodeAdminCursor({
              actor,
              filter,
              id: cursorAnchor.id,
              kind: "products",
              permission: "COMMERCE_CATALOG_VIEW",
              snapshot: snapshot.toISOString(),
              sortValue: cursorAnchor.updatedAt.toISOString(),
              target: "all",
            })
          : null,
      },
    };
  });
}

export async function getAdminProductDetail(context: CommerceAdminContext, rawProductId: string) {
  const parsedId = productIdSchema.safeParse(rawProductId);
  if (!parsedId.success) commerceError("VALIDATION_ERROR", "Product ID must be a UUID.");
  assertAdminPermission(context, "COMMERCE_CATALOG_VIEW");
  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_CATALOG_VIEW");
    const product = await transaction.product.findUnique({
      where: { id: parsedId.data },
      include: adminProductInclude,
    });
    if (!product) commerceError("NOT_FOUND", "Product was not found.");
    const activeCartItems = await transaction.cartItem.count({
      where: { cart: { status: "ACTIVE" }, productVariant: { productId: product.id } },
    });
    const nonterminalOrders = await transaction.order.count({
      where: { items: { some: { productId: product.id } }, status: { in: ["PENDING", "CONFIRMED"] } },
    });
    const audit = await transaction.adminAuditLog.findMany({
      where: { targetId: product.id, targetType: "Product" },
      select: { action: true, createdAt: true, id: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    const canModerate = context.isSuperAdmin || context.permissions.includes("COMMERCE_CATALOG_MODERATE");
    return {
      audit: audit.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
      impact: { activeCartItems, nonterminalOrders },
      product: adminProductDetail(product),
      ...(canModerate && product.status !== "ARCHIVED" ? {
        expectedVersion: product.updatedAt.toISOString(),
        permittedActions: {
          clear: product.status === "SUSPENDED",
          suspend: product.status !== "SUSPENDED",
        },
      } : {}),
    };
  });
}

export async function moderateAdminProduct(context: CommerceAdminContext, rawInput: unknown) {
  const parsed = adminProductModerationSchema.safeParse(rawInput);
  if (!parsed.success) commerceError("VALIDATION_ERROR", "Product moderation input is invalid.");
  const input = parsed.data;
  const action = input.action === "suspend" ? "commerce.product.suspend" : "commerce.product.clear";
  const requestHash = adminMutationHash({ ...input, auditAction: action });
  return runCommerceSerializable(async (transaction) => {
    const replay = await resolveAdminMutationReplay(transaction, {
      action,
      context,
      idempotencyKey: input.idempotencyKey,
      permission: "COMMERCE_CATALOG_MODERATE",
      requestHash,
      targetId: input.productId,
      targetType: "Product",
      validateResult: objectReplay<ReturnType<typeof adminProductSummary>>,
    });
    if (replay) return replay;
    await lockProduct(transaction, input.productId);
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_CATALOG_MODERATE");
    const product = await transaction.product.findUnique({
      where: { id: input.productId },
      include: adminProductInclude,
    });
    if (!product) commerceError("NOT_FOUND", "Product was not found.");
    assertAdminExpectedDateVersion(product.updatedAt, input.expectedVersion);
    if (product.status === "ARCHIVED" || product.archivedAt) {
      commerceError("INVALID_TRANSITION", "Archived Product moderation is terminal.");
    }
    if (input.action === "suspend" && product.status === "SUSPENDED") {
      commerceError("INVALID_TRANSITION", "Product is already suspended.");
    }
    if (input.action === "clear" && product.status !== "SUSPENDED") {
      commerceError("INVALID_TRANSITION", "Only a suspended Product can be cleared.");
    }
    const updated = await transaction.product.update({
      where: { id: product.id },
      data: input.action === "suspend"
        ? { status: "SUSPENDED", suspendedAt: new Date(), suspensionReason: input.reason }
        : { publishedAt: null, status: "DRAFT", suspendedAt: null, suspensionReason: null },
      include: adminProductInclude,
    });
    const result = adminProductSummary(updated);
    await recordAdminMutation(transaction, {
      action,
      after: productAudit(updated),
      before: productAudit(product),
      context,
      idempotencyKey: input.idempotencyKey,
      permission: "COMMERCE_CATALOG_MODERATE",
      reason: input.reason,
      requestHash,
      result: result as Prisma.InputJsonValue,
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "Product",
    });
    return result;
  });
}

function adminProductSummary(product: AdminProductRecord) {
  const readiness = productReadiness(product);
  const activeVariantCount = product.variants.filter((item) => item.status === "ACTIVE" && !item.archivedAt).length;
  return {
    activeVariantCount,
    category: { id: product.category.id, name: product.category.name, status: product.category.status },
    id: product.id,
    name: product.name,
    organization: { id: product.store.organization.id, name: product.store.organization.name },
    primaryMediaUrl: safePublicImageUrlOrNull(product.media[0]?.url),
    publicVisible: product.status === "PUBLISHED" && Boolean(product.publishedAt) && readiness.ready,
    readiness: { missing: readiness.missing, ready: readiness.ready },
    status: product.status,
    store: { id: product.store.id, name: product.store.name, status: product.store.status },
    unsafeMediaPresent: product.media.some((item) => !isSafePublicImageUrl(item.url)),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function adminProductDetail(product: AdminProductRecord) {
  return {
    ...adminProductSummary(product),
    description: product.description,
    media: product.media.flatMap((item) => {
      const url = safePublicImageUrlOrNull(item.url);
      return url ? [{ altText: item.altText, id: item.id, sortOrder: item.sortOrder, url }] : [];
    }),
    slug: product.slug,
    suspensionReason: product.suspensionReason,
    variants: product.variants.map((variant) => ({
      compareAtPrice: variant.compareAtPrice ? decimalString(variant.compareAtPrice) : null,
      id: variant.id,
      inventory: variant.inventory ? {
        available: variant.inventory.onHand - variant.inventory.reserved,
        id: variant.inventory.id,
        lowStockThreshold: variant.inventory.lowStockThreshold,
        onHand: variant.inventory.onHand,
        reserved: variant.inventory.reserved,
        version: variant.inventory.version,
      } : null,
      isDefault: variant.isDefault,
      optionValues: variant.optionValues,
      price: decimalString(variant.price),
      sku: variant.sku,
      status: variant.status,
      title: variant.title,
    })),
  };
}

function productReadiness(product: AdminProductRecord) {
  return evaluateProductReadiness({
    categoryStatus: product.category.status,
    description: product.description,
    media: product.media,
    name: product.name,
    organization: product.store.organization,
    productArchivedAt: product.archivedAt,
    slug: product.slug,
    store: product.store,
    variants: product.variants,
  });
}

function productAudit(product: AdminProductRecord) {
  return {
    categoryId: product.categoryId,
    name: product.name,
    publishedAt: product.publishedAt?.toISOString() ?? null,
    status: product.status,
    suspendedAt: product.suspendedAt?.toISOString() ?? null,
    version: product.updatedAt.toISOString(),
  };
}
