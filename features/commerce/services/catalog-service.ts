import type { Prisma } from "@prisma/client";

import {
  assertProductPublishable,
  normalizeCommerceText,
} from "@/features/commerce/domain/catalog";
import { commerceError } from "@/features/commerce/domain/errors";
import { assertIqdAmount, COMMERCE_CURRENCY } from "@/features/commerce/domain/money";
import {
  assertAdminPermission,
  resolveMerchantCommerceContext,
  type CommerceAdminContext,
} from "@/features/commerce/services/authorization";
import type { MerchantIdentityInput } from "@/features/commerce/services/store-service";
import { runCommerceSerializable } from "@/features/commerce/services/transaction";

export interface CreateProductInput {
  categoryId: string;
  defaultVariant: Omit<CreateVariantInput, "isDefault" | "productId">;
  description?: string | null;
  name: string;
  slug: string;
  storeId: string;
}

export interface CreateVariantInput {
  compareAtPrice?: string | null;
  currency?: string;
  isDefault?: boolean;
  optionValues?: Readonly<Record<string, string>>;
  price: string;
  productId: string;
  sku: string;
  title: string;
}

function boundedText(value: string, field: string, min: number, max: number) {
  const result = value.trim();
  if (result.length < min || result.length > max) {
    commerceError("VALIDATION_ERROR", `${field} must be between ${min} and ${max} characters.`);
  }
  return result;
}

export function canonicalizeOptionValues(
  value: Readonly<Record<string, string>> | undefined,
) {
  const entries = Object.entries(value ?? {})
    .map(([key, item]) => [key.trim(), item.trim()] as const)
    .filter(([key, item]) => key.length > 0 && item.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length > 3 || entries.some(([key, item]) => key.length > 60 || item.length > 120)) {
    commerceError("VALIDATION_ERROR", "Variant options exceed the Milestone 2A limits.");
  }
  const options = Object.fromEntries(entries);
  return {
    optionKey:
      entries.length === 0
        ? "default"
        : entries.map(([key, item]) => `${key.toLocaleLowerCase()}=${item.toLocaleLowerCase()}`).join("|"),
    options,
  };
}

function validateVariantInput(input: Omit<CreateVariantInput, "productId">) {
  const sku = boundedText(input.sku.toUpperCase(), "sku", 1, 80);
  const title = boundedText(input.title, "title", 1, 160);
  const price = assertIqdAmount(input.price, "price");
  const compareAtPrice = input.compareAtPrice
    ? assertIqdAmount(input.compareAtPrice, "compareAtPrice")
    : null;
  if (compareAtPrice && !compareAtPrice.greaterThan(price)) {
    commerceError("VALIDATION_ERROR", "compareAtPrice must be greater than price.");
  }
  if ((input.currency ?? COMMERCE_CURRENCY) !== COMMERCE_CURRENCY) {
    commerceError("VALIDATION_ERROR", "Milestone 2A supports IQD only.");
  }
  const canonical = canonicalizeOptionValues(input.optionValues);
  return { canonical, compareAtPrice, price, sku, title };
}

export async function createProduct(
  identity: MerchantIdentityInput,
  input: CreateProductInput,
) {
  const name = boundedText(input.name, "name", 2, 160);
  const slug = boundedText(input.slug.toLowerCase(), "slug", 1, 100);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    commerceError("VALIDATION_ERROR", "Product slug is invalid.");
  }
  const description = input.description?.trim() || null;
  if (description && description.length > 8000) {
    commerceError("VALIDATION_ERROR", "Product description is too long.");
  }
  const defaultVariant = validateVariantInput({
    ...input.defaultVariant,
    isDefault: true,
  });

  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "PRODUCT_CREATE", transaction);
    const store = await transaction.store.findFirst({
      where: { id: input.storeId, organizationId: context.organizationId, status: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (!store) commerceError("NOT_FOUND", "Store was not found.");
    const category = await transaction.marketplaceCategory.findFirst({
      where: { id: input.categoryId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!category) commerceError("NOT_FOUND", "Marketplace category was not found.");
    const product = await transaction.product.create({
      data: {
        categoryId: category.id,
        description,
        name,
        normalizedSearchText: normalizeCommerceText(`${name} ${description ?? ""}`),
        slug,
        storeId: store.id,
      },
    });
    const variant = await transaction.productVariant.create({
      data: {
        compareAtPrice: defaultVariant.compareAtPrice,
        currency: COMMERCE_CURRENCY,
        isDefault: true,
        optionKey: defaultVariant.canonical.optionKey,
        optionValues: defaultVariant.canonical.options,
        price: defaultVariant.price,
        productId: product.id,
        sku: defaultVariant.sku,
        storeId: store.id,
        title: defaultVariant.title,
      },
    });
    await transaction.inventoryItem.create({ data: { variantId: variant.id } });
    return transaction.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { variants: true },
    });
  });
}

export async function createProductVariant(
  identity: MerchantIdentityInput,
  input: CreateVariantInput,
) {
  const validated = validateVariantInput(input);

  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "PRODUCT_CREATE", transaction);
    const product = await transaction.product.findFirst({
      where: {
        id: input.productId,
        status: { not: "ARCHIVED" },
        store: { organizationId: context.organizationId },
      },
      select: { id: true, storeId: true },
    });
    if (!product) commerceError("NOT_FOUND", "Product was not found.");
    const variant = await transaction.productVariant.create({
      data: {
        compareAtPrice: validated.compareAtPrice,
        currency: COMMERCE_CURRENCY,
        isDefault: input.isDefault ?? validated.canonical.optionKey === "default",
        optionKey: validated.canonical.optionKey,
        optionValues: validated.canonical.options,
        price: validated.price,
        productId: product.id,
        sku: validated.sku,
        storeId: product.storeId,
        title: validated.title,
      },
    });
    await transaction.inventoryItem.create({
      data: { variantId: variant.id },
    });
    return variant;
  });
}

export async function publishProduct(identity: MerchantIdentityInput, productId: string) {
  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "PRODUCT_UPDATE", transaction);
    const product = await transaction.product.findFirst({
      where: { id: productId, store: { organizationId: context.organizationId } },
      include: {
        store: { select: { status: true } },
        variants: { where: { status: "ACTIVE" }, select: { id: true } },
      },
    });
    if (!product) commerceError("NOT_FOUND", "Product was not found.");
    assertProductPublishable({
      activeVariantCount: product.variants.length,
      storeStatus: product.store.status,
    });
    return transaction.product.update({
      where: { id: product.id },
      data: { archivedAt: null, publishedAt: new Date(), status: "PUBLISHED" },
    });
  });
}

export async function archiveProduct(identity: MerchantIdentityInput, productId: string) {
  return runCommerceSerializable(async (transaction) => {
    const context = await resolveMerchantCommerceContext(identity, "PRODUCT_ARCHIVE", transaction);
    const product = await transaction.product.findFirst({
      where: { id: productId, store: { organizationId: context.organizationId } },
      select: { id: true },
    });
    if (!product) commerceError("NOT_FOUND", "Product was not found.");
    return transaction.product.update({
      where: { id: product.id },
      data: { archivedAt: new Date(), status: "ARCHIVED" },
    });
  });
}

export async function suspendProduct(
  context: CommerceAdminContext,
  productId: string,
  reason: string,
) {
  assertAdminPermission(context, "COMMERCE_CATALOG_MODERATE");
  const normalizedReason = boundedText(reason, "reason", 2, 1000);
  return runCommerceSerializable(async (transaction) => {
    const product = await transaction.product.findUnique({ where: { id: productId } });
    if (!product) commerceError("NOT_FOUND", "Product was not found.");
    const updated = await transaction.product.update({
      where: { id: product.id },
      data: {
        status: "SUSPENDED",
        suspendedAt: new Date(),
        suspensionReason: normalizedReason,
      },
    });
    await transaction.adminAuditLog.create({
      data: {
        action: "commerce.product.suspend",
        adminUserId: context.userId,
        metadata: { reason: normalizedReason } satisfies Prisma.InputJsonValue,
        targetId: product.id,
        targetType: "Product",
      },
    });
    return updated;
  });
}

export const publicStoreWhere = {
  archivedAt: null,
  organization: { deletedAt: null, isActive: true, status: "ACTIVE" as const },
  publishedAt: { not: null },
  status: "ACTIVE" as const,
};

export const publicProductWhere = {
  archivedAt: null,
  publishedAt: { not: null },
  status: "PUBLISHED" as const,
  store: publicStoreWhere,
  variants: { some: { status: "ACTIVE" as const } },
};
