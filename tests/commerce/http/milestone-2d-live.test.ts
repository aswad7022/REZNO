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

    const cancellation = await request(`/api/commerce/customer/orders/${orderId}/cancel`, {
      body: { reason: "Changed plans" },
      cookie: customerACookie,
      method: "POST",
    });
    assert.equal(cancellation.response.status, 200);
    const cancellationReplay = await request(`/api/commerce/customer/orders/${orderId}/cancel`, {
      body: { reason: "Changed plans" },
      cookie: customerACookie,
      method: "POST",
    });
    assert.equal(cancellationReplay.response.status, 409);
    assert.equal((cancellationReplay.body.error as { code: string }).code, "ORDER_NOT_CANCELLABLE");
    assert.equal(await prisma.orderStatusHistory.count({ where: { orderId, newOrderStatus: "CANCELLED" } }), 1);
    const cancellationConflict = await request(`/api/commerce/customer/orders/${orderId}/cancel`, {
      body: { reason: "Another attempt" },
      cookie: customerACookie,
      method: "POST",
    });
    assert.equal(cancellationConflict.response.status, 409);
    assert.equal((cancellationConflict.body.error as { code: string }).code, "ORDER_NOT_CANCELLABLE");

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
