import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { ProductStatus, StoreStatus } from "@prisma/client";

import { prisma } from "../../../lib/db/prisma";

export async function assertPublicCatalogTestDatabase() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  const name = rows[0]?.database ?? "";
  assert.match(name, /(?:_test|test_)/, `Refusing public catalog tests against ${name}`);
}

export async function resetPublicCatalogTestData() {
  await assertPublicCatalogTestDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
}

export async function seedPublicCatalogFixture() {
  await resetPublicCatalogTestData();
  const phones = await prisma.marketplaceCategory.create({
    data: { displayOrder: 1, name: "هواتف", normalizedName: "هواتف", slug: "phones" },
  });
  const accessories = await prisma.marketplaceCategory.create({
    data: { displayOrder: 2, name: "Accessories", normalizedName: "accessories", slug: "accessories" },
  });
  const emptyCategory = await prisma.marketplaceCategory.create({
    data: { displayOrder: 3, name: "Empty", normalizedName: "empty", slug: "empty" },
  });

  const active = await createStore("active", "متجر أزياء بغداد", "ACTIVE", {
    deliveryEnabled: true,
    pickupEnabled: true,
  });
  const second = await createStore("second", "Second Store", "ACTIVE", { pickupEnabled: true });
  const draft = await createStore("draft", "Hidden Draft", "DRAFT");
  const pending = await createStore("pending", "Hidden Pending", "PENDING_REVIEW");
  const rejected = await createStore("rejected", "Hidden Rejected", "REJECTED");
  const suspended = await createStore("suspended", "Hidden Suspended", "SUSPENDED");
  const archived = await createStore("archived", "Hidden Archived", "ARCHIVED");

  const equalCreatedAt = new Date("2026-07-12T12:00:00.000Z");
  const arabic = await createProduct(active.id, phones.id, "arabic-phone", "هاتف أندرويد", {
    createdAt: equalCreatedAt,
    description: "هــــاتــف مُمتاز",
    onHand: 5,
    price: "10000",
  });
  const latin = await createProduct(active.id, phones.id, "premium-phone", "Premium Phone", {
    createdAt: equalCreatedAt,
    onHand: 3,
    price: "10000",
  });
  const equalA = await createProduct(active.id, phones.id, "equal-a", "Equal Product", {
    createdAt: equalCreatedAt,
    onHand: 1,
    price: "10000",
  });
  const equalB = await createProduct(active.id, phones.id, "equal-b", "Equal Product", {
    createdAt: equalCreatedAt,
    onHand: 1,
    price: "10000",
  });
  const outOfStock = await createProduct(active.id, accessories.id, "out-of-stock", "Out Of Stock", {
    createdAt: equalCreatedAt,
    onHand: 0,
    price: "30000",
  });
  const secondProduct = await createProduct(second.id, accessories.id, "second-product", "Second Product", {
    onHand: 2,
    price: "20000",
  });

  await createProduct(active.id, phones.id, "draft-product", "Hidden Draft Product", {
    onHand: 1,
    price: "40000",
    status: "DRAFT",
  });
  await createProduct(active.id, phones.id, "suspended-product", "Hidden Suspended Product", {
    onHand: 1,
    price: "40000",
    status: "SUSPENDED",
  });
  await createProduct(active.id, phones.id, "archived-product", "Hidden Archived Product", {
    onHand: 1,
    price: "40000",
    status: "ARCHIVED",
  });
  await createProduct(suspended.id, phones.id, "hidden-store-product", "Hidden Store Product", {
    onHand: 1,
    price: "40000",
  });

  return {
    categories: { accessories, emptyCategory, phones },
    products: { arabic, equalA, equalB, latin, outOfStock, secondProduct },
    stores: { active, archived, draft, pending, rejected, second, suspended },
  };
}

async function createStore(
  label: string,
  name: string,
  status: StoreStatus,
  fulfillment: { deliveryEnabled?: boolean; pickupEnabled?: boolean } = {},
) {
  const organization = await prisma.organization.create({
    data: { name: `${label} Organization`, slug: `${label}-organization-${randomUUID().slice(0, 8)}` },
  });
  return prisma.store.create({
    data: {
      archiveReason: status === "ARCHIVED" ? "Hidden archive reason" : null,
      archivedAt: status === "ARCHIVED" ? new Date() : null,
      deliveryArea: fulfillment.deliveryEnabled ? "Karrada" : null,
      deliveryCity: fulfillment.deliveryEnabled ? "Baghdad" : null,
      deliveryEnabled: fulfillment.deliveryEnabled ?? false,
      deliveryEstimateMinutes: fulfillment.deliveryEnabled ? 45 : null,
      deliveryFee: fulfillment.deliveryEnabled ? "1000" : "0",
      description: `${name} public description`,
      minimumOrderValue: "5000",
      name,
      organizationId: organization.id,
      pickupArea: fulfillment.pickupEnabled ? "Karrada" : null,
      pickupCity: fulfillment.pickupEnabled ? "Baghdad" : null,
      pickupEnabled: fulfillment.pickupEnabled ?? false,
      pickupInstructions: fulfillment.pickupEnabled ? "Public pickup instructions" : null,
      pickupStreet: fulfillment.pickupEnabled ? "Test Street" : null,
      preparationEstimateMinutes: 20,
      publishedAt: status === "ACTIVE" || status === "SUSPENDED" ? new Date() : null,
      reviewReason: status === "REJECTED" ? "Hidden rejection reason" : null,
      slug: `${label}-store`,
      status,
      suspensionReason: status === "SUSPENDED" ? "Hidden suspension reason" : null,
    },
  });
}

async function createProduct(
  storeId: string,
  categoryId: string,
  slug: string,
  name: string,
  options: {
    createdAt?: Date;
    description?: string;
    onHand: number;
    price: string;
    status?: ProductStatus;
  },
) {
  const status = options.status ?? "PUBLISHED";
  return prisma.product.create({
    data: {
      archivedAt: status === "ARCHIVED" ? new Date() : null,
      categoryId,
      createdAt: options.createdAt,
      description: options.description ?? `${name} description`,
      media: {
        create: { altText: `${name} image`, sortOrder: 0, url: `https://example.invalid/${slug}.jpg` },
      },
      name,
      normalizedSearchText: name.toLocaleLowerCase(),
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      slug,
      status,
      storeId,
      suspensionReason: status === "SUSPENDED" ? "Hidden Product reason" : null,
      variants: {
        create: {
          inventory: { create: { onHand: options.onHand } },
          isDefault: true,
          optionKey: "default",
          optionValues: {},
          price: options.price,
          sku: `SKU-${slug}-${randomUUID().slice(0, 8)}`,
          title: "Default",
        },
      },
    },
  });
}
