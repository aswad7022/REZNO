import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";
import {
  prepareMilestone2cHttpFixture,
  resetMilestone2cTestData,
} from "../helpers/milestone-2c-fixture";

const baseUrl = process.env.COMMERCE_HTTP_BASE_URL;

async function signUp(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email, name: email.split("@")[0], password: "password123" }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie);
  return cookie.split(";")[0]!;
}

async function request(
  path: string,
  options: { body?: unknown; cookie?: string; headers?: Record<string, string>; method?: string } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    method: options.method ?? "GET",
  });
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  return { body: await response.json() as Record<string, unknown>, response };
}

test(
  "Milestone 2D authenticated Order and Favorite routes use real Better Auth transport",
  { concurrency: false, skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live route tests" },
  async (t) => {
    await resetMilestone2cTestData();
    t.after(async () => {
      await resetMilestone2cTestData();
      await prisma.$disconnect();
    });
    const suffix = randomUUID().slice(0, 8);
    const emails = {
      customerAEmail: `m2d-customer-a-${suffix}@rezno.invalid`,
      customerBEmail: `m2d-customer-b-${suffix}@rezno.invalid`,
      merchantEmail: `m2d-merchant-${suffix}@rezno.invalid`,
      merchantNoPermissionEmail: `m2d-customer-b-${suffix}@rezno.invalid`,
    };
    const customerACookie = await signUp(emails.customerAEmail);
    const customerBCookie = await signUp(emails.customerBEmail);
    await signUp(emails.merchantEmail);
    const fixture = await prepareMilestone2cHttpFixture(emails);
    const dualRole = await prisma.role.findFirstOrThrow({
      where: {
        commercePermissions: { has: "ORDER_VIEW" },
        organizationId: fixture.merchant.organization.id,
      },
      select: { id: true },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId: fixture.merchant.organization.id,
        personId: fixture.customerA.person.id,
        roleId: dualRole.id,
      },
    });

    const unauthenticated = await request("/api/commerce/customer/orders");
    assert.equal(unauthenticated.response.status, 401);
    assert.equal((unauthenticated.body.error as { code: string }).code, "UNAUTHENTICATED");

    const added = await request("/api/commerce/customer/cart/items", {
      body: { quantity: 1, variantId: fixture.catalogA.variant.id },
      cookie: customerACookie,
      method: "POST",
    });
    const cart = added.body.data as { id: string; version: number };
    const checkout = await request("/api/commerce/customer/checkout", {
      body: {
        cartId: cart.id,
        cartVersion: cart.version,
        fulfillmentMethod: "CUSTOMER_PICKUP",
      },
      cookie: customerACookie,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(checkout.response.status, 201);
    const orderId = (checkout.body.data as { id: string }).id;
    const orderDetail = await request(`/api/commerce/customer/orders/${orderId}`, {
      cookie: customerACookie,
    });
    const expectedVersion = (orderDetail.body.data as { expectedVersion: string }).expectedVersion;
    const cancellationKey = randomUUID();

    const cancellation = await request(`/api/commerce/customer/orders/${orderId}/cancel`, {
      body: { expectedVersion, reason: "Changed plans" },
      cookie: customerACookie,
      headers: { "idempotency-key": cancellationKey },
      method: "POST",
    });
    assert.equal(cancellation.response.status, 200);
    const cancellationReplay = await request(`/api/commerce/customer/orders/${orderId}/cancel`, {
      body: { expectedVersion, reason: "Changed plans" },
      cookie: customerACookie,
      headers: { "idempotency-key": cancellationKey },
      method: "POST",
    });
    assert.equal(cancellationReplay.response.status, 200);
    assert.deepEqual(cancellationReplay.body, cancellation.body);
    assert.equal(await prisma.orderStatusHistory.count({ where: { orderId, newOrderStatus: "CANCELLED" } }), 1);
    const cancellationConflict = await request(`/api/commerce/customer/orders/${orderId}/cancel`, {
      body: { expectedVersion, reason: "Another attempt" },
      cookie: customerACookie,
      headers: { "idempotency-key": cancellationKey },
      method: "POST",
    });
    assert.equal(cancellationConflict.response.status, 409);
    assert.equal((cancellationConflict.body.error as { code: string }).code, "IDEMPOTENCY_CONFLICT");

    const [customerCreated, merchantNew, customerCancelled, merchantCustomerCancelled] = await Promise.all([
      prisma.notification.findUniqueOrThrow({
        where: { eventKey: `commerce:${orderId}:order.created:${fixture.customerA.person.id}` },
      }),
      prisma.notification.findUniqueOrThrow({
        where: { eventKey: `commerce:${orderId}:order.new:merchant:${fixture.customerA.person.id}` },
      }),
      prisma.notification.findUniqueOrThrow({
        where: { eventKey: `commerce:${orderId}:order.cancelled:${fixture.customerA.person.id}` },
      }),
      prisma.notification.findUniqueOrThrow({
        where: { eventKey: `commerce:${orderId}:order.customer_cancelled:merchant:${fixture.customerA.person.id}` },
      }),
    ]);

    const [legacyNotification, malformedMetadata, missingEventType, unknownEventType] = await Promise.all([
      prisma.notification.create({
        data: {
          audience: "USER",
          body: "Legacy booking notification body",
          recipientPersonId: fixture.customerA.person.id,
          title: "Legacy booking notification",
        },
      }),
      prisma.notification.create({
        data: {
          audience: "USER",
          body: "Malformed metadata body",
          eventKey: `commerce:${randomUUID()}:malformed:${fixture.customerA.person.id}`,
          metadata: "malformed",
          recipientPersonId: fixture.customerA.person.id,
          title: "Malformed metadata",
        },
      }),
      prisma.notification.create({
        data: {
          audience: "USER",
          body: "Missing event type body",
          eventKey: `commerce:${randomUUID()}:missing-event:${fixture.customerA.person.id}`,
          metadata: { destination: "/customer/notifications", orderId },
          recipientPersonId: fixture.customerA.person.id,
          title: "Missing event type",
        },
      }),
      prisma.notification.create({
        data: {
          audience: "USER",
          body: "Unknown event type body",
          eventKey: `commerce:${orderId}:order.future:${fixture.customerA.person.id}`,
          metadata: {
            destination: "/customer/notifications",
            eventType: "order.future",
            orderId,
          },
          recipientPersonId: fixture.customerA.person.id,
          title: "Unknown event type",
        },
      }),
    ]);

    const crossNotifications = await request("/api/commerce/customer/notifications", {
      cookie: customerBCookie,
    });
    assert.equal(crossNotifications.response.status, 200);
    assert.equal((crossNotifications.body.data as unknown[]).length, 0);

    const crossAdded = await request("/api/commerce/customer/cart/items", {
      body: { quantity: 1, variantId: fixture.catalogB.variant.id },
      cookie: customerBCookie,
      method: "POST",
    });
    const crossCart = crossAdded.body.data as { id: string; version: number };
    const crossCheckout = await request("/api/commerce/customer/checkout", {
      body: {
        cartId: crossCart.id,
        cartVersion: crossCart.version,
        fulfillmentMethod: "CUSTOMER_PICKUP",
      },
      cookie: customerBCookie,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(crossCheckout.response.status, 201);
    const crossOrderId = (crossCheckout.body.data as { id: string }).id;
    const crossOwnerNotification = await prisma.notification.create({
      data: {
        audience: "USER",
        body: "Cross-owner customer event body",
        eventKey: `commerce:${crossOrderId}:order.created:${fixture.customerA.person.id}`,
        metadata: {
          destination: "/customer/notifications",
          eventType: "order.created",
          orderId: crossOrderId,
        },
        recipientPersonId: fixture.customerA.person.id,
        title: "Cross-owner customer event",
      },
    });

    const customerEventTypes = [
      "order.confirmed",
      "order.preparing",
      "order.ready_for_pickup",
      "order.out_for_delivery",
      "order.delivered",
      "order.expired",
    ] as const;
    const additionalCustomerNotifications = await Promise.all(
      customerEventTypes.map((eventType, index) => prisma.notification.create({
        data: {
          audience: "USER",
          body: `Authorized customer pagination body ${index}`,
          eventKey: `commerce:${orderId}:${eventType}:${fixture.customerA.person.id}:pagination-${index}`,
          metadata: {
            destination: "/customer/notifications",
            eventType,
            orderId,
          },
          recipientPersonId: fixture.customerA.person.id,
          title: `Authorized customer pagination ${index}`,
        },
      })),
    );
    const additionalMerchantNotifications = await Promise.all(
      Array.from({ length: 18 }, (_, index) => prisma.notification.create({
        data: {
          audience: "USER",
          body: `Merchant-only pagination body ${index}`,
          eventKey: `commerce:${orderId}:order.new:${fixture.customerA.person.id}:pagination-${index}`,
          metadata: {
            destination: "/merchant/orders",
            eventType: "order.new",
            orderId,
          },
          recipientPersonId: fixture.customerA.person.id,
          title: `Merchant-only pagination ${index}`,
        },
      })),
    );
    const additionalCrossOwnerNotifications = await Promise.all(
      Array.from({ length: 7 }, (_, index) => prisma.notification.create({
        data: {
          audience: "USER",
          body: `Cross-owner pagination body ${index}`,
          eventKey: `commerce:${crossOrderId}:order.created:${fixture.customerA.person.id}:pagination-${index}`,
          metadata: {
            destination: "/customer/notifications",
            eventType: "order.created",
            orderId: crossOrderId,
          },
          recipientPersonId: fixture.customerA.person.id,
          title: `Cross-owner pagination ${index}`,
        },
      })),
    );
    const invalidOrderNotification = await prisma.notification.create({
      data: {
        audience: "USER",
        body: "Invalid Order pagination body",
        eventKey: `commerce:${randomUUID()}:order.created:${fixture.customerA.person.id}:invalid-order`,
        metadata: {
          destination: "/customer/notifications",
          eventType: "order.created",
          orderId: "not-a-uuid",
        },
        recipientPersonId: fixture.customerA.person.id,
        title: "Invalid Order pagination",
      },
    });

    const authorizedNotifications = [customerCreated, customerCancelled, ...additionalCustomerNotifications];
    const merchantNotifications = [merchantNew, merchantCustomerCancelled, ...additionalMerchantNotifications];
    const crossOwnerNotifications = [crossOwnerNotification, ...additionalCrossOwnerNotifications];
    const timestamp = Date.now();
    await Promise.all([
      prisma.notification.updateMany({
        data: { createdAt: new Date(timestamp - 20_000) },
        where: { id: { in: authorizedNotifications.slice(0, 4).map(({ id }) => id) } },
      }),
      prisma.notification.updateMany({
        data: { createdAt: new Date(timestamp - 60_000) },
        where: { id: { in: authorizedNotifications.slice(4).map(({ id }) => id) } },
      }),
      prisma.notification.updateMany({
        data: { createdAt: new Date(timestamp) },
        where: { id: { in: merchantNotifications.slice(0, 10).map(({ id }) => id) } },
      }),
      prisma.notification.updateMany({
        data: { createdAt: new Date(timestamp - 40_000) },
        where: { id: { in: merchantNotifications.slice(10).map(({ id }) => id) } },
      }),
      prisma.notification.updateMany({
        data: { createdAt: new Date(timestamp - 10_000) },
        where: { id: { in: crossOwnerNotifications.slice(0, 4).map(({ id }) => id) } },
      }),
      prisma.notification.updateMany({
        data: { createdAt: new Date(timestamp - 40_000) },
        where: { id: { in: crossOwnerNotifications.slice(4).map(({ id }) => id) } },
      }),
      prisma.notification.update({
        data: { createdAt: new Date(timestamp - 30_000) },
        where: { id: invalidOrderNotification.id },
      }),
    ]);
    const expectedAuthorized = await prisma.notification.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
      where: { id: { in: authorizedNotifications.map(({ id }) => id) } },
    });

    const unauthenticatedNotifications = await request("/api/commerce/customer/notifications?limit=5");
    assert.equal(unauthenticatedNotifications.response.status, 401);
    assert.equal((unauthenticatedNotifications.body.error as { code: string }).code, "UNAUTHENTICATED");

    const notifications = await request("/api/commerce/customer/notifications?limit=5", {
      cookie: customerACookie,
      headers: { "expo-origin": "rezno://" },
    });
    assert.equal(notifications.response.status, 200);
    const customerNotifications = notifications.body.data as Array<{
      body: string;
      id: string;
      orderId: string;
      title: string;
    }>;
    const firstPageInfo = notifications.body.pageInfo as { hasNextPage: boolean; nextCursor: string | null };
    assert.deepEqual(customerNotifications.map(({ id }) => id), expectedAuthorized.slice(0, 5).map(({ id }) => id));
    assert.equal(customerNotifications.length, 5);
    assert.equal(firstPageInfo.hasNextPage, true);
    assert.equal(typeof firstPageInfo.nextCursor, "string");

    const secondPageResponse = await request(
      `/api/commerce/customer/notifications?limit=5&cursor=${encodeURIComponent(firstPageInfo.nextCursor!)}`,
      { cookie: customerACookie, headers: { "expo-origin": "rezno://" } },
    );
    assert.equal(secondPageResponse.response.status, 200);
    const secondPage = secondPageResponse.body.data as typeof customerNotifications;
    const secondPageInfo = secondPageResponse.body.pageInfo as { hasNextPage: boolean; nextCursor: string | null };
    assert.deepEqual(secondPage.map(({ id }) => id), expectedAuthorized.slice(5).map(({ id }) => id));
    assert.equal(secondPage.length, 3);
    assert.equal(secondPageInfo.hasNextPage, false);
    assert.equal(secondPageInfo.nextCursor, null);

    const allCustomerNotifications = [...customerNotifications, ...secondPage];
    const returnedIds = new Set(allCustomerNotifications.map((item) => item.id));
    assert.equal(returnedIds.size, expectedAuthorized.length);
    assert.deepEqual([...returnedIds].sort(), expectedAuthorized.map(({ id }) => id).sort());
    for (const notification of [
      ...merchantNotifications,
      legacyNotification,
      malformedMetadata,
      missingEventType,
      unknownEventType,
      ...crossOwnerNotifications,
      invalidOrderNotification,
    ]) {
      assert.equal(returnedIds.has(notification.id), false);
    }
    assert.equal(allCustomerNotifications.find((item) => item.id === customerCreated.id)?.orderId, orderId);
    for (const notification of merchantNotifications) {
      assert.equal(allCustomerNotifications.some((item) => item.title === notification.title), false);
      assert.equal(allCustomerNotifications.some((item) => item.body === notification.body), false);
    }
    assert.deepEqual(
      Object.keys(allCustomerNotifications.find((item) => item.id === customerCreated.id)!).sort(),
      ["body", "createdAt", "id", "orderId", "priority", "title"],
    );

    const orders = await request("/api/commerce/customer/orders?limit=1&sort=newest", {
      cookie: customerACookie,
    });
    assert.equal(orders.response.status, 200);
    assert.equal((orders.body.data as unknown[]).length, 1);
    const mobileDetail = await request(`/api/commerce/customer/orders/${orderId}`, {
      cookie: customerACookie,
      headers: { "expo-origin": "rezno://" },
    });
    assert.equal(mobileDetail.response.status, 200);
    assert.equal((mobileDetail.body.data as { id: string }).id, orderId);
    const crossOrder = await request(`/api/commerce/customer/orders/${orderId}`, {
      cookie: customerBCookie,
    });
    assert.equal(crossOrder.response.status, 404);
    const invalidQuery = await request("/api/commerce/customer/orders?limit=bad", {
      cookie: customerACookie,
    });
    assert.equal(invalidQuery.response.status, 400);
    const invalidCursor = await request("/api/commerce/customer/orders?cursor=bad", {
      cookie: customerACookie,
    });
    assert.equal(invalidCursor.response.status, 400);
    assert.equal((invalidCursor.body.error as { code: string }).code, "INVALID_CURSOR");

    const storeFavorite = await request("/api/commerce/customer/favorites/stores", {
      body: { storeId: fixture.catalogA.store.id },
      cookie: customerACookie,
      method: "POST",
    });
    assert.equal(storeFavorite.response.status, 200);
    const productFavorite = await request("/api/commerce/customer/favorites/products", {
      body: { productId: fixture.catalogA.product.id },
      cookie: customerACookie,
      method: "POST",
    });
    assert.equal(productFavorite.response.status, 200);
    assert.equal((await request("/api/commerce/customer/favorites/stores", { cookie: customerACookie })).response.status, 200);
    assert.equal((await request("/api/commerce/customer/favorites/products", { cookie: customerACookie })).response.status, 200);
    const crossDelete = await request(`/api/commerce/customer/favorites/stores/${fixture.catalogA.store.id}`, {
      cookie: customerBCookie,
      method: "DELETE",
    });
    assert.equal(crossDelete.response.status, 404);
    assert.equal((crossDelete.body.error as { code: string }).code, "FAVORITE_NOT_FOUND");

    let limited: Awaited<ReturnType<typeof request>> | undefined;
    for (let index = 0; index < 11; index += 1) {
      limited = await request("/api/commerce/customer/orders/not-a-uuid/cancel", {
        body: { reason: "Invalid target" },
        cookie: customerBCookie,
        method: "POST",
      });
      if (index < 10) assert.equal(limited.response.status, 400);
    }
    assert.equal(limited!.response.status, 429);
    assert.equal((limited!.body.error as { code: string }).code, "RATE_LIMITED");
    assert.ok(Number(limited!.response.headers.get("retry-after")) >= 1);

    const orderCount = await prisma.order.count();
    const unsupported = await fetch(`${baseUrl}/api/commerce/customer/orders`, {
      headers: { cookie: customerACookie },
      method: "PUT",
    });
    assert.equal(unsupported.status, 405);
    assert.equal(await prisma.order.count(), orderCount);
  },
);
