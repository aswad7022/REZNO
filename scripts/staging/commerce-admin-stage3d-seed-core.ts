import { createHash } from "node:crypto";

import {
  Prisma,
  type AdminAccessStatus,
  type CommerceOrderStatus,
  type FulfillmentStatus,
  type InventoryReservationStatus,
  type MarketplaceCategoryStatus,
  type PaymentStatus,
  type PrismaClient,
  type ProductStatus,
  type StoreStatus,
} from "@prisma/client";

import type { AdminPermission } from "../../features/admin/config/permissions";

function uuid(group: number, value: number) {
  return `3d${group.toString(16).padStart(2, "0")}0000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

function admin(index: number, key: string, permissions: AdminPermission[], options: {
  access?: boolean;
  expiresAt?: string;
  status?: AdminAccessStatus;
} = {}) {
  return {
    accessId: options.access === false ? null : uuid(2, index),
    email: `rezno-qa-stage3d-${key}@rezno.invalid`,
    expiresAt: options.expiresAt ?? null,
    permissions,
    personId: uuid(1, index),
    status: options.status ?? "ACTIVE" as AdminAccessStatus,
    userId: `fixture:stage3d:admin:${key}`,
  } as const;
}

const VIEW = {
  audit: ["AUDIT_LOG_VIEW"],
  catalog: ["COMMERCE_CATALOG_VIEW"],
  inventory: ["COMMERCE_INVENTORY_VIEW"],
  orders: ["COMMERCE_ORDERS_VIEW"],
  stores: ["COMMERCE_STORES_VIEW"],
} satisfies Record<string, AdminPermission[]>;

const ORDER_NAMES = [
  "pending", "overdue", "confirmed", "preparing", "deliveryFailed", "paid", "completed", "foreign",
] as const;
type OrderName = typeof ORDER_NAMES[number];

export const COMMERCE_ADMIN_STAGE3D_FIXTURE = {
  namespace: "rezno-qa-commerce-admin-stage3d",
  admins: {
    envSuper: admin(1, "env-super", [], { access: false }),
    storesView: admin(2, "stores-view", VIEW.stores),
    storesReview: admin(3, "stores-review", ["COMMERCE_STORES_VIEW", "COMMERCE_STORES_REVIEW"]),
    catalogView: admin(4, "catalog-view", VIEW.catalog),
    catalogModerate: admin(5, "catalog-moderate", ["COMMERCE_CATALOG_VIEW", "COMMERCE_CATALOG_MODERATE"]),
    inventoryView: admin(6, "inventory-view", VIEW.inventory),
    inventoryManage: admin(7, "inventory-manage", ["COMMERCE_INVENTORY_VIEW", "COMMERCE_INVENTORY_MANAGE"]),
    ordersView: admin(8, "orders-view", VIEW.orders),
    ordersManage: admin(9, "orders-manage", ["COMMERCE_ORDERS_VIEW", "COMMERCE_ORDERS_MANAGE"]),
    auditView: admin(10, "audit-view", VIEW.audit),
    expired: admin(11, "expired", VIEW.catalog, { expiresAt: "2020-01-01T00:00:00.000Z" }),
    revoked: admin(12, "revoked", VIEW.orders, { status: "REVOKED" }),
    foreignNonAdmin: admin(13, "foreign-non-admin", [], { access: false }),
  },
  organizations: {
    draft: [uuid(3, 1), "rezno-qa-stage3d-draft"],
    pending: [uuid(3, 2), "rezno-qa-stage3d-pending"],
    active: [uuid(3, 3), "rezno-qa-stage3d-active"],
    rejected: [uuid(3, 4), "rezno-qa-stage3d-rejected"],
    suspended: [uuid(3, 5), "rezno-qa-stage3d-suspended"],
    archived: [uuid(3, 6), "rezno-qa-stage3d-archived"],
    foreign: [uuid(3, 7), "rezno-qa-stage3d-foreign"],
  },
  stores: {
    draft: [uuid(4, 1), "rezno-qa-stage3d-store-draft"],
    pending: [uuid(4, 2), "rezno-qa-stage3d-store-pending"],
    active: [uuid(4, 3), "rezno-qa-stage3d-store-active"],
    rejected: [uuid(4, 4), "rezno-qa-stage3d-store-rejected"],
    suspended: [uuid(4, 5), "rezno-qa-stage3d-store-suspended"],
    archived: [uuid(4, 6), "rezno-qa-stage3d-store-archived"],
    foreign: [uuid(4, 7), "rezno-qa-stage3d-store-foreign"],
  },
  categories: {
    active: [uuid(5, 1), "rezno-qa-stage3d-category-active"],
    inactive: [uuid(5, 2), "rezno-qa-stage3d-category-inactive"],
    archived: [uuid(5, 3), "rezno-qa-stage3d-category-archived"],
  },
  products: {
    draft: uuid(6, 1), published: uuid(6, 2), suspended: uuid(6, 3), archived: uuid(6, 4), foreign: uuid(6, 5),
  },
  variant: (index: number) => uuid(7, index),
  inventory: (index: number) => uuid(8, index),
  media: (index: number) => uuid(9, index),
  orders: Object.fromEntries(ORDER_NAMES.map((name, index) => [name, uuid(10, index + 1)])) as Record<OrderName, string>,
  orderItem: (name: OrderName) => uuid(11, ORDER_NAMES.indexOf(name) + 1),
  payment: (name: OrderName) => uuid(12, ORDER_NAMES.indexOf(name) + 1),
  reservation: (name: OrderName) => uuid(13, ORDER_NAMES.indexOf(name) + 1),
  history: (name: OrderName) => uuid(14, ORDER_NAMES.indexOf(name) + 1),
  movement: (name: OrderName) => uuid(15, ORDER_NAMES.indexOf(name) + 1),
  merchant: {
    membershipId: uuid(16, 1), personId: uuid(16, 2), roleId: uuid(16, 3),
  },
  customerId: uuid(16, 4),
  businessAuditId: uuid(17, 1),
  adminAudit: (index: number) => uuid(18, index),
} as const;

export class CommerceAdminStage3dSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceAdminStage3dSeedInvariantError";
  }
}

const NOW = new Date("2026-07-17T12:00:00.000Z");

type OrderSeed = {
  fulfillmentStatus: FulfillmentStatus;
  name: OrderName;
  paymentStatus: PaymentStatus;
  reservationStatus: InventoryReservationStatus;
  status: CommerceOrderStatus;
  store: "active" | "foreign";
};

const ORDERS: OrderSeed[] = [
  { fulfillmentStatus: "UNFULFILLED", name: "pending", paymentStatus: "UNPAID", reservationStatus: "ACTIVE", status: "PENDING", store: "active" },
  { fulfillmentStatus: "UNFULFILLED", name: "overdue", paymentStatus: "UNPAID", reservationStatus: "ACTIVE", status: "PENDING", store: "active" },
  { fulfillmentStatus: "UNFULFILLED", name: "confirmed", paymentStatus: "UNPAID", reservationStatus: "CONSUMED", status: "CONFIRMED", store: "active" },
  { fulfillmentStatus: "PREPARING", name: "preparing", paymentStatus: "UNPAID", reservationStatus: "CONSUMED", status: "CONFIRMED", store: "active" },
  { fulfillmentStatus: "DELIVERY_FAILED", name: "deliveryFailed", paymentStatus: "UNPAID", reservationStatus: "CONSUMED", status: "CONFIRMED", store: "active" },
  { fulfillmentStatus: "READY_FOR_PICKUP", name: "paid", paymentStatus: "PAID", reservationStatus: "CONSUMED", status: "CONFIRMED", store: "active" },
  { fulfillmentStatus: "PICKED_UP", name: "completed", paymentStatus: "PAID", reservationStatus: "CONSUMED", status: "COMPLETED", store: "active" },
  { fulfillmentStatus: "UNFULFILLED", name: "foreign", paymentStatus: "UNPAID", reservationStatus: "ACTIVE", status: "PENDING", store: "foreign" },
];

export async function seedCommerceAdminStage3dFixture(prisma: PrismaClient) {
  return prisma.$transaction((transaction) => seedTransaction(transaction), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 60_000,
  });
}

async function seedTransaction(transaction: Prisma.TransactionClient) {
  await assertTarget(transaction);
  const fixture = COMMERCE_ADMIN_STAGE3D_FIXTURE;
  for (const [key, value] of Object.entries(fixture.admins)) await seedAdmin(transaction, key, value);

  await transaction.person.upsert({
    where: { id: fixture.customerId },
    create: { authUserId: "fixture:stage3d:customer", firstName: "Stage 3D Customer", id: fixture.customerId, isOnboarded: true, phone: "+9647500033000" },
    update: { deletedAt: null, firstName: "Stage 3D Customer", isOnboarded: true, phone: "+9647500033000", status: "ACTIVE" },
  });
  await transaction.person.upsert({
    where: { id: fixture.merchant.personId },
    create: { authUserId: "fixture:stage3d:merchant", firstName: "Stage 3D Merchant", id: fixture.merchant.personId, isOnboarded: true },
    update: { deletedAt: null, firstName: "Stage 3D Merchant", isOnboarded: true, status: "ACTIVE" },
  });

  const organizations = {} as Record<keyof typeof fixture.organizations, { id: string }>;
  for (const [key, tuple] of Object.entries(fixture.organizations) as Array<[
    keyof typeof fixture.organizations,
    readonly [string, string],
  ]>) organizations[key] = await seedOrganization(transaction, tuple, key);

  const stores = {} as Record<keyof typeof fixture.stores, { id: string; name: string; slug: string }>;
  const storeStatuses: Record<keyof typeof fixture.stores, StoreStatus> = {
    active: "ACTIVE", archived: "ARCHIVED", draft: "DRAFT", foreign: "ACTIVE",
    pending: "PENDING_REVIEW", rejected: "REJECTED", suspended: "SUSPENDED",
  };
  for (const [key, tuple] of Object.entries(fixture.stores) as Array<[
    keyof typeof fixture.stores,
    readonly [string, string],
  ]>) stores[key] = await seedStore(transaction, tuple, organizations[key].id, key, storeStatuses[key]);

  await transaction.role.upsert({
    where: { id: fixture.merchant.roleId },
    create: { commercePermissions: ["STORE_VIEW", "PRODUCT_VIEW", "INVENTORY_VIEW", "ORDER_VIEW", "REPORTS_VIEW"], id: fixture.merchant.roleId, isSystem: true, name: "Stage3D Reports", organizationId: organizations.active.id, systemRole: "MANAGER" },
    update: { commercePermissions: ["STORE_VIEW", "PRODUCT_VIEW", "INVENTORY_VIEW", "ORDER_VIEW", "REPORTS_VIEW"], name: "Stage3D Reports", organizationId: organizations.active.id },
  });
  await transaction.organizationMember.upsert({
    where: { id: fixture.merchant.membershipId },
    create: { id: fixture.merchant.membershipId, organizationId: organizations.active.id, personId: fixture.merchant.personId, roleId: fixture.merchant.roleId },
    update: { deletedAt: null, organizationId: organizations.active.id, personId: fixture.merchant.personId, roleId: fixture.merchant.roleId, status: "ACTIVE" },
  });

  const categories = {
    active: await seedCategory(transaction, fixture.categories.active, "ACTIVE", 10),
    inactive: await seedCategory(transaction, fixture.categories.inactive, "INACTIVE", 20),
    archived: await seedCategory(transaction, fixture.categories.archived, "ARCHIVED", 30),
  };
  const products = await seedProducts(transaction, stores, categories);
  for (const seed of ORDERS) await seedOrder(transaction, seed, stores, products);
  await seedAuditHistory(transaction, fixture, organizations.active.id);

  const adminRows = await transaction.adminAccess.findMany({
    where: { id: { in: Object.values(fixture.admins).flatMap((item) => item.accessId ? [item.accessId] : []) } },
    orderBy: { id: "asc" }, select: { id: true, permissions: true, role: true, status: true, userId: true },
  });
  const storeRows = await transaction.store.findMany({ where: { id: { in: Object.values(fixture.stores).map(([id]) => id) } }, orderBy: { id: "asc" }, select: { id: true, organizationId: true, slug: true, status: true } });
  const categoryRows = await transaction.marketplaceCategory.findMany({ where: { id: { in: Object.values(fixture.categories).map(([id]) => id) } }, orderBy: { id: "asc" }, select: { displayOrder: true, id: true, slug: true, status: true } });
  const productRows = await transaction.product.findMany({ where: { id: { in: Object.values(fixture.products) } }, orderBy: { id: "asc" }, select: { categoryId: true, id: true, status: true, storeId: true } });
  const inventoryRows = await transaction.inventoryItem.findMany({ where: { id: { in: [1, 2, 3, 4, 5].map(fixture.inventory) } }, orderBy: { id: "asc" }, select: { id: true, lowStockThreshold: true, onHand: true, reserved: true, variantId: true } });
  const orderRows = await transaction.order.findMany({ where: { id: { in: Object.values(fixture.orders) } }, orderBy: { id: "asc" }, select: { fulfillmentStatus: true, id: true, paymentStatus: true, status: true, storeId: true } });
  const reservationRows = await transaction.inventoryReservation.findMany({ where: { id: { in: ORDER_NAMES.map(fixture.reservation) } }, orderBy: { id: "asc" }, select: { inventoryItemId: true, orderId: true, status: true } });
  const auditRows = await transaction.adminAuditLog.findMany({ where: { id: { in: [1, 2, 3, 4].map(fixture.adminAudit) } }, orderBy: { id: "asc" }, select: { action: true, adminUserId: true, id: true, targetId: true, targetType: true } });
  const fingerprint = createHash("sha256").update(JSON.stringify({
    adminRows, auditRows, categoryRows, inventoryRows, namespace: fixture.namespace,
    orderRows, productRows, reservationRows, storeRows,
  })).digest("hex");
  return {
    adminCount: adminRows.length,
    auditCount: auditRows.length,
    fingerprint,
    inventoryCount: inventoryRows.length,
    namespace: fixture.namespace,
    orderCount: orderRows.length,
    storeCount: storeRows.length,
  };
}

async function assertTarget(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  if (rows[0]?.database !== "rezno_staging") {
    throw new CommerceAdminStage3dSeedInvariantError("The connected database is not the exact rezno_staging target.");
  }
}

async function seedAdmin(
  transaction: Prisma.TransactionClient,
  key: string,
  value: (typeof COMMERCE_ADMIN_STAGE3D_FIXTURE.admins)[keyof typeof COMMERCE_ADMIN_STAGE3D_FIXTURE.admins],
) {
  await transaction.user.upsert({
    where: { id: value.userId },
    create: { email: value.email, id: value.userId, name: `Stage 3D ${key}` },
    update: { email: value.email, name: `Stage 3D ${key}` },
  });
  await transaction.person.upsert({
    where: { id: value.personId },
    create: { authUserId: value.userId, firstName: `Stage 3D ${key}`, id: value.personId, isOnboarded: true },
    update: { authUserId: value.userId, deletedAt: null, firstName: `Stage 3D ${key}`, isOnboarded: true, status: "ACTIVE" },
  });
  if (value.accessId) {
    await transaction.adminAccess.upsert({
      where: { id: value.accessId },
      create: { expiresAt: value.expiresAt ? new Date(value.expiresAt) : null, id: value.accessId, permissions: [...value.permissions], status: value.status, userId: value.userId },
      update: { expiresAt: value.expiresAt ? new Date(value.expiresAt) : null, permissions: [...value.permissions], status: value.status, userId: value.userId },
    });
  } else {
    await transaction.adminAccess.deleteMany({ where: { userId: value.userId } });
  }
}

async function seedOrganization(
  transaction: Prisma.TransactionClient,
  tuple: readonly [string, string],
  key: string,
) {
  const collision = await transaction.organization.findUnique({ where: { slug: tuple[1] }, select: { id: true } });
  if (collision && collision.id !== tuple[0]) throw new CommerceAdminStage3dSeedInvariantError("A Stage 3D Organization slug belongs to another record.");
  return transaction.organization.upsert({
    where: { id: tuple[0] },
    create: { id: tuple[0], isActive: true, isVerified: true, name: `Stage 3D ${key}`, slug: tuple[1], status: "ACTIVE", vertical: "OTHER" },
    update: { deletedAt: null, isActive: true, isVerified: true, name: `Stage 3D ${key}`, slug: tuple[1], status: "ACTIVE", vertical: "OTHER" },
  });
}

async function seedStore(
  transaction: Prisma.TransactionClient,
  tuple: readonly [string, string],
  organizationId: string,
  key: string,
  status: StoreStatus,
) {
  const archived = status === "ARCHIVED";
  const published = status === "ACTIVE";
  const suspended = status === "SUSPENDED";
  return transaction.store.upsert({
    where: { id: tuple[0] },
    create: {
      archivedAt: archived ? NOW : null, deliveryArea: "Karrada", deliveryCity: "Baghdad", deliveryEnabled: true,
      deliveryEstimateMinutes: 30, id: tuple[0], name: `Stage 3D ${key} Store`, organizationId,
      pickupArea: "Karrada", pickupCity: "Baghdad", pickupEnabled: true, pickupStreet: "Stage 3D Street",
      preparationEstimateMinutes: 15, publishedAt: published ? NOW : null, slug: tuple[1], status,
      submittedAt: status === "PENDING_REVIEW" || status === "REJECTED" ? NOW : null,
      suspendedAt: suspended ? NOW : null, suspensionReason: suspended ? "Stage 3D fixture suspension" : null,
    },
    update: {
      archivedAt: archived ? NOW : null, name: `Stage 3D ${key} Store`, organizationId,
      publishedAt: published ? NOW : null, slug: tuple[1], status,
      submittedAt: status === "PENDING_REVIEW" || status === "REJECTED" ? NOW : null,
      suspendedAt: suspended ? NOW : null, suspensionReason: suspended ? "Stage 3D fixture suspension" : null,
    },
  });
}

async function seedCategory(
  transaction: Prisma.TransactionClient,
  tuple: readonly [string, string],
  status: MarketplaceCategoryStatus,
  displayOrder: number,
) {
  return transaction.marketplaceCategory.upsert({
    where: { id: tuple[0] },
    create: { displayOrder, id: tuple[0], name: `Stage 3D ${status} Category`, normalizedName: `stage 3d ${status.toLowerCase()} category`, slug: tuple[1], status },
    update: { displayOrder, name: `Stage 3D ${status} Category`, normalizedName: `stage 3d ${status.toLowerCase()} category`, slug: tuple[1], status },
  });
}

async function seedProducts(
  transaction: Prisma.TransactionClient,
  stores: Record<keyof typeof COMMERCE_ADMIN_STAGE3D_FIXTURE.stores, { id: string }>,
  categories: Record<keyof typeof COMMERCE_ADMIN_STAGE3D_FIXTURE.categories, { id: string }>,
) {
  const fixture = COMMERCE_ADMIN_STAGE3D_FIXTURE;
  const rows: Array<{
    category: keyof typeof categories;
    inventory: { lowStockThreshold: number | null; onHand: number; reserved: number };
    key: keyof typeof fixture.products;
    status: ProductStatus;
    store: keyof typeof stores;
    unsafe?: boolean;
    variantStatus?: "ACTIVE" | "ARCHIVED";
  }> = [
    { category: "active", inventory: { lowStockThreshold: 2, onHand: 0, reserved: 0 }, key: "draft", status: "DRAFT", store: "active" },
    { category: "active", inventory: { lowStockThreshold: 3, onHand: 4, reserved: 2 }, key: "published", status: "PUBLISHED", store: "active" },
    { category: "active", inventory: { lowStockThreshold: null, onHand: 2_147_483_647, reserved: 0 }, key: "suspended", status: "SUSPENDED", store: "suspended", unsafe: true },
    { category: "archived", inventory: { lowStockThreshold: 1, onHand: 0, reserved: 0 }, key: "archived", status: "ARCHIVED", store: "archived", variantStatus: "ARCHIVED" },
    { category: "active", inventory: { lowStockThreshold: 5, onHand: 20, reserved: 1 }, key: "foreign", status: "PUBLISHED", store: "foreign" },
  ];
  const result = {} as Record<keyof typeof fixture.products, {
    id: string;
    inventoryId: string;
    variantId: string;
  }>;
  for (const [offset, row] of rows.entries()) {
    const index = offset + 1;
    const id = fixture.products[row.key];
    const archived = row.status === "ARCHIVED";
    const product = await transaction.product.upsert({
      where: { id },
      create: {
        archivedAt: archived ? NOW : null, categoryId: categories[row.category].id,
        description: `Stage 3D ${row.key} Product`, id, name: `Stage 3D ${row.key} Product`,
        normalizedSearchText: `stage 3d ${row.key} product`, publishedAt: row.status === "PUBLISHED" ? NOW : null,
        slug: `stage3d-${row.key}`, status: row.status, storeId: stores[row.store].id,
        suspendedAt: row.status === "SUSPENDED" ? NOW : null,
        suspensionReason: row.status === "SUSPENDED" ? "Stage 3D fixture moderation" : null,
      },
      update: {
        archivedAt: archived ? NOW : null, categoryId: categories[row.category].id,
        description: `Stage 3D ${row.key} Product`, name: `Stage 3D ${row.key} Product`,
        normalizedSearchText: `stage 3d ${row.key} product`, publishedAt: row.status === "PUBLISHED" ? NOW : null,
        status: row.status, storeId: stores[row.store].id,
        suspendedAt: row.status === "SUSPENDED" ? NOW : null,
        suspensionReason: row.status === "SUSPENDED" ? "Stage 3D fixture moderation" : null,
      },
    });
    const variantId = fixture.variant(index);
    await transaction.productVariant.upsert({
      where: { id: variantId },
      create: {
        archivedAt: archived ? NOW : null, id: variantId, isDefault: true, optionKey: "default", optionValues: {},
        price: "10000", productId: product.id, sku: `REZNO-STAGE3D-${index}`, status: row.variantStatus ?? "ACTIVE",
        storeId: stores[row.store].id, title: "Default",
      },
      update: {
        archivedAt: archived ? NOW : null, isDefault: true, optionKey: "default", optionValues: {},
        price: "10000", productId: product.id, status: row.variantStatus ?? "ACTIVE", storeId: stores[row.store].id,
      },
    });
    const inventoryId = fixture.inventory(index);
    await transaction.inventoryItem.upsert({
      where: { id: inventoryId },
      create: { id: inventoryId, ...row.inventory, variantId },
      update: { ...row.inventory, variantId, version: 0 },
    });
    await transaction.productMedia.upsert({
      where: { id: fixture.media(index) },
      create: {
        altText: `Stage 3D ${row.key}`, id: fixture.media(index), productId: id, sortOrder: 0,
        url: row.unsafe ? "javascript:rezno-stage3d-unsafe-history" : `https://cdn.example.com/rezno-stage3d-${row.key}.jpg`,
      },
      update: {
        altText: `Stage 3D ${row.key}`, productId: id, sortOrder: 0,
        url: row.unsafe ? "javascript:rezno-stage3d-unsafe-history" : `https://cdn.example.com/rezno-stage3d-${row.key}.jpg`,
      },
    });
    result[row.key] = { id, inventoryId, variantId };
  }
  return result;
}

async function seedOrder(
  transaction: Prisma.TransactionClient,
  seed: OrderSeed,
  stores: Record<keyof typeof COMMERCE_ADMIN_STAGE3D_FIXTURE.stores, { id: string; name: string; slug: string }>,
  products: Record<keyof typeof COMMERCE_ADMIN_STAGE3D_FIXTURE.products, {
    id: string;
    inventoryId: string;
    variantId: string;
  }>,
) {
  const fixture = COMMERCE_ADMIN_STAGE3D_FIXTURE;
  const store = stores[seed.store];
  const published = seed.store === "foreign" ? products.foreign : products.published;
  const orderId = fixture.orders[seed.name];
  const active = seed.reservationStatus === "ACTIVE";
  const completedAt = seed.status === "COMPLETED" ? NOW : null;
  const confirmedAt = seed.status === "CONFIRMED" || seed.status === "COMPLETED" ? NOW : null;
  const expiresAt = seed.name === "overdue"
    ? new Date("2020-01-01T00:00:00.000Z")
    : new Date("2099-01-01T00:00:00.000Z");
  await transaction.order.upsert({
    where: { id: orderId },
    create: {
      completedAt, confirmedAt, currency: "IQD", customerId: fixture.customerId,
      customerInstructions: `PRIVATE-STAGE3D-${seed.name}-INSTRUCTIONS`, customerNameSnapshot: `PRIVATE STAGE3D ${seed.name} CUSTOMER`,
      customerPhoneSnapshot: "+9647500033999", fulfillmentMethod: "CUSTOMER_PICKUP",
      fulfillmentStatus: seed.fulfillmentStatus, grandTotal: "10000", id: orderId,
      orderNumber: `REZNO-STAGE3D-${seed.name.toUpperCase()}`, paymentMethod: "PAY_AT_PICKUP",
      paymentStatus: seed.paymentStatus, pickupAddressSnapshot: "Stage 3D Pickup",
      reservationExpiresAt: expiresAt, status: seed.status, storeId: store.id,
      storeNameSnapshot: store.name, storeSlugSnapshot: store.slug, subtotal: "10000",
    },
    update: {
      completedAt, confirmedAt, customerId: fixture.customerId,
      customerInstructions: `PRIVATE-STAGE3D-${seed.name}-INSTRUCTIONS`, customerNameSnapshot: `PRIVATE STAGE3D ${seed.name} CUSTOMER`,
      customerPhoneSnapshot: "+9647500033999", fulfillmentStatus: seed.fulfillmentStatus,
      paymentStatus: seed.paymentStatus, reservationExpiresAt: expiresAt, status: seed.status,
      storeId: store.id, storeNameSnapshot: store.name, storeSlugSnapshot: store.slug,
    },
  });
  await transaction.orderItem.upsert({
    where: { id: fixture.orderItem(seed.name) },
    create: {
      currency: "IQD", id: fixture.orderItem(seed.name), imageUrlSnapshot: "https://cdn.example.com/rezno-stage3d-published.jpg",
      lineSubtotal: "10000", lineTotal: "10000", optionValuesSnapshot: {}, orderId,
      productId: published.id, productNameSnapshot: "Stage 3D published Product", productVariantId: published.variantId,
      quantity: 1, skuSnapshot: "REZNO-STAGE3D-2", unitPrice: "10000", variantTitleSnapshot: "Default",
    },
    update: {
      imageUrlSnapshot: "https://cdn.example.com/rezno-stage3d-published.jpg", orderId,
      productId: published.id, productNameSnapshot: "Stage 3D published Product", productVariantId: published.variantId,
      quantity: 1, skuSnapshot: "REZNO-STAGE3D-2", variantTitleSnapshot: "Default",
    },
  });
  await transaction.payment.upsert({
    where: { id: fixture.payment(seed.name) },
    create: {
      amount: "10000", id: fixture.payment(seed.name), method: "PAY_AT_PICKUP", orderId,
      paidAt: seed.paymentStatus === "PAID" ? NOW : null, status: seed.paymentStatus,
    },
    update: {
      amount: "10000", paidAt: seed.paymentStatus === "PAID" ? NOW : null,
      status: seed.paymentStatus, voidedAt: seed.paymentStatus === "VOIDED" ? NOW : null,
    },
  });
  await transaction.inventoryReservation.upsert({
    where: { id: fixture.reservation(seed.name) },
    create: {
      consumedAt: active ? null : NOW, deterministicKey: `stage3d:${seed.name}`, expiresAt,
      id: fixture.reservation(seed.name), inventoryItemId: published.inventoryId, orderId,
      orderItemId: fixture.orderItem(seed.name), productVariantId: published.variantId,
      quantity: 1, status: seed.reservationStatus,
    },
    update: {
      consumedAt: active ? null : NOW, expiresAt, inventoryItemId: published.inventoryId,
      releasedAt: null, status: seed.reservationStatus,
    },
  });
  await transaction.stockMovement.deleteMany({ where: { orderId } });
  await transaction.orderStatusHistory.deleteMany({ where: { orderId } });
  await transaction.orderStatusHistory.create({ data: {
    actorType: "SYSTEM", id: fixture.history(seed.name), idempotencyKey: uuid(19, ORDER_NAMES.indexOf(seed.name) + 1),
    metadata: { fixture: fixture.namespace }, newFulfillmentStatus: seed.fulfillmentStatus,
    newOrderStatus: seed.status, newPaymentStatus: seed.paymentStatus, orderId,
    reason: "STAGE3D_FIXTURE_BASELINE",
  } });
  await transaction.stockMovement.create({ data: {
    actorType: "SYSTEM", id: fixture.movement(seed.name), idempotencyKey: `stage3d-fixture:${seed.name}`,
    inventoryItemId: published.inventoryId, onHandDelta: active ? 0 : -1, orderId, quantity: 1,
    reservationId: fixture.reservation(seed.name), reservedDelta: active ? 1 : -1,
    resultingOnHand: seed.store === "foreign" ? 20 : active ? 4 : 3,
    resultingReserved: seed.store === "foreign" ? 1 : active ? 2 : 0,
    type: active ? "RESERVE" : "CONSUME",
  } });
}

async function seedAuditHistory(
  transaction: Prisma.TransactionClient,
  fixture: typeof COMMERCE_ADMIN_STAGE3D_FIXTURE,
  organizationId: string,
) {
  const ownedTargets = [
    ...Object.values(fixture.stores).map(([id]) => id),
    ...Object.values(fixture.categories).map(([id]) => id),
    ...Object.values(fixture.products),
    ...[1, 2, 3, 4, 5].map(fixture.inventory),
    ...Object.values(fixture.orders),
  ];
  await transaction.adminAuditLog.deleteMany({ where: { targetId: { in: ownedTargets } } });
  await transaction.notification.deleteMany({ where: { OR: [
    { metadata: { path: ["storeId"], string_contains: "3d040000" } },
    { metadata: { path: ["orderId"], string_contains: "3d0a0000" } },
    { metadata: { path: ["productId"], string_contains: "3d060000" } },
  ] } });
  const audits = [
    [1, fixture.admins.storesReview.userId, "commerce.store.approve", "Store", fixture.stores.active[0]],
    [2, fixture.admins.catalogModerate.userId, "commerce.product.suspend", "Product", fixture.products.suspended],
    [3, fixture.admins.inventoryManage.userId, "commerce.inventory.admin-correct", "InventoryItem", fixture.inventory(2)],
    [4, fixture.admins.ordersManage.userId, "commerce.order.admin-cancel", "Order", fixture.orders.pending],
  ] as const;
  for (const [index, adminUserId, action, targetType, targetId] of audits) {
    await transaction.adminAuditLog.create({ data: {
      action, adminUserId, createdAt: new Date(NOW.getTime() + index), id: fixture.adminAudit(index),
      metadata: { fixture: fixture.namespace, source: "database" }, targetId, targetType,
    } });
  }
  await transaction.businessAuditLog.deleteMany({ where: { id: fixture.businessAuditId } });
  await transaction.businessAuditLog.create({ data: {
    action: "commerce.order.confirm", actorMembershipId: fixture.merchant.membershipId,
    actorPersonId: fixture.merchant.personId, after: { fixture: fixture.namespace },
    id: fixture.businessAuditId, organizationId, targetId: fixture.orders.confirmed, targetType: "Order",
  } });
}
