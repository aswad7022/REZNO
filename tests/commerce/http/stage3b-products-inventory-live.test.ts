import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { CommercePermission, SystemRole } from "@prisma/client";

import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../../features/identity/policies/authorization";
import { prisma } from "../../../lib/db/prisma";

const baseUrl = process.env.COMMERCE_HTTP_BASE_URL;

function decodeHtml(value: string) {
  return value.replaceAll("&quot;", "\"").replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function attribute(element: string, name: string) {
  return decodeHtml(element.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "");
}

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
    const parameters = formParams(candidate);
    return Object.entries(expected).every(([key, value]) => parameters.get(key) === value);
  });
  assert.ok(form, `Expected form ${JSON.stringify(expected)}`);
  return form;
}

async function submit(path: string, form: string, mutate: (parameters: URLSearchParams) => void, cookie: string) {
  const parameters = formParams(form);
  mutate(parameters);
  const body = new FormData();
  for (const [key, value] of parameters) body.append(key, value);
  const response = await fetch(`${baseUrl}${path}`, {
    body,
    headers: { cookie, origin: baseUrl!, referer: `${baseUrl}${path}` },
    method: "POST",
    redirect: "manual",
  });
  assert.ok([200, 303].includes(response.status), `Unexpected Server Action status ${response.status}`);
  let text = "";
  if (response.body) {
    const reader = response.body.getReader();
    const chunk = await Promise.race([
      reader.read(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
    ]);
    if (chunk?.value) text = new TextDecoder().decode(chunk.value);
    await reader.cancel();
  }
  return { status: response.status, text };
}

async function signUp() {
  const nonce = randomUUID().slice(0, 8);
  const email = `stage3b-http-${nonce}@rezno.invalid`;
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email, name: "Stage 3B HTTP", password: "password123" }),
    headers: { "content-type": "application/json", origin: baseUrl!, "user-agent": `rezno-stage3b-http-${nonce}` },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { user: { id: string } };
  const session = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(session);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id },
    data: { isOnboarded: true, phone: "+9647500000900", status: "ACTIVE" },
  });
  return { cookie: session.split(";")[0]!, person };
}

async function addMembership(
  organizationId: string,
  personId: string,
  label: string,
  systemRole: SystemRole,
  commercePermissions: CommercePermission[],
) {
  const role = await prisma.role.create({ data: { commercePermissions, isSystem: true, name: label, organizationId, systemRole } });
  return prisma.organizationMember.create({ data: { organizationId, personId, roleId: role.id } });
}

async function reset() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.match(rows[0]?.database ?? "", /(?:_test|test_)/);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE');
}

async function context(label: string, personId: string, systemRole: SystemRole, commercePermissions: CommercePermission[]) {
  const organization = await prisma.organization.create({ data: { name: `${label} Org`, slug: `${label}-${randomUUID().slice(0, 8)}` } });
  const role = await prisma.role.create({ data: { commercePermissions, isSystem: true, name: label, organizationId: organization.id, systemRole } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, personId, roleId: role.id } });
  const store = await prisma.store.create({ data: {
    deliveryArea: "Karrada", deliveryCity: "Baghdad", deliveryEnabled: true, deliveryEstimateMinutes: 30,
    deliveryFee: "1000", minimumOrderValue: "0", name: `${label} Store`, organizationId: organization.id,
    pickupArea: "Karrada", pickupCity: "Baghdad", pickupEnabled: true, pickupStreet: "HTTP Street",
    preparationEstimateMinutes: 15, publishedAt: new Date(), slug: `${label}-store-${randomUUID().slice(0, 8)}`,
    status: "ACTIVE", supportPhone: "+9647500000901",
  } });
  return { organization, store };
}

function cookie(session: string, organizationId: string) {
  return `${session}; rezno-active-business-id=${organizationId}`;
}

async function get(path: string, session: string, rsc = false) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie: session, ...(rsc ? { accept: "text/x-component", rsc: "1" } : {}) },
    redirect: "manual",
  });
  return { response, text: await response.text() };
}

function routeText(value: string) { return value.replaceAll("\\/", "/"); }
function assertForbidden(value: string) {
  assert.match(value, /NEXT_HTTP_ERROR_FALLBACK;403/);
  assert.doesNotMatch(value, /PrismaClient|PostgreSQL|Invalid `prisma\./);
}

test("Gate 3B production HTML, RSC and Server Actions enforce Product and Inventory boundaries", {
  concurrency: false,
  skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live Gate 3B tests",
}, async (t) => {
  await reset();
  t.after(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); await reset(); await prisma.$disconnect(); });
  const [ownerSession, managerSession, staffSession] = await Promise.all([
    signUp(), signUp(), signUp(),
  ]);
  const owner = await context("owner", ownerSession.person.id, "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]);
  await addMembership(owner.organization.id, managerSession.person.id, "manager", "MANAGER", ["PRODUCT_VIEW", "PRODUCT_CREATE", "PRODUCT_UPDATE", "INVENTORY_VIEW"]);
  await addMembership(owner.organization.id, staffSession.person.id, "staff", "STAFF", ["PRODUCT_VIEW", "INVENTORY_VIEW", "INVENTORY_ADJUST"]);
  const archiveOnly = await context("archive-only", managerSession.person.id, "MANAGER", ["PRODUCT_VIEW", "PRODUCT_ARCHIVE"]);
  const denied = await context("denied", ownerSession.person.id, "MANAGER", []);
  const receptionist = await context("receptionist", ownerSession.person.id, "RECEPTIONIST", ["PRODUCT_VIEW", "INVENTORY_VIEW"]);
  const foreign = await context("foreign", ownerSession.person.id, "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]);
  const category = await prisma.marketplaceCategory.create({ data: { name: "HTTP Category", normalizedName: "http category", slug: `http-${randomUUID()}` } });
  const product = await prisma.product.create({ data: {
    categoryId: category.id, description: "OWNER-PRODUCT-SENTINEL", name: "Owner Product",
    normalizedSearchText: "owner product", slug: "owner-product", storeId: owner.store.id,
  } });
  const archiveOnlyProduct = await prisma.product.create({ data: {
    categoryId: category.id, description: "ARCHIVE-ONLY-PRODUCT", name: "Archive Only Product",
    normalizedSearchText: "archive only product", slug: "archive-only-product", storeId: archiveOnly.store.id,
  } });
  const variant = await prisma.productVariant.create({ data: {
    inventory: { create: { onHand: 7 } }, isDefault: true, optionKey: "default", optionValues: {}, price: "10000",
    productId: product.id, sku: "OWNER-SKU", storeId: owner.store.id, title: "Default",
  }, include: { inventory: true } });
  await prisma.productMedia.create({ data: { productId: product.id, sortOrder: 0, url: "javascript:UNSAFE-URL-SENTINEL" } });
  await prisma.product.create({ data: {
    categoryId: category.id, description: "FOREIGN-PRODUCT-SENTINEL", name: "Foreign Product",
    normalizedSearchText: "foreign product", slug: "foreign-product", storeId: foreign.store.id,
  } });
  const cookies = {
    archiveOnly: cookie(managerSession.cookie, archiveOnly.organization.id),
    denied: cookie(ownerSession.cookie, denied.organization.id),
    manager: cookie(managerSession.cookie, owner.organization.id),
    owner: cookie(ownerSession.cookie, owner.organization.id),
    receptionist: cookie(ownerSession.cookie, receptionist.organization.id),
    staff: cookie(staffSession.cookie, owner.organization.id),
  };

  await t.test("HTML and RSC navigation structurally match Product and Inventory permissions", async () => {
    for (const rsc of [false, true]) {
      const ownerPage = await get("/business", cookies.owner, rsc);
      if (!rsc) {
        assert.match(routeText(ownerPage.text), /\/business\/commerce\/products/);
        assert.match(routeText(ownerPage.text), /\/business\/commerce\/inventory/);
      }
      const staffPage = await get("/business", cookies.staff, rsc);
      if (!rsc) {
        assert.match(routeText(staffPage.text), /\/business\/commerce\/products/);
        assert.match(routeText(staffPage.text), /\/business\/commerce\/inventory/);
        assert.equal(routeText(staffPage.text).includes("/business/commerce/store"), false);
      }
      assert.equal(routeText((await get("/business", cookies.denied, rsc)).text).includes("/business/commerce"), false);
      assertForbidden((await get("/business/commerce/products", cookies.receptionist, rsc)).text);
      assertForbidden((await get("/business/commerce/inventory", cookies.receptionist, rsc)).text);
    }
  });

  await t.test("Owner Product pages are tenant-safe and suppress historical unsafe media", async () => {
    const list = await get("/business/commerce/products", cookies.owner);
    assert.equal(list.response.status, 200);
    assert.match(list.text, /Owner Product/);
    assert.doesNotMatch(list.text, /Foreign Product|UNSAFE-URL-SENTINEL|javascript:/);
    const detail = await get(`/business/commerce/products/${product.id}`, cookies.owner);
    assert.equal(detail.response.status, 200);
    assert.doesNotMatch(detail.text, /UNSAFE-URL-SENTINEL|javascript:/);
    assert.match(detail.text, /رابط صورة قديم غير آمن|Unsafe legacy image link/);
    const managerDetail = await get(`/business/commerce/products/${product.id}`, cookies.manager);
    assert.equal(managerDetail.response.status, 200);
    assert.doesNotMatch(managerDetail.text, /UNSAFE-URL-SENTINEL|javascript:/);

    const archiveOnlyDetail = await get(`/business/commerce/products/${archiveOnlyProduct.id}`, cookies.archiveOnly);
    assert.equal(archiveOnlyDetail.response.status, 200);
    findForm(archiveOnlyDetail.text, { operation: "archive" });
    assert.equal((archiveOnlyDetail.text.match(/name="operation"/g) ?? []).length, 1);
    assert.doesNotMatch(archiveOnlyDetail.text, /name="name"|name="sku"|name="mediaId"/);

    for (const path of [
      "/business/commerce/products/------------------------------------",
      "/business/commerce/inventory/------------------------------------",
      "/business/commerce/products?cursor=malformed",
      `/business/commerce/inventory/${variant.inventory!.id}?cursor=malformed`,
    ]) {
      const malformed = await get(path, cookies.owner);
      assert.ok([200, 404].includes(malformed.response.status), path);
      assert.match(malformed.text, /NEXT_HTTP_ERROR_FALLBACK;404|not-found|This page could not be found/i, path);
      assert.doesNotMatch(malformed.text, /PrismaClient|PostgreSQL|Invalid `prisma\./);
    }
  });

  await t.test("Product create Server Action is production-connected and duplicate-safe", async () => {
    const page = await get("/business/commerce/products/new", cookies.owner);
    const form = findForm(page.text, { mode: "create" });
    const key = attribute(form.match(/<input\b[^>]*name="idempotencyKey"[^>]*>/)?.[0] ?? "", "value");
    const mutate = (parameters: URLSearchParams) => {
      parameters.set("categoryId", category.id);
      parameters.set("compareAtPrice", "12000");
      parameters.set("description", "HTTP Created Product");
      parameters.set("name", "HTTP Created Product");
      parameters.set("optionValues", "{}");
      parameters.set("price", "10000");
      parameters.set("sku", `HTTP-${key.slice(0, 8)}`);
      parameters.set("slug", `http-created-${key.slice(0, 8)}`);
      parameters.set("title", "Default");
    };
    await submit("/business/commerce/products/new", form, mutate, cookies.owner);
    await submit("/business/commerce/products/new", form, mutate, cookies.owner);
    assert.equal(await prisma.product.count({ where: { storeId: owner.store.id, slug: `http-created-${key.slice(0, 8)}` } }), 1);
  });

  await t.test("Inventory pages and adjustment action are permission- and version-bound", async () => {
    const list = await get("/business/commerce/inventory", cookies.owner);
    assert.match(list.text, /OWNER-SKU/);
    assert.doesNotMatch(list.text, /FOREIGN-PRODUCT-SENTINEL|UNSAFE-URL-SENTINEL/);
    const detailPath = `/business/commerce/inventory/${variant.inventory!.id}`;
    const detail = await get(detailPath, cookies.owner);
    const form = findForm(detail.text, { operation: "adjust" });
    await submit(detailPath, form, (parameters) => {
      parameters.set("quantityDelta", "2");
      parameters.set("reason", "HTTP adjustment");
    }, cookies.owner);
    const inventory = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: variant.inventory!.id } });
    assert.equal(inventory.onHand, 9);
    assert.equal(await prisma.stockMovement.count({ where: { inventoryItemId: inventory.id } }), 1);
    assertForbidden((await get(detailPath, cookies.denied)).text);
  });

  await t.test("Archived Product and Inventory HTML, RSC, and forged Server Actions are read-only", async () => {
    const productPath = `/business/commerce/products/${product.id}`;
    const inventoryPath = `/business/commerce/inventory/${variant.inventory!.id}`;
    const mutableProduct = await get(productPath, cookies.owner);
    const mutableInventory = await get(inventoryPath, cookies.owner);
    const forged = {
      inventoryAdjust: findForm(mutableInventory.text, { operation: "adjust" }),
      inventoryThreshold: findForm(mutableInventory.text, { operation: "threshold" }),
      product: findForm(mutableProduct.text, { mode: "update" }),
      variant: findForm(mutableProduct.text, { operation: "update", variantId: variant.id }),
    };
    const archivedRow = await prisma.product.update({
      where: { id: product.id },
      data: { archivedAt: new Date(), publishedAt: null, status: "ARCHIVED" },
    });
    const before = {
      audits: await prisma.businessAuditLog.count({ where: { organizationId: owner.organization.id } }),
      inventory: await prisma.inventoryItem.findUniqueOrThrow({ where: { id: variant.inventory!.id } }),
      media: await prisma.productMedia.findMany({ where: { productId: product.id }, orderBy: { id: "asc" } }),
      movements: await prisma.stockMovement.count({ where: { inventoryItemId: variant.inventory!.id } }),
      mutations: await prisma.businessOperationMutation.count({ where: { organizationId: owner.organization.id } }),
      variants: await prisma.productVariant.findMany({ where: { productId: product.id }, orderBy: { id: "asc" } }),
    };

    for (const rsc of [false, true]) {
      const [archivedProduct, archivedInventory] = await Promise.all([
        get(productPath, cookies.owner, rsc),
        get(inventoryPath, cookies.owner, rsc),
      ]);
      assert.equal(archivedProduct.response.status, 200);
      assert.equal(archivedInventory.response.status, 200);
      assert.match(archivedProduct.text, /Owner Product|OWNER-SKU/);
      assert.match(archivedInventory.text, /Owner Product|OWNER-SKU/);
      for (const content of [archivedProduct.text, archivedInventory.text]) {
        assert.doesNotMatch(content, /name=\"idempotencyKey\"|idempotencyKey|saveMerchantProductAction|merchantProductLifecycleAction|merchantVariantAction|merchantProductMediaAction|merchantInventoryAction/);
        assert.doesNotMatch(content, /PrismaClient|PostgreSQL|Invalid `prisma\./);
      }
      assert.doesNotMatch(archivedProduct.text, /name=\"mode\"|name=\"operation\"|name=\"mediaId\"|name=\"variantId\"/);
      assert.doesNotMatch(archivedInventory.text, /name=\"quantityDelta\"|name=\"lowStockThreshold\"|name=\"operation\"/);
    }

    const responses = await Promise.all([
      submit(productPath, forged.product, (parameters) => parameters.set("expectedVersion", archivedRow.updatedAt.toISOString()), cookies.owner),
      submit(productPath, forged.variant, (parameters) => parameters.set("expectedVersion", archivedRow.updatedAt.toISOString()), cookies.owner),
      submit(inventoryPath, forged.inventoryAdjust, (parameters) => {
        parameters.set("quantityDelta", "1");
        parameters.set("reason", "Forged archived Product adjustment");
      }, cookies.owner),
      submit(inventoryPath, forged.inventoryThreshold, (parameters) => parameters.set("lowStockThreshold", "4"), cookies.owner),
    ]);
    for (const response of responses) {
      assert.doesNotMatch(response.text, /PrismaClient|PostgreSQL|Invalid `prisma\./);
    }
    assert.deepEqual({
      audits: await prisma.businessAuditLog.count({ where: { organizationId: owner.organization.id } }),
      inventory: await prisma.inventoryItem.findUniqueOrThrow({ where: { id: variant.inventory!.id } }),
      media: await prisma.productMedia.findMany({ where: { productId: product.id }, orderBy: { id: "asc" } }),
      movements: await prisma.stockMovement.count({ where: { inventoryItemId: variant.inventory!.id } }),
      mutations: await prisma.businessOperationMutation.count({ where: { organizationId: owner.organization.id } }),
      variants: await prisma.productVariant.findMany({ where: { productId: product.id }, orderBy: { id: "asc" } }),
    }, before);
  });
});
