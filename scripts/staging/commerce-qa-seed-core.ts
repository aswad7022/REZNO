import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { normalizeCommerceText } from "../../features/commerce/domain/catalog";

export const COMMERCE_QA_FIXTURE = {
  category: {
    name: "REZNO QA Essentials",
    normalizedName: "rezno qa essentials",
    slug: "rezno-qa-commerce-category",
  },
  inventory: {
    minimumAvailable: 50,
  },
  organization: {
    name: "REZNO Commerce QA Organization",
    slug: "rezno-qa-commerce-org",
  },
  product: {
    description: "Deterministic staging-only Product for REZNO physical-device Commerce QA.",
    name: "REZNO Commerce QA Product",
    slug: "rezno-qa-commerce-product",
  },
  store: {
    area: "Karrada",
    city: "Baghdad",
    name: "REZNO Commerce QA Store",
    slug: "rezno-qa-commerce-store",
  },
  variant: {
    optionKey: "default",
    price: "25000",
    sku: "REZNO-QA-COMMERCE-SKU",
    title: "Default",
  },
} as const;

export interface CommerceQaSeedResult {
  availableQuantity: number;
  categoryId: string;
  inventoryItemId: string;
  organizationId: string;
  productId: string;
  stockAdded: number;
  storeId: string;
  variantId: string;
}

export class CommerceQaSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceQaSeedInvariantError";
  }
}

/**
 * Atomically creates or repairs only the deterministic Commerce QA fixture.
 *
 * Inventory invariant: available stock is `onHand - reserved`. The seed never
 * lowers `onHand` and never writes `reserved`. When available stock is below
 * the QA floor, it increments `onHand` and records the matching ADJUSTMENT_IN
 * StockMovement in the same serializable transaction.
 */
export async function seedCommerceQaFixture(
  prisma: PrismaClient,
  options: { now?: Date } = {},
): Promise<CommerceQaSeedResult> {
  const now = options.now ?? new Date();
  return prisma.$transaction(
    async (transaction) => seedCommerceQaFixtureTransaction(transaction, now),
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 20_000,
    },
  );
}

async function seedCommerceQaFixtureTransaction(
  transaction: Prisma.TransactionClient,
  now: Date,
): Promise<CommerceQaSeedResult> {
  const organization = await transaction.organization.upsert({
    where: { slug: COMMERCE_QA_FIXTURE.organization.slug },
    create: {
      businessType: "PHYSICAL",
      isActive: true,
      isVerified: true,
      name: COMMERCE_QA_FIXTURE.organization.name,
      slug: COMMERCE_QA_FIXTURE.organization.slug,
      status: "ACTIVE",
      vertical: "OTHER",
    },
    update: {
      businessType: "PHYSICAL",
      deletedAt: null,
      isActive: true,
      isVerified: true,
      name: COMMERCE_QA_FIXTURE.organization.name,
      status: "ACTIVE",
      vertical: "OTHER",
    },
  });

  await transaction.organizationSettings.upsert({
    where: { organizationId: organization.id },
    create: {
      allowOnlinePayments: false,
      bookingEnabled: false,
      marketplaceVisible: true,
      organizationId: organization.id,
    },
    update: {
      allowOnlinePayments: false,
      marketplaceVisible: true,
    },
  });

  const store = await ensureFixtureStore(transaction, organization.id, now);
  const category = await transaction.marketplaceCategory.upsert({
    where: { slug: COMMERCE_QA_FIXTURE.category.slug },
    create: {
      displayOrder: 9_900,
      name: COMMERCE_QA_FIXTURE.category.name,
      normalizedName: COMMERCE_QA_FIXTURE.category.normalizedName,
      slug: COMMERCE_QA_FIXTURE.category.slug,
      status: "ACTIVE",
    },
    update: {
      name: COMMERCE_QA_FIXTURE.category.name,
      normalizedName: COMMERCE_QA_FIXTURE.category.normalizedName,
      status: "ACTIVE",
    },
  });
  const product = await ensureFixtureProduct(transaction, store.id, category.id, now);
  const variant = await ensureFixtureVariant(transaction, store.id, product.id);
  const inventory = await ensureFixtureInventory(transaction, variant.id);
  const stocked = await topUpFixtureInventory(transaction, inventory);

  return {
    availableQuantity: stocked.inventory.onHand - stocked.inventory.reserved,
    categoryId: category.id,
    inventoryItemId: stocked.inventory.id,
    organizationId: organization.id,
    productId: product.id,
    stockAdded: stocked.stockAdded,
    storeId: store.id,
    variantId: variant.id,
  };
}

async function ensureFixtureStore(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  now: Date,
) {
  const bySlug = await transaction.store.findUnique({
    where: { slug: COMMERCE_QA_FIXTURE.store.slug },
  });
  const byOrganization = await transaction.store.findUnique({ where: { organizationId } });

  if (bySlug && bySlug.organizationId !== organizationId) {
    throw new CommerceQaSeedInvariantError(
      "Commerce QA Store slug is owned by a different Organization; refusing reassignment.",
    );
  }
  if (byOrganization && byOrganization.slug !== COMMERCE_QA_FIXTURE.store.slug) {
    throw new CommerceQaSeedInvariantError(
      "Commerce QA Organization already owns a different Store; refusing replacement.",
    );
  }

  const data = {
    archiveReason: null,
    archivedAt: null,
    currency: "IQD",
    deliveryArea: COMMERCE_QA_FIXTURE.store.area,
    deliveryCity: COMMERCE_QA_FIXTURE.store.city,
    deliveryEnabled: true,
    deliveryEstimateMinutes: 45,
    deliveryFee: "2000",
    description: "Staging-only Store for authenticated REZNO Commerce QA.",
    minimumOrderValue: "0",
    name: COMMERCE_QA_FIXTURE.store.name,
    pickupAdditionalDetails: "REZNO QA fixture; no real merchant fulfillment.",
    pickupArea: COMMERCE_QA_FIXTURE.store.area,
    pickupCity: COMMERCE_QA_FIXTURE.store.city,
    pickupEnabled: true,
    pickupInstructions: "Use this Store only for staging QA Orders.",
    pickupStreet: "Karrada QA Street",
    preparationEstimateMinutes: 15,
    status: "ACTIVE" as const,
    suspensionReason: null,
  };

  if (bySlug) {
    return transaction.store.update({
      where: { id: bySlug.id },
      data: { ...data, publishedAt: bySlug.publishedAt ?? now },
    });
  }
  return transaction.store.create({
    data: {
      ...data,
      organizationId,
      publishedAt: now,
      slug: COMMERCE_QA_FIXTURE.store.slug,
    },
  });
}

async function ensureFixtureProduct(
  transaction: Prisma.TransactionClient,
  storeId: string,
  categoryId: string,
  now: Date,
) {
  const existing = await transaction.product.findUnique({
    where: {
      storeId_slug: {
        slug: COMMERCE_QA_FIXTURE.product.slug,
        storeId,
      },
    },
  });
  const normalizedSearchText = normalizeCommerceText(
    `${COMMERCE_QA_FIXTURE.product.name} ${COMMERCE_QA_FIXTURE.product.description}`,
  );
  const data = {
    archivedAt: null,
    categoryId,
    description: COMMERCE_QA_FIXTURE.product.description,
    name: COMMERCE_QA_FIXTURE.product.name,
    normalizedSearchText,
    status: "PUBLISHED" as const,
    suspendedAt: null,
    suspensionReason: null,
  };

  if (existing) {
    return transaction.product.update({
      where: { id: existing.id },
      data: { ...data, publishedAt: existing.publishedAt ?? now },
    });
  }
  return transaction.product.create({
    data: {
      ...data,
      publishedAt: now,
      slug: COMMERCE_QA_FIXTURE.product.slug,
      storeId,
    },
  });
}

async function ensureFixtureVariant(
  transaction: Prisma.TransactionClient,
  storeId: string,
  productId: string,
) {
  const bySku = await transaction.productVariant.findUnique({
    where: {
      storeId_sku: {
        sku: COMMERCE_QA_FIXTURE.variant.sku,
        storeId,
      },
    },
  });
  if (bySku && bySku.productId !== productId) {
    throw new CommerceQaSeedInvariantError(
      "Commerce QA SKU is owned by a different Product; refusing reassignment.",
    );
  }

  const byOption = await transaction.productVariant.findUnique({
    where: {
      productId_optionKey: {
        optionKey: COMMERCE_QA_FIXTURE.variant.optionKey,
        productId,
      },
    },
  });
  const activeDefault = await transaction.productVariant.findFirst({
    where: { isDefault: true, productId, status: { not: "ARCHIVED" } },
  });
  const candidates = [bySku, byOption, activeDefault].filter(
    (candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate),
  );
  if (new Set(candidates.map((candidate) => candidate.id)).size > 1) {
    throw new CommerceQaSeedInvariantError(
      "Commerce QA Product has conflicting default Variant identities; refusing destructive repair.",
    );
  }

  const existing = candidates[0];
  const data = {
    archivedAt: null,
    compareAtPrice: null,
    currency: "IQD",
    isDefault: true,
    optionKey: COMMERCE_QA_FIXTURE.variant.optionKey,
    optionValues: {},
    price: COMMERCE_QA_FIXTURE.variant.price,
    sku: COMMERCE_QA_FIXTURE.variant.sku,
    status: "ACTIVE" as const,
    title: COMMERCE_QA_FIXTURE.variant.title,
  };

  if (existing) {
    return transaction.productVariant.update({ where: { id: existing.id }, data });
  }
  return transaction.productVariant.create({ data: { ...data, productId, storeId } });
}

async function ensureFixtureInventory(
  transaction: Prisma.TransactionClient,
  variantId: string,
) {
  const existing = await transaction.inventoryItem.findUnique({ where: { variantId } });
  if (existing) return existing;
  return transaction.inventoryItem.create({
    data: { lowStockThreshold: 10, onHand: 0, variantId },
  });
}

async function topUpFixtureInventory(
  transaction: Prisma.TransactionClient,
  inventory: {
    id: string;
    onHand: number;
    reserved: number;
    version: number;
  },
) {
  const minimumOnHand = inventory.reserved + COMMERCE_QA_FIXTURE.inventory.minimumAvailable;
  if (inventory.onHand >= minimumOnHand) {
    return { inventory, stockAdded: 0 };
  }

  const stockAdded = minimumOnHand - inventory.onHand;
  const movementKey = createHash("sha256")
    .update(
      [
        "rezno-qa-commerce-stock-top-up",
        inventory.id,
        inventory.version,
        inventory.onHand,
        inventory.reserved,
        minimumOnHand,
      ].join(":"),
    )
    .digest("hex");
  const existingMovement = await transaction.stockMovement.findUnique({
    where: { idempotencyKey: movementKey },
  });
  if (existingMovement) {
    throw new CommerceQaSeedInvariantError(
      "Commerce QA inventory top-up key already exists for an unsatisfied stock state.",
    );
  }

  const update = await transaction.inventoryItem.updateMany({
    where: { id: inventory.id, version: inventory.version },
    data: { onHand: minimumOnHand, version: { increment: 1 } },
  });
  if (update.count !== 1) {
    throw new CommerceQaSeedInvariantError(
      "Commerce QA Inventory changed concurrently; no partial seed was committed.",
    );
  }

  const updated = await transaction.inventoryItem.findUniqueOrThrow({
    where: { id: inventory.id },
  });
  await transaction.stockMovement.create({
    data: {
      actorType: "SYSTEM",
      idempotencyKey: movementKey,
      inventoryItemId: inventory.id,
      metadata: {
        availableFloor: COMMERCE_QA_FIXTURE.inventory.minimumAvailable,
        source: "rezno-qa-commerce-seed",
      },
      onHandDelta: stockAdded,
      quantity: stockAdded,
      reason: "Staging Commerce QA fixture stock floor",
      reservedDelta: 0,
      resultingOnHand: updated.onHand,
      resultingReserved: updated.reserved,
      type: "ADJUSTMENT_IN",
    },
  });

  return { inventory: updated, stockAdded };
}
