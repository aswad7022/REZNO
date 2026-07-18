import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

import { serializeCart, serializeCheckoutReceipt, serializeMerchantInventory } from "../../../features/commerce/api/dto";
import { mapCommerceApiError } from "../../../features/commerce/api/errors";
import {
  normalizedCustomerInstructions,
  parseAddressCreate,
  parseCartReplacement,
  parseCheckoutRequest,
  parseIdempotencyKey,
  parseInventoryAdjustment,
  parseMerchantInventoryQuery,
} from "../../../features/commerce/api/validation";
import { commerceError } from "../../../features/commerce/domain/errors";
import { hashCheckoutRequest } from "../../../features/commerce/domain/idempotency";
import type { CartApiRecord } from "../../../features/commerce/services/cart-service";

function jsonRequest(body: unknown, headers: HeadersInit = {}) {
  return new Request("http://localhost/api/commerce/test", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });
}

test("address input is bounded, practical, and rejects unknown or partial coordinates", async () => {
  const address = await parseAddressCreate(jsonRequest({
    additionalDetails: "Floor 2",
    area: "Karrada",
    city: "Baghdad",
    isDefault: true,
    latitude: 33.312806,
    longitude: 44.361488,
    phone: "+964 750 000 0000",
    recipientName: "Customer",
    street: "Test Street",
  }));
  assert.equal(address.city, "Baghdad");
  assert.equal(address.latitude, "33.312806");
  await assert.rejects(() => parseAddressCreate(jsonRequest({ ...address, unexpected: true })));
  await assert.rejects(() => parseAddressCreate(jsonRequest({ ...address, label: "Home" })));
  await assert.rejects(() => parseAddressCreate(jsonRequest({ ...address, longitude: undefined })));
});

test("Cart quantity/version/replacement validation is strict", async () => {
  const parsed = await parseCartReplacement(jsonRequest({
    cartId: "11111111-1111-4111-8111-111111111111",
    cartVersion: 2,
    quantity: 99,
    variantId: "22222222-2222-4222-8222-222222222222",
  }));
  assert.equal(parsed.expectedVersion, 2);
  await assert.rejects(() => parseCartReplacement(jsonRequest({ ...parsed, cartVersion: 0 })));
  await assert.rejects(() => parseCartReplacement(jsonRequest({ ...parsed, quantity: 100 })));
});

test("Checkout accepts one UUID header and enforces fulfillment/address compatibility", async () => {
  const request = jsonRequest(
    {
      addressId: null,
      cartId: "11111111-1111-4111-8111-111111111111",
      cartVersion: 2,
      customerInstructions: "  leave   at desk  ",
      fulfillmentMethod: "CUSTOMER_PICKUP",
    },
    { "idempotency-key": "33333333-3333-4333-8333-333333333333" },
  );
  assert.equal(parseIdempotencyKey(request), "33333333-3333-4333-8333-333333333333");
  const parsed = await parseCheckoutRequest(request);
  assert.equal(parsed.customerInstructions, "leave at desk");
  assert.equal(normalizedCustomerInstructions("  leave\n at   desk "), "leave at desk");
  await assert.rejects(() => parseCheckoutRequest(jsonRequest({ ...parsed, addressId: null, fulfillmentMethod: "STORE_DELIVERY" })));
  assert.throws(() => parseIdempotencyKey(jsonRequest({})), (error: unknown) => mapCommerceApiError(error).code === "IDEMPOTENCY_KEY_REQUIRED");
});

test("Checkout canonical hash includes only canonical trusted request fields", () => {
  const left = hashCheckoutRequest({
    addressId: null,
    cartId: "cart",
    cartVersion: 2,
    fulfillmentMethod: "CUSTOMER_PICKUP",
    instructions: "leave at desk",
  });
  const reordered = hashCheckoutRequest({
    instructions: "leave at desk",
    fulfillmentMethod: "CUSTOMER_PICKUP",
    cartVersion: 2,
    cartId: "cart",
    addressId: null,
  });
  assert.equal(left, reordered);
  assert.notEqual(left, hashCheckoutRequest({ cartId: "other", cartVersion: 2 }));
});

test("Cart DTO serializes Decimal money and excludes inventory, SKU, Organization, and moderation fields", () => {
  const cart = {
    createdAt: new Date(),
    currency: "IQD",
    customerId: "private-customer",
    expiresAt: null,
    id: "cart",
    items: [{
      cartId: "cart",
      createdAt: new Date(),
      id: "item",
      productVariant: {
        archivedAt: null,
        compareAtPrice: new Prisma.Decimal("12000"),
        createdAt: new Date(),
        currency: "IQD",
        id: "variant",
        inventory: { createdAt: new Date(), id: "inventory", lowStockThreshold: null, onHand: 5, reserved: 2, updatedAt: new Date(), variantId: "variant", version: 1 },
        isDefault: true,
        optionKey: "default",
        optionValues: {},
        price: new Prisma.Decimal("10000"),
        product: {
          archivedAt: null,
          category: { status: "ACTIVE" },
          categoryId: "category",
          createdAt: new Date(),
          description: null,
          id: "product",
          media: [{ altText: null, createdAt: new Date(), id: "media", mediaType: "IMAGE", productId: "product", sortOrder: 0, updatedAt: new Date(), url: "https://example.invalid/product.jpg", variantId: null }],
          name: "Product",
          normalizedSearchText: "product",
          publishedAt: new Date(),
          slug: "product",
          status: "PUBLISHED",
          storeId: "store",
          suspendedAt: null,
          suspensionReason: "private",
          updatedAt: new Date(),
        },
        productId: "product",
        sku: "PRIVATE-SKU",
        status: "ACTIVE",
        storeId: "store",
        title: "Default",
        updatedAt: new Date(),
      },
      productVariantId: "variant",
      quantity: 2,
      unitPriceSnapshot: new Prisma.Decimal("9000"),
      updatedAt: new Date(),
    }],
    status: "ACTIVE",
    store: {
      archiveReason: null,
      archivedAt: null,
      coverImageUrl: null,
      createdAt: new Date(),
      currency: "IQD",
      deliveryArea: null,
      deliveryCity: null,
      deliveryEnabled: false,
      deliveryEstimateMinutes: null,
      deliveryFee: new Prisma.Decimal(0),
      description: null,
      id: "store",
      logoUrl: "https://127.0.0.1/private-cart-logo.png",
      minimumOrderValue: new Prisma.Decimal(0),
      name: "Store",
      organizationId: "private-organization",
      pickupAdditionalDetails: null,
      pickupArea: "Karrada",
      pickupCity: "Baghdad",
      pickupEnabled: true,
      pickupInstructions: null,
      pickupStreet: "Street",
      preparationEstimateMinutes: null,
      publishedAt: new Date(),
      reviewReason: null,
      reviewedAt: null,
      reviewedByUserId: null,
      slug: "store",
      status: "ACTIVE",
      submittedAt: null,
      supportPhone: null,
      suspendedAt: null,
      suspensionReason: null,
      updatedAt: new Date(),
    },
    storeId: "store",
    updatedAt: new Date(),
    version: 2,
  } as unknown as CartApiRecord;
  const dto = serializeCart(cart)!;
  assert.equal(dto.items[0]?.unitPrice, "10000.000");
  assert.equal(dto.items[0]?.priceChanged, true);
  assert.equal(dto.store.logoUrl, null);
  const json = JSON.stringify(dto);
  for (const key of ["onHand", "reserved", "sku", "organizationId", "suspensionReason", "customerId"]) {
    assert.equal(json.includes(key), false, `${key} leaked`);
  }
});

test("Checkout and merchant Inventory DTOs serialize safe receipt and operational values", () => {
  const receipt = serializeCheckoutReceipt({
    address: null,
    createdAt: new Date("2026-07-12T12:00:00.000Z"),
    currency: "IQD",
    deliveryFee: new Prisma.Decimal(0),
    discountTotal: new Prisma.Decimal(0),
    fulfillmentMethod: "CUSTOMER_PICKUP",
    fulfillmentStatus: "UNFULFILLED",
    grandTotal: new Prisma.Decimal(10000),
    id: "order",
    items: [],
    orderNumber: "RZ-TEST",
    payment: { method: "PAY_AT_PICKUP", status: "UNPAID" },
    paymentMethod: "PAY_AT_PICKUP",
    paymentStatus: "UNPAID",
    reservationExpiresAt: new Date("2026-07-12T12:15:00.000Z"),
    status: "PENDING",
    storeLogoUrlSnapshot: "javascript:private-receipt-logo",
    storeNameSnapshot: "Store",
    storeSlugSnapshot: "store",
    subtotal: new Prisma.Decimal(10000),
    taxTotal: new Prisma.Decimal(0),
  });
  assert.equal(receipt.grandTotal, "10000.000");
  assert.equal(receipt.paymentMethod, "PAY_AT_PICKUP");
  assert.equal(receipt.store.logoUrl, null);

  const inventory = serializeMerchantInventory({
    id: "inventory",
    onHand: 10,
    reserved: 3,
    updatedAt: new Date("2026-07-12T12:00:00.000Z"),
    variant: { archivedAt: null, id: "variant", optionValues: {}, product: { archivedAt: null, id: "product", name: "Product", status: "PUBLISHED" }, sku: "SKU", status: "ACTIVE" },
  });
  assert.equal(inventory.availableQuantity, 7);
});

test("Inventory input and merchant cursor validation reject unsafe requests", async () => {
  const adjustment = await parseInventoryAdjustment(jsonRequest({
    delta: -2,
    expectedVersion: 3,
    operationKey: "44444444-4444-4444-8444-444444444444",
    reason: "  damaged   stock ",
  }));
  assert.equal(adjustment.reason, "damaged stock");
  await assert.rejects(() => parseInventoryAdjustment(jsonRequest({ ...adjustment, delta: 0 })));
  const query = parseMerchantInventoryQuery(new URLSearchParams("q=SKU&availability=in_stock&limit=50"));
  assert.equal(query.limit, 50);
  assert.equal(query.availability, "in_stock");
});

test("typed Cart and Inventory conflicts map to stable safe HTTP codes", () => {
  let cartError: unknown;
  try {
    commerceError("CONFLICT", "Store conflict", { kind: "CART_STORE_CONFLICT", currentStore: { id: "safe" } });
  } catch (error) {
    cartError = error;
  }
  assert.equal(mapCommerceApiError(cartError).code, "CART_STORE_CONFLICT");
  let inventoryError: unknown;
  try {
    commerceError("INVENTORY_CONFLICT", "Conflict");
  } catch (error) {
    inventoryError = error;
  }
  assert.equal(mapCommerceApiError(inventoryError).status, 409);
  let addressOwnershipError: unknown;
  try {
    commerceError("ADDRESS_OWNERSHIP_REQUIRED", "Owned address was not found");
  } catch (error) {
    addressOwnershipError = error;
  }
  assert.equal(mapCommerceApiError(addressOwnershipError).status, 404);
  assert.equal(mapCommerceApiError(new Error("secret SQL")).code, "INTERNAL_ERROR");
});
