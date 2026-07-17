import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { CommercePermission, SystemRole } from "@prisma/client";

import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import { POSTGRES_INT_MAX } from "../../../features/commerce/domain/inventory";
import { addCartItem } from "../../../features/commerce/services/cart-service";
import { createPendingOrder } from "../../../features/commerce/services/checkout-service";
import { createCustomerAddress } from "../../../features/commerce/services/customer-service";
import { expirePendingOrdersBatch } from "../../../features/commerce/services/expiration-service";
import { adjustInventory } from "../../../features/commerce/services/inventory-service";
import {
  getMerchantOrderDetail,
  listMerchantOrders,
} from "../../../features/commerce/services/merchant-order-query-service";
import {
  createMerchantProduct,
  publishMerchantProduct,
} from "../../../features/commerce/services/merchant-product-service";
import {
  advanceOrderFulfillment,
  cancelCustomerOrder,
  cancelMerchantOrder,
  confirmOrder,
  expirePendingOrder,
  rejectOrder,
} from "../../../features/commerce/services/order-service";
import type { MerchantActorReference } from "../../../features/commerce/services/authorization";
import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../../features/identity/policies/authorization";
import { prisma } from "../../../lib/db/prisma";

type Actor = Awaited<ReturnType<typeof createActor>>;
type ProductDto = {
  expectedVersion: string;
  id: string;
  variants: Array<{ id: string; inventory: { id: string; onHand: number; version: number } | null }>;
};

function code(expected: CommerceDomainError["code"]) {
  return (error: unknown) => error instanceof CommerceDomainError && error.code === expected;
}

async function reset() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.match(rows[0]?.database ?? "", /(?:_test|test_)/);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE');
}

async function createPerson(label: string) {
  return prisma.person.create({ data: {
    authUserId: `stage3c-${label}-${randomUUID()}`,
    firstName: label,
    isOnboarded: true,
    phone: "+9647500000300",
  } });
}

async function createActor(
  label: string,
  systemRole: SystemRole,
  commercePermissions: CommercePermission[],
  organizationId?: string,
) {
  const person = await createPerson(label);
  const organization = organizationId
    ? await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })
    : await prisma.organization.create({ data: { name: `${label} Org`, slug: `stage3c-${label}-${randomUUID().slice(0, 8)}` } });
  const role = await prisma.role.create({ data: {
    commercePermissions,
    isSystem: true,
    name: `${label} ${systemRole}`,
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
    role,
  };
}

async function createStore(actor: Actor, label: string, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  return prisma.store.create({ data: {
    deliveryArea: "Karrada",
    deliveryCity: "Baghdad",
    deliveryEnabled: true,
    deliveryEstimateMinutes: 30,
    deliveryFee: "1000",
    minimumOrderValue: "0",
    name: `${label} Store`,
    organizationId: actor.organization.id,
    pickupArea: "Karrada",
    pickupCity: "Baghdad",
    pickupEnabled: true,
    pickupInstructions: "Bring the Order number",
    pickupStreet: "Stage 3C Street",
    preparationEstimateMinutes: 15,
    publishedAt: new Date(),
    slug: `stage3c-${label}-${randomUUID().slice(0, 8)}`,
    status,
    supportPhone: "+9647500000301",
    suspendedAt: status === "SUSPENDED" ? new Date() : null,
    suspensionReason: status === "SUSPENDED" ? "Stage 3C lifecycle test" : null,
  } });
}

function transition(order: { id: string; updatedAt: Date | string }) {
  return {
    expectedVersion: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
    idempotencyKey: randomUUID(),
    orderId: order.id,
  };
}

test("Gate 3C Merchant Orders and fulfillment PostgreSQL end-to-end", { concurrency: false }, async (t) => {
  await reset();
  t.after(async () => { await reset(); await prisma.$disconnect(); });

  const owner = await createActor("owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]);
  const store = await createStore(owner, "primary");
  const manager = await createActor("manager", "MANAGER", ["ORDER_VIEW", "ORDER_MANAGE", "ORDER_CANCEL"], owner.organization.id);
  const managerRead = await createActor("manager-read", "MANAGER", ["ORDER_VIEW"], owner.organization.id);
  const managerCancel = await createActor("manager-cancel", "MANAGER", ["ORDER_VIEW", "ORDER_CANCEL"], owner.organization.id);
  const staff = await createActor("staff", "STAFF", ["ORDER_VIEW", "ORDER_MANAGE"], owner.organization.id);
  const staffView = await createActor("staff-view", "STAFF", ["ORDER_VIEW"], owner.organization.id);
  const staffDenied = await createActor("staff-denied", "STAFF", [], owner.organization.id);
  const receptionist = await createActor("receptionist", "RECEPTIONIST", ["ORDER_VIEW", "ORDER_MANAGE"], owner.organization.id);
  const foreign = await createActor("foreign", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]);
  await createStore(foreign, "foreign");

  const category = await prisma.marketplaceCategory.create({ data: {
    name: "Stage 3C",
    normalizedName: "stage 3c",
    slug: `stage3c-${randomUUID().slice(0, 8)}`,
  } });
  let product = await createMerchantProduct(owner.reference, {
    categoryId: category.id,
    contextOrganizationId: owner.organization.id,
    defaultVariant: {
      compareAtPrice: "12000",
      optionValues: {},
      price: "10000",
      sku: `STAGE3C-${randomUUID().slice(0, 8)}`,
      title: "Default",
    },
    description: "Stage 3C operational Product",
    idempotencyKey: randomUUID(),
    name: "Stage 3C Product",
    slug: `stage3c-product-${randomUUID().slice(0, 8)}`,
  }) as ProductDto;
  const variant = product.variants[0]!;
  assert.ok(variant.inventory);
  await adjustInventory(owner.reference, {
    expectedVersion: variant.inventory!.version,
    idempotencyKey: randomUUID(),
    inventoryItemId: variant.inventory!.id,
    quantityDelta: 100,
    reason: "Stage 3C integration stock",
  });
  product = await publishMerchantProduct(owner.reference, {
    contextOrganizationId: owner.organization.id,
    expectedVersion: product.expectedVersion,
    idempotencyKey: randomUUID(),
    productId: product.id,
  }) as ProductDto;

  async function checkout(label: string, method: "CUSTOMER_PICKUP" | "STORE_DELIVERY" = "CUSTOMER_PICKUP", now?: Date) {
    const customer = await createPerson(label);
    const address = method === "STORE_DELIVERY" ? await createCustomerAddress(customer.id, {
      additionalDetails: `${label} full address sentinel`,
      area: "Karrada",
      city: "Baghdad",
      phone: "+9647500000399",
      recipientName: `${label} recipient`,
      street: "Delivery Street",
    }) : null;
    const cart = await addCartItem(customer.id, { quantity: 1, variantId: variant.id });
    const order = await createPendingOrder({
      addressId: address?.id,
      cartId: cart.id,
      cartVersion: cart.version,
      customerId: customer.id,
      customerInstructions: `${label} private instructions`,
      fulfillmentMethod: method,
      idempotencyKey: randomUUID(),
      now,
    });
    return { customer, order };
  }

  const queueOrders = [
    await checkout("queue-a"),
    await checkout("queue-b"),
    await checkout("queue-c"),
  ];

  await t.test("authorization, Store scoping, summaries, detail modes, and cursors are structural", async () => {
    for (const actor of [owner, manager, managerRead, managerCancel, staff, staffView]) {
      const page = await listMerchantOrders(actor.reference, { limit: 2, queue: "pending" });
      assert.equal(page.data.length, 2);
      assert.ok(page.pageInfo.nextCursor);
      assert.equal(JSON.stringify(page.data).includes("full address sentinel"), false);
      assert.equal(JSON.stringify(page.data).includes("private instructions"), false);
      assert.equal(JSON.stringify(page.data).includes("+9647500000399"), false);
    }
    for (const actor of [staffDenied, receptionist]) {
      await assert.rejects(listMerchantOrders(actor.reference, { limit: 20, queue: "pending" }), code("FORBIDDEN"));
    }
    const first = await listMerchantOrders(owner.reference, { limit: 2, queue: "pending" });
    const second = await listMerchantOrders(owner.reference, { cursor: first.pageInfo.nextCursor!, limit: 2, queue: "pending" });
    assert.equal(first.data.some((row) => second.data.some((next) => next.id === row.id)), false);
    assert.equal((await listMerchantOrders(owner.reference, {
      limit: 20, queue: "pending", status: "COMPLETED",
    })).data.length, 0);
    assert.equal((await listMerchantOrders(owner.reference, {
      limit: 20, queue: "active", status: "PENDING",
    })).data.length, 0);
    await prisma.order.update({
      where: { id: queueOrders[0]!.order.id },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });
    const actionablePending = await listMerchantOrders(owner.reference, {
      actionableOnly: true, limit: 20, queue: "pending",
    });
    assert.equal(actionablePending.data.some((item) => item.id === queueOrders[0]!.order.id), false);
    await prisma.order.update({
      where: { id: queueOrders[0]!.order.id },
      data: { reservationExpiresAt: new Date(Date.now() + 60 * 60_000) },
    });
    await assert.rejects(listMerchantOrders(owner.reference, { cursor: first.pageInfo.nextCursor!, limit: 2, queue: "active" }), code("INVALID_CURSOR"));
    await assert.rejects(listMerchantOrders(foreign.reference, { cursor: first.pageInfo.nextCursor!, limit: 2, queue: "pending" }), code("INVALID_CURSOR"));
    assert.equal((await getMerchantOrderDetail(managerRead.reference, queueOrders[0]!.order.id)).order.mode, "read_only");
    const staffDetail = (await getMerchantOrderDetail(staff.reference, queueOrders[0]!.order.id)).order;
    assert.equal(staffDetail.mode, "management");
    if (staffDetail.mode === "management") assert.equal(staffDetail.allowedActions.includes("cancel"), false);
    const cancelDetail = (await getMerchantOrderDetail(managerCancel.reference, queueOrders[0]!.order.id)).order;
    assert.equal(cancelDetail.mode, "management");
    if (cancelDetail.mode === "management") assert.deepEqual(cancelDetail.allowedActions, ["cancel"]);
    await assert.rejects(getMerchantOrderDetail(foreign.reference, queueOrders[0]!.order.id), code("NOT_FOUND"));
  });

  await t.test("confirmation consumes once and exact replay returns its original result after later transitions", async () => {
    const { order } = await checkout("exact-replay");
    const input = { ...transition(order), action: "confirm" as const };
    const confirmed = await confirmOrder(manager.reference, input);
    assert.equal(confirmed.status, "CONFIRMED");
    const preparing = await advanceOrderFulfillment(manager.reference, {
      ...transition(confirmed), action: "start_preparing",
    });
    assert.equal(preparing.fulfillmentStatus, "PREPARING");
    const replay = await confirmOrder(manager.reference, input);
    assert.deepEqual(replay, confirmed);
    assert.equal(replay.fulfillmentStatus, "UNFULFILLED");
    assert.equal(await prisma.orderStatusHistory.count({ where: { idempotencyKey: input.idempotencyKey } }), 1);
    assert.equal(await prisma.stockMovement.count({ where: { orderId: order.id, type: "CONSUME" } }), 1);
    assert.equal(await prisma.businessAuditLog.count({ where: { action: "commerce.order.confirm", targetId: order.id } }), 1);
  });

  await t.test("pickup and delivery final handoff atomically complete offline Payment and Order", async () => {
    const pickup = await checkout("pickup-final");
    let pickupState = await confirmOrder(owner.reference, { ...transition(pickup.order), action: "confirm" });
    pickupState = await advanceOrderFulfillment(owner.reference, { ...transition(pickupState), action: "start_preparing" });
    pickupState = await advanceOrderFulfillment(owner.reference, { ...transition(pickupState), action: "ready_for_pickup" });
    const pickupCompleted = await advanceOrderFulfillment(owner.reference, { ...transition(pickupState), action: "finalize_pickup" });
    assert.deepEqual([pickupCompleted.status, pickupCompleted.fulfillmentStatus, pickupCompleted.paymentStatus], ["COMPLETED", "PICKED_UP", "PAID"]);
    assert.equal(pickupCompleted.payment?.status, "PAID");

    const delivery = await checkout("delivery-final", "STORE_DELIVERY");
    let deliveryState = await confirmOrder(owner.reference, { ...transition(delivery.order), action: "confirm" });
    deliveryState = await advanceOrderFulfillment(owner.reference, { ...transition(deliveryState), action: "start_preparing" });
    deliveryState = await advanceOrderFulfillment(owner.reference, { ...transition(deliveryState), action: "out_for_delivery" });
    const finalInput = { ...transition(deliveryState), action: "finalize_delivery" as const };
    const delivered = await advanceOrderFulfillment(owner.reference, finalInput);
    assert.deepEqual([delivered.status, delivered.fulfillmentStatus, delivered.paymentStatus], ["COMPLETED", "DELIVERED", "PAID"]);
    assert.deepEqual(await advanceOrderFulfillment(owner.reference, finalInput), delivered);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: delivery.order.id } });
    assert.equal(payment.recordedById, owner.person.id);
    assert.equal(payment.recordedByType, "MERCHANT");
    await assert.rejects(cancelMerchantOrder(owner.reference, {
      ...transition(delivered), reason: "Too late", returnedStock: false,
    }), code("INVALID_TRANSITION"));
  });

  await t.test("delivery failure retries safely and cancellation requires physical stock return", async () => {
    const first = await checkout("delivery-failure", "STORE_DELIVERY");
    let state = await confirmOrder(owner.reference, { ...transition(first.order), action: "confirm" });
    state = await advanceOrderFulfillment(owner.reference, { ...transition(state), action: "start_preparing" });
    state = await advanceOrderFulfillment(owner.reference, { ...transition(state), action: "out_for_delivery" });
    await assert.rejects(cancelMerchantOrder(owner.reference, {
      ...transition(state), reason: "Courier returned", returnedStock: false,
    }), code("INVALID_TRANSITION"));
    state = await advanceOrderFulfillment(owner.reference, {
      ...transition(state), action: "delivery_failed", reason: "Recipient unavailable",
    });
    await assert.rejects(cancelMerchantOrder(owner.reference, {
      ...transition(state), reason: "Courier returned", returnedStock: false,
    }), code("VALIDATION_ERROR"));
    const retry = await advanceOrderFulfillment(owner.reference, { ...transition(state), action: "retry_delivery" });
    assert.equal(retry.fulfillmentStatus, "OUT_FOR_DELIVERY");

    const second = await checkout("delivery-return", "STORE_DELIVERY");
    let returned = await confirmOrder(owner.reference, { ...transition(second.order), action: "confirm" });
    returned = await advanceOrderFulfillment(owner.reference, { ...transition(returned), action: "start_preparing" });
    returned = await advanceOrderFulfillment(owner.reference, { ...transition(returned), action: "out_for_delivery" });
    returned = await advanceOrderFulfillment(owner.reference, {
      ...transition(returned), action: "delivery_failed", reason: "Address closed",
    });
    const cancelInput = { ...transition(returned), reason: "Stock physically returned", returnedStock: true };
    const cancelled = await cancelMerchantOrder(managerCancel.reference, cancelInput);
    assert.equal(cancelled.status, "CANCELLED");
    assert.deepEqual(await cancelMerchantOrder(managerCancel.reference, cancelInput), cancelled);
    assert.equal(await prisma.stockMovement.count({ where: { orderId: second.order.id, type: "RESTOCK" } }), 1);
    await assert.rejects(cancelMerchantOrder(staff.reference, {
      ...transition(retry), reason: "Staff escalation attempt", returnedStock: false,
    }), code("FORBIDDEN"));
  });

  await t.test("rejection and customer cancellation are exact-once across Inventory, history, and notifications", async () => {
    const rejection = await checkout("reject");
    const rejectInput = { ...transition(rejection.order), action: "reject" as const, reason: "Unavailable today" };
    const rejected = await rejectOrder(staff.reference, rejectInput);
    assert.equal(rejected.status, "REJECTED");
    assert.deepEqual(await rejectOrder(staff.reference, rejectInput), rejected);
    assert.equal(await prisma.stockMovement.count({ where: { orderId: rejection.order.id, type: "RELEASE" } }), 1);

    const customerCancel = await checkout("customer-cancel");
    const cancelInput = {
      ...transition(customerCancel.order), reason: "Customer changed plans",
    };
    const cancelled = await cancelCustomerOrder(customerCancel.customer.id, cancelInput);
    assert.deepEqual(await cancelCustomerOrder(customerCancel.customer.id, cancelInput), cancelled);
    assert.equal(await prisma.orderStatusHistory.count({ where: { idempotencyKey: cancelInput.idempotencyKey } }), 1);
    assert.equal(await prisma.stockMovement.count({ where: { orderId: customerCancel.order.id, type: "RELEASE" } }), 1);
    assert.equal(await prisma.businessAuditLog.count({ where: { targetId: customerCancel.order.id } }), 0);
    assert.equal(await prisma.notification.count({ where: { eventKey: { contains: `${customerCancel.order.id}:order.customer_cancelled:` } } }) > 0, true);
  });

  await t.test("overdue Merchant mutation resolves to one SYSTEM expiration without stranded stock", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const expired = await checkout("expired", "CUSTOMER_PICKUP", past);
    const input = { ...transition(expired.order), action: "confirm" as const };
    const result = await confirmOrder(owner.reference, input);
    assert.equal(result.status, "EXPIRED");
    assert.deepEqual(await confirmOrder(owner.reference, input), result);
    const history = await prisma.orderStatusHistory.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
    assert.equal(history.actorType, "SYSTEM");
    assert.equal(history.actorId, null);
    assert.equal(await prisma.stockMovement.count({ where: { orderId: expired.order.id, type: "RELEASE" } }), 1);
    assert.equal((await expirePendingOrdersBatch({ batchSize: 10 })).expired, 0);
  });

  await t.test("concurrent confirmation and cancellation produce one complete aggregate winner", async () => {
    const race = await checkout("race");
    const expected = race.order.updatedAt.toISOString();
    const results = await Promise.allSettled([
      confirmOrder(owner.reference, { expectedVersion: expected, idempotencyKey: randomUUID(), orderId: race.order.id, action: "confirm" }),
      cancelCustomerOrder(race.customer.id, { expectedVersion: expected, idempotencyKey: randomUUID(), orderId: race.order.id, reason: "Race cancellation" }),
    ]);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: race.order.id }, include: { payment: true, reservations: true } });
    assert.equal(["CONFIRMED", "CANCELLED"].includes(persisted.status), true);
    assert.equal(persisted.payment?.status, persisted.paymentStatus);
    assert.equal(persisted.reservations.every((item) => item.status === (persisted.status === "CONFIRMED" ? "CONSUMED" : "RELEASED")), true);
  });

  await t.test("restock overflow and non-operational Store integrity failures roll back the aggregate", async () => {
    const overflow = await checkout("overflow");
    const confirmed = await confirmOrder(owner.reference, { ...transition(overflow.order), action: "confirm" });
    await prisma.inventoryItem.update({ where: { id: variant.inventory!.id }, data: { onHand: POSTGRES_INT_MAX } });
    const before = await prisma.order.findUniqueOrThrow({ where: { id: overflow.order.id } });
    await assert.rejects(cancelMerchantOrder(owner.reference, {
      ...transition(confirmed), reason: "Overflow rollback", returnedStock: false,
    }), code("INVENTORY_CONFLICT"));
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: overflow.order.id } })).status, before.status);
    assert.equal(await prisma.stockMovement.count({ where: { orderId: overflow.order.id, type: "RESTOCK" } }), 0);
    await prisma.inventoryItem.update({ where: { id: variant.inventory!.id }, data: { onHand: 80 } });

    const archived = await checkout("archived-store");
    await prisma.store.update({ where: { id: store.id }, data: { archivedAt: new Date(), status: "ARCHIVED" } });
    await assert.rejects(confirmOrder(owner.reference, { ...transition(archived.order), action: "confirm" }), code("CONFLICT"));
    await prisma.order.update({
      where: { id: archived.order.id },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });
    await assert.rejects(expirePendingOrder(archived.order.id), code("CONFLICT"));
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: archived.order.id } })).status, "PENDING");
  });
});
