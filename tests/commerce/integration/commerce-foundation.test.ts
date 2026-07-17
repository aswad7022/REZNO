import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { CommercePermission } from "@prisma/client";
import type { CreateStoreInput } from "../../../features/commerce/domain/store-input";
import type { MerchantActorReference } from "../../../features/commerce/services/authorization";

import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import {
  addCartItem,
  getCustomerCart,
  updateCartItemQuantity,
} from "../../../features/commerce/services/cart-service";
import {
  archiveProduct,
  createProduct,
  createProductVariant,
  publishProduct,
  suspendProduct,
} from "../../../features/commerce/services/catalog-service";
import { createPendingOrder } from "../../../features/commerce/services/checkout-service";
import {
  createCustomerAddress,
  getCustomerAddress,
} from "../../../features/commerce/services/customer-service";
import { expirePendingOrdersBatch } from "../../../features/commerce/services/expiration-service";
import { adjustInventory } from "../../../features/commerce/services/inventory-service";
import {
  advanceOrderFulfillment,
  cancelCustomerOrder,
  confirmOrder,
  recordOfflinePaymentPaid,
  rejectOrder,
} from "../helpers/legacy-order-transitions";
import { getCustomerOrder } from "../../../features/commerce/services/order-service";
import {
  approveStore as approveStoreMutation,
  archiveStore as archiveStoreMutation,
  createStoreDraft as createStoreDraftMutation,
  reactivateStore as reactivateStoreMutation,
  rejectStore as rejectStoreMutation,
  submitStoreForReview as submitStoreForReviewMutation,
  suspendStore as suspendStoreMutation,
} from "../../../features/commerce/services/store-service";
import { prisma } from "../../../lib/db/prisma";

const OWNER_PERMISSIONS: CommercePermission[] = [
  "STORE_VIEW",
  "STORE_MANAGE",
  "PRODUCT_VIEW",
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "PRODUCT_ARCHIVE",
  "INVENTORY_VIEW",
  "INVENTORY_ADJUST",
  "ORDER_VIEW",
  "ORDER_MANAGE",
  "ORDER_CANCEL",
  "REPORTS_VIEW",
];

const adminAccessId = randomUUID();
const adminPersonId = randomUUID();
const adminContext = {
  adminAccessId,
  isSuperAdmin: false,
  personId: adminPersonId,
  permissions: ["COMMERCE_STORES_VIEW", "COMMERCE_STORES_REVIEW", "COMMERCE_CATALOG_MODERATE"] as const,
  source: "database" as const,
  userId: "commerce-test-admin",
};

type TestStoreDraftInput = Omit<CreateStoreInput, "contextOrganizationId" | "idempotencyKey">;

function createStoreDraft(identity: MerchantActorReference, input: TestStoreDraftInput) {
  return createStoreDraftMutation(identity, {
    ...input,
    contextOrganizationId: identity.contextOrganizationId,
    idempotencyKey: randomUUID(),
  });
}

async function submitStoreForReview(identity: MerchantActorReference, storeId: string) {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  return submitStoreForReviewMutation(identity, {
    contextOrganizationId: identity.contextOrganizationId,
    expectedVersion: store.updatedAt.toISOString(),
    idempotencyKey: randomUUID(),
    storeId,
  });
}

async function adminStoreAction(
  action: typeof approveStoreMutation,
  storeId: string,
  reason: string | null,
) {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  return action(adminContext, {
    expectedVersion: store.updatedAt.toISOString(),
    idempotencyKey: randomUUID(),
    reason,
    storeId,
  });
}

function approveStore(_context: typeof adminContext, storeId: string) {
  return adminStoreAction(approveStoreMutation, storeId, null);
}

function rejectStore(_context: typeof adminContext, storeId: string, reason: string) {
  return adminStoreAction(rejectStoreMutation, storeId, reason);
}

function suspendStore(_context: typeof adminContext, storeId: string, reason: string) {
  return adminStoreAction(suspendStoreMutation, storeId, reason);
}

function reactivateStore(_context: typeof adminContext, storeId: string) {
  return adminStoreAction(reactivateStoreMutation, storeId, null);
}

async function archiveStore(identity: MerchantActorReference, storeId: string, reason: string) {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  return archiveStoreMutation(identity, {
    contextOrganizationId: identity.contextOrganizationId,
    expectedVersion: store.updatedAt.toISOString(),
    idempotencyKey: randomUUID(),
    reason,
    storeId,
  });
}

async function assertDisposableDatabase() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  const name = rows[0]?.database ?? "";
  assert.match(name, /(?:_test|test_)/, `Refusing integration tests against ${name}`);
}

async function resetTestData() {
  await assertDisposableDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
}

async function createPerson(label: string) {
  return prisma.person.create({
    data: {
      authUserId: `auth-${label}-${randomUUID()}`,
      firstName: label,
      isOnboarded: true,
      phone: "+9647500000000",
    },
  });
}

async function createMerchant(label: string) {
  const owner = await createPerson(`${label}-owner`);
  const roleId = randomUUID();
  const organization = await prisma.organization.create({
    data: {
      name: `${label} Organization`,
      roles: {
        create: {
          commercePermissions: OWNER_PERMISSIONS,
          id: roleId,
          isSystem: true,
          name: "Owner",
          systemRole: "OWNER",
        },
      },
      slug: `${label}-${randomUUID().slice(0, 8)}`,
    },
  });
  const membership = await prisma.organizationMember.create({
    data: { organizationId: organization.id, personId: owner.id, roleId },
  });
  return {
    identity: {
      contextOrganizationId: organization.id,
      membershipId: membership.id,
      personId: owner.id,
    },
    organization,
    owner,
  };
}

async function createStoreAndCatalog(
  label: string,
  categoryId: string,
  onHand: number,
) {
  const merchant = await createMerchant(label);
  const store = await createStoreDraft(merchant.identity, {
    deliveryArea: "Karrada",
    deliveryCity: "Baghdad",
    deliveryEnabled: true,
    deliveryEstimateMinutes: 45,
    deliveryFee: "1000",
    minimumOrderValue: "0",
    name: `${label} Store`,
    pickupArea: "Karrada",
    pickupCity: "Baghdad",
    pickupEnabled: true,
    pickupInstructions: "Ask for the commerce test desk.",
    pickupStreet: "Test Street 1",
    preparationEstimateMinutes: 20,
    slug: `${label}-store-${randomUUID().slice(0, 8)}`,
    supportPhone: "+9647500000001",
  });
  await submitStoreForReview(merchant.identity, store.id);
  const activeStore = await approveStore(adminContext, store.id);
  const product = await createProduct(merchant.identity, {
    categoryId,
    defaultVariant: {
      price: "10000",
      sku: `${label.toUpperCase()}-${randomUUID().slice(0, 8)}`,
      title: "Default",
    },
    description: "Clearly fake integration test Product.",
    name: `${label} Product`,
    slug: `${label}-product-${randomUUID().slice(0, 8)}`,
    storeId: store.id,
  });
  const variant = product.variants[0]!;
  await adjustVariantStock(merchant.identity, variant.id, onHand, "Integration test opening stock");
  await publishProduct(merchant.identity, product.id);
  return { ...merchant, product, store: activeStore, variant };
}

async function adjustVariantStock(
  identity: Parameters<typeof adjustInventory>[0],
  variantId: string,
  quantityDelta: number,
  reason: string,
) {
  const inventory = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } });
  return adjustInventory(identity, {
    expectedVersion: inventory.version,
    idempotencyKey: randomUUID(),
    inventoryItemId: inventory.id,
    quantityDelta,
    reason,
  });
}

async function createPickupCart(customerId: string, variantId: string, quantity = 1) {
  return addCartItem(customerId, { quantity, variantId });
}

function expectCommerceCode(code: CommerceDomainError["code"]) {
  return (error: unknown) => error instanceof CommerceDomainError && error.code === code;
}

test("Milestone 2A PostgreSQL commerce foundation", { concurrency: false }, async (t) => {
  await resetTestData();
  await prisma.user.create({
    data: {
      email: "commerce-test-admin@rezno.invalid",
      id: adminContext.userId,
      name: "Commerce Test Admin",
    },
  });
  await prisma.person.create({
    data: {
      authUserId: adminContext.userId,
      firstName: "Commerce Admin",
      id: adminPersonId,
      isOnboarded: true,
    },
  });
  await prisma.adminAccess.create({
    data: {
      id: adminAccessId,
      permissions: [...adminContext.permissions],
      userId: adminContext.userId,
    },
  });
  const category = await prisma.marketplaceCategory.create({
    data: {
      name: "Test Products",
      normalizedName: "test products",
      slug: `test-products-${randomUUID().slice(0, 8)}`,
    },
  });
  const primary = await createStoreAndCatalog("primary", category.id, 100);
  const secondary = await createStoreAndCatalog("secondary", category.id, 20);
  const customerA = await createPerson("customer-a");
  const customerB = await createPerson("customer-b");
  const customerC = await createPerson("customer-c");
  const failClosedManager = await createPerson("fail-closed-manager");
  const managerRole = await prisma.role.create({
    data: {
      isSystem: true,
      name: "Manager",
      organizationId: primary.organization.id,
      systemRole: "MANAGER",
    },
  });
  const failClosedMembership = await prisma.organizationMember.create({
    data: {
      organizationId: primary.organization.id,
      personId: failClosedManager.id,
      roleId: managerRole.id,
    },
  });

  const serviceCategory = await prisma.category.create({
    data: { name: "Booking regression", slug: `booking-regression-${randomUUID().slice(0, 8)}` },
  });
  const branch = await prisma.branch.create({
    data: { name: "Booking Branch", organizationId: primary.organization.id, slug: "booking-branch" },
  });
  const service = await prisma.service.create({
    data: {
      categoryId: serviceCategory.id,
      name: "Booking regression service",
      organizationId: primary.organization.id,
    },
  });
  const branchService = await prisma.branchService.create({
    data: { branchId: branch.id, durationMinutes: 30, price: "25000", serviceId: service.id },
  });
  const booking = await prisma.booking.create({
    data: {
      branchId: branch.id,
      branchServiceId: branchService.id,
      customerId: customerA.id,
      customerNameSnapshot: "Customer A",
      endsAt: new Date("2026-08-01T10:30:00Z"),
      organizationId: primary.organization.id,
      priceSnapshot: "25000",
      serviceNameSnapshot: "Booking regression service",
      startsAt: new Date("2026-08-01T10:00:00Z"),
    },
  });
  const bookingBaseline = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });

  await t.test("Checkout rejects Decimal(18,3) calculated overflow before any mutation", async () => {
    const overflowProduct = await createProduct(primary.identity, {
      categoryId: category.id,
      defaultVariant: {
        price: "999999999999999",
        sku: `OVERFLOW-${randomUUID().slice(0, 8)}`,
        title: "Default",
      },
      name: "Overflow capacity probe",
      slug: `overflow-${randomUUID().slice(0, 8)}`,
      storeId: primary.store.id,
    });
    const variant = overflowProduct.variants[0]!;
    await adjustVariantStock(primary.identity, variant.id, 2, "Overflow capacity probe stock");
    await publishProduct(primary.identity, overflowProduct.id);
    const cart = await createPickupCart(customerC.id, variant.id, 2);
    const key = randomUUID();
    const before = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    await assert.rejects(
      createPendingOrder({
        cartId: cart.id,
        cartVersion: cart.version,
        customerId: customerC.id,
        fulfillmentMethod: "CUSTOMER_PICKUP",
        idempotencyKey: key,
      }),
      expectCommerceCode("VALIDATION_ERROR"),
    );
    const [after, inventory] = await Promise.all([
      prisma.cart.findUniqueOrThrow({ where: { id: cart.id } }),
      prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: variant.id } }),
    ]);
    assert.equal(after.status, "ACTIVE");
    assert.equal(after.version, before.version);
    assert.equal(inventory.reserved, 0);
    assert.equal(await prisma.order.count({ where: { customerId: customerC.id } }), 0);
    assert.equal(await prisma.checkoutIdempotency.count({ where: { customerId: customerC.id, key } }), 0);
    assert.equal(await prisma.inventoryReservation.count({ where: { productVariantId: variant.id } }), 0);
    await prisma.cart.delete({ where: { id: cart.id } });
  });

  await t.test("commerce migration is recorded and Store ownership is unique", async () => {
    const migrations = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE migration_name = '20260712105932_commerce_milestone_2a_foundation'
    `;
    assert.equal(migrations.length, 1);
    await assert.rejects(
      prisma.store.create({
        data: {
          name: "Illegal second Store",
          organizationId: primary.organization.id,
          slug: `second-${randomUUID()}`,
        },
      }),
    );
  });

  await t.test("database inventory constraints reject negative and over-reserved stock", async () => {
    const inventory = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    await assert.rejects(
      prisma.inventoryItem.update({ where: { id: inventory.id }, data: { onHand: -1 } }),
    );
    await assert.rejects(
      prisma.inventoryItem.update({ where: { id: inventory.id }, data: { reserved: 101 } }),
    );
    await assert.rejects(
      prisma.store.update({ where: { id: primary.store.id }, data: { currency: "USD" } }),
    );
  });

  const atomicSku = `ATOMIC-${randomUUID().slice(0, 8)}`;
  const atomicProduct = await createProduct(primary.identity, {
    categoryId: category.id,
    defaultVariant: {
      price: "7000",
      sku: atomicSku,
      title: "Default",
    },
    name: "Atomic Product",
    slug: `atomic-${randomUUID().slice(0, 8)}`,
    storeId: primary.store.id,
  });
  await t.test("Product creation atomically includes one active Default Variant and Inventory", async () => {
    assert.equal(atomicProduct.variants.length, 1);
    assert.equal(atomicProduct.variants[0]?.isDefault, true);
    assert.equal(atomicProduct.variants[0]?.status, "ACTIVE");
    assert.ok(
      await prisma.inventoryItem.findUnique({
        where: { variantId: atomicProduct.variants[0]!.id },
      }),
    );

    const rolledBackSlug = `atomic-rollback-${randomUUID().slice(0, 8)}`;
    await assert.rejects(
      createProduct(primary.identity, {
        categoryId: category.id,
        defaultVariant: {
          price: "7000",
          sku: atomicSku,
          title: "Default",
        },
        name: "Must Roll Back",
        slug: rolledBackSlug,
        storeId: primary.store.id,
      }),
    );
    assert.equal(await prisma.product.count({ where: { slug: rolledBackSlug } }), 0);
  });

  await t.test("non-OWNER roles remain fail-closed without explicit commerce permissions", async () => {
    await assert.rejects(
      createProduct(
        {
          contextOrganizationId: primary.organization.id,
          membershipId: failClosedMembership.id,
          personId: failClosedManager.id,
        },
        {
          categoryId: category.id,
          defaultVariant: {
            price: "1000",
            sku: `FORBIDDEN-${randomUUID().slice(0, 8)}`,
            title: "Default",
          },
          name: "Forbidden Product",
          slug: `forbidden-${randomUUID().slice(0, 8)}`,
          storeId: primary.store.id,
        },
      ),
      expectCommerceCode("FORBIDDEN"),
    );
    await assert.rejects(
      archiveStore(primary.identity, secondary.store.id, "Cross-tenant archive attempt"),
      expectCommerceCode("NOT_FOUND"),
    );
  });

  await t.test("Store moderation and Product suspension append existing admin audit events", async () => {
    const rejectedMerchant = await createMerchant("audit-rejected");
    const rejectedDraft = await createStoreDraft(rejectedMerchant.identity, {
      deliveryEnabled: false,
      name: "Audit Rejected Store",
      pickupArea: "Karrada",
      pickupCity: "Baghdad",
      pickupEnabled: true,
      pickupStreet: "Audit Street",
      slug: `audit-rejected-${randomUUID().slice(0, 8)}`,
    });
    await submitStoreForReview(rejectedMerchant.identity, rejectedDraft.id);
    await rejectStore(adminContext, rejectedDraft.id, "Audit rejection reason");
    await suspendStore(adminContext, primary.store.id, "Audit suspension reason");
    await reactivateStore(adminContext, primary.store.id);
    await suspendProduct(adminContext, atomicProduct.id, "Audit Product reason");

    const expected = [
      ["commerce.store.approve", primary.store.id],
      ["commerce.store.reject", rejectedDraft.id],
      ["commerce.store.suspend", primary.store.id],
      ["commerce.store.reactivate", primary.store.id],
      ["commerce.product.suspend", atomicProduct.id],
    ] as const;
    for (const [action, targetId] of expected) {
      const audit = await prisma.adminAuditLog.findFirst({
        where: { action, adminUserId: adminContext.userId, targetId },
      });
      assert.ok(audit, `Missing ${action} audit event`);
    }
    const rejectionAudit = await prisma.adminAuditLog.findFirstOrThrow({
      where: { action: "commerce.store.reject", targetId: rejectedDraft.id },
    });
    assert.equal((rejectionAudit.metadata as { reason: string }).reason, "Audit rejection reason");
    const suspensionAudit = await prisma.adminAuditLog.findFirstOrThrow({
      where: { action: "commerce.product.suspend", targetId: atomicProduct.id },
    });
    assert.deepEqual(suspensionAudit.metadata, { reason: "Audit Product reason" });
    const archived = await archiveStore(
      rejectedMerchant.identity,
      rejectedDraft.id,
      "Seller no longer wants this Store",
    );
    assert.equal(archived.status, "ARCHIVED");
    assert.equal(archived.archiveReason, "Seller no longer wants this Store");
  });

  const firstCart = await createPickupCart(customerA.id, primary.variant.id, 2);
  await t.test("one active Cart is enforced and cross-Store Cart additions fail", async () => {
    await assert.rejects(
      prisma.cart.create({
        data: { customerId: customerA.id, storeId: primary.store.id },
      }),
    );
    await assert.rejects(
      addCartItem(customerA.id, { quantity: 1, variantId: secondary.variant.id }),
      expectCommerceCode("CONFLICT"),
    );
    const cart = await getCustomerCart(customerA.id);
    assert.equal(cart?.items.length, 1);
    assert.equal(cart?.items[0]?.quantity, 2);
    const inventory = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    assert.equal(inventory.reserved, 0, "Cart mutations must not reserve stock");
    assert.equal(await prisma.stockMovement.count({ where: { inventoryItemId: inventory.id } }), 1);
  });

  const addressA = await createCustomerAddress(customerA.id, {
    additionalDetails: "Apartment 1",
    area: "Karrada",
    city: "Baghdad",
    isDefault: true,
    phone: "+9647500000000",
    recipientName: "Customer A",
    street: "Test Street",
  });
  await t.test("customer resources are scoped by Person", async () => {
    await assert.rejects(
      updateCartItemQuantity(customerB.id, {
        cartItemId: firstCart.items[0]!.id,
        expectedVersion: firstCart.version,
        quantity: 1,
      }),
      expectCommerceCode("NOT_FOUND"),
    );
    await assert.rejects(
      getCustomerAddress(customerB.id, addressA.id),
      expectCommerceCode("NOT_FOUND"),
    );
  });

  const firstKey = randomUUID();
  const firstOrder = await createPendingOrder({
    addressId: addressA.id,
    cartId: firstCart.id,
    cartVersion: firstCart.version,
    customerId: customerA.id,
    fulfillmentMethod: "STORE_DELIVERY",
    idempotencyKey: firstKey,
  });
  await t.test("Checkout creates one truthful pending Order and is idempotent", async () => {
    assert.equal(firstOrder.status, "PENDING");
    assert.equal(firstOrder.payment?.status, "UNPAID");
    assert.equal(firstOrder.payment?.method, "CASH_ON_DELIVERY");
    assert.equal(firstOrder.reservations.length, 1);
    assert.equal(firstOrder.reservations[0]?.status, "ACTIVE");
    assert.ok(firstOrder.address);
    const replay = await createPendingOrder({
      addressId: addressA.id,
      cartId: firstCart.id,
      cartVersion: firstCart.version,
      customerId: customerA.id,
      fulfillmentMethod: "STORE_DELIVERY",
      idempotencyKey: firstKey,
    });
    assert.equal(replay.id, firstOrder.id);
    assert.equal(await prisma.order.count({ where: { id: firstOrder.id } }), 1);
    await assert.rejects(
      createPendingOrder({
        addressId: addressA.id,
        cartId: firstCart.id,
        cartVersion: firstCart.version,
        customerId: customerA.id,
        customerInstructions: "different request",
        fulfillmentMethod: "STORE_DELIVERY",
        idempotencyKey: firstKey,
      }),
      expectCommerceCode("IDEMPOTENCY_CONFLICT"),
    );
  });

  await t.test("another customer cannot read the Order", async () => {
    await assert.rejects(
      getCustomerOrder(customerB.id, firstOrder.id),
      expectCommerceCode("NOT_FOUND"),
    );
  });

  await t.test("confirm consumes reservations exactly once and offline payment completes truthfully", async () => {
    const inventoryBefore = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    assert.equal(inventoryBefore.onHand, 100);
    assert.equal(inventoryBefore.reserved, 2);
    assert.equal(await prisma.stockMovement.count({ where: { orderId: firstOrder.id, type: "RESERVE" } }), 1);
    const key = `confirm-${firstOrder.id}`;
    const confirmed = await confirmOrder(primary.identity, { idempotencyKey: key, orderId: firstOrder.id });
    assert.equal(confirmed.status, "CONFIRMED");
    assert.equal(confirmed.reservations[0]?.status, "CONSUMED");
    await confirmOrder(primary.identity, { idempotencyKey: key, orderId: firstOrder.id });
    assert.equal(
      await prisma.stockMovement.count({ where: { orderId: firstOrder.id, type: "CONSUME" } }),
      1,
    );
    const inventoryAfterReplay = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    assert.equal(inventoryAfterReplay.onHand, 98);
    assert.equal(inventoryAfterReplay.reserved, 0);
    await advanceOrderFulfillment(primary.identity, {
      idempotencyKey: `prepare-${firstOrder.id}`,
      next: "PREPARING",
      orderId: firstOrder.id,
    });
    await advanceOrderFulfillment(primary.identity, {
      idempotencyKey: `out-${firstOrder.id}`,
      next: "OUT_FOR_DELIVERY",
      orderId: firstOrder.id,
    });
    await advanceOrderFulfillment(primary.identity, {
      idempotencyKey: `delivered-${firstOrder.id}`,
      next: "DELIVERED",
      orderId: firstOrder.id,
    });
    const completed = await recordOfflinePaymentPaid(primary.identity, {
      idempotencyKey: `paid-${firstOrder.id}`,
      orderId: firstOrder.id,
    });
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.payment?.status, "PAID");
  });

  await t.test("transition replay is bound to the exact requested transition", async () => {
    const customer = await createPerson("transition-replay-customer");
    const cart = await createPickupCart(customer.id, primary.variant.id);
    const order = await createPendingOrder({
      cartId: cart.id,
      cartVersion: cart.version,
      customerId: customer.id,
      fulfillmentMethod: "CUSTOMER_PICKUP",
      idempotencyKey: randomUUID(),
    });
    await confirmOrder(primary.identity, {
      idempotencyKey: randomUUID(),
      orderId: order.id,
    });
    const transitionKey = randomUUID();
    const transitioned = await advanceOrderFulfillment(primary.identity, {
      idempotencyKey: transitionKey,
      next: "PREPARING",
      orderId: order.id,
    });
    assert.equal(transitioned.fulfillmentStatus, "PREPARING");
    const replayed = await advanceOrderFulfillment(primary.identity, {
      idempotencyKey: transitionKey,
      next: "PREPARING",
      orderId: order.id,
    });
    assert.equal(replayed.fulfillmentStatus, "PREPARING");
    await assert.rejects(
      advanceOrderFulfillment(primary.identity, {
        idempotencyKey: transitionKey,
        next: "READY_FOR_PICKUP",
        orderId: order.id,
      }),
      expectCommerceCode("IDEMPOTENCY_CONFLICT"),
    );
    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(persisted.fulfillmentStatus, "PREPARING");
    assert.equal(
      await prisma.orderStatusHistory.count({ where: { idempotencyKey: transitionKey } }),
      1,
    );
  });

  await t.test("concurrent stock-1 Checkouts create exactly one Order without overselling", async (t) => {
    const scarce = await createProductVariant(primary.identity, {
      optionValues: { size: "scarce" },
      price: "5000",
      productId: primary.product.id,
      sku: `SCARCE-${randomUUID().slice(0, 8)}`,
      title: "Scarce",
    });
    await adjustVariantStock(primary.identity, scarce.id, 1, "Concurrent integration test stock");
    const [cartB, cartC] = await Promise.all([
      createPickupCart(customerB.id, scarce.id, 1),
      createPickupCart(customerC.id, scarce.id, 1),
    ]);
    const results = await Promise.allSettled([
      createPendingOrder({
        cartId: cartB.id,
        cartVersion: cartB.version,
        customerId: customerB.id,
        fulfillmentMethod: "CUSTOMER_PICKUP",
        idempotencyKey: randomUUID(),
      }),
      createPendingOrder({
        cartId: cartC.id,
        cartVersion: cartC.version,
        customerId: customerC.id,
        fulfillmentMethod: "CUSTOMER_PICKUP",
        idempotencyKey: randomUUID(),
      }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const fulfilled = results.find((result) => result.status === "fulfilled");
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(fulfilled?.status === "fulfilled");
    assert.ok(rejected?.status === "rejected");
    assert.ok(rejected.reason instanceof CommerceDomainError);
    assert.equal(rejected.reason.code, "INSUFFICIENT_STOCK");
    const inventory = await prisma.inventoryItem.findUniqueOrThrow({ where: { variantId: scarce.id } });
    const orderCount = await prisma.order.count({
      where: { items: { some: { productVariantId: scarce.id } } },
    });
    assert.equal(orderCount, 1);
    assert.equal(inventory.onHand, 1);
    assert.equal(inventory.reserved, 1);
    assert.equal(await prisma.stockMovement.count({ where: { inventoryItemId: inventory.id, type: "RESERVE" } }), 1);
    t.diagnostic(
      JSON.stringify({
        errorCode: rejected.reason.code,
        finalOnHand: inventory.onHand,
        finalReserved: inventory.reserved,
        orderCount,
        orderId: fulfilled.value.id,
      }),
    );
  });

  await t.test("concurrent same-Person same-key same-request resolves to one Order", async (t) => {
    const customer = await createPerson("same-key-same-request");
    const cart = await createPickupCart(customer.id, primary.variant.id);
    const idempotencyKey = randomUUID();
    const request = {
      cartId: cart.id,
      cartVersion: cart.version,
      customerId: customer.id,
      fulfillmentMethod: "CUSTOMER_PICKUP" as const,
      idempotencyKey,
    };
    const [left, right] = await Promise.all([
      createPendingOrder(request),
      createPendingOrder(request),
    ]);
    assert.equal(left.id, right.id);
    assert.equal(await prisma.order.count({ where: { customerId: customer.id } }), 1);
    assert.equal(await prisma.payment.count({ where: { orderId: left.id } }), 1);
    assert.equal(await prisma.inventoryReservation.count({ where: { orderId: left.id } }), 1);
    assert.equal(await prisma.stockMovement.count({ where: { orderId: left.id, type: "RESERVE" } }), 1);
    t.diagnostic(
      JSON.stringify({
        orderCount: 1,
        orderId: left.id,
        paymentCount: 1,
        reservationCount: 1,
        reserveMovementCount: 1,
      }),
    );
  });

  await t.test("concurrent same-Person same-key different-request conflicts", async (t) => {
    const customer = await createPerson("same-key-different-request");
    const cart = await createPickupCart(customer.id, primary.variant.id);
    const idempotencyKey = randomUUID();
    const common = {
      cartId: cart.id,
      cartVersion: cart.version,
      customerId: customer.id,
      fulfillmentMethod: "CUSTOMER_PICKUP" as const,
      idempotencyKey,
    };
    const results = await Promise.allSettled([
      createPendingOrder({ ...common, customerInstructions: "Leave at reception" }),
      createPendingOrder({ ...common, customerInstructions: "Call on arrival" }),
    ]);
    const fulfilled = results.find((result) => result.status === "fulfilled");
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(fulfilled?.status === "fulfilled");
    assert.ok(rejected?.status === "rejected");
    assert.ok(rejected.reason instanceof CommerceDomainError);
    assert.equal(rejected.reason.code, "IDEMPOTENCY_CONFLICT");
    assert.equal(await prisma.order.count({ where: { customerId: customer.id } }), 1);
    assert.equal(await prisma.payment.count({ where: { orderId: fulfilled.value.id } }), 1);
    assert.equal(await prisma.inventoryReservation.count({ where: { orderId: fulfilled.value.id } }), 1);
    assert.equal(
      await prisma.stockMovement.count({ where: { orderId: fulfilled.value.id, type: "RESERVE" } }),
      1,
    );
    t.diagnostic(
      JSON.stringify({
        errorCode: rejected.reason.code,
        orderCount: 1,
        orderId: fulfilled.value.id,
      }),
    );
  });

  await t.test("buyer-scoped same key creates isolated Orders for different People", async (t) => {
    const leftCustomer = await createPerson("cross-customer-key-left");
    const rightCustomer = await createPerson("cross-customer-key-right");
    const leftCart = await createPickupCart(leftCustomer.id, primary.variant.id);
    const rightCart = await createPickupCart(rightCustomer.id, primary.variant.id);
    const sharedKey = randomUUID();
    const [leftOrder, rightOrder] = await Promise.all([
      createPendingOrder({
        cartId: leftCart.id,
        cartVersion: leftCart.version,
        customerId: leftCustomer.id,
        fulfillmentMethod: "CUSTOMER_PICKUP",
        idempotencyKey: sharedKey,
      }),
      createPendingOrder({
        cartId: rightCart.id,
        cartVersion: rightCart.version,
        customerId: rightCustomer.id,
        fulfillmentMethod: "CUSTOMER_PICKUP",
        idempotencyKey: sharedKey,
      }),
    ]);
    assert.notEqual(leftOrder.id, rightOrder.id);
    await assert.rejects(
      getCustomerOrder(leftCustomer.id, rightOrder.id),
      expectCommerceCode("NOT_FOUND"),
    );
    await assert.rejects(
      getCustomerOrder(rightCustomer.id, leftOrder.id),
      expectCommerceCode("NOT_FOUND"),
    );
    assert.equal(
      await prisma.checkoutIdempotency.count({ where: { key: sharedKey } }),
      2,
    );
    t.diagnostic(
      JSON.stringify({
        idempotencyRows: 2,
        leftOrderId: leftOrder.id,
        rightOrderId: rightOrder.id,
      }),
    );
  });

  await t.test("reject releases reservations exactly once", async (t) => {
    const customer = await createPerson("reject-customer");
    const cart = await createPickupCart(customer.id, primary.variant.id);
    const order = await createPendingOrder({
      cartId: cart.id,
      cartVersion: cart.version,
      customerId: customer.id,
      fulfillmentMethod: "CUSTOMER_PICKUP",
      idempotencyKey: randomUUID(),
    });
    const inventoryBefore = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    const key = `reject-${order.id}`;
    await rejectOrder(primary.identity, {
      idempotencyKey: key,
      orderId: order.id,
      reason: "Unavailable for test",
    });
    await rejectOrder(primary.identity, {
      idempotencyKey: key,
      orderId: order.id,
      reason: "Unavailable for test",
    });
    assert.equal(await prisma.stockMovement.count({ where: { orderId: order.id, type: "RELEASE" } }), 1);
    const inventoryAfter = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    assert.equal(inventoryAfter.onHand, inventoryBefore.onHand);
    assert.equal(inventoryAfter.reserved, inventoryBefore.reserved - 1);
    t.diagnostic(
      JSON.stringify({
        after: { onHand: inventoryAfter.onHand, reserved: inventoryAfter.reserved },
        before: { onHand: inventoryBefore.onHand, reserved: inventoryBefore.reserved },
        releaseMovementCount: 1,
      }),
    );
  });

  await t.test("customer cancellation releases or restocks exactly once", async (t) => {
    const pendingCustomer = await createPerson("cancel-pending");
    const pendingCart = await createPickupCart(pendingCustomer.id, primary.variant.id);
    const pendingOrder = await createPendingOrder({
      cartId: pendingCart.id,
      cartVersion: pendingCart.version,
      customerId: pendingCustomer.id,
      fulfillmentMethod: "CUSTOMER_PICKUP",
      idempotencyKey: randomUUID(),
    });
    const pendingBefore = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    const pendingCancellation = await cancelCustomerOrder(pendingCustomer.id, {
      orderId: pendingOrder.id,
      reason: "Customer changed plans",
    });
    const pendingReplay = await cancelCustomerOrder(pendingCustomer.id, {
      orderId: pendingOrder.id,
      reason: "Customer changed plans",
    });
    assert.deepEqual(pendingReplay, pendingCancellation);
    assert.equal(
      await prisma.stockMovement.count({ where: { orderId: pendingOrder.id, type: "RELEASE" } }),
      1,
    );
    const pendingAfter = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    assert.equal(pendingAfter.onHand, pendingBefore.onHand);
    assert.equal(pendingAfter.reserved, pendingBefore.reserved - 1);

    const confirmedCustomer = await createPerson("cancel-confirmed");
    const confirmedCart = await createPickupCart(confirmedCustomer.id, primary.variant.id);
    const confirmedOrder = await createPendingOrder({
      cartId: confirmedCart.id,
      cartVersion: confirmedCart.version,
      customerId: confirmedCustomer.id,
      fulfillmentMethod: "CUSTOMER_PICKUP",
      idempotencyKey: randomUUID(),
    });
    await confirmOrder(primary.identity, {
      idempotencyKey: `confirm-${confirmedOrder.id}`,
      orderId: confirmedOrder.id,
    });
    const confirmedBeforeCancellation = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    const confirmedCancellation = await cancelCustomerOrder(confirmedCustomer.id, {
      orderId: confirmedOrder.id,
      reason: "Cancel before preparation",
    });
    const confirmedReplay = await cancelCustomerOrder(confirmedCustomer.id, {
      orderId: confirmedOrder.id,
      reason: "Cancel before preparation",
    });
    assert.deepEqual(confirmedReplay, confirmedCancellation);
    assert.equal(
      await prisma.stockMovement.count({ where: { orderId: confirmedOrder.id, type: "RESTOCK" } }),
      1,
    );
    const confirmedAfterCancellation = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    assert.equal(confirmedAfterCancellation.onHand, confirmedBeforeCancellation.onHand + 1);
    assert.equal(confirmedAfterCancellation.reserved, confirmedBeforeCancellation.reserved);
    t.diagnostic(
      JSON.stringify({
        confirmedCancellation: {
          after: {
            onHand: confirmedAfterCancellation.onHand,
            reserved: confirmedAfterCancellation.reserved,
          },
          before: {
            onHand: confirmedBeforeCancellation.onHand,
            reserved: confirmedBeforeCancellation.reserved,
          },
          restockMovementCount: 1,
        },
        pendingCancellation: {
          after: { onHand: pendingAfter.onHand, reserved: pendingAfter.reserved },
          before: { onHand: pendingBefore.onHand, reserved: pendingBefore.reserved },
          releaseMovementCount: 1,
        },
      }),
    );
  });

  await t.test("expiration releases an eligible Order and a second run is a no-op", async (t) => {
    const customer = await createPerson("expiry-customer");
    const cart = await createPickupCart(customer.id, primary.variant.id);
    const oldNow = new Date(Date.now() - 20 * 60 * 1000);
    const order = await createPendingOrder({
      cartId: cart.id,
      cartVersion: cart.version,
      customerId: customer.id,
      fulfillmentMethod: "CUSTOMER_PICKUP",
      idempotencyKey: randomUUID(),
      now: oldNow,
    });
    assert.equal(order.reservationExpiresAt.getTime() - oldNow.getTime(), 15 * 60 * 1000);
    const inventoryBefore = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    const itemCountBefore = await prisma.orderItem.count({ where: { orderId: order.id } });
    const historyCountBefore = await prisma.orderStatusHistory.count({ where: { orderId: order.id } });
    const first = await expirePendingOrdersBatch({ batchSize: 1, now: new Date() });
    const afterFirst = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, payment: true, reservations: true },
    });
    const inventoryAfterFirst = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    const releaseCountAfterFirst = await prisma.stockMovement.count({
      where: { orderId: order.id, type: "RELEASE" },
    });
    const historyCountAfterFirst = await prisma.orderStatusHistory.count({ where: { orderId: order.id } });
    const second = await expirePendingOrdersBatch({ batchSize: 1, now: new Date() });
    const inventoryAfterSecond = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: primary.variant.id },
    });
    assert.equal(first.expired, 1);
    assert.equal(first.scanned, 1);
    assert.equal(second.expired, 0);
    assert.equal(afterFirst.status, "EXPIRED");
    assert.equal(afterFirst.payment?.status, "VOIDED");
    assert.equal(afterFirst.reservations[0]?.status, "EXPIRED");
    assert.equal(afterFirst.items.length, itemCountBefore);
    assert.equal(inventoryAfterFirst.onHand, inventoryBefore.onHand);
    assert.equal(inventoryAfterFirst.reserved, inventoryBefore.reserved - 1);
    assert.equal(releaseCountAfterFirst, 1);
    assert.equal(historyCountAfterFirst, historyCountBefore + 1);
    assert.deepEqual(inventoryAfterSecond, inventoryAfterFirst);
    assert.equal(await prisma.stockMovement.count({ where: { orderId: order.id, type: "RELEASE" } }), 1);
    assert.equal(
      await prisma.orderStatusHistory.count({ where: { orderId: order.id } }),
      historyCountAfterFirst,
    );
    assert.equal(await prisma.orderItem.count({ where: { orderId: order.id } }), itemCountBefore);
    t.diagnostic(
      JSON.stringify({
        firstRun: first,
        historyAfterFirst: historyCountAfterFirst,
        historyBefore: historyCountBefore,
        inventoryAfterFirst: {
          onHand: inventoryAfterFirst.onHand,
          reserved: inventoryAfterFirst.reserved,
        },
        inventoryBefore: { onHand: inventoryBefore.onHand, reserved: inventoryBefore.reserved },
        itemCount: itemCountBefore,
        releaseMovementCount: releaseCountAfterFirst,
        secondRun: second,
      }),
    );
  });

  await t.test("cross-Organization merchant access and transition replay are denied", async () => {
    const customer = await createPerson("secondary-order-customer");
    const cart = await createPickupCart(customer.id, secondary.variant.id);
    const order = await createPendingOrder({
      cartId: cart.id,
      cartVersion: cart.version,
      customerId: customer.id,
      fulfillmentMethod: "CUSTOMER_PICKUP",
      idempotencyKey: randomUUID(),
    });
    await assert.rejects(
      confirmOrder(primary.identity, {
        idempotencyKey: `cross-org-${order.id}`,
        orderId: order.id,
      }),
      expectCommerceCode("NOT_FOUND"),
    );
    const replayKey = randomUUID();
    await confirmOrder(secondary.identity, {
      idempotencyKey: replayKey,
      orderId: order.id,
    });
    await assert.rejects(
      confirmOrder(primary.identity, {
        idempotencyKey: replayKey,
        orderId: order.id,
      }),
      expectCommerceCode("NOT_FOUND"),
    );
    assert.equal(
      await prisma.orderStatusHistory.count({ where: { idempotencyKey: replayKey } }),
      1,
    );
  });

  await t.test("suspended Store blocks Checkout while preserving Cart and history", async () => {
    const operationalCustomer = await createPerson("suspended-operational-order");
    const operationalCart = await createPickupCart(operationalCustomer.id, secondary.variant.id);
    const operationalOrder = await createPendingOrder({
      cartId: operationalCart.id,
      cartVersion: operationalCart.version,
      customerId: operationalCustomer.id,
      fulfillmentMethod: "CUSTOMER_PICKUP",
      idempotencyKey: randomUUID(),
    });
    await confirmOrder(secondary.identity, {
      idempotencyKey: `confirm-before-suspension-${operationalOrder.id}`,
      orderId: operationalOrder.id,
    });
    const customer = await createPerson("suspended-store-customer");
    const cart = await createPickupCart(customer.id, secondary.variant.id);
    await suspendStore(adminContext, secondary.store.id, "Suspension integration test");
    const preparing = await advanceOrderFulfillment(secondary.identity, {
      idempotencyKey: `prepare-during-suspension-${operationalOrder.id}`,
      next: "PREPARING",
      orderId: operationalOrder.id,
    });
    assert.equal(preparing.fulfillmentStatus, "PREPARING");
    await assert.rejects(
      addCartItem(customer.id, { expectedVersion: cart.version, quantity: 1, variantId: secondary.variant.id }),
      expectCommerceCode("PRODUCT_UNAVAILABLE"),
    );
    await assert.rejects(
      createPendingOrder({
        cartId: cart.id,
        cartVersion: cart.version,
        customerId: customer.id,
        fulfillmentMethod: "CUSTOMER_PICKUP",
        idempotencyKey: randomUUID(),
      }),
      expectCommerceCode("STORE_UNAVAILABLE"),
    );
    assert.equal((await getCustomerCart(customer.id))?.id, cart.id);
    await reactivateStore(adminContext, secondary.store.id);
  });

  await t.test("archived Product changes do not rewrite historical OrderItem snapshots", async () => {
    const customer = await createPerson("snapshot-customer");
    const cart = await createPickupCart(customer.id, primary.variant.id);
    const order = await createPendingOrder({
      cartId: cart.id,
      cartVersion: cart.version,
      customerId: customer.id,
      fulfillmentMethod: "CUSTOMER_PICKUP",
      idempotencyKey: randomUUID(),
    });
    const snapshot = order.items[0];
    await prisma.product.update({ where: { id: primary.product.id }, data: { name: "Changed Product Name" } });
    await archiveProduct(primary.identity, primary.product.id);
    const historical = await prisma.orderItem.findUniqueOrThrow({ where: { id: snapshot!.id } });
    assert.equal(historical.productNameSnapshot, snapshot?.productNameSnapshot);
    assert.equal(historical.unitPrice.toString(), snapshot?.unitPrice.toString());
  });

  await t.test("booking data remains unchanged", async () => {
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    assert.deepEqual(after, bookingBaseline);
  });

  await resetTestData();
});
