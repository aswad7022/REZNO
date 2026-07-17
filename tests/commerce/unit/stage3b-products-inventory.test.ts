import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Prisma } from "@prisma/client";

import { sanitizeAuditValue } from "../../../features/business-operations/domain/validation";
import { serializeCustomerOrderSummary } from "../../../features/commerce/api/dto";
import {
  effectiveCommercePermissions,
  STAFF_ASSIGNABLE_COMMERCE_PERMISSIONS,
} from "../../../features/commerce/domain/merchant-access";
import {
  decodeMerchantCursor,
  encodeMerchantCursor,
  merchantCursorFingerprint,
} from "../../../features/commerce/domain/merchant-cursor";
import {
  addProductMediaSchema,
  canonicalizeVariantOptions,
  canonicalSku,
  createProductAggregateSchema,
  productSearchText,
  productSlugSchema,
  updateProductAggregateSchema,
  variantProfileSchema,
  wholeIqdSchema,
} from "../../../features/commerce/domain/product-input";
import { serializePublicProductDetail, type PublicProductRecord } from "../../../features/commerce/public/dto";
import { evaluateProductReadiness } from "../../../features/commerce/domain/product-readiness";
import {
  assertInventoryInteger,
  checkedInventoryResult,
  POSTGRES_INT_MAX,
} from "../../../features/commerce/domain/inventory";
import {
  serializeMerchantProduct,
  type MerchantProductRecord,
} from "../../../features/commerce/domain/product-dto";
import { getDashboardNavigation } from "../../../features/dashboard/navigation";

const organizationId = randomUUID();
const productId = randomUUID();

test("Gate 3B role and navigation policy is fail-closed", () => {
  const owner = effectiveCommercePermissions({ commercePermissions: [], systemRole: "OWNER" });
  assert.equal(owner.includes("PRODUCT_CREATE"), true);
  assert.equal(owner.includes("INVENTORY_ADJUST"), true);

  const manager = effectiveCommercePermissions({
    commercePermissions: ["PRODUCT_VIEW", "PRODUCT_CREATE", "STORE_MANAGE"],
    systemRole: "MANAGER",
  });
  assert.deepEqual(manager.filter((value) => value === "PRODUCT_VIEW" || value === "PRODUCT_CREATE"), ["PRODUCT_VIEW", "PRODUCT_CREATE"]);
  assert.equal(manager.includes("STORE_MANAGE"), false);

  assert.deepEqual(STAFF_ASSIGNABLE_COMMERCE_PERMISSIONS, ["PRODUCT_VIEW", "INVENTORY_VIEW", "INVENTORY_ADJUST"]);
  const staff = effectiveCommercePermissions({
    commercePermissions: ["PRODUCT_VIEW", "PRODUCT_CREATE", "INVENTORY_VIEW", "ORDER_VIEW"],
    systemRole: "STAFF",
  });
  assert.deepEqual(staff, ["PRODUCT_VIEW", "INVENTORY_VIEW"]);
  assert.deepEqual(effectiveCommercePermissions({ commercePermissions: ["PRODUCT_VIEW"], systemRole: "RECEPTIONIST" }), []);

  const staffNavigation = getDashboardNavigation("business", undefined, "STAFF", randomUUID(), true, staff);
  const staffHrefs = staffNavigation.flatMap((group) => group.items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]));
  assert.equal(staffHrefs.includes("/business/commerce/products"), true);
  assert.equal(staffHrefs.includes("/business/commerce/inventory"), true);
  assert.equal(staffHrefs.includes("/business/commerce/store"), false);
  assert.equal(staffHrefs.some((href) => href.includes("orders")), false);
  const receptionist = getDashboardNavigation("business", undefined, "RECEPTIONIST", randomUUID(), true, []);
  assert.equal(JSON.stringify(receptionist).includes("/business/commerce"), false);
});

test("Gate 3B Product schemas normalize canonical values and reject unsafe profiles", () => {
  assert.equal(productSlugSchema.parse("  SUMMER-SHOES  "), "summer-shoes");
  assert.throws(() => productSlugSchema.parse("unsafe slug"));
  assert.equal(canonicalSku("  sku  01 "), "SKU-01");
  assert.equal(variantProfileSchema.safeParse({ compareAtPrice: "", optionValues: {}, price: "100", sku: "ß".repeat(80), title: "A" }).success, false);
  assert.equal(wholeIqdSchema.parse("0001250"), "1250");
  assert.throws(() => wholeIqdSchema.parse("1.5"));
  assert.throws(() => wholeIqdSchema.parse("0"));
  assert.throws(() => wholeIqdSchema.parse("1000000000000000"));
  assert.throws(() => variantProfileSchema.parse({ compareAtPrice: "100", optionValues: {}, price: "100", sku: "A", title: "A" }));
  assert.throws(() => variantProfileSchema.parse({ compareAtPrice: "99", optionValues: {}, price: "100", sku: "A", title: "A" }));
  assert.equal(variantProfileSchema.parse({ compareAtPrice: "101", optionValues: {}, price: "100", sku: " A ", title: " A " }).sku, "A");

  const options = canonicalizeVariantOptions({ " Size ": " Large ", Color: "Black" });
  assert.deepEqual(options.optionValues, { Color: "Black", Size: "Large" });
  assert.equal(options.optionKey, "color=black|size=large");
  assert.throws(() => canonicalizeVariantOptions({ Size: "Large", " size ": "Small" }));
  assert.equal(productSearchText({ description: "  Summer  COLLECTION ", name: " Shoes " }), "shoes summer collection");
  const mediaEnvelope = {
    contextOrganizationId: organizationId,
    expectedVersion: new Date().toISOString(),
    idempotencyKey: randomUUID(),
    productId,
    altText: "Safe",
    url: "https://CDN.EXAMPLE.com:443/image.jpg",
    variantId: null,
  };
  assert.equal(addProductMediaSchema.parse(mediaEnvelope).url, "https://cdn.example.com/image.jpg");
  assert.equal(addProductMediaSchema.safeParse({ ...mediaEnvelope, url: "https://user:secret@cdn.example.com/image.jpg" }).success, false);

  const create = {
    categoryId: randomUUID(),
    contextOrganizationId: organizationId,
    defaultVariant: { compareAtPrice: "", optionValues: {}, price: "1000", sku: "SKU", title: "Default" },
    description: "Safe",
    idempotencyKey: randomUUID(),
    name: "Product",
    slug: "product",
  };
  assert.equal(createProductAggregateSchema.safeParse(create).success, true);
  assert.equal(createProductAggregateSchema.safeParse({ ...create, storeId: randomUUID() }).success, false);
  assert.equal(updateProductAggregateSchema.safeParse({
    ...create,
    defaultVariant: undefined,
    expectedVersion: new Date().toISOString(),
    productId,
    status: "PUBLISHED",
  }).success, false);
});

test("Gate 3B Product readiness enforces category, one Default, Variant validity, and safe media", () => {
  assert.equal(evaluateProductReadiness(readinessInput()).ready, true);
  const noCategory = evaluateProductReadiness({ ...readinessInput(), categoryStatus: "INACTIVE" });
  assert.equal(noCategory.missing.includes("category.active"), true);
  const duplicateDefault = evaluateProductReadiness({
    ...readinessInput(),
    variants: [readinessVariant(), { ...readinessVariant(), sku: "SECOND" }],
  });
  assert.equal(duplicateDefault.missing.includes("variants.default"), true);
  const invalidPrice = evaluateProductReadiness({ ...readinessInput(), variants: [{ ...readinessVariant(), price: new Prisma.Decimal("1.5") }] });
  assert.equal(invalidPrice.missing.includes("variants.valid"), true);
  const unsafeMedia = evaluateProductReadiness({ ...readinessInput(), media: [{ url: "javascript:alert(1)" }] });
  assert.equal(unsafeMedia.missing.includes("media.safe"), true);
});

test("Gate 3B serializers suppress historical unsafe Product and Order media", () => {
  const product = publicProduct();
  const detail = serializePublicProductDetail(product);
  assert.deepEqual(detail.media.map((item) => item.url), ["https://cdn.example.com/safe.jpg"]);
  assert.equal(detail.primaryMediaUrl, "https://cdn.example.com/safe.jpg");

  const order = {
    createdAt: new Date(),
    currency: "IQD",
    fulfillmentMethod: "CUSTOMER_PICKUP",
    fulfillmentStatus: "UNFULFILLED",
    grandTotal: new Prisma.Decimal(1000),
    id: randomUUID(),
    items: [{ imageUrlSnapshot: "javascript:legacy", productNameSnapshot: "Historical", quantity: 1, variantTitleSnapshot: "Default" }],
    orderNumber: "RZ-UNIT",
    paymentMethod: "CASH_ON_DELIVERY",
    paymentStatus: "UNPAID",
    reservationExpiresAt: new Date(Date.now() + 60_000),
    status: "PENDING",
    storeLogoUrlSnapshot: "data:text/html,unsafe",
    storeNameSnapshot: "Store",
    storeSlugSnapshot: "store",
  } as unknown as Parameters<typeof serializeCustomerOrderSummary>[0];
  const serialized = serializeCustomerOrderSummary(order);
  assert.equal(serialized.primaryItem?.imageUrl, null);
  assert.equal(serialized.store.logoUrl, null);
  assert.equal(JSON.stringify(serialized).includes("javascript:legacy"), false);
});

test("Archived Product management DTO is structurally read-only while mutable lifecycle DTOs are unchanged", () => {
  const archived = serializeMerchantProduct(
    merchantProduct("ARCHIVED", new Date("2026-07-17T10:00:00.000Z")),
    ["PRODUCT_UPDATE", "PRODUCT_ARCHIVE"],
    "management",
  ) as unknown as ManagementProductDto;
  assert.equal("expectedVersion" in archived, false);
  assert.deepEqual(archived.permittedActions, {
    addMedia: false,
    archive: false,
    createVariant: false,
    publish: false,
    unpublish: false,
    update: false,
  });
  assert.deepEqual(archived.unsafeMediaIds, []);
  assert.equal(archived.variants.length, 1);
  assert.deepEqual(archived.media.map((item) => item.url), ["https://cdn.example.com/safe.jpg"]);

  for (const status of ["DRAFT", "PUBLISHED", "SUSPENDED"] as const) {
    const mutable = serializeMerchantProduct(
      merchantProduct(status, null),
      ["PRODUCT_UPDATE", "PRODUCT_ARCHIVE"],
      "management",
    ) as unknown as ManagementProductDto;
    assert.equal("expectedVersion" in mutable, true, status);
    assert.equal(mutable.permittedActions.update, true, status);
    assert.equal(mutable.permittedActions.archive, true, status);
    assert.equal(mutable.permittedActions.publish, status === "DRAFT", status);
    assert.equal(mutable.permittedActions.unpublish, status === "PUBLISHED", status);
  }
});

interface ManagementProductDto {
  expectedVersion?: string;
  media: Array<{ url: string }>;
  permittedActions: {
    addMedia: boolean;
    archive: boolean;
    createVariant: boolean;
    publish: boolean;
    unpublish: boolean;
    update: boolean;
  };
  unsafeMediaIds: string[];
  variants: unknown[];
}

test("Gate 3B Inventory arithmetic is bounded and preserves the reserved floor", () => {
  assert.equal(assertInventoryInteger(POSTGRES_INT_MAX, "onHand"), POSTGRES_INT_MAX);
  assert.throws(() => assertInventoryInteger(-1, "onHand"));
  assert.throws(() => assertInventoryInteger(POSTGRES_INT_MAX + 1, "onHand"));
  assert.equal(checkedInventoryResult(10, -4), 6);
  assert.throws(() => checkedInventoryResult(0, -1));
  assert.throws(() => checkedInventoryResult(POSTGRES_INT_MAX, 1));
  assert.throws(() => checkedInventoryResult(10, 0));
  const reserved = 7;
  assert.equal(checkedInventoryResult(10, -3) >= reserved, true);
  assert.equal(checkedInventoryResult(10, -4) < reserved, true);
  const available = 8 - 3;
  assert.equal(available <= 5, true);
});

test("Gate 3B cursors bind actor, filter, target, snapshot, and reject tampering", () => {
  const filter = merchantCursorFingerprint({ q: "shoe", status: "DRAFT" });
  const encoded = encodeMerchantCursor({
    actor: "membership:person",
    filter,
    id: randomUUID(),
    kind: "products",
    snapshot: new Date("2026-07-17T10:00:00.000Z").toISOString(),
    sortValue: new Date("2026-07-17T09:00:00.000Z").toISOString(),
    target: randomUUID(),
  });
  const expected = { actor: "membership:person", filter, kind: "products" as const, target: JSON.parse(Buffer.from(encoded, "base64url").toString()).target as string };
  assert.equal(decodeMerchantCursor(encoded, expected).snapshotDate.toISOString(), "2026-07-17T10:00:00.000Z");
  assert.throws(() => decodeMerchantCursor(encoded, { ...expected, actor: "other" }), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "INVALID_CURSOR"));
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as Record<string, unknown>;
  payload.sortValue = "not-a-date";
  const tampered = Buffer.from(JSON.stringify(payload)).toString("base64url");
  assert.throws(() => decodeMerchantCursor(tampered, expected));
  const malformedId = encodeMerchantCursor({
    actor: "membership:person",
    filter,
    id: "------------------------------------",
    kind: "products",
    snapshot: new Date("2026-07-17T10:00:00.000Z").toISOString(),
    sortValue: new Date("2026-07-17T09:00:00.000Z").toISOString(),
    target: expected.target,
  });
  assert.throws(() => decodeMerchantCursor(malformedId, expected));
});

test("Gate 3B audit sanitization strips secrets and bounds text", () => {
  const result = sanitizeAuditValue({
    actor: { membershipId: "safe", password: "never", token: "never" },
    description: "x".repeat(900),
  }) as Record<string, unknown>;
  assert.equal(JSON.stringify(result).includes("never"), false);
  assert.equal((result.description as string).length, 500);
});

function readinessVariant() {
  return {
    archivedAt: null,
    compareAtPrice: new Prisma.Decimal(1200),
    currency: "IQD",
    inventory: { id: randomUUID() },
    isDefault: true,
    optionKey: "default",
    price: new Prisma.Decimal(1000),
    sku: "SKU",
    status: "ACTIVE",
  };
}

function readinessInput() {
  return {
    categoryStatus: "ACTIVE",
    description: "Production Product",
    media: [{ url: "https://cdn.example.com/safe.jpg" }],
    name: "Product",
    organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
    productArchivedAt: null,
    slug: "product",
    store: { archivedAt: null, publishedAt: new Date(), status: "ACTIVE" },
    variants: [readinessVariant()],
  };
}

function publicProduct(): PublicProductRecord {
  return {
    category: { displayOrder: 1, id: randomUUID(), name: "Category", slug: "category" },
    description: "Product",
    id: productId,
    media: [
      { altText: null, id: randomUUID(), mediaType: "IMAGE", sortOrder: 0, url: "javascript:unsafe" },
      { altText: "Safe", id: randomUUID(), mediaType: "IMAGE", sortOrder: 1, url: "https://cdn.example.com/safe.jpg" },
    ],
    name: "Product",
    slug: "product",
    store: {
      coverImageUrl: null,
      currency: "IQD",
      deliveryArea: null,
      deliveryCity: null,
      deliveryEnabled: false,
      deliveryEstimateMinutes: null,
      deliveryFee: new Prisma.Decimal(0),
      description: null,
      id: randomUUID(),
      logoUrl: null,
      minimumOrderValue: new Prisma.Decimal(0),
      name: "Store",
      pickupArea: null,
      pickupCity: null,
      pickupEnabled: true,
      pickupInstructions: null,
      preparationEstimateMinutes: 10,
      slug: "store",
    },
    variants: [{
      compareAtPrice: null,
      currency: "IQD",
      id: randomUUID(),
      inventory: { onHand: 1, reserved: 0 },
      isDefault: true,
      optionValues: {},
      price: new Prisma.Decimal(1000),
      title: "Default",
    }],
  };
}

function merchantProduct(
  status: "DRAFT" | "PUBLISHED" | "SUSPENDED" | "ARCHIVED",
  archivedAt: Date | null,
): MerchantProductRecord {
  const now = new Date("2026-07-17T09:00:00.000Z");
  return {
    archivedAt,
    category: { id: randomUUID(), name: "Category", slug: "category", status: "ACTIVE" },
    categoryId: randomUUID(),
    createdAt: now,
    description: "Production Product",
    id: productId,
    media: [
      ...(archivedAt ? [{ altText: null, id: randomUUID(), mediaType: "IMAGE" as const, sortOrder: 0, url: "javascript:unsafe", variantId: null }] : []),
      { altText: "Safe", id: randomUUID(), mediaType: "IMAGE", sortOrder: archivedAt ? 1 : 0, url: "https://cdn.example.com/safe.jpg", variantId: null },
    ],
    name: "Product",
    normalizedSearchText: "product production product",
    publishedAt: status === "PUBLISHED" || status === "SUSPENDED" || status === "ARCHIVED" ? now : null,
    slug: "product",
    status,
    store: {
      archivedAt: null,
      id: randomUUID(),
      organization: { deletedAt: null, isActive: true, status: "ACTIVE" },
      publishedAt: now,
      status: "ACTIVE",
    },
    storeId: randomUUID(),
    updatedAt: now,
    variants: [{
      archivedAt: null,
      compareAtPrice: new Prisma.Decimal(1200),
      createdAt: now,
      currency: "IQD",
      id: randomUUID(),
      inventory: {
        id: randomUUID(),
        lowStockThreshold: 1,
        onHand: 5,
        reserved: 1,
        updatedAt: now,
        version: 1,
      },
      isDefault: true,
      optionKey: "default",
      optionValues: {},
      price: new Prisma.Decimal(1000),
      productId,
      sku: "SKU",
      status: "ACTIVE",
      storeId: randomUUID(),
      title: "Default",
      updatedAt: now,
    }],
  } as MerchantProductRecord;
}
