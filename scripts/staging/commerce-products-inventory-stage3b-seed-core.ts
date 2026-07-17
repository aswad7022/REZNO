import { createHash } from "node:crypto";

import {
  Prisma,
  type CommercePermission,
  type PrismaClient,
  type StoreStatus,
  type SystemRole,
} from "@prisma/client";

import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../features/identity/policies/authorization";

function uuid(group: number, value: number) {
  return `3b${group.toString(16).padStart(2, "0")}0000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

export const COMMERCE_PRODUCTS_INVENTORY_STAGE3B_FIXTURE = {
  namespace: "rezno-qa-commerce-products-inventory-stage3b",
  organizations: {
    primary: [uuid(0, 1), "rezno-qa-commerce-products-stage3b"],
    draft: [uuid(0, 2), "rezno-qa-commerce-products-stage3b-draft"],
    suspended: [uuid(0, 3), "rezno-qa-commerce-products-stage3b-suspended"],
    foreign: [uuid(0, 4), "rezno-qa-commerce-products-stage3b-foreign"],
  },
  people: {
    owner: [uuid(1, 1), "fixture:stage3b:owner"],
    managerProduct: [uuid(1, 2), "fixture:stage3b:manager-product"],
    managerRead: [uuid(1, 3), "fixture:stage3b:manager-read"],
    staffAdjust: [uuid(1, 4), "fixture:stage3b:staff-adjust"],
    staffView: [uuid(1, 5), "fixture:stage3b:staff-view"],
    staffDenied: [uuid(1, 6), "fixture:stage3b:staff-denied"],
    receptionist: [uuid(1, 7), "fixture:stage3b:receptionist"],
    foreignOwner: [uuid(1, 8), "fixture:stage3b:foreign-owner"],
    customer: [uuid(1, 9), "fixture:stage3b:customer"],
  },
  stores: {
    primary: [uuid(4, 1), "rezno-qa-commerce-products-stage3b-store"],
    draft: [uuid(4, 2), "rezno-qa-commerce-products-stage3b-draft-store"],
    suspended: [uuid(4, 3), "rezno-qa-commerce-products-stage3b-suspended-store"],
    foreign: [uuid(4, 4), "rezno-qa-commerce-products-stage3b-foreign-store"],
  },
  categories: {
    active: [uuid(5, 1), "rezno-qa-stage3b-active"],
    inactive: [uuid(5, 2), "rezno-qa-stage3b-inactive"],
  },
  product: (index: number) => uuid(6, index + 1),
  variant: (index: number, slot = 0) => uuid(7, index * 10 + slot + 1),
  inventory: (index: number, slot = 0) => uuid(8, index * 10 + slot + 1),
  media: { unsafe: uuid(9, 1), safe: uuid(9, 2) },
  cart: uuid(10, 1),
  cartItem: uuid(10, 2),
  order: uuid(11, 1),
  orderItem: uuid(11, 2),
  reservation: uuid(11, 3),
  movement: uuid(11, 4),
} as const;

export class CommerceProductsInventoryStage3bSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceProductsInventoryStage3bSeedInvariantError";
  }
}

export async function seedCommerceProductsInventoryStage3bFixture(prisma: PrismaClient) {
  return prisma.$transaction(
    async (transaction) => seedTransaction(transaction),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 },
  );
}

async function seedTransaction(transaction: Prisma.TransactionClient) {
  await assertTarget(transaction);
  const fixture = COMMERCE_PRODUCTS_INVENTORY_STAGE3B_FIXTURE;
  const organizations = {
    primary: await organization(transaction, fixture.organizations.primary, "Stage 3B Products Primary"),
    draft: await organization(transaction, fixture.organizations.draft, "Stage 3B Products Draft"),
    suspended: await organization(transaction, fixture.organizations.suspended, "Stage 3B Products Suspended"),
    foreign: await organization(transaction, fixture.organizations.foreign, "Stage 3B Products Foreign"),
  };
  const peopleEntries = Object.entries(fixture.people) as Array<[
    keyof typeof fixture.people,
    readonly [string, string],
  ]>;
  const people = {} as Record<keyof typeof fixture.people, { id: string }>;
  for (const [index, [key, value]] of peopleEntries.entries()) {
    people[key] = await person(transaction, value, `Stage 3B ${key}`, `+964750003${String(index).padStart(3, "0")}`);
  }

  const roles = {
    owner: await role(transaction, uuid(2, 1), organizations.primary.id, "Stage3B Owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    managerProduct: await role(transaction, uuid(2, 2), organizations.primary.id, "Stage3B Product Manager", "MANAGER", ["PRODUCT_VIEW", "PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_ARCHIVE", "INVENTORY_VIEW"]),
    managerRead: await role(transaction, uuid(2, 3), organizations.primary.id, "Stage3B Read Manager", "MANAGER", ["PRODUCT_VIEW", "INVENTORY_VIEW"]),
    staffAdjust: await role(transaction, uuid(2, 4), organizations.primary.id, "Stage3B Inventory Adjust Staff", "STAFF", ["PRODUCT_VIEW", "INVENTORY_VIEW", "INVENTORY_ADJUST"]),
    staffView: await role(transaction, uuid(2, 5), organizations.primary.id, "Stage3B Inventory View Staff", "STAFF", ["PRODUCT_VIEW", "INVENTORY_VIEW"]),
    staffDenied: await role(transaction, uuid(2, 6), organizations.primary.id, "Stage3B Denied Staff", "STAFF", []),
    receptionist: await role(transaction, uuid(2, 7), organizations.primary.id, "Stage3B Receptionist", "RECEPTIONIST", []),
    foreignOwner: await role(transaction, uuid(2, 8), organizations.foreign.id, "Stage3B Foreign Owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
  };
  await Promise.all([
    member(transaction, uuid(3, 1), organizations.primary.id, people.owner.id, roles.owner.id),
    member(transaction, uuid(3, 2), organizations.primary.id, people.managerProduct.id, roles.managerProduct.id),
    member(transaction, uuid(3, 3), organizations.primary.id, people.managerRead.id, roles.managerRead.id),
    member(transaction, uuid(3, 4), organizations.primary.id, people.staffAdjust.id, roles.staffAdjust.id),
    member(transaction, uuid(3, 5), organizations.primary.id, people.staffView.id, roles.staffView.id),
    member(transaction, uuid(3, 6), organizations.primary.id, people.staffDenied.id, roles.staffDenied.id),
    member(transaction, uuid(3, 7), organizations.primary.id, people.receptionist.id, roles.receptionist.id),
    member(transaction, uuid(3, 8), organizations.foreign.id, people.foreignOwner.id, roles.foreignOwner.id),
  ]);

  const stores = {
    primary: await store(transaction, fixture.stores.primary, organizations.primary.id, "ACTIVE"),
    draft: await store(transaction, fixture.stores.draft, organizations.draft.id, "DRAFT"),
    suspended: await store(transaction, fixture.stores.suspended, organizations.suspended.id, "SUSPENDED"),
    foreign: await store(transaction, fixture.stores.foreign, organizations.foreign.id, "ACTIVE"),
  };
  const categories = {
    active: await category(transaction, fixture.categories.active, "Stage 3B Active", "ACTIVE"),
    inactive: await category(transaction, fixture.categories.inactive, "Stage 3B Inactive", "INACTIVE"),
  };

  for (let index = 0; index < 24; index += 1) {
    const status = index === 0 ? "DRAFT" : index === 2 ? "SUSPENDED" : index === 3 ? "ARCHIVED" : "PUBLISHED";
    await product(transaction, fixture.product(index), stores.primary.id, categories.active.id, index, status);
    await variant(transaction, fixture.variant(index), fixture.product(index), stores.primary.id, `STAGE3B-${String(index).padStart(2, "0")}`, true);
    await inventory(transaction, fixture.inventory(index), fixture.variant(index), index === 1 ? 5 : 20, 0, index === 1 ? 5 : null);
  }
  await variant(transaction, fixture.variant(1, 1), fixture.product(1), stores.primary.id, "STAGE3B-OUT", false, { Size: "Out" });
  await inventory(transaction, fixture.inventory(1, 1), fixture.variant(1, 1), 0, 0, 2);
  await variant(transaction, fixture.variant(1, 2), fixture.product(1), stores.primary.id, "STAGE3B-RESERVED", false, { Size: "Reserved" });
  await inventory(transaction, fixture.inventory(1, 2), fixture.variant(1, 2), 10, 4, 4);

  await media(transaction, fixture.media.unsafe, fixture.product(1), 0, "javascript:stage3b-historical-media", null);
  await media(transaction, fixture.media.safe, fixture.product(1), 1, "https://cdn.example.com/rezno-stage3b-product.jpg", "Stage 3B safe image");
  await product(transaction, uuid(6, 100), stores.foreign.id, categories.active.id, 100, "PUBLISHED");
  await variant(transaction, uuid(7, 1000), uuid(6, 100), stores.foreign.id, "FOREIGN-STAGE3B-SENTINEL", true);
  await inventory(transaction, uuid(8, 1000), uuid(7, 1000), 99, 0, null);

  await cartAndOrder(transaction, stores.primary.id, people.customer.id);

  const productRows = await transaction.product.findMany({
    where: { id: { in: [...Array.from({ length: 24 }, (_, index) => fixture.product(index)), uuid(6, 100)] } },
    orderBy: { id: "asc" },
    select: { archivedAt: true, categoryId: true, id: true, publishedAt: true, slug: true, status: true, storeId: true },
  });
  const variantRows = await transaction.productVariant.findMany({
    where: { productId: { in: productRows.map((item) => item.id) } },
    orderBy: { id: "asc" },
    select: {
      archivedAt: true, compareAtPrice: true, currency: true, id: true, isDefault: true,
      optionKey: true, optionValues: true, price: true, productId: true, sku: true, status: true, storeId: true,
    },
  });
  const inventoryRows = await transaction.inventoryItem.findMany({
    where: { variantId: { in: variantRows.map((item) => item.id) } },
    orderBy: { id: "asc" },
    select: { id: true, lowStockThreshold: true, onHand: true, reserved: true, variantId: true, version: true },
  });
  const mediaRows = await transaction.productMedia.findMany({
    where: { id: { in: Object.values(fixture.media) } },
    orderBy: { id: "asc" },
    select: { altText: true, id: true, mediaType: true, productId: true, sortOrder: true, url: true, variantId: true },
  });
  const organizationRows = await transaction.organization.findMany({
    where: { id: { in: Object.values(fixture.organizations).map(([id]) => id) } },
    orderBy: { id: "asc" },
    select: { deletedAt: true, id: true, isActive: true, slug: true, status: true },
  });
  const peopleRows = await transaction.person.findMany({
    where: { id: { in: Object.values(fixture.people).map(([id]) => id) } },
    orderBy: { id: "asc" },
    select: { authUserId: true, deletedAt: true, id: true, isOnboarded: true, status: true },
  });
  const [cartRow, cartItemRow, orderRow, orderItemRow, reservationRow, movementRow] = await Promise.all([
    transaction.cart.findUnique({ where: { id: fixture.cart }, select: { customerId: true, id: true, status: true, storeId: true, version: true } }),
    transaction.cartItem.findUnique({ where: { id: fixture.cartItem }, select: { cartId: true, id: true, productVariantId: true, quantity: true, unitPriceSnapshot: true } }),
    transaction.order.findUnique({ where: { id: fixture.order }, select: { customerId: true, id: true, orderNumber: true, status: true, storeId: true } }),
    transaction.orderItem.findUnique({ where: { id: fixture.orderItem }, select: { id: true, imageUrlSnapshot: true, orderId: true, productId: true, productVariantId: true, quantity: true } }),
    transaction.inventoryReservation.findUnique({ where: { id: fixture.reservation }, select: { deterministicKey: true, id: true, inventoryItemId: true, orderId: true, productVariantId: true, quantity: true, status: true } }),
    transaction.stockMovement.findUnique({ where: { id: fixture.movement }, select: { id: true, idempotencyKey: true, inventoryItemId: true, onHandDelta: true, quantity: true, reservedDelta: true, resultingOnHand: true, resultingReserved: true, type: true } }),
  ]);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    cartItemRow,
    cartRow,
    inventoryRows,
    mediaRows,
    movementRow,
    namespace: fixture.namespace,
    organizationRows,
    orderItemRow,
    orderRow,
    peopleRows,
    productRows,
    reservationRow,
    stores: Object.values(fixture.stores),
    variantRows,
  })).digest("hex");
  return {
    fingerprint,
    namespace: fixture.namespace,
    organizationCount: Object.keys(organizations).length,
    people: Object.keys(people).length,
    personCount: Object.keys(people).length,
    productCount: productRows.length,
    variantCount: variantRows.length,
  };
}

async function assertTarget(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  if (rows[0]?.database !== "rezno_staging") {
    throw new CommerceProductsInventoryStage3bSeedInvariantError("The connected database is not the exact rezno_staging target.");
  }
}

async function organization(transaction: Prisma.TransactionClient, tuple: readonly [string, string], name: string) {
  const collision = await transaction.organization.findUnique({ where: { slug: tuple[1] }, select: { id: true } });
  if (collision && collision.id !== tuple[0]) throw new CommerceProductsInventoryStage3bSeedInvariantError("A Stage 3B Organization slug belongs to another record.");
  return transaction.organization.upsert({
    where: { id: tuple[0] },
    create: { id: tuple[0], isActive: true, isVerified: true, name, slug: tuple[1], status: "ACTIVE", vertical: "OTHER" },
    update: { deletedAt: null, isActive: true, isVerified: true, name, slug: tuple[1], status: "ACTIVE", vertical: "OTHER" },
  });
}

async function person(transaction: Prisma.TransactionClient, tuple: readonly [string, string], name: string, phone: string) {
  return transaction.person.upsert({
    where: { id: tuple[0] },
    create: { authUserId: tuple[1], displayName: name, firstName: name, id: tuple[0], isOnboarded: true, phone, status: "ACTIVE" },
    update: { authUserId: tuple[1], deletedAt: null, displayName: name, firstName: name, isOnboarded: true, phone, status: "ACTIVE" },
  });
}

async function role(transaction: Prisma.TransactionClient, id: string, organizationId: string, name: string, systemRole: SystemRole, commercePermissions: CommercePermission[]) {
  return transaction.role.upsert({
    where: { id },
    create: { commercePermissions, id, isSystem: true, name, organizationId, systemRole },
    update: { commercePermissions, isSystem: true, name, organizationId, systemRole },
  });
}

async function member(transaction: Prisma.TransactionClient, id: string, organizationId: string, personId: string, roleId: string) {
  return transaction.organizationMember.upsert({
    where: { id },
    create: { id, organizationId, personId, roleId, status: "ACTIVE" },
    update: { deletedAt: null, organizationId, personId, roleId, status: "ACTIVE" },
  });
}

async function store(transaction: Prisma.TransactionClient, tuple: readonly [string, string], organizationId: string, status: StoreStatus) {
  const active = status === "ACTIVE" || status === "SUSPENDED";
  return transaction.store.upsert({
    where: { id: tuple[0] },
    create: {
      deliveryArea: "Karrada", deliveryCity: "Baghdad", deliveryEnabled: true, deliveryEstimateMinutes: 30,
      deliveryFee: "1000", id: tuple[0], minimumOrderValue: "0", name: `Stage 3B ${status} Store`, organizationId,
      pickupArea: "Karrada", pickupCity: "Baghdad", pickupEnabled: true, pickupStreet: "Stage 3B Fixture Street",
      preparationEstimateMinutes: 15, publishedAt: active ? new Date("2026-07-17T08:00:00.000Z") : null,
      slug: tuple[1], status, supportPhone: "+964750003100",
    },
    update: {
      archivedAt: null, deliveryArea: "Karrada", deliveryCity: "Baghdad", deliveryEnabled: true,
      name: `Stage 3B ${status} Store`, organizationId, publishedAt: active ? new Date("2026-07-17T08:00:00.000Z") : null,
      slug: tuple[1], status, suspendedAt: status === "SUSPENDED" ? new Date("2026-07-17T09:00:00.000Z") : null,
      suspensionReason: status === "SUSPENDED" ? "Stage 3B fixture suspension" : null,
    },
  });
}

async function category(transaction: Prisma.TransactionClient, tuple: readonly [string, string], name: string, status: "ACTIVE" | "INACTIVE") {
  return transaction.marketplaceCategory.upsert({
    where: { id: tuple[0] },
    create: { id: tuple[0], name, normalizedName: tuple[1], slug: tuple[1], status },
    update: { name, normalizedName: tuple[1], slug: tuple[1], status },
  });
}

async function product(transaction: Prisma.TransactionClient, id: string, storeId: string, categoryId: string, index: number, status: "DRAFT" | "PUBLISHED" | "SUSPENDED" | "ARCHIVED") {
  const published = status === "PUBLISHED" || status === "SUSPENDED";
  return transaction.product.upsert({
    where: { id },
    create: {
      archivedAt: status === "ARCHIVED" ? new Date("2026-07-17T10:00:00.000Z") : null,
      categoryId, description: `Stage 3B Product ${index}`, id, name: `Stage 3B Product ${String(index).padStart(2, "0")}`,
      normalizedSearchText: `stage 3b product ${index}`, publishedAt: published ? new Date("2026-07-17T08:00:00.000Z") : null,
      slug: `stage3b-product-${String(index).padStart(2, "0")}`, status, storeId,
    },
    update: {
      archivedAt: status === "ARCHIVED" ? new Date("2026-07-17T10:00:00.000Z") : null,
      categoryId, description: `Stage 3B Product ${index}`, name: `Stage 3B Product ${String(index).padStart(2, "0")}`,
      normalizedSearchText: `stage 3b product ${index}`, publishedAt: published ? new Date("2026-07-17T08:00:00.000Z") : null,
      status, storeId,
    },
  });
}

async function variant(transaction: Prisma.TransactionClient, id: string, productId: string, storeId: string, sku: string, isDefault: boolean, optionValues: Record<string, string> = {}) {
  const optionKey = Object.keys(optionValues).length ? Object.entries(optionValues).map(([key, value]) => `${key.toLowerCase()}=${value.toLowerCase()}`).join("|") : "default";
  return transaction.productVariant.upsert({
    where: { id },
    create: { id, inventory: undefined, isDefault, optionKey, optionValues, price: "10000", productId, sku, status: "ACTIVE", storeId, title: isDefault ? "Default" : sku },
    update: { archivedAt: null, isDefault, optionKey, optionValues, price: "10000", productId, sku, status: "ACTIVE", storeId, title: isDefault ? "Default" : sku },
  });
}

async function inventory(transaction: Prisma.TransactionClient, id: string, variantId: string, onHand: number, reserved: number, lowStockThreshold: number | null) {
  return transaction.inventoryItem.upsert({
    where: { id },
    create: { id, lowStockThreshold, onHand, reserved, variantId },
    update: { lowStockThreshold, onHand, reserved, variantId, version: 0 },
  });
}

async function media(transaction: Prisma.TransactionClient, id: string, productId: string, sortOrder: number, url: string, altText: string | null) {
  return transaction.productMedia.upsert({
    where: { id },
    create: { altText, id, productId, sortOrder, url },
    update: { altText, productId, sortOrder, url, variantId: null },
  });
}

async function cartAndOrder(transaction: Prisma.TransactionClient, storeId: string, customerId: string) {
  const fixture = COMMERCE_PRODUCTS_INVENTORY_STAGE3B_FIXTURE;
  await transaction.cart.upsert({
    where: { id: fixture.cart },
    create: { customerId, id: fixture.cart, status: "ACTIVE", storeId },
    update: { customerId, status: "ACTIVE", storeId, version: 1 },
  });
  await transaction.cartItem.upsert({
    where: { id: fixture.cartItem },
    create: { cartId: fixture.cart, id: fixture.cartItem, productVariantId: fixture.variant(1), quantity: 1, unitPriceSnapshot: "10000" },
    update: { cartId: fixture.cart, productVariantId: fixture.variant(1), quantity: 1, unitPriceSnapshot: "10000" },
  });
  await transaction.order.upsert({
    where: { id: fixture.order },
    create: {
      currency: "IQD", customerId, customerNameSnapshot: "Stage 3B Customer", customerPhoneSnapshot: "+964750003008",
      fulfillmentMethod: "CUSTOMER_PICKUP", grandTotal: "10000", id: fixture.order, orderNumber: "REZNO-STAGE3B-PENDING",
      paymentMethod: "PAY_AT_PICKUP", reservationExpiresAt: new Date("2099-01-01T00:00:00.000Z"), status: "PENDING",
      storeId, storeNameSnapshot: "Stage 3B ACTIVE Store", storeSlugSnapshot: fixture.stores.primary[1], subtotal: "10000",
    },
    update: { customerId, fulfillmentStatus: "UNFULFILLED", paymentStatus: "UNPAID", status: "PENDING", storeId },
  });
  await transaction.orderItem.upsert({
    where: { id: fixture.orderItem },
    create: {
      currency: "IQD", id: fixture.orderItem, imageUrlSnapshot: "javascript:stage3b-historical-order-image",
      lineSubtotal: "10000", lineTotal: "10000", optionValuesSnapshot: { Size: "Reserved" }, orderId: fixture.order,
      productId: fixture.product(1), productNameSnapshot: "Stage 3B Product 01", productVariantId: fixture.variant(1, 2),
      quantity: 1, skuSnapshot: "STAGE3B-RESERVED", unitPrice: "10000", variantTitleSnapshot: "Reserved",
    },
    update: { imageUrlSnapshot: "javascript:stage3b-historical-order-image", orderId: fixture.order, quantity: 1 },
  });
  await transaction.inventoryReservation.upsert({
    where: { id: fixture.reservation },
    create: {
      deterministicKey: "rezno-stage3b-pending-reservation", expiresAt: new Date("2099-01-01T00:00:00.000Z"), id: fixture.reservation,
      inventoryItemId: fixture.inventory(1, 2), orderId: fixture.order, orderItemId: fixture.orderItem,
      productVariantId: fixture.variant(1, 2), quantity: 1, status: "ACTIVE",
    },
    update: { consumedAt: null, expiresAt: new Date("2099-01-01T00:00:00.000Z"), releasedAt: null, status: "ACTIVE" },
  });
  await transaction.stockMovement.upsert({
    where: { id: fixture.movement },
    create: {
      actorType: "SYSTEM", id: fixture.movement, idempotencyKey: "rezno-stage3b-reservation-movement",
      inventoryItemId: fixture.inventory(1, 2), onHandDelta: 0, orderId: fixture.order, quantity: 1,
      reason: "STAGE3B_FIXTURE_RESERVATION", reservationId: fixture.reservation, reservedDelta: 1,
      resultingOnHand: 10, resultingReserved: 4, type: "RESERVE",
    },
    update: { resultingOnHand: 10, resultingReserved: 4 },
  });
}
