import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma } from "@prisma/client";

import {
  decodeAdminStoreCursor,
  encodeAdminStoreCursor,
} from "../../../features/commerce/domain/admin-store-cursor";
import {
  assignableCommercePermissions,
  effectiveCommercePermissions,
} from "../../../features/commerce/domain/merchant-access";
import {
  createStoreSchema,
  updateStoreSchema,
} from "../../../features/commerce/domain/store-input";
import { evaluateStoreReadiness } from "../../../features/commerce/domain/store-readiness";
import {
  storeNotificationEventKey,
} from "../../../features/commerce/domain/store-notification-events";
import { deferredBusinessRouteRegistry } from "../../../features/dashboard/feature-placeholder";
import { getDashboardNavigation } from "../../../features/dashboard/navigation";
import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "../../../features/identity/policies/authorization";
import { sanitizeAuditValue } from "../../../features/business-operations/domain/validation";

const baseStore = {
  contextOrganizationId: randomUUID(),
  deliveryArea: "Karrada",
  deliveryCity: "Baghdad",
  deliveryEnabled: true,
  idempotencyKey: randomUUID(),
  name: "REZNO QA Store",
  pickupEnabled: false,
  slug: "rezno-qa-store",
};

test("Stage 3A Merchant Store domain contracts", async (t) => {
  await t.test("Owner effective permissions remain the fixed complete 12-permission baseline", () => {
    assert.deepEqual(effectiveCommercePermissions({ commercePermissions: [], systemRole: "OWNER" }), OWNER_DEFAULT_COMMERCE_PERMISSIONS);
  });

  await t.test("Manager can receive every explicit operational permission except STORE_MANAGE", () => {
    assert.equal(assignableCommercePermissions("MANAGER").includes("STORE_MANAGE"), false);
    assert.equal(assignableCommercePermissions("MANAGER").includes("PRODUCT_CREATE"), true);
  });

  await t.test("Receptionist Commerce permissions fail closed even when persisted", () => {
    assert.deepEqual(effectiveCommercePermissions({ commercePermissions: ["STORE_VIEW"], systemRole: "RECEPTIONIST" }), []);
  });

  await t.test("Staff receives only the current explicit Product and Inventory operational subset", () => {
    const effective = effectiveCommercePermissions({
      commercePermissions: ["STORE_VIEW", "PRODUCT_CREATE", "INVENTORY_ADJUST", "ORDER_CANCEL"],
      systemRole: "STAFF",
    });
    assert.deepEqual(effective, ["INVENTORY_ADJUST"]);
  });

  await t.test("Store create schema canonicalizes slug, phone and whole IQD values", () => {
    const parsed = createStoreSchema.parse({
      ...baseStore,
      deliveryFee: "1000",
      slug: "  REZNO-QA-STORE  ",
      supportPhone: "+964 (750) 000-0000",
    });
    assert.equal(parsed.slug, "rezno-qa-store");
    assert.equal(parsed.supportPhone, "+9647500000000");
    assert.equal(parsed.deliveryFee, "1000");
  });

  await t.test("Store schemas reject unknown/mass-assignment fields", () => {
    assert.equal(createStoreSchema.safeParse({ ...baseStore, organizationId: randomUUID() }).success, false);
    assert.equal(createStoreSchema.safeParse({ ...baseStore, status: "ACTIVE" }).success, false);
  });

  await t.test("Store schemas reject every raw image URL", () => {
    for (const logoUrl of ["http://example.com/a.png", "https://127.0.0.1/a.png", "https://user:pass@example.com/a.png", "javascript:alert(1)"]) {
      assert.equal(createStoreSchema.safeParse({ ...baseStore, logoUrl }).success, false);
    }
    assert.equal(createStoreSchema.safeParse({ ...baseStore, logoUrl: "https://cdn.example.com/a.png" }).success, false);
  });

  await t.test("Store schemas reject negative/fractional IQD and unbounded estimates", () => {
    assert.equal(createStoreSchema.safeParse({ ...baseStore, deliveryFee: "-1" }).success, false);
    assert.equal(createStoreSchema.safeParse({ ...baseStore, deliveryFee: "1.5" }).success, false);
    assert.equal(createStoreSchema.safeParse({ ...baseStore, preparationEstimateMinutes: 10_081 }).success, false);
  });

  await t.test("Store money input canonicalizes leading zeros and enforces Decimal(18,3) capacity", () => {
    const canonical = createStoreSchema.parse({
      ...baseStore,
      deliveryFee: "0001",
      minimumOrderValue: "000000000000000",
    });
    assert.equal(canonical.deliveryFee, "1");
    assert.equal(canonical.minimumOrderValue, "0");
    assert.equal(createStoreSchema.safeParse({ ...baseStore, deliveryFee: "999999999999999" }).success, true);
    for (const deliveryFee of ["1000000000000000", "+1", "1e3", "NaN", "Infinity", "1.0"]) {
      assert.equal(createStoreSchema.safeParse({ ...baseStore, deliveryFee }).success, false);
    }
  });

  await t.test("Store update requires exact UUID envelope and timestamp version", () => {
    assert.equal(updateStoreSchema.safeParse({ ...baseStore, expectedVersion: new Date().toISOString(), storeId: randomUUID() }).success, true);
    assert.equal(updateStoreSchema.safeParse({ ...baseStore, expectedVersion: "stale", storeId: randomUUID() }).success, false);
  });

  await t.test("Readiness reports fulfillment and address gaps without requiring Products", () => {
    const result = evaluateStoreReadiness({
      organizationActive: true,
      status: "DRAFT",
      name: "Store",
      slug: "store",
      description: null,
      logoUrl: null,
      coverImageUrl: null,
      supportPhone: "+9647500000000",
      currency: "IQD",
      deliveryFee: new Prisma.Decimal(0),
      minimumOrderValue: new Prisma.Decimal(0),
      preparationEstimateMinutes: null,
      deliveryEstimateMinutes: null,
      deliveryEnabled: false,
      deliveryCity: null,
      deliveryArea: null,
      pickupEnabled: false,
      pickupCity: null,
      pickupArea: null,
      pickupStreet: null,
    });
    assert.equal(result.ready, false);
    assert.deepEqual(result.missing, ["fulfillment_enabled"]);
  });

  await t.test("Readiness fails closed for inactive Organization and archived lifecycle", () => {
    const result = evaluateStoreReadiness({
      organizationActive: false,
      status: "ARCHIVED",
      name: "Store",
      slug: "store",
      description: null,
      logoUrl: null,
      coverImageUrl: null,
      supportPhone: null,
      currency: "IQD",
      deliveryFee: new Prisma.Decimal(0),
      minimumOrderValue: new Prisma.Decimal(0),
      preparationEstimateMinutes: null,
      deliveryEstimateMinutes: null,
      deliveryEnabled: true,
      deliveryCity: "Baghdad",
      deliveryArea: "Karrada",
      pickupEnabled: false,
      pickupCity: null,
      pickupArea: null,
      pickupStreet: null,
    });
    assert.equal(result.ready, false);
    assert.deepEqual(result.missing.slice(0, 2), ["organization_active", "lifecycle_valid"]);
  });

  await t.test("Readiness fails closed when historical money exceeds persistence capacity", () => {
    const result = evaluateStoreReadiness({
      organizationActive: true,
      status: "ACTIVE",
      name: "Store",
      slug: "store",
      description: null,
      logoUrl: null,
      coverImageUrl: null,
      supportPhone: null,
      currency: "IQD",
      deliveryFee: new Prisma.Decimal("1000000000000000"),
      minimumOrderValue: new Prisma.Decimal(0),
      preparationEstimateMinutes: null,
      deliveryEstimateMinutes: null,
      deliveryEnabled: true,
      deliveryCity: "Baghdad",
      deliveryArea: "Karrada",
      pickupEnabled: false,
      pickupCity: null,
      pickupArea: null,
      pickupStreet: null,
    });
    assert.equal(result.ready, false);
    assert.equal(result.missing.includes("money_valid"), true);
  });

  await t.test("Admin Store cursor binds actor, filter, sort and snapshot", () => {
    const value = {
      actor: "database:admin:COMMERCE_STORES_VIEW",
      filter: "a".repeat(64),
      id: randomUUID(),
      snapshot: new Date().toISOString(),
      sort: "updated_desc" as const,
      sortValue: new Date().toISOString(),
    };
    const encoded = encodeAdminStoreCursor(value);
    assert.deepEqual(decodeAdminStoreCursor(encoded, value), value);
    assert.throws(() => decodeAdminStoreCursor(encoded, { ...value, actor: "database:other:COMMERCE_STORES_VIEW" }));
    assert.throws(() => decodeAdminStoreCursor(`${encoded}x`, value));
  });

  await t.test("Audit sanitizer removes secret-bearing keys and bounds strings", () => {
    const sanitized = sanitizeAuditValue({ Authorization: "secret", cookie: "secret", description: "x".repeat(900), safe: "ok" }) as Record<string, unknown>;
    assert.equal("Authorization" in sanitized, false);
    assert.equal("cookie" in sanitized, false);
    assert.equal((sanitized.description as string).length, 500);
    assert.equal(sanitized.safe, "ok");
  });

  await t.test("Store notification event keys bind event, version, Store and recipient", () => {
    const version = new Date("2026-07-17T00:00:00.000Z");
    const first = storeNotificationEventKey({ event: "store.approved", recipientPersonId: randomUUID(), resultVersion: version, storeId: randomUUID() });
    assert.match(first, /^commerce:store:/);
    assert.notEqual(first, first.replace("store.approved", "store.suspended"));
  });

  await t.test("Commerce navigation is structurally absent without effective permissions", () => {
    const hrefs = getDashboardNavigation("business", undefined, "MANAGER", undefined, true, []).flatMap((group) => group.items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]));
    assert.equal(hrefs.some((href) => href.startsWith("/business/commerce")), false);
  });

  await t.test("Owner Commerce navigation contains Store and access while explicit Staff contains neither access nor management grants", () => {
    const owner = getDashboardNavigation("business", undefined, "OWNER", undefined, true, [...OWNER_DEFAULT_COMMERCE_PERMISSIONS]);
    const ownerHrefs = owner.flatMap((group) => group.items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]));
    assert.equal(ownerHrefs.includes("/business/commerce/store"), true);
    assert.equal(ownerHrefs.includes("/business/commerce/access"), true);
    const staff = getDashboardNavigation("business", undefined, "STAFF", randomUUID(), true, ["INVENTORY_VIEW"]);
    const staffHrefs = staff.flatMap((group) => group.items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]));
    assert.equal(staffHrefs.includes("/business/commerce"), true);
    assert.equal(staffHrefs.includes("/business/commerce/store"), false);
    assert.equal(staffHrefs.includes("/business/commerce/access"), false);
  });

  await t.test("Concrete Commerce and Gate 4A communications hubs are removed from the deferred route registry", () => {
    assert.equal("/business/commerce" in deferredBusinessRouteRegistry, false);
    assert.equal("/business/communications" in deferredBusinessRouteRegistry, false);
  });
});
