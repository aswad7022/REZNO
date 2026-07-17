import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { CommercePermission, SystemRole } from "@prisma/client";

import { CommerceDomainError } from "../../features/commerce/domain/errors";
import { listMerchantInventory, getMerchantInventoryDetail } from "../../features/commerce/services/merchant-inventory-service";
import { adjustInventory, updateInventoryThreshold } from "../../features/commerce/services/inventory-service";
import {
  addMerchantProductMedia,
  archiveMerchantProduct,
  archiveMerchantVariant,
  createMerchantProduct,
  createMerchantVariant,
  getMerchantProduct,
  listMerchantProducts,
  publishMerchantProduct,
  removeMerchantProductMedia,
  reorderMerchantProductMedia,
  restoreMerchantVariant,
  setMerchantDefaultVariant,
  unpublishMerchantProduct,
  updateMerchantProduct,
  updateMerchantProductMedia,
  updateMerchantVariant,
} from "../../features/commerce/services/merchant-product-service";
import type { MerchantActorReference } from "../../features/commerce/services/authorization";
import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../features/identity/policies/authorization";
import { prisma } from "../../lib/db/prisma";
import {
  assertCommerceProductsInventoryStage3bSmokeSafety,
  COMMERCE_PRODUCTS_INVENTORY_STAGE3B_SMOKE_CONFIRMATION,
} from "./commerce-products-inventory-stage3b-smoke-safety";

type Session = { cookie: string; personId: string; userId: string };
type Context = {
  membershipId: string;
  organizationId: string;
  reference: MerchantActorReference;
  roleId: string;
  storeId: string;
  storeSlug: string;
};
type ProductDto = {
  expectedVersion: string;
  id: string;
  media: Array<{ altText: string | null; id: string; sortOrder: number; url: string }>;
  name: string;
  readiness: { missing: string[]; ready: boolean };
  slug: string;
  status: string;
  unsafeMediaIds: string[];
  variants: Array<{
    archivedAt: string | null;
    id: string;
    inventory: { id: string; onHand: number; reserved: number; version: number } | null;
    isDefault: boolean;
    sku: string;
    status: string;
    title: string;
  }>;
};

const baseUrl = process.env.COMMERCE_STAGING_BASE_URL?.replace(/\/$/, "") ?? "";
const authBaseUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const runId = randomUUID().replaceAll("-", "").slice(0, 16);
const checks = new Set<number>();
const resources = {
  categoryIds: [] as string[],
  organizationIds: [] as string[],
  personIds: [] as string[],
  userIds: [] as string[],
};
let smokePhase = "safety";
let finalCounts = { audits: 0, movements: 0, mutations: 0 };

async function main() {
  const database = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assertCommerceProductsInventoryStage3bSmokeSafety({
    authBaseUrl,
    baseUrl,
    confirmation: process.env.COMMERCE_PRODUCTS_INVENTORY_STAGE3B_SMOKE_CONFIRM,
    database: database[0]?.database ?? "",
    vercelEnvironment: process.env.VERCEL_ENV,
  });
  assert.ok(bypass, "Vercel preview protection bypass is required.");

  smokePhase = "authenticated-identities";
  const sessions = {
    customer: await signUp("customer", 1),
    manager: await signUp("manager", 2),
    owner: await signUp("owner", 3),
    receptionist: await signUp("receptionist", 4),
    staff: await signUp("staff", 5),
  };
  assert.equal(new Set(Object.values(sessions).map((session) => session.userId)).size, 5);

  smokePhase = "tenant-and-role-setup";
  const primary = await createOrganizationContext("primary", sessions.owner, "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS], "ACTIVE");
  const manager = await addIdentity(primary, sessions.manager, "manager", "MANAGER", [
    "PRODUCT_VIEW", "PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_ARCHIVE", "INVENTORY_VIEW",
  ]);
  const staff = await addIdentity(primary, sessions.staff, "staff", "STAFF", [
    "PRODUCT_VIEW", "INVENTORY_VIEW", "INVENTORY_ADJUST",
  ]);
  await addIdentity(primary, sessions.receptionist, "receptionist", "RECEPTIONIST", [
    "PRODUCT_VIEW", "INVENTORY_VIEW",
  ]);
  const foreign = await createOrganizationContext("foreign", sessions.owner, "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS], "ACTIVE");
  const managerRead = await createOrganizationContext("manager-read", sessions.manager, "MANAGER", ["PRODUCT_VIEW", "INVENTORY_VIEW"], "ACTIVE");
  const staffDenied = await createOrganizationContext("staff-denied", sessions.staff, "STAFF", [], "ACTIVE");
  const lifecycle = await createOrganizationContext("lifecycle", sessions.owner, "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS], "DRAFT");
  const category = await prisma.marketplaceCategory.create({
    data: {
      name: `Stage 3B Smoke ${runId}`,
      normalizedName: `stage 3b smoke ${runId}`,
      slug: `stage3b-smoke-${runId}`,
    },
  });
  resources.categoryIds.push(category.id);
  const inactiveCategory = await prisma.marketplaceCategory.create({
    data: {
      name: `Stage 3B Inactive ${runId}`,
      normalizedName: `stage 3b inactive ${runId}`,
      slug: `stage3b-inactive-${runId}`,
      status: "INACTIVE",
    },
  });
  resources.categoryIds.push(inactiveCategory.id);

  const cookies = {
    foreign: activeCookie(sessions.owner.cookie, foreign.organizationId),
    manager: activeCookie(sessions.manager.cookie, primary.organizationId),
    managerRead: activeCookie(sessions.manager.cookie, managerRead.organizationId),
    owner: activeCookie(sessions.owner.cookie, primary.organizationId),
    receptionist: activeCookie(sessions.receptionist.cookie, primary.organizationId),
    staff: activeCookie(sessions.staff.cookie, primary.organizationId),
    staffDenied: activeCookie(sessions.staff.cookie, staffDenied.organizationId),
  };

  smokePhase = "role-navigation";
  const ownerHub = await body("/business/commerce", cookies.owner);
  assert.equal(ownerHub.response.status, 200);
  assert.match(routeText(ownerHub.text), /\/business\/commerce\/products/);
  assert.match(routeText(ownerHub.text), /\/business\/commerce\/inventory/);
  const managerHub = await body("/business/commerce", cookies.manager);
  assert.equal(managerHub.response.status, 200);
  assert.match(routeText(managerHub.text), /\/business\/commerce\/products/);
  const staffHub = await body("/business/commerce", cookies.staff);
  assert.equal(staffHub.response.status, 200);
  assert.match(routeText(staffHub.text), /\/business\/commerce\/inventory/);
  const deniedStaffHome = await body("/business", cookies.staffDenied);
  assert.equal(routeText(deniedStaffHome.text).includes("/business/commerce"), false);
  const receptionistProducts = await body("/business/commerce/products", cookies.receptionist);
  assertForbidden(receptionistProducts.response, receptionistProducts.text);
  checks.add(27);
  checks.add(28);
  checks.add(29);

  smokePhase = "product-create-replay";
  const createPage = await body("/business/commerce/products/new", cookies.owner);
  const createForm = findForm(createPage.text, { mode: "create" });
  const productSlug = `stage3b-smoke-product-${runId}`;
  const productSku = `STAGE3B-${runId}`;
  const fillCreate = (parameters: URLSearchParams) => {
    parameters.set("categoryId", category.id);
    parameters.set("compareAtPrice", "12000");
    parameters.set("description", "Stage 3B exact-head staging Product");
    parameters.set("name", "Stage 3B Staging Product");
    parameters.set("optionValues", "{}");
    parameters.set("price", "10000");
    parameters.set("sku", productSku);
    parameters.set("slug", productSlug);
    parameters.set("title", "Default");
  };
  await submit("/business/commerce/products/new", createForm, fillCreate, cookies.owner);
  let persisted = await prisma.product.findUniqueOrThrow({
    where: { storeId_slug: { slug: productSlug, storeId: primary.storeId } },
    include: { variants: { include: { inventory: true } } },
  });
  assert.equal(persisted.variants.length, 1);
  assert.equal(persisted.variants[0]?.isDefault, true);
  assert.ok(persisted.variants[0]?.inventory);
  checks.add(2);
  await submit("/business/commerce/products/new", createForm, fillCreate, cookies.owner);
  assert.equal(await prisma.product.count({ where: { slug: productSlug, storeId: primary.storeId } }), 1);
  assert.equal(await prisma.businessOperationMutation.count({ where: { action: "commerce.product.create", targetId: persisted.id } }), 1);
  checks.add(3);
  let product = asProduct((await getMerchantProduct(primary.reference, persisted.id)).product);

  smokePhase = "product-pagination-update-stale";
  for (const index of [1, 2, 3]) {
    await createMerchantProduct(primary.reference, createInput(primary, category.id, index));
  }
  const firstProductPage = await listMerchantProducts(primary.reference, { limit: 2 });
  assert.equal(firstProductPage.data.length, 2);
  assert.ok(firstProductPage.pageInfo.nextCursor);
  const secondProductPage = await listMerchantProducts(primary.reference, {
    cursor: firstProductPage.pageInfo.nextCursor!,
    limit: 2,
  });
  assert.equal(firstProductPage.data.some((item) => secondProductPage.data.some((next) => next.id === item.id)), false);
  checks.add(1);

  let productPage = await body(`/business/commerce/products/${product.id}`, cookies.owner);
  const updateForm = findForm(productPage.text, { mode: "update", productId: product.id });
  await submit(`/business/commerce/products/${product.id}`, updateForm, (parameters) => {
    parameters.set("description", "Updated on exact-head staging");
    parameters.set("name", "Stage 3B Updated Product");
  }, cookies.owner);
  persisted = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, include: { variants: { include: { inventory: true } } } });
  assert.equal(persisted.name, "Stage 3B Updated Product");
  checks.add(4);
  await submit(`/business/commerce/products/${product.id}`, updateForm, (parameters) => {
    parameters.set("description", "STALE-STAGE3B-SENTINEL");
    parameters.set("idempotencyKey", randomUUID());
  }, cookies.owner);
  assert.notEqual((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).description, "STALE-STAGE3B-SENTINEL");
  checks.add(5);
  product = asProduct((await getMerchantProduct(primary.reference, product.id)).product);
  assert.equal(product.readiness.ready, true);
  checks.add(8);

  smokePhase = "product-publish-unpublish";
  productPage = await body(`/business/commerce/products/${product.id}`, cookies.owner);
  await submit(`/business/commerce/products/${product.id}`, findForm(productPage.text, { operation: "publish" }), () => undefined, cookies.owner);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status, "PUBLISHED");
  const publicPublished = await commerceRequest(`/api/commerce/public/stores/${primary.storeSlug}/products/${product.slug}`);
  assert.equal(publicPublished.response.status, 200);
  checks.add(35);
  productPage = await body(`/business/commerce/products/${product.id}`, cookies.owner);
  await submit(`/business/commerce/products/${product.id}`, findForm(productPage.text, { operation: "unpublish" }), () => undefined, cookies.owner);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status, "DRAFT");
  checks.add(6);
  product = asProduct((await getMerchantProduct(primary.reference, product.id)).product);

  smokePhase = "variant-lifecycle";
  const variantKey = randomUUID();
  const variantPayload = {
    ...envelope(primary, product, { idempotencyKey: variantKey }),
    compareAtPrice: "16000",
    optionValues: { Size: "Large" },
    price: "15000",
    sku: `STAGE3B-LARGE-${runId}`,
    title: "Large",
  };
  product = asProduct(await createMerchantVariant(primary.reference, variantPayload));
  assert.deepEqual(asProduct(await createMerchantVariant(primary.reference, variantPayload)), product);
  let large = product.variants.find((variant) => variant.title === "Large")!;
  product = asProduct(await updateMerchantVariant(primary.reference, {
    ...envelope(primary, product),
    compareAtPrice: "17000",
    optionValues: { Size: "Large" },
    price: "15500",
    sku: large.sku,
    title: "Large Updated",
    variantId: large.id,
  }));
  checks.add(9);
  large = product.variants.find((variant) => variant.id === large.id)!;
  await assert.rejects(createMerchantVariant(primary.reference, {
    ...envelope(primary, product), compareAtPrice: "", optionValues: { Color: "Black" },
    price: "1000", sku: large.sku, title: "SKU collision",
  }), domainCode("CONFLICT"));
  await assert.rejects(createMerchantVariant(primary.reference, {
    ...envelope(primary, product), compareAtPrice: "", optionValues: { size: " large " },
    price: "1000", sku: `STAGE3B-OPTION-${runId}`, title: "Option collision",
  }), domainCode("CONFLICT"));
  checks.add(10);
  product = asProduct(await setMerchantDefaultVariant(primary.reference, envelope(primary, product, { variantId: large.id })));
  assert.equal(product.variants.filter((variant) => variant.status === "ACTIVE" && variant.isDefault).length, 1);
  checks.add(11);
  product = asProduct(await createMerchantVariant(primary.reference, {
    ...envelope(primary, product), compareAtPrice: "", optionValues: { Size: "Small" },
    price: "9000", sku: `STAGE3B-SMALL-${runId}`, title: "Small",
  }));
  const small = product.variants.find((variant) => variant.title === "Small")!;
  const currentDefault = product.variants.find((variant) => variant.isDefault)!;
  const defaultRace = await Promise.allSettled([
    setMerchantDefaultVariant(primary.reference, envelope(primary, product, { variantId: small.id })),
    setMerchantDefaultVariant(primary.reference, envelope(primary, product, { variantId: currentDefault.id })),
  ]);
  assert.equal(defaultRace.filter((result) => result.status === "fulfilled").length, 1);
  product = asProduct((await getMerchantProduct(primary.reference, product.id)).product);
  assert.equal(product.variants.filter((variant) => variant.status === "ACTIVE" && variant.isDefault).length, 1);
  checks.add(12);
  const nonDefault = product.variants.find((variant) => variant.status === "ACTIVE" && !variant.isDefault)!;
  product = asProduct(await archiveMerchantVariant(primary.reference, envelope(primary, product, {
    replacementVariantId: null,
    variantId: nonDefault.id,
  })));
  product = asProduct(await restoreMerchantVariant(primary.reference, envelope(primary, product, {
    makeDefault: false,
    variantId: nonDefault.id,
  })));
  const defaultVariant = product.variants.find((variant) => variant.isDefault)!;
  await assert.rejects(archiveMerchantVariant(primary.reference, envelope(primary, product, {
    replacementVariantId: null,
    variantId: defaultVariant.id,
  })), domainCode("VALIDATION_ERROR"));
  checks.add(13);

  smokePhase = "media-safety";
  product = asProduct(await addMerchantProductMedia(primary.reference, envelope(primary, product, {
    altText: "Front", url: `https://cdn.example.com/${runId}/front.jpg`, variantId: null,
  })));
  product = asProduct(await addMerchantProductMedia(primary.reference, envelope(primary, product, {
    altText: "Back", url: `https://cdn.example.com/${runId}/back.jpg`, variantId: null,
  })));
  const front = product.media.find((media) => media.url.endsWith("front.jpg"))!;
  const back = product.media.find((media) => media.url.endsWith("back.jpg"))!;
  product = asProduct(await updateMerchantProductMedia(primary.reference, envelope(primary, product, {
    altText: "Updated front", mediaId: front.id,
  })));
  product = asProduct(await reorderMerchantProductMedia(primary.reference, envelope(primary, product, {
    mediaIds: [back.id, front.id],
  })));
  assert.deepEqual(product.media.map((media) => media.id), [back.id, front.id]);
  product = asProduct(await removeMerchantProductMedia(primary.reference, envelope(primary, product, { mediaId: front.id })));
  checks.add(14);
  await assert.rejects(addMerchantProductMedia(primary.reference, envelope(primary, product, {
    altText: "Unsafe", url: "https://127.0.0.1/private.jpg", variantId: null,
  })), domainCode("VALIDATION_ERROR"));
  checks.add(15);
  const unsafeMedia = await prisma.productMedia.create({
    data: { productId: product.id, sortOrder: 9, url: `javascript:STAGE3B-UNSAFE-${runId}` },
  });
  product = asProduct((await getMerchantProduct(primary.reference, product.id)).product);
  assert.equal(JSON.stringify(product).includes(`STAGE3B-UNSAFE-${runId}`), false);
  assert.equal(product.unsafeMediaIds.includes(unsafeMedia.id), true);
  const unsafeHtml = await body(`/business/commerce/products/${product.id}`, cookies.owner);
  assert.equal(unsafeHtml.text.includes(`STAGE3B-UNSAFE-${runId}`), false);
  product = asProduct(await removeMerchantProductMedia(primary.reference, envelope(primary, product, { mediaId: unsafeMedia.id })));
  checks.add(16);

  smokePhase = "inventory-ledger";
  const inventory = product.variants.find((variant) => variant.isDefault)!.inventory!;
  const adjustmentKey = randomUUID();
  const adjustment = {
    expectedVersion: inventory.version,
    idempotencyKey: adjustmentKey,
    inventoryItemId: inventory.id,
    quantityDelta: 20,
    reason: "Stage 3B staging opening stock",
  };
  let adjusted = await adjustInventory(primary.reference, adjustment);
  assert.equal(adjusted.onHand, inventory.onHand + 20);
  checks.add(19);
  assert.equal((await adjustInventory(primary.reference, adjustment)).onHand, adjusted.onHand);
  await assert.rejects(adjustInventory(primary.reference, { ...adjustment, quantityDelta: 19 }), domainCode("INVENTORY_CONFLICT"));
  checks.add(20);
  const adjustmentRace = await Promise.allSettled([
    adjustInventory(primary.reference, { ...adjustment, expectedVersion: adjusted.version, idempotencyKey: randomUUID(), quantityDelta: 1, reason: "Concurrent A" }),
    adjustInventory(primary.reference, { ...adjustment, expectedVersion: adjusted.version, idempotencyKey: randomUUID(), quantityDelta: 1, reason: "Concurrent B" }),
  ]);
  assert.equal(adjustmentRace.filter((result) => result.status === "fulfilled").length, 1);
  checks.add(21);
  let inventoryRow = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
  await prisma.inventoryItem.update({ where: { id: inventory.id }, data: { reserved: 3 } });
  inventoryRow = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
  await assert.rejects(adjustInventory(primary.reference, {
    expectedVersion: inventoryRow.version,
    idempotencyKey: randomUUID(),
    inventoryItemId: inventory.id,
    quantityDelta: -(inventoryRow.onHand - 2),
    reason: "Reserved floor probe",
  }), domainCode("INSUFFICIENT_STOCK"));
  await prisma.inventoryItem.update({ where: { id: inventory.id }, data: { reserved: 0 } });
  checks.add(22);
  inventoryRow = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
  const threshold = await updateInventoryThreshold(primary.reference, {
    contextOrganizationId: primary.organizationId,
    expectedVersion: inventoryRow.version,
    idempotencyKey: randomUUID(),
    inventoryItemId: inventory.id,
    lowStockThreshold: inventoryRow.onHand,
  }) as { lowStock: boolean; version: number };
  assert.equal(threshold.lowStock, true);
  checks.add(23);
  const lowStock = await listMerchantInventory(primary.reference, { limit: 20, lowStock: true });
  assert.equal(lowStock.data.some((item) => item.id === inventory.id), true);
  checks.add(24);
  const inventoryPage = await listMerchantInventory(primary.reference, { limit: 1 });
  assert.equal(inventoryPage.data.length, 1);
  assert.ok(inventoryPage.pageInfo.nextCursor);
  const inventoryPage2 = await listMerchantInventory(primary.reference, { cursor: inventoryPage.pageInfo.nextCursor!, limit: 1 });
  assert.notEqual(inventoryPage.data[0]?.id, inventoryPage2.data[0]?.id);
  checks.add(18);
  const movements = await getMerchantInventoryDetail(primary.reference, inventory.id, { limit: 1 });
  assert.equal(movements.movements.data.length, 1);
  assert.ok(movements.movements.pageInfo.nextCursor);
  const movements2 = await getMerchantInventoryDetail(primary.reference, inventory.id, {
    cursor: movements.movements.pageInfo.nextCursor!, limit: 1,
  });
  assert.notEqual(movements.movements.data[0]?.id, movements2.movements.data[0]?.id);
  checks.add(25);
  await assert.rejects(listMerchantInventory(primary.reference, {
    cursor: `${inventoryPage.pageInfo.nextCursor}x`, limit: 1,
  }), domainCode("INVALID_CURSOR"));
  await assert.rejects(listMerchantInventory(primary.reference, {
    cursor: inventoryPage.pageInfo.nextCursor!, limit: 1, lowStock: true,
  }), domainCode("INVALID_CURSOR"));
  checks.add(26);

  smokePhase = "role-and-tenant-mutations";
  product = asProduct((await getMerchantProduct(primary.reference, product.id)).product);
  product = asProduct(await updateMerchantProduct(manager.reference, {
    ...envelope(primary, product), categoryId: category.id, description: "Manager updated",
    name: product.name, slug: product.slug,
  }));
  await assert.rejects(updateMerchantProduct(managerRead.reference, {
    ...envelope(managerRead, product), categoryId: category.id, description: "Denied",
    name: product.name, slug: product.slug,
  }), domainCode("FORBIDDEN"));
  const staffInventory = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventory.id } });
  adjusted = await adjustInventory(staff.reference, {
    expectedVersion: staffInventory.version,
    idempotencyKey: randomUUID(),
    inventoryItemId: inventory.id,
    quantityDelta: 1,
    reason: "Authorized Staff adjustment",
  });
  assert.ok(adjusted.onHand > 0);
  await assert.rejects(updateMerchantProduct(staff.reference, {
    ...envelope(primary, product), categoryId: category.id, description: "Staff denied",
    name: product.name, slug: product.slug,
  }), domainCode("FORBIDDEN"));
  await assert.rejects(getMerchantProduct(foreign.reference, product.id), domainCode("NOT_FOUND"));
  checks.add(30);

  smokePhase = "active-business-revocation";
  const primaryList = await body("/business/commerce/products", cookies.owner);
  assert.match(primaryList.text, /Stage 3B Updated Product/);
  const foreignList = await body("/business/commerce/products", cookies.foreign);
  assert.equal(foreignList.text.includes("Stage 3B Updated Product"), false);
  checks.add(31);
  await prisma.organizationMember.update({ where: { id: managerRead.membershipId }, data: { status: "INACTIVE" } });
  const revoked = await body("/business/commerce/products", cookies.managerRead);
  assert.ok([200, 302, 303, 307, 308, 403].includes(revoked.response.status));
  assert.equal(revoked.text.includes(managerRead.storeId), false);
  await prisma.organizationMember.update({ where: { id: managerRead.membershipId }, data: { status: "ACTIVE" } });
  checks.add(32);
  await prisma.person.update({ where: { id: sessions.manager.personId }, data: { deletedAt: new Date(), status: "INACTIVE" } });
  const deleted = await body("/business/commerce/products", cookies.manager);
  assert.ok([200, 302, 303, 307, 308, 403].includes(deleted.response.status));
  assert.equal(deleted.text.includes(product.id), false);
  await prisma.person.update({ where: { id: sessions.manager.personId }, data: { deletedAt: null, status: "ACTIVE" } });
  checks.add(33);

  smokePhase = "store-lifecycle";
  let lifecycleProduct = asProduct(await createMerchantProduct(lifecycle.reference, createInput(lifecycle, category.id, 90)));
  await assert.rejects(publishMerchantProduct(lifecycle.reference, envelope(lifecycle, lifecycleProduct)), domainCode("STORE_UNAVAILABLE"));
  const lifecycleInventory = lifecycleProduct.variants[0]!.inventory!;
  await prisma.store.update({ where: { id: lifecycle.storeId }, data: { publishedAt: new Date(), status: "SUSPENDED" } });
  await adjustInventory(lifecycle.reference, {
    expectedVersion: lifecycleInventory.version,
    idempotencyKey: randomUUID(),
    inventoryItemId: lifecycleInventory.id,
    quantityDelta: 1,
    reason: "Suspended Store maintenance",
  });
  await prisma.store.update({ where: { id: lifecycle.storeId }, data: { archivedAt: new Date(), status: "ARCHIVED" } });
  lifecycleProduct = asProduct((await getMerchantProduct(lifecycle.reference, lifecycleProduct.id)).product);
  await assert.rejects(updateMerchantProduct(lifecycle.reference, {
    ...envelope(lifecycle, lifecycleProduct), categoryId: category.id,
    description: "Archived denial", name: lifecycleProduct.name, slug: lifecycleProduct.slug,
  }), domainCode("INVALID_TRANSITION"));
  checks.add(34);

  smokePhase = "public-cart-checkout-history-mobile";
  product = asProduct((await getMerchantProduct(primary.reference, product.id)).product);
  product = asProduct(await publishMerchantProduct(primary.reference, envelope(primary, product)));
  const defaultForCart = product.variants.find((variant) => variant.isDefault)!;
  const addCart = await commerceRequest("/api/commerce/customer/cart/items", {
    body: { quantity: 1, variantId: defaultForCart.id }, cookie: sessions.customer.cookie, method: "POST",
  });
  assert.equal(addCart.response.status, 200);
  const cart = addCart.body.data as { id: string; version: number };
  product = asProduct(await unpublishMerchantProduct(primary.reference, envelope(primary, product)));
  const unavailableCart = await commerceRequest("/api/commerce/customer/cart", { cookie: sessions.customer.cookie });
  assert.equal(unavailableCart.response.status, 200);
  assert.equal(JSON.stringify(unavailableCart.body).includes('"isAvailable":false'), true);
  checks.add(36);
  const checkout = await commerceRequest("/api/commerce/customer/checkout", {
    body: {
      cartId: cart.id,
      cartVersion: (unavailableCart.body.data as { version: number }).version,
      customerInstructions: "Stage 3B unavailable probe",
      fulfillmentMethod: "CUSTOMER_PICKUP",
    },
    cookie: sessions.customer.cookie,
    headers: { "idempotency-key": randomUUID() },
    method: "POST",
  });
  assert.equal(checkout.response.status, 409);
  assert.match(JSON.stringify(checkout.body), /PRODUCT_UNAVAILABLE|VARIANT_UNAVAILABLE/);
  checks.add(37);

  const historicalOrder = await prisma.order.create({
    data: {
      currency: "IQD", customerId: sessions.customer.personId, customerNameSnapshot: "Stage 3B Customer",
      customerPhoneSnapshot: "+964750004001", fulfillmentMethod: "CUSTOMER_PICKUP", grandTotal: "10000",
      orderNumber: `STAGE3B-SMOKE-${runId}`, paymentMethod: "PAY_AT_PICKUP",
      reservationExpiresAt: new Date(Date.now() + 3_600_000), status: "CANCELLED", storeId: primary.storeId,
      storeNameSnapshot: "Stage 3B Store", storeSlugSnapshot: primary.storeSlug, subtotal: "10000",
      items: {
        create: {
          currency: "IQD", imageUrlSnapshot: `javascript:STAGE3B-ORDER-${runId}`, lineSubtotal: "10000",
          lineTotal: "10000", optionValuesSnapshot: {}, productId: product.id,
          productNameSnapshot: "Immutable Stage 3B Product", productVariantId: defaultForCart.id,
          quantity: 1, skuSnapshot: defaultForCart.sku, unitPrice: "10000", variantTitleSnapshot: "Immutable Variant",
        },
      },
    },
  });
  const orderDetail = await commerceRequest(`/api/commerce/customer/orders/${historicalOrder.id}`, { cookie: sessions.customer.cookie });
  assert.equal(orderDetail.response.status, 200);
  assert.equal(JSON.stringify(orderDetail.body).includes(`STAGE3B-ORDER-${runId}`), false);
  assert.match(JSON.stringify(orderDetail.body), /Immutable Stage 3B Product/);
  checks.add(17);
  checks.add(38);

  product = asProduct(await publishMerchantProduct(primary.reference, envelope(primary, product)));
  const mobileProduct = await commerceRequest(`/api/commerce/public/stores/${primary.storeSlug}/products/${product.slug}`, {
    headers: { "expo-origin": "rezno://", "user-agent": `rezno-stage3b-mobile-${runId}` },
  });
  assert.equal(mobileProduct.response.status, 200);
  assert.equal(JSON.stringify(mobileProduct.body).includes("javascript:"), false);
  checks.add(39);

  smokePhase = "archive-and-audit-counts";
  let archiveProduct = asProduct(await createMerchantProduct(primary.reference, createInput(primary, category.id, 99)));
  archiveProduct = asProduct(await archiveMerchantProduct(primary.reference, envelope(primary, archiveProduct)));
  assert.equal(archiveProduct.status, "ARCHIVED");
  checks.add(7);
  const [mutations, audits, movementsCount, adjustmentAudits] = await Promise.all([
    prisma.businessOperationMutation.count({ where: { organizationId: primary.organizationId } }),
    prisma.businessAuditLog.count({ where: { organizationId: primary.organizationId } }),
    prisma.stockMovement.count({ where: { inventoryItem: { variant: { storeId: primary.storeId } }, actorType: "MERCHANT" } }),
    prisma.businessAuditLog.count({ where: { organizationId: primary.organizationId, action: "commerce.inventory.adjust" } }),
  ]);
  const productAudits = await prisma.businessAuditLog.count({
    where: {
      organizationId: primary.organizationId,
      action: { not: "commerce.inventory.adjust" },
    },
  });
  assert.equal(productAudits, mutations);
  assert.equal(adjustmentAudits, movementsCount);
  assert.ok(mutations > 0 && audits > 0 && movementsCount > 0);
  finalCounts = { audits, movements: movementsCount, mutations };
  checks.add(40);
  assert.equal(checks.size, 40);
}

function createInput(context: Context, categoryId: string, index: number) {
  return {
    categoryId,
    contextOrganizationId: context.organizationId,
    defaultVariant: {
      compareAtPrice: "12000",
      optionValues: {},
      price: "10000",
      sku: `STAGE3B-${runId}-${index}`,
      title: "Default",
    },
    description: `Stage 3B smoke Product ${index}`,
    idempotencyKey: randomUUID(),
    name: `Stage 3B Smoke Product ${index}`,
    slug: `stage3b-smoke-${runId}-${index}`,
  };
}

function envelope(context: Context, product: ProductDto, override: Record<string, unknown> = {}) {
  return {
    contextOrganizationId: context.organizationId,
    expectedVersion: product.expectedVersion,
    idempotencyKey: randomUUID(),
    productId: product.id,
    ...override,
  };
}

function asProduct(value: unknown) {
  return value as ProductDto;
}

function domainCode(expected: CommerceDomainError["code"]) {
  return (error: unknown) => error instanceof CommerceDomainError && error.code === expected;
}

async function signUp(label: string, suffix: number): Promise<Session> {
  const request = {
    email: `stage3b-${runId}-${label}@rezno.invalid`,
    name: `Stage 3B ${label}`,
    password: `Rz!${randomUUID()}${randomUUID()}`,
  };
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      body: JSON.stringify(request),
      headers: requestHeaders({
        "content-type": "application/json",
        origin: authBaseUrl,
        "user-agent": `rezno-stage3b-${runId}-${label}`,
      }),
      method: "POST",
      redirect: "manual",
    });
    if (response.status !== 429) break;
    const retryAfter = Math.min(30, Math.max(1, Number(response.headers.get("retry-after") ?? "30")));
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000 + 250));
  }
  assert.ok(response);
  assert.equal(response.status, 200, `Authentication failed for ${label} with status ${response.status}.`);
  const payload = await response.json() as { user: { id: string } };
  const sessionCookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(sessionCookie, `Authentication cookie missing for ${label}.`);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id },
    data: { isOnboarded: true, phone: `+964750004${String(suffix).padStart(3, "0")}`, status: "ACTIVE" },
  });
  resources.userIds.push(payload.user.id);
  resources.personIds.push(person.id);
  return { cookie: sessionCookie.split(";")[0]!, personId: person.id, userId: payload.user.id };
}

async function createOrganizationContext(
  label: string,
  session: Session,
  systemRole: SystemRole,
  commercePermissions: CommercePermission[],
  storeStatus: "ACTIVE" | "DRAFT",
): Promise<Context> {
  const organization = await prisma.organization.create({
    data: { name: `Stage 3B Smoke ${label}`, slug: `stage3b-smoke-${runId}-${label}` },
  });
  resources.organizationIds.push(organization.id);
  const role = await prisma.role.create({
    data: { commercePermissions, isSystem: true, name: `stage3b-${runId}-${label}`, organizationId: organization.id, systemRole },
  });
  const membership = await prisma.organizationMember.create({
    data: { organizationId: organization.id, personId: session.personId, roleId: role.id },
  });
  const store = await prisma.store.create({
    data: {
      deliveryArea: "Karrada", deliveryCity: "Baghdad", deliveryEnabled: true, deliveryEstimateMinutes: 30,
      deliveryFee: "1000", minimumOrderValue: "0", name: `Stage 3B ${label} Store`, organizationId: organization.id,
      pickupArea: "Karrada", pickupCity: "Baghdad", pickupEnabled: true, pickupStreet: "Stage 3B Smoke Street",
      preparationEstimateMinutes: 15, publishedAt: storeStatus === "ACTIVE" ? new Date() : null,
      slug: `stage3b-smoke-${runId}-${label}-store`, status: storeStatus, supportPhone: "+964750004099",
    },
  });
  return {
    membershipId: membership.id,
    organizationId: organization.id,
    reference: { contextOrganizationId: organization.id, membershipId: membership.id, personId: session.personId },
    roleId: role.id,
    storeId: store.id,
    storeSlug: store.slug,
  };
}

async function addIdentity(
  context: Context,
  session: Session,
  label: string,
  systemRole: SystemRole,
  commercePermissions: CommercePermission[],
): Promise<Context> {
  const role = await prisma.role.create({
    data: { commercePermissions, isSystem: true, name: `stage3b-${runId}-${label}`, organizationId: context.organizationId, systemRole },
  });
  const membership = await prisma.organizationMember.create({
    data: { organizationId: context.organizationId, personId: session.personId, roleId: role.id },
  });
  return {
    ...context,
    membershipId: membership.id,
    reference: {
      contextOrganizationId: context.organizationId,
      membershipId: membership.id,
      personId: session.personId,
    },
    roleId: role.id,
  };
}

function activeCookie(sessionCookie: string, organizationId: string) {
  return `${sessionCookie}; rezno-active-business-id=${organizationId}`;
}

async function body(path: string, cookie?: string, rsc = false) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (rsc) { headers.accept = "text/x-component"; headers.rsc = "1"; }
  const response = await fetch(`${baseUrl}${path}`, { headers: requestHeaders(headers), redirect: "manual" });
  const text = await response.text();
  assertNoRaw(text);
  return { response, text };
}

async function submit(path: string, form: string, mutate: (parameters: URLSearchParams) => void, cookie: string) {
  const parameters = formParams(form);
  mutate(parameters);
  const requestBody = new FormData();
  for (const [key, value] of parameters) requestBody.append(key, value);
  const response = await fetch(`${baseUrl}${path}`, {
    body: requestBody,
    headers: requestHeaders({ cookie, origin: baseUrl, referer: `${baseUrl}${path}` }),
    method: "POST",
    redirect: "manual",
  });
  assert.ok([200, 303].includes(response.status), `Unexpected Server Action status ${response.status}.`);
  let responseBody = "";
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value?: undefined }>((resolve) => setTimeout(() => resolve({ done: true }), 750)),
      ]);
      if (result.done) break;
      responseBody += decoder.decode(result.value, { stream: true });
    }
    await reader.cancel();
  }
  assertNoRaw(responseBody);
  return response;
}

async function commerceRequest(
  path: string,
  options: { body?: unknown; cookie?: string; headers?: Record<string, string>; method?: string } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: requestHeaders({
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    }),
    method: options.method ?? "GET",
  });
  const text = await response.text();
  assertNoRaw(text);
  const responseBody = text ? JSON.parse(text) as Record<string, unknown> : {};
  return { body: responseBody, response };
}

function requestHeaders(initial: Record<string, string>) {
  const headers = new Headers(initial);
  headers.set("x-vercel-protection-bypass", bypass);
  return headers;
}

function decodeHtml(value: string) {
  return value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
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
  assert.ok(form, `Expected staging form ${JSON.stringify(Object.keys(expected).sort())}.`);
  return form;
}

function routeText(text: string) {
  return text.replaceAll("\\/", "/");
}

function assertForbidden(response: Response, text: string) {
  assert.ok([200, 302, 303, 307, 308, 403].includes(response.status));
  assert.equal(routeText(text).includes("/business/commerce/products"), false);
  assertNoRaw(text);
}

function assertNoRaw(text: string) {
  assert.doesNotMatch(text, /DATABASE_URL|PrismaClient|PostgreSQL|postgres(?:ql)?:\/\/|Invalid `prisma\.|ep-[a-z0-9-]+\.(?:aws\.)?neon\.tech/i);
}

async function cleanup() {
  const stores = await prisma.store.findMany({ where: { organizationId: { in: resources.organizationIds } }, select: { id: true } });
  const storeIds = stores.map((store) => store.id);
  const products = await prisma.product.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const productIds = products.map((product) => product.id);
  const variants = await prisma.productVariant.findMany({ where: { productId: { in: productIds } }, select: { id: true } });
  const variantIds = variants.map((variant) => variant.id);
  const inventories = await prisma.inventoryItem.findMany({ where: { variantId: { in: variantIds } }, select: { id: true } });
  const inventoryIds = inventories.map((inventory) => inventory.id);
  const orders = await prisma.order.findMany({
    where: { OR: [{ storeId: { in: storeIds } }, { customerId: { in: resources.personIds } }] },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  const reservations = await prisma.inventoryReservation.findMany({
    where: { OR: [{ inventoryItemId: { in: inventoryIds } }, { orderId: { in: orderIds } }] },
    select: { id: true },
  });
  const reservationIds = reservations.map((reservation) => reservation.id);

  await prisma.$transaction(async (transaction) => {
    await transaction.notification.deleteMany({
      where: { OR: [{ businessId: { in: resources.organizationIds } }, { recipientPersonId: { in: resources.personIds } }] },
    });
    await transaction.customerFavoriteProduct.deleteMany({ where: { OR: [{ customerId: { in: resources.personIds } }, { productId: { in: productIds } }] } });
    await transaction.customerFavoriteStore.deleteMany({ where: { OR: [{ customerId: { in: resources.personIds } }, { storeId: { in: storeIds } }] } });
    await transaction.stockMovement.deleteMany({
      where: { OR: [{ inventoryItemId: { in: inventoryIds } }, { orderId: { in: orderIds } }, { reservationId: { in: reservationIds } }] },
    });
    await transaction.inventoryReservation.deleteMany({ where: { id: { in: reservationIds } } });
    await transaction.checkoutIdempotency.deleteMany({ where: { OR: [{ customerId: { in: resources.personIds } }, { orderId: { in: orderIds } }] } });
    await transaction.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await transaction.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await transaction.orderAddress.deleteMany({ where: { orderId: { in: orderIds } } });
    await transaction.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await transaction.order.deleteMany({ where: { id: { in: orderIds } } });
    await transaction.cart.deleteMany({ where: { OR: [{ customerId: { in: resources.personIds } }, { storeId: { in: storeIds } }] } });
    await transaction.productMedia.deleteMany({ where: { productId: { in: productIds } } });
    await transaction.inventoryItem.deleteMany({ where: { id: { in: inventoryIds } } });
    await transaction.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    await transaction.product.deleteMany({ where: { id: { in: productIds } } });
    await transaction.businessOperationMutation.deleteMany({ where: { organizationId: { in: resources.organizationIds } } });
    await transaction.businessAuditLog.deleteMany({ where: { organizationId: { in: resources.organizationIds } } });
    await transaction.store.deleteMany({ where: { id: { in: storeIds } } });
    await transaction.organizationMember.deleteMany({ where: { organizationId: { in: resources.organizationIds } } });
    await transaction.role.deleteMany({ where: { organizationId: { in: resources.organizationIds } } });
    await transaction.organizationSettings.deleteMany({ where: { organizationId: { in: resources.organizationIds } } });
    await transaction.organization.deleteMany({ where: { id: { in: resources.organizationIds } } });
    await transaction.marketplaceCategory.deleteMany({ where: { id: { in: resources.categoryIds } } });
    await transaction.account.deleteMany({ where: { userId: { in: resources.userIds } } });
    await transaction.session.deleteMany({ where: { userId: { in: resources.userIds } } });
    await transaction.person.deleteMany({ where: { id: { in: resources.personIds } } });
    await transaction.user.deleteMany({ where: { id: { in: resources.userIds } } });
  }, { timeout: 120_000 });

  const [categories, organizations, people, users] = await Promise.all([
    prisma.marketplaceCategory.count({ where: { id: { in: resources.categoryIds } } }),
    prisma.organization.count({ where: { id: { in: resources.organizationIds } } }),
    prisma.person.count({ where: { id: { in: resources.personIds } } }),
    prisma.user.count({ where: { id: { in: resources.userIds } } }),
  ]);
  assert.deepEqual({ categories, organizations, people, users }, { categories: 0, organizations: 0, people: 0, users: 0 });
}

async function runSmoke() {
  let failure: unknown;
  let failedPhase = "";
  let cleanupFailure: unknown;
  try {
    await main();
  } catch (error) {
    failure = error;
    failedPhase = smokePhase;
  }
  try {
    await cleanup();
    if (!failure) checks.add(41);
  } catch (error) {
    cleanupFailure = error;
  }
  await prisma.$disconnect();
  if (failure || cleanupFailure) {
    const messages = [];
    if (failure) messages.push(`phase=${failedPhase || "unknown"} ${failure instanceof Error ? failure.message : "unknown smoke failure"}`);
    if (cleanupFailure) messages.push(`cleanup=${cleanupFailure instanceof Error ? cleanupFailure.message : "unknown cleanup failure"}`);
    console.error(`Stage 3B authenticated staging smoke failed: ${safeFailure(messages.join("; "))}`);
    process.exitCode = 1;
    return;
  }
  assert.equal(checks.size, 41);
  console.log(
    `Stage 3B authenticated staging smoke passed. identities=5 checks=${checks.size} audits=${finalCounts.audits} mutations=${finalCounts.mutations} movements=${finalCounts.movements} cleanup=verified confirmation=${COMMERCE_PRODUCTS_INVENTORY_STAGE3B_SMOKE_CONFIRMATION.length}`,
  );
}

void runSmoke();

function safeFailure(message: string) {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]")
    .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
    .slice(0, 500);
}
