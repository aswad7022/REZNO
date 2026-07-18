import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { CommercePermission } from "@prisma/client";
import type { AdminPermission } from "../../../features/admin/config/permissions";
import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.COMMERCE_HTTP_BASE_URL;

function decodeHtml(value: string) { return value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"); }
function attribute(element: string, name: string) { return decodeHtml(element.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? ""); }
function formParams(form: string) {
  const parameters = new URLSearchParams();
  for (const input of form.match(/<input\b[^>]*>/g) ?? []) {
    const name = attribute(input, "name");
    if (!name || /\sdisabled(?:=""|(?=\s|>))/.test(input)) continue;
    if (input.includes('type="checkbox"') && !input.includes(" checked")) continue;
    parameters.append(name, input.includes('type="checkbox"') ? attribute(input, "value") || "on" : attribute(input, "value"));
  }
  return parameters;
}
function findForm(html: string, expected: Record<string, string>) {
  const form = (html.match(/<form\b[\s\S]*?<\/form>/g) ?? []).find((candidate) => {
    const values = formParams(candidate);
    return Object.entries(expected).every(([key, value]) => values.get(key) === value);
  });
  assert.ok(form, `Expected Admin Commerce form ${JSON.stringify(expected)}`);
  return form;
}
async function get(path: string, cookie: string, rsc = false) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie, ...(rsc ? { accept: "text/x-component", rsc: "1" } : {}) }, redirect: "manual" });
  return { response, text: await response.text() };
}
async function submit(path: string, form: string, cookie: string, overrides: Record<string, string> = {}) {
  const parameters = formParams(form);
  for (const [key, value] of Object.entries(overrides)) parameters.set(key, value);
  const body = new FormData(); for (const [key, value] of parameters) body.append(key, value);
  const response = await fetch(`${baseUrl}${path}`, { body, headers: { cookie, origin: baseUrl!, referer: `${baseUrl}${path}` }, method: "POST", redirect: "manual" });
  assert.ok([200, 303].includes(response.status)); if (response.body) await response.body.cancel(); return response;
}
function routeText(value: string) { return value.replaceAll("\\/", "/"); }
function assertNoRawError(value: string) { assert.doesNotMatch(value, /PrismaClient|PostgreSQL|Invalid `prisma\.|DATABASE_URL|Authorization/i); }
function assertForbidden(value: string) { assert.match(value, /NEXT_HTTP_ERROR_FALLBACK;403/); assertNoRawError(value); }
function nextHref(html: string, cursorName = "cursor") {
  const href = decodeHtml(html.match(new RegExp(`href="([^"]*${cursorName}=[^"]+)"`))?.[1] ?? "");
  assert.ok(href, `Expected a ${cursorName} next-page link`);
  return href;
}
function assertSafeValidation(html: string) {
  assert.match(html, /role="alert"|VALIDATION_ERROR|INVALID_CURSOR|digest/);
  assertNoRawError(html);
}

async function signUp(label: string) {
  const nonce = randomUUID().slice(0, 8);
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      body: JSON.stringify({ email: `stage3d-http-${label}-${nonce}@rezno.invalid`, name: label, password: "password123" }),
      headers: { "content-type": "application/json", origin: baseUrl!, "user-agent": `stage3d-http-${label}-${nonce}` }, method: "POST",
    });
    if (response.status !== 429) break;
    const retryAfter = Math.min(30, Math.max(1, Number(response.headers.get("retry-after") ?? "30")));
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000 + 250));
  }
  assert.ok(response);
  assert.equal(response.status, 200);
  const payload = await response.json() as { user: { id: string } };
  const session = response.headers.getSetCookie().find((value) => value.includes("session_token=")); assert.ok(session);
  const person = await prisma.person.update({ where: { authUserId: payload.user.id }, data: { isOnboarded: true, phone: "+9647500033000", status: "ACTIVE" } });
  return { cookie: session.split(";")[0]!, person, userId: payload.user.id };
}
async function grant(userId: string, permissions: AdminPermission[]) { return prisma.adminAccess.create({ data: { permissions, userId } }); }
async function reset() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`; assert.match(rows[0]?.database ?? "", /(?:_test|test_)/);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE');
}

test("Gate 3D production HTML, RSC, Server Actions, and report routes enforce Admin boundaries", {
  concurrency: false,
  skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live Gate 3D tests",
}, async (t) => {
  await reset(); t.after(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); await reset(); await prisma.$disconnect(); });
  const [full, orders, catalogRead, merchant] = await Promise.all([signUp("full"), signUp("orders"), signUp("catalog-read"), signUp("merchant")]);
  await Promise.all([
    grant(full.userId, ["COMMERCE_STORES_VIEW", "COMMERCE_STORES_REVIEW", "COMMERCE_CATALOG_VIEW", "COMMERCE_CATALOG_MODERATE", "COMMERCE_INVENTORY_VIEW", "COMMERCE_INVENTORY_MANAGE", "COMMERCE_ORDERS_VIEW", "COMMERCE_ORDERS_MANAGE", "AUDIT_LOG_VIEW"]),
    grant(orders.userId, ["COMMERCE_ORDERS_VIEW", "AUDIT_LOG_VIEW"]),
    grant(catalogRead.userId, ["COMMERCE_CATALOG_VIEW"]),
  ]);
  const organization = await prisma.organization.create({ data: { name: "Stage 3D HTTP Org", slug: `stage3d-http-${randomUUID().slice(0, 8)}` } });
  const merchantPermissions: CommercePermission[] = ["STORE_VIEW", "PRODUCT_VIEW", "INVENTORY_VIEW", "ORDER_VIEW", "REPORTS_VIEW"];
  const role = await prisma.role.create({ data: { commercePermissions: merchantPermissions, isSystem: true, name: "Reports", organizationId: organization.id, systemRole: "MANAGER" } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, personId: merchant.person.id, roleId: role.id } });
  const store = await prisma.store.create({ data: { name: "HTTP Store", organizationId: organization.id, pickupArea: "Karrada", pickupCity: "Baghdad", pickupEnabled: true, pickupStreet: "HTTP", publishedAt: new Date(), slug: `http-store-${randomUUID().slice(0, 8)}`, status: "ACTIVE" } });
  const category = await prisma.marketplaceCategory.create({ data: { name: "HTTP Category", normalizedName: "http category", slug: `http-category-${randomUUID().slice(0, 8)}` } });
  const product = await prisma.product.create({ data: { categoryId: category.id, name: "HTTP Product", normalizedSearchText: "http product", publishedAt: new Date(), slug: "http-product", status: "PUBLISHED", storeId: store.id } });
  const variant = await prisma.productVariant.create({ data: { inventory: { create: { onHand: 5 } }, isDefault: true, optionKey: "default", optionValues: {}, price: "10000", productId: product.id, sku: "HTTP-STAGE3D", storeId: store.id, title: "Default" }, include: { inventory: true } });
  const customer = await prisma.person.create({ data: { authUserId: `customer-${randomUUID()}`, firstName: "PRIVATE-CUSTOMER-NAME", isOnboarded: true, phone: "+9647999999999" } });
  const order = await prisma.order.create({ data: { currency: "IQD", customerId: customer.id, customerInstructions: "PRIVATE-ORDER-INSTRUCTIONS", customerNameSnapshot: "PRIVATE-CUSTOMER-NAME", customerPhoneSnapshot: "+9647999999999", fulfillmentMethod: "CUSTOMER_PICKUP", grandTotal: "10000", orderNumber: `RZ-HTTP-${randomUUID().slice(0, 8)}`, paymentMethod: "PAY_AT_PICKUP", reservationExpiresAt: new Date(Date.now() + 60_000), storeId: store.id, storeNameSnapshot: store.name, storeSlugSnapshot: store.slug, subtotal: "10000" } });
  await prisma.payment.create({ data: { amount: "10000", method: "PAY_AT_PICKUP", orderId: order.id } });
  void variant;

  await t.test("any-Commerce navigation and capability-aware hub structurally omit inaccessible domains", async () => {
    for (const rsc of [false, true]) {
      const ordersAdmin = await get("/admin/commerce", orders.cookie, rsc);
      assert.equal(ordersAdmin.response.status, 200);
      const text = routeText(ordersAdmin.text);
      assert.match(text, /\/admin\/commerce\/orders/);
      assert.equal(text.includes("/admin/commerce/stores"), false);
      assert.equal(text.includes("/admin/commerce/categories"), false);
      assertForbidden((await get("/admin/commerce/stores", orders.cookie, rsc)).text);
    }
  });

  await t.test("Admin lists redact customer PII while details and mutation controls remain permission-specific", async () => {
    const list = await get("/admin/commerce/orders", full.cookie); assert.equal(list.response.status, 200);
    assert.match(list.text, new RegExp(order.orderNumber));
    assert.doesNotMatch(list.text, /PRIVATE-CUSTOMER-NAME|PRIVATE-ORDER-INSTRUCTIONS|\+9647999999999/);
    const readDetail = await get(`/admin/commerce/products/${product.id}`, catalogRead.cookie);
    assert.doesNotMatch(readDetail.text, /name="expectedVersion"|name="idempotencyKey"|name="action"/);
    const fullDetail = await get(`/admin/commerce/products/${product.id}`, full.cookie);
    const form = findForm(fullDetail.text, { action: "suspend", productId: product.id });
    await submit(`/admin/commerce/products/${product.id}`, form, catalogRead.cookie, { reason: "Permission boundary check" });
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status, "PUBLISHED");
    await submit(`/admin/commerce/products/${product.id}`, form, full.cookie, { reason: "Verified unsafe catalog claim" });
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status, "SUSPENDED");
  });

  await t.test("Merchant reports are reachable only with REPORTS_VIEW and expose no financial/customer fields", async () => {
    const cookie = `${merchant.cookie}; rezno-active-business-id=${organization.id}`;
    const response = await get("/business/commerce/reports", cookie); assert.equal(response.response.status, 200);
    assertNoRawError(response.text);
    assert.doesNotMatch(response.text, /PRIVATE-CUSTOMER-NAME|PRIVATE-ORDER-INSTRUCTIONS|\+9647999999999/);
  });

  await t.test("invalid complete-ISO filters fail visibly without raw infrastructure errors", async () => {
    const response = await get("/admin/commerce/audit?from=2026-07-17", full.cookie);
    assertNoRawError(response.text);
    assert.equal(response.response.status, 200);
    assert.match(response.text, /VALIDATION_ERROR|complete ISO-8601|digest/);
  });

  await t.test("Admin filtered list and detail-history pagination preserves filters and Commerce audit scope", async () => {
    const nonce = randomUUID().slice(0, 8);
    const expectedCategories = [];
    for (let index = 0; index < 21; index += 1) {
      expectedCategories.push(await prisma.marketplaceCategory.create({ data: {
        name: `HTTP Page Category ${nonce} ${index}`,
        normalizedName: `http page category ${nonce} ${index}`,
        slug: `http-page-category-${nonce}-${index}`,
        status: "INACTIVE",
      } }));
    }
    await prisma.marketplaceCategory.create({ data: {
      name: `HTTP Page Category ${nonce} excluded`, normalizedName: `http page category ${nonce} excluded`,
      slug: `http-page-category-${nonce}-excluded`, status: "ACTIVE",
    } });

    const expectedProducts = [];
    const expectedInventory = [];
    for (let index = 0; index < 21; index += 1) {
      const pagedProduct = await prisma.product.create({ data: {
        categoryId: category.id,
        name: `HTTP Page Product ${nonce} ${index}`,
        normalizedSearchText: `http page product ${nonce} ${index}`,
        slug: `http-page-product-${nonce}-${index}`,
        status: "DRAFT",
        storeId: store.id,
      } });
      expectedProducts.push(pagedProduct);
      const pagedVariant = await prisma.productVariant.create({ data: {
        currency: "IQD", isDefault: true, optionKey: `http-page-${index}`, optionValues: {}, price: "10000",
        productId: pagedProduct.id, sku: `HTTP-PAGE-${nonce}-${index}`, storeId: store.id, title: `Page ${index}`,
      } });
      expectedInventory.push(await prisma.inventoryItem.create({ data: { onHand: 5, reserved: 1, variantId: pagedVariant.id } }));
    }

    const expectedOrders = [];
    for (let index = 0; index < 21; index += 1) {
      expectedOrders.push(await prisma.order.create({ data: {
        currency: "IQD", customerId: customer.id, customerNameSnapshot: `HTTP Page Customer ${index}`,
        customerPhoneSnapshot: "+9647999999999", fulfillmentMethod: "CUSTOMER_PICKUP", grandTotal: "10000",
        orderNumber: `RZ-HTTP-PAGE-${nonce}-${index}`, paymentMethod: "PAY_AT_PICKUP",
        reservationExpiresAt: new Date("2035-01-01T00:00:00.000Z"), storeId: store.id,
        storeNameSnapshot: store.name, storeSlugSnapshot: store.slug, subtotal: "10000",
      } }));
    }

    const categoryQuery = new URLSearchParams({ q: nonce, status: "INACTIVE" });
    const categoryFirst = await get(`/admin/commerce/categories?${categoryQuery}`, full.cookie);
    const categoryNext = new URL(nextHref(categoryFirst.text), baseUrl);
    assert.equal(categoryNext.searchParams.get("q"), nonce);
    assert.equal(categoryNext.searchParams.get("status"), "INACTIVE");
    const categorySecond = await get(`${categoryNext.pathname}${categoryNext.search}`, full.cookie);
    assert.equal(categorySecond.response.status, 200);
    assert.match(categorySecond.text, new RegExp(expectedCategories[0]!.name));
    assert.doesNotMatch(categorySecond.text, /excluded/);

    const productQuery = new URLSearchParams({ q: nonce, status: "DRAFT", storeStatus: "ACTIVE" });
    const productFirst = await get(`/admin/commerce/products?${productQuery}`, full.cookie);
    const productNext = new URL(nextHref(productFirst.text), baseUrl);
    for (const key of ["q", "status", "storeStatus"]) assert.equal(productNext.searchParams.get(key), productQuery.get(key));
    const productSecond = await get(`${productNext.pathname}${productNext.search}`, full.cookie);
    assert.equal(productSecond.response.status, 200);
    assert.match(productSecond.text, new RegExp(expectedProducts[0]!.name));

    const inventoryQuery = new URLSearchParams({ availability: "in_stock", q: nonce, reserved: "true" });
    const inventoryFirst = await get(`/admin/commerce/inventory?${inventoryQuery}`, full.cookie);
    const inventoryNext = new URL(nextHref(inventoryFirst.text), baseUrl);
    for (const key of ["availability", "q", "reserved"]) assert.equal(inventoryNext.searchParams.get(key), inventoryQuery.get(key));
    const inventorySecond = await get(`${inventoryNext.pathname}${inventoryNext.search}`, full.cookie);
    assert.equal(inventorySecond.response.status, 200);
    assert.match(inventorySecond.text, new RegExp(`HTTP-PAGE-${nonce}-0`));

    const orderQuery = new URLSearchParams({
      fulfillment: "UNFULFILLED", organizationId: organization.id, overdue: "false", q: `RZ-HTTP-PAGE-${nonce}`,
      status: "PENDING", storeId: store.id,
    });
    const orderFirst = await get(`/admin/commerce/orders?${orderQuery}`, full.cookie);
    const orderEvaluation = orderFirst.text.match(/عند ([0-9T:.\-]+Z)/)?.[1];
    assert.ok(orderEvaluation);
    const orderNext = new URL(nextHref(orderFirst.text), baseUrl);
    for (const key of ["fulfillment", "organizationId", "overdue", "q", "status", "storeId"]) {
      assert.equal(orderNext.searchParams.get(key), orderQuery.get(key));
    }
    const orderSecond = await get(`${orderNext.pathname}${orderNext.search}`, full.cookie);
    assert.equal(orderSecond.response.status, 200);
    assert.match(orderSecond.text, new RegExp(expectedOrders[0]!.orderNumber));
    assert.match(orderSecond.text, new RegExp(orderEvaluation));
    assert.doesNotMatch(orderSecond.text, /· متأخر/);
    const changedOrder = new URL(orderNext);
    changedOrder.searchParams.set("overdue", "true");
    assertSafeValidation((await get(`${changedOrder.pathname}${changedOrder.search}`, full.cookie)).text);

    for (const path of [
      `/admin/commerce/categories?q=${nonce}&q=duplicate`,
      "/admin/commerce/products?status=INVALID",
      "/admin/commerce/inventory?lowStock=maybe",
      "/admin/commerce/orders?overdue=maybe",
      "/admin/commerce/audit?action=admin.user.update",
    ]) assertSafeValidation((await get(path, full.cookie)).text);

    const auditRows = [];
    for (let index = 0; index < 35; index += 1) {
      auditRows.push(await prisma.adminAuditLog.create({ data: {
        action: `commerce.http-pagination.${nonce}`, adminUserId: full.userId,
        metadata: { authorization: "PRIVATE-AUDIT-TOKEN", safe: `http-${index}` },
        targetId: product.id, targetType: "Product",
      } }));
    }
    await prisma.adminAuditLog.create({ data: {
      action: `admin.http-pagination.${nonce}`, adminUserId: full.userId,
      metadata: { sentinel: "NON-COMMERCE-SENTINEL" }, targetId: product.id, targetType: "Product",
    } });
    const auditQuery = new URLSearchParams({ action: `commerce.http-pagination.${nonce}`, targetId: product.id, targetType: "Product" });
    const auditFirst = await get(`/admin/commerce/audit?${auditQuery}`, full.cookie);
    const auditNext = new URL(nextHref(auditFirst.text), baseUrl);
    for (const key of ["action", "targetId", "targetType"]) assert.equal(auditNext.searchParams.get(key), auditQuery.get(key));
    assert.doesNotMatch(auditFirst.text, /NON-COMMERCE-SENTINEL|PRIVATE-AUDIT-TOKEN/);
    const auditSecond = await get(`${auditNext.pathname}${auditNext.search}`, full.cookie);
    assert.equal(auditSecond.response.status, 200);
    assert.doesNotMatch(auditSecond.text, /NON-COMMERCE-SENTINEL|PRIVATE-AUDIT-TOKEN/);
    assert.match(auditSecond.text, new RegExp(auditRows[0]!.id));
    assertSafeValidation((await get(`${auditNext.pathname}${auditNext.search}`, orders.cookie)).text);

    const movementTarget = expectedInventory[0]!;
    for (let index = 0; index < 21; index += 1) {
      await prisma.stockMovement.create({ data: {
        actorType: "ADMIN", idempotencyKey: randomUUID(), inventoryItemId: movementTarget.id,
        metadata: { private: "PRIVATE-MOVEMENT-METADATA" }, onHandDelta: 1, quantity: 1,
        reason: `HTTP movement ${nonce} ${index}`, reservedDelta: 0, resultingOnHand: 6,
        resultingReserved: 1, type: "ADJUSTMENT_IN",
      } });
    }
    const movementFirst = await get(`/admin/commerce/inventory/${movementTarget.id}`, full.cookie);
    const movementNext = new URL(nextHref(movementFirst.text), baseUrl);
    assert.equal(movementNext.pathname, `/admin/commerce/inventory/${movementTarget.id}`);
    const movementSecond = await get(`${movementNext.pathname}${movementNext.search}`, full.cookie);
    assert.equal(movementSecond.response.status, 200);
    assert.doesNotMatch(movementSecond.text, /PRIVATE-MOVEMENT-METADATA|\+9647999999999/);
    const crossTarget = await get(`/admin/commerce/inventory/${expectedInventory[1]!.id}?${movementNext.searchParams}`, full.cookie);
    assertSafeValidation(crossTarget.text);

    for (let index = 0; index < 21; index += 1) {
      await prisma.adminAuditLog.create({ data: {
        action: `commerce.store.http-history-${nonce}`, adminUserId: full.userId,
        targetId: store.id, targetType: "Store",
      } });
    }
    const storeFirst = await get(`/admin/commerce/stores/${store.id}`, full.cookie);
    const storeNext = new URL(nextHref(storeFirst.text, "auditCursor"), baseUrl);
    assert.equal(storeNext.pathname, `/admin/commerce/stores/${store.id}`);
    assert.equal((await get(`${storeNext.pathname}${storeNext.search}`, full.cookie)).response.status, 200);

    for (const rsc of [true]) {
      for (const path of [
        `/admin/commerce/categories?${categoryQuery}`,
        `/admin/commerce/products?${productQuery}`,
        `/admin/commerce/inventory?${inventoryQuery}`,
        `/admin/commerce/orders?${orderQuery}`,
        `/admin/commerce/audit?${auditQuery}`,
      ]) {
        const response = await get(path, full.cookie, rsc);
        assert.equal(response.response.status, 200);
        assertNoRawError(response.text);
      }
    }
  });
});
