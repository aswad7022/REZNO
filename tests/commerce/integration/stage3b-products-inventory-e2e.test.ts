import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { CommercePermission, SystemRole } from "@prisma/client";

import { serializeCustomerOrderDetail } from "../../../features/commerce/api/dto";
import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import { POSTGRES_INT_MAX } from "../../../features/commerce/domain/inventory";
import { getPublicProduct } from "../../../features/commerce/public/catalog-service";
import { resolveMerchantCommerceContext, type MerchantActorReference } from "../../../features/commerce/services/authorization";
import { adjustInventory, updateInventoryThreshold } from "../../../features/commerce/services/inventory-service";
import { getMerchantInventoryDetail, listMerchantInventory } from "../../../features/commerce/services/merchant-inventory-service";
import {
  addMerchantProductMedia,
  archiveMerchantProduct,
  archiveMerchantVariant,
  createMerchantProduct,
  createMerchantVariant,
  getMerchantProduct,
  listMerchantProducts,
  publishMerchantProduct,
  removeMerchantProductMedia,
  reorderMerchantProductMedia,
  restoreMerchantVariant,
  setMerchantDefaultVariant,
  unpublishMerchantProduct,
  updateMerchantProduct,
  updateMerchantProductMedia,
  updateMerchantVariant,
} from "../../../features/commerce/services/merchant-product-service";
import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../../features/identity/policies/authorization";
import { customerOrderInclude } from "../../../features/commerce/services/customer-order-query-service";
import { prisma } from "../../../lib/db/prisma";

interface ProductDto {
  category: { id: string; name: string; status: string };
  expectedVersion: string;
  id: string;
  media: Array<{ altText: string | null; id: string; sortOrder: number; url: string }>;
  name: string;
  slug: string;
  status: string;
  unsafeMediaIds: string[];
  variants: Array<{
    archivedAt: string | null;
    compareAtPrice: string | null;
    id: string;
    inventory: { id: string; onHand: number; reserved: number; version: number } | null;
    isDefault: boolean;
    optionValues: unknown;
    price: string;
    sku: string;
    status: string;
    title: string;
  }>;
}

async function reset() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.match(rows[0]?.database ?? "", /(?:_test|test_)/);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE');
}

async function createPerson(label: string) {
  return prisma.person.create({ data: {
    authUserId: `stage3b-${label}-${randomUUID()}`,
    firstName: label,
    isOnboarded: true,
    phone: "+9647500000000",
  } });
}

async function createActor(
  label: string,
  systemRole: SystemRole = "OWNER",
  permissions: CommercePermission[] = systemRole === "OWNER" ? [...OWNER_DEFAULT_COMMERCE_PERMISSIONS] : [],
  organizationId?: string,
) {
  const person = await createPerson(label);
  const organization = organizationId
    ? await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })
    : await prisma.organization.create({ data: { name: `${label} Org`, slug: `${label}-${randomUUID().slice(0, 8)}` } });
  const role = await prisma.role.create({ data: {
    commercePermissions: permissions,
    isSystem: true,
    name: `${systemRole}-${label}`,
    organizationId: organization.id,
    systemRole,
  } });
  const membership = await prisma.organizationMember.create({ data: {
    organizationId: organization.id,
    personId: person.id,
    roleId: role.id,
  } });
  return {
    membership,
    organization,
    person,
    reference: {
      contextOrganizationId: organization.id,
      membershipId: membership.id,
      personId: person.id,
    } satisfies MerchantActorReference,
  };
}

async function createActiveStore(organizationId: string, label: string) {
  return prisma.store.create({ data: {
    deliveryArea: "Karrada",
    deliveryCity: "Baghdad",
    deliveryEnabled: true,
    deliveryEstimateMinutes: 30,
    deliveryFee: "1000",
    minimumOrderValue: "0",
    name: `${label} Store`,
    organizationId,
    pickupArea: "Karrada",
    pickupCity: "Baghdad",
    pickupEnabled: true,
    pickupStreet: "Stage 3B Street",
    preparationEstimateMinutes: 15,
    publishedAt: new Date(),
    slug: `${label}-store-${randomUUID().slice(0, 8)}`,
    status: "ACTIVE",
    supportPhone: "+9647500000001",
  } });
}

function createInput(actor: Awaited<ReturnType<typeof createActor>>, categoryId: string, overrides: Record<string, unknown> = {}) {
  return {
    categoryId,
    contextOrganizationId: actor.organization.id,
    defaultVariant: {
      compareAtPrice: "12000",
      optionValues: {},
      price: "10000",
      sku: `SKU-${randomUUID().slice(0, 8)}`,
      title: "Default",
    },
    description: "Stage 3B deterministic Product",
    idempotencyKey: randomUUID(),
    name: "Stage 3B Product",
    slug: `stage3b-${randomUUID().slice(0, 8)}`,
    ...overrides,
  };
}

function envelope(actor: Awaited<ReturnType<typeof createActor>>, product: ProductDto, overrides: Record<string, unknown> = {}) {
  return {
    contextOrganizationId: actor.organization.id,
    expectedVersion: product.expectedVersion,
    idempotencyKey: randomUUID(),
    productId: product.id,
    ...overrides,
  };
}

function asProduct(value: unknown) { return value as ProductDto; }
function code(expected: CommerceDomainError["code"]) {
  return (error: unknown) => error instanceof CommerceDomainError && error.code === expected;
}

test("Gate 3B Products, Variants and Inventory PostgreSQL end-to-end", { concurrency: false }, async (t) => {
  await reset();
  t.after(async () => { await reset(); await prisma.$disconnect(); });
  const category = await prisma.marketplaceCategory.create({
    data: { name: "Stage 3B", normalizedName: "stage 3b", slug: `stage-3b-${randomUUID().slice(0, 8)}` },
  });
  const owner = await createActor("owner");
  const store = await createActiveStore(owner.organization.id, "owner");
  const createKey = randomUUID();
  const payload = createInput(owner, category.id, { idempotencyKey: createKey, slug: "canonical-product" });
  let product = asProduct(await createMerchantProduct(owner.reference, payload));

  await t.test("1-4 Product create is atomic, replay-safe, conflict-safe, and race-safe", async () => {
    assert.equal(product.status, "DRAFT");
    assert.equal(product.variants.length, 1);
    assert.equal(product.variants[0]?.isDefault, true);
    assert.ok(product.variants[0]?.inventory);
    assert.deepEqual(asProduct(await createMerchantProduct(owner.reference, payload)), product);
    await assert.rejects(createMerchantProduct(owner.reference, { ...payload, name: "Changed" }), code("IDEMPOTENCY_CONFLICT"));
    assert.equal(await prisma.businessAuditLog.count({ where: { action: "commerce.product.create", targetId: product.id } }), 1);
    const slug = `race-${randomUUID().slice(0, 8)}`;
    const race = await Promise.allSettled([
      createMerchantProduct(owner.reference, createInput(owner, category.id, { slug })),
      createMerchantProduct(owner.reference, createInput(owner, category.id, { slug })),
    ]);
    assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(await prisma.product.count({ where: { slug, storeId: store.id } }), 1);
  });

  await t.test("5-9 Product authorization is tenant-bound and role-scoped", async () => {
    const foreign = await createActor("foreign");
    await createActiveStore(foreign.organization.id, "foreign");
    await assert.rejects(getMerchantProduct(foreign.reference, product.id), code("NOT_FOUND"));
    const manager = await createActor("manager", "MANAGER", ["PRODUCT_VIEW", "PRODUCT_CREATE"], owner.organization.id);
    assert.equal(asProduct(await createMerchantProduct(manager.reference, createInput(owner, category.id))).status, "DRAFT");
    const readOnly = await createActor("read-manager", "MANAGER", ["PRODUCT_VIEW"], owner.organization.id);
    await assert.rejects(createMerchantProduct(readOnly.reference, createInput(owner, category.id)), code("FORBIDDEN"));
    const archiveOnly = await createActor("archive-manager", "MANAGER", ["PRODUCT_VIEW", "PRODUCT_ARCHIVE"], owner.organization.id);
    const archiveView = asProduct((await getMerchantProduct(archiveOnly.reference, product.id)).product);
    assert.equal((archiveView as ProductDto & { permittedActions: { archive: boolean; update: boolean } }).permittedActions.archive, true);
    assert.equal((archiveView as ProductDto & { permittedActions: { archive: boolean; update: boolean } }).permittedActions.update, false);
    const staff = await createActor("staff", "STAFF", ["PRODUCT_VIEW", "PRODUCT_CREATE", "INVENTORY_VIEW"], owner.organization.id);
    await assert.rejects(createMerchantProduct(staff.reference, createInput(owner, category.id)), code("FORBIDDEN"));
    const receptionist = await createActor("receptionist", "RECEPTIONIST", ["PRODUCT_VIEW"], owner.organization.id);
    await assert.rejects(resolveMerchantCommerceContext(receptionist.reference, "PRODUCT_VIEW"), code("FORBIDDEN"));
  });

  await t.test("Product pagination is deterministic and binds actor and filters", async () => {
    const first = await listMerchantProducts(owner.reference, { limit: 2 });
    assert.equal(first.data.length, 2);
    assert.ok(first.pageInfo.nextCursor);
    const second = await listMerchantProducts(owner.reference, { cursor: first.pageInfo.nextCursor!, limit: 2 });
    assert.equal(first.data.some((item) => second.data.some((next) => next.id === item.id)), false);
    await assert.rejects(listMerchantProducts(owner.reference, { cursor: first.pageInfo.nextCursor!, limit: 2, status: "DRAFT" }), code("INVALID_CURSOR"));
  });

  await t.test("Product stock filters are mutually exclusive for mixed Variant availability and preserve pagination", async () => {
    let mixed = asProduct(await createMerchantProduct(owner.reference, createInput(owner, category.id, {
      name: "Mixed Stock Product",
      slug: `mixed-stock-${randomUUID().slice(0, 8)}`,
    })));
    mixed = asProduct(await createMerchantVariant(owner.reference, {
      ...envelope(owner, mixed),
      compareAtPrice: "",
      optionValues: { Size: "Second" },
      price: "10000",
      sku: `MIXED-${randomUUID().slice(0, 8)}`,
      title: "Unavailable Variant",
    }));
    const availableInventory = mixed.variants.find((item) => item.isDefault)!.inventory!;
    await prisma.inventoryItem.update({ where: { id: availableInventory.id }, data: { onHand: 5 } });

    const collect = async (stock: "in_stock" | "out_of_stock") => {
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await listMerchantProducts(owner.reference, { cursor, limit: 1, stock });
        ids.push(...page.data.map((item) => item.id));
        cursor = page.pageInfo.nextCursor ?? undefined;
      } while (cursor);
      return ids;
    };
    const [inStock, outOfStock] = await Promise.all([collect("in_stock"), collect("out_of_stock")]);
    assert.equal(inStock.includes(mixed.id), true);
    assert.equal(outOfStock.includes(mixed.id), false);
    assert.equal(outOfStock.includes(product.id), true);
    assert.equal(inStock.some((id) => outOfStock.includes(id)), false);
  });

  await t.test("10-20 Product versioning, readiness, public lifecycle, and history are safe", async () => {
    const stale = product;
    product = asProduct(await updateMerchantProduct(owner.reference, {
      ...envelope(owner, product), categoryId: category.id, description: "Updated", name: "Updated Product", slug: product.slug,
    }));
    await assert.rejects(updateMerchantProduct(owner.reference, {
      ...envelope(owner, product), categoryId: category.id, description: "Stale", expectedVersion: stale.expectedVersion, name: "Stale", slug: product.slug,
    }), code("STALE_VERSION"));
    const updateRace = await Promise.allSettled(["A", "B"].map((value) => updateMerchantProduct(owner.reference, {
      ...envelope(owner, product), categoryId: category.id, description: value, name: `Concurrent ${value}`, slug: product.slug,
    })));
    assert.equal(updateRace.filter((result) => result.status === "fulfilled").length, 1);
    product = asProduct((await getMerchantProduct(owner.reference, product.id)).product);
    product = asProduct(await publishMerchantProduct(owner.reference, envelope(owner, product)));
    assert.equal((await getPublicProduct(store.slug, product.slug)).id, product.id);

    const draftOwner = await createActor("draft-owner");
    await prisma.store.create({ data: { name: "Draft Store", organizationId: draftOwner.organization.id, slug: `draft-${randomUUID()}` } });
    const draftProduct = asProduct(await createMerchantProduct(draftOwner.reference, createInput(draftOwner, category.id)));
    await assert.rejects(publishMerchantProduct(draftOwner.reference, envelope(draftOwner, draftProduct)), code("STORE_UNAVAILABLE"));
    await prisma.marketplaceCategory.update({ where: { id: category.id }, data: { status: "INACTIVE" } });
    await assert.rejects(updateMerchantProduct(owner.reference, {
      ...envelope(owner, product), categoryId: category.id, description: "Denied", name: product.name, slug: product.slug,
    }), code("NOT_FOUND"));
    await prisma.marketplaceCategory.update({ where: { id: category.id }, data: { status: "ACTIVE" } });
    product = asProduct(await unpublishMerchantProduct(owner.reference, envelope(owner, product)));
    await assert.rejects(getPublicProduct(store.slug, product.slug));
    const customer = await createPerson("historical-order");
    const order = await prisma.order.create({ data: {
      currency: "IQD", customerId: customer.id, customerNameSnapshot: "Historical Customer",
      customerPhoneSnapshot: "+9647500000000", fulfillmentMethod: "CUSTOMER_PICKUP", grandTotal: "10000",
      orderNumber: `STAGE3B-HISTORY-${randomUUID()}`, paymentMethod: "PAY_AT_PICKUP",
      reservationExpiresAt: new Date("2026-07-17T12:00:00.000Z"), status: "CANCELLED", storeId: store.id,
      storeNameSnapshot: store.name, storeSlugSnapshot: store.slug, subtotal: "10000",
    } });
    await prisma.orderItem.create({ data: {
      currency: "IQD", imageUrlSnapshot: "javascript:historical", lineSubtotal: "10000", lineTotal: "10000",
      optionValuesSnapshot: {}, orderId: order.id, productId: product.id, productNameSnapshot: "Immutable Product",
      productVariantId: product.variants[0]!.id, quantity: 1, skuSnapshot: "IMMUTABLE-SKU", unitPrice: "10000",
      variantTitleSnapshot: "Immutable Variant",
    } });
    product = asProduct(await archiveMerchantProduct(owner.reference, envelope(owner, product)));
    assert.equal(product.status, "ARCHIVED");
    const historical = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    assert.equal(historical.productNameSnapshot, "Immutable Product");
    assert.equal(historical.variantTitleSnapshot, "Immutable Variant");
  });

  let aggregate = asProduct(await createMerchantProduct(owner.reference, createInput(owner, category.id, { slug: `aggregate-${randomUUID().slice(0, 8)}` })));
  await t.test("21-31 Variant lifecycle preserves Default, Inventory, uniqueness, and concurrency", async () => {
    const variantKey = randomUUID();
    const variantPayload = {
      ...envelope(owner, aggregate, { idempotencyKey: variantKey }),
      compareAtPrice: "16000",
      optionValues: { Size: "Large" },
      price: "15000",
      sku: `LARGE-${randomUUID().slice(0, 8)}`,
      title: "Large",
    };
    aggregate = asProduct(await createMerchantVariant(owner.reference, variantPayload));
    assert.deepEqual(asProduct(await createMerchantVariant(owner.reference, variantPayload)), aggregate);
    const large = aggregate.variants.find((item) => item.title === "Large")!;
    assert.ok(large.inventory);
    await assert.rejects(createMerchantVariant(owner.reference, {
      ...envelope(owner, aggregate), compareAtPrice: "", optionValues: { Color: "Black" }, price: "1000", sku: large.sku, title: "SKU collision",
    }), code("CONFLICT"));
    await assert.rejects(createMerchantVariant(owner.reference, {
      ...envelope(owner, aggregate), compareAtPrice: "", optionValues: { size: " large " }, price: "1000", sku: `OPTION-${randomUUID()}`, title: "Option collision",
    }), code("CONFLICT"));
    aggregate = asProduct(await updateMerchantVariant(owner.reference, {
      ...envelope(owner, aggregate), compareAtPrice: "17000", optionValues: { Size: "Large" }, price: "15500", sku: large.sku, title: "Large Updated", variantId: large.id,
    }));
    assert.equal(aggregate.variants.find((item) => item.id === large.id)?.title, "Large Updated");
    aggregate = asProduct(await setMerchantDefaultVariant(owner.reference, envelope(owner, aggregate, { variantId: large.id })));
    assert.equal(aggregate.variants.filter((item) => item.status === "ACTIVE" && item.isDefault).length, 1);
    aggregate = asProduct(await createMerchantVariant(owner.reference, {
      ...envelope(owner, aggregate), compareAtPrice: "", optionValues: { Size: "Small" }, price: "9000", sku: `SMALL-${randomUUID()}`, title: "Small",
    }));
    const small = aggregate.variants.find((item) => item.title === "Small")!;
    const currentDefault = aggregate.variants.find((item) => item.isDefault)!;
    const race = await Promise.allSettled([
      setMerchantDefaultVariant(owner.reference, envelope(owner, aggregate, { variantId: small.id })),
      setMerchantDefaultVariant(owner.reference, envelope(owner, aggregate, { variantId: currentDefault.id })),
    ]);
    assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
    aggregate = asProduct((await getMerchantProduct(owner.reference, aggregate.id)).product);
    assert.equal(aggregate.variants.filter((item) => item.status === "ACTIVE" && item.isDefault).length, 1);
    const nonDefault = aggregate.variants.find((item) => !item.isDefault && item.status === "ACTIVE")!;
    aggregate = asProduct(await archiveMerchantVariant(owner.reference, envelope(owner, aggregate, { replacementVariantId: null, variantId: nonDefault.id })));
    assert.equal(aggregate.variants.find((item) => item.id === nonDefault.id)?.status, "ARCHIVED");
    aggregate = asProduct(await restoreMerchantVariant(owner.reference, envelope(owner, aggregate, { makeDefault: false, variantId: nonDefault.id })));
    const defaultVariant = aggregate.variants.find((item) => item.isDefault)!;
    const replacement = aggregate.variants.find((item) => !item.isDefault && item.status === "ACTIVE")!;
    await assert.rejects(archiveMerchantVariant(owner.reference, envelope(owner, aggregate, { replacementVariantId: null, variantId: defaultVariant.id })), code("VALIDATION_ERROR"));
    aggregate = asProduct(await archiveMerchantVariant(owner.reference, envelope(owner, aggregate, { replacementVariantId: replacement.id, variantId: defaultVariant.id })));
    assert.equal(aggregate.variants.find((item) => item.id === replacement.id)?.isDefault, true);
  });

  await t.test("32-39 media mutations and historical unsafe serialization are safe", async () => {
    const firstKey = randomUUID();
    const firstPayload = envelope(owner, aggregate, {
      altText: "Front", idempotencyKey: firstKey, url: "https://cdn.example.com/front.jpg", variantId: null,
    });
    aggregate = asProduct(await addMerchantProductMedia(owner.reference, firstPayload));
    assert.deepEqual(asProduct(await addMerchantProductMedia(owner.reference, firstPayload)), aggregate);
    aggregate = asProduct(await addMerchantProductMedia(owner.reference, envelope(owner, aggregate, {
      altText: "Back", url: "https://cdn.example.com/back.jpg", variantId: null,
    })));
    await assert.rejects(addMerchantProductMedia(owner.reference, envelope(owner, aggregate, {
      altText: "Duplicate", url: "https://cdn.example.com/back.jpg", variantId: null,
    })), code("CONFLICT"));
    await assert.rejects(addMerchantProductMedia(owner.reference, envelope(owner, aggregate, {
      altText: "Unsafe", url: "http://127.0.0.1/private.jpg", variantId: null,
    })), code("VALIDATION_ERROR"));
    const first = aggregate.media.find((item) => item.url.endsWith("front.jpg"))!;
    const second = aggregate.media.find((item) => item.url.endsWith("back.jpg"))!;
    aggregate = asProduct(await updateMerchantProductMedia(owner.reference, envelope(owner, aggregate, { altText: "Updated", mediaId: first.id })));
    await prisma.productMedia.update({ where: { id: first.id }, data: { sortOrder: -1 } });
    aggregate = asProduct((await getMerchantProduct(owner.reference, aggregate.id)).product);
    aggregate = asProduct(await reorderMerchantProductMedia(owner.reference, envelope(owner, aggregate, { mediaIds: [second.id, first.id] })));
    assert.deepEqual(aggregate.media.map((item) => item.id), [second.id, first.id]);
    await prisma.productMedia.create({ data: { productId: aggregate.id, sortOrder: 2, url: "javascript:historical" } });
    const safeView = asProduct((await getMerchantProduct(owner.reference, aggregate.id)).product);
    assert.equal(JSON.stringify(safeView).includes("javascript:historical"), false);
    assert.equal(safeView.unsafeMediaIds.length, 1);
    aggregate = asProduct(await removeMerchantProductMedia(owner.reference, envelope(owner, safeView, { mediaId: safeView.unsafeMediaIds[0] })));
    aggregate = asProduct(await publishMerchantProduct(owner.reference, envelope(owner, aggregate)));
    await prisma.productMedia.create({ data: { productId: aggregate.id, sortOrder: 2, url: "file:///historical" } });
    const publicDto = await getPublicProduct(store.slug, aggregate.slug);
    assert.equal(JSON.stringify(publicDto).includes("file:///historical"), false);
  });

  await t.test("40-53 Inventory ledger, replay, versions, bounds, threshold, tenant, and cursors are safe", async () => {
    const inventory = aggregate.variants.find((item) => item.isDefault)!.inventory!;
    const key = randomUUID();
    const input = {
      expectedVersion: inventory.version,
      idempotencyKey: key,
      inventoryItemId: inventory.id,
      quantityDelta: 10,
      reason: "Opening inventory",
    };
    const adjusted = await adjustInventory(owner.reference, input);
    assert.equal(adjusted.onHand, inventory.onHand + 10);
    assert.equal((await adjustInventory(owner.reference, input)).onHand, adjusted.onHand);
    assert.equal(await prisma.stockMovement.count({ where: { inventoryItemId: inventory.id, actorType: "MERCHANT" } }), 1);
    await assert.rejects(adjustInventory(owner.reference, { ...input, quantityDelta: 9 }), code("INVENTORY_CONFLICT"));
    await assert.rejects(adjustInventory(owner.reference, { ...input, idempotencyKey: randomUUID() }), code("STALE_VERSION"));
    const race = await Promise.allSettled([
      adjustInventory(owner.reference, { ...input, expectedVersion: adjusted.version, idempotencyKey: randomUUID(), quantityDelta: 1, reason: "Concurrent A" }),
      adjustInventory(owner.reference, { ...input, expectedVersion: adjusted.version, idempotencyKey: randomUUID(), quantityDelta: 1, reason: "Concurrent B" }),
    ]);
    assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
    let current = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
    await assert.rejects(adjustInventory(owner.reference, {
      ...input, expectedVersion: current.version, idempotencyKey: randomUUID(), quantityDelta: -(current.onHand + 1), reason: "Underflow",
    }), code("VALIDATION_ERROR"));
    await prisma.inventoryItem.update({ where: { id: inventory.id }, data: { reserved: 2 } });
    current = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
    await assert.rejects(adjustInventory(owner.reference, {
      ...input, expectedVersion: current.version, idempotencyKey: randomUUID(), quantityDelta: -(current.onHand - 1), reason: "Reserved floor",
    }), code("INSUFFICIENT_STOCK"));
    await prisma.inventoryItem.update({ where: { id: inventory.id }, data: { onHand: POSTGRES_INT_MAX, reserved: 0 } });
    current = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
    await assert.rejects(adjustInventory(owner.reference, {
      ...input, expectedVersion: current.version, idempotencyKey: randomUUID(), quantityDelta: 1, reason: "Overflow",
    }), code("VALIDATION_ERROR"));
    await prisma.inventoryItem.update({ where: { id: inventory.id }, data: { onHand: 5 } });
    current = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
    const threshold = await updateInventoryThreshold(owner.reference, {
      contextOrganizationId: owner.organization.id,
      expectedVersion: current.version,
      idempotencyKey: randomUUID(),
      inventoryItemId: inventory.id,
      lowStockThreshold: 5,
    }) as { lowStock: boolean; version: number };
    assert.equal(threshold.lowStock, true);
    await assert.rejects(updateInventoryThreshold(owner.reference, {
      contextOrganizationId: owner.organization.id,
      expectedVersion: current.version,
      idempotencyKey: randomUUID(),
      inventoryItemId: inventory.id,
      lowStockThreshold: 4,
    }), code("STALE_VERSION"));
    const lowStock = await listMerchantInventory(owner.reference, { limit: 20, lowStock: true });
    assert.equal(lowStock.data.some((item) => item.id === inventory.id), true);
    const movementPage = await getMerchantInventoryDetail(owner.reference, inventory.id, { limit: 1 });
    assert.equal(movementPage.movements.data.length, 1);
    if (movementPage.movements.pageInfo.nextCursor) {
      const next = await getMerchantInventoryDetail(owner.reference, inventory.id, { cursor: movementPage.movements.pageInfo.nextCursor, limit: 1 });
      assert.notEqual(next.movements.data[0]?.id, movementPage.movements.data[0]?.id);
      await assert.rejects(getMerchantInventoryDetail(owner.reference, inventory.id, { cursor: `${movementPage.movements.pageInfo.nextCursor}x`, limit: 1 }), code("INVALID_CURSOR"));
    }
    const foreign = await createActor("inventory-foreign");
    await createActiveStore(foreign.organization.id, "inventory-foreign");
    assert.equal((await listMerchantInventory(foreign.reference, { limit: 20 })).data.some((item) => item.id === inventory.id), false);
    await assert.rejects(adjustInventory(foreign.reference, { ...input, expectedVersion: threshold.version, idempotencyKey: randomUUID() }), code("NOT_FOUND"));
    await prisma.inventoryItem.update({ where: { id: inventory.id }, data: { version: POSTGRES_INT_MAX } });
    await assert.rejects(adjustInventory(owner.reference, {
      ...input, expectedVersion: POSTGRES_INT_MAX, idempotencyKey: randomUUID(), quantityDelta: 1,
    }), code("VALIDATION_ERROR"));
    await assert.rejects(updateInventoryThreshold(owner.reference, {
      contextOrganizationId: owner.organization.id,
      expectedVersion: POSTGRES_INT_MAX,
      idempotencyKey: randomUUID(),
      inventoryItemId: inventory.id,
      lowStockThreshold: 3,
    }), code("VALIDATION_ERROR"));
    await prisma.inventoryItem.update({ where: { id: inventory.id }, data: { version: 1 } });
  });

  await t.test("Archived Product is a terminal aggregate while replay and historical relationships remain readable", async () => {
    const archivedVariant = aggregate.variants.find((item) => item.status === "ARCHIVED")!;
    const archivedVariantInventory = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: archivedVariant.id } });
    await assert.rejects(adjustInventory(owner.reference, {
      expectedVersion: archivedVariantInventory.version,
      idempotencyKey: randomUUID(),
      inventoryItemId: archivedVariantInventory.id,
      quantityDelta: 1,
      reason: "Archived Variant denial",
    }), code("INVALID_TRANSITION"));

    aggregate = asProduct(await unpublishMerchantProduct(owner.reference, envelope(owner, aggregate)));
    const activeVariant = aggregate.variants.find((item) => item.status === "ACTIVE" && item.isDefault)!;
    const inventory = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: activeVariant.inventory!.id } });
    const customer = await createPerson("archived-aggregate-history");
    const cart = await prisma.cart.create({ data: {
      customerId: customer.id,
      storeId: store.id,
      items: { create: {
        productVariantId: activeVariant.id,
        quantity: 1,
        unitPriceSnapshot: activeVariant.price,
      } },
    } });
    const order = await prisma.order.create({ data: {
      currency: "IQD",
      customerId: customer.id,
      customerNameSnapshot: "Archived History Customer",
      customerPhoneSnapshot: "+9647500000000",
      fulfillmentMethod: "CUSTOMER_PICKUP",
      grandTotal: activeVariant.price,
      orderNumber: `STAGE3B-ARCHIVED-${randomUUID()}`,
      paymentMethod: "PAY_AT_PICKUP",
      reservationExpiresAt: new Date("2026-07-18T12:00:00.000Z"),
      status: "CANCELLED",
      storeId: store.id,
      storeNameSnapshot: store.name,
      storeSlugSnapshot: store.slug,
      subtotal: activeVariant.price,
      items: { create: {
        currency: "IQD",
        imageUrlSnapshot: "javascript:historical-snapshot",
        lineSubtotal: activeVariant.price,
        lineTotal: activeVariant.price,
        optionValuesSnapshot: activeVariant.optionValues as object,
        productId: aggregate.id,
        productNameSnapshot: "Archived Aggregate Product",
        productVariantId: activeVariant.id,
        quantity: 1,
        skuSnapshot: activeVariant.sku,
        unitPrice: activeVariant.price,
        variantTitleSnapshot: activeVariant.title,
      } },
    } });

    const archiveInput = envelope(owner, aggregate, { idempotencyKey: randomUUID() });
    const archivedResult = await archiveMerchantProduct(owner.reference, archiveInput);
    const afterArchive = await prisma.product.findUniqueOrThrow({ where: { id: aggregate.id } });
    const archiveCounts = {
      audits: await prisma.businessAuditLog.count({ where: { organizationId: owner.organization.id } }),
      movements: await prisma.stockMovement.count({ where: { inventoryItemId: inventory.id } }),
      mutations: await prisma.businessOperationMutation.count({ where: { organizationId: owner.organization.id } }),
    };
    assert.deepEqual(await archiveMerchantProduct(owner.reference, archiveInput), archivedResult);
    assert.deepEqual({
      audits: await prisma.businessAuditLog.count({ where: { organizationId: owner.organization.id } }),
      movements: await prisma.stockMovement.count({ where: { inventoryItemId: inventory.id } }),
      mutations: await prisma.businessOperationMutation.count({ where: { organizationId: owner.organization.id } }),
    }, archiveCounts);
    await assert.rejects(archiveMerchantProduct(owner.reference, {
      ...archiveInput,
      expectedVersion: afterArchive.updatedAt.toISOString(),
    }), code("IDEMPOTENCY_CONFLICT"));

    const archivedView = (await getMerchantProduct(owner.reference, aggregate.id)).product as Record<string, unknown> & {
      media: Array<{ id: string }>;
      permittedActions: Record<string, boolean>;
      unsafeMediaIds: string[];
      variants: ProductDto["variants"];
    };
    assert.equal("expectedVersion" in archivedView, false);
    assert.equal(Object.values(archivedView.permittedActions).some(Boolean), false);
    assert.deepEqual(archivedView.unsafeMediaIds, []);
    assert.equal(archivedView.variants.length, aggregate.variants.length);
    const inventoryView = await getMerchantInventoryDetail(owner.reference, inventory.id, { limit: 20 });
    assert.deepEqual(inventoryView.permittedActions, { adjust: false, threshold: false });
    assert.ok(inventoryView.movements.data.length > 0);
    assert.equal((await listMerchantProducts(owner.reference, { limit: 100, status: "ARCHIVED" })).data.some((item) => item.id === aggregate.id), true);
    assert.equal((await listMerchantInventory(owner.reference, { limit: 100, productStatus: "ARCHIVED" })).data.some((item) => item.id === inventory.id), true);

    const version = afterArchive.updatedAt.toISOString();
    const immutableSnapshot = JSON.stringify(await prisma.product.findUniqueOrThrow({
      where: { id: aggregate.id },
      include: {
        media: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        variants: { include: { inventory: true }, orderBy: { id: "asc" } },
      },
    }));
    const active = aggregate.variants.find((item) => item.status === "ACTIVE")!;
    const archived = aggregate.variants.find((item) => item.status === "ARCHIVED")!;
    const media = aggregate.media;
    const aggregateInput = (overrides: Record<string, unknown> = {}) => ({
      contextOrganizationId: owner.organization.id,
      expectedVersion: version,
      idempotencyKey: randomUUID(),
      productId: aggregate.id,
      ...overrides,
    });
    const denied: Array<() => Promise<unknown>> = [
      () => updateMerchantProduct(owner.reference, aggregateInput({ categoryId: category.id, description: "Denied", name: "Denied Product", slug: aggregate.slug })),
      () => publishMerchantProduct(owner.reference, aggregateInput()),
      () => unpublishMerchantProduct(owner.reference, aggregateInput()),
      () => archiveMerchantProduct(owner.reference, aggregateInput()),
      () => createMerchantVariant(owner.reference, aggregateInput({ compareAtPrice: "", optionValues: { Size: "Denied" }, price: "10000", sku: `DENIED-${randomUUID()}`, title: "Denied" })),
      () => updateMerchantVariant(owner.reference, aggregateInput({ compareAtPrice: "", optionValues: { Denied: "Update" }, price: "10000", sku: `DENIED-UPDATE-${randomUUID()}`, title: "Denied", variantId: active.id })),
      () => setMerchantDefaultVariant(owner.reference, aggregateInput({ variantId: active.id })),
      () => archiveMerchantVariant(owner.reference, aggregateInput({ replacementVariantId: null, variantId: active.id })),
      () => restoreMerchantVariant(owner.reference, aggregateInput({ makeDefault: false, variantId: archived.id })),
      () => addMerchantProductMedia(owner.reference, aggregateInput({ altText: "Denied", url: "https://cdn.example.com/denied.jpg", variantId: null })),
      () => updateMerchantProductMedia(owner.reference, aggregateInput({ altText: "Denied", mediaId: media[0]!.id })),
      () => reorderMerchantProductMedia(owner.reference, aggregateInput({ mediaIds: media.map((item) => item.id).reverse() })),
      () => removeMerchantProductMedia(owner.reference, aggregateInput({ mediaId: media[0]!.id })),
      () => adjustInventory(owner.reference, { expectedVersion: inventory.version, idempotencyKey: randomUUID(), inventoryItemId: inventory.id, quantityDelta: 1, reason: "Denied archived Product adjustment" }),
      () => updateInventoryThreshold(owner.reference, { contextOrganizationId: owner.organization.id, expectedVersion: inventory.version, idempotencyKey: randomUUID(), inventoryItemId: inventory.id, lowStockThreshold: 4 }),
    ];
    for (const operation of denied) await assert.rejects(operation, code("INVALID_TRANSITION"));

    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: aggregate.id },
      include: {
        media: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        variants: { include: { inventory: true }, orderBy: { id: "asc" } },
      },
    });
    assert.equal(persisted.updatedAt.toISOString(), version);
    assert.equal(JSON.stringify(persisted), immutableSnapshot);
    assert.deepEqual({
      audits: await prisma.businessAuditLog.count({ where: { organizationId: owner.organization.id } }),
      movements: await prisma.stockMovement.count({ where: { inventoryItemId: inventory.id } }),
      mutations: await prisma.businessOperationMutation.count({ where: { organizationId: owner.organization.id } }),
    }, archiveCounts);
    assert.equal(await prisma.cartItem.count({ where: { cartId: cart.id, productVariantId: activeVariant.id } }), 1);
    const historicalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: customerOrderInclude });
    const historicalItem = historicalOrder.items[0]!;
    assert.deepEqual({
      image: historicalItem.imageUrlSnapshot,
      name: historicalItem.productNameSnapshot,
      options: historicalItem.optionValuesSnapshot,
      price: historicalItem.unitPrice.toString(),
      sku: historicalItem.skuSnapshot,
      variant: historicalItem.variantTitleSnapshot,
    }, {
      image: "javascript:historical-snapshot",
      name: "Archived Aggregate Product",
      options: activeVariant.optionValues,
      price: activeVariant.price.replace(/\.0+$/, ""),
      sku: activeVariant.sku,
      variant: activeVariant.title,
    });
    assert.equal(serializeCustomerOrderDetail(historicalOrder).items[0]!.imageUrl, null);
    const foreign = await createActor("archived-product-foreign");
    await createActiveStore(foreign.organization.id, "archived-product-foreign");
    await assert.rejects(getMerchantProduct(foreign.reference, aggregate.id), code("NOT_FOUND"));
    await assert.rejects(getMerchantInventoryDetail(foreign.reference, inventory.id, { limit: 20 }), code("NOT_FOUND"));
  });

  await t.test("54-60 active Business, revoked identity, Store states, audits, and rollback stay safe", async () => {
    const alternate = await createActor("alternate");
    await createActiveStore(alternate.organization.id, "alternate");
    assert.equal((await resolveMerchantCommerceContext(owner.reference, "PRODUCT_VIEW")).organizationId, owner.organization.id);
    assert.equal((await resolveMerchantCommerceContext(alternate.reference, "PRODUCT_VIEW")).organizationId, alternate.organization.id);
    const revoked = await createActor("revoked", "MANAGER", ["PRODUCT_VIEW", "PRODUCT_UPDATE"], owner.organization.id);
    await prisma.organizationMember.update({ where: { id: revoked.membership.id }, data: { status: "INACTIVE" } });
    await assert.rejects(getMerchantProduct(revoked.reference, aggregate.id), code("FORBIDDEN"));
    await prisma.organizationMember.update({ where: { id: revoked.membership.id }, data: { status: "ACTIVE" } });
    await prisma.person.update({ where: { id: revoked.person.id }, data: { deletedAt: new Date() } });
    await assert.rejects(getMerchantProduct(revoked.reference, aggregate.id), code("FORBIDDEN"));

    const maintenance = asProduct(await createMerchantProduct(owner.reference, createInput(owner, category.id, {
      slug: `maintenance-${randomUUID().slice(0, 8)}`,
    })));
    await prisma.store.update({ where: { id: store.id }, data: { status: "SUSPENDED" } });
    const suspended = asProduct((await getMerchantProduct(owner.reference, maintenance.id)).product);
    await assert.rejects(publishMerchantProduct(owner.reference, envelope(owner, suspended)), code("STORE_UNAVAILABLE"));
    const suspendedInventory = suspended.variants.find((item) => item.isDefault)!.inventory!;
    await adjustInventory(owner.reference, {
      expectedVersion: suspendedInventory.version,
      idempotencyKey: randomUUID(),
      inventoryItemId: suspendedInventory.id,
      quantityDelta: 1,
      reason: "Suspended Store maintenance",
    });

    await prisma.store.update({ where: { id: store.id }, data: { archivedAt: new Date(), status: "ARCHIVED" } });
    const archived = asProduct((await getMerchantProduct(owner.reference, maintenance.id)).product);
    const audits = await prisma.businessAuditLog.count({ where: { organizationId: owner.organization.id } });
    await assert.rejects(updateMerchantProduct(owner.reference, {
      ...envelope(owner, archived), categoryId: category.id, description: "Denied", name: "Denied", slug: archived.slug,
    }), code("INVALID_TRANSITION"));
    assert.equal(await prisma.businessAuditLog.count({ where: { organizationId: owner.organization.id } }), audits);

    await prisma.store.update({ where: { id: store.id }, data: { archivedAt: null, status: "ACTIVE" } });
    const collisionSku = aggregate.variants[0]!.sku;
    const rollbackSlug = `rollback-${randomUUID().slice(0, 8)}`;
    await assert.rejects(createMerchantProduct(owner.reference, createInput(owner, category.id, {
      defaultVariant: { compareAtPrice: "", optionValues: {}, price: "1000", sku: collisionSku, title: "Default" },
      slug: rollbackSlug,
    })), code("CONFLICT"));
    assert.equal(await prisma.product.count({ where: { slug: rollbackSlug, storeId: store.id } }), 0);
  });
});
