import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { serializeCustomerOrderDetail } from "../../../features/commerce/api/dto";
import { commerceNotificationCopy } from "../../../features/commerce/domain/notification-events";
import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import { addCartItem } from "../../../features/commerce/services/cart-service";
import { createPendingOrder } from "../../../features/commerce/services/checkout-service";
import { createCustomerAddress } from "../../../features/commerce/services/customer-service";
import {
  addFavoriteProduct,
  addFavoriteStore,
  listFavoriteProducts,
  listFavoriteStores,
  removeFavoriteProduct,
  removeFavoriteStore,
} from "../../../features/commerce/services/customer-favorite-service";
import { listCustomerNotifications } from "../../../features/commerce/services/customer-notification-service";
import {
  getCustomerOrderDetail,
  listCustomerOrders,
} from "../../../features/commerce/services/customer-order-query-service";
import {
  advanceOrderFulfillment,
  cancelCustomerOrder,
  confirmOrder,
  rejectOrder,
} from "../helpers/legacy-order-transitions";
import { expirePendingOrdersBatch } from "../../../features/commerce/services/expiration-service";
import { prisma } from "../../../lib/db/prisma";
import {
  resetMilestone2cTestData,
  seedMilestone2cFixture,
} from "../helpers/milestone-2c-fixture";

function expectCode(code: CommerceDomainError["code"]) {
  return (error: unknown) => error instanceof CommerceDomainError && error.code === code;
}

const favoriteQuery = { limit: 20 };
const orderQuery = { limit: 20, sort: "newest" as const };

test("Milestone 2D PostgreSQL Orders, Favorites, and Notifications", { concurrency: false }, async (t) => {
  t.after(async () => {
    await resetMilestone2cTestData();
    await prisma.$disconnect();
  });

  await t.test("Checkout notifications are exact-once, tenant-scoped, localized, and safe", async () => {
    const { catalogA, customers, merchantA, merchantB, merchantNoPermissions } = await seedMilestone2cFixture();
    const customer = await prisma.person.update({
      where: { id: customers[0]!.id },
      data: { preferredLanguage: "KU" },
    });
    const ownerMembership = await prisma.organizationMember.findUniqueOrThrow({
      where: { personId_organizationId: { personId: merchantA.person.id, organizationId: merchantA.organization.id } },
    });
    const noPermissionRole = await prisma.role.create({
      data: { name: "No Order Access", organizationId: merchantA.organization.id },
    });
    const unauthorizedPerson = await prisma.person.create({
      data: { authUserId: `unauthorized-${randomUUID()}`, firstName: "Unauthorized", isOnboarded: true },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId: merchantA.organization.id,
        personId: unauthorizedPerson.id,
        roleId: noPermissionRole.id,
      },
    });
    const inactivePerson = await prisma.person.create({
      data: {
        authUserId: `inactive-${randomUUID()}`,
        firstName: "Inactive",
        isOnboarded: true,
        status: "INACTIVE",
      },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId: merchantA.organization.id,
        personId: inactivePerson.id,
        roleId: ownerMembership.roleId,
      },
    });
    const cart = await addCartItem(customer.id, { quantity: 1, variantId: catalogA.variant.id });
    const key = randomUUID();
    const input = {
      cartId: cart.id,
      cartVersion: cart.version,
      customerId: customer.id,
      fulfillmentMethod: "CUSTOMER_PICKUP" as const,
      idempotencyKey: key,
    };
    const [left, right] = await Promise.all([createPendingOrder(input), createPendingOrder(input)]);
    assert.equal(left.id, right.id);
    assert.equal(await prisma.notification.count({ where: { recipientPersonId: customer.id } }), 1);
    assert.equal(
      (await prisma.notification.findFirstOrThrow({ where: { recipientPersonId: customer.id } })).title,
      commerceNotificationCopy("order.created", "KU", left.orderNumber, left.storeNameSnapshot).title,
    );
    assert.equal(await prisma.notification.count({ where: { recipientPersonId: merchantA.person.id } }), 1);
    assert.equal(await prisma.notification.count({ where: { recipientPersonId: merchantB.person.id } }), 0);
    assert.equal(await prisma.notification.count({ where: { recipientPersonId: merchantNoPermissions.person.id } }), 0);
    assert.equal(await prisma.notification.count({ where: { recipientPersonId: unauthorizedPerson.id } }), 0);
    assert.equal(await prisma.notification.count({ where: { recipientPersonId: inactivePerson.id } }), 0);
    const notifications = await prisma.notification.findMany({ where: { eventKey: { not: null } } });
    assert.equal(notifications.length, 2);
    for (const notification of notifications) {
      const json = JSON.stringify(notification.metadata);
      assert.match(notification.eventKey!, new RegExp(`^commerce:${left.id}:order\\.`));
      assert.equal(json.includes("phone"), false);
      assert.equal(json.includes("address"), false);
      assert.equal(json.includes("instructions"), false);
      assert.equal(json.includes("inventory"), false);
      assert.ok(notification.title.length > 0);
      assert.ok(notification.body.length > 0);
    }
  });

  await t.test("customer Notification pages fill from authorized records across mixed dual-role feeds", async () => {
    const { catalogA, customers, merchantA } = await seedMilestone2cFixture();
    const customer = customers[0]!;
    const otherCustomer = customers[1]!;
    const ownerMembership = await prisma.organizationMember.findUniqueOrThrow({
      where: {
        personId_organizationId: {
          organizationId: merchantA.organization.id,
          personId: merchantA.person.id,
        },
      },
      select: { roleId: true },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId: merchantA.organization.id,
        personId: customer.id,
        roleId: ownerMembership.roleId,
      },
    });

    const ownedOrders: Awaited<ReturnType<typeof checkout>>[] = [];
    for (let index = 0; index < 8; index += 1) {
      ownedOrders.push(await checkout(customer.id, catalogA.variant.id));
    }
    const otherOrder = await checkout(otherCustomer.id, catalogA.variant.id);
    const validNotifications = await prisma.notification.findMany({
      where: {
        eventKey: { contains: ":order.created:" },
        recipientPersonId: customer.id,
      },
      orderBy: { id: "asc" },
    });
    assert.equal(validNotifications.length, 8);

    const baseTime = new Date("2026-07-13T10:00:00.000Z");
    for (const [index, notification] of validNotifications.entries()) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          createdAt: new Date(
            baseTime.getTime() - (index < 2 ? 1_000 : index * 1_000),
          ),
        },
      });
    }

    await prisma.notification.createMany({
      data: Array.from({ length: 11 }, (_, index) => ({
        audience: "USER" as const,
        body: `Merchant pagination body ${index}`,
        createdAt: new Date(baseTime.getTime() + 60_000),
        eventKey: `commerce:${ownedOrders[index % ownedOrders.length]!.id}:order.new:${customer.id}:pagination-${index}`,
        metadata: {
          destination: "/business/notifications",
          eventType: "order.new",
          orderId: ownedOrders[index % ownedOrders.length]!.id,
        },
        recipientPersonId: customer.id,
        title: `Merchant pagination title ${index}`,
      })),
    });
    await prisma.notification.updateMany({
      where: {
        eventKey: { contains: ":order.new:" },
        recipientPersonId: customer.id,
      },
      data: { createdAt: new Date(baseTime.getTime() + 60_000) },
    });
    assert.equal(
      await prisma.notification.count({
        where: {
          eventKey: { contains: ":order.new:" },
          recipientPersonId: customer.id,
        },
      }),
      20,
    );

    const crossOwnerNotifications = await Promise.all(
      Array.from({ length: 8 }, (_, index) => prisma.notification.create({
        data: {
          audience: "USER",
          body: `Cross-owner pagination body ${index}`,
          createdAt: new Date(baseTime.getTime() + (index < 4 ? 30_000 : -3_500)),
          eventKey: `commerce:${otherOrder.id}:order.confirmed:${customer.id}:cross-${index}`,
          metadata: {
            destination: "/customer/notifications",
            eventType: "order.confirmed",
            orderId: otherOrder.id,
          },
          recipientPersonId: customer.id,
          title: `Cross-owner pagination title ${index}`,
        },
      })),
    );
    const [legacy, malformed, missingEvent, unknownEvent, invalidOrderId] = await Promise.all([
      prisma.notification.create({
        data: {
          audience: "USER",
          body: "Legacy pagination body",
          createdAt: new Date(baseTime.getTime() + 50_000),
          recipientPersonId: customer.id,
          title: "Legacy pagination title",
        },
      }),
      prisma.notification.create({
        data: {
          audience: "USER",
          body: "Malformed pagination body",
          createdAt: new Date(baseTime.getTime() + 50_000),
          eventKey: `commerce:${randomUUID()}:malformed:${customer.id}`,
          metadata: "malformed",
          recipientPersonId: customer.id,
          title: "Malformed pagination title",
        },
      }),
      prisma.notification.create({
        data: {
          audience: "USER",
          body: "Missing-event pagination body",
          createdAt: new Date(baseTime.getTime() + 50_000),
          eventKey: `commerce:${randomUUID()}:missing:${customer.id}`,
          metadata: { destination: "/customer/notifications", orderId: ownedOrders[0]!.id },
          recipientPersonId: customer.id,
          title: "Missing-event pagination title",
        },
      }),
      prisma.notification.create({
        data: {
          audience: "USER",
          body: "Unknown-event pagination body",
          createdAt: new Date(baseTime.getTime() + 50_000),
          eventKey: `commerce:${randomUUID()}:order.future:${customer.id}`,
          metadata: {
            destination: "/customer/notifications",
            eventType: "order.future",
            orderId: ownedOrders[0]!.id,
          },
          recipientPersonId: customer.id,
          title: "Unknown-event pagination title",
        },
      }),
      prisma.notification.create({
        data: {
          audience: "USER",
          body: "Invalid-order pagination body",
          createdAt: new Date(baseTime.getTime() + 20_000),
          eventKey: `commerce:${randomUUID()}:order.confirmed:${customer.id}`,
          metadata: {
            destination: "/customer/notifications",
            eventType: "order.confirmed",
            orderId: "not-a-uuid",
          },
          recipientPersonId: customer.id,
          title: "Invalid-order pagination title",
        },
      }),
    ]);

    const expectedIds = (await prisma.notification.findMany({
      where: { id: { in: validNotifications.map((item) => item.id) } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    })).map((item) => item.id);
    const excludedIds = new Set([
      ...crossOwnerNotifications.map((item) => item.id),
      legacy.id,
      malformed.id,
      missingEvent.id,
      unknownEvent.id,
      invalidOrderId.id,
    ]);

    const pageOne = await listCustomerNotifications(customer.id, { limit: 5 });
    assert.equal(pageOne.data.length, 5);
    assert.equal(pageOne.pageInfo.hasNextPage, true);
    assert.ok(pageOne.pageInfo.nextCursor);
    assert.deepEqual(pageOne.data.map((item) => item.id), expectedIds.slice(0, 5));

    const pageTwo = await listCustomerNotifications(customer.id, {
      cursor: pageOne.pageInfo.nextCursor!,
      limit: 5,
    });
    assert.deepEqual(pageTwo.data.map((item) => item.id), expectedIds.slice(5));
    assert.equal(pageTwo.pageInfo.hasNextPage, false);
    assert.equal(pageTwo.pageInfo.nextCursor, null);

    const allPages = [...pageOne.data, ...pageTwo.data];
    assert.deepEqual(allPages.map((item) => item.id), expectedIds);
    assert.equal(new Set(allPages.map((item) => item.id)).size, expectedIds.length);
    assert.equal(allPages.some((item) => excludedIds.has(item.id)), false);
    assert.equal(allPages.some((item) => item.title.startsWith("Merchant pagination")), false);
    assert.equal(allPages.some((item) => item.body.startsWith("Merchant pagination")), false);
  });

  await t.test("customer Orders are owner-scoped, paginated, and preserve immutable snapshots", async () => {
    const { catalogA, customers } = await seedMilestone2cFixture();
    const customerA = customers[0]!;
    const customerB = customers[1]!;
    const first = await checkout(customerA.id, catalogA.variant.id);
    const second = await checkout(customerA.id, catalogA.variant.id);
    await checkout(customerB.id, catalogA.variant.id);
    await prisma.order.updateMany({
      where: { id: { in: [first.id, second.id] } },
      data: { createdAt: new Date("2026-07-12T12:00:00.000Z") },
    });
    const pageOne = await listCustomerOrders(customerA.id, { ...orderQuery, limit: 1 });
    assert.equal(pageOne.data.length, 1);
    assert.equal(pageOne.pageInfo.hasNextPage, true);
    const pageTwo = await listCustomerOrders(customerA.id, {
      ...orderQuery,
      cursor: pageOne.pageInfo.nextCursor!,
      limit: 1,
    });
    assert.equal(new Set([...pageOne.data, ...pageTwo.data].map((order) => order.id)).size, 2);
    assert.deepEqual(new Set([first.id, second.id]), new Set([...pageOne.data, ...pageTwo.data].map((order) => order.id)));
    const filtered = await listCustomerOrders(customerA.id, {
      ...orderQuery,
      status: "PENDING",
      storeSlug: catalogA.store.slug,
    });
    assert.equal(filtered.data.length, 2);
    assert.equal((await listCustomerOrders(customerA.id, { limit: 20, sort: "oldest" })).data.length, 2);
    await assert.rejects(() => getCustomerOrderDetail(customerB.id, first.id), expectCode("NOT_FOUND"));

    const snapshot = serializeCustomerOrderDetail(await getCustomerOrderDetail(customerA.id, first.id));
    await prisma.product.update({ where: { id: catalogA.product.id }, data: { archivedAt: new Date(), status: "ARCHIVED" } });
    await prisma.productVariant.update({ where: { id: catalogA.variant.id }, data: { archivedAt: new Date(), status: "ARCHIVED" } });
    await prisma.store.update({ where: { id: catalogA.store.id }, data: { status: "SUSPENDED", suspendedAt: new Date() } });
    const historical = serializeCustomerOrderDetail(await getCustomerOrderDetail(customerA.id, first.id));
    assert.deepEqual(historical.items, snapshot.items);
    assert.deepEqual(historical.store, snapshot.store);
    assert.equal(JSON.stringify(historical).includes("customerId"), false);
    assert.equal(JSON.stringify(historical).includes("reservation"), false);
  });

  await t.test("Store and Product Favorites are idempotent, concurrent, hidden-safe, and owner-scoped", async () => {
    const { catalogA, catalogB, customers } = await seedMilestone2cFixture();
    const customerA = customers[0]!;
    const customerB = customers[1]!;
    const paginationCustomer = customers[2]!;
    const stores = await Promise.all(Array.from({ length: 4 }, () => addFavoriteStore(customerA.id, catalogA.store.id)));
    assert.equal(new Set(stores.map((item) => item.favoriteId)).size, 1);
    const products = await Promise.all(Array.from({ length: 4 }, () => addFavoriteProduct(customerA.id, catalogA.product.id)));
    assert.equal(new Set(products.map((item) => item.favoriteId)).size, 1);
    assert.equal(await prisma.customerFavoriteStore.count({ where: { customerId: customerA.id } }), 1);
    assert.equal(await prisma.customerFavoriteProduct.count({ where: { customerId: customerA.id } }), 1);
    assert.equal((await listFavoriteStores(customerA.id, favoriteQuery)).data.length, 1);
    assert.equal((await listFavoriteProducts(customerA.id, favoriteQuery)).data.length, 1);
    await assert.rejects(() => removeFavoriteStore(customerB.id, catalogA.store.id), expectCode("FAVORITE_NOT_FOUND"));
    await assert.rejects(() => removeFavoriteProduct(customerB.id, catalogA.product.id), expectCode("FAVORITE_NOT_FOUND"));
    assert.equal(await prisma.customerFavoriteStore.count({ where: { customerId: customerA.id } }), 1);
    assert.equal(await prisma.customerFavoriteProduct.count({ where: { customerId: customerA.id } }), 1);

    await prisma.store.update({ where: { id: catalogB.store.id }, data: { name: catalogA.store.name } });
    await prisma.product.update({ where: { id: catalogB.product.id }, data: { name: catalogA.product.name } });
    await prisma.productVariant.update({ where: { id: catalogB.variant.id }, data: { price: catalogA.variant.price } });
    await addFavoriteStore(paginationCustomer.id, catalogA.store.id);
    await addFavoriteStore(paginationCustomer.id, catalogB.store.id);
    await addFavoriteProduct(paginationCustomer.id, catalogA.product.id);
    await addFavoriteProduct(paginationCustomer.id, catalogB.product.id);
    const equalTime = new Date("2026-07-12T13:00:00.000Z");
    await prisma.customerFavoriteStore.updateMany({ where: { customerId: paginationCustomer.id }, data: { createdAt: equalTime } });
    await prisma.customerFavoriteProduct.updateMany({ where: { customerId: paginationCustomer.id }, data: { createdAt: equalTime } });
    const storePageOne = await listFavoriteStores(paginationCustomer.id, { limit: 1 });
    const storePageTwo = await listFavoriteStores(paginationCustomer.id, { cursor: storePageOne.pageInfo.nextCursor!, limit: 1 });
    assert.equal(new Set([...storePageOne.data, ...storePageTwo.data].map((item) => item.store.id)).size, 2);
    const productPageOne = await listFavoriteProducts(paginationCustomer.id, { limit: 1 });
    const productPageTwo = await listFavoriteProducts(paginationCustomer.id, { cursor: productPageOne.pageInfo.nextCursor!, limit: 1 });
    assert.equal(new Set([...productPageOne.data, ...productPageTwo.data].map((item) => item.product.id)).size, 2);

    await prisma.store.update({ where: { id: catalogA.store.id }, data: { status: "SUSPENDED", suspendedAt: new Date() } });
    assert.equal((await listFavoriteStores(customerA.id, favoriteQuery)).data.length, 0);
    assert.equal((await listFavoriteProducts(customerA.id, favoriteQuery)).data.length, 0);
    assert.equal(await prisma.customerFavoriteStore.count({ where: { customerId: customerA.id } }), 1);
    assert.equal(await prisma.customerFavoriteProduct.count({ where: { customerId: customerA.id } }), 1);
    await prisma.store.update({ where: { id: catalogA.store.id }, data: { status: "ACTIVE", suspendedAt: null } });
    assert.equal((await listFavoriteStores(customerA.id, favoriteQuery)).data.length, 1);
    assert.equal((await listFavoriteProducts(customerA.id, favoriteQuery)).data.length, 1);
    await prisma.store.update({ where: { id: catalogA.store.id }, data: { status: "SUSPENDED", suspendedAt: new Date() } });
    await removeFavoriteStore(customerA.id, catalogA.store.id);
    await removeFavoriteProduct(customerA.id, catalogA.product.id);
    await assert.rejects(() => removeFavoriteStore(customerA.id, catalogA.store.id), expectCode("FAVORITE_NOT_FOUND"));
    await assert.rejects(() => removeFavoriteProduct(customerA.id, catalogA.product.id), expectCode("FAVORITE_NOT_FOUND"));
    assert.equal(await prisma.customerFavoriteBusiness.count(), 0);
    assert.equal(await prisma.customerFavoriteService.count(), 0);
  });

  await t.test("cancellation, transitions, and expiration emit exact-once lifecycle notifications", async () => {
    const { catalogA, customers, merchantA } = await seedMilestone2cFixture();
    const pending = await checkout(customers[0]!.id, catalogA.variant.id);
    const attempts = await Promise.allSettled([
      cancelCustomerOrder(customers[0]!.id, { orderId: pending.id, reason: "Changed plans" }),
      cancelCustomerOrder(customers[0]!.id, { orderId: pending.id, reason: "Changed plans" }),
    ]);
    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 2);
    assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 0);
    await prisma.$disconnect();
    await assert.rejects(
      () => cancelCustomerOrder(customers[0]!.id, { orderId: pending.id, reason: "A different reason" }),
      expectCode("ORDER_NOT_CANCELLABLE"),
    );
    await assert.rejects(
      () => cancelCustomerOrder(customers[1]!.id, { orderId: pending.id, reason: "Not my order" }),
      expectCode("NOT_FOUND"),
    );
    assert.equal(await prisma.orderStatusHistory.count({ where: { orderId: pending.id, newOrderStatus: "CANCELLED" } }), 1);
    assert.equal(await prisma.stockMovement.count({ where: { orderId: pending.id, type: "RELEASE" } }), 1);
    assert.equal(await prisma.notification.count({ where: { eventKey: { contains: `${pending.id}:order.cancelled:` } } }), 1);
    assert.equal(await prisma.notification.count({ where: { eventKey: { contains: `${pending.id}:order.customer_cancelled:` } } }), 1);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { orderId: pending.id } })).status, "VOIDED");

    const confirmed = await checkout(customers[1]!.id, catalogA.variant.id);
    await confirmOrder(merchantA.identity, { idempotencyKey: randomUUID(), orderId: confirmed.id });
    await cancelCustomerOrder(customers[1]!.id, { orderId: confirmed.id, reason: "No longer needed" });
    assert.equal(await prisma.stockMovement.count({ where: { orderId: confirmed.id, type: "RESTOCK" } }), 1);
    assert.equal(await prisma.notification.count({ where: { eventKey: { contains: `${confirmed.id}:order.confirmed:` } } }), 1);

    const delivery = await checkout(customers[2]!.id, catalogA.variant.id);
    await confirmOrder(merchantA.identity, { idempotencyKey: randomUUID(), orderId: delivery.id });
    await advanceOrderFulfillment(merchantA.identity, { idempotencyKey: randomUUID(), next: "PREPARING", orderId: delivery.id });
    await advanceOrderFulfillment(merchantA.identity, { idempotencyKey: randomUUID(), next: "READY_FOR_PICKUP", orderId: delivery.id });
    assert.equal(await prisma.notification.count({ where: { eventKey: { contains: `${delivery.id}:order.preparing:` } } }), 1);
    assert.equal(await prisma.notification.count({ where: { eventKey: { contains: `${delivery.id}:order.ready_for_pickup:` } } }), 1);

    const rejected = await checkout(customers[3]!.id, catalogA.variant.id);
    await rejectOrder(merchantA.identity, { idempotencyKey: randomUUID(), orderId: rejected.id, reason: "Unavailable" });
    assert.equal(await prisma.notification.count({ where: { eventKey: { contains: `${rejected.id}:order.rejected:` } } }), 1);

    const expiring = await checkout(customers[4]!.id, catalogA.variant.id, new Date("2026-07-12T12:00:00.000Z"));
    const expiry = await expirePendingOrdersBatch({ now: new Date("2026-07-12T12:16:00.000Z") });
    assert.equal(expiry.expired, 1);
    assert.equal((await expirePendingOrdersBatch({ now: new Date("2026-07-12T12:17:00.000Z") })).expired, 0);
    assert.equal(await prisma.notification.count({
      where: { eventKey: { contains: `${expiring.id}:order.expired:` }, recipientPersonId: customers[4]!.id },
    }), 1);

    const deliveryAddress = await createCustomerAddress(customers[5]!.id, {
      additionalDetails: "Delivery details",
      area: "Karrada",
      city: "Baghdad",
      phone: "+9647500000000",
      recipientName: "Delivery Customer",
      street: "Delivery Street",
    });
    const deliveryCart = await addCartItem(customers[5]!.id, { quantity: 1, variantId: catalogA.variant.id });
    const deliveryOrder = await createPendingOrder({
      addressId: deliveryAddress.id,
      cartId: deliveryCart.id,
      cartVersion: deliveryCart.version,
      customerId: customers[5]!.id,
      fulfillmentMethod: "STORE_DELIVERY",
      idempotencyKey: randomUUID(),
    });
    await confirmOrder(merchantA.identity, { idempotencyKey: randomUUID(), orderId: deliveryOrder.id });
    await advanceOrderFulfillment(merchantA.identity, { idempotencyKey: randomUUID(), next: "PREPARING", orderId: deliveryOrder.id });
    await advanceOrderFulfillment(merchantA.identity, { idempotencyKey: randomUUID(), next: "OUT_FOR_DELIVERY", orderId: deliveryOrder.id });
    await advanceOrderFulfillment(merchantA.identity, { idempotencyKey: randomUUID(), next: "DELIVERED", orderId: deliveryOrder.id });
    assert.equal(await prisma.notification.count({ where: { eventKey: { contains: `${deliveryOrder.id}:order.out_for_delivery:` } } }), 1);
    assert.equal(await prisma.notification.count({ where: { eventKey: { contains: `${deliveryOrder.id}:order.delivered:` } } }), 1);

    const paidOrder = await checkout(customers[0]!.id, catalogA.variant.id);
    await prisma.payment.update({ where: { orderId: paidOrder.id }, data: { status: "PAID", paidAt: new Date() } });
    await prisma.order.update({ where: { id: paidOrder.id }, data: { paymentStatus: "PAID" } });
    await assert.rejects(
      () => cancelCustomerOrder(customers[0]!.id, { orderId: paidOrder.id, reason: "Paid order" }),
      expectCode("ORDER_NOT_CANCELLABLE"),
    );
    assert.equal(await prisma.orderStatusHistory.count({ where: { orderId: paidOrder.id, newOrderStatus: "CANCELLED" } }), 0);

    await assert.rejects(
      () => cancelCustomerOrder(customers[2]!.id, { orderId: delivery.id, reason: "Too late" }),
      expectCode("ORDER_NOT_CANCELLABLE"),
    );
    const adminAnnouncement = await prisma.notification.create({
      data: { audience: "ALL", body: "Existing body", title: "Existing title" },
    });
    assert.equal(adminAnnouncement.eventKey, null);
  });
});

async function checkout(customerId: string, variantId: string, now?: Date) {
  const cart = await addCartItem(customerId, { quantity: 1, variantId });
  return createPendingOrder({
    cartId: cart.id,
    cartVersion: cart.version,
    customerId,
    fulfillmentMethod: "CUSTOMER_PICKUP",
    idempotencyKey: randomUUID(),
    now,
  });
}
