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
  const setCookies = response.headers.getSetCookie();
  const sessionCookie = setCookies.find((value) => value.includes("session_token="));
  assert.ok(sessionCookie);
  return sessionCookie.split(";")[0]!;
}

async function commerceRequest(
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
  "Milestone 2C authenticated routes use real Better Auth session transport",
  { concurrency: false, skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live route tests" },
  async (t) => {
    await resetMilestone2cTestData();
    t.after(async () => {
      await resetMilestone2cTestData();
      await prisma.$disconnect();
    });
    const suffix = randomUUID().slice(0, 8);
    const emails = {
      customerAEmail: `http-customer-a-${suffix}@rezno.invalid`,
      customerBEmail: `http-customer-b-${suffix}@rezno.invalid`,
      merchantEmail: `http-merchant-${suffix}@rezno.invalid`,
      merchantNoPermissionEmail: `http-customer-b-${suffix}@rezno.invalid`,
    };
    const customerACookie = await signUp(emails.customerAEmail);
    const customerBCookie = await signUp(emails.customerBEmail);
    const merchantCookie = await signUp(emails.merchantEmail);
    const noPermissionCookie = customerBCookie;
    const fixture = await prepareMilestone2cHttpFixture(emails);

    const unauthenticated = await commerceRequest("/api/commerce/customer/cart");
    assert.equal(unauthenticated.response.status, 401);
    assert.equal((unauthenticated.body.error as { code: string }).code, "UNAUTHENTICATED");

    const emptyCart = await commerceRequest("/api/commerce/customer/cart", { cookie: customerACookie });
    assert.equal(emptyCart.response.status, 200);
    assert.equal(emptyCart.body.data, null);
    assert.equal(await prisma.cart.count({ where: { customerId: fixture.customerA.person.id } }), 0);

    const address = await commerceRequest("/api/commerce/customer/addresses", {
      body: {
        additionalDetails: "Floor 2",
        area: "Karrada",
        city: "Baghdad",
        phone: "+9647500000000",
        recipientName: "HTTP Customer",
        street: "HTTP Street",
      },
      cookie: customerACookie,
      method: "POST",
    });
    assert.equal(address.response.status, 201);
    const addressId = (address.body.data as { id: string }).id;
    const mobileCompatible = await commerceRequest("/api/commerce/customer/addresses", {
      cookie: customerACookie,
      headers: { "expo-origin": "rezno://" },
    });
    assert.equal(mobileCompatible.response.status, 200);
    assert.equal((mobileCompatible.body.data as unknown[]).length, 1);

    const crossAddress = await commerceRequest(`/api/commerce/customer/addresses/${addressId}`, {
      body: { street: "Cross owner" },
      cookie: customerBCookie,
      method: "PATCH",
    });
    assert.equal(crossAddress.response.status, 404);
    assert.equal((crossAddress.body.error as { code: string }).code, "NOT_FOUND");
    const deletedAddress = await commerceRequest(`/api/commerce/customer/addresses/${addressId}`, {
      cookie: customerACookie,
      method: "DELETE",
    });
    assert.equal(deletedAddress.response.status, 200);
    assert.deepEqual(deletedAddress.body.data, { deleted: true, id: addressId });

    const added = await commerceRequest("/api/commerce/customer/cart/items", {
      body: { quantity: 1, variantId: fixture.catalogA.variant.id },
      cookie: customerACookie,
      method: "POST",
    });
    assert.equal(added.response.status, 200);
    const cart = added.body.data as { id: string; version: number };
    const conflict = await commerceRequest("/api/commerce/customer/cart/items", {
      body: { cartVersion: cart.version, quantity: 1, variantId: fixture.catalogB.variant.id },
      cookie: customerACookie,
      method: "POST",
    });
    assert.equal(conflict.response.status, 409);
    assert.equal((conflict.body.error as { code: string }).code, "CART_STORE_CONFLICT");

    const checkoutKey = randomUUID();
    const checkout = await commerceRequest("/api/commerce/customer/checkout", {
      body: {
        cartId: cart.id,
        cartVersion: cart.version,
        customerInstructions: "HTTP pickup",
        fulfillmentMethod: "CUSTOMER_PICKUP",
      },
      cookie: customerACookie,
      headers: { "idempotency-key": checkoutKey },
      method: "POST",
    });
    assert.equal(checkout.response.status, 201);
    const orderId = (checkout.body.data as { id: string }).id;
    const replay = await commerceRequest("/api/commerce/customer/checkout", {
      body: {
        cartId: cart.id,
        cartVersion: cart.version,
        customerInstructions: "HTTP pickup",
        fulfillmentMethod: "CUSTOMER_PICKUP",
      },
      cookie: customerACookie,
      headers: { "idempotency-key": checkoutKey },
      method: "POST",
    });
    assert.equal(replay.response.status, 201);
    assert.equal((replay.body.data as { id: string }).id, orderId);
    const replayConflict = await commerceRequest("/api/commerce/customer/checkout", {
      body: {
        cartId: cart.id,
        cartVersion: cart.version,
        customerInstructions: "Different request",
        fulfillmentMethod: "CUSTOMER_PICKUP",
      },
      cookie: customerACookie,
      headers: { "idempotency-key": checkoutKey },
      method: "POST",
    });
    assert.equal(replayConflict.response.status, 409);
    assert.equal((replayConflict.body.error as { code: string }).code, "IDEMPOTENCY_CONFLICT");

    const limitedAdded = await commerceRequest("/api/commerce/customer/cart/items", {
      body: { quantity: 1, variantId: fixture.catalogB.variant.id },
      cookie: customerBCookie,
      method: "POST",
    });
    assert.equal(limitedAdded.response.status, 200);
    const limitedCart = limitedAdded.body.data as { id: string; version: number };
    await prisma.store.update({
      where: { id: fixture.catalogB.store.id },
      data: { minimumOrderValue: "50000" },
    });
    const minimumOrder = await commerceRequest("/api/commerce/customer/checkout", {
      body: {
        cartId: limitedCart.id,
        cartVersion: limitedCart.version,
        fulfillmentMethod: "CUSTOMER_PICKUP",
      },
      cookie: customerBCookie,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(minimumOrder.response.status, 409);
    assert.equal((minimumOrder.body.error as { code: string }).code, "MINIMUM_ORDER_NOT_MET");
    await prisma.store.update({
      where: { id: fixture.catalogB.store.id },
      data: { minimumOrderValue: "0" },
    });
    await prisma.inventoryItem.update({
      where: { id: fixture.catalogB.inventory.id },
      data: { onHand: 0 },
    });
    const insufficientStock = await commerceRequest("/api/commerce/customer/checkout", {
      body: {
        cartId: limitedCart.id,
        cartVersion: limitedCart.version,
        fulfillmentMethod: "CUSTOMER_PICKUP",
      },
      cookie: customerBCookie,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(insufficientStock.response.status, 409);
    assert.equal((insufficientStock.body.error as { code: string }).code, "INSUFFICIENT_STOCK");

    const forbiddenInventory = await commerceRequest("/api/commerce/merchant/inventory", {
      cookie: noPermissionCookie,
    });
    assert.equal(forbiddenInventory.response.status, 403);
    assert.equal((forbiddenInventory.body.error as { code: string }).code, "FORBIDDEN");
    const inventoryList = await commerceRequest("/api/commerce/merchant/inventory", {
      cookie: merchantCookie,
    });
    assert.equal(inventoryList.response.status, 200);
    assert.equal((inventoryList.body.data as unknown[]).length, 1);
    const currentInventory = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: fixture.catalogA.inventory.id },
    });
    const adjustmentKey = randomUUID();
    const adjustment = await commerceRequest(
      `/api/commerce/merchant/inventory/${fixture.catalogA.inventory.id}/adjustments`,
      {
        body: { delta: 2, expectedVersion: currentInventory.version, operationKey: adjustmentKey, reason: "HTTP stock correction" },
        cookie: merchantCookie,
        method: "POST",
      },
    );
    assert.equal(adjustment.response.status, 200);
    const adjustmentReplay = await commerceRequest(
      `/api/commerce/merchant/inventory/${fixture.catalogA.inventory.id}/adjustments`,
      {
        body: { delta: 2, expectedVersion: currentInventory.version, operationKey: adjustmentKey, reason: "HTTP stock correction" },
        cookie: merchantCookie,
        method: "POST",
      },
    );
    assert.equal(adjustmentReplay.response.status, 200);
    const adjustmentConflict = await commerceRequest(
      `/api/commerce/merchant/inventory/${fixture.catalogA.inventory.id}/adjustments`,
      {
        body: { delta: 3, expectedVersion: currentInventory.version, operationKey: adjustmentKey, reason: "HTTP stock correction" },
        cookie: merchantCookie,
        method: "POST",
      },
    );
    assert.equal(adjustmentConflict.response.status, 409);
    assert.equal((adjustmentConflict.body.error as { code: string }).code, "INVENTORY_CONFLICT");

    let rateLimited: Awaited<ReturnType<typeof commerceRequest>> | undefined;
    for (let index = 0; index < 31; index += 1) {
      rateLimited = await commerceRequest("/api/commerce/customer/cart/replace", {
        body: {},
        cookie: customerBCookie,
        method: "POST",
      });
      if (index < 30) assert.equal(rateLimited.response.status, 400);
    }
    assert.equal(rateLimited!.response.status, 429);
    assert.equal((rateLimited!.body.error as { code: string }).code, "RATE_LIMITED");
    assert.ok(Number(rateLimited!.response.headers.get("retry-after")) >= 1);

    const ordersBefore = await prisma.order.count();
    const unsupported = await fetch(`${baseUrl}/api/commerce/customer/cart`, {
      headers: { cookie: customerACookie },
      method: "PUT",
    });
    assert.equal(unsupported.status, 405);
    assert.equal(await prisma.order.count(), ordersBefore);
  },
);
