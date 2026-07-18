import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  effectiveNormalizedAdminPermissions,
  hasAnyCommerceAdminPermission,
  invalidAdminPermissionDependencies,
} from "../../../features/admin/config/permissions";
import {
  adminActorScope,
  adminFilterFingerprint,
  assertDateRange,
  decodeAdminCursor,
  encodeAdminCursor,
  parseCanonicalInstant,
} from "../../../features/commerce/domain/admin-commerce";
import { CommerceDomainError } from "../../../features/commerce/domain/errors";
import { publicProductVisibilityWhere } from "../../../features/commerce/public/visibility";

test("Stage 3D Admin permission dependencies fail closed without silently granting View", () => {
  const invalid = invalidAdminPermissionDependencies([
    "COMMERCE_CATALOG_MODERATE",
    "COMMERCE_ORDERS_MANAGE",
  ]);
  assert.deepEqual(invalid, [
    { permission: "COMMERCE_CATALOG_MODERATE", requires: "COMMERCE_CATALOG_VIEW" },
    { permission: "COMMERCE_ORDERS_MANAGE", requires: "COMMERCE_ORDERS_VIEW" },
  ]);
  assert.deepEqual(
    effectiveNormalizedAdminPermissions(["COMMERCE_CATALOG_MODERATE", "USERS_VIEW"]),
    ["USERS_VIEW"],
  );
  assert.equal(hasAnyCommerceAdminPermission(["COMMERCE_ORDERS_VIEW"]), true);
  assert.equal(hasAnyCommerceAdminPermission(["USERS_VIEW"]), false);
});

test("Stage 3D Admin cursors bind actor, permission, target, filters, and snapshot", () => {
  const actor = adminActorScope({ adminAccessId: "access", source: "database", userId: "user" });
  const filter = adminFilterFingerprint({ status: "SUSPENDED" });
  const encoded = encodeAdminCursor({
    actor,
    filter,
    id: "11111111-1111-4111-8111-111111111111",
    kind: "products",
    permission: "COMMERCE_CATALOG_VIEW",
    snapshot: "2026-07-17T10:00:00.000Z",
    sortValue: "2026-07-17T09:00:00.000Z",
    target: "all",
  });
  assert.equal(decodeAdminCursor(encoded, {
    actor, filter, kind: "products", permission: "COMMERCE_CATALOG_VIEW", target: "all",
  }).id, "11111111-1111-4111-8111-111111111111");
  assert.throws(() => decodeAdminCursor(encoded, {
    actor, filter: adminFilterFingerprint({ status: "DRAFT" }), kind: "products",
    permission: "COMMERCE_CATALOG_VIEW", target: "all",
  }), (error) => error instanceof CommerceDomainError && error.code === "INVALID_CURSOR");
});

test("Stage 3D canonical time filters require complete offset instants and bounded ranges", () => {
  assert.equal(parseCanonicalInstant("2026-07-17T10:00:00+03:00", "from")?.toISOString(), "2026-07-17T07:00:00.000Z");
  assert.throws(() => parseCanonicalInstant("2026-07-17", "from"), (error) =>
    error instanceof CommerceDomainError && error.code === "VALIDATION_ERROR");
  assert.doesNotThrow(() => assertDateRange(new Date("2026-01-01T00:00:00Z"), new Date("2026-03-01T00:00:00Z"), 90));
  assert.throws(() => assertDateRange(new Date("2026-01-01T00:00:00Z"), new Date("2026-05-01T00:00:00Z"), 90));
});

test("public Product visibility is Category-aware", () => {
  assert.deepEqual(publicProductVisibilityWhere.category, { status: "ACTIVE" });
});

test("Stage 3D removes obsolete production write exports and preserves deferred ownership", async () => {
  await assert.rejects(readFile(new URL("../../../features/commerce/services/catalog-service.ts", import.meta.url), "utf8"));
  const customerService = await readFile(new URL("../../../features/commerce/services/customer-service.ts", import.meta.url), "utf8");
  assert.doesNotMatch(customerService, /export async function (?:favorite|unfavorite)(?:Store|Product)/);
  const registry = await readFile(new URL("../../../features/dashboard/feature-placeholder.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(registry, /\/business\/communications/);
  assert.match(registry, /Stage 8 Final Visual Polish/);
  assert.doesNotMatch(registry, /Stage 8[^\n]*AI/i);
});

test("Stage 3D routes and Merchant reports are production reachable", async () => {
  const routes = [
    "../../../app/admin/commerce/categories/page.tsx",
    "../../../app/admin/commerce/products/page.tsx",
    "../../../app/admin/commerce/inventory/page.tsx",
    "../../../app/admin/commerce/orders/page.tsx",
    "../../../app/admin/commerce/audit/page.tsx",
    "../../../app/business/commerce/reports/page.tsx",
  ];
  for (const route of routes) assert.ok((await readFile(new URL(route, import.meta.url), "utf8")).length > 0);
  const navigation = await readFile(new URL("../../../features/dashboard/navigation.ts", import.meta.url), "utf8");
  assert.match(navigation, /REPORTS_VIEW/);
  assert.match(navigation, /\/business\/commerce\/reports/);
});
