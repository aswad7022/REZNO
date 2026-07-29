import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Prisma } from "@prisma/client";

import { AI_GATE_B_DEFAULT_MODEL, runAiGateBCustomerDiscovery, type AiGateBProvider } from "../../../features/ai/gate-b";
import { parseProductCollectionQuery, parseStoreCollectionQuery } from "../../../features/commerce/public/query-validation";
import { listPublicProducts, listPublicStores } from "../../../features/commerce/public/catalog-service";
import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../../features/identity/policies/authorization";
import { searchMarketplace } from "../../../features/marketplace/services/marketplace";
import { prisma } from "../../../lib/db/prisma";

const namespace = "rezno-gate9a-final-integration-baseline";
const at = new Date("2026-07-29T09:00:00.000Z");
const later = new Date("2026-07-29T10:00:00.000Z");
const expires = new Date("2026-07-29T10:30:00.000Z");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const uuid = (suffix: string) => `9a000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const ids = {
  users: {
    customer: "gate9a-customer-user",
    owner: "gate9a-owner-user",
    admin: "gate9a-admin-user",
  },
  people: {
    customer: uuid("1"),
    owner: uuid("2"),
    admin: uuid("3"),
  },
  organization: uuid("10"),
  role: uuid("11"),
  member: uuid("12"),
  branch: uuid("13"),
  category: uuid("14"),
  service: uuid("15"),
  branchService: uuid("16"),
  table: uuid("17"),
  menuCategory: uuid("18"),
  menuItem: uuid("19"),
  storeCategory: uuid("20"),
  store: uuid("21"),
  product: uuid("22"),
  variant: uuid("23"),
  inventory: uuid("24"),
  cart: uuid("25"),
  cartItem: uuid("26"),
  booking: uuid("27"),
  reservation: uuid("28"),
  reservationItem: uuid("29"),
  order: uuid("30"),
  orderItem: uuid("31"),
  orderAddress: uuid("32"),
  orderHistory: uuid("33"),
  inventoryReservation: uuid("34"),
  stockMovement: uuid("35"),
  paymentIntent: uuid("36"),
  paymentAttempt: uuid("37"),
  payment: uuid("38"),
  notification: uuid("39"),
  notificationState: uuid("40"),
  conversation: uuid("41"),
  message: uuid("42"),
  conversationRead: uuid("43"),
  uploadSession: uuid("44"),
  asset: uuid("45"),
  mediaContainer: uuid("46"),
  mediaBinding: uuid("47"),
  adminAccess: uuid("48"),
  platformJob: uuid("49"),
  platformAttempt: uuid("50"),
  idempotency: {
    bookingCreate: uuid("101"),
    message: uuid("102"),
    checkout: uuid("103"),
    paymentAttempt: uuid("104"),
    stock: uuid("105"),
  },
} as const;

async function assertDisposableDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Gate 9A baseline refuses NODE_ENV=production.");
  }
  const rows = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  assert.match(
    rows[0]?.database ?? "",
    /(?:_test|test_|gate9a)/,
    "Gate 9A integration requires a disposable PostgreSQL database.",
  );
}

async function cleanupGate9AFixture(client: Prisma.TransactionClient) {
  await client.platformJobAttempt.deleteMany({ where: { jobId: ids.platformJob } });
  await client.platformJobMutation.deleteMany({ where: { jobId: ids.platformJob } });
  await client.platformJob.deleteMany({ where: { id: ids.platformJob } });

  await client.payment.deleteMany({ where: { id: ids.payment } });
  await client.paymentAttempt.deleteMany({ where: { paymentIntentId: ids.paymentIntent } });
  await client.paymentRefund.deleteMany({ where: { paymentIntentId: ids.paymentIntent } });
  await client.paymentMutation.deleteMany({ where: { paymentIntentId: ids.paymentIntent } });
  await client.paymentIntent.deleteMany({ where: { id: ids.paymentIntent } });

  await client.mediaBinding.deleteMany({ where: { id: ids.mediaBinding } });
  await client.mediaContainer.deleteMany({ where: { id: ids.mediaContainer } });
  await client.storedAsset.deleteMany({ where: { id: ids.asset } });
  await client.uploadSession.deleteMany({ where: { id: ids.uploadSession } });

  await client.conversationReadState.deleteMany({ where: { conversationId: ids.conversation } });
  await client.message.deleteMany({ where: { id: ids.message } });
  await client.conversation.deleteMany({ where: { id: ids.conversation } });
  await client.notificationRecipientState.deleteMany({ where: { notificationId: ids.notification } });
  await client.notificationInteraction.deleteMany({ where: { notificationId: ids.notification } });
  await client.notification.deleteMany({ where: { id: ids.notification } });

  await client.restaurantReservationItem.deleteMany({ where: { id: ids.reservationItem } });
  await client.restaurantReservationMutation.deleteMany({ where: { bookingId: ids.booking } });
  await client.restaurantReservationDetails.deleteMany({ where: { id: ids.reservation } });

  await client.stockMovement.deleteMany({ where: { id: ids.stockMovement } });
  await client.inventoryReservation.deleteMany({ where: { id: ids.inventoryReservation } });
  await client.orderStatusHistory.deleteMany({ where: { orderId: ids.order } });
  await client.orderAddress.deleteMany({ where: { orderId: ids.order } });
  await client.orderItem.deleteMany({ where: { orderId: ids.order } });
  await client.checkoutIdempotency.deleteMany({ where: { customerId: ids.people.customer } });
  await client.order.deleteMany({ where: { id: ids.order } });
  await client.cartItem.deleteMany({ where: { cartId: ids.cart } });
  await client.cart.deleteMany({ where: { id: ids.cart } });
  await client.inventoryItem.deleteMany({ where: { id: ids.inventory } });
  await client.productMedia.deleteMany({ where: { productId: ids.product } });
  await client.productVariant.deleteMany({ where: { id: ids.variant } });
  await client.product.deleteMany({ where: { id: ids.product } });
  await client.marketplaceCategory.deleteMany({ where: { id: ids.storeCategory } });
  await client.store.deleteMany({ where: { id: ids.store } });

  await client.menuItem.deleteMany({ where: { id: ids.menuItem } });
  await client.menuCategory.deleteMany({ where: { id: ids.menuCategory } });
  await client.restaurantTable.deleteMany({ where: { id: ids.table } });

  await client.bookingStatusHistory.deleteMany({ where: { bookingId: ids.booking } });
  await client.bookingChangeRequest.deleteMany({ where: { bookingId: ids.booking } });
  await client.booking.deleteMany({ where: { id: ids.booking } });

  await client.serviceStaffAssignment.deleteMany({ where: { serviceId: ids.service } });
  await client.branchService.deleteMany({ where: { id: ids.branchService } });
  await client.availability.deleteMany({ where: { memberId: ids.member } });
  await client.branchAssignment.deleteMany({ where: { memberId: ids.member } });
  await client.businessHour.deleteMany({ where: { branchId: ids.branch } });
  await client.branch.deleteMany({ where: { id: ids.branch } });
  await client.service.deleteMany({ where: { id: ids.service } });
  await client.category.deleteMany({ where: { id: ids.category } });

  await client.adminAccess.deleteMany({ where: { userId: { in: Object.values(ids.users) } } });
  await client.organizationMember.deleteMany({ where: { id: ids.member } });
  await client.role.deleteMany({ where: { id: ids.role } });
  await client.organizationSettings.deleteMany({ where: { organizationId: ids.organization } });
  await client.businessProfile.deleteMany({ where: { organizationId: ids.organization } });
  await client.organization.deleteMany({ where: { id: ids.organization } });
  await client.person.deleteMany({ where: { id: { in: Object.values(ids.people) } } });
  await client.user.deleteMany({ where: { id: { in: Object.values(ids.users) } } });
}

async function seedGate9AFixture() {
  return prisma.$transaction(async (client) => {
    await cleanupGate9AFixture(client);
    await client.user.createMany({
      data: [
        { id: ids.users.customer, email: "gate9a-customer@rezno.invalid", name: "Gate 9A Customer", emailVerified: true },
        { id: ids.users.owner, email: "gate9a-owner@rezno.invalid", name: "Gate 9A Owner", emailVerified: true },
        { id: ids.users.admin, email: "gate9a-admin@rezno.invalid", name: "Gate 9A Admin", emailVerified: true },
      ],
    });
    await client.person.createMany({
      data: [
        { id: ids.people.customer, authUserId: ids.users.customer, firstName: "Gate 9A Customer", isOnboarded: true, status: "ACTIVE", preferredLanguage: "AR" },
        { id: ids.people.owner, authUserId: ids.users.owner, firstName: "Gate 9A Owner", isOnboarded: true, status: "ACTIVE", preferredLanguage: "EN" },
        { id: ids.people.admin, authUserId: ids.users.admin, firstName: "Gate 9A Admin", isOnboarded: true, status: "ACTIVE", preferredLanguage: "KU" },
      ],
    });
    await client.organization.create({
      data: {
        id: ids.organization,
        businessType: "PHYSICAL",
        isActive: true,
        isVerified: true,
        name: "Gate 9A Integrated Restaurant",
        slug: "gate9a-integrated-restaurant",
        status: "ACTIVE",
        vertical: "RESTAURANT",
      },
    });
    await client.businessProfile.create({
      data: {
        description: "Synthetic deterministic restaurant profile for Gate 9A baseline evidence.",
        organizationId: ids.organization,
      },
    });
    await client.organizationSettings.create({
      data: {
        allowOnlinePayments: false,
        bookingEnabled: true,
        marketplaceVisible: true,
        organizationId: ids.organization,
      },
    });
    await client.role.create({
      data: {
        commercePermissions: [...OWNER_DEFAULT_COMMERCE_PERMISSIONS],
        id: ids.role,
        isSystem: true,
        name: "Gate9A Owner",
        organizationId: ids.organization,
        systemRole: "OWNER",
      },
    });
    await client.organizationMember.create({
      data: {
        id: ids.member,
        organizationId: ids.organization,
        personId: ids.people.owner,
        publicSlug: "gate9a-owner",
        roleId: ids.role,
        status: "ACTIVE",
      },
    });
    await client.adminAccess.create({
      data: {
        id: ids.adminAccess,
        permissions: ["ADMIN_READ", "PLATFORM_OPERATIONS_VIEW"],
        role: "ADMIN",
        status: "ACTIVE",
        userId: ids.users.admin,
      },
    });
    await client.category.create({
      data: { id: ids.category, name: "Gate 9A Dining", slug: "gate9a-dining" },
    });
    await client.branch.create({
      data: {
        id: ids.branch,
        addressLine1: "Gate 9A synthetic street",
        city: "Erbil",
        country: "IQ",
        name: "Gate 9A Main Branch",
        organizationId: ids.organization,
        slug: "main",
        status: "ACTIVE",
      },
    });
    await client.businessHour.createMany({
      data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        branchId: ids.branch,
        closeTime: "18:00",
        dayOfWeek,
        isOpen: true,
        openTime: "09:00",
      })),
    });
    await client.service.create({
      data: {
        categoryId: ids.category,
        description: "Deterministic fixture service.",
        id: ids.service,
        name: "Gate 9A Breakfast",
        organizationId: ids.organization,
        status: "ACTIVE",
      },
    });
    await client.branchService.create({
      data: {
        branchId: ids.branch,
        durationMinutes: 60,
        id: ids.branchService,
        isAvailable: true,
        price: new Prisma.Decimal("12.00"),
        serviceId: ids.service,
      },
    });
    await client.branchAssignment.create({
      data: { branchId: ids.branch, memberId: ids.member },
    });
    await client.availability.create({
      data: {
        branchId: ids.branch,
        dayOfWeek: 3,
        endTime: "18:00",
        memberId: ids.member,
        startTime: "09:00",
      },
    });
    await client.restaurantTable.create({
      data: {
        area: "Gate 9A fixture area",
        branchId: ids.branch,
        businessId: ids.organization,
        capacity: 4,
        id: ids.table,
        name: "Gate 9A Table",
      },
    });
    await client.menuCategory.create({
      data: {
        businessId: ids.organization,
        id: ids.menuCategory,
        name: "Gate 9A Menu",
      },
    });
    await client.menuItem.create({
      data: {
        businessId: ids.organization,
        id: ids.menuItem,
        isAvailable: true,
        menuCategoryId: ids.menuCategory,
        name: "Gate 9A Plate",
        price: new Prisma.Decimal("12.00"),
      },
    });
    await client.marketplaceCategory.create({
      data: {
        displayOrder: 9,
        id: ids.storeCategory,
        name: "Gate 9A Commerce",
        normalizedName: "gate 9a commerce",
        slug: "gate9a-commerce",
        status: "ACTIVE",
      },
    });
    await client.store.create({
      data: {
        currency: "IQD",
        deliveryArea: "Gate 9A Area",
        deliveryCity: "Erbil",
        deliveryEnabled: true,
        deliveryFee: new Prisma.Decimal("0.000"),
        id: ids.store,
        minimumOrderValue: new Prisma.Decimal("0.000"),
        name: "Gate 9A Store",
        organizationId: ids.organization,
        pickupArea: "Gate 9A Area",
        pickupCity: "Erbil",
        pickupEnabled: true,
        pickupStreet: "Gate 9A pickup street",
        preparationEstimateMinutes: 15,
        publishedAt: at,
        slug: "gate9a-store",
        status: "ACTIVE",
      },
    });
    await client.product.create({
      data: {
        categoryId: ids.storeCategory,
        id: ids.product,
        name: "Gate 9A Product",
        normalizedSearchText: "gate 9a product deterministic baseline",
        publishedAt: at,
        slug: "gate9a-product",
        status: "PUBLISHED",
        storeId: ids.store,
      },
    });
    await client.productVariant.create({
      data: {
        currency: "IQD",
        id: ids.variant,
        isDefault: true,
        optionKey: "default",
        optionValues: {},
        price: new Prisma.Decimal("12.000"),
        productId: ids.product,
        sku: "GATE9A-SKU",
        status: "ACTIVE",
        storeId: ids.store,
        title: "Default",
      },
    });
    await client.inventoryItem.create({
      data: { id: ids.inventory, onHand: 9, reserved: 1, variantId: ids.variant },
    });
    await client.cart.create({
      data: {
        customerId: ids.people.customer,
        expiresAt: expires,
        id: ids.cart,
        status: "ACTIVE",
        storeId: ids.store,
      },
    });
    await client.cartItem.create({
      data: {
        cartId: ids.cart,
        id: ids.cartItem,
        productVariantId: ids.variant,
        quantity: 1,
        unitPriceSnapshot: new Prisma.Decimal("12.000"),
      },
    });
    await client.booking.create({
      data: {
        branchId: ids.branch,
        branchServiceId: ids.branchService,
        creationIdempotencyKey: ids.idempotency.bookingCreate,
        creationRequestHash: hash("gate9a-booking-create"),
        customerId: ids.people.customer,
        customerNameSnapshot: "Gate 9A Customer",
        endsAt: later,
        id: ids.booking,
        memberId: ids.member,
        notes: "Gate 9A synthetic booking only.",
        organizationId: ids.organization,
        paymentMethod: "ONLINE_PROVIDER",
        priceSnapshot: new Prisma.Decimal("12.00"),
        serviceNameSnapshot: "Gate 9A Breakfast",
        startsAt: at,
        status: "CONFIRMED",
      },
    });
    await client.bookingStatusHistory.create({
      data: {
        bookingId: ids.booking,
        changedByPersonId: ids.people.customer,
        id: ids.orderHistory,
        toStatus: "CONFIRMED",
      },
    });
    await client.restaurantReservationDetails.create({
      data: {
        bookingId: ids.booking,
        branchId: ids.branch,
        businessId: ids.organization,
        guestCount: 3,
        id: ids.reservation,
        reservationDateTime: at,
        tableId: ids.table,
      },
    });
    await client.restaurantReservationItem.create({
      data: {
        currencySnapshot: "IQD",
        id: ids.reservationItem,
        itemNameSnapshot: "Gate 9A Plate",
        menuItemId: ids.menuItem,
        quantity: 1,
        restaurantReservationDetailsId: ids.reservation,
        unitPrice: new Prisma.Decimal("12.00"),
      },
    });
    await client.order.create({
      data: {
        currency: "IQD",
        customerId: ids.people.customer,
        customerNameSnapshot: "Gate 9A Customer",
        customerPhoneSnapshot: "REZNO-GATE9A-NOT-A-PHONE",
        fulfillmentMethod: "CUSTOMER_PICKUP",
        grandTotal: new Prisma.Decimal("12.000"),
        id: ids.order,
        orderNumber: "GATE9A-ORDER-0001",
        paymentMethod: "PAY_AT_PICKUP",
        paymentStatus: "PAID",
        pickupAddressSnapshot: "Gate 9A pickup street",
        preparationEstimateMinutes: 15,
        reservationExpiresAt: expires,
        status: "CONFIRMED",
        storeId: ids.store,
        storeNameSnapshot: "Gate 9A Store",
        storeSlugSnapshot: "gate9a-store",
        subtotal: new Prisma.Decimal("12.000"),
      },
    });
    await client.orderItem.create({
      data: {
        currency: "IQD",
        id: ids.orderItem,
        lineSubtotal: new Prisma.Decimal("12.000"),
        lineTotal: new Prisma.Decimal("12.000"),
        optionValuesSnapshot: {},
        orderId: ids.order,
        productId: ids.product,
        productNameSnapshot: "Gate 9A Product",
        productVariantId: ids.variant,
        quantity: 1,
        skuSnapshot: "GATE9A-SKU",
        unitPrice: new Prisma.Decimal("12.000"),
        variantTitleSnapshot: "Default",
      },
    });
    await client.orderAddress.create({
      data: {
        additionalDetails: "Synthetic fixture",
        area: "Gate 9A Area",
        city: "Erbil",
        id: ids.orderAddress,
        orderId: ids.order,
        phone: "REZNO-GATE9A-NOT-A-PHONE",
        recipientName: "Gate 9A Customer",
        street: "Gate 9A delivery street",
      },
    });
    await client.checkoutIdempotency.create({
      data: {
        customerId: ids.people.customer,
        expiresAt: expires,
        key: ids.idempotency.checkout,
        orderId: ids.order,
        requestHash: hash("gate9a-checkout"),
        responseData: { orderId: ids.order },
        status: "COMPLETED",
      },
    });
    await client.inventoryReservation.create({
      data: {
        deterministicKey: "gate9a-inventory-reservation",
        expiresAt: expires,
        id: ids.inventoryReservation,
        inventoryItemId: ids.inventory,
        orderId: ids.order,
        orderItemId: ids.orderItem,
        productVariantId: ids.variant,
        quantity: 1,
        status: "CONSUMED",
        consumedAt: at,
      },
    });
    await client.stockMovement.create({
      data: {
        actorId: ids.people.customer,
        actorType: "CUSTOMER",
        id: ids.stockMovement,
        idempotencyKey: ids.idempotency.stock,
        inventoryItemId: ids.inventory,
        onHandDelta: -1,
        orderId: ids.order,
        quantity: 1,
        reason: "Gate 9A deterministic consumption.",
        reservationId: ids.inventoryReservation,
        reservedDelta: -1,
        resultingOnHand: 8,
        resultingReserved: 0,
        type: "CONSUME",
      },
    });
    await client.paymentIntent.create({
      data: {
        amount: new Prisma.Decimal("12.000"),
        authorizedAt: at,
        capturedAmount: new Prisma.Decimal("12.000"),
        capturedAt: at,
        commissionAmount: new Prisma.Decimal("0.000"),
        currency: "IQD",
        customerPersonId: ids.people.customer,
        id: ids.paymentIntent,
        merchantNetAmount: new Prisma.Decimal("12.000"),
        method: "ONLINE_PROVIDER",
        orderId: ids.order,
        organizationId: ids.organization,
        provider: "DETERMINISTIC_TEST",
        providerReference: "gate9a-payment-intent",
        status: "CAPTURED",
        storeId: ids.store,
      },
    });
    await client.paymentAttempt.create({
      data: {
        attemptNumber: 1,
        finishedAt: at,
        id: ids.paymentAttempt,
        idempotencyKey: ids.idempotency.paymentAttempt,
        paymentIntentId: ids.paymentIntent,
        provider: "DETERMINISTIC_TEST",
        providerPaymentReference: "gate9a-payment-captured",
        providerRequestReference: "gate9a-payment-request",
        startedAt: at,
        status: "CAPTURED",
      },
    });
    await client.payment.create({
      data: {
        amount: new Prisma.Decimal("12.000"),
        currency: "IQD",
        id: ids.payment,
        method: "ONLINE_PROVIDER",
        orderId: ids.order,
        paidAt: at,
        paymentIntentId: ids.paymentIntent,
        status: "PAID",
      },
    });
    await client.notification.create({
      data: {
        audience: "USER",
        body: "Gate 9A synthetic booking notification.",
        category: "BOOKINGS",
        destinationKind: "CUSTOMER_BOOKING",
        destinationTargetId: ids.booking,
        eventKey: "gate9a-booking-confirmed",
        eventType: "gate9a.booking.confirmed",
        id: ids.notification,
        localizedContent: {
          ar: { title: "حجز Gate 9A", body: "إشعار اختباري آمن" },
          ckb: { title: "Gate 9A", body: "تاقیکردنەوەی ئارام" },
          en: { title: "Gate 9A booking", body: "Safe fixture notification" },
        },
        priority: "NORMAL",
        recipientPersonId: ids.people.customer,
        sourceId: ids.booking,
        sourceType: "BOOKING",
        title: "Gate 9A booking",
      },
    });
    await client.notificationRecipientState.create({
      data: {
        id: ids.notificationState,
        notificationId: ids.notification,
        personId: ids.people.customer,
        readState: "UNREAD",
      },
    });
    await client.conversation.create({
      data: {
        bookingId: ids.booking,
        businessId: ids.organization,
        customerId: ids.people.customer,
        id: ids.conversation,
        identityKey: "gate9a-business-customer-booking",
        subject: "Gate 9A booking thread",
        type: "CUSTOMER_BUSINESS",
      },
    });
    await client.message.create({
      data: {
        body: "Gate 9A synthetic message.",
        conversationId: ids.conversation,
        id: ids.message,
        idempotencyKey: ids.idempotency.message,
        requestHash: hash("gate9a-message"),
        senderUserId: ids.users.customer,
        sourceAction: "GATE9A",
      },
    });
    await client.conversationReadState.create({
      data: {
        conversationId: ids.conversation,
        id: ids.conversationRead,
        lastReadMessageCreatedAt: at,
        lastReadMessageId: ids.message,
        personId: ids.people.customer,
        scopeKey: `person:${ids.people.customer}`,
      },
    });
    await client.uploadSession.create({
      data: {
        actorPersonId: ids.people.owner,
        actorMembershipId: ids.member,
        actorRoleId: ids.role,
        expectedChecksumSha256: hash("gate9a-media-bytes"),
        expectedMimeType: "image/png",
        expectedSizeBytes: BigInt(512),
        expiresAt: expires,
        finalizedAt: at,
        id: ids.uploadSession,
        objectKey: `test/product-image/${uuid("500")}/${uuid("501")}`,
        organizationId: ids.organization,
        provider: "DETERMINISTIC_TEST",
        purpose: "PRODUCT_IMAGE",
        state: "FINALIZED",
        uploadedAt: at,
        visibility: "PUBLIC",
      },
    });
    await client.storedAsset.create({
      data: {
        checksumSha256: hash("gate9a-media-bytes"),
        createdByPersonId: ids.people.owner,
        id: ids.asset,
        inspectionOutcome: "VALID",
        mimeType: "image/png",
        objectKey: `test/product-image/${uuid("502")}/${uuid("503")}`,
        organizationId: ids.organization,
        provider: "DETERMINISTIC_TEST",
        readyAt: at,
        scannerOutcome: "CLEAN",
        sizeBytes: BigInt(512),
        state: "READY",
        uploadSessionId: ids.uploadSession,
        visibility: "PUBLIC",
        purpose: "PRODUCT_IMAGE",
      },
    });
    await client.mediaContainer.create({
      data: {
        id: ids.mediaContainer,
        kind: "PRODUCT",
        organizationId: ids.organization,
        productId: ids.product,
      },
    });
    await client.mediaBinding.create({
      data: {
        assetId: ids.asset,
        containerId: ids.mediaContainer,
        createdByPersonId: ids.people.owner,
        id: ids.mediaBinding,
        productVariantId: ids.variant,
        slot: "PRODUCT_IMAGE",
        sortOrder: 1,
        state: "ACTIVE",
      },
    });
    await client.platformJob.create({
      data: {
        availableAt: at,
        createdByAdminUserId: ids.users.admin,
        createdByPersonId: ids.people.admin,
        deduplicationKey: "gate9a-platform-job",
        id: ids.platformJob,
        jobType: "PLATFORM_HEALTH_PROBE",
        maxAttempts: 1,
        payload: { namespace },
        payloadHash: hash("gate9a-platform-job"),
        payloadVersion: 1,
        scopeKey: "platform",
        source: "ADMIN_MANUAL",
        status: "AVAILABLE",
      },
    });
    return {
      bookingId: ids.booking,
      namespace,
      orderId: ids.order,
      organizationId: ids.organization,
      paymentIntentId: ids.paymentIntent,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 });
}

async function fixtureCounts() {
  const [
    users,
    people,
    organizations,
    bookings,
    orders,
    paymentIntents,
    notifications,
    conversations,
    assets,
    mediaBindings,
    jobs,
  ] = await Promise.all([
    prisma.user.count({ where: { id: { in: Object.values(ids.users) } } }),
    prisma.person.count({ where: { id: { in: Object.values(ids.people) } } }),
    prisma.organization.count({ where: { id: ids.organization } }),
    prisma.booking.count({ where: { id: ids.booking } }),
    prisma.order.count({ where: { id: ids.order } }),
    prisma.paymentIntent.count({ where: { id: ids.paymentIntent } }),
    prisma.notification.count({ where: { id: ids.notification } }),
    prisma.conversation.count({ where: { id: ids.conversation } }),
    prisma.storedAsset.count({ where: { id: ids.asset } }),
    prisma.mediaBinding.count({ where: { id: ids.mediaBinding } }),
    prisma.platformJob.count({ where: { id: ids.platformJob } }),
  ]);
  return {
    assets,
    bookings,
    conversations,
    jobs,
    mediaBindings,
    notifications,
    orders,
    organizations,
    paymentIntents,
    people,
    users,
  };
}

test("Gate 9A final integration baseline composes closed product domains without external runtime activation", { concurrency: false }, async (t) => {
  await assertDisposableDatabase();
  await prisma.$transaction(cleanupGate9AFixture);
  t.after(async () => {
    await prisma.$transaction(cleanupGate9AFixture);
    await prisma.$disconnect();
  });

  const seeded = await seedGate9AFixture();
  assert.deepEqual(seeded, {
    bookingId: ids.booking,
    namespace,
    orderId: ids.order,
    organizationId: ids.organization,
    paymentIntentId: ids.paymentIntent,
  });

  await t.test("identity, business membership, publication, and marketplace visibility line up", async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: ids.organization },
      include: {
        branches: { include: { businessHours: true } },
        organizationMembers: { include: { role: true } },
        settings: true,
      },
    });
    assert.equal(organization.settings?.bookingEnabled, true);
    assert.equal(organization.settings?.marketplaceVisible, true);
    assert.equal(organization.organizationMembers[0]?.role.systemRole, "OWNER");
    assert.deepEqual(
      new Set(organization.organizationMembers[0]?.role.commercePermissions),
      new Set(OWNER_DEFAULT_COMMERCE_PERMISSIONS),
    );
    assert.equal(organization.branches[0]?.businessHours.length, 5);

    const marketplace = await searchMarketplace({ query: "Gate 9A breakfast", take: 5 });
    assert.equal(marketplace.some((business) => business.slug === "gate9a-integrated-restaurant"), true);
  });

  await t.test("booking and restaurant reservation share the same authorized customer, branch, and business", async () => {
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: ids.booking },
      include: { restaurantReservation: { include: { items: true, table: true } } },
    });
    assert.equal(booking.customerId, ids.people.customer);
    assert.equal(booking.organizationId, ids.organization);
    assert.equal(booking.branchId, ids.branch);
    assert.equal(booking.status, "CONFIRMED");
    assert.equal(booking.restaurantReservation?.businessId, ids.organization);
    assert.equal(booking.restaurantReservation?.items[0]?.menuItemId, ids.menuItem);
    assert.equal(booking.restaurantReservation?.table.capacity, 4);
  });

  await t.test("commerce catalog, cart, order, inventory, and deterministic payment lifecycle are visible and internally consistent", async () => {
    const stores = await listPublicStores(parseStoreCollectionQuery(new URLSearchParams("q=Gate%209A&limit=5")));
    assert.equal(stores.data.some((store) => store.slug === "gate9a-store"), true);

    const products = await listPublicProducts(parseProductCollectionQuery(new URLSearchParams("q=Gate%209A&limit=5")));
    assert.equal(products.data.some((product) => product.slug === "gate9a-product"), true);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: ids.order },
      include: {
        items: true,
        payment: true,
        paymentIntents: { include: { attempts: true } },
        reservations: true,
      },
    });
    assert.equal(order.items.length, 1);
    assert.equal(order.reservations[0]?.status, "CONSUMED");
    assert.equal(order.paymentStatus, "PAID");
    assert.equal(order.payment?.paymentIntentId, ids.paymentIntent);
    assert.equal(order.paymentIntents[0]?.provider, "DETERMINISTIC_TEST");
    assert.equal(order.paymentIntents[0]?.status, "CAPTURED");
    assert.equal(order.paymentIntents[0]?.attempts[0]?.status, "CAPTURED");
  });

  await t.test("notifications, messages, media, admin oversight, and platform jobs stay scoped to the fixture", async () => {
    const notification = await prisma.notification.findUniqueOrThrow({
      where: { id: ids.notification },
      include: { recipientStates: true },
    });
    assert.equal(notification.recipientPersonId, ids.people.customer);
    assert.equal(notification.destinationTargetId, ids.booking);
    assert.equal(notification.recipientStates[0]?.readState, "UNREAD");

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: ids.conversation },
      include: { messages: true, readStates: true },
    });
    assert.equal(conversation.bookingId, ids.booking);
    assert.equal(conversation.messages[0]?.senderUserId, ids.users.customer);
    assert.equal(conversation.readStates[0]?.lastReadMessageId, ids.message);

    const binding = await prisma.mediaBinding.findUniqueOrThrow({
      where: { id: ids.mediaBinding },
      include: { asset: true, container: true },
    });
    assert.equal(binding.asset.state, "READY");
    assert.equal(binding.asset.provider, "DETERMINISTIC_TEST");
    assert.equal(binding.container.productId, ids.product);

    const admin = await prisma.adminAccess.findUniqueOrThrow({ where: { userId: ids.users.admin } });
    assert.deepEqual(admin.permissions, ["ADMIN_READ", "PLATFORM_OPERATIONS_VIEW"]);

    const job = await prisma.platformJob.findUniqueOrThrow({ where: { id: ids.platformJob } });
    assert.equal(job.status, "AVAILABLE");
    assert.equal(job.leaseOwner, null);
    assert.equal(job.source, "ADMIN_MANUAL");
    assert.equal(process.env.REZNO_PLATFORM_RUNTIME_ENABLED === "true", false);
  });

  await t.test("AI remains disabled for production/staging activation and refuses before marketplace or provider work", async () => {
    let providerCalls = 0;
    let marketplaceCalls = 0;
    const provider: AiGateBProvider = {
      id: "test-double",
      async complete() {
        providerCalls += 1;
        return {
          status: "ANSWER",
          answer: "Should not be used.",
          items: [],
        };
      },
    };
    const response = await runAiGateBCustomerDiscovery({
      env: {
        GEMINI_API_KEY: undefined,
        GEMINI_MODEL: AI_GATE_B_DEFAULT_MODEL,
        REZNO_AI_ENABLED: "false",
        REZNO_AI_GATE_B_LOCAL_ONLY: "true",
        REZNO_AI_GEMINI_ENABLED: "false",
        REZNO_AI_KILL_SWITCH: "true",
      },
      locale: "en",
      marketplaceSearch: async () => {
        marketplaceCalls += 1;
        return [];
      },
      provider,
      question: "Find a public restaurant in Erbil",
    });
    assert.equal(response.ok, false);
    assert.equal(response.status, "UNAVAILABLE");
    assert.equal(response.metadata.providerRequestCount, 0);
    assert.equal(response.metadata.marketplaceResultCount, 0);
    assert.equal(providerCalls, 0);
    assert.equal(marketplaceCalls, 0);
  });

  await t.test("cleanup is precise, rerunnable, and leaves no Gate 9A fixture rows", async () => {
    assert.deepEqual(await fixtureCounts(), {
      assets: 1,
      bookings: 1,
      conversations: 1,
      jobs: 1,
      mediaBindings: 1,
      notifications: 1,
      orders: 1,
      organizations: 1,
      paymentIntents: 1,
      people: 3,
      users: 3,
    });
    await prisma.$transaction(cleanupGate9AFixture);
    assert.deepEqual(await fixtureCounts(), {
      assets: 0,
      bookings: 0,
      conversations: 0,
      jobs: 0,
      mediaBindings: 0,
      notifications: 0,
      orders: 0,
      organizations: 0,
      paymentIntents: 0,
      people: 0,
      users: 0,
    });
    await prisma.$transaction(cleanupGate9AFixture);
    assert.deepEqual(await fixtureCounts(), {
      assets: 0,
      bookings: 0,
      conversations: 0,
      jobs: 0,
      mediaBindings: 0,
      notifications: 0,
      orders: 0,
      organizations: 0,
      paymentIntents: 0,
      people: 0,
      users: 0,
    });
  });
});
