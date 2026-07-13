import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import { getPublicProduct } from "../../../features/commerce/public/catalog-service";
import {
  addCartItem,
  clearCustomerCart,
  getCustomerCart,
  removeCartItem,
  replaceCustomerCart,
  updateCartItemQuantity,
} from "../../../features/commerce/services/cart-service";
import { createPendingOrder } from "../../../features/commerce/services/checkout-service";
import {
  archiveCustomerAddress,
  createCustomerAddress,
  getCustomerAddress,
  listCustomerAddresses,
  setDefaultCustomerAddress,
  updateCustomerAddress,
} from "../../../features/commerce/services/customer-service";
import { adjustInventory } from "../../../features/commerce/services/inventory-service";
import { listMerchantInventory } from "../../../features/commerce/services/merchant-inventory-service";
import { publicQueryFingerprint } from "../../../features/commerce/public/cursor";
import { prisma } from "../../../lib/db/prisma";
import {
  resetMilestone2cTestData,
  seedMilestone2cFixture,
} from "../helpers/milestone-2c-fixture";

function expectCode(code: CommerceDomainError["code"]) {
  return (error: unknown) => error instanceof CommerceDomainError && error.code === code;
}

function addressInput(label: string, isDefault?: boolean) {
  return {
    additionalDetails: `${label} details`,
    area: "Karrada",
    city: "Baghdad",
    isDefault,
    label,
    latitude: "33.312806",
    longitude: "44.361488",
    phone: "+9647500000000",
    recipientName: `${label} Recipient`,
    street: `${label} Street`,
  };
}

test("Milestone 2C PostgreSQL customer and merchant API services", { concurrency: false }, async (t) => {
  t.after(async () => {
    await resetMilestone2cTestData();
    await prisma.$disconnect();
  });

  await t.test("addresses enforce ownership, one default, deterministic promotion, and soft deletion", async () => {
    const { customers } = await seedMilestone2cFixture();
    const [customerA, customerB] = customers;
    const first = await createCustomerAddress(customerA!.id, addressInput("Home"));
    assert.equal(first.isDefault, true);
    const second = await createCustomerAddress(customerA!.id, addressInput("Work", false));
    assert.equal(second.isDefault, false);
    await setDefaultCustomerAddress(customerA!.id, second.id);
    let addresses = await listCustomerAddresses(customerA!.id);
    assert.equal(addresses.filter((item) => item.isDefault).length, 1);
    assert.equal(addresses[0]?.id, second.id);

    const updated = await updateCustomerAddress(customerA!.id, second.id, {
      street: "Updated Work Street",
    });
    assert.equal(updated.street, "Updated Work Street");
    await assert.rejects(() => getCustomerAddress(customerB!.id, second.id), expectCode("NOT_FOUND"));
    await assert.rejects(
      () => updateCustomerAddress(customerB!.id, second.id, { street: "Cross owner" }),
      expectCode("NOT_FOUND"),
    );

    await archiveCustomerAddress(customerA!.id, second.id);
    addresses = await listCustomerAddresses(customerA!.id);
    assert.equal(addresses.length, 1);
    assert.equal(addresses[0]?.id, first.id);
    assert.equal(addresses[0]?.isDefault, true);
  });

  await t.test("Cart lifecycle is versioned, single-Store, owner-scoped, atomic, and never reserves stock", async () => {
    const { catalogA, catalogB, customers } = await seedMilestone2cFixture();
    const [customerA, customerB, customerC, customerD] = customers;
    assert.equal(await getCustomerCart(customerA!.id), null);
    const reservationsBefore = await prisma.inventoryReservation.count();
    const movementsBefore = await prisma.stockMovement.count();

    const first = await addCartItem(customerA!.id, { quantity: 2, variantId: catalogA.variant.id });
    assert.equal(first.version, 2);
    assert.equal(first.items[0]?.quantity, 2);
    const merged = await addCartItem(customerA!.id, {
      expectedVersion: first.version,
      quantity: 1,
      variantId: catalogA.variant.id,
    });
    assert.equal(merged.version, first.version + 1);
    assert.equal(merged.items[0]?.quantity, 3);
    await assert.rejects(
      () => updateCartItemQuantity(customerA!.id, {
        cartItemId: merged.items[0]!.id,
        expectedVersion: first.version,
        quantity: 2,
      }),
      expectCode("CART_VERSION_CONFLICT"),
    );
    await assert.rejects(
      () => updateCartItemQuantity(customerB!.id, {
        cartItemId: merged.items[0]!.id,
        expectedVersion: merged.version,
        quantity: 2,
      }),
      expectCode("NOT_FOUND"),
    );
    await assert.rejects(
      () => addCartItem(customerA!.id, {
        expectedVersion: merged.version,
        quantity: 1,
        variantId: catalogB.variant.id,
      }),
      expectCode("CONFLICT"),
    );
    assert.equal((await getCustomerCart(customerA!.id))?.storeId, catalogA.store.id);

    const attempts = await Promise.allSettled([
      replaceCustomerCart(customerA!.id, {
        cartId: merged.id,
        expectedVersion: merged.version,
        quantity: 1,
        variantId: catalogB.variant.id,
      }),
      replaceCustomerCart(customerA!.id, {
        cartId: merged.id,
        expectedVersion: merged.version,
        quantity: 2,
        variantId: catalogB.variant.id,
      }),
    ]);
    assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((item) => item.status === "rejected").length, 1);
    assert.equal(await prisma.cart.count({ where: { customerId: customerA!.id, status: "ACTIVE" } }), 1);
    assert.equal((await getCustomerCart(customerA!.id))?.storeId, catalogB.store.id);

    const removable = await addCartItem(customerB!.id, { quantity: 1, variantId: catalogA.variant.id });
    assert.equal(
      await removeCartItem(customerB!.id, {
        cartItemId: removable.items[0]!.id,
        expectedVersion: removable.version,
      }),
      null,
    );
    assert.equal(await getCustomerCart(customerB!.id), null);

    const clearable = await addCartItem(customerC!.id, { quantity: 1, variantId: catalogA.variant.id });
    assert.equal(await clearCustomerCart(customerC!.id, clearable.version), null);
    assert.equal(await clearCustomerCart(customerC!.id, clearable.version), null);

    await prisma.product.update({ where: { id: catalogA.product.id }, data: { status: "SUSPENDED" } });
    await assert.rejects(
      () => addCartItem(customerD!.id, { quantity: 1, variantId: catalogA.variant.id }),
      expectCode("PRODUCT_UNAVAILABLE"),
    );
    assert.equal(await prisma.inventoryReservation.count(), reservationsBefore);
    assert.equal(await prisma.stockMovement.count(), movementsBefore);
  });

  await t.test("Checkout recalculates trusted values, snapshots delivery data, reserves once, and converts the Cart", async () => {
    const { catalogA, catalogB, customers } = await seedMilestone2cFixture();
    const [deliveryCustomer, pickupCustomer, otherCustomer, errorCustomer] = customers;
    const address = await createCustomerAddress(deliveryCustomer!.id, addressInput("Delivery"));
    const otherAddress = await createCustomerAddress(otherCustomer!.id, addressInput("Other"));
    const cart = await addCartItem(deliveryCustomer!.id, { quantity: 1, variantId: catalogA.variant.id });
    await prisma.productVariant.update({ where: { id: catalogA.variant.id }, data: { price: "11000" } });
    const now = new Date("2026-07-12T12:00:00.000Z");
    const key = randomUUID();
    const order = await createPendingOrder({
      addressId: address.id,
      cartId: cart.id,
      cartVersion: cart.version,
      customerId: deliveryCustomer!.id,
      customerInstructions: "  ring   once ",
      fulfillmentMethod: "STORE_DELIVERY",
      idempotencyKey: key,
      now,
    });
    assert.equal(order.status, "PENDING");
    assert.equal(order.paymentStatus, "UNPAID");
    assert.equal(order.payment?.method, "CASH_ON_DELIVERY");
    assert.equal(order.items[0]?.unitPrice.toFixed(3), "11000.000");
    assert.equal(order.deliveryFee.toFixed(3), "1000.000");
    assert.equal(order.grandTotal.toFixed(3), "12000.000");
    assert.equal(order.customerInstructions, "ring once");
    assert.equal(order.reservationExpiresAt.getTime() - now.getTime(), 15 * 60_000);
    assert.equal(order.reservations.length, 1);
    assert.equal(
      await prisma.stockMovement.count({ where: { orderId: order.id, type: "RESERVE" } }),
      1,
    );
    assert.equal((await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } })).status, "CONVERTED");
    const replay = await createPendingOrder({
      addressId: address.id,
      cartId: cart.id,
      cartVersion: cart.version,
      customerId: deliveryCustomer!.id,
      customerInstructions: "ring once",
      fulfillmentMethod: "STORE_DELIVERY",
      idempotencyKey: key,
      now,
    });
    assert.equal(replay.id, order.id);
    assert.equal(await prisma.order.count({ where: { customerId: deliveryCustomer!.id } }), 1);
    await assert.rejects(
      () => createPendingOrder({
        addressId: address.id,
        cartId: cart.id,
        cartVersion: cart.version,
        customerId: deliveryCustomer!.id,
        fulfillmentMethod: "STORE_DELIVERY",
        idempotencyKey: randomUUID(),
      }),
      expectCode("NOT_FOUND"),
    );
    await updateCustomerAddress(deliveryCustomer!.id, address.id, { street: "Changed Street" });
    assert.equal((await prisma.orderAddress.findUniqueOrThrow({ where: { orderId: order.id } })).street, "Delivery Street");

    const pickupCart = await addCartItem(pickupCustomer!.id, { quantity: 1, variantId: catalogB.variant.id });
    const pickup = await createPendingOrder({
      cartId: pickupCart.id,
      cartVersion: pickupCart.version,
      customerId: pickupCustomer!.id,
      fulfillmentMethod: "CUSTOMER_PICKUP",
      idempotencyKey: randomUUID(),
    });
    assert.equal(pickup.payment?.method, "PAY_AT_PICKUP");
    assert.equal(pickup.address, null);

    const errorCart = await addCartItem(errorCustomer!.id, { quantity: 1, variantId: catalogA.variant.id });
    await assert.rejects(
      () => createPendingOrder({
        addressId: otherAddress.id,
        cartId: errorCart.id,
        cartVersion: errorCart.version,
        customerId: errorCustomer!.id,
        fulfillmentMethod: "STORE_DELIVERY",
        idempotencyKey: randomUUID(),
      }),
      expectCode("ADDRESS_OWNERSHIP_REQUIRED"),
    );
    await assert.rejects(
      () => createPendingOrder({
        addressId: otherAddress.id,
        cartId: errorCart.id,
        cartVersion: errorCart.version,
        customerId: errorCustomer!.id,
        fulfillmentMethod: "CUSTOMER_PICKUP",
        idempotencyKey: randomUUID(),
      }),
      expectCode("ADDRESS_NOT_ALLOWED"),
    );
    await prisma.store.update({ where: { id: catalogA.store.id }, data: { minimumOrderValue: "50000" } });
    await assert.rejects(
      () => createPendingOrder({
        addressId: null,
        cartId: errorCart.id,
        cartVersion: errorCart.version,
        customerId: errorCustomer!.id,
        fulfillmentMethod: "CUSTOMER_PICKUP",
        idempotencyKey: randomUUID(),
      }),
      expectCode("MINIMUM_ORDER_NOT_MET"),
    );
  });

  await t.test("merchant Inventory is permission/Organization scoped and adjustments are exact-once", async () => {
    const { catalogA, merchantA, merchantB, merchantNoPermissions } = await seedMilestone2cFixture();
    const query = {
      fingerprint: publicQueryFingerprint({ scope: "merchant-inventory" }),
      limit: 20,
    };
    const listed = await listMerchantInventory(merchantA.identity, query);
    assert.deepEqual(listed.data.map((item) => item.id), [catalogA.inventory.id]);
    await assert.rejects(
      () => listMerchantInventory(merchantNoPermissions.identity, query),
      expectCode("FORBIDDEN"),
    );
    await assert.rejects(
      () => adjustInventory(merchantB.identity, {
        idempotencyKey: randomUUID(),
        inventoryItemId: catalogA.inventory.id,
        quantityDelta: 1,
        reason: "Cross Organization",
      }),
      expectCode("NOT_FOUND"),
    );

    const operationKey = randomUUID();
    const adjusted = await adjustInventory(merchantA.identity, {
      idempotencyKey: operationKey,
      inventoryItemId: catalogA.inventory.id,
      quantityDelta: 5,
      reason: "Opening correction",
    });
    assert.equal(adjusted.onHand, 25);
    const replay = await adjustInventory(merchantA.identity, {
      idempotencyKey: operationKey,
      inventoryItemId: catalogA.inventory.id,
      quantityDelta: 5,
      reason: "Opening correction",
    });
    assert.equal(replay.onHand, 25);
    assert.equal(await prisma.stockMovement.count({ where: { inventoryItemId: catalogA.inventory.id } }), 1);
    await assert.rejects(
      () => adjustInventory(merchantA.identity, {
        idempotencyKey: operationKey,
        inventoryItemId: catalogA.inventory.id,
        quantityDelta: 4,
        reason: "Different request",
      }),
      expectCode("INVENTORY_CONFLICT"),
    );

    const concurrent = await Promise.allSettled([
      adjustInventory(merchantA.identity, {
        idempotencyKey: randomUUID(),
        inventoryItemId: catalogA.inventory.id,
        quantityDelta: -20,
        reason: "Concurrent reduction A",
      }),
      adjustInventory(merchantA.identity, {
        idempotencyKey: randomUUID(),
        inventoryItemId: catalogA.inventory.id,
        quantityDelta: -20,
        reason: "Concurrent reduction B",
      }),
    ]);
    assert.equal(concurrent.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter((item) => item.status === "rejected").length, 1);
    const final = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: catalogA.inventory.id } });
    assert.equal(final.onHand, 5);
    assert.equal(final.reserved, 0);
    const publicProduct = await getPublicProduct(catalogA.store.slug, catalogA.product.slug);
    const publicJson = JSON.stringify(publicProduct);
    assert.equal(publicJson.includes("onHand"), false);
    assert.equal(publicJson.includes("reserved"), false);
  });
});
