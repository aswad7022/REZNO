import "server-only";

import { Prisma, type CommercePermission } from "@prisma/client";

import { commerceError } from "@/features/commerce/domain/errors";
import { normalizeCommerceText } from "@/features/commerce/domain/catalog";
import { hashCheckoutRequest } from "@/features/commerce/domain/idempotency";
import {
  decodeMerchantCursor,
  encodeMerchantCursor,
  merchantCursorFingerprint,
} from "@/features/commerce/domain/merchant-cursor";
import {
  archiveVariantSchema,
  canonicalizeVariantOptions,
  createProductAggregateSchema,
  createVariantSchema,
  productLifecycleSchema,
  productSearchText,
  restoreVariantSchema,
  setDefaultVariantSchema,
  updateProductAggregateSchema,
  updateVariantSchema,
} from "@/features/commerce/domain/product-input";
import {
  merchantProductInclude,
  serializeMerchantProduct,
  type MerchantProductRecord,
} from "@/features/commerce/domain/product-dto";
import { evaluateProductReadiness } from "@/features/commerce/domain/product-readiness";
import { COMMERCE_CURRENCY } from "@/features/commerce/domain/money";
import {
  assertMerchantCommerceContextCurrent,
  assertRenderedMerchantOrganization,
  resolveMerchantCommerceContext,
  type MerchantActorReference,
  type MerchantCommerceContext,
} from "@/features/commerce/services/authorization";
import {
  assertCommerceExpectedVersion,
  mutationReplayTarget,
  recordMerchantMutation,
  resolveMerchantMutationReplay,
} from "@/features/commerce/services/merchant-mutation";
import {
  lockProduct,
  runCommerceSerializable,
} from "@/features/commerce/services/transaction";
import { prisma } from "@/lib/db/prisma";
import { resolvePublicMediaBatch } from "@/features/media/services/media-query";
import { isSafePublicImageUrl } from "@/lib/security/public-image-url";

export interface MerchantProductQuery {
  categoryId?: string;
  cursor?: string;
  limit: number;
  published?: "published" | "unpublished";
  query?: string;
  readiness?: "issues" | "ready";
  status?: "DRAFT" | "PUBLISHED" | "SUSPENDED" | "ARCHIVED";
  stock?: "in_stock" | "out_of_stock";
}

export async function listMerchantProductCategories(reference: MerchantActorReference) {
  await resolveMerchantCommerceContext(reference, "PRODUCT_VIEW");
  return prisma.marketplaceCategory.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, slug: true },
    take: 200,
  });
}

export async function listMerchantProducts(
  reference: MerchantActorReference,
  query: MerchantProductQuery,
) {
  const actor = await resolveMerchantCommerceContext(reference, "PRODUCT_VIEW");
  if (!actor.storeId) return emptyPage();
  const filter = merchantCursorFingerprint({
    categoryId: query.categoryId,
    published: query.published,
    query: query.query,
    readiness: query.readiness,
    status: query.status,
    stock: query.stock,
  });
  const actorScope = `${actor.membershipId}:${actor.personId}`;
  const cursor = query.cursor
    ? decodeMerchantCursor(query.cursor, {
        actor: actorScope,
        filter,
        kind: "products",
        target: actor.storeId,
      })
    : null;
  const snapshot = cursor?.snapshotDate ?? new Date();
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p."storeId" = CAST(${actor.storeId} AS uuid)`,
    Prisma.sql`p."updatedAt" <= ${snapshot}`,
  ];
  if (query.query) {
    const normalized = normalizeCommerceText(query.query);
    const escaped = normalized.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    conditions.push(Prisma.sql`p."normalizedSearchText" ILIKE ${`%${escaped}%`} ESCAPE '\\'`);
  }
  if (query.status) conditions.push(Prisma.sql`p."status" = CAST(${query.status} AS "ProductStatus")`);
  if (query.categoryId) conditions.push(Prisma.sql`p."categoryId" = CAST(${query.categoryId} AS uuid)`);
  if (query.published === "published") conditions.push(Prisma.sql`p."status" = 'PUBLISHED' AND p."publishedAt" IS NOT NULL`);
  if (query.published === "unpublished") conditions.push(Prisma.sql`(p."status" <> 'PUBLISHED' OR p."publishedAt" IS NULL)`);
  if (query.stock === "in_stock") {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "ProductVariant" v
      JOIN "InventoryItem" i ON i."variantId" = v."id"
      WHERE v."productId" = p."id" AND v."status" = 'ACTIVE' AND v."archivedAt" IS NULL
        AND i."onHand" - i."reserved" > 0
    )`);
  }
  if (query.stock === "out_of_stock") {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "ProductVariant" v
      JOIN "InventoryItem" i ON i."variantId" = v."id"
      WHERE v."productId" = p."id" AND v."status" = 'ACTIVE' AND v."archivedAt" IS NULL
    ) AND NOT EXISTS (
      SELECT 1 FROM "ProductVariant" v
      JOIN "InventoryItem" i ON i."variantId" = v."id"
      WHERE v."productId" = p."id" AND v."status" = 'ACTIVE' AND v."archivedAt" IS NULL
        AND i."onHand" - i."reserved" > 0
    )`);
  }
  if (cursor) {
    conditions.push(Prisma.sql`(
      p."updatedAt" < ${cursor.sortDate}
      OR (p."updatedAt" = ${cursor.sortDate} AND p."id" < CAST(${cursor.id} AS uuid))
    )`);
  }
  const scanLimit = query.readiness ? Math.min(query.limit * 5 + 1, 251) : query.limit + 1;
  const candidates = await prisma.$queryRaw<Array<{ id: string; updatedAt: Date }>>(Prisma.sql`
    SELECT p."id", p."updatedAt"
    FROM "Product" p
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY p."updatedAt" DESC, p."id" DESC
    LIMIT ${scanLimit}
  `);
  const records = await enrichMerchantProductMedia(await loadProducts(candidates.map((item) => item.id)));
  const byId = new Map(records.map((item) => [item.id, item]));
  const ordered = candidates.flatMap((item) => byId.has(item.id) ? [byId.get(item.id)!] : []);
  const filtered = query.readiness
    ? ordered.filter((item) => productReadiness(item).ready === (query.readiness === "ready"))
    : ordered;
  const visible = filtered.slice(0, query.limit);
  const last = visible.at(-1);
  const hasNextPage = filtered.length > query.limit || candidates.length === scanLimit;
  const cursorAnchor = visible.length === query.limit ? last : candidates.at(-1);
  return {
    data: visible.map((item) =>
      serializeMerchantProduct(item, actor.permissions, "summary")),
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage && cursorAnchor
        ? encodeMerchantCursor({
            actor: actorScope,
            filter,
            id: cursorAnchor.id,
            kind: "products",
            snapshot: snapshot.toISOString(),
            sortValue: cursorAnchor.updatedAt.toISOString(),
            target: actor.storeId,
          })
        : null,
    },
  };
}

export async function getMerchantProduct(
  reference: MerchantActorReference,
  productId: string,
) {
  const actor = await resolveMerchantCommerceContext(reference, "PRODUCT_VIEW");
  const product = await prisma.product.findFirst({
    where: { id: productId, store: { organizationId: actor.organizationId } },
    include: merchantProductInclude,
  });
  if (!product) commerceError("NOT_FOUND", "Product was not found.");
  const mode = actor.systemRole === "STAFF" || (
    !actor.permissions.includes("PRODUCT_UPDATE") &&
    !actor.permissions.includes("PRODUCT_ARCHIVE")
  )
    ? "read-only"
    : "management";
  const [enrichedProduct] = await enrichMerchantProductMedia([product]);
  return { actor, product: serializeMerchantProduct(enrichedProduct!, actor.permissions, mode) };
}

export async function createMerchantProduct(reference: MerchantActorReference, rawInput: unknown) {
  const input = parse(createProductAggregateSchema, rawInput);
  const requestHash = operationHash("commerce.product.create", input);
  try {
    return await runCommerceSerializable(async (transaction) => {
      const actor = await resolveMerchantCommerceContext(reference, "PRODUCT_CREATE", transaction);
      assertRenderedMerchantOrganization(actor, input.contextOrganizationId);
      const replay = await resolveMerchantMutationReplay(transaction, {
        actor,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      });
      if (replay) return replayProduct(replay);
      const store = await loadStoreForCreate(transaction, actor);
      await assertMerchantCommerceContextCurrent(transaction, actor, "PRODUCT_CREATE");
      const category = await activeCategory(transaction, input.categoryId);
      const options = canonicalizeVariantOptions(input.defaultVariant.optionValues);
      const created = await transaction.product.create({
        data: {
          categoryId: category.id,
          description: input.description,
          name: input.name,
          normalizedSearchText: productSearchText(input),
          slug: input.slug,
          status: "DRAFT",
          storeId: store.id,
        },
      });
      await transaction.productVariant.create({
        data: {
          compareAtPrice: input.defaultVariant.compareAtPrice,
          currency: COMMERCE_CURRENCY,
          inventory: { create: {} },
          isDefault: true,
          optionKey: options.optionKey,
          optionValues: options.optionValues,
          price: input.defaultVariant.price,
          productId: created.id,
          sku: input.defaultVariant.sku,
          storeId: store.id,
          title: input.defaultVariant.title,
        },
      });
      const product = await transaction.product.findUniqueOrThrow({
        where: { id: created.id },
        include: merchantProductInclude,
      });
      const result = serializeMerchantProduct(product, actor.permissions, "management");
      await recordProductMutation(transaction, {
        action: "commerce.product.create",
        actor,
        after: auditProduct(product),
        idempotencyKey: input.idempotencyKey,
        product,
        requestHash,
        result,
      });
      return result;
    });
  } catch (error) {
    mapProductWriteError(error);
  }
}

export async function updateMerchantProduct(reference: MerchantActorReference, rawInput: unknown) {
  const input = parse(updateProductAggregateSchema, rawInput);
  return mutateProduct(reference, input, "PRODUCT_UPDATE", "commerce.product.update", async ({
    actor,
    product,
    transaction,
  }) => {
    await activeCategory(transaction, input.categoryId);
    const updated = await transaction.product.update({
      where: { id: product.id },
      data: {
        categoryId: input.categoryId,
        description: input.description,
        name: input.name,
        normalizedSearchText: productSearchText(input),
        slug: input.slug,
      },
      include: merchantProductInclude,
    });
    assertPublishedResultReady(updated);
    return { actor, product: updated };
  });
}

export async function publishMerchantProduct(reference: MerchantActorReference, rawInput: unknown) {
  const input = parse(productLifecycleSchema, rawInput);
  return mutateProduct(reference, input, "PRODUCT_UPDATE", "commerce.product.publish", async ({ actor, product, transaction }) => {
    if (product.status !== "DRAFT") commerceError("INVALID_TRANSITION", "Only a DRAFT Product can be published.");
    if (product.store.status !== "ACTIVE") commerceError("STORE_UNAVAILABLE", "Only an ACTIVE Store can publish Products.");
    const readiness = productReadiness(product);
    if (!readiness.ready) commerceError("VALIDATION_ERROR", "Product is not ready to publish.", { missing: readiness.missing });
    const updated = await transaction.product.update({
      where: { id: product.id },
      data: { publishedAt: new Date(), status: "PUBLISHED" },
      include: merchantProductInclude,
    });
    return { actor, product: updated };
  });
}

export async function unpublishMerchantProduct(reference: MerchantActorReference, rawInput: unknown) {
  const input = parse(productLifecycleSchema, rawInput);
  return mutateProduct(reference, input, "PRODUCT_UPDATE", "commerce.product.unpublish", async ({ actor, product, transaction }) => {
    if (product.status !== "PUBLISHED") commerceError("INVALID_TRANSITION", "Only a PUBLISHED Product can be unpublished.");
    const updated = await transaction.product.update({
      where: { id: product.id },
      data: { publishedAt: null, status: "DRAFT" },
      include: merchantProductInclude,
    });
    return { actor, product: updated };
  });
}

export async function archiveMerchantProduct(reference: MerchantActorReference, rawInput: unknown) {
  const input = parse(productLifecycleSchema, rawInput);
  return mutateProduct(reference, input, "PRODUCT_ARCHIVE", "commerce.product.archive", async ({ actor, product, transaction }) => {
    if (product.status !== "DRAFT" && product.status !== "PUBLISHED" && product.status !== "SUSPENDED") {
      commerceError("INVALID_TRANSITION", "Product cannot be archived from this state.");
    }
    const updated = await transaction.product.update({
      where: { id: product.id },
      data: { archivedAt: new Date(), publishedAt: null, status: "ARCHIVED" },
      include: merchantProductInclude,
    });
    return { actor, product: updated };
  });
}

export async function createMerchantVariant(reference: MerchantActorReference, rawInput: unknown) {
  const input = parse(createVariantSchema, rawInput);
  return mutateProduct(reference, input, "PRODUCT_UPDATE", "commerce.variant.create", async ({ actor, product, transaction }) => {
    const options = canonicalizeVariantOptions(input.optionValues);
    await transaction.productVariant.create({
      data: {
        compareAtPrice: input.compareAtPrice,
        currency: COMMERCE_CURRENCY,
        inventory: { create: {} },
        isDefault: product.variants.every((variant) => variant.status !== "ACTIVE" || Boolean(variant.archivedAt)),
        optionKey: options.optionKey,
        optionValues: options.optionValues,
        price: input.price,
        productId: product.id,
        sku: input.sku,
        storeId: product.storeId,
        title: input.title,
      },
    });
    const updated = await touchAndLoad(transaction, product.id);
    assertPublishedResultReady(updated);
    return { actor, product: updated };
  });
}

export async function updateMerchantVariant(reference: MerchantActorReference, rawInput: unknown) {
  const input = parse(updateVariantSchema, rawInput);
  return mutateProduct(reference, input, "PRODUCT_UPDATE", "commerce.variant.update", async ({ actor, product, transaction }) => {
    const variant = product.variants.find((item) => item.id === input.variantId);
    if (!variant) commerceError("NOT_FOUND", "Variant was not found.");
    if (variant.status === "ARCHIVED") commerceError("INVALID_TRANSITION", "Archived Variant is immutable until restored.");
    const options = canonicalizeVariantOptions(input.optionValues);
    await transaction.productVariant.update({
      where: { id: variant.id },
      data: {
        compareAtPrice: input.compareAtPrice,
        optionKey: options.optionKey,
        optionValues: options.optionValues,
        price: input.price,
        sku: input.sku,
        title: input.title,
      },
    });
    const updated = await touchAndLoad(transaction, product.id);
    assertPublishedResultReady(updated);
    return { actor, product: updated };
  });
}

export async function setMerchantDefaultVariant(reference: MerchantActorReference, rawInput: unknown) {
  const input = parse(setDefaultVariantSchema, rawInput);
  return mutateProduct(reference, input, "PRODUCT_UPDATE", "commerce.variant.default", async ({ actor, product, transaction }) => {
    const variant = product.variants.find((item) => item.id === input.variantId);
    if (!variant || variant.status !== "ACTIVE" || variant.archivedAt) {
      commerceError("NOT_FOUND", "Active Variant was not found.");
    }
    await transaction.productVariant.updateMany({
      where: { productId: product.id, isDefault: true },
      data: { isDefault: false },
    });
    await transaction.productVariant.update({ where: { id: variant.id }, data: { isDefault: true } });
    const updated = await touchAndLoad(transaction, product.id);
    assertPublishedResultReady(updated);
    return { actor, product: updated };
  });
}

export async function archiveMerchantVariant(reference: MerchantActorReference, rawInput: unknown) {
  const input = parse(archiveVariantSchema, rawInput);
  return mutateProduct(reference, input, "PRODUCT_UPDATE", "commerce.variant.archive", async ({ actor, product, transaction }) => {
    const variant = product.variants.find((item) => item.id === input.variantId);
    if (!variant || variant.status === "ARCHIVED") commerceError("NOT_FOUND", "Active Variant was not found.");
    const active = product.variants.filter((item) => item.status === "ACTIVE" && !item.archivedAt);
    if (product.status === "PUBLISHED" && active.length === 1) {
      commerceError("INVALID_TRANSITION", "Unpublish before archiving the last active Variant.");
    }
    if (variant.isDefault) {
      const replacement = product.variants.find((item) => item.id === input.replacementVariantId);
      if (!replacement || replacement.id === variant.id || replacement.status !== "ACTIVE" || replacement.archivedAt) {
        commerceError("VALIDATION_ERROR", "Archiving the Default requires an active replacement Variant.");
      }
      await transaction.productVariant.update({ where: { id: variant.id }, data: { isDefault: false } });
      await transaction.productVariant.update({ where: { id: replacement.id }, data: { isDefault: true } });
    } else if (input.replacementVariantId) {
      commerceError("VALIDATION_ERROR", "A replacement is only allowed for the Default Variant.");
    }
    await transaction.productVariant.update({
      where: { id: variant.id },
      data: { archivedAt: new Date(), isDefault: false, status: "ARCHIVED" },
    });
    const updated = await touchAndLoad(transaction, product.id);
    assertPublishedResultReady(updated);
    return { actor, product: updated };
  });
}

export async function restoreMerchantVariant(reference: MerchantActorReference, rawInput: unknown) {
  const input = parse(restoreVariantSchema, rawInput);
  return mutateProduct(reference, input, "PRODUCT_UPDATE", "commerce.variant.restore", async ({ actor, product, transaction }) => {
    const variant = product.variants.find((item) => item.id === input.variantId);
    if (!variant || variant.status !== "ARCHIVED") commerceError("NOT_FOUND", "Archived Variant was not found.");
    const hasActiveDefault = product.variants.some(
      (item) => item.status === "ACTIVE" && !item.archivedAt && item.isDefault,
    );
    if (!hasActiveDefault && !input.makeDefault) {
      commerceError("VALIDATION_ERROR", "Restoring this Variant must also establish the active Default.");
    }
    if (input.makeDefault) {
      await transaction.productVariant.updateMany({
        where: { productId: product.id, isDefault: true },
        data: { isDefault: false },
      });
    }
    await transaction.productVariant.update({
      where: { id: variant.id },
      data: { archivedAt: null, isDefault: input.makeDefault, status: "ACTIVE" },
    });
    const updated = await touchAndLoad(transaction, product.id);
    assertPublishedResultReady(updated);
    return { actor, product: updated };
  });
}

export async function addMerchantProductMedia(reference: MerchantActorReference, rawInput: unknown) {
  void reference;
  void rawInput;
  commerceError("VALIDATION_ERROR", "Raw Product media URL writes are closed; use managed Product media.");
}

export async function updateMerchantProductMedia(reference: MerchantActorReference, rawInput: unknown) {
  void reference;
  void rawInput;
  commerceError("VALIDATION_ERROR", "Legacy Product media mutations are closed; use managed Product media.");
}

export async function reorderMerchantProductMedia(reference: MerchantActorReference, rawInput: unknown) {
  void reference;
  void rawInput;
  commerceError("VALIDATION_ERROR", "Legacy Product media mutations are closed; use managed Product media.");
}

export async function removeMerchantProductMedia(reference: MerchantActorReference, rawInput: unknown) {
  void reference;
  void rawInput;
  commerceError("VALIDATION_ERROR", "Legacy Product media mutations are closed; use managed Product media.");
}

type AggregateInput = {
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  productId: string;
};

async function mutateProduct(
  reference: MerchantActorReference,
  input: AggregateInput,
  permission: CommercePermission,
  action: string,
  operation: (context: {
    actor: MerchantCommerceContext;
    product: MerchantProductRecord;
    transaction: Prisma.TransactionClient;
  }) => Promise<{ actor: MerchantCommerceContext; product: MerchantProductRecord }>,
) {
  const requestHash = operationHash(action, input);
  try {
    return await runCommerceSerializable(async (transaction) => {
      const actor = await resolveMerchantCommerceContext(reference, permission, transaction);
      assertRenderedMerchantOrganization(actor, input.contextOrganizationId);
      const replay = await resolveMerchantMutationReplay(transaction, {
        actor,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      });
      if (replay) {
        mutationReplayTarget(replay, input.productId);
        return replayProduct(replay);
      }
      await assertScopedProductExists(transaction, actor, input.productId);
      await lockProduct(transaction, input.productId);
      const product = await loadScopedProduct(transaction, actor, input.productId);
      assertCommerceExpectedVersion(product.updatedAt, input.expectedVersion);
      assertProductMutationStoreState(product.store.status);
      await assertMerchantCommerceContextCurrent(transaction, actor, permission);
      assertProductMutable(product);
      const before = auditProduct(product);
      const result = await operation({ actor, product, transaction });
      const dto = serializeMerchantProduct(result.product, actor.permissions, "management");
      await recordProductMutation(transaction, {
        action,
        actor,
        after: auditProduct(result.product),
        before,
        idempotencyKey: input.idempotencyKey,
        product: result.product,
        requestHash,
        result: dto,
      });
      return dto;
    });
  } catch (error) {
    mapProductWriteError(error);
  }
}

async function loadStoreForCreate(transaction: Prisma.TransactionClient, actor: MerchantCommerceContext) {
  if (!actor.storeId) commerceError("NOT_FOUND", "Merchant Store was not found.");
  const store = await transaction.store.findFirst({
    where: { id: actor.storeId, organizationId: actor.organizationId },
    select: { id: true, status: true },
  });
  if (!store) commerceError("NOT_FOUND", "Merchant Store was not found.");
  if (!(["DRAFT", "ACTIVE", "REJECTED"] as string[]).includes(store.status)) {
    commerceError("INVALID_TRANSITION", `Products cannot be created while Store is ${store.status}.`);
  }
  return store;
}

function assertProductMutationStoreState(status: string) {
  if (status === "PENDING_REVIEW" || status === "ARCHIVED") {
    commerceError("INVALID_TRANSITION", `Product changes are read-only while Store is ${status}.`);
  }
}

function assertProductMutable(product: Pick<MerchantProductRecord, "archivedAt" | "id" | "status">) {
  if (product.status === "ARCHIVED" || product.archivedAt) {
    commerceError("INVALID_TRANSITION", "Archived Product aggregates are immutable.", {
      productId: product.id,
    });
  }
}

async function activeCategory(transaction: Prisma.TransactionClient, categoryId: string) {
  const category = await transaction.marketplaceCategory.findFirst({
    where: { id: categoryId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!category) commerceError("NOT_FOUND", "Active Marketplace category was not found.");
  return category;
}

async function loadScopedProduct(
  transaction: Prisma.TransactionClient,
  actor: MerchantCommerceContext,
  productId: string,
) {
  const product = await transaction.product.findFirst({
    where: { id: productId, store: { organizationId: actor.organizationId } },
    include: merchantProductInclude,
  });
  if (!product) commerceError("NOT_FOUND", "Product was not found.");
  return product;
}

async function assertScopedProductExists(
  transaction: Prisma.TransactionClient,
  actor: MerchantCommerceContext,
  productId: string,
) {
  const product = await transaction.product.findFirst({
    where: { id: productId, store: { organizationId: actor.organizationId } },
    select: { id: true },
  });
  if (!product) commerceError("NOT_FOUND", "Product was not found.");
}

async function touchAndLoad(transaction: Prisma.TransactionClient, productId: string) {
  return transaction.product.update({
    where: { id: productId },
    data: { updatedAt: new Date() },
    include: merchantProductInclude,
  });
}

async function loadProducts(ids: string[]) {
  if (!ids.length) return [];
  return prisma.product.findMany({
    where: { id: { in: ids } },
    include: merchantProductInclude,
  });
}

async function enrichMerchantProductMedia(products: MerchantProductRecord[]) {
  const media = await resolvePublicMediaBatch(products.map((product) => ({
    id: product.id,
    kind: "PRODUCT" as const,
    legacyValues: product.media.map((item) => item.url),
    slot: "PRODUCT_IMAGE" as const,
  })));
  return products.map((product) => ({
    ...product,
    media: [
      ...(media.get(`PRODUCT:${product.id}:PRODUCT_IMAGE`) ?? []).map((reference, index) => ({
        altText: reference.altText,
        id: reference.assetId ?? product.media[index]?.id ?? `legacy-${index}`,
        mediaType: "IMAGE" as const,
        sortOrder: reference.sortOrder ?? index,
        url: reference.stableDeliveryPath,
        variantId: reference.variantId,
      })),
      ...product.media.filter((item) => !isSafePublicImageUrl(item.url)),
    ],
  }));
}

function productReadiness(product: MerchantProductRecord) {
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

function assertPublishedResultReady(product: MerchantProductRecord) {
  if (product.status !== "PUBLISHED" || product.store.status !== "ACTIVE") return;
  const readiness = productReadiness(product);
  if (!readiness.ready) {
    commerceError("VALIDATION_ERROR", "A PUBLISHED Product must remain publish-ready.", {
      missing: readiness.missing,
    });
  }
}

async function recordProductMutation(
  transaction: Prisma.TransactionClient,
  input: {
    action: string;
    actor: MerchantCommerceContext;
    after?: unknown;
    before?: unknown;
    idempotencyKey: string;
    product: MerchantProductRecord;
    requestHash: string;
    result: unknown;
  },
) {
  await recordMerchantMutation(transaction, {
    action: input.action,
    actor: input.actor,
    after: input.after,
    before: input.before,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    result: input.result,
    resultVersion: input.product.updatedAt,
    targetId: input.product.id,
    targetType: "Product",
  });
}

function auditProduct(product: MerchantProductRecord) {
  return {
    activeVariantCount: product.variants.filter((item) => item.status === "ACTIVE" && !item.archivedAt).length,
    categoryId: product.categoryId,
    defaultVariantId: product.variants.find((item) => item.status === "ACTIVE" && !item.archivedAt && item.isDefault)?.id ?? null,
    mediaCount: product.media.length,
    name: product.name,
    slug: product.slug,
    status: product.status,
    version: product.updatedAt.toISOString(),
  };
}

function replayProduct(replay: { result: Prisma.JsonValue | null; targetId: string | null }) {
  if (!replay.targetId || !replay.result || typeof replay.result !== "object" || Array.isArray(replay.result)) {
    commerceError("CONFLICT", "Product replay result is unavailable.");
  }
  return replay.result;
}

function operationHash(action: string, value: object) {
  return hashCheckoutRequest({ action, ...(value as Record<string, never>) });
}

function parse<Output>(
  schema: { safeParse(value: unknown): { success: true; data: Output } | { success: false } },
  value: unknown,
) {
  const result = schema.safeParse(value);
  if (!result.success) commerceError("VALIDATION_ERROR", "Commerce Product input is invalid.");
  return result.data;
}

function mapProductWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.join(",")
      : String(error.meta?.target ?? "");
    if (target.includes("slug")) commerceError("CONFLICT", "Product slug is already in use.");
    if (target.includes("sku")) commerceError("CONFLICT", "Variant SKU is already in use.");
    if (target.includes("optionKey")) commerceError("CONFLICT", "Variant options already exist.");
    if (target.includes("productId") || target.includes("Default")) {
      commerceError("CONFLICT", "Product already has an active Default Variant.");
    }
    commerceError("CONFLICT", "Product uniqueness conflict.");
  }
  throw error;
}

function emptyPage() {
  return { data: [], pageInfo: { hasNextPage: false, nextCursor: null } };
}
