import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  COMMERCE_QA_FIXTURE,
  CommerceQaSeedInvariantError,
  seedCommerceQaFixture,
} from "../../../scripts/staging/commerce-qa-seed-core";
import { prisma } from "../../../lib/db/prisma";

async function resetTestData() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  const databaseName = rows[0]?.database ?? "";
  assert.match(databaseName, /(?:_test|test_)/, `Refusing seed tests against ${databaseName}`);
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
}

test("staging Commerce QA seed", { concurrency: false }, async (t) => {
  await t.test("is repeatable, preserves customer data, and only tops inventory up", async () => {
    await resetTestData();
    const now = new Date("2026-07-13T12:00:00.000Z");
    const first = await seedCommerceQaFixture(prisma, { now });

    assert.equal(first.availableQuantity, 50);
    assert.equal(first.stockAdded, 50);
    assert.equal(
      await prisma.stockMovement.count({ where: { inventoryItemId: first.inventoryItemId } }),
      1,
    );

    const store = await prisma.store.findUniqueOrThrow({ where: { id: first.storeId } });
    assert.equal(store.status, "ACTIVE");
    assert.equal(store.publishedAt?.toISOString(), now.toISOString());
    assert.equal(store.deliveryEnabled, true);
    assert.equal(store.pickupEnabled, true);
    assert.equal(store.deliveryCity, "Baghdad");
    assert.equal(store.deliveryArea, "Karrada");
    assert.equal(store.pickupCity, "Baghdad");
    assert.equal(store.pickupArea, "Karrada");

    const product = await prisma.product.findUniqueOrThrow({ where: { id: first.productId } });
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: first.variantId } });
    assert.equal(product.status, "PUBLISHED");
    assert.equal(product.publishedAt?.toISOString(), now.toISOString());
    assert.equal(variant.status, "ACTIVE");
    assert.equal(variant.isDefault, true);
    assert.equal(variant.currency, "IQD");
    assert.equal(variant.sku, COMMERCE_QA_FIXTURE.variant.sku);

    const customer = await prisma.person.create({
      data: {
        authUserId: `commerce-qa-customer-${randomUUID()}`,
        firstName: "Commerce QA Customer",
        isOnboarded: true,
        phone: "+9647500000099",
      },
    });
    const cart = await prisma.cart.create({
      data: { customerId: customer.id, status: "ACTIVE", storeId: first.storeId },
    });
    const favoriteStore = await prisma.customerFavoriteStore.create({
      data: { customerId: customer.id, storeId: first.storeId },
    });
    const favoriteProduct = await prisma.customerFavoriteProduct.create({
      data: { customerId: customer.id, productId: first.productId },
    });
    const order = await prisma.order.create({
      data: {
        currency: "IQD",
        customerId: customer.id,
        customerNameSnapshot: "Commerce QA Customer",
        customerPhoneSnapshot: "+9647500000099",
        deliveryFee: "0",
        discountTotal: "0",
        fulfillmentMethod: "CUSTOMER_PICKUP",
        grandTotal: "25000",
        orderNumber: `RZ-QA-${randomUUID()}`,
        paymentMethod: "PAY_AT_PICKUP",
        pickupAddressSnapshot: "Karrada QA Street, Karrada, Baghdad",
        reservationExpiresAt: new Date("2026-07-13T12:15:00.000Z"),
        storeId: first.storeId,
        storeNameSnapshot: store.name,
        storeSlugSnapshot: store.slug,
        subtotal: "25000",
        taxTotal: "0",
      },
    });

    await prisma.inventoryItem.update({
      where: { id: first.inventoryItemId },
      data: { onHand: 80, reserved: 10, version: { increment: 1 } },
    });
    const aboveFloor = await seedCommerceQaFixture(prisma, {
      now: new Date("2026-07-14T12:00:00.000Z"),
    });
    assert.deepEqual(
      {
        categoryId: aboveFloor.categoryId,
        inventoryItemId: aboveFloor.inventoryItemId,
        organizationId: aboveFloor.organizationId,
        productId: aboveFloor.productId,
        storeId: aboveFloor.storeId,
        variantId: aboveFloor.variantId,
      },
      {
        categoryId: first.categoryId,
        inventoryItemId: first.inventoryItemId,
        organizationId: first.organizationId,
        productId: first.productId,
        storeId: first.storeId,
        variantId: first.variantId,
      },
    );
    assert.equal(aboveFloor.stockAdded, 0);
    assert.equal(aboveFloor.availableQuantity, 70);

    await prisma.inventoryItem.update({
      where: { id: first.inventoryItemId },
      data: { onHand: 30, version: { increment: 1 } },
    });
    const toppedUp = await seedCommerceQaFixture(prisma);
    assert.equal(toppedUp.stockAdded, 30);
    assert.equal(toppedUp.availableQuantity, 50);
    const inventory = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: first.inventoryItemId },
    });
    assert.equal(inventory.onHand, 60);
    assert.equal(inventory.reserved, 10);

    const repeated = await seedCommerceQaFixture(prisma);
    assert.equal(repeated.stockAdded, 0);
    assert.equal(repeated.availableQuantity, 50);
    assert.equal(
      await prisma.stockMovement.count({ where: { inventoryItemId: first.inventoryItemId } }),
      2,
    );

    assert.equal((await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } })).id, cart.id);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).id, order.id);
    assert.equal(
      (await prisma.customerFavoriteStore.findUniqueOrThrow({ where: { id: favoriteStore.id } })).id,
      favoriteStore.id,
    );
    assert.equal(
      (await prisma.customerFavoriteProduct.findUniqueOrThrow({ where: { id: favoriteProduct.id } }))
        .id,
      favoriteProduct.id,
    );
    assert.equal(
      await prisma.organization.count({ where: { slug: COMMERCE_QA_FIXTURE.organization.slug } }),
      1,
    );
    assert.equal(
      await prisma.store.count({ where: { slug: COMMERCE_QA_FIXTURE.store.slug } }),
      1,
    );
    assert.equal(
      await prisma.marketplaceCategory.count({
        where: { slug: COMMERCE_QA_FIXTURE.category.slug },
      }),
      1,
    );
    assert.equal(
      await prisma.product.count({
        where: { storeId: first.storeId, slug: COMMERCE_QA_FIXTURE.product.slug },
      }),
      1,
    );
  });

  await t.test("rolls the transaction back on a namespaced Store collision", async () => {
    await resetTestData();
    const organization = await prisma.organization.create({
      data: {
        isActive: false,
        name: "Collision sentinel",
        slug: COMMERCE_QA_FIXTURE.organization.slug,
        status: "INACTIVE",
      },
    });
    await prisma.store.create({
      data: {
        name: "Unrelated existing Store",
        organizationId: organization.id,
        slug: "unrelated-existing-store",
      },
    });

    await assert.rejects(
      seedCommerceQaFixture(prisma),
      (error: unknown) =>
        error instanceof CommerceQaSeedInvariantError &&
        error.message.includes("already owns a different Store"),
    );

    const unchanged = await prisma.organization.findUniqueOrThrow({
      where: { id: organization.id },
    });
    assert.equal(unchanged.name, "Collision sentinel");
    assert.equal(unchanged.status, "INACTIVE");
    assert.equal(unchanged.isActive, false);
    assert.equal(
      await prisma.organizationSettings.count({ where: { organizationId: organization.id } }),
      0,
    );
    assert.equal(
      await prisma.marketplaceCategory.count({
        where: { slug: COMMERCE_QA_FIXTURE.category.slug },
      }),
      0,
    );
  });
});
