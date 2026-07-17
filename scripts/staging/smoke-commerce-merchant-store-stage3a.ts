import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { CommercePermission, StoreStatus, SystemRole } from "@prisma/client";

import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../features/identity/policies/authorization";
import { prisma } from "../../lib/db/prisma";
import {
  assertCommerceStage3aSmokeSafety,
  COMMERCE_STAGE3A_SMOKE_CONFIRMATION,
} from "./commerce-merchant-store-stage3a-smoke-safety";

type Session = {
  cookie: string;
  personId: string;
  userId: string;
};

type Resources = {
  cartIds: string[];
  inventoryItemIds: string[];
  inventoryReservationIds: string[];
  marketplaceCategoryIds: string[];
  orderIds: string[];
  organizationIds: string[];
  personIds: string[];
  productIds: string[];
  productVariantIds: string[];
  storeIds: string[];
  userIds: string[];
};

const baseUrl = process.env.COMMERCE_STAGING_BASE_URL?.replace(/\/$/, "") ?? "";
const authBaseUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const runId = randomUUID().replaceAll("-", "").slice(0, 16);
const checks = new Set<number>();
let smokePhase = "staging-safety";
const resources: Resources = {
  cartIds: [],
  inventoryItemIds: [],
  inventoryReservationIds: [],
  marketplaceCategoryIds: [],
  orderIds: [],
  organizationIds: [],
  personIds: [],
  productIds: [],
  productVariantIds: [],
  storeIds: [],
  userIds: [],
};

async function main() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assertCommerceStage3aSmokeSafety({
    authBaseUrl,
    baseUrl,
    confirmation: process.env.COMMERCE_STAGE3A_SMOKE_CONFIRM,
    database: rows[0]?.database ?? "",
    vercelEnvironment: process.env.VERCEL_ENV,
  });
  assert.ok(bypass, "Vercel preview protection bypass is required.");

  smokePhase = "identity-setup";
  const sessions = {
    owner: await signUp("owner", 1),
    managerAllowed: await signUp("manager-allowed", 2),
    managerDenied: await signUp("manager-denied", 3),
    receptionist: await signUp("receptionist", 4),
    staffAllowed: await signUp("staff-allowed", 5),
    staffDenied: await signUp("staff-denied", 6),
    foreignOwner: await signUp("foreign-owner", 7),
    reviewer: await signUp("reviewer", 8),
    readOnlyAdmin: await signUp("read-only-admin", 9),
    expiredAdmin: await signUp("expired-admin", 10),
  };
  assert.equal(new Set(Object.values(sessions).map((session) => session.userId)).size, 10);

  const organizations = {
    primary: await createOrganization("primary"),
    foreign: await createOrganization("foreign"),
    collision: await createOrganization("collision"),
    orderConflict: await createOrganization("order-conflict"),
    reservationConflict: await createOrganization("reservation-conflict"),
    adminProbe: await createOrganization("admin-probe"),
    money: await createOrganization("money-capacity"),
    safetySuspended: await createOrganization("legacy-suspended"),
  };

  const roles = {
    owner: await createRole(organizations.primary.id, "owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    collisionOwner: await createRole(organizations.collision.id, "collision-owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    orderOwner: await createRole(organizations.orderConflict.id, "order-owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    reservationOwner: await createRole(organizations.reservationConflict.id, "reservation-owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    moneyOwner: await createRole(organizations.money.id, "money-owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    safetySuspendedOwner: await createRole(organizations.safetySuspended.id, "legacy-suspended-owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    foreignOwner: await createRole(organizations.foreign.id, "foreign-owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    managerAllowed: await createRole(organizations.primary.id, "manager-allowed", "MANAGER", ["STORE_VIEW"]),
    managerDenied: await createRole(organizations.primary.id, "manager-denied", "MANAGER", []),
    receptionist: await createRole(organizations.primary.id, "receptionist", "RECEPTIONIST", ["STORE_VIEW"]),
    staffAllowed: await createRole(organizations.primary.id, "staff-allowed", "STAFF", ["INVENTORY_VIEW"]),
    staffDenied: await createRole(organizations.primary.id, "staff-denied", "STAFF", []),
    managerGrant: await createRole(organizations.primary.id, "manager-grant", "MANAGER", []),
  };

  const memberships = {
    owner: await createMember(organizations.primary.id, sessions.owner.personId, roles.owner.id),
    collisionOwner: await createMember(organizations.collision.id, sessions.owner.personId, roles.collisionOwner.id),
    orderOwner: await createMember(organizations.orderConflict.id, sessions.owner.personId, roles.orderOwner.id),
    reservationOwner: await createMember(organizations.reservationConflict.id, sessions.owner.personId, roles.reservationOwner.id),
    moneyOwner: await createMember(organizations.money.id, sessions.owner.personId, roles.moneyOwner.id),
    safetySuspendedOwner: await createMember(organizations.safetySuspended.id, sessions.owner.personId, roles.safetySuspendedOwner.id),
    foreignOwner: await createMember(organizations.foreign.id, sessions.foreignOwner.personId, roles.foreignOwner.id),
    managerAllowed: await createMember(organizations.primary.id, sessions.managerAllowed.personId, roles.managerAllowed.id),
    managerDenied: await createMember(organizations.primary.id, sessions.managerDenied.personId, roles.managerDenied.id),
    receptionist: await createMember(organizations.primary.id, sessions.receptionist.personId, roles.receptionist.id),
    staffAllowed: await createMember(organizations.primary.id, sessions.staffAllowed.personId, roles.staffAllowed.id),
    staffDenied: await createMember(organizations.primary.id, sessions.staffDenied.personId, roles.staffDenied.id),
  };

  await Promise.all([
    prisma.adminAccess.create({
      data: {
        permissions: ["COMMERCE_STORES_VIEW", "COMMERCE_STORES_REVIEW"],
        userId: sessions.reviewer.userId,
      },
    }),
    prisma.adminAccess.create({
      data: { permissions: ["COMMERCE_STORES_VIEW"], userId: sessions.readOnlyAdmin.userId },
    }),
    prisma.adminAccess.create({
      data: {
        expiresAt: new Date(0),
        permissions: ["COMMERCE_STORES_VIEW", "COMMERCE_STORES_REVIEW"],
        userId: sessions.expiredAdmin.userId,
      },
    }),
  ]);

  const directStores = {
    foreign: await createStore(organizations.foreign.id, "foreign", "ACTIVE"),
    orderConflict: await createStore(organizations.orderConflict.id, "order-conflict", "DRAFT"),
    reservationConflict: await createStore(organizations.reservationConflict.id, "reservation-conflict", "DRAFT"),
    adminProbe: await createStore(organizations.adminProbe.id, "admin-probe", "PENDING_REVIEW"),
    money: await createStore(organizations.money.id, "money-capacity", "DRAFT"),
    safetySuspended: await createStore(organizations.safetySuspended.id, "legacy-suspended", "SUSPENDED"),
  };

  const cookies = {
    owner: activeCookie(sessions.owner.cookie, organizations.primary.id),
    collisionOwner: activeCookie(sessions.owner.cookie, organizations.collision.id),
    orderOwner: activeCookie(sessions.owner.cookie, organizations.orderConflict.id),
    reservationOwner: activeCookie(sessions.owner.cookie, organizations.reservationConflict.id),
    moneyOwner: activeCookie(sessions.owner.cookie, organizations.money.id),
    safetySuspendedOwner: activeCookie(sessions.owner.cookie, organizations.safetySuspended.id),
    foreignOwner: activeCookie(sessions.foreignOwner.cookie, organizations.foreign.id),
    managerAllowed: activeCookie(sessions.managerAllowed.cookie, organizations.primary.id),
    managerDenied: activeCookie(sessions.managerDenied.cookie, organizations.primary.id),
    receptionist: activeCookie(sessions.receptionist.cookie, organizations.primary.id),
    staffAllowed: activeCookie(sessions.staffAllowed.cookie, organizations.primary.id),
    staffDenied: activeCookie(sessions.staffDenied.cookie, organizations.primary.id),
    reviewer: sessions.reviewer.cookie,
    readOnlyAdmin: sessions.readOnlyAdmin.cookie,
    expiredAdmin: sessions.expiredAdmin.cookie,
  };

  smokePhase = "baseline-role-and-lifecycle-contracts";
  const ownerHub = await body("/business/commerce", cookies.owner);
  assert.equal(ownerHub.response.status, 200);
  assert.match(routeText(ownerHub.text), /\/business\/commerce\/store/);
  assert.match(routeText(ownerHub.text), /\/business\/commerce\/access/);
  checks.add(1);

  const collisionPage = await body("/business/commerce/store", cookies.collisionOwner);
  const collisionForm = findForm(collisionPage.text, { mode: "create" });
  await submit("/business/commerce/store", collisionForm, (parameters) => {
    fillStore(parameters, "Collision", directStores.foreign.slug);
  }, cookies.collisionOwner);
  assert.equal(await prisma.store.count({ where: { organizationId: organizations.collision.id } }), 0);

  smokePhase = "store-money-capacity";
  const moneyPage = await body("/business/commerce/store", cookies.moneyOwner);
  let moneyForm = findForm(moneyPage.text, { mode: "update", storeId: directStores.money.id });
  await submit("/business/commerce/store", moneyForm, (parameters) => {
    parameters.set("deliveryFee", "999999999999999");
    parameters.set("minimumOrderValue", "999999999999999");
    parameters.set("idempotencyKey", randomUUID());
  }, cookies.moneyOwner);
  const maximumMoney = await prisma.store.findUniqueOrThrow({ where: { id: directStores.money.id } });
  assert.equal(maximumMoney.deliveryFee.toFixed(0), "999999999999999");
  assert.equal(maximumMoney.minimumOrderValue.toFixed(0), "999999999999999");
  moneyForm = findForm(
    (await body("/business/commerce/store", cookies.moneyOwner)).text,
    { mode: "update", storeId: directStores.money.id },
  );
  const moneyAuditBefore = await prisma.businessAuditLog.count({ where: { targetId: directStores.money.id } });
  const moneyLedgerBefore = await prisma.businessOperationMutation.count({ where: { targetId: directStores.money.id } });
  await submit("/business/commerce/store", moneyForm, (parameters) => {
    parameters.set("deliveryFee", "1000000000000000");
    parameters.set("idempotencyKey", randomUUID());
  }, cookies.moneyOwner);
  const afterMoneyOverflow = await prisma.store.findUniqueOrThrow({ where: { id: directStores.money.id } });
  assert.equal(afterMoneyOverflow.deliveryFee.toFixed(0), "999999999999999");
  assert.equal(afterMoneyOverflow.minimumOrderValue.toFixed(0), "999999999999999");
  assert.equal(await prisma.businessAuditLog.count({ where: { targetId: directStores.money.id } }), moneyAuditBefore);
  assert.equal(await prisma.businessOperationMutation.count({ where: { targetId: directStores.money.id } }), moneyLedgerBefore);
  moneyForm = findForm(
    (await body("/business/commerce/store", cookies.moneyOwner)).text,
    { mode: "update", storeId: directStores.money.id },
  );
  const moneyReplayKey = randomUUID();
  const canonicalMoney = (parameters: URLSearchParams, value: string) => {
    parameters.set("deliveryFee", value);
    parameters.set("minimumOrderValue", "0000");
    parameters.set("idempotencyKey", moneyReplayKey);
  };
  await submit("/business/commerce/store", moneyForm, (parameters) => canonicalMoney(parameters, "1"), cookies.moneyOwner);
  await submit("/business/commerce/store", moneyForm, (parameters) => canonicalMoney(parameters, "01"), cookies.moneyOwner);
  await submit("/business/commerce/store", moneyForm, (parameters) => canonicalMoney(parameters, "0001"), cookies.moneyOwner);
  assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: organizations.money.id, idempotencyKey: moneyReplayKey } }), 1);
  assert.equal(await prisma.businessAuditLog.count({ where: { targetId: directStores.money.id } }), moneyAuditBefore + 1);
  checks.add(31);
  checks.add(34);

  smokePhase = "merchant-store-lifecycle";
  const createPage = await body("/business/commerce/store", cookies.owner);
  const createForm = findForm(createPage.text, { mode: "create" });
  const primarySlug = `stage3a-smoke-${runId}`;
  const createInput = (parameters: URLSearchParams) => fillStore(parameters, "Authenticated", primarySlug);
  await submit("/business/commerce/store", createForm, createInput, cookies.owner);
  const primaryStore = await prisma.store.findUniqueOrThrow({ where: { organizationId: organizations.primary.id } });
  remember(resources.storeIds, primaryStore.id);
  assert.equal(primaryStore.status, "DRAFT");
  checks.add(2);

  await submit("/business/commerce/store", createForm, createInput, cookies.owner);
  assert.equal(await prisma.store.count({ where: { organizationId: organizations.primary.id } }), 1);
  assert.equal(await prisma.businessOperationMutation.count({
    where: { action: "commerce.store.create", targetId: primaryStore.id },
  }), 1);
  checks.add(3);

  const initialUpdatePage = await body("/business/commerce/store", cookies.owner);
  const initialUpdateForm = findForm(initialUpdatePage.text, { mode: "update", storeId: primaryStore.id });
  await submit("/business/commerce/store", initialUpdateForm, (parameters) => {
    parameters.delete("deliveryEnabled");
    parameters.delete("pickupEnabled");
  }, cookies.owner);
  let persisted = await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } });
  assert.equal(persisted.deliveryEnabled, false);
  assert.equal(persisted.pickupEnabled, false);
  checks.add(4);

  const unreadyPage = await body("/business/commerce/store", cookies.owner);
  const unreadySubmit = findForm(unreadyPage.text, { action: "submit", storeId: primaryStore.id });
  await submit("/business/commerce/store", unreadySubmit, () => undefined, cookies.owner);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).status, "DRAFT");

  const currentUpdateForm = findForm(unreadyPage.text, { mode: "update", storeId: primaryStore.id });
  await submit("/business/commerce/store", currentUpdateForm, (parameters) => {
    parameters.set("deliveryEnabled", "on");
    parameters.set("deliveryCity", "Baghdad");
    parameters.set("deliveryArea", "Karrada");
    parameters.set("deliveryEstimateMinutes", "45");
    parameters.set("pickupEnabled", "on");
    parameters.set("pickupCity", "Baghdad");
    parameters.set("pickupArea", "Karrada");
    parameters.set("pickupStreet", "Stage 3A Street");
  }, cookies.owner);
  persisted = await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } });
  assert.equal(persisted.deliveryEnabled, true);
  checks.add(6);

  await submit("/business/commerce/store", initialUpdateForm, (parameters) => {
    parameters.set("description", "STALE-OVERWRITE-MUST-NOT-PERSIST");
    parameters.set("idempotencyKey", randomUUID());
  }, cookies.owner);
  assert.notEqual(
    (await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).description,
    "STALE-OVERWRITE-MUST-NOT-PERSIST",
  );
  checks.add(5);

  const unsafePage = await body("/business/commerce/store", cookies.owner);
  const unsafeForm = findForm(unsafePage.text, { mode: "update", storeId: primaryStore.id });
  await submit("/business/commerce/store", unsafeForm, (parameters) => {
    parameters.set("logoUrl", "http://127.0.0.1/private-stage3a.png");
  }, cookies.owner);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).logoUrl, null);
  checks.add(28);

  const managerRead = await body("/business/commerce/store", cookies.managerAllowed, true);
  assert.equal(managerRead.response.status, 200);
  assert.match(managerRead.text, new RegExp(primarySlug));
  assert.equal(managerRead.text.includes('name="mode"'), false);
  checks.add(8);

  const ownerLatest = await body("/business/commerce/store", cookies.owner);
  const ownerLatestUpdate = findForm(ownerLatest.text, { mode: "update", storeId: primaryStore.id });
  const beforeManagerAttempt = (await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).supportPhone;
  await submit("/business/commerce/store", ownerLatestUpdate, (parameters) => {
    parameters.set("supportPhone", "+9647500000991");
    parameters.set("idempotencyKey", randomUUID());
  }, cookies.managerAllowed);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).supportPhone, beforeManagerAttempt);
  const managerDeniedPage = await body("/business", cookies.managerDenied);
  assert.equal(routeText(managerDeniedPage.text).includes("/business/commerce"), false);
  checks.add(9);

  for (const rsc of [false, true]) {
    const receptionistBusiness = await body("/business", cookies.receptionist, rsc);
    assert.equal(routeText(receptionistBusiness.text).includes("/business/commerce"), false);
    const direct = await body("/business/commerce", cookies.receptionist, rsc);
    assertForbidden(direct.response, direct.text);
  }
  checks.add(10);

  const staffAllowed = await body("/business", cookies.staffAllowed);
  assert.equal(routeText(staffAllowed.text).includes("/business/commerce"), true);
  assert.equal(routeText(staffAllowed.text).includes("/business/commerce/store"), false);
  assertForbidden(...responsePair(await body("/business/commerce/store", cookies.staffAllowed)));
  const staffDenied = await body("/business", cookies.staffDenied);
  assert.equal(routeText(staffDenied.text).includes("/business/commerce"), false);
  checks.add(11);

  const foreignPage = await body("/business/commerce/store", cookies.foreignOwner);
  assert.match(foreignPage.text, new RegExp(directStores.foreign.slug));
  assert.equal(foreignPage.text.includes(primaryStore.id), false);
  await submit("/business/commerce/store", ownerLatestUpdate, (parameters) => {
    parameters.set("description", "FOREIGN-OVERWRITE-MUST-NOT-PERSIST");
    parameters.set("idempotencyKey", randomUUID());
  }, cookies.foreignOwner);
  assert.notEqual(
    (await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).description,
    "FOREIGN-OVERWRITE-MUST-NOT-PERSIST",
  );
  checks.add(12);

  const accessPage = await body("/business/commerce/access", cookies.owner);
  const grantForm = findForm(accessPage.text, { roleId: roles.managerGrant.id });
  await submit("/business/commerce/access", grantForm, (parameters) => {
    parameters.delete("permissions");
    parameters.append("permissions", "STORE_MANAGE");
  }, cookies.owner);
  assert.deepEqual((await prisma.role.findUniqueOrThrow({ where: { id: roles.managerGrant.id } })).commercePermissions, []);
  const safeGrant = (parameters: URLSearchParams) => {
    parameters.delete("permissions");
    parameters.append("permissions", "STORE_VIEW");
  };
  await submit("/business/commerce/access", grantForm, safeGrant, cookies.owner);
  await submit("/business/commerce/access", grantForm, safeGrant, cookies.owner);
  assert.deepEqual(
    (await prisma.role.findUniqueOrThrow({ where: { id: roles.managerGrant.id } })).commercePermissions,
    ["STORE_VIEW"],
  );

  const readyPage = await body("/business/commerce/store", cookies.owner);
  const firstSubmit = findForm(readyPage.text, { action: "submit", storeId: primaryStore.id });
  await submit("/business/commerce/store", firstSubmit, () => undefined, cookies.owner);
  await submit("/business/commerce/store", firstSubmit, () => undefined, cookies.owner);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).status, "PENDING_REVIEW");
  checks.add(7);

  const queue = await body("/admin/commerce/stores?status=PENDING_REVIEW", cookies.reviewer);
  assert.equal(queue.response.status, 200);
  assert.match(queue.text, new RegExp(primaryStore.id));
  assert.equal(queue.text.includes("customerPhoneSnapshot"), false);
  checks.add(13);

  const pendingPublic = await publicStore(primarySlug);
  assert.equal(pendingPublic.status, 404);

  const pendingDetail = await body(`/admin/commerce/stores/${primaryStore.id}`, cookies.reviewer);
  const rejectForm = findForm(pendingDetail.text, { action: "reject", storeId: primaryStore.id });
  const reject = (parameters: URLSearchParams) => parameters.set("reason", "Stage 3A correction required");
  await submit(`/admin/commerce/stores/${primaryStore.id}`, rejectForm, reject, cookies.reviewer);
  await submit(`/admin/commerce/stores/${primaryStore.id}`, rejectForm, reject, cookies.reviewer);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).status, "REJECTED");
  assert.equal((await publicStore(primarySlug)).status, 404);

  const rejectedMerchant = await body("/business/commerce/store", cookies.owner);
  const reopenForm = findForm(rejectedMerchant.text, { action: "reopen", storeId: primaryStore.id });
  await submit("/business/commerce/store", reopenForm, () => undefined, cookies.owner);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).status, "DRAFT");
  const reopenedMerchant = await body("/business/commerce/store", cookies.owner);
  const secondSubmit = findForm(reopenedMerchant.text, { action: "submit", storeId: primaryStore.id });
  await submit("/business/commerce/store", secondSubmit, () => undefined, cookies.owner);
  await submit("/business/commerce/store", secondSubmit, () => undefined, cookies.owner);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).status, "PENDING_REVIEW");
  assert.equal((await publicStore(primarySlug)).status, 404);
  checks.add(15);

  const secondPendingDetail = await body(`/admin/commerce/stores/${primaryStore.id}`, cookies.reviewer);
  const approveForm = findForm(secondPendingDetail.text, { action: "approve", storeId: primaryStore.id });
  await submit(`/admin/commerce/stores/${primaryStore.id}`, approveForm, () => undefined, cookies.reviewer);
  await submit(`/admin/commerce/stores/${primaryStore.id}`, approveForm, () => undefined, cookies.reviewer);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).status, "ACTIVE");
  checks.add(14);

  smokePhase = "legacy-store-media-serialization";
  assert.equal((await publicStore(primarySlug)).status, 200);
  const unsafeSentinel = `https://127.0.0.1/${runId}-legacy-store.png`;
  const unsafeCoverSentinel = `https://user:password@private.example/${runId}-legacy-cover.png`;
  const beforeLegacyClear = await prisma.store.update({
    where: { id: primaryStore.id },
    data: {
      coverImageUrl: unsafeCoverSentinel,
      logoUrl: unsafeSentinel,
    },
  });
  const safetyCategory = await prisma.marketplaceCategory.create({
    data: {
      name: `Stage 3A safety ${runId}`,
      normalizedName: `stage-3a-safety-${runId}`,
      slug: `stage-3a-safety-${runId}`,
    },
  });
  remember(resources.marketplaceCategoryIds, safetyCategory.id);
  const safetyProduct = await prisma.product.create({
    data: {
      categoryId: safetyCategory.id,
      name: "Stage 3A safety Product",
      normalizedSearchText: "stage 3a safety product",
      publishedAt: new Date(),
      slug: `stage3a-safety-${runId}`,
      status: "PUBLISHED",
      storeId: primaryStore.id,
    },
  });
  remember(resources.productIds, safetyProduct.id);
  const safetyVariant = await prisma.productVariant.create({
    data: {
      isDefault: true,
      optionKey: "default",
      optionValues: {},
      price: "999999999999999",
      productId: safetyProduct.id,
      sku: `STAGE3A-SAFETY-${runId}`,
      storeId: primaryStore.id,
      title: "Default",
    },
  });
  remember(resources.productVariantIds, safetyVariant.id);
  const safetyInventory = await prisma.inventoryItem.create({
    data: { onHand: 2, variantId: safetyVariant.id },
  });
  remember(resources.inventoryItemIds, safetyInventory.id);

  for (const rsc of [false, true]) {
    const merchantSafety = await body("/business/commerce/store", cookies.owner, rsc);
    assert.equal(merchantSafety.response.status, 200);
    assert.equal(merchantSafety.text.includes(unsafeSentinel), false);
    assert.equal(merchantSafety.text.includes(unsafeCoverSentinel), false);
    const adminSafety = await body(`/admin/commerce/stores/${primaryStore.id}`, cookies.reviewer, rsc);
    assert.equal(adminSafety.response.status, 200);
    assert.equal(adminSafety.text.includes(unsafeSentinel), false);
    assert.equal(adminSafety.text.includes(unsafeCoverSentinel), false);
  }
  const storeListSafety = await page("/api/commerce/public/stores?limit=50", undefined, false, "REZNO-Expo-Mobile-Gate3A-Safety");
  const storeListSafetyText = await storeListSafety.text();
  assert.equal(storeListSafety.status, 200);
  assert.equal(storeListSafetyText.includes(unsafeSentinel), false);
  assert.equal(storeListSafetyText.includes(unsafeCoverSentinel), false);
  const listedSafetyStore = (JSON.parse(storeListSafetyText) as {
    data: Array<{ coverImageUrl: string | null; logoUrl: string | null; slug: string }>;
  }).data.find((store) => store.slug === primarySlug);
  assert.ok(listedSafetyStore);
  assert.equal(listedSafetyStore.logoUrl, null);
  assert.equal(listedSafetyStore.coverImageUrl, null);
  const publicSafety = await page(`/api/commerce/public/stores/${primarySlug}`, undefined, false, "REZNO-Expo-Mobile-Gate3A-Safety");
  const publicSafetyText = await publicSafety.text();
  assert.equal(publicSafety.status, 200);
  assert.equal(publicSafetyText.includes(unsafeSentinel), false);
  assert.equal(publicSafetyText.includes(unsafeCoverSentinel), false);
  const publicSafetyStore = (JSON.parse(publicSafetyText) as { data: { coverImageUrl: string | null; logoUrl: string | null } }).data;
  assert.equal(publicSafetyStore.logoUrl, null);
  assert.equal(publicSafetyStore.coverImageUrl, null);
  const productSafety = await page(`/api/commerce/public/stores/${primarySlug}/products/${safetyProduct.slug}`, undefined, false, "REZNO-Expo-Mobile-Gate3A-Safety");
  const productSafetyText = await productSafety.text();
  assert.equal(productSafety.status, 200);
  assert.equal(productSafetyText.includes(unsafeSentinel), false);
  assert.equal(productSafetyText.includes(unsafeCoverSentinel), false);
  const nestedSafetyStore = (JSON.parse(productSafetyText) as { data: { store: { coverImageUrl: string | null; logoUrl: string | null } } }).data.store;
  assert.equal(nestedSafetyStore.logoUrl, null);
  assert.equal(nestedSafetyStore.coverImageUrl, null);
  checks.add(35);

  await prisma.store.update({
    where: { id: primaryStore.id },
    data: { coverImageUrl: `https://cdn.example.com/${runId}-safe-cover.png` },
  });

  smokePhase = "owner-store-media-remediation";
  const remediationPage = await body("/business/commerce/store", cookies.owner);
  const remediationForm = findForm(remediationPage.text, { action: "clearUnsafeImages", storeId: primaryStore.id });
  await submit("/business/commerce/store", remediationForm, () => undefined, cookies.owner);
  await submit("/business/commerce/store", remediationForm, () => undefined, cookies.owner);
  const remediated = await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } });
  assert.equal(remediated.logoUrl, null);
  assert.equal(remediated.coverImageUrl, `https://cdn.example.com/${runId}-safe-cover.png`);
  assert.equal(remediated.status, "ACTIVE");
  assert.equal(remediated.publishedAt?.toISOString(), beforeLegacyClear.publishedAt?.toISOString());
  assert.equal(await prisma.businessAuditLog.count({ where: { action: "commerce.store.images.clear-unsafe", targetId: primaryStore.id } }), 1);
  assert.equal(await prisma.businessOperationMutation.count({ where: { action: "commerce.store.images.clear-unsafe", targetId: primaryStore.id } }), 1);

  const foreignBeforeChangedReplay = await prisma.store.findUniqueOrThrow({ where: { id: directStores.foreign.id } });
  await submit("/business/commerce/store", remediationForm, (parameters) => {
    parameters.set("expectedVersion", foreignBeforeChangedReplay.updatedAt.toISOString());
    parameters.set("storeId", directStores.foreign.id);
  }, cookies.owner);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: directStores.foreign.id } })).updatedAt.toISOString(), foreignBeforeChangedReplay.updatedAt.toISOString());

  const staleUnsafe = `https://localhost/${runId}-stale-legacy.png`;
  await prisma.store.update({ where: { id: primaryStore.id }, data: { logoUrl: staleUnsafe } });
  const staleRemediationForm = findForm((await body("/business/commerce/store", cookies.owner)).text, {
    action: "clearUnsafeImages",
    storeId: primaryStore.id,
  });
  const preservedCover = `https://cdn.example.com/${runId}-preserved-cover.png`;
  await prisma.store.update({ where: { id: primaryStore.id }, data: { coverImageUrl: preservedCover } });
  const remediationAuditBeforeDenied = await prisma.businessAuditLog.count({ where: { action: "commerce.store.images.clear-unsafe", targetId: primaryStore.id } });
  const remediationLedgerBeforeDenied = await prisma.businessOperationMutation.count({ where: { action: "commerce.store.images.clear-unsafe", targetId: primaryStore.id } });
  await submit("/business/commerce/store", staleRemediationForm, () => undefined, cookies.owner);

  const deniedRemediationForm = findForm((await body("/business/commerce/store", cookies.owner)).text, {
    action: "clearUnsafeImages",
    storeId: primaryStore.id,
  });
  const deniedKeys: string[] = [];
  for (const cookie of [cookies.managerAllowed, cookies.receptionist, cookies.staffAllowed]) {
    const key = randomUUID();
    deniedKeys.push(key);
    await submit("/business/commerce/store", deniedRemediationForm, (parameters) => parameters.set("idempotencyKey", key), cookie);
  }

  const foreignKey = randomUUID();
  await submit("/business/commerce/store", deniedRemediationForm, (parameters) => {
    parameters.set("expectedVersion", foreignBeforeChangedReplay.updatedAt.toISOString());
    parameters.set("idempotencyKey", foreignKey);
    parameters.set("storeId", directStores.foreign.id);
  }, cookies.owner);

  const noOpKey = randomUUID();
  await submit("/business/commerce/store", deniedRemediationForm, (parameters) => {
    parameters.set("contextOrganizationId", organizations.foreign.id);
    parameters.set("expectedVersion", foreignBeforeChangedReplay.updatedAt.toISOString());
    parameters.set("idempotencyKey", noOpKey);
    parameters.set("storeId", directStores.foreign.id);
  }, cookies.foreignOwner);

  const beforeConcurrency = await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } });
  assert.equal(beforeConcurrency.logoUrl, staleUnsafe);
  assert.equal(beforeConcurrency.coverImageUrl, preservedCover);
  const concurrentRemediationForm = findForm((await body("/business/commerce/store", cookies.owner)).text, {
    action: "clearUnsafeImages",
    storeId: primaryStore.id,
  });
  await Promise.all([
    submit("/business/commerce/store", concurrentRemediationForm, () => undefined, cookies.owner),
    submit("/business/commerce/store", concurrentRemediationForm, () => undefined, cookies.owner),
  ]);
  const afterConcurrency = await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } });
  assert.equal(afterConcurrency.logoUrl, null);
  assert.equal(afterConcurrency.coverImageUrl, preservedCover);
  assert.equal(afterConcurrency.status, "ACTIVE");
  assert.equal(afterConcurrency.publishedAt?.toISOString(), beforeLegacyClear.publishedAt?.toISOString());
  assert.equal(await prisma.businessAuditLog.count({ where: { action: "commerce.store.images.clear-unsafe", targetId: primaryStore.id } }), remediationAuditBeforeDenied + 1);
  assert.equal(await prisma.businessOperationMutation.count({ where: { action: "commerce.store.images.clear-unsafe", targetId: primaryStore.id } }), remediationLedgerBeforeDenied + 1);
  assert.equal(await prisma.businessOperationMutation.count({ where: { idempotencyKey: { in: [...deniedKeys, foreignKey, noOpKey] } } }), 0);
  assert.equal(await prisma.businessAuditLog.count({ where: { action: "commerce.store.images.clear-unsafe", targetId: directStores.foreign.id } }), 0);
  checks.add(36);

  smokePhase = "suspended-store-media-remediation";
  const suspendedUnsafe = `javascript:${runId}-legacy-suspended`;
  const suspendedBefore = await prisma.store.update({
    where: { id: directStores.safetySuspended.id },
    data: { coverImageUrl: `https://cdn.example.com/${runId}-suspended-safe-cover.png`, logoUrl: suspendedUnsafe },
  });
  const suspendedSafetyPage = await body("/business/commerce/store", cookies.safetySuspendedOwner);
  assert.equal(suspendedSafetyPage.text.includes(suspendedUnsafe), false);
  const suspendedRemediation = findForm(suspendedSafetyPage.text, {
    action: "clearUnsafeImages",
    storeId: directStores.safetySuspended.id,
  });
  await submit("/business/commerce/store", suspendedRemediation, () => undefined, cookies.safetySuspendedOwner);
  await submit("/business/commerce/store", suspendedRemediation, () => undefined, cookies.safetySuspendedOwner);
  const suspendedAfter = await prisma.store.findUniqueOrThrow({ where: { id: directStores.safetySuspended.id } });
  assert.equal(suspendedAfter.logoUrl, null);
  assert.equal(suspendedAfter.coverImageUrl, `https://cdn.example.com/${runId}-suspended-safe-cover.png`);
  assert.equal(suspendedAfter.status, "SUSPENDED");
  assert.equal(suspendedAfter.publishedAt?.toISOString(), suspendedBefore.publishedAt?.toISOString());
  assert.equal((await publicStore(directStores.safetySuspended.slug)).status, 404);
  assert.equal(await prisma.businessAuditLog.count({ where: { action: "commerce.store.images.clear-unsafe", targetId: directStores.safetySuspended.id } }), 1);
  assert.equal(await prisma.businessOperationMutation.count({ where: { action: "commerce.store.images.clear-unsafe", targetId: directStores.safetySuspended.id } }), 1);
  checks.add(32);
  checks.add(37);

  smokePhase = "checkout-overflow-rollback";
  const overflowCart = await prisma.cart.create({
    data: {
      customerId: sessions.reviewer.personId,
      items: { create: { productVariantId: safetyVariant.id, quantity: 2, unitPriceSnapshot: "999999999999999" } },
      storeId: primaryStore.id,
    },
  });
  remember(resources.cartIds, overflowCart.id);
  const overflowNotificationBefore = await prisma.notification.count({ where: { recipientPersonId: { in: [sessions.owner.personId, sessions.reviewer.personId] } } });
  const overflowInventoryBefore = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: safetyInventory.id } });
  const overflowKey = randomUUID();
  const overflowCheckout = await commerceRequest("/api/commerce/customer/checkout", {
    body: {
      cartId: overflowCart.id,
      cartVersion: overflowCart.version,
      fulfillmentMethod: "CUSTOMER_PICKUP",
    },
    cookie: sessions.reviewer.cookie,
    headers: { "idempotency-key": overflowKey },
    method: "POST",
  });
  assert.equal(overflowCheckout.response.status, 400);
  assert.equal((overflowCheckout.body as { error: { code: string } }).error.code, "INVALID_REQUEST");
  assert.equal(await prisma.order.count({ where: { customerId: sessions.reviewer.personId, storeId: primaryStore.id } }), 0);
  assert.equal(await prisma.payment.count({ where: { order: { customerId: sessions.reviewer.personId, storeId: primaryStore.id } } }), 0);
  assert.equal(await prisma.checkoutIdempotency.count({ where: { customerId: sessions.reviewer.personId, key: overflowKey } }), 0);
  const overflowInventoryAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: safetyInventory.id } });
  assert.equal(overflowInventoryAfter.onHand, overflowInventoryBefore.onHand);
  assert.equal(overflowInventoryAfter.reserved, overflowInventoryBefore.reserved);
  assert.equal(overflowInventoryAfter.version, overflowInventoryBefore.version);
  assert.equal(await prisma.inventoryReservation.count({ where: { productVariantId: safetyVariant.id } }), 0);
  assert.equal(await prisma.stockMovement.count({ where: { inventoryItemId: safetyInventory.id } }), 0);
  assert.equal(await prisma.notification.count({ where: { recipientPersonId: { in: [sessions.owner.personId, sessions.reviewer.personId] } } }), overflowNotificationBefore);
  const overflowCartAfter = await prisma.cart.findUniqueOrThrow({ where: { id: overflowCart.id } });
  assert.equal(overflowCartAfter.status, "ACTIVE");
  assert.equal(overflowCartAfter.version, overflowCart.version);
  await prisma.cart.delete({ where: { id: overflowCart.id } });
  checks.add(33);
  checks.add(38);

  smokePhase = "checkout-maximum-boundary";
  const maximumCart = await prisma.cart.create({
    data: {
      customerId: sessions.reviewer.personId,
      items: { create: { productVariantId: safetyVariant.id, quantity: 1, unitPriceSnapshot: "999999999999999" } },
      storeId: primaryStore.id,
    },
  });
  remember(resources.cartIds, maximumCart.id);
  const maximumCheckoutKey = randomUUID();
  const maximumCheckout = await commerceRequest("/api/commerce/customer/checkout", {
    body: { cartId: maximumCart.id, cartVersion: maximumCart.version, fulfillmentMethod: "CUSTOMER_PICKUP" },
    cookie: sessions.reviewer.cookie,
    headers: { "idempotency-key": maximumCheckoutKey },
    method: "POST",
  });
  assert.equal(maximumCheckout.response.status, 201);
  const maximumReceipt = (maximumCheckout.body as { data: { grandTotal: string; id: string; subtotal: string } }).data;
  assert.equal(maximumReceipt.subtotal, "999999999999999.000");
  assert.equal(maximumReceipt.grandTotal, "999999999999999.000");
  remember(resources.orderIds, maximumReceipt.id);
  const maximumOrder = await prisma.order.findUniqueOrThrow({
    where: { id: maximumReceipt.id },
    include: { checkoutIdempotency: true, items: true, payment: true, reservations: true, stockMovements: true },
  });
  assert.equal(maximumOrder.subtotal.toFixed(0), "999999999999999");
  assert.equal(maximumOrder.grandTotal.toFixed(0), "999999999999999");
  assert.equal(maximumOrder.items.length, 1);
  assert.equal(maximumOrder.payment?.amount.toFixed(0), "999999999999999");
  assert.equal(maximumOrder.reservations.length, 1);
  assert.equal(maximumOrder.stockMovements.length, 1);
  assert.equal(maximumOrder.checkoutIdempotency?.status, "COMPLETED");
  assert.equal(await prisma.notification.count({ where: { eventKey: { contains: maximumReceipt.id } } }), 2);
  assert.equal((await prisma.cart.findUniqueOrThrow({ where: { id: maximumCart.id } })).status, "CONVERTED");
  checks.add(39);

  smokePhase = "post-probe-regressions";
  const activeDetail = await body(`/admin/commerce/stores/${primaryStore.id}`, cookies.reviewer);
  const suspendForm = findForm(activeDetail.text, { action: "suspend", storeId: primaryStore.id });
  await submit(`/admin/commerce/stores/${primaryStore.id}`, suspendForm, (parameters) => {
    parameters.set("reason", "Stage 3A operational suspension");
  }, cookies.reviewer);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).status, "SUSPENDED");
  assert.equal((await publicStore(primarySlug)).status, 404);
  const suspendedDetail = await body(`/admin/commerce/stores/${primaryStore.id}`, cookies.reviewer);
  const reactivateForm = findForm(suspendedDetail.text, { action: "reactivate", storeId: primaryStore.id });
  await submit(`/admin/commerce/stores/${primaryStore.id}`, reactivateForm, () => undefined, cookies.reviewer);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).status, "ACTIVE");
  assert.equal((await publicStore(primarySlug)).status, 200);
  checks.add(16);

  const probeDetail = await body(`/admin/commerce/stores/${directStores.adminProbe.id}`, cookies.reviewer);
  const probeApprove = findForm(probeDetail.text, { action: "approve", storeId: directStores.adminProbe.id });
  const readOnlyDetail = await body(`/admin/commerce/stores/${directStores.adminProbe.id}`, cookies.readOnlyAdmin);
  assert.equal(readOnlyDetail.response.status, 200);
  assert.equal(forms(readOnlyDetail.text).some((form) => formParams(form).has("action")), false);
  await submit(`/admin/commerce/stores/${directStores.adminProbe.id}`, probeApprove, () => undefined, cookies.readOnlyAdmin);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: directStores.adminProbe.id } })).status, "PENDING_REVIEW");
  checks.add(17);

  const expiredPage = await body("/admin/commerce", cookies.expiredAdmin);
  assert.equal(expiredPage.text.includes("إدارة متاجر التجارة"), false);
  await submit(`/admin/commerce/stores/${directStores.adminProbe.id}`, probeApprove, () => undefined, cookies.expiredAdmin);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: directStores.adminProbe.id } })).status, "PENDING_REVIEW");
  checks.add(18);

  await submit(`/admin/commerce/stores/${directStores.adminProbe.id}`, probeApprove, () => undefined, cookies.owner);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: directStores.adminProbe.id } })).status, "PENDING_REVIEW");
  const activeMerchantPage = await body("/business/commerce/store", cookies.owner);
  const activeMerchantForm = findForm(activeMerchantPage.text, { mode: "update", storeId: primaryStore.id });
  const currentPhone = (await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).supportPhone;
  await submit("/business/commerce/store", activeMerchantForm, (parameters) => {
    parameters.set("supportPhone", "+9647500000992");
  }, cookies.reviewer);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: primaryStore.id } })).supportPhone, currentPhone);

  await prisma.organization.update({
    where: { id: organizations.primary.id },
    data: { isActive: false, status: "INACTIVE" },
  });
  assert.equal((await publicStore(primarySlug)).status, 404);
  await prisma.organization.update({
    where: { id: organizations.primary.id },
    data: { isActive: true, status: "ACTIVE" },
  });
  assert.equal((await publicStore(primarySlug)).status, 200);
  checks.add(19);

  const mobile = await publicStore(primarySlug, "REZNO-Expo-Mobile-Gate3A");
  assert.equal(mobile.status, 200);
  const marketplace = await page("/marketplace", undefined, false, "REZNO-Expo-Mobile-Gate3A");
  assert.equal(marketplace.status, 200);
  assertNoRaw(await marketplace.text());
  checks.add(20);

  const activeOrder = await prisma.order.create({
    data: {
      currency: "IQD",
      customerId: sessions.reviewer.personId,
      customerNameSnapshot: "Stage 3A QA",
      customerPhoneSnapshot: "+9647500000993",
      fulfillmentMethod: "CUSTOMER_PICKUP",
      grandTotal: "1000",
      orderNumber: `STAGE3A-${runId}-ORDER`,
      paymentMethod: "PAY_AT_PICKUP",
      reservationExpiresAt: new Date(Date.now() + 3_600_000),
      storeId: directStores.orderConflict.id,
      storeNameSnapshot: directStores.orderConflict.name,
      storeSlugSnapshot: directStores.orderConflict.slug,
      subtotal: "1000",
    },
  });
  remember(resources.orderIds, activeOrder.id);
  const orderConflictPage = await body("/business/commerce/store", cookies.orderOwner);
  const orderArchive = findForm(orderConflictPage.text, { action: "archive", storeId: directStores.orderConflict.id });
  await submit("/business/commerce/store", orderArchive, (parameters) => parameters.set("reason", "Blocked by active Order"), cookies.orderOwner);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: directStores.orderConflict.id } })).status, "DRAFT");
  checks.add(21);

  const category = await prisma.marketplaceCategory.create({
    data: {
      name: `Stage 3A ${runId}`,
      normalizedName: `stage-3a-${runId}`,
      slug: `stage-3a-${runId}`,
    },
  });
  remember(resources.marketplaceCategoryIds, category.id);
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: "Stage 3A reserved product",
      normalizedSearchText: "stage 3a reserved product",
      slug: `stage3a-reserved-${runId}`,
      storeId: directStores.reservationConflict.id,
    },
  });
  remember(resources.productIds, product.id);
  const variant = await prisma.productVariant.create({
    data: {
      isDefault: true,
      optionKey: "default",
      optionValues: {},
      price: "1000",
      productId: product.id,
      sku: `STAGE3A-${runId}`,
      storeId: directStores.reservationConflict.id,
      title: "Default",
    },
  });
  remember(resources.productVariantIds, variant.id);
  const inventory = await prisma.inventoryItem.create({
    data: { onHand: 1, reserved: 1, variantId: variant.id },
  });
  remember(resources.inventoryItemIds, inventory.id);
  const reservationOrder = await prisma.order.create({
    data: {
      currency: "IQD",
      customerId: sessions.reviewer.personId,
      customerNameSnapshot: "Stage 3A QA",
      customerPhoneSnapshot: "+9647500000994",
      fulfillmentMethod: "CUSTOMER_PICKUP",
      grandTotal: "1000",
      orderNumber: `STAGE3A-${runId}-RESERVATION`,
      paymentMethod: "PAY_AT_PICKUP",
      reservationExpiresAt: new Date(Date.now() + 3_600_000),
      status: "CANCELLED",
      storeId: directStores.reservationConflict.id,
      storeNameSnapshot: directStores.reservationConflict.name,
      storeSlugSnapshot: directStores.reservationConflict.slug,
      subtotal: "1000",
    },
  });
  remember(resources.orderIds, reservationOrder.id);
  const orderItem = await prisma.orderItem.create({
    data: {
      currency: "IQD",
      lineSubtotal: "1000",
      lineTotal: "1000",
      optionValuesSnapshot: {},
      orderId: reservationOrder.id,
      productId: product.id,
      productNameSnapshot: product.name,
      productVariantId: variant.id,
      quantity: 1,
      skuSnapshot: variant.sku,
      unitPrice: "1000",
      variantTitleSnapshot: variant.title,
    },
  });
  const reservation = await prisma.inventoryReservation.create({
    data: {
      deterministicKey: `stage3a:${runId}`,
      expiresAt: new Date(Date.now() + 3_600_000),
      inventoryItemId: inventory.id,
      orderId: reservationOrder.id,
      orderItemId: orderItem.id,
      productVariantId: variant.id,
      quantity: 1,
    },
  });
  remember(resources.inventoryReservationIds, reservation.id);
  const reservationConflictPage = await body("/business/commerce/store", cookies.reservationOwner);
  const reservationArchive = findForm(reservationConflictPage.text, {
    action: "archive",
    storeId: directStores.reservationConflict.id,
  });
  await submit("/business/commerce/store", reservationArchive, (parameters) => {
    parameters.set("reason", "Blocked by active reservation");
  }, cookies.reservationOwner);
  assert.equal(
    (await prisma.store.findUniqueOrThrow({ where: { id: directStores.reservationConflict.id } })).status,
    "DRAFT",
  );
  checks.add(22);

  assert.equal(await prisma.businessOperationMutation.count({ where: { targetId: primaryStore.id } }), 8);
  assert.equal(await prisma.businessAuditLog.count({ where: { targetId: primaryStore.id } }), 8);
  assert.equal(await prisma.adminAuditLog.count({ where: { targetId: primaryStore.id } }), 4);
  checks.add(23);

  assert.equal(await notificationCount(primaryStore.id, "store.submitted", sessions.reviewer.personId), 2);
  for (const event of ["store.rejected", "store.approved", "store.suspended", "store.reactivated"] as const) {
    assert.equal(await notificationCount(primaryStore.id, event, sessions.owner.personId), 1, event);
  }
  checks.add(24);

  const switched = await body("/business/commerce/store", cookies.orderOwner);
  assert.match(switched.text, new RegExp(directStores.orderConflict.slug));
  assert.equal(switched.text.includes(primaryStore.id), false);
  const staleSelection = await body(
    "/business/commerce",
    activeCookie(sessions.owner.cookie, organizations.adminProbe.id),
  );
  assert.ok([200, 302, 303, 307, 308].includes(staleSelection.response.status));
  assert.match(
    `${staleSelection.response.headers.get("location") ?? ""}\n${staleSelection.text}`,
    /\/select-business\?next=/,
  );
  checks.add(25);

  await prisma.organizationMember.update({
    where: { id: memberships.staffDenied.id },
    data: { deletedAt: new Date(), status: "INACTIVE" },
  });
  const revoked = await body("/business/commerce", cookies.staffDenied);
  assert.equal(routeText(revoked.text).includes(primaryStore.id), false);
  assert.ok([200, 302, 303, 307, 308, 403].includes(revoked.response.status));
  checks.add(26);

  await prisma.person.update({
    where: { id: sessions.managerDenied.personId },
    data: { deletedAt: new Date(), status: "INACTIVE" },
  });
  const deletedPerson = await body("/business/commerce", cookies.managerDenied);
  assert.equal(routeText(deletedPerson.text).includes(primaryStore.id), false);
  assert.ok([200, 302, 303, 307, 308, 403].includes(deletedPerson.response.status));
  checks.add(27);

  checks.add(29);
  assert.equal(checks.size, 38);
}

async function signUp(label: string, phoneSuffix: number): Promise<Session> {
  const request = {
    email: `stage3a-${runId}-${label}@rezno.invalid`,
    name: `Stage 3A ${label}`,
    password: `Rz!${randomUUID()}${randomUUID()}`,
  };
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      body: JSON.stringify(request),
      headers: requestHeaders({
        "content-type": "application/json",
        origin: authBaseUrl,
        "user-agent": `rezno-stage3a-${runId}-${label}`,
      }),
      method: "POST",
      redirect: "manual",
    });
    if (response.status !== 429) break;
    const advertisedRetryAfter = Number(response.headers.get("retry-after") ?? "60");
    assert.ok(
      Number.isSafeInteger(advertisedRetryAfter) &&
      advertisedRetryAfter >= 1 &&
      advertisedRetryAfter <= 60,
    );
    const retryAfter = Math.max(60, advertisedRetryAfter);
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000 + 250));
  }
  assert.ok(response);
  assert.equal(response.status, 200, `Authentication failed for ${label} with status ${response.status}.`);
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie, `Authentication cookie missing for ${label}.`);
  const person = await prisma.person.update({
    where: { authUserId: payload.user.id },
    data: {
      isOnboarded: true,
      phone: `+9647500010${String(phoneSuffix).padStart(2, "0")}`,
      status: "ACTIVE",
    },
  });
  remember(resources.userIds, payload.user.id);
  remember(resources.personIds, person.id);
  return { cookie: cookie.split(";")[0]!, personId: person.id, userId: payload.user.id };
}

async function createOrganization(label: string) {
  const organization = await prisma.organization.create({
    data: { name: `Stage 3A Smoke ${label}`, slug: `stage3a-smoke-${runId}-${label}` },
  });
  remember(resources.organizationIds, organization.id);
  return organization;
}

async function createRole(
  organizationId: string,
  label: string,
  systemRole: SystemRole,
  commercePermissions: CommercePermission[],
) {
  return prisma.role.create({
    data: {
      commercePermissions,
      isSystem: true,
      name: `stage3a-${runId}-${label}`,
      organizationId,
      systemRole,
    },
  });
}

async function createMember(organizationId: string, personId: string, roleId: string) {
  return prisma.organizationMember.create({ data: { organizationId, personId, roleId } });
}

async function createStore(organizationId: string, label: string, status: StoreStatus) {
  const submittedAt = status === "DRAFT" ? null : new Date();
  const publishedAt = ["ACTIVE", "SUSPENDED", "ARCHIVED"].includes(status) ? new Date() : null;
  const store = await prisma.store.create({
    data: {
      deliveryArea: "Karrada",
      deliveryCity: "Baghdad",
      deliveryEnabled: true,
      deliveryEstimateMinutes: 45,
      deliveryFee: "1000",
      description: `STAGE3A-SMOKE-${runId}-${label}`,
      minimumOrderValue: "0",
      name: `Stage 3A Smoke ${label}`,
      organizationId,
      preparationEstimateMinutes: 20,
      publishedAt,
      slug: `stage3a-smoke-${runId}-${label}`,
      status,
      submittedAt,
      supportPhone: "+964750001099",
    },
  });
  remember(resources.storeIds, store.id);
  return store;
}

function activeCookie(sessionCookie: string, organizationId: string) {
  return `${sessionCookie}; rezno-active-business-id=${organizationId}`;
}

async function page(path: string, cookie?: string, rsc = false, userAgent?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (rsc) {
    headers.accept = "text/x-component";
    headers.rsc = "1";
  }
  if (userAgent) headers["user-agent"] = userAgent;
  return fetch(`${baseUrl}${path}`, { headers: requestHeaders(headers), redirect: "manual" });
}

async function body(path: string, cookie?: string, rsc = false) {
  const response = await page(path, cookie, rsc);
  const text = await response.text();
  assertNoRaw(text);
  return { response, text };
}

async function publicStore(slug: string, userAgent?: string) {
  const response = await page(`/api/commerce/public/stores/${slug}`, undefined, false, userAgent);
  assertNoRaw(await response.text());
  return response;
}

async function submit(
  path: string,
  form: string,
  mutate: (parameters: URLSearchParams) => void,
  cookie: string,
) {
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
        new Promise<{ done: true; value?: undefined }>((resolve) => {
          setTimeout(() => resolve({ done: true }), 750);
        }),
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
  const body = await response.json() as Record<string, unknown>;
  assertNoRaw(JSON.stringify(body));
  return { body, response };
}

function requestHeaders(initial: Record<string, string>) {
  const headers = new Headers(initial);
  headers.set("x-vercel-protection-bypass", bypass);
  return headers;
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attribute(element: string, name: string) {
  return decodeHtml(element.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "");
}

function forms(html: string) {
  return html.match(/<form\b[\s\S]*?<\/form>/g) ?? [];
}

function formParams(form: string) {
  const parameters = new URLSearchParams();
  for (const input of form.match(/<input\b[^>]*>/g) ?? []) {
    const name = attribute(input, "name");
    const disabled = /\sdisabled(?:=""|(?=\s|>))/.test(input);
    if (!name || disabled || (input.includes('type="checkbox"') && !input.includes(" checked"))) continue;
    const value = input.includes('type="checkbox"') ? attribute(input, "value") || "on" : attribute(input, "value");
    parameters.append(name, value);
  }
  for (const textarea of form.match(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g) ?? []) {
    const name = attribute(textarea, "name");
    const disabled = /\sdisabled(?:=""|(?=\s|>))/.test(textarea);
    if (name && !disabled) {
      parameters.append(name, decodeHtml(textarea.replace(/^<textarea\b[^>]*>/, "").replace(/<\/textarea>$/, "")));
    }
  }
  return parameters;
}

function findForm(html: string, expected: Record<string, string>) {
  const match = forms(html).find((form) => {
    const parameters = formParams(form);
    return Object.entries(expected).every(([key, value]) => parameters.get(key) === value);
  });
  assert.ok(match, `Expected staging form ${JSON.stringify(Object.keys(expected).sort())}.`);
  return match;
}

function fillStore(parameters: URLSearchParams, label: string, slug: string) {
  parameters.set("name", `Stage 3A ${label} Store`);
  parameters.set("slug", slug);
  parameters.set("description", "Stage 3A authenticated staging Store");
  parameters.set("supportPhone", "+964750001098");
  parameters.set("deliveryEnabled", "on");
  parameters.set("deliveryCity", "Baghdad");
  parameters.set("deliveryArea", "Karrada");
  parameters.set("deliveryEstimateMinutes", "45");
  parameters.set("deliveryFee", "1000");
  parameters.set("minimumOrderValue", "0");
  parameters.set("preparationEstimateMinutes", "20");
}

function routeText(text: string) {
  return text.replaceAll("\\/", "/");
}

function assertForbidden(response: Response, text: string) {
  assert.ok([200, 302, 303, 307, 308, 403].includes(response.status));
  assert.equal(routeText(text).includes("/business/commerce/store"), false);
  assertNoRaw(text);
}

function responsePair(result: { response: Response; text: string }): [Response, string] {
  return [result.response, result.text];
}

function assertNoRaw(text: string) {
  assert.doesNotMatch(
    text,
    /DATABASE_URL|PrismaClient|PostgreSQL|postgres(?:ql)?:\/\/|Invalid `prisma\.|ep-[a-z0-9-]+\.(?:aws\.)?neon\.tech/i,
  );
}

async function notificationCount(storeId: string, event: string, recipientPersonId: string) {
  return prisma.notification.count({
    where: { eventKey: { contains: `${storeId}:${event}:` }, recipientPersonId },
  });
}

function remember(values: string[], value: string) {
  if (!values.includes(value)) values.push(value);
}

async function cleanup() {
  const storeEvents = resources.storeIds.map((storeId) => ({ eventKey: { contains: storeId } }));
  const orderEvents = resources.orderIds.map((orderId) => ({ eventKey: { contains: orderId } }));
  await prisma.$transaction(async (transaction) => {
    await transaction.notification.deleteMany({
      where: {
        OR: [
          { businessId: { in: resources.organizationIds } },
          { recipientPersonId: { in: resources.personIds } },
          ...storeEvents,
          ...orderEvents,
        ],
      },
    });
    await transaction.adminAuditLog.deleteMany({
      where: {
        OR: [
          { adminUserId: { in: resources.userIds } },
          { targetId: { in: resources.storeIds } },
        ],
      },
    });
    await transaction.adminAccess.deleteMany({ where: { userId: { in: resources.userIds } } });
    await transaction.stockMovement.deleteMany({
      where: { OR: [{ inventoryItemId: { in: resources.inventoryItemIds } }, { orderId: { in: resources.orderIds } }, { reservationId: { in: resources.inventoryReservationIds } }] },
    });
    await transaction.inventoryReservation.deleteMany({
      where: {
        OR: [
          { id: { in: resources.inventoryReservationIds } },
          { orderId: { in: resources.orderIds } },
        ],
      },
    });
    await transaction.checkoutIdempotency.deleteMany({
      where: { OR: [{ customerId: { in: resources.personIds } }, { orderId: { in: resources.orderIds } }] },
    });
    await transaction.payment.deleteMany({ where: { orderId: { in: resources.orderIds } } });
    await transaction.orderStatusHistory.deleteMany({ where: { orderId: { in: resources.orderIds } } });
    await transaction.orderAddress.deleteMany({ where: { orderId: { in: resources.orderIds } } });
    await transaction.orderItem.deleteMany({ where: { orderId: { in: resources.orderIds } } });
    await transaction.order.deleteMany({ where: { id: { in: resources.orderIds } } });
    await transaction.cart.deleteMany({ where: { id: { in: resources.cartIds } } });
    await transaction.customerFavoriteProduct.deleteMany({ where: { OR: [{ customerId: { in: resources.personIds } }, { productId: { in: resources.productIds } }] } });
    await transaction.customerFavoriteStore.deleteMany({ where: { OR: [{ customerId: { in: resources.personIds } }, { storeId: { in: resources.storeIds } }] } });
    await transaction.productMedia.deleteMany({ where: { productId: { in: resources.productIds } } });
    await transaction.inventoryItem.deleteMany({ where: { id: { in: resources.inventoryItemIds } } });
    await transaction.productVariant.deleteMany({ where: { id: { in: resources.productVariantIds } } });
    await transaction.product.deleteMany({ where: { id: { in: resources.productIds } } });
    await transaction.marketplaceCategory.deleteMany({ where: { id: { in: resources.marketplaceCategoryIds } } });
    await transaction.businessOperationMutation.deleteMany({
      where: { organizationId: { in: resources.organizationIds } },
    });
    await transaction.businessAuditLog.deleteMany({
      where: { organizationId: { in: resources.organizationIds } },
    });
    await transaction.store.deleteMany({ where: { id: { in: resources.storeIds } } });
    await transaction.organizationMember.deleteMany({
      where: { organizationId: { in: resources.organizationIds } },
    });
    await transaction.role.deleteMany({ where: { organizationId: { in: resources.organizationIds } } });
    await transaction.organizationSettings.deleteMany({ where: { organizationId: { in: resources.organizationIds } } });
    await transaction.organization.deleteMany({ where: { id: { in: resources.organizationIds } } });
    await transaction.account.deleteMany({ where: { userId: { in: resources.userIds } } });
    await transaction.session.deleteMany({ where: { userId: { in: resources.userIds } } });
    await transaction.person.deleteMany({ where: { id: { in: resources.personIds } } });
    await transaction.user.deleteMany({ where: { id: { in: resources.userIds } } });
  }, { timeout: 120_000 });

  const [accounts, carts, mutations, orders, organizations, people, sessions, stores, users] = await Promise.all([
    prisma.account.count({ where: { userId: { in: resources.userIds } } }),
    prisma.cart.count({ where: { id: { in: resources.cartIds } } }),
    prisma.businessOperationMutation.count({ where: { organizationId: { in: resources.organizationIds } } }),
    prisma.order.count({ where: { id: { in: resources.orderIds } } }),
    prisma.organization.count({ where: { id: { in: resources.organizationIds } } }),
    prisma.person.count({ where: { id: { in: resources.personIds } } }),
    prisma.session.count({ where: { userId: { in: resources.userIds } } }),
    prisma.store.count({ where: { id: { in: resources.storeIds } } }),
    prisma.user.count({ where: { id: { in: resources.userIds } } }),
  ]);
  assert.deepEqual(
    { accounts, carts, mutations, orders, organizations, people, sessions, stores, users },
    { accounts: 0, carts: 0, mutations: 0, orders: 0, organizations: 0, people: 0, sessions: 0, stores: 0, users: 0 },
  );
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
    if (!failure) checks.add(30);
  } catch (error) {
    cleanupFailure = error;
  }

  await prisma.$disconnect();

  if (failure || cleanupFailure) {
    const messages = [];
    if (failure) {
      const message = failure instanceof Error ? failure.message : "unknown staging smoke failure";
      messages.push(`phase=${failedPhase || "unknown"} ${message}`);
    }
    if (cleanupFailure) {
      const message = cleanupFailure instanceof Error ? cleanupFailure.message : "unknown cleanup failure";
      messages.push(`cleanup=${message}`);
    }
    console.error(`Stage 3A authenticated staging smoke failed: ${safeFailure(messages.join("; "))}`);
    process.exitCode = 1;
    return;
  }

  assert.equal(checks.size, 39);
  console.log(
    `Stage 3A authenticated staging smoke passed. identities=10 checks=${checks.size} cleanup=verified confirmation=${COMMERCE_STAGE3A_SMOKE_CONFIRMATION.length}`,
  );
}

void runSmoke();

function safeFailure(message: string) {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]")
    .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
    .slice(0, 500);
}
