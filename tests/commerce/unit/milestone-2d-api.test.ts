import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

import {
  canCustomerCancel,
  serializeCustomerOrderDetail,
  serializeCustomerOrderSummary,
} from "../../../features/commerce/api/dto";
import { mapCommerceApiError } from "../../../features/commerce/api/errors";
import {
  parseCancellationRequest,
  parseCustomerOrderQuery,
  parseFavoriteQuery,
  parseFavoriteTarget,
} from "../../../features/commerce/api/validation";
import {
  commerceNotificationCopy,
  commerceNotificationTranslations,
  notificationLanguageCodeFromUiLocale,
  notificationLocaleFromLanguageCode,
} from "../../../features/commerce/domain/notification-events";
import { commerceError } from "../../../features/commerce/domain/errors";
import { decodePublicCursor, encodePublicCursor } from "../../../features/commerce/public/cursor";
import { favoriteFingerprint } from "../../../features/commerce/services/customer-favorite-service";
import {
  customerOrderFingerprint,
  type CustomerOrderRecord,
} from "../../../features/commerce/services/customer-order-query-service";
import { commerceNotificationEventKey } from "../../../features/commerce/services/commerce-notification-service";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/commerce/test", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

test("Order list validation binds every filter and rejects malformed input", () => {
  const query = parseCustomerOrderQuery(new URLSearchParams(
    "limit=20&status=CONFIRMED&fulfillmentStatus=PREPARING&paymentStatus=UNPAID&fulfillmentMethod=CUSTOMER_PICKUP&sort=oldest&storeSlug=store",
  ));
  assert.equal(query.sort, "oldest");
  assert.equal(query.status, "CONFIRMED");
  assert.throws(() => parseCustomerOrderQuery(new URLSearchParams("limit=51")));
  assert.throws(() => parseCustomerOrderQuery(new URLSearchParams("status=UNKNOWN")));
  assert.throws(() => parseCustomerOrderQuery(new URLSearchParams("limit=1&limit=2")));
  assert.notEqual(
    customerOrderFingerprint("customer-a", query),
    customerOrderFingerprint("customer-b", query),
  );
});

test("Order cursors round-trip and reject customer or filter reuse", () => {
  const query = parseCustomerOrderQuery(new URLSearchParams("status=PENDING"));
  const fingerprint = customerOrderFingerprint("customer-a", query);
  const cursor = encodePublicCursor({
    fingerprint,
    id: "11111111-1111-4111-8111-111111111111",
    sort: "orders_newest",
    sortValue: "2026-07-12T12:00:00.000Z",
  });
  assert.equal(decodePublicCursor(cursor, { fingerprint, sort: "orders_newest" }).id,
    "11111111-1111-4111-8111-111111111111");
  assert.throws(() => decodePublicCursor(cursor, {
    fingerprint: customerOrderFingerprint("customer-b", query),
    sort: "orders_newest",
  }));
});

test("Order DTOs use immutable snapshots, Decimal strings, and no internal identifiers", () => {
  const order = orderFixture();
  const summary = serializeCustomerOrderSummary(order);
  const detail = serializeCustomerOrderDetail(order);
  assert.equal(summary.grandTotal, "11000.000");
  assert.equal(summary.store.name, "Snapshot Store");
  assert.equal(summary.store.logoUrl, null);
  assert.equal(detail.items[0]?.unitPrice, "10000.000");
  assert.equal(detail.history[0]?.reason, null);
  const json = JSON.stringify(detail);
  for (const secret of ["customer-private", "organizationId", "reservation", "movement", "actor-private"]) {
    assert.equal(json.includes(secret), false);
  }
});

test("Customer cancellation eligibility and reason validation are strict", async () => {
  const expectedVersion = "2026-07-17T12:00:00.000Z";
  assert.equal(canCustomerCancel({ fulfillmentStatus: "UNFULFILLED", paymentStatus: "UNPAID", status: "PENDING" }), true);
  assert.equal(canCustomerCancel({ fulfillmentStatus: "PREPARING", paymentStatus: "UNPAID", status: "CONFIRMED" }), false);
  assert.equal(canCustomerCancel({ fulfillmentStatus: "UNFULFILLED", paymentStatus: "PAID", status: "CONFIRMED" }), false);
  assert.deepEqual(await parseCancellationRequest(jsonRequest({ expectedVersion, reason: "  changed   plans " })), {
    expectedVersion,
    reason: "changed plans",
  });
  await assert.rejects(() => parseCancellationRequest(jsonRequest({ reason: " " })), (error: unknown) =>
    mapCommerceApiError(error).code === "CANCELLATION_REASON_REQUIRED");
});

test("Favorite requests and cursors are collection- and customer-isolated", async () => {
  assert.equal(parseFavoriteQuery(new URLSearchParams()).limit, 20);
  assert.equal(await parseFavoriteTarget(jsonRequest({ storeId: "22222222-2222-4222-8222-222222222222" }), "storeId"),
    "22222222-2222-4222-8222-222222222222");
  await assert.rejects(() => parseFavoriteTarget(jsonRequest({ storeId: "bad" }), "storeId"));
  const storeFingerprint = favoriteFingerprint("customer-a", "stores");
  const cursor = encodePublicCursor({
    fingerprint: storeFingerprint,
    id: "33333333-3333-4333-8333-333333333333",
    sort: "favorited_newest",
    sortValue: "2026-07-12T12:00:00.000Z",
  });
  assert.throws(() => decodePublicCursor(cursor, {
    fingerprint: favoriteFingerprint("customer-a", "products"),
    sort: "favorited_newest",
  }));
  assert.throws(() => decodePublicCursor(cursor, {
    fingerprint: favoriteFingerprint("customer-b", "stores"),
    sort: "favorited_newest",
  }));
});

test("Commerce notifications have safe exact-once keys and AR/EN/KU copy", () => {
  const key = commerceNotificationEventKey(
    "11111111-1111-4111-8111-111111111111",
    "order.created",
    "22222222-2222-4222-8222-222222222222",
  );
  assert.equal(key, "commerce:11111111-1111-4111-8111-111111111111:order.created:22222222-2222-4222-8222-222222222222");
  const translations = commerceNotificationTranslations("order.created");
  assert.ok(translations.AR.title);
  assert.ok(translations.EN.title);
  assert.ok(translations.KU.title);
  const copy = commerceNotificationCopy("order.created", "AR", "RZ-1", "Store");
  assert.equal(copy.title, translations.AR.title);
  assert.equal(copy.titleKey, "commerce.order.created.title");
  assert.equal(
    commerceNotificationCopy(
      "order.created",
      notificationLanguageCodeFromUiLocale("ckb"),
      "RZ-1",
      "Store",
    ).title,
    translations.KU.title,
  );
  assert.equal(notificationLanguageCodeFromUiLocale("ar"), "AR");
  assert.equal(notificationLanguageCodeFromUiLocale("en"), "EN");
  assert.equal(notificationLanguageCodeFromUiLocale("ckb"), "KU");
  assert.equal(notificationLocaleFromLanguageCode("TR"), "EN");
  assert.equal(notificationLocaleFromLanguageCode(null), "EN");
  assert.equal(commerceNotificationCopy("order.created", "EN", "RZ-1", "Store").title, translations.EN.title);
  assert.equal(commerceNotificationCopy("order.created", null, "RZ-1", "Store").title, translations.EN.title);
});

test("Milestone 2D domain errors map to stable safe HTTP responses", () => {
  let favorite: unknown;
  try { commerceError("FAVORITE_NOT_FOUND", "missing"); } catch (error) { favorite = error; }
  assert.equal(mapCommerceApiError(favorite).status, 404);
  let cancellation: unknown;
  try { commerceError("ORDER_NOT_CANCELLABLE", "not allowed"); } catch (error) { cancellation = error; }
  assert.equal(mapCommerceApiError(cancellation).status, 409);
});

function orderFixture() {
  const now = new Date("2026-07-12T12:00:00.000Z");
  return {
    address: null,
    cancellationReason: null,
    cancelledAt: null,
    completedAt: null,
    confirmedAt: null,
    createdAt: now,
    currency: "IQD",
    customerId: "customer-private",
    customerInstructions: "Safe instruction",
    customerNameSnapshot: "Customer",
    customerPhoneSnapshot: "private-phone",
    deliveryEstimateMinutes: null,
    deliveryFee: new Prisma.Decimal("1000"),
    discountTotal: new Prisma.Decimal("0"),
    fulfillmentMethod: "CUSTOMER_PICKUP",
    fulfillmentStatus: "UNFULFILLED",
    grandTotal: new Prisma.Decimal("11000"),
    history: [{
      actorId: "actor-private",
      actorType: "MERCHANT",
      createdAt: now,
      id: "history",
      idempotencyKey: "private-key",
      metadata: null,
      newFulfillmentStatus: null,
      newOrderStatus: "CONFIRMED",
      newPaymentStatus: null,
      orderId: "order",
      previousFulfillmentStatus: null,
      previousOrderStatus: "PENDING",
      previousPaymentStatus: null,
      reason: "merchant-private-reason",
    }],
    id: "order",
    items: [{
      compareAtPrice: null,
      createdAt: now,
      currency: "IQD",
      id: "item",
      imageUrlSnapshot: "https://example.invalid/snapshot.jpg",
      lineDiscount: new Prisma.Decimal("0"),
      lineSubtotal: new Prisma.Decimal("10000"),
      lineTotal: new Prisma.Decimal("10000"),
      optionValuesSnapshot: { size: "snapshot" },
      orderId: "order",
      productId: null,
      productNameSnapshot: "Snapshot Product",
      productVariantId: null,
      quantity: 1,
      skuSnapshot: "private-sku",
      unitPrice: new Prisma.Decimal("10000"),
      variantTitleSnapshot: "Snapshot Variant",
    }],
    orderNumber: "RZ-1",
    payment: null,
    paymentMethod: "PAY_AT_PICKUP",
    paymentStatus: "UNPAID",
    pickupAddressSnapshot: "Snapshot pickup",
    pickupInstructionsSnapshot: "Snapshot instructions",
    preparationEstimateMinutes: 20,
    rejectionReason: null,
    reservationExpiresAt: new Date(now.getTime() + 900_000),
    status: "PENDING",
    storeId: "store-private",
    storeLogoUrlSnapshot: "https://127.0.0.1/private-order-logo.png",
    storeNameSnapshot: "Snapshot Store",
    storePhoneSnapshot: null,
    storeSlugSnapshot: "snapshot-store",
    subtotal: new Prisma.Decimal("10000"),
    taxTotal: new Prisma.Decimal("0"),
    updatedAt: now,
  } as unknown as CustomerOrderRecord;
}
