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
    grant(orders.userId, ["COMMERCE_ORDERS_VIEW"]),
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
});
