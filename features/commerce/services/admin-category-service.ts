import "server-only";

import { Prisma, type MarketplaceCategoryStatus } from "@prisma/client";
import { z } from "zod";

import {
  adminActorScope,
  adminFilterFingerprint,
  assertAdminPageLimit,
  decodeAdminCursor,
  encodeAdminCursor,
} from "@/features/commerce/domain/admin-commerce";
import { normalizeCommerceText } from "@/features/commerce/domain/catalog";
import { commerceError } from "@/features/commerce/domain/errors";
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
import {
  lockMarketplaceCategory,
  runCommerceSerializable,
} from "@/features/commerce/services/transaction";
import { prisma } from "@/lib/db/prisma";

const categoryId = z.string().uuid();
const categoryName = z.string().trim().min(2).max(120).transform(normalizeWhitespace);
const categorySlug = z.string().trim().toLowerCase().min(1).max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const displayOrder = z.number().int().min(-1_000_000).max(1_000_000);
const envelope = z.object({
  categoryId,
  expectedVersion: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
}).strict();

export const createAdminCategorySchema = z.object({
  categoryId,
  displayOrder,
  idempotencyKey: z.string().uuid(),
  name: categoryName,
  slug: categorySlug,
}).strict();

export const updateAdminCategorySchema = envelope.extend({
  displayOrder,
  name: categoryName,
  slug: categorySlug,
}).strict();

export const transitionAdminCategorySchema = envelope.extend({
  action: z.enum(["archive", "deactivate", "reactivate"]),
  confirmPublishedImpact: z.boolean(),
  reason: z.string().trim().min(2).max(500).transform(normalizeWhitespace),
}).strict();

export interface AdminCategoryListQuery {
  cursor?: string;
  limit: number;
  search?: string;
  status?: MarketplaceCategoryStatus;
}

const categorySelect = {
  _count: { select: { products: true } },
  createdAt: true,
  displayOrder: true,
  id: true,
  name: true,
  normalizedName: true,
  slug: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.MarketplaceCategorySelect;

type CategoryRecord = Prisma.MarketplaceCategoryGetPayload<{ select: typeof categorySelect }>;

export async function listAdminCategories(
  context: CommerceAdminContext,
  query: AdminCategoryListQuery,
) {
  assertAdminPermission(context, "COMMERCE_CATALOG_VIEW");
  assertAdminPageLimit(query.limit);
  const search = query.search?.trim().slice(0, 120) || undefined;
  const filter = adminFilterFingerprint({ search, status: query.status });
  const actor = adminActorScope(context);
  const cursor = query.cursor
    ? decodeAdminCursor(query.cursor, {
        actor,
        filter,
        kind: "categories",
        permission: "COMMERCE_CATALOG_VIEW",
        target: "all",
      })
    : null;
  const snapshot = cursor?.snapshotDate ?? new Date();
  const where: Prisma.MarketplaceCategoryWhereInput = {
    status: query.status,
    updatedAt: { lte: snapshot },
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { normalizedName: { contains: normalizeCommerceText(search) } },
            { slug: { contains: search.toLowerCase(), mode: "insensitive" } },
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
    const rows = await transaction.marketplaceCategory.findMany({
      where,
      select: categorySelect,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const visible = rows.slice(0, query.limit);
    const last = visible.at(-1);
    return {
      data: visible.map((item) => adminCategorySummary(item)),
      pageInfo: {
        hasNextPage: rows.length > query.limit,
        nextCursor: rows.length > query.limit && last
          ? encodeAdminCursor({
              actor,
              filter,
              id: last.id,
              kind: "categories",
              permission: "COMMERCE_CATALOG_VIEW",
              snapshot: snapshot.toISOString(),
              sortValue: last.updatedAt.toISOString(),
              target: "all",
            })
          : null,
      },
    };
  });
}

export async function getAdminCategoryDetail(
  context: CommerceAdminContext,
  rawCategoryId: string,
) {
  const parsedId = categoryId.safeParse(rawCategoryId);
  if (!parsedId.success) commerceError("VALIDATION_ERROR", "Category ID must be a UUID.");
  assertAdminPermission(context, "COMMERCE_CATALOG_VIEW");
  return prisma.$transaction(async (transaction) => {
    await assertCommerceAdminCurrent(transaction, context, "COMMERCE_CATALOG_VIEW");
    const category = await transaction.marketplaceCategory.findUnique({
      where: { id: parsedId.data },
      select: categorySelect,
    });
    if (!category) commerceError("NOT_FOUND", "Marketplace Category was not found.");
    const impact = await categoryImpact(transaction, category.id);
    const audit = await transaction.adminAuditLog.findMany({
      where: { targetId: category.id, targetType: "MarketplaceCategory" },
      select: { action: true, createdAt: true, id: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    const canModerate = context.isSuperAdmin || context.permissions.includes("COMMERCE_CATALOG_MODERATE");
    return {
      audit: audit.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
      category: adminCategorySummary(category),
      impact,
      ...(canModerate ? {
        expectedVersion: category.updatedAt.toISOString(),
        permittedActions: {
          archive: category.status !== "ARCHIVED",
          deactivate: category.status === "ACTIVE",
          reactivate: category.status === "INACTIVE",
          update: category.status !== "ARCHIVED",
        },
      } : {}),
    };
  });
}

export async function createAdminCategory(context: CommerceAdminContext, rawInput: unknown) {
  const parsed = createAdminCategorySchema.safeParse(rawInput);
  if (!parsed.success) commerceError("VALIDATION_ERROR", "Category creation input is invalid.");
  const input = parsed.data;
  const action = "commerce.category.create";
  const requestHash = adminMutationHash({ action, ...input });
  try {
    return await runCommerceSerializable(async (transaction) => {
      const replay = await resolveAdminMutationReplay(transaction, {
        action,
        context,
        idempotencyKey: input.idempotencyKey,
        permission: "COMMERCE_CATALOG_MODERATE",
        requestHash,
        targetId: input.categoryId,
        targetType: "MarketplaceCategory",
        validateResult: objectReplay<ReturnType<typeof adminCategorySummary>>,
      });
      if (replay) return replay;
      await assertCommerceAdminCurrent(transaction, context, "COMMERCE_CATALOG_MODERATE");
      const created = await transaction.marketplaceCategory.create({
        data: {
          displayOrder: input.displayOrder,
          id: input.categoryId,
          name: input.name,
          normalizedName: normalizeCommerceText(input.name),
          slug: input.slug,
          status: "ACTIVE",
        },
        select: categorySelect,
      });
      const result = adminCategorySummary(created);
      await recordAdminMutation(transaction, {
        action,
        after: result,
        context,
        idempotencyKey: input.idempotencyKey,
        permission: "COMMERCE_CATALOG_MODERATE",
        requestHash,
        result: result as Prisma.InputJsonValue,
        resultVersion: created.updatedAt,
        targetId: created.id,
        targetType: "MarketplaceCategory",
      });
      return result;
    });
  } catch (error) {
    mapCategoryWriteError(error);
  }
}

export async function updateAdminCategory(context: CommerceAdminContext, rawInput: unknown) {
  const parsed = updateAdminCategorySchema.safeParse(rawInput);
  if (!parsed.success) commerceError("VALIDATION_ERROR", "Category update input is invalid.");
  return mutateCategory(context, parsed.data, "commerce.category.update", async (transaction, category) => {
    if (category.status === "ARCHIVED") commerceError("INVALID_TRANSITION", "Archived Category is immutable.");
    return transaction.marketplaceCategory.update({
      where: { id: category.id },
      data: {
        displayOrder: parsed.data.displayOrder,
        name: parsed.data.name,
        normalizedName: normalizeCommerceText(parsed.data.name),
        slug: parsed.data.slug,
      },
      select: categorySelect,
    });
  });
}

export async function transitionAdminCategory(context: CommerceAdminContext, rawInput: unknown) {
  const parsed = transitionAdminCategorySchema.safeParse(rawInput);
  if (!parsed.success) commerceError("VALIDATION_ERROR", "Category lifecycle input is invalid.");
  const input = parsed.data;
  return mutateCategory(
    context,
    input,
    `commerce.category.${input.action}`,
    async (transaction, category) => {
      const next: MarketplaceCategoryStatus = input.action === "archive"
        ? "ARCHIVED"
        : input.action === "deactivate"
          ? "INACTIVE"
          : "ACTIVE";
      const valid = (category.status === "ACTIVE" && (next === "INACTIVE" || next === "ARCHIVED")) ||
        (category.status === "INACTIVE" && (next === "ACTIVE" || next === "ARCHIVED"));
      if (!valid) commerceError("INVALID_TRANSITION", `Category cannot transition from ${category.status} to ${next}.`);
      const impact = await categoryImpact(transaction, category.id);
      if (next !== "ACTIVE" && impact.publishedProducts > 0 && !input.confirmPublishedImpact) {
        commerceError("VALIDATION_ERROR", "Published Product impact requires explicit confirmation.", {
          ...impact,
          confirmationRequired: true,
        });
      }
      return transaction.marketplaceCategory.update({
        where: { id: category.id },
        data: { status: next },
        select: categorySelect,
      });
    },
    input.reason,
  );
}

async function mutateCategory(
  context: CommerceAdminContext,
  input: { categoryId: string; expectedVersion: string; idempotencyKey: string },
  action: string,
  operation: (
    transaction: Prisma.TransactionClient,
    category: CategoryRecord,
  ) => Promise<CategoryRecord>,
  reason?: string,
) {
  const requestHash = adminMutationHash({ action, ...input, reason });
  try {
    return await runCommerceSerializable(async (transaction) => {
      const replay = await resolveAdminMutationReplay(transaction, {
        action,
        context,
        idempotencyKey: input.idempotencyKey,
        permission: "COMMERCE_CATALOG_MODERATE",
        requestHash,
        targetId: input.categoryId,
        targetType: "MarketplaceCategory",
        validateResult: objectReplay<ReturnType<typeof adminCategorySummary>>,
      });
      if (replay) return replay;
      await lockMarketplaceCategory(transaction, input.categoryId);
      await assertCommerceAdminCurrent(transaction, context, "COMMERCE_CATALOG_MODERATE");
      const category = await transaction.marketplaceCategory.findUnique({
        where: { id: input.categoryId },
        select: categorySelect,
      });
      if (!category) commerceError("NOT_FOUND", "Marketplace Category was not found.");
      assertAdminExpectedDateVersion(category.updatedAt, input.expectedVersion);
      const updated = await operation(transaction, category);
      const result = adminCategorySummary(updated);
      await recordAdminMutation(transaction, {
        action,
        after: result,
        before: adminCategorySummary(category),
        context,
        idempotencyKey: input.idempotencyKey,
        permission: "COMMERCE_CATALOG_MODERATE",
        reason,
        requestHash,
        result: result as Prisma.InputJsonValue,
        resultVersion: updated.updatedAt,
        targetId: updated.id,
        targetType: "MarketplaceCategory",
      });
      return result;
    });
  } catch (error) {
    mapCategoryWriteError(error);
  }
}

async function categoryImpact(transaction: Prisma.TransactionClient, id: string) {
  const products = await transaction.product.count({ where: { categoryId: id } });
  const publishedProducts = await transaction.product.count({
    where: { categoryId: id, status: "PUBLISHED", publishedAt: { not: null } },
  });
  const activeCartItems = await transaction.cartItem.count({
    where: {
      cart: { status: "ACTIVE" },
      productVariant: { product: { categoryId: id } },
    },
  });
  const nonterminalOrders = await transaction.order.count({
    where: {
      items: { some: { product: { categoryId: id } } },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
  });
  return { activeCartItems, nonterminalOrders, products, publishedProducts };
}

function adminCategorySummary(category: CategoryRecord) {
  return {
    displayOrder: category.displayOrder,
    id: category.id,
    name: category.name,
    productCount: category._count.products,
    slug: category.slug,
    status: category.status,
    updatedAt: category.updatedAt.toISOString(),
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ");
}

function mapCategoryWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    commerceError("CONFLICT", "Category slug already exists.");
  }
  throw error;
}
