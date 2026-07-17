import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { CommercePermission, SystemRole } from "@prisma/client";

import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../../features/identity/policies/authorization";
import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.COMMERCE_HTTP_BASE_URL;

function decodeHtml(value: string) {
  return value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}
function attribute(element: string, name: string) { return decodeHtml(element.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? ""); }
function formParams(form: string) {
  const parameters = new URLSearchParams();
  for (const input of form.match(/<input\b[^>]*>/g) ?? []) {
    const name = attribute(input, "name");
    if (!name || /\sdisabled(?:=""|(?=\s|>))/.test(input)) continue;
    if (input.includes('type="checkbox"') && !input.includes(" checked")) continue;
    parameters.append(name, input.includes('type="checkbox"') ? attribute(input, "value") || "on" : attribute(input, "value"));
  }
  for (const textarea of form.match(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g) ?? []) {
    const name = attribute(textarea, "name");
    if (name) parameters.append(name, decodeHtml(textarea.replace(/^<textarea\b[^>]*>/, "").replace(/<\/textarea>$/, "")));
  }
  return parameters;
}
function findForm(html: string, expected: Record<string, string>) {
  const form = (html.match(/<form\b[\s\S]*?<\/form>/g) ?? []).find((candidate) => {
    const values = formParams(candidate);
    return Object.entries(expected).every(([key, value]) => values.get(key) === value);
  });
  assert.ok(form, `Expected Order form ${JSON.stringify(expected)}`);
  return form;
}
async function submit(path: string, form: string, cookie: string) {
  const body = new FormData();
  for (const [key, value] of formParams(form)) body.append(key, value);
  const response = await fetch(`${baseUrl}${path}`, {
    body,
    headers: { cookie, origin: baseUrl!, referer: `${baseUrl}${path}` },
    method: "POST",
    redirect: "manual",
  });
  assert.ok([200, 303].includes(response.status), `Unexpected Server Action status ${response.status}`);
  if (response.body) await response.body.cancel();
  return response;
}
async function get(path: string, cookie: string, rsc = false) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie, ...(rsc ? { accept: "text/x-component", rsc: "1" } : {}) },
    redirect: "manual",
  });
  return { response, text: await response.text() };
}
function routeText(value: string) { return value.replaceAll("\\/", "/"); }
function assertForbidden(value: string) {
  assert.match(value, /NEXT_HTTP_ERROR_FALLBACK;403/);
  assert.doesNotMatch(value, /PrismaClient|PostgreSQL|Invalid `prisma\./);
}
async function signUp(label: string) {
  const nonce = randomUUID().slice(0, 8);
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      body: JSON.stringify({ email: `stage3c-http-${label}-${nonce}@rezno.invalid`, name: label, password: "password123" }),
      headers: { "content-type": "application/json", origin: baseUrl!, "user-agent": `stage3c-http-${label}-${nonce}` },
      method: "POST",
    });
    if (response.status !== 429) break;
    const retryAfter = Math.min(30, Math.max(1, Number(response.headers.get("retry-after") ?? "30")));
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000 + 250));
  }
  assert.ok(response);
  assert.equal(response.status, 200);
  const payload = await response.json() as { user: { id: string } };
  const session = response.headers.getSetCookie().find((item) => item.includes("session_token="));
  assert.ok(session);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id },
    data: { isOnboarded: true, phone: "+9647500000310", status: "ACTIVE" },
  });
  return { cookie: session.split(";")[0]!, person };
}
async function membership(organizationId: string, personId: string, label: string, systemRole: SystemRole, permissions: CommercePermission[]) {
  const role = await prisma.role.create({ data: { commercePermissions: permissions, isSystem: true, name: label, organizationId, systemRole } });
  return prisma.organizationMember.create({ data: { organizationId, personId, roleId: role.id } });
}
function activeCookie(cookie: string, organizationId: string) { return `${cookie}; rezno-active-business-id=${organizationId}`; }
async function reset() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.match(rows[0]?.database ?? "", /(?:_test|test_)/);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE');
}

test("Gate 3C production HTML, RSC, Server Actions, and customer API enforce Order boundaries", {
  concurrency: false,
  skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live Gate 3C tests",
}, async (t) => {
  await reset();
  t.after(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); await reset(); await prisma.$disconnect(); });
  const ownerSession = await signUp("owner");
  const staffSession = await signUp("staff");
  const viewSession = await signUp("view");
  const receptionistSession = await signUp("receptionist");
  const customerSession = await signUp("customer");
  const organization = await prisma.organization.create({ data: { name: "Stage 3C HTTP", slug: `stage3c-http-${randomUUID().slice(0, 8)}` } });
  await Promise.all([
    membership(organization.id, ownerSession.person.id, "Owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    membership(organization.id, staffSession.person.id, "Staff", "STAFF", ["ORDER_VIEW", "ORDER_MANAGE"]),
    membership(organization.id, viewSession.person.id, "View", "MANAGER", ["ORDER_VIEW"]),
    membership(organization.id, receptionistSession.person.id, "Receptionist", "RECEPTIONIST", ["ORDER_VIEW", "ORDER_MANAGE"]),
  ]);
  const store = await prisma.store.create({ data: {
    deliveryArea: "Karrada", deliveryCity: "Baghdad", deliveryEnabled: true, deliveryEstimateMinutes: 30,
    deliveryFee: "1000", minimumOrderValue: "0", name: "Stage 3C HTTP Store", organizationId: organization.id,
    pickupArea: "Karrada", pickupCity: "Baghdad", pickupEnabled: true, pickupStreet: "HTTP Street",
    preparationEstimateMinutes: 15, publishedAt: new Date(), slug: `stage3c-http-store-${randomUUID().slice(0, 8)}`,
    status: "ACTIVE", supportPhone: "+9647500000311",
  } });
  const category = await prisma.marketplaceCategory.create({ data: { name: "HTTP Stage 3C", normalizedName: "http stage 3c", slug: `http-stage3c-${randomUUID()}` } });
  const product = await prisma.product.create({ data: {
    categoryId: category.id, description: "HTTP Product", name: "HTTP Product", normalizedSearchText: "http product",
    publishedAt: new Date(), slug: "http-product", status: "PUBLISHED", storeId: store.id,
  } });
  const variant = await prisma.productVariant.create({ data: {
    inventory: { create: { onHand: 20, reserved: 0 } }, isDefault: true, optionKey: "default", optionValues: {},
    price: "10000", productId: product.id, sku: "HTTP-STAGE3C", storeId: store.id, title: "Default",
  }, include: { inventory: true } });
  const cookies = {
    owner: activeCookie(ownerSession.cookie, organization.id),
    receptionist: activeCookie(receptionistSession.cookie, organization.id),
    staff: activeCookie(staffSession.cookie, organization.id),
    view: activeCookie(viewSession.cookie, organization.id),
  };

  async function pending(label: string, customerId = customerSession.person.id) {
    const order = await prisma.order.create({ data: {
      currency: "IQD", customerId, customerInstructions: `${label}-PRIVATE-INSTRUCTION`, customerNameSnapshot: `${label} Customer`,
      customerPhoneSnapshot: "+9647500000399", fulfillmentMethod: "CUSTOMER_PICKUP", grandTotal: "10000",
      orderNumber: `RZ-HTTP-${label}-${randomUUID().slice(0, 8)}`, paymentMethod: "PAY_AT_PICKUP",
      pickupAddressSnapshot: "HTTP Street", reservationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      storeId: store.id, storeNameSnapshot: store.name, storePhoneSnapshot: store.supportPhone,
      storeSlugSnapshot: store.slug, subtotal: "10000",
    } });
    const item = await prisma.orderItem.create({ data: {
      currency: "IQD", imageUrlSnapshot: "javascript:UNSAFE-ORDER-IMAGE", lineSubtotal: "10000", lineTotal: "10000",
      optionValuesSnapshot: {}, orderId: order.id, productId: product.id, productNameSnapshot: "HTTP Product",
      productVariantId: variant.id, quantity: 1, skuSnapshot: variant.sku, unitPrice: "10000", variantTitleSnapshot: "Default",
    } });
    await prisma.payment.create({ data: { amount: "10000", currency: "IQD", method: "PAY_AT_PICKUP", orderId: order.id } });
    await prisma.inventoryItem.update({ where: { id: variant.inventory!.id }, data: { reserved: { increment: 1 } } });
    await prisma.inventoryReservation.create({ data: {
      deterministicKey: `http:${order.id}`, expiresAt: order.reservationExpiresAt, inventoryItemId: variant.inventory!.id,
      orderId: order.id, orderItemId: item.id, productVariantId: variant.id, quantity: 1,
    } });
    return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  }

  const order = await pending("FLOW");

  await t.test("HTML and RSC navigation, list PII, detail actions, and direct-route denial are structural", async () => {
    for (const rsc of [false, true]) {
      const ownerHome = await get("/business", cookies.owner, rsc);
      if (!rsc) assert.match(routeText(ownerHome.text), /\/business\/commerce\/orders/);
      const receptionistHome = await get("/business", cookies.receptionist, rsc);
      assert.equal(routeText(receptionistHome.text).includes("/business/commerce"), false);
      assertForbidden((await get("/business/commerce/orders", cookies.receptionist, rsc)).text);
    }
    const list = await get("/business/commerce/orders", cookies.owner);
    assert.equal(list.response.status, 200);
    assert.match(list.text, new RegExp(order.orderNumber));
    assert.doesNotMatch(list.text, /PRIVATE-INSTRUCTION|\+9647500000399|UNSAFE-ORDER-IMAGE|javascript:/);
    const ownerDetail = await get(`/business/commerce/orders/${order.id}`, cookies.owner);
    findForm(ownerDetail.text, { action: "confirm" });
    findForm(ownerDetail.text, { action: "reject" });
    findForm(ownerDetail.text, { action: "cancel" });
    assert.doesNotMatch(ownerDetail.text, /UNSAFE-ORDER-IMAGE|javascript:/);
    const staffDetail = await get(`/business/commerce/orders/${order.id}`, cookies.staff);
    findForm(staffDetail.text, { action: "confirm" });
    assert.equal(formParams(staffDetail.text).getAll("action").includes("cancel"), false);
    const viewDetail = await get(`/business/commerce/orders/${order.id}`, cookies.view);
    assert.doesNotMatch(viewDetail.text, /name="expectedVersion"|name="idempotencyKey"|name="action"/);
  });

  await t.test("Server Actions run the complete pickup flow and exact duplicate submit is side-effect free", async () => {
    const path = `/business/commerce/orders/${order.id}`;
    const initial = await get(path, cookies.owner);
    const confirm = findForm(initial.text, { action: "confirm" });
    await submit(path, confirm, cookies.owner);
    await submit(path, confirm, cookies.owner);
    assert.equal(await prisma.orderStatusHistory.count({ where: { orderId: order.id, newOrderStatus: "CONFIRMED" } }), 1);
    let detail = await get(path, cookies.owner);
    await submit(path, findForm(detail.text, { action: "start_preparing" }), cookies.owner);
    detail = await get(path, cookies.owner);
    await submit(path, findForm(detail.text, { action: "ready_for_pickup" }), cookies.owner);
    detail = await get(path, cookies.owner);
    await submit(path, findForm(detail.text, { action: "finalize_pickup" }), cookies.owner);
    const completed = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
    assert.deepEqual([completed.status, completed.fulfillmentStatus, completed.paymentStatus], ["COMPLETED", "PICKED_UP", "PAID"]);
    assert.equal(completed.payment?.status, "PAID");
    assert.equal(completed.payment?.recordedById, ownerSession.person.id);
  });

  await t.test("customer cancellation API requires version/key and replays the original result", async () => {
    const customerOrder = await pending("CUSTOMER");
    const url = `${baseUrl}/api/commerce/customer/orders/${customerOrder.id}/cancel`;
    const idempotencyKey = randomUUID();
    const request = () => fetch(url, {
      body: JSON.stringify({ expectedVersion: customerOrder.updatedAt.toISOString(), reason: "Changed plans" }),
      headers: {
        "content-type": "application/json", cookie: customerSession.cookie, "idempotency-key": idempotencyKey,
        origin: baseUrl!, "user-agent": "stage3c-http-customer-cancel",
      },
      method: "POST",
    });
    const first = await request();
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    const replay = await request();
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), firstBody);
    assert.equal(await prisma.orderStatusHistory.count({ where: { idempotencyKey } }), 1);
    assert.equal(await prisma.stockMovement.count({ where: { orderId: customerOrder.id, type: "RELEASE" } }), 1);
    const missingKey = await fetch(url, {
      body: JSON.stringify({ expectedVersion: customerOrder.updatedAt.toISOString(), reason: "Changed" }),
      headers: { "content-type": "application/json", cookie: customerSession.cookie, origin: baseUrl! },
      method: "POST",
    });
    assert.equal(missingKey.status, 400);
    assert.doesNotMatch(await missingKey.text(), /PrismaClient|PostgreSQL|Invalid `prisma\./);
  });
});
