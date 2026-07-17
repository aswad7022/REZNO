import { createHash } from "node:crypto";

import {
  Prisma,
  type CommerceOrderStatus,
  type CommercePermission,
  type FulfillmentMethod,
  type FulfillmentStatus,
  type InventoryReservationStatus,
  type PaymentStatus,
  type PrismaClient,
  type SystemRole,
} from "@prisma/client";

import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../features/identity/policies/authorization";

function uuid(group: number, value: number) {
  return `3c${group.toString(16).padStart(2, "0")}0000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

const ORDER_NAMES = [
  "pendingValid", "pendingOverdue", "confirmed", "preparingPickup", "readyPickup",
  "preparingDelivery", "outForDelivery", "deliveryFailed", "completed", "cancelled",
  "rejected", "expired", "archivedVariant", "foreign",
] as const;
type OrderName = typeof ORDER_NAMES[number];

export const COMMERCE_ORDERS_FULFILLMENT_STAGE3C_FIXTURE = {
  namespace: "rezno-qa-commerce-orders-fulfillment-stage3c",
  organizations: {
    primary: [uuid(0, 1), "rezno-qa-commerce-orders-stage3c"],
    suspended: [uuid(0, 2), "rezno-qa-commerce-orders-stage3c-suspended"],
    foreign: [uuid(0, 3), "rezno-qa-commerce-orders-stage3c-foreign"],
  },
  people: {
    owner: [uuid(1, 1), "fixture:stage3c:owner"],
    manager: [uuid(1, 2), "fixture:stage3c:manager"],
    managerRead: [uuid(1, 3), "fixture:stage3c:manager-read"],
    staffManage: [uuid(1, 4), "fixture:stage3c:staff-manage"],
    staffView: [uuid(1, 5), "fixture:stage3c:staff-view"],
    staffDenied: [uuid(1, 6), "fixture:stage3c:staff-denied"],
    receptionist: [uuid(1, 7), "fixture:stage3c:receptionist"],
    foreignOwner: [uuid(1, 8), "fixture:stage3c:foreign-owner"],
    customerA: [uuid(1, 9), "fixture:stage3c:customer-a"],
    customerB: [uuid(1, 10), "fixture:stage3c:customer-b"],
  },
  stores: {
    primary: [uuid(4, 1), "rezno-qa-commerce-orders-stage3c-store"],
    suspended: [uuid(4, 2), "rezno-qa-commerce-orders-stage3c-suspended-store"],
    foreign: [uuid(4, 3), "rezno-qa-commerce-orders-stage3c-foreign-store"],
  },
  category: [uuid(5, 1), "rezno-qa-commerce-orders-stage3c"],
  product: (index: number) => uuid(6, index + 1),
  variant: (index: number) => uuid(7, index + 1),
  inventory: (index: number) => uuid(8, index + 1),
  order: (name: OrderName) => uuid(9, ORDER_NAMES.indexOf(name) + 1),
  orderItem: (name: OrderName) => uuid(10, ORDER_NAMES.indexOf(name) + 1),
  reservation: (name: OrderName) => uuid(11, ORDER_NAMES.indexOf(name) + 1),
  payment: (name: OrderName) => uuid(12, ORDER_NAMES.indexOf(name) + 1),
  history: (name: OrderName) => uuid(13, ORDER_NAMES.indexOf(name) + 1),
  historyKey: (name: OrderName) => uuid(14, ORDER_NAMES.indexOf(name) + 1),
  movement: (name: OrderName) => uuid(15, ORDER_NAMES.indexOf(name) + 1),
  movementKey: (name: OrderName) => `stage3c-fixture:${name}`,
} as const;

export class CommerceOrdersFulfillmentStage3cSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceOrdersFulfillmentStage3cSeedInvariantError";
  }
}

type OrderSeed = {
  fulfillmentMethod: FulfillmentMethod;
  fulfillmentStatus: FulfillmentStatus;
  name: OrderName;
  orderStatus: CommerceOrderStatus;
  paymentStatus: PaymentStatus;
  reservationStatus: InventoryReservationStatus;
  store: "foreign" | "primary" | "suspended";
};

const ORDER_SEEDS: OrderSeed[] = [
  { fulfillmentMethod: "CUSTOMER_PICKUP", fulfillmentStatus: "UNFULFILLED", name: "pendingValid", orderStatus: "PENDING", paymentStatus: "UNPAID", reservationStatus: "ACTIVE", store: "primary" },
  { fulfillmentMethod: "CUSTOMER_PICKUP", fulfillmentStatus: "UNFULFILLED", name: "pendingOverdue", orderStatus: "PENDING", paymentStatus: "UNPAID", reservationStatus: "ACTIVE", store: "primary" },
  { fulfillmentMethod: "CUSTOMER_PICKUP", fulfillmentStatus: "UNFULFILLED", name: "confirmed", orderStatus: "CONFIRMED", paymentStatus: "UNPAID", reservationStatus: "CONSUMED", store: "primary" },
  { fulfillmentMethod: "CUSTOMER_PICKUP", fulfillmentStatus: "PREPARING", name: "preparingPickup", orderStatus: "CONFIRMED", paymentStatus: "UNPAID", reservationStatus: "CONSUMED", store: "primary" },
  { fulfillmentMethod: "CUSTOMER_PICKUP", fulfillmentStatus: "READY_FOR_PICKUP", name: "readyPickup", orderStatus: "CONFIRMED", paymentStatus: "UNPAID", reservationStatus: "CONSUMED", store: "primary" },
  { fulfillmentMethod: "STORE_DELIVERY", fulfillmentStatus: "PREPARING", name: "preparingDelivery", orderStatus: "CONFIRMED", paymentStatus: "UNPAID", reservationStatus: "CONSUMED", store: "primary" },
  { fulfillmentMethod: "STORE_DELIVERY", fulfillmentStatus: "OUT_FOR_DELIVERY", name: "outForDelivery", orderStatus: "CONFIRMED", paymentStatus: "UNPAID", reservationStatus: "CONSUMED", store: "primary" },
  { fulfillmentMethod: "STORE_DELIVERY", fulfillmentStatus: "DELIVERY_FAILED", name: "deliveryFailed", orderStatus: "CONFIRMED", paymentStatus: "UNPAID", reservationStatus: "CONSUMED", store: "primary" },
  { fulfillmentMethod: "CUSTOMER_PICKUP", fulfillmentStatus: "PICKED_UP", name: "completed", orderStatus: "COMPLETED", paymentStatus: "PAID", reservationStatus: "CONSUMED", store: "primary" },
  { fulfillmentMethod: "CUSTOMER_PICKUP", fulfillmentStatus: "CANCELLED", name: "cancelled", orderStatus: "CANCELLED", paymentStatus: "VOIDED", reservationStatus: "RELEASED", store: "primary" },
  { fulfillmentMethod: "CUSTOMER_PICKUP", fulfillmentStatus: "CANCELLED", name: "rejected", orderStatus: "REJECTED", paymentStatus: "VOIDED", reservationStatus: "RELEASED", store: "primary" },
  { fulfillmentMethod: "CUSTOMER_PICKUP", fulfillmentStatus: "CANCELLED", name: "expired", orderStatus: "EXPIRED", paymentStatus: "VOIDED", reservationStatus: "EXPIRED", store: "primary" },
  { fulfillmentMethod: "CUSTOMER_PICKUP", fulfillmentStatus: "UNFULFILLED", name: "archivedVariant", orderStatus: "CONFIRMED", paymentStatus: "UNPAID", reservationStatus: "CONSUMED", store: "suspended" },
  { fulfillmentMethod: "CUSTOMER_PICKUP", fulfillmentStatus: "UNFULFILLED", name: "foreign", orderStatus: "PENDING", paymentStatus: "UNPAID", reservationStatus: "ACTIVE", store: "foreign" },
];

export async function seedCommerceOrdersFulfillmentStage3cFixture(prisma: PrismaClient) {
  return prisma.$transaction((transaction) => seedTransaction(transaction), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 60_000,
  });
}

async function seedTransaction(transaction: Prisma.TransactionClient) {
  await assertTarget(transaction);
  const fixture = COMMERCE_ORDERS_FULFILLMENT_STAGE3C_FIXTURE;
  const organizations = {
    primary: await organization(transaction, fixture.organizations.primary, "Stage 3C Orders Primary"),
    suspended: await organization(transaction, fixture.organizations.suspended, "Stage 3C Orders Suspended"),
    foreign: await organization(transaction, fixture.organizations.foreign, "Stage 3C Orders Foreign"),
  };
  const people = {} as Record<keyof typeof fixture.people, { id: string }>;
  for (const [index, [key, tuple]] of (Object.entries(fixture.people) as Array<[keyof typeof fixture.people, readonly [string, string]]>).entries()) {
    people[key] = await person(transaction, tuple, `Stage 3C ${key}`, `+964750004${String(index).padStart(3, "0")}`);
  }
  const roles = {
    owner: await role(transaction, uuid(2, 1), organizations.primary.id, "Stage3C Owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
    manager: await role(transaction, uuid(2, 2), organizations.primary.id, "Stage3C Order Manager", "MANAGER", ["ORDER_VIEW", "ORDER_MANAGE", "ORDER_CANCEL"]),
    managerRead: await role(transaction, uuid(2, 3), organizations.primary.id, "Stage3C Read Manager", "MANAGER", ["ORDER_VIEW"]),
    staffManage: await role(transaction, uuid(2, 4), organizations.primary.id, "Stage3C Order Staff", "STAFF", ["ORDER_VIEW", "ORDER_MANAGE"]),
    staffView: await role(transaction, uuid(2, 5), organizations.primary.id, "Stage3C View Staff", "STAFF", ["ORDER_VIEW"]),
    staffDenied: await role(transaction, uuid(2, 6), organizations.primary.id, "Stage3C Denied Staff", "STAFF", []),
    receptionist: await role(transaction, uuid(2, 7), organizations.primary.id, "Stage3C Receptionist", "RECEPTIONIST", []),
    foreignOwner: await role(transaction, uuid(2, 8), organizations.foreign.id, "Stage3C Foreign Owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]),
  };
  await member(transaction, uuid(3, 1), organizations.primary.id, people.owner.id, roles.owner.id);
  await member(transaction, uuid(3, 2), organizations.primary.id, people.manager.id, roles.manager.id);
  await member(transaction, uuid(3, 3), organizations.primary.id, people.managerRead.id, roles.managerRead.id);
  await member(transaction, uuid(3, 4), organizations.primary.id, people.staffManage.id, roles.staffManage.id);
  await member(transaction, uuid(3, 5), organizations.primary.id, people.staffView.id, roles.staffView.id);
  await member(transaction, uuid(3, 6), organizations.primary.id, people.staffDenied.id, roles.staffDenied.id);
  await member(transaction, uuid(3, 7), organizations.primary.id, people.receptionist.id, roles.receptionist.id);
  await member(transaction, uuid(3, 8), organizations.foreign.id, people.foreignOwner.id, roles.foreignOwner.id);
  const stores = {
    primary: await store(transaction, fixture.stores.primary, organizations.primary.id, "ACTIVE"),
    suspended: await store(transaction, fixture.stores.suspended, organizations.suspended.id, "SUSPENDED"),
    foreign: await store(transaction, fixture.stores.foreign, organizations.foreign.id, "ACTIVE"),
  };
  await member(transaction, uuid(3, 9), organizations.suspended.id, people.owner.id, await role(
    transaction, uuid(2, 9), organizations.suspended.id, "Stage3C Suspended Owner", "OWNER", [...OWNER_DEFAULT_COMMERCE_PERMISSIONS],
  ).then((value) => value.id));
  const category = await transaction.marketplaceCategory.upsert({
    where: { id: fixture.category[0] },
    create: { id: fixture.category[0], name: "Stage 3C Orders", normalizedName: fixture.category[1], slug: fixture.category[1] },
    update: { name: "Stage 3C Orders", normalizedName: fixture.category[1], slug: fixture.category[1], status: "ACTIVE" },
  });
  for (const [index, seed] of ORDER_SEEDS.entries()) {
    await seedOrder(transaction, index, seed, stores[seed.store].id, category.id, seed.store === "foreign" ? people.customerB.id : people.customerA.id);
  }
  const orderRows = await transaction.order.findMany({
    where: { id: { in: ORDER_NAMES.map((name) => fixture.order(name)) } },
    orderBy: { id: "asc" },
    select: { fulfillmentMethod: true, fulfillmentStatus: true, id: true, orderNumber: true, paymentStatus: true, status: true, storeId: true },
  });
  const reservationRows = await transaction.inventoryReservation.findMany({
    where: { orderId: { in: orderRows.map((item) => item.id) } },
    orderBy: { id: "asc" },
    select: { inventoryItemId: true, orderId: true, productVariantId: true, quantity: true, status: true },
  });
  const inventoryRows = await transaction.inventoryItem.findMany({
    where: { id: { in: ORDER_NAMES.map((_, index) => fixture.inventory(index)) } },
    orderBy: { id: "asc" },
    select: { id: true, onHand: true, reserved: true, variantId: true, version: true },
  });
  const roleRows = await transaction.role.findMany({
    where: { id: { in: Object.values(roles).map((item) => item.id) } },
    orderBy: { id: "asc" },
    select: { commercePermissions: true, id: true, organizationId: true, systemRole: true },
  });
  const fingerprint = createHash("sha256").update(JSON.stringify({
    inventoryRows,
    namespace: fixture.namespace,
    orderRows,
    reservationRows,
    roleRows,
  })).digest("hex");
  return {
    fingerprint,
    inventoryCount: inventoryRows.length,
    namespace: fixture.namespace,
    orderCount: orderRows.length,
    organizationCount: Object.keys(organizations).length,
    personCount: Object.keys(people).length,
    reservationCount: reservationRows.length,
  };
}

async function seedOrder(transaction: Prisma.TransactionClient, index: number, seed: OrderSeed, storeId: string, categoryId: string, customerId: string) {
  const fixture = COMMERCE_ORDERS_FULFILLMENT_STAGE3C_FIXTURE;
  const productId = fixture.product(index);
  const variantId = fixture.variant(index);
  const inventoryId = fixture.inventory(index);
  const archived = seed.name === "archivedVariant";
  await transaction.product.upsert({
    where: { id: productId },
    create: {
      archivedAt: archived ? new Date("2026-07-17T08:00:00.000Z") : null, categoryId, description: `Stage 3C ${seed.name}`,
      id: productId, name: `Stage 3C ${seed.name}`, normalizedSearchText: `stage 3c ${seed.name}`,
      publishedAt: archived ? null : new Date("2026-07-17T07:00:00.000Z"), slug: `stage3c-${seed.name.toLowerCase()}`,
      status: archived ? "ARCHIVED" : "PUBLISHED", storeId,
    },
    update: {
      archivedAt: archived ? new Date("2026-07-17T08:00:00.000Z") : null, categoryId, name: `Stage 3C ${seed.name}`,
      publishedAt: archived ? null : new Date("2026-07-17T07:00:00.000Z"), status: archived ? "ARCHIVED" : "PUBLISHED", storeId,
    },
  });
  await transaction.productVariant.upsert({
    where: { id: variantId },
    create: {
      archivedAt: archived ? new Date("2026-07-17T08:00:00.000Z") : null, id: variantId, isDefault: true,
      optionKey: "default", optionValues: {}, price: "10000", productId, sku: `STAGE3C-${index}`,
      status: archived ? "ARCHIVED" : "ACTIVE", storeId, title: "Default",
    },
    update: {
      archivedAt: archived ? new Date("2026-07-17T08:00:00.000Z") : null, isDefault: true,
      status: archived ? "ARCHIVED" : "ACTIVE", storeId,
    },
  });
  const consumed = seed.reservationStatus === "CONSUMED";
  const active = seed.reservationStatus === "ACTIVE";
  const nearMaximum = seed.name === "confirmed";
  const onHand = nearMaximum ? 2_147_483_647 : consumed ? 9 : seed.name === "pendingValid" ? 1 : 10;
  await transaction.inventoryItem.upsert({
    where: { id: inventoryId },
    create: { id: inventoryId, onHand, reserved: active ? 1 : 0, variantId },
    update: { onHand, reserved: active ? 1 : 0, variantId, version: 0 },
  });
  const expiresAt = seed.name === "pendingOverdue" || seed.name === "expired"
    ? new Date("2026-07-17T00:00:00.000Z")
    : new Date("2099-01-01T00:00:00.000Z");
  const completedAt = seed.orderStatus === "COMPLETED" ? new Date("2026-07-17T10:00:00.000Z") : null;
  const cancelledAt = ["CANCELLED", "REJECTED", "EXPIRED"].includes(seed.orderStatus) ? new Date("2026-07-17T09:00:00.000Z") : null;
  const confirmedAt = seed.orderStatus === "CONFIRMED" || seed.orderStatus === "COMPLETED" ? new Date("2026-07-17T08:00:00.000Z") : null;
  const store = await transaction.store.findUniqueOrThrow({ where: { id: storeId } });
  await transaction.order.upsert({
    where: { id: fixture.order(seed.name) },
    create: {
      cancelledAt, completedAt, confirmedAt, currency: "IQD", customerId, customerInstructions: `Stage 3C ${seed.name} instructions`,
      customerNameSnapshot: `Stage 3C ${seed.name} Customer`, customerPhoneSnapshot: "+964750004099",
      fulfillmentMethod: seed.fulfillmentMethod, fulfillmentStatus: seed.fulfillmentStatus, grandTotal: seed.fulfillmentMethod === "STORE_DELIVERY" ? "11000" : "10000",
      id: fixture.order(seed.name), orderNumber: `REZNO-STAGE3C-${seed.name.toUpperCase()}`,
      paymentMethod: seed.fulfillmentMethod === "STORE_DELIVERY" ? "CASH_ON_DELIVERY" : "PAY_AT_PICKUP",
      paymentStatus: seed.paymentStatus, pickupAddressSnapshot: seed.fulfillmentMethod === "CUSTOMER_PICKUP" ? "Stage 3C Fixture Street" : null,
      reservationExpiresAt: expiresAt, status: seed.orderStatus, storeId, storeNameSnapshot: store.name,
      storePhoneSnapshot: store.supportPhone, storeSlugSnapshot: store.slug, subtotal: "10000",
      deliveryFee: seed.fulfillmentMethod === "STORE_DELIVERY" ? "1000" : "0",
    },
    update: {
      cancellationReason: null, cancelledAt, completedAt, confirmedAt, currency: "IQD", customerId,
      customerInstructions: `Stage 3C ${seed.name} instructions`, customerNameSnapshot: `Stage 3C ${seed.name} Customer`,
      customerPhoneSnapshot: "+964750004099", deliveryFee: seed.fulfillmentMethod === "STORE_DELIVERY" ? "1000" : "0",
      fulfillmentMethod: seed.fulfillmentMethod, fulfillmentStatus: seed.fulfillmentStatus,
      grandTotal: seed.fulfillmentMethod === "STORE_DELIVERY" ? "11000" : "10000",
      paymentMethod: seed.fulfillmentMethod === "STORE_DELIVERY" ? "CASH_ON_DELIVERY" : "PAY_AT_PICKUP",
      paymentStatus: seed.paymentStatus,
      pickupAddressSnapshot: seed.fulfillmentMethod === "CUSTOMER_PICKUP" ? "Stage 3C Fixture Street" : null,
      rejectionReason: null, reservationExpiresAt: expiresAt, status: seed.orderStatus, storeId,
      storeNameSnapshot: store.name, storePhoneSnapshot: store.supportPhone, storeSlugSnapshot: store.slug,
      subtotal: "10000",
    },
  });
  await transaction.orderItem.upsert({
    where: { id: fixture.orderItem(seed.name) },
    create: {
      currency: "IQD", id: fixture.orderItem(seed.name), imageUrlSnapshot: archived ? "javascript:stage3c-unsafe-history" : "https://cdn.example.com/stage3c.jpg",
      lineSubtotal: "10000", lineTotal: "10000", optionValuesSnapshot: {}, orderId: fixture.order(seed.name),
      productId, productNameSnapshot: `Stage 3C ${seed.name}`, productVariantId: variantId, quantity: 1,
      skuSnapshot: `STAGE3C-${index}`, unitPrice: "10000", variantTitleSnapshot: "Default",
    },
    update: {
      currency: "IQD", imageUrlSnapshot: archived ? "javascript:stage3c-unsafe-history" : "https://cdn.example.com/stage3c.jpg",
      lineSubtotal: "10000", lineTotal: "10000", optionValuesSnapshot: {}, orderId: fixture.order(seed.name),
      productId, productNameSnapshot: `Stage 3C ${seed.name}`, productVariantId: variantId, quantity: 1,
      skuSnapshot: `STAGE3C-${index}`, unitPrice: "10000", variantTitleSnapshot: "Default",
    },
  });
  await transaction.payment.upsert({
    where: { id: fixture.payment(seed.name) },
    create: {
      amount: seed.fulfillmentMethod === "STORE_DELIVERY" ? "11000" : "10000", currency: "IQD", id: fixture.payment(seed.name),
      method: seed.fulfillmentMethod === "STORE_DELIVERY" ? "CASH_ON_DELIVERY" : "PAY_AT_PICKUP",
      orderId: fixture.order(seed.name), paidAt: seed.paymentStatus === "PAID" ? completedAt : null,
      recordedByType: seed.paymentStatus === "PAID" ? "MERCHANT" : null, status: seed.paymentStatus,
      voidedAt: seed.paymentStatus === "VOIDED" ? cancelledAt : null,
    },
    update: {
      amount: seed.fulfillmentMethod === "STORE_DELIVERY" ? "11000" : "10000", currency: "IQD",
      method: seed.fulfillmentMethod === "STORE_DELIVERY" ? "CASH_ON_DELIVERY" : "PAY_AT_PICKUP",
      paidAt: seed.paymentStatus === "PAID" ? completedAt : null, recordedById: null,
      recordedByType: seed.paymentStatus === "PAID" ? "MERCHANT" : null, status: seed.paymentStatus,
      voidedAt: seed.paymentStatus === "VOIDED" ? cancelledAt : null,
    },
  });
  await transaction.inventoryReservation.upsert({
    where: { id: fixture.reservation(seed.name) },
    create: {
      consumedAt: consumed ? confirmedAt ?? new Date("2026-07-17T08:00:00.000Z") : null,
      deterministicKey: `stage3c:${seed.name}`, expiresAt, id: fixture.reservation(seed.name), inventoryItemId: inventoryId,
      orderId: fixture.order(seed.name), orderItemId: fixture.orderItem(seed.name), productVariantId: variantId,
      quantity: 1, releasedAt: seed.reservationStatus === "RELEASED" || seed.reservationStatus === "EXPIRED" ? cancelledAt : null,
      status: seed.reservationStatus,
    },
    update: {
      consumedAt: consumed ? confirmedAt ?? new Date("2026-07-17T08:00:00.000Z") : null, expiresAt, inventoryItemId: inventoryId,
      releasedAt: seed.reservationStatus === "RELEASED" || seed.reservationStatus === "EXPIRED" ? cancelledAt : null,
      status: seed.reservationStatus,
    },
  });
  if (seed.fulfillmentMethod === "STORE_DELIVERY") {
    await transaction.orderAddress.upsert({
      where: { orderId: fixture.order(seed.name) },
      create: {
        additionalDetails: "Stage 3C address", area: "Karrada", city: "Baghdad", orderId: fixture.order(seed.name),
        phone: "+964750004098", recipientName: "Stage 3C Recipient", street: "Stage 3C Delivery Street",
      },
      update: { additionalDetails: "Stage 3C address", area: "Karrada", city: "Baghdad", phone: "+964750004098", recipientName: "Stage 3C Recipient", street: "Stage 3C Delivery Street" },
    });
  } else {
    await transaction.orderAddress.deleteMany({ where: { orderId: fixture.order(seed.name) } });
  }
  await transaction.orderStatusHistory.deleteMany({ where: { orderId: fixture.order(seed.name) } });
  await transaction.stockMovement.deleteMany({ where: { orderId: fixture.order(seed.name) } });
  await transaction.businessAuditLog.deleteMany({ where: { targetId: fixture.order(seed.name), targetType: "Order" } });
  await transaction.notification.deleteMany({ where: { metadata: { path: ["orderId"], equals: fixture.order(seed.name) } } });
  await transaction.orderStatusHistory.create({ data: {
    actorType: "SYSTEM", id: fixture.history(seed.name), idempotencyKey: fixture.historyKey(seed.name),
    metadata: { fixture: COMMERCE_ORDERS_FULFILLMENT_STAGE3C_FIXTURE.namespace }, newFulfillmentStatus: seed.fulfillmentStatus,
    newOrderStatus: seed.orderStatus, newPaymentStatus: seed.paymentStatus, orderId: fixture.order(seed.name),
    reason: "STAGE3C_FIXTURE_BASELINE",
  } });
  const movementType = active ? "RESERVE" : consumed ? "CONSUME" : "RELEASE";
  await transaction.stockMovement.create({ data: {
    actorType: "SYSTEM", id: fixture.movement(seed.name), idempotencyKey: fixture.movementKey(seed.name), inventoryItemId: inventoryId,
    onHandDelta: consumed ? -1 : 0, orderId: fixture.order(seed.name), quantity: 1, reservationId: fixture.reservation(seed.name),
    reservedDelta: active ? 1 : -1, resultingOnHand: onHand, resultingReserved: active ? 1 : 0, type: movementType,
  } });
}

async function assertTarget(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  if (rows[0]?.database !== "rezno_staging") {
    throw new CommerceOrdersFulfillmentStage3cSeedInvariantError("The connected database is not the exact rezno_staging target.");
  }
}
async function organization(transaction: Prisma.TransactionClient, tuple: readonly [string, string], name: string) {
  const collision = await transaction.organization.findUnique({ where: { slug: tuple[1] }, select: { id: true } });
  if (collision && collision.id !== tuple[0]) throw new CommerceOrdersFulfillmentStage3cSeedInvariantError("A Stage 3C Organization slug belongs to another record.");
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
async function role(transaction: Prisma.TransactionClient, id: string, organizationId: string, name: string, systemRole: SystemRole, permissions: CommercePermission[]) {
  return transaction.role.upsert({
    where: { id }, create: { commercePermissions: permissions, id, isSystem: true, name, organizationId, systemRole },
    update: { commercePermissions: permissions, isSystem: true, name, organizationId, systemRole },
  });
}
async function member(transaction: Prisma.TransactionClient, id: string, organizationId: string, personId: string, roleId: string) {
  return transaction.organizationMember.upsert({
    where: { id }, create: { id, organizationId, personId, roleId, status: "ACTIVE" },
    update: { deletedAt: null, organizationId, personId, roleId, status: "ACTIVE" },
  });
}
async function store(transaction: Prisma.TransactionClient, tuple: readonly [string, string], organizationId: string, status: "ACTIVE" | "SUSPENDED") {
  return transaction.store.upsert({
    where: { id: tuple[0] },
    create: {
      deliveryArea: "Karrada", deliveryCity: "Baghdad", deliveryEnabled: true, deliveryEstimateMinutes: 30,
      deliveryFee: "1000", id: tuple[0], minimumOrderValue: "0", name: `Stage 3C ${status} Store`, organizationId,
      pickupArea: "Karrada", pickupCity: "Baghdad", pickupEnabled: true, pickupStreet: "Stage 3C Fixture Street",
      preparationEstimateMinutes: 15, publishedAt: new Date("2026-07-17T07:00:00.000Z"), slug: tuple[1], status,
      supportPhone: "+964750004100", suspendedAt: status === "SUSPENDED" ? new Date("2026-07-17T08:00:00.000Z") : null,
      suspensionReason: status === "SUSPENDED" ? "Stage 3C fixture suspension" : null,
    },
    update: {
      archivedAt: null, name: `Stage 3C ${status} Store`, organizationId, slug: tuple[1], status,
      suspendedAt: status === "SUSPENDED" ? new Date("2026-07-17T08:00:00.000Z") : null,
      suspensionReason: status === "SUSPENDED" ? "Stage 3C fixture suspension" : null,
    },
  });
}
