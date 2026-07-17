import { createHash } from "node:crypto";
import {
  Prisma,
  type CommercePermission,
  type PrismaClient,
  type StoreStatus,
  type SystemRole,
} from "@prisma/client";

import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../features/identity/policies/authorization";

const UUID = {
  organization: (suffix: string) => `3a000000-0000-4000-8000-${suffix}`,
  entity: (suffix: string) => `3a100000-0000-4000-8000-${suffix}`,
  person: (suffix: string) => `3a200000-0000-4000-8000-${suffix}`,
  role: (suffix: string) => `3a300000-0000-4000-8000-${suffix}`,
  member: (suffix: string) => `3a400000-0000-4000-8000-${suffix}`,
} as const;

export const COMMERCE_MERCHANT_STORE_STAGE3A_FIXTURE = {
  namespace: "rezno-qa-commerce-merchant-store-stage3a",
  unsafeImageProbe: "https://127.0.0.1/stage3a-private.png",
  organizations: {
    merchant: [UUID.organization("000000000001"), "rezno-qa-commerce-stage3a-merchant"],
    foreign: [UUID.organization("000000000002"), "rezno-qa-commerce-stage3a-foreign"],
    noStore: [UUID.organization("000000000003"), "rezno-qa-commerce-stage3a-no-store"],
    pending: [UUID.organization("000000000004"), "rezno-qa-commerce-stage3a-pending"],
    rejected: [UUID.organization("000000000005"), "rezno-qa-commerce-stage3a-rejected"],
    active: [UUID.organization("000000000006"), "rezno-qa-commerce-stage3a-active"],
    suspended: [UUID.organization("000000000007"), "rezno-qa-commerce-stage3a-suspended"],
    archived: [UUID.organization("000000000008"), "rezno-qa-commerce-stage3a-archived"],
    orderBlocked: [UUID.organization("000000000009"), "rezno-qa-commerce-stage3a-order-blocked"],
    reservationBlocked: [UUID.organization("00000000000a"), "rezno-qa-commerce-stage3a-reservation-blocked"],
  },
  people: {
    owner: [UUID.person("000000000001"), "fixture:stage3a:owner"],
    managerView: [UUID.person("000000000002"), "fixture:stage3a:manager-view"],
    managerDenied: [UUID.person("000000000003"), "fixture:stage3a:manager-denied"],
    receptionist: [UUID.person("000000000004"), "fixture:stage3a:receptionist"],
    staffPermitted: [UUID.person("000000000005"), "fixture:stage3a:staff-permitted"],
    staffDenied: [UUID.person("000000000006"), "fixture:stage3a:staff-denied"],
    foreignOwner: [UUID.person("000000000007"), "fixture:stage3a:foreign-owner"],
    adminReviewer: [UUID.person("000000000008"), "fixture:stage3a:admin-reviewer"],
    adminReadOnly: [UUID.person("000000000009"), "fixture:stage3a:admin-read-only"],
    adminExpired: [UUID.person("00000000000a"), "fixture:stage3a:admin-expired"],
  },
  roles: {
    owner: UUID.role("000000000001"),
    managerView: UUID.role("000000000002"),
    managerDenied: UUID.role("000000000003"),
    receptionist: UUID.role("000000000004"),
    staffPermitted: UUID.role("000000000005"),
    staffDenied: UUID.role("000000000006"),
    foreignOwner: UUID.role("000000000007"),
  },
  members: {
    owner: UUID.member("000000000001"),
    managerView: UUID.member("000000000002"),
    managerDenied: UUID.member("000000000003"),
    receptionist: UUID.member("000000000004"),
    staffPermitted: UUID.member("000000000005"),
    staffDenied: UUID.member("000000000006"),
    foreignOwner: UUID.member("000000000007"),
  },
  stores: {
    draft: [UUID.entity("000000000001"), "rezno-qa-commerce-stage3a-draft"],
    foreign: [UUID.entity("000000000002"), "rezno-qa-commerce-stage3a-foreign-store"],
    pending: [UUID.entity("000000000003"), "rezno-qa-commerce-stage3a-pending-store"],
    rejected: [UUID.entity("000000000004"), "rezno-qa-commerce-stage3a-rejected-store"],
    active: [UUID.entity("000000000005"), "rezno-qa-commerce-stage3a-active-store"],
    suspended: [UUID.entity("000000000006"), "rezno-qa-commerce-stage3a-suspended-store"],
    archived: [UUID.entity("000000000007"), "rezno-qa-commerce-stage3a-archived-store"],
    orderBlocked: [UUID.entity("000000000008"), "rezno-qa-commerce-stage3a-order-blocked-store"],
    reservationBlocked: [UUID.entity("000000000009"), "rezno-qa-commerce-stage3a-reservation-blocked-store"],
  },
  commerce: {
    category: UUID.entity("000000000010"),
    product: UUID.entity("000000000011"),
    variant: UUID.entity("000000000012"),
    inventory: UUID.entity("000000000013"),
    activeOrder: UUID.entity("000000000014"),
    reservationOrder: UUID.entity("000000000015"),
    reservationOrderItem: UUID.entity("000000000016"),
    reservation: UUID.entity("000000000017"),
  },
  adminUsers: {
    reviewer: "fixture:stage3a:admin-reviewer",
    readOnly: "fixture:stage3a:admin-read-only",
    expired: "fixture:stage3a:admin-expired",
  },
  adminAccess: {
    reviewer: UUID.entity("000000000020"),
    readOnly: UUID.entity("000000000021"),
    expired: UUID.entity("000000000022"),
  },
} as const;

export class CommerceMerchantStoreStage3aSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceMerchantStoreStage3aSeedInvariantError";
  }
}

export async function seedCommerceMerchantStoreStage3aFixture(prisma: PrismaClient) {
  return prisma.$transaction(
    async (transaction) => seedTransaction(transaction),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 },
  );
}

async function seedTransaction(transaction: Prisma.TransactionClient) {
  await assertTarget(transaction);
  const fixture = COMMERCE_MERCHANT_STORE_STAGE3A_FIXTURE;
  const organizations = {} as Record<keyof typeof fixture.organizations, { id: string }>;
  for (const [key, tuple] of Object.entries(fixture.organizations) as Array<
    [keyof typeof fixture.organizations, readonly [string, string]]
  >) {
    organizations[key] = await organization(transaction, tuple, `Stage 3A ${key}`);
  }

  const people = {} as Record<keyof typeof fixture.people, { id: string }>;
  let phoneSuffix = 100;
  for (const [key, tuple] of Object.entries(fixture.people) as Array<
    [keyof typeof fixture.people, readonly [string, string]]
  >) {
    people[key] = await person(transaction, tuple, `Stage 3A ${key}`, `+9647500000${phoneSuffix++}`);
  }

  const roleRows = {
    owner: await role(transaction, fixture.roles.owner, organizations.merchant.id, "Stage3A Owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    managerView: await role(transaction, fixture.roles.managerView, organizations.merchant.id, "Stage3A Manager View", "MANAGER", ["STORE_VIEW"]),
    managerDenied: await role(transaction, fixture.roles.managerDenied, organizations.merchant.id, "Stage3A Manager Denied", "MANAGER", []),
    receptionist: await role(transaction, fixture.roles.receptionist, organizations.merchant.id, "Stage3A Receptionist", "RECEPTIONIST", []),
    staffPermitted: await role(transaction, fixture.roles.staffPermitted, organizations.merchant.id, "Stage3A Staff Permitted", "STAFF", ["INVENTORY_VIEW"]),
    staffDenied: await role(transaction, fixture.roles.staffDenied, organizations.merchant.id, "Stage3A Staff Denied", "STAFF", []),
    foreignOwner: await role(transaction, fixture.roles.foreignOwner, organizations.foreign.id, "Stage3A Foreign Owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
  };
  await Promise.all([
    member(transaction, fixture.members.owner, organizations.merchant.id, people.owner.id, roleRows.owner.id),
    member(transaction, fixture.members.managerView, organizations.merchant.id, people.managerView.id, roleRows.managerView.id),
    member(transaction, fixture.members.managerDenied, organizations.merchant.id, people.managerDenied.id, roleRows.managerDenied.id),
    member(transaction, fixture.members.receptionist, organizations.merchant.id, people.receptionist.id, roleRows.receptionist.id),
    member(transaction, fixture.members.staffPermitted, organizations.merchant.id, people.staffPermitted.id, roleRows.staffPermitted.id),
    member(transaction, fixture.members.staffDenied, organizations.merchant.id, people.staffDenied.id, roleRows.staffDenied.id),
    member(transaction, fixture.members.foreignOwner, organizations.foreign.id, people.foreignOwner.id, roleRows.foreignOwner.id),
  ]);

  const stores = {
    draft: await store(transaction, fixture.stores.draft, organizations.merchant.id, "DRAFT"),
    foreign: await store(transaction, fixture.stores.foreign, organizations.foreign.id, "ACTIVE"),
    pending: await store(transaction, fixture.stores.pending, organizations.pending.id, "PENDING_REVIEW"),
    rejected: await store(transaction, fixture.stores.rejected, organizations.rejected.id, "REJECTED"),
    active: await store(transaction, fixture.stores.active, organizations.active.id, "ACTIVE"),
    suspended: await store(transaction, fixture.stores.suspended, organizations.suspended.id, "SUSPENDED"),
    archived: await store(transaction, fixture.stores.archived, organizations.archived.id, "ARCHIVED"),
    orderBlocked: await store(transaction, fixture.stores.orderBlocked, organizations.orderBlocked.id, "DRAFT"),
    reservationBlocked: await store(transaction, fixture.stores.reservationBlocked, organizations.reservationBlocked.id, "DRAFT"),
  };
  await ensureAdminAccess(transaction, people);
  await ensureArchiveBlockers(transaction, stores, people.owner.id);

  const statuses = await transaction.store.groupBy({
    by: ["status"],
    where: { id: { in: Object.values(fixture.stores).map(([id]) => id) } },
    _count: { _all: true },
    orderBy: { status: "asc" },
  });
  const fingerprint = createHash("sha256").update(JSON.stringify({
    namespace: fixture.namespace,
    organizations: Object.values(fixture.organizations).map(([id]) => id),
    people: Object.values(fixture.people).map(([id]) => id),
    statuses: statuses.map((row) => [row.status, row._count._all]),
    blockers: [fixture.commerce.activeOrder, fixture.commerce.reservation],
  })).digest("hex");
  return {
    fingerprint,
    namespace: fixture.namespace,
    organizationCount: Object.keys(organizations).length,
    personCount: Object.keys(people).length,
    storeCount: Object.keys(stores).length,
  };
}

async function assertTarget(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  if (rows[0]?.database !== "rezno_staging") {
    throw new CommerceMerchantStoreStage3aSeedInvariantError(
      "The connected database is not the exact rezno_staging target.",
    );
  }
}

async function organization(
  transaction: Prisma.TransactionClient,
  tuple: readonly [string, string],
  name: string,
) {
  const existing = await transaction.organization.findUnique({ where: { slug: tuple[1] }, select: { id: true } });
  if (existing && existing.id !== tuple[0]) {
    throw new CommerceMerchantStoreStage3aSeedInvariantError("A Stage 3A Organization slug is owned by another record.");
  }
  const value = await transaction.organization.upsert({
    where: { slug: tuple[1] },
    create: { id: tuple[0], isActive: true, isVerified: true, name, slug: tuple[1], status: "ACTIVE", vertical: "OTHER" },
    update: { deletedAt: null, isActive: true, isVerified: true, name, status: "ACTIVE", vertical: "OTHER" },
  });
  await transaction.organizationSettings.upsert({
    where: { organizationId: value.id },
    create: { bookingEnabled: false, marketplaceVisible: true, organizationId: value.id },
    update: { bookingEnabled: false, marketplaceVisible: true },
  });
  return value;
}

async function person(
  transaction: Prisma.TransactionClient,
  tuple: readonly [string, string],
  name: string,
  phone: string,
) {
  const existing = await transaction.person.findUnique({ where: { authUserId: tuple[1] }, select: { id: true } });
  if (existing && existing.id !== tuple[0]) {
    throw new CommerceMerchantStoreStage3aSeedInvariantError("A Stage 3A Person marker is owned by another record.");
  }
  return transaction.person.upsert({
    where: { authUserId: tuple[1] },
    create: { authUserId: tuple[1], displayName: name, firstName: name, id: tuple[0], isOnboarded: true, phone, status: "ACTIVE" },
    update: { deletedAt: null, displayName: name, firstName: name, isOnboarded: true, phone, status: "ACTIVE" },
  });
}

async function role(
  transaction: Prisma.TransactionClient,
  id: string,
  organizationId: string,
  name: string,
  systemRole: SystemRole,
  commercePermissions: CommercePermission[],
) {
  const existing = await transaction.role.findUnique({
    where: { organizationId_name: { name, organizationId } },
    select: { id: true },
  });
  if (existing && existing.id !== id) {
    throw new CommerceMerchantStoreStage3aSeedInvariantError("A Stage 3A Role marker is owned by another record.");
  }
  return transaction.role.upsert({
    where: { organizationId_name: { name, organizationId } },
    create: { commercePermissions, id, isSystem: true, name, organizationId, systemRole },
    update: { commercePermissions, isSystem: true, systemRole },
  });
}

async function member(
  transaction: Prisma.TransactionClient,
  id: string,
  organizationId: string,
  personId: string,
  roleId: string,
) {
  const existing = await transaction.organizationMember.findUnique({
    where: { personId_organizationId: { organizationId, personId } },
    select: { id: true },
  });
  if (existing && existing.id !== id) {
    throw new CommerceMerchantStoreStage3aSeedInvariantError("A Stage 3A membership marker is owned by another record.");
  }
  return transaction.organizationMember.upsert({
    where: { personId_organizationId: { organizationId, personId } },
    create: { id, organizationId, personId, roleId, status: "ACTIVE" },
    update: { deletedAt: null, roleId, status: "ACTIVE" },
  });
}

async function store(
  transaction: Prisma.TransactionClient,
  tuple: readonly [string, string],
  organizationId: string,
  status: StoreStatus,
) {
  const [bySlug, byOrganization] = await Promise.all([
    transaction.store.findUnique({ where: { slug: tuple[1] } }),
    transaction.store.findUnique({ where: { organizationId } }),
  ]);
  if ((bySlug && (bySlug.id !== tuple[0] || bySlug.organizationId !== organizationId)) ||
      (byOrganization && byOrganization.id !== tuple[0])) {
    throw new CommerceMerchantStoreStage3aSeedInvariantError("A Stage 3A Store identity is owned by another record.");
  }
  const lifecycle = lifecycleData(status);
  const data = {
    ...lifecycle,
    archiveReason: status === "ARCHIVED" ? "Stage 3A historical archive" : null,
    currency: "IQD",
    deliveryArea: "Karrada",
    deliveryCity: "Baghdad",
    deliveryEnabled: true,
    deliveryEstimateMinutes: 45,
    deliveryFee: "1000",
    description: `Deterministic ${status} Store for Gate 3A staging QA.`,
    logoUrl: "https://example.test/stage3a-store.png",
    minimumOrderValue: "0",
    name: `Stage 3A ${status} Store`,
    pickupArea: "Karrada",
    pickupCity: "Baghdad",
    pickupEnabled: true,
    pickupStreet: "Stage 3A Street",
    preparationEstimateMinutes: 20,
    reviewReason: status === "REJECTED" ? "Correct the public Store description" : null,
    status,
    supportPhone: "+9647500000999",
    suspensionReason: status === "SUSPENDED" ? "Stage 3A suspension fixture" : null,
  };
  if (bySlug) return transaction.store.update({ where: { id: bySlug.id }, data });
  return transaction.store.create({ data: { ...data, id: tuple[0], organizationId, slug: tuple[1] } });
}

function lifecycleData(status: StoreStatus) {
  const submittedAt = ["PENDING_REVIEW", "REJECTED", "ACTIVE", "SUSPENDED", "ARCHIVED"].includes(status)
    ? new Date("2026-07-17T01:00:00.000Z") : null;
  const reviewedAt = ["REJECTED", "ACTIVE", "SUSPENDED", "ARCHIVED"].includes(status)
    ? new Date("2026-07-17T02:00:00.000Z") : null;
  const publishedAt = ["ACTIVE", "SUSPENDED", "ARCHIVED"].includes(status)
    ? new Date("2026-07-17T03:00:00.000Z") : null;
  return {
    archivedAt: status === "ARCHIVED" ? new Date("2026-07-17T05:00:00.000Z") : null,
    publishedAt,
    reviewedAt,
    submittedAt,
    suspendedAt: status === "SUSPENDED" ? new Date("2026-07-17T04:00:00.000Z") : null,
  };
}

async function ensureAdminAccess(
  transaction: Prisma.TransactionClient,
  people: Record<keyof typeof COMMERCE_MERCHANT_STORE_STAGE3A_FIXTURE.people, { id: string }>,
) {
  const fixture = COMMERCE_MERCHANT_STORE_STAGE3A_FIXTURE;
  const rows = [
    { accessId: fixture.adminAccess.reviewer, email: "stage3a-reviewer@rezno.invalid", person: people.adminReviewer, permissions: ["COMMERCE_STORES_VIEW", "COMMERCE_STORES_REVIEW"], userId: fixture.adminUsers.reviewer },
    { accessId: fixture.adminAccess.readOnly, email: "stage3a-read-only@rezno.invalid", person: people.adminReadOnly, permissions: ["COMMERCE_STORES_VIEW"], userId: fixture.adminUsers.readOnly },
    { accessId: fixture.adminAccess.expired, email: "stage3a-expired@rezno.invalid", expiresAt: new Date("2020-01-01T00:00:00.000Z"), person: people.adminExpired, permissions: ["COMMERCE_STORES_VIEW", "COMMERCE_STORES_REVIEW"], userId: fixture.adminUsers.expired },
  ];
  for (const row of rows) {
    await transaction.user.upsert({
      where: { id: row.userId },
      create: { email: row.email, emailVerified: true, id: row.userId, name: row.userId },
      update: { emailVerified: true, name: row.userId },
    });
    await transaction.person.update({ where: { id: row.person.id }, data: { authUserId: row.userId } });
    const existing = await transaction.adminAccess.findUnique({ where: { userId: row.userId }, select: { id: true } });
    if (existing && existing.id !== row.accessId) {
      throw new CommerceMerchantStoreStage3aSeedInvariantError("A Stage 3A AdminAccess marker is owned by another record.");
    }
    await transaction.adminAccess.upsert({
      where: { userId: row.userId },
      create: { expiresAt: row.expiresAt, id: row.accessId, permissions: row.permissions, userId: row.userId },
      update: { expiresAt: row.expiresAt ?? null, permissions: row.permissions, status: "ACTIVE" },
    });
  }
}

async function ensureArchiveBlockers(
  transaction: Prisma.TransactionClient,
  stores: { orderBlocked: { id: string; name: string; slug: string }; reservationBlocked: { id: string; name: string; slug: string } },
  customerId: string,
) {
  const fixture = COMMERCE_MERCHANT_STORE_STAGE3A_FIXTURE;
  await transaction.order.upsert({
    where: { id: fixture.commerce.activeOrder },
    create: orderData(fixture.commerce.activeOrder, "STAGE3A-ACTIVE-ORDER", stores.orderBlocked, customerId, "PENDING"),
    update: { status: "PENDING" },
  });
  const category = await transaction.marketplaceCategory.upsert({
    where: { slug: `${fixture.namespace}-category` },
    create: { id: fixture.commerce.category, name: "Stage 3A Reservation", normalizedName: "stage 3a reservation", slug: `${fixture.namespace}-category` },
    update: { name: "Stage 3A Reservation", normalizedName: "stage 3a reservation", status: "ACTIVE" },
  });
  const product = await transaction.product.upsert({
    where: { storeId_slug: { slug: "stage3a-reserved-product", storeId: stores.reservationBlocked.id } },
    create: { categoryId: category.id, id: fixture.commerce.product, name: "Stage 3A Reserved Product", normalizedSearchText: "stage 3a reserved product", slug: "stage3a-reserved-product", storeId: stores.reservationBlocked.id },
    update: { categoryId: category.id, name: "Stage 3A Reserved Product", normalizedSearchText: "stage 3a reserved product", status: "DRAFT" },
  });
  const variant = await transaction.productVariant.upsert({
    where: { storeId_sku: { sku: "STAGE3A-RESERVED-SKU", storeId: stores.reservationBlocked.id } },
    create: { id: fixture.commerce.variant, isDefault: true, optionKey: "default", optionValues: {}, price: "1000", productId: product.id, sku: "STAGE3A-RESERVED-SKU", storeId: stores.reservationBlocked.id, title: "Default" },
    update: { isDefault: true, optionKey: "default", optionValues: {}, price: "1000", status: "ACTIVE", title: "Default" },
  });
  const inventory = await transaction.inventoryItem.upsert({
    where: { variantId: variant.id },
    create: { id: fixture.commerce.inventory, onHand: 1, reserved: 1, variantId: variant.id },
    update: { onHand: 1, reserved: 1 },
  });
  const order = await transaction.order.upsert({
    where: { id: fixture.commerce.reservationOrder },
    create: orderData(fixture.commerce.reservationOrder, "STAGE3A-RESERVATION-ORDER", stores.reservationBlocked, customerId, "CANCELLED"),
    update: { status: "CANCELLED" },
  });
  const item = await transaction.orderItem.upsert({
    where: { id: fixture.commerce.reservationOrderItem },
    create: { currency: "IQD", id: fixture.commerce.reservationOrderItem, lineSubtotal: "1000", lineTotal: "1000", optionValuesSnapshot: {}, orderId: order.id, productId: product.id, productNameSnapshot: product.name, productVariantId: variant.id, quantity: 1, skuSnapshot: variant.sku, unitPrice: "1000", variantTitleSnapshot: variant.title },
    update: { quantity: 1 },
  });
  await transaction.inventoryReservation.upsert({
    where: { deterministicKey: `${fixture.namespace}:active-reservation` },
    create: { deterministicKey: `${fixture.namespace}:active-reservation`, expiresAt: new Date("2099-01-01T00:00:00.000Z"), id: fixture.commerce.reservation, inventoryItemId: inventory.id, orderId: order.id, orderItemId: item.id, productVariantId: variant.id, quantity: 1 },
    update: { consumedAt: null, expiresAt: new Date("2099-01-01T00:00:00.000Z"), quantity: 1, releasedAt: null, status: "ACTIVE" },
  });
}

function orderData(
  id: string,
  orderNumber: string,
  store: { id: string; name: string; slug: string },
  customerId: string,
  status: "PENDING" | "CANCELLED",
) {
  return {
    currency: "IQD",
    customerId,
    customerNameSnapshot: "Stage 3A QA Customer",
    customerPhoneSnapshot: "+9647500000100",
    fulfillmentMethod: "CUSTOMER_PICKUP" as const,
    grandTotal: "1000",
    id,
    orderNumber,
    paymentMethod: "PAY_AT_PICKUP" as const,
    reservationExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    status,
    storeId: store.id,
    storeNameSnapshot: store.name,
    storeSlugSnapshot: store.slug,
    subtotal: "1000",
  };
}
