import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { CommercePermission, SystemRole } from "@prisma/client";

import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import { merchantStoreInclude, ownerManagementStoreDto } from "../../../features/commerce/domain/store-dto";
import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../../features/identity/policies/authorization";
import { updateCommerceRolePermissions } from "../../../features/commerce/services/commerce-access-service";
import { resolveMerchantCommerceContext, type CommerceAdminContext, type MerchantActorReference } from "../../../features/commerce/services/authorization";
import {
  approveStore,
  archiveStore,
  clearUnsafeStoreImages,
  createStoreDraft,
  getMerchantStore,
  reactivateStore,
  rejectStore,
  reopenRejectedStoreDraft,
  submitStoreForReview,
  suspendStore,
  updateStoreProfile,
} from "../../../features/commerce/services/store-service";
import { getPublicStore } from "../../../features/commerce/public/catalog-service";
import { prisma } from "../../../lib/db/prisma";

type MerchantFixture = Awaited<ReturnType<typeof createMerchant>>;

async function disposableDatabase() {
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.match(rows[0]?.database ?? "", /(?:_test|test_)/);
}

async function reset() {
  await disposableDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "Person", "user", "Category", "MarketplaceCategory" CASCADE',
  );
}

async function createIdentity(label: string) {
  const userId = `stage3a-${label}-${randomUUID()}`;
  await prisma.user.create({ data: { email: `${userId}@rezno.invalid`, id: userId, name: label } });
  const person = await prisma.person.create({
    data: { authUserId: userId, firstName: label, isOnboarded: true, phone: "+9647500000000" },
  });
  return { person, userId };
}

async function createMerchant(
  label: string,
  options: {
    organizationId?: string;
    permissions?: CommercePermission[];
    personId?: string;
    role?: SystemRole;
  } = {},
) {
  const identity = options.personId
    ? { person: await prisma.person.findUniqueOrThrow({ where: { id: options.personId } }) }
    : await createIdentity(`${label}-person`);
  const role = options.role ?? "OWNER";
  const roleId = randomUUID();
  const organization = options.organizationId
    ? await prisma.organization.findUniqueOrThrow({ where: { id: options.organizationId } })
    : await prisma.organization.create({
        data: { name: `${label} Organization`, slug: `${label}-${randomUUID().slice(0, 8)}` },
      });
  await prisma.role.create({
    data: {
      commercePermissions: options.permissions ?? (role === "OWNER" ? [...OWNER_DEFAULT_COMMERCE_PERMISSIONS] : []),
      id: roleId,
      isSystem: true,
      name: `${role}-${randomUUID().slice(0, 5)}`,
      organizationId: organization.id,
      systemRole: role,
    },
  });
  const membership = await prisma.organizationMember.create({
    data: { organizationId: organization.id, personId: identity.person.id, roleId },
  });
  return {
    membership,
    organization,
    person: identity.person,
    reference: {
      contextOrganizationId: organization.id,
      membershipId: membership.id,
      personId: identity.person.id,
    } satisfies MerchantActorReference,
    roleId,
  };
}

async function createAdmin(
  label: string,
  permissions: string[],
  options: { expiresAt?: Date; status?: "ACTIVE" | "REVOKED" } = {},
) {
  const identity = await createIdentity(`${label}-admin`);
  const access = await prisma.adminAccess.create({
    data: {
      expiresAt: options.expiresAt,
      permissions,
      status: options.status,
      userId: identity.userId,
    },
  });
  return {
    access,
    context: {
      adminAccessId: access.id,
      isSuperAdmin: false,
      personId: identity.person.id,
      permissions,
      source: "database",
      userId: identity.userId,
    } as CommerceAdminContext,
    ...identity,
  };
}

function storeInput(merchant: MerchantFixture, input: Partial<{
  deliveryArea: string;
  deliveryCity: string;
  deliveryEnabled: boolean;
  idempotencyKey: string;
  name: string;
  pickupArea: string;
  pickupCity: string;
  pickupEnabled: boolean;
  pickupStreet: string;
  slug: string;
}> = {}) {
  return {
    contextOrganizationId: merchant.organization.id,
    deliveryArea: "Karrada",
    deliveryCity: "Baghdad",
    deliveryEnabled: true,
    deliveryEstimateMinutes: 45,
    deliveryFee: "1000",
    idempotencyKey: randomUUID(),
    minimumOrderValue: "0",
    name: `${merchant.organization.name} Store`,
    pickupArea: "Karrada",
    pickupCity: "Baghdad",
    pickupEnabled: true,
    pickupStreet: "Stage 3A Street",
    preparationEstimateMinutes: 20,
    slug: `store-${merchant.organization.slug}`,
    supportPhone: "+9647500000001",
    ...input,
  };
}

function updateInput(merchant: MerchantFixture, store: Awaited<ReturnType<typeof createStoreDraft>>, overrides: Record<string, unknown> = {}) {
  return {
    contextOrganizationId: merchant.organization.id,
    deliveryArea: store.deliveryArea ?? "Karrada",
    deliveryCity: store.deliveryCity ?? "Baghdad",
    deliveryEnabled: store.deliveryEnabled,
    deliveryEstimateMinutes: store.deliveryEstimateMinutes,
    deliveryFee: store.deliveryFee.replace(/\.000$/, ""),
    description: store.description ?? "",
    expectedVersion: store.expectedVersion,
    idempotencyKey: randomUUID(),
    minimumOrderValue: store.minimumOrderValue.replace(/\.000$/, ""),
    name: store.name,
    pickupAdditionalDetails: store.pickupAdditionalDetails ?? "",
    pickupArea: store.pickupArea ?? "Karrada",
    pickupCity: store.pickupCity ?? "Baghdad",
    pickupEnabled: store.pickupEnabled,
    pickupInstructions: store.pickupInstructions ?? "",
    pickupStreet: store.pickupStreet ?? "Stage 3A Street",
    preparationEstimateMinutes: store.preparationEstimateMinutes,
    slug: store.slug,
    storeId: store.id,
    supportPhone: store.supportPhone ?? "",
    ...overrides,
  };
}

function lifecycle(merchant: MerchantFixture, store: { expectedVersion: string; id: string }, idempotencyKey = randomUUID()) {
  return {
    contextOrganizationId: merchant.organization.id,
    expectedVersion: store.expectedVersion,
    idempotencyKey,
    storeId: store.id,
  };
}

function adminInput(store: { expectedVersion: string; id: string }, reason: string | null = null, idempotencyKey = randomUUID()) {
  return { expectedVersion: store.expectedVersion, idempotencyKey, reason, storeId: store.id };
}

function code(expected: CommerceDomainError["code"]) {
  return (error: unknown) => error instanceof CommerceDomainError && error.code === expected;
}

test("Gate 3A Merchant Store PostgreSQL end-to-end", { concurrency: false }, async (t) => {
  await reset();
  t.after(async () => { await reset(); await prisma.$disconnect(); });
  const reviewer = await createAdmin("reviewer", ["COMMERCE_STORES_VIEW", "COMMERCE_STORES_REVIEW"]);
  const owner = await createMerchant("owner-a");
  const createKey = randomUUID();
  const createPayload = storeInput(owner, { idempotencyKey: createKey });
  let store = await createStoreDraft(owner.reference, createPayload);

  await t.test("1 Owner creates exactly one DRAFT Store", () => {
    assert.equal(store.status, "DRAFT");
    assert.equal(store.organizationName, owner.organization.name);
  });
  await t.test("2 exact Store create replay returns the authoritative original result", async () => {
    assert.deepEqual(await createStoreDraft(owner.reference, createPayload), store);
  });
  await t.test("3 changed create replay conflicts", async () => {
    await assert.rejects(createStoreDraft(owner.reference, { ...createPayload, name: "Changed", idempotencyKey: createKey }), code("IDEMPOTENCY_CONFLICT"));
  });
  await t.test("4 concurrent Store creation produces one winner", async () => {
    const merchant = await createMerchant("concurrent-create");
    const results = await Promise.allSettled([
      createStoreDraft(merchant.reference, storeInput(merchant, { slug: `cc-a-${randomUUID()}` })),
      createStoreDraft(merchant.reference, storeInput(merchant, { slug: `cc-b-${randomUUID()}` })),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(await prisma.store.count({ where: { organizationId: merchant.organization.id } }), 1);
  });
  await t.test("5 second Store for the same Organization is denied", async () => {
    await assert.rejects(createStoreDraft(owner.reference, storeInput(owner, { slug: `second-${randomUUID()}` })), code("CONFLICT"));
  });
  await t.test("6 foreign Store ID returns a tenant-safe not-found", async () => {
    const foreign = await createMerchant("foreign-update");
    await assert.rejects(updateStoreProfile(foreign.reference, updateInput(foreign, store)), code("NOT_FOUND"));
  });
  await t.test("7 Store slug collision maps to a stable conflict", async () => {
    const merchant = await createMerchant("slug-collision");
    await assert.rejects(createStoreDraft(merchant.reference, storeInput(merchant, { slug: store.slug })), code("CONFLICT"));
  });
  await t.test("8 DRAFT profile update persists exact safe fields", async () => {
    store = await updateStoreProfile(owner.reference, updateInput(owner, store, { description: "Updated Store profile" }));
    assert.equal(store.description, "Updated Store profile");
  });
  await t.test("9 stale Store update is rejected", async () => {
    await assert.rejects(updateStoreProfile(owner.reference, updateInput(owner, store, { expectedVersion: new Date(0).toISOString() })), code("STALE_VERSION"));
  });
  await t.test("10 concurrent updates produce one winner", async () => {
    const merchant = await createMerchant("concurrent-update");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant));
    const results = await Promise.allSettled([
      updateStoreProfile(merchant.reference, updateInput(merchant, draft, { description: "A" })),
      updateStoreProfile(merchant.reference, updateInput(merchant, draft, { description: "B" })),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  });
  await t.test("11 missing fulfillment blocks readiness submission", async () => {
    const merchant = await createMerchant("no-fulfillment");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant, { deliveryEnabled: false, pickupEnabled: false }));
    await assert.rejects(submitStoreForReview(merchant.reference, lifecycle(merchant, draft)), code("VALIDATION_ERROR"));
  });
  await t.test("12 enabled delivery requires city and area", async () => {
    const merchant = await createMerchant("delivery-invalid");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant, { deliveryArea: "", deliveryCity: "" }));
    await assert.rejects(submitStoreForReview(merchant.reference, lifecycle(merchant, draft)), code("VALIDATION_ERROR"));
  });
  await t.test("13 enabled pickup requires a complete address", async () => {
    const merchant = await createMerchant("pickup-invalid");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant, { deliveryEnabled: false, pickupStreet: "" }));
    await assert.rejects(submitStoreForReview(merchant.reference, lifecycle(merchant, draft)), code("VALIDATION_ERROR"));
  });
  const submitKey = randomUUID();
  const submitted = await submitStoreForReview(owner.reference, lifecycle(owner, store, submitKey));
  await t.test("14 safe submission transitions DRAFT to PENDING_REVIEW", () => assert.equal(submitted.status, "PENDING_REVIEW"));
  await t.test("15 submission exact replay creates no duplicate audit or notification", async () => {
    assert.deepEqual(await submitStoreForReview(owner.reference, lifecycle(owner, store, submitKey)), submitted);
    assert.equal(await prisma.businessAuditLog.count({ where: { action: "commerce.store.submit", targetId: store.id } }), 1);
  });
  await t.test("16 stale submission is rejected", async () => {
    const merchant = await createMerchant("stale-submit");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant));
    await assert.rejects(submitStoreForReview(merchant.reference, lifecycle(merchant, { ...draft, expectedVersion: new Date(0).toISOString() })), code("STALE_VERSION"));
  });
  const rejected = await rejectStore(reviewer.context, adminInput(submitted, "Correct the public description"));
  await t.test("17 Admin rejection records bounded feedback", () => {
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.reviewReason, "Correct the public description");
  });
  const reopened = await reopenRejectedStoreDraft(owner.reference, lifecycle(owner, rejected));
  await t.test("18 REJECTED Store reopens to DRAFT without changing ownership", () => {
    assert.equal(reopened.status, "DRAFT");
    assert.equal(reopened.id, store.id);
  });
  store = await updateStoreProfile(owner.reference, updateInput(owner, reopened, { description: "Corrected public description" }));
  const resubmitted = await submitStoreForReview(owner.reference, lifecycle(owner, store));
  await t.test("19 corrected Store can be resubmitted", () => assert.equal(resubmitted.status, "PENDING_REVIEW"));
  const approved = await approveStore(reviewer.context, adminInput(resubmitted));
  await t.test("20 Admin approval publishes and activates the Store atomically", () => {
    assert.equal(approved.status, "ACTIVE");
    assert.ok(approved.publishedAt);
  });
  await t.test("21 Admin approval exact replay is stable", async () => {
    const merchant = await createMerchant("approve-replay");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant));
    const pending = await submitStoreForReview(merchant.reference, lifecycle(merchant, draft));
    const key = randomUUID();
    const input = adminInput(pending, null, key);
    const first = await approveStore(reviewer.context, input);
    assert.deepEqual(await approveStore(reviewer.context, input), first);
    assert.equal(await prisma.adminAuditLog.count({ where: { idempotencyKey: key } }), 1);
  });
  await t.test("22 changed Admin replay conflicts", async () => {
    const merchant = await createMerchant("admin-replay-change");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant));
    const pending = await submitStoreForReview(merchant.reference, lifecycle(merchant, draft));
    const key = randomUUID();
    await rejectStore(reviewer.context, adminInput(pending, "First reason", key));
    await assert.rejects(rejectStore(reviewer.context, adminInput(pending, "Changed reason", key)), code("IDEMPOTENCY_CONFLICT"));
  });
  await t.test("23 concurrent Admin decisions produce one winner", async () => {
    const merchant = await createMerchant("admin-race");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant));
    const pending = await submitStoreForReview(merchant.reference, lifecycle(merchant, draft));
    const results = await Promise.allSettled([
      approveStore(reviewer.context, adminInput(pending)),
      rejectStore(reviewer.context, adminInput(pending, "Race rejection")),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  });
  const suspended = await suspendStore(reviewer.context, adminInput(approved, "Operational review"));
  await t.test("24 Admin can suspend an ACTIVE Store", () => assert.equal(suspended.status, "SUSPENDED"));
  const reactivated = await reactivateStore(reviewer.context, adminInput(suspended));
  await t.test("25 Admin can safely reactivate a SUSPENDED Store", () => assert.equal(reactivated.status, "ACTIVE"));
  const reactivatedOwnerView = ownerManagementStoreDto(await prisma.store.findUniqueOrThrow({
    where: { id: reactivated.id },
    include: merchantStoreInclude,
  }));
  await t.test("ACTIVE operational updates cannot make a public Store unready", async () => {
    const auditBefore = await prisma.businessAuditLog.count({ where: { organizationId: owner.organization.id } });
    const ledgerBefore = await prisma.businessOperationMutation.count({ where: { organizationId: owner.organization.id } });
    await assert.rejects(
      updateStoreProfile(owner.reference, updateInput(owner, reactivatedOwnerView, {
        deliveryEnabled: false,
        pickupEnabled: false,
      })),
      code("VALIDATION_ERROR"),
    );
    const persisted = await prisma.store.findUniqueOrThrow({ where: { id: reactivated.id } });
    assert.equal(persisted.status, "ACTIVE");
    assert.equal(persisted.deliveryEnabled, true);
    assert.equal(persisted.pickupEnabled, true);
    assert.equal(await prisma.businessAuditLog.count({ where: { organizationId: owner.organization.id } }), auditBefore);
    assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: owner.organization.id } }), ledgerBefore);
  });
  await t.test("26 missing Admin review permission is denied without audit", async () => {
    const readOnly = await createAdmin("read-only", ["COMMERCE_STORES_VIEW"]);
    const before = await prisma.adminAuditLog.count({ where: { adminUserId: readOnly.userId } });
    await assert.rejects(suspendStore(readOnly.context, adminInput(reactivated, "Forbidden")), code("FORBIDDEN"));
    assert.equal(await prisma.adminAuditLog.count({ where: { adminUserId: readOnly.userId } }), before);
  });
  await t.test("27 expired AdminAccess is denied", async () => {
    const expired = await createAdmin("expired", ["COMMERCE_STORES_REVIEW"], { expiresAt: new Date(0) });
    await assert.rejects(suspendStore(expired.context, adminInput(reactivated, "Expired")), code("FORBIDDEN"));
  });
  await t.test("28 Merchant context cannot be passed to an Admin transition", async () => {
    await assert.rejects(suspendStore(owner.reference as unknown as CommerceAdminContext, adminInput(reactivated, "Forged")));
  });
  await t.test("29 Admin identity cannot perform Merchant update without membership", async () => {
    const forged = { contextOrganizationId: owner.organization.id, membershipId: randomUUID(), personId: reviewer.person.id };
    await assert.rejects(updateStoreProfile(forged, updateInput(owner, reactivatedOwnerView)), code("FORBIDDEN"));
  });
  await t.test("30 archive is blocked by an active Order", async () => {
    const merchant = await createMerchant("active-order-archive");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant));
    const order = await prisma.order.create({
      data: {
        currency: "IQD", customerId: reviewer.person.id, customerNameSnapshot: "QA", customerPhoneSnapshot: "+9647500000000",
        fulfillmentMethod: "CUSTOMER_PICKUP", grandTotal: "1000", orderNumber: `QA-${randomUUID()}`,
        paymentMethod: "PAY_AT_PICKUP", reservationExpiresAt: new Date(Date.now() + 60_000), storeId: draft.id,
        storeNameSnapshot: draft.name, storeSlugSnapshot: draft.slug, subtotal: "1000",
      },
    });
    await assert.rejects(
      archiveStore(merchant.reference, { ...lifecycle(merchant, draft), reason: "Archive blocked" }),
      code("CONFLICT"),
    );
    await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  });
  await t.test("31 active InventoryReservation blocks archive", async () => {
    const merchant = await createMerchant("active-reservation-archive");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant));
    const category = await prisma.marketplaceCategory.create({
      data: {
        name: "Stage 3A Archive",
        normalizedName: `stage-3a-archive-${randomUUID()}`,
        slug: `stage-3a-archive-${randomUUID()}`,
      },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Reserved product",
        normalizedSearchText: "reserved product",
        slug: `reserved-${randomUUID()}`,
        storeId: draft.id,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        isDefault: true,
        optionKey: "default",
        optionValues: {},
        price: "1000",
        productId: product.id,
        sku: `SKU-${randomUUID()}`,
        storeId: draft.id,
        title: "Default",
      },
    });
    const inventory = await prisma.inventoryItem.create({
      data: { onHand: 1, reserved: 1, variantId: variant.id },
    });
    const order = await prisma.order.create({
      data: {
        currency: "IQD",
        customerId: reviewer.person.id,
        customerNameSnapshot: "QA",
        customerPhoneSnapshot: "+9647500000000",
        fulfillmentMethod: "CUSTOMER_PICKUP",
        grandTotal: "1000",
        orderNumber: `QA-${randomUUID()}`,
        paymentMethod: "PAY_AT_PICKUP",
        reservationExpiresAt: new Date(Date.now() + 60_000),
        status: "CANCELLED",
        storeId: draft.id,
        storeNameSnapshot: draft.name,
        storeSlugSnapshot: draft.slug,
        subtotal: "1000",
      },
    });
    const orderItem = await prisma.orderItem.create({
      data: {
        currency: "IQD",
        lineSubtotal: "1000",
        lineTotal: "1000",
        optionValuesSnapshot: {},
        orderId: order.id,
        productId: product.id,
        productNameSnapshot: product.name,
        productVariantId: variant.id,
        quantity: 1,
        skuSnapshot: variant.sku,
        unitPrice: "1000",
        variantTitleSnapshot: variant.title,
      },
    });
    await prisma.inventoryReservation.create({
      data: {
        deterministicKey: `stage3a:${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000),
        inventoryItemId: inventory.id,
        orderId: order.id,
        orderItemId: orderItem.id,
        productVariantId: variant.id,
        quantity: 1,
      },
    });
    await assert.rejects(
      archiveStore(merchant.reference, { ...lifecycle(merchant, draft), reason: "Archive blocked" }),
      code("CONFLICT"),
    );
  });
  await t.test("32 archive preserves Store, Product and Order history", async () => {
    const merchant = await createMerchant("safe-archive");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant));
    const archived = await archiveStore(merchant.reference, { ...lifecycle(merchant, draft), reason: "No longer trading" });
    assert.equal(archived.status, "ARCHIVED");
    assert.ok(await prisma.store.findUnique({ where: { id: archived.id } }));
  });
  await t.test("33 public visibility allows ACTIVE published Store", async () => {
    assert.equal((await getPublicStore(reactivated.slug)).id, reactivated.id);
  });
  const historicalOrder = await prisma.order.create({
    data: {
      currency: "IQD",
      customerId: reviewer.person.id,
      customerNameSnapshot: "QA",
      customerPhoneSnapshot: "+9647500000000",
      fulfillmentMethod: "CUSTOMER_PICKUP",
      grandTotal: "1000",
      orderNumber: `QA-HISTORY-${randomUUID()}`,
      paymentMethod: "PAY_AT_PICKUP",
      reservationExpiresAt: new Date(Date.now() + 60_000),
      status: "CANCELLED",
      storeId: reactivated.id,
      storeNameSnapshot: reactivated.name,
      storeSlugSnapshot: reactivated.slug,
      subtotal: "1000",
    },
  });
  await t.test("34 suspended/rejected/draft/archived Stores are absent publicly", async () => {
    const hidden = await suspendStore(reviewer.context, adminInput(reactivated, "Visibility test"));
    await assert.rejects(getPublicStore(hidden.slug));
  });
  await t.test("35 inactive Organization removes otherwise ACTIVE Store from public catalog", async () => {
    await prisma.organization.update({ where: { id: owner.organization.id }, data: { isActive: false, status: "INACTIVE" } });
    await assert.rejects(getPublicStore(reactivated.slug));
    await prisma.organization.update({ where: { id: owner.organization.id }, data: { isActive: true, status: "ACTIVE" } });
  });
  await t.test("36 historical customer Order remains readable after Store suspension", async () => {
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: historicalOrder.id } })).storeId, reactivated.id);
  });
  await t.test("37 Owner fixed Commerce baseline remains effective even if persisted array drifts", async () => {
    await prisma.role.update({ where: { id: owner.roleId }, data: { commercePermissions: [] } });
    const actor = await resolveMerchantCommerceContext(owner.reference, "STORE_MANAGE");
    assert.equal(actor.permissions.length, 15);
  });
  await t.test("38 Manager explicit STORE_VIEW is effective and STORE_MANAGE is not", async () => {
    const manager = await createMerchant("manager-explicit", { organizationId: owner.organization.id, permissions: ["STORE_VIEW", "STORE_MANAGE"], role: "MANAGER" });
    assert.equal((await resolveMerchantCommerceContext(manager.reference, "STORE_VIEW")).systemRole, "MANAGER");
    await assert.rejects(resolveMerchantCommerceContext(manager.reference, "STORE_MANAGE"), code("FORBIDDEN"));
  });
  await t.test("39 Receptionist Commerce fails closed despite persisted values", async () => {
    const receptionist = await createMerchant("receptionist", { organizationId: owner.organization.id, permissions: ["STORE_VIEW"], role: "RECEPTIONIST" });
    await assert.rejects(resolveMerchantCommerceContext(receptionist.reference, "STORE_VIEW"), code("FORBIDDEN"));
  });
  await t.test("40 Staff explicit subset is enforced", async () => {
    const staff = await createMerchant("staff-explicit", { organizationId: owner.organization.id, permissions: ["INVENTORY_VIEW", "PRODUCT_CREATE"], role: "STAFF" });
    await resolveMerchantCommerceContext(staff.reference, "INVENTORY_VIEW");
    await assert.rejects(resolveMerchantCommerceContext(staff.reference, "PRODUCT_CREATE"), code("FORBIDDEN"));
  });
  const managerRole = await prisma.role.findFirstOrThrow({ where: { organizationId: owner.organization.id, systemRole: "MANAGER" } });
  const permissionKey = randomUUID();
  await t.test("41 Owner updates eligible role Commerce permissions with exact replay", async () => {
    const input = { contextOrganizationId: owner.organization.id, expectedVersion: managerRole.updatedAt.toISOString(), idempotencyKey: permissionKey, permissions: ["STORE_VIEW" as const], roleId: managerRole.id };
    const first = await updateCommerceRolePermissions(owner.reference, input);
    assert.deepEqual(await updateCommerceRolePermissions(owner.reference, input), first);
  });
  await t.test("42 changed permission replay conflicts", async () => {
    await assert.rejects(updateCommerceRolePermissions(owner.reference, { contextOrganizationId: owner.organization.id, expectedVersion: managerRole.updatedAt.toISOString(), idempotencyKey: permissionKey, permissions: ["ORDER_VIEW"], roleId: managerRole.id }), code("IDEMPOTENCY_CONFLICT"));
  });
  await t.test("43 stale role version is rejected", async () => {
    await assert.rejects(updateCommerceRolePermissions(owner.reference, { contextOrganizationId: owner.organization.id, expectedVersion: new Date(0).toISOString(), idempotencyKey: randomUUID(), permissions: ["STORE_VIEW"], roleId: managerRole.id }), code("STALE_VERSION"));
  });
  await t.test("44 STORE_MANAGE cannot be granted to Manager", async () => {
    const current = await prisma.role.findUniqueOrThrow({ where: { id: managerRole.id } });
    await assert.rejects(updateCommerceRolePermissions(owner.reference, { contextOrganizationId: owner.organization.id, expectedVersion: current.updatedAt.toISOString(), idempotencyKey: randomUUID(), permissions: ["STORE_MANAGE"], roleId: managerRole.id }), code("FORBIDDEN"));
  });
  await t.test("45 revoked membership and deleted Person fail closed", async () => {
    const merchant = await createMerchant("revoked");
    await prisma.organizationMember.update({ where: { id: merchant.membership.id }, data: { status: "INACTIVE" } });
    await assert.rejects(resolveMerchantCommerceContext(merchant.reference, "STORE_VIEW"), code("FORBIDDEN"));
    await prisma.organizationMember.update({ where: { id: merchant.membership.id }, data: { status: "ACTIVE" } });
    await prisma.person.update({ where: { id: merchant.person.id }, data: { deletedAt: new Date() } });
    await assert.rejects(resolveMerchantCommerceContext(merchant.reference, "STORE_VIEW"), code("FORBIDDEN"));
  });
  await t.test("46 active-Business references resolve the exact selected tenant", async () => {
    const person = await createIdentity("multi-business");
    const left = await createMerchant("multi-left", { personId: person.person.id });
    const right = await createMerchant("multi-right", { personId: person.person.id });
    assert.equal((await resolveMerchantCommerceContext(left.reference, "STORE_VIEW")).organizationId, left.organization.id);
    assert.equal((await resolveMerchantCommerceContext(right.reference, "STORE_VIEW")).organizationId, right.organization.id);
  });
  await t.test("47 successful mutation and notification counts are exact while replay is a no-op", async () => {
    assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: owner.organization.id, idempotencyKey: submitKey } }), 1);
    assert.equal(await prisma.notification.count({
      where: { eventKey: { contains: `${store.id}:store.submitted:${submitted.expectedVersion}:` } },
    }), 1);
    assert.equal(await prisma.notification.count({
      where: { eventKey: { contains: `${store.id}:store.submitted:` } },
    }), 2, "The initial submission and the later corrected resubmission each emit one notification.");
  });
  await t.test("48 denied/invalid operations leave no partial Store, audit or ledger", async () => {
    const merchant = await createMerchant("rollback-invalid");
    const before = await prisma.businessOperationMutation.count({ where: { organizationId: merchant.organization.id } });
    const rawImageInput = {
      ...storeInput(merchant),
      logoUrl: "http://127.0.0.1/private.png",
    };
    await assert.rejects(createStoreDraft(merchant.reference, rawImageInput), code("VALIDATION_ERROR"));
    assert.equal(await prisma.store.count({ where: { organizationId: merchant.organization.id } }), 0);
    assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: merchant.organization.id } }), before);
    assert.equal(await prisma.businessAuditLog.count({ where: { organizationId: merchant.organization.id } }), 0);
  });

  await t.test("49 historical unsafe Store images serialize as null with structural management flags", async () => {
    const merchant = await createMerchant("legacy-image-dto");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant));
    const pending = await submitStoreForReview(merchant.reference, lifecycle(merchant, draft));
    const active = await approveStore(reviewer.context, adminInput(pending));
    await prisma.store.update({
      where: { id: active.id },
      data: {
        coverImageUrl: "https://127.0.0.1/private-cover.png",
        logoUrl: "https://cdn.example.com/safe-logo.png",
      },
    });

    const management = (await getMerchantStore(merchant.reference)).store as
      | ReturnType<typeof ownerManagementStoreDto>
      | null;
    assert.ok(management);
    assert.equal(management.coverImageUrl, null);
    assert.equal(management.logoUrl, "https://cdn.example.com/safe-logo.png");
    assert.equal(management.unsafeCoverPresent, true);
    assert.equal(management.unsafeLogoPresent, false);
    const publicStore = await getPublicStore(active.slug);
    assert.equal(publicStore.coverImageUrl, null);
    assert.equal(JSON.stringify({ management, publicStore }).includes("127.0.0.1"), false);
  });

  await t.test("50 Owner remediation clears only unsafe ACTIVE images and replays exactly", async () => {
    const merchant = await createMerchant("legacy-active-clear");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant));
    const pending = await submitStoreForReview(merchant.reference, lifecycle(merchant, draft));
    const active = await approveStore(reviewer.context, adminInput(pending));
    const legacy = await prisma.store.update({
      where: { id: active.id },
      data: {
        coverImageUrl: "https://127.0.0.1/active-private.png",
        logoUrl: "https://cdn.example.com/keep-logo.png",
      },
    });
    const key = randomUUID();
    const input = lifecycle(merchant, {
      expectedVersion: legacy.updatedAt.toISOString(),
      id: legacy.id,
    }, key);
    const result = await clearUnsafeStoreImages(merchant.reference, input);
    assert.equal(result.status, "ACTIVE");
    assert.equal(result.publishedAt, active.publishedAt);
    assert.equal(result.coverImageUrl, null);
    assert.equal(result.logoUrl, "https://cdn.example.com/keep-logo.png");
    assert.equal(result.unsafeCoverPresent, false);
    assert.deepEqual(await clearUnsafeStoreImages(merchant.reference, input), result);
    assert.equal(await prisma.businessAuditLog.count({ where: { action: "commerce.store.images.clear-unsafe", targetId: legacy.id } }), 1);
    assert.equal(await prisma.businessOperationMutation.count({ where: { idempotencyKey: key } }), 1);
    const [audit, operation] = await Promise.all([
      prisma.businessAuditLog.findFirstOrThrow({
        where: {
          action: "commerce.store.images.clear-unsafe",
          actorMembershipId: merchant.membership.id,
          targetId: legacy.id,
        },
      }),
      prisma.businessOperationMutation.findUniqueOrThrow({ where: { organizationId_idempotencyKey: { organizationId: merchant.organization.id, idempotencyKey: key } } }),
    ]);
    assert.equal(JSON.stringify({ audit, operation }).includes("127.0.0.1"), false);
    await assert.rejects(
      clearUnsafeStoreImages(merchant.reference, { ...input, storeId: randomUUID() }),
      code("IDEMPOTENCY_CONFLICT"),
    );
    await assert.rejects(
      clearUnsafeStoreImages(merchant.reference, { ...input, idempotencyKey: randomUUID() }),
      code("STALE_VERSION"),
    );
    const persisted = await prisma.store.findUniqueOrThrow({ where: { id: legacy.id } });
    const auditBefore = await prisma.businessAuditLog.count({ where: { targetId: legacy.id } });
    const ledgerBefore = await prisma.businessOperationMutation.count({ where: { organizationId: merchant.organization.id } });
    await assert.rejects(
      clearUnsafeStoreImages(merchant.reference, lifecycle(merchant, {
        expectedVersion: persisted.updatedAt.toISOString(),
        id: persisted.id,
      })),
      code("CONFLICT"),
    );
    assert.equal(await prisma.businessAuditLog.count({ where: { targetId: legacy.id } }), auditBefore);
    assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: merchant.organization.id } }), ledgerBefore);
  });

  await t.test("51 SUSPENDED remediation preserves lifecycle while role and status policies fail closed", async () => {
    const merchant = await createMerchant("legacy-suspended-clear");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant));
    const pending = await submitStoreForReview(merchant.reference, lifecycle(merchant, draft));
    const active = await approveStore(reviewer.context, adminInput(pending));
    const suspendedStore = await suspendStore(reviewer.context, adminInput(active, "Legacy safety QA"));
    const legacy = await prisma.store.update({
      where: { id: active.id },
      data: { logoUrl: "javascript:legacy-private" },
    });
    const manager = await createMerchant("legacy-manager", {
      organizationId: merchant.organization.id,
      permissions: ["STORE_VIEW", "STORE_MANAGE"],
      role: "MANAGER",
    });
    const input = lifecycle(merchant, { expectedVersion: legacy.updatedAt.toISOString(), id: legacy.id });
    const deniedBefore = await prisma.businessOperationMutation.count({ where: { organizationId: merchant.organization.id } });
    await assert.rejects(clearUnsafeStoreImages(manager.reference, input), code("FORBIDDEN"));
    assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: merchant.organization.id } }), deniedBefore);
    const cleared = await clearUnsafeStoreImages(merchant.reference, input);
    assert.equal(cleared.status, "SUSPENDED");
    assert.equal(cleared.publishedAt, suspendedStore.publishedAt);
    assert.equal(cleared.logoUrl, null);

    const draftMerchant = await createMerchant("legacy-draft-policy");
    const policyDraft = await createStoreDraft(draftMerchant.reference, storeInput(draftMerchant));
    const unsafeDraft = await prisma.store.update({
      where: { id: policyDraft.id },
      data: { logoUrl: "https://127.0.0.1/draft-private.png" },
    });
    await assert.rejects(
      clearUnsafeStoreImages(draftMerchant.reference, lifecycle(draftMerchant, {
        expectedVersion: unsafeDraft.updatedAt.toISOString(),
        id: unsafeDraft.id,
      })),
      code("INVALID_TRANSITION"),
    );
  });

  await t.test("52 concurrent remediation keys produce one success and one stale conflict", async () => {
    const merchant = await createMerchant("legacy-clear-race");
    const draft = await createStoreDraft(merchant.reference, storeInput(merchant));
    const pending = await submitStoreForReview(merchant.reference, lifecycle(merchant, draft));
    const active = await approveStore(reviewer.context, adminInput(pending));
    const legacy = await prisma.store.update({
      where: { id: active.id },
      data: {
        coverImageUrl: "https://127.0.0.1/race-cover.png",
        logoUrl: "https://127.0.0.1/race-logo.png",
      },
    });
    const base = lifecycle(merchant, { expectedVersion: legacy.updatedAt.toISOString(), id: legacy.id });
    const results = await Promise.allSettled([
      clearUnsafeStoreImages(merchant.reference, base),
      clearUnsafeStoreImages(merchant.reference, { ...base, idempotencyKey: randomUUID() }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected" && code("STALE_VERSION")(result.reason)).length, 1);
    const persisted = await prisma.store.findUniqueOrThrow({ where: { id: legacy.id } });
    assert.equal(persisted.logoUrl, null);
    assert.equal(persisted.coverImageUrl, null);
    assert.equal(await prisma.businessAuditLog.count({ where: { action: "commerce.store.images.clear-unsafe", targetId: legacy.id } }), 1);
  });
});
