import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

import {
  decodePublicCursor,
  encodePublicCursor,
  publicQueryFingerprint,
} from "../../../features/commerce/public/cursor";
import {
  serializePublicProductDetail,
  serializePublicStore,
} from "../../../features/commerce/public/dto";
import {
  PublicCommerceError,
  publicCommerceErrorResponse,
} from "../../../features/commerce/public/errors";
import {
  parseProductCollectionQuery,
  parseStoreCollectionQuery,
} from "../../../features/commerce/public/query-validation";
import { normalizePublicCommerceSearch } from "../../../features/commerce/public/search-normalization";
import { getRateLimitIdentifierFromHeaders } from "../../../lib/security/rate-limit-core";

test("public Commerce Arabic normalization is conservative and deterministic", () => {
  assert.equal(normalizePublicCommerceSearch("  أإآٱ  "), "اااا");
  assert.equal(normalizePublicCommerceSearch("هــــاتــف"), "هاتف");
  assert.equal(normalizePublicCommerceSearch("مُسْتَشْفَى"), "مستشفي");
  assert.equal(normalizePublicCommerceSearch("  PREMIUM   Store  "), "premium store");
  assert.equal(normalizePublicCommerceSearch("ة ؤ ئ"), "ة ؤ ئ");
});

test("Store query validation enforces bounds and sort allowlists", () => {
  const parsed = parseStoreCollectionQuery(new URLSearchParams("q=%20Store%20&limit=50&sort=name_asc"));
  assert.equal(parsed.query, "store");
  assert.equal(parsed.limit, 50);
  assert.equal(parsed.sort, "name_asc");
  assert.throws(
    () => parseStoreCollectionQuery(new URLSearchParams("limit=0")),
    (error: unknown) => error instanceof PublicCommerceError && error.code === "INVALID_QUERY",
  );
  assert.throws(() => parseStoreCollectionQuery(new URLSearchParams("sort=rating")), PublicCommerceError);
  assert.throws(
    () => parseStoreCollectionQuery(new URLSearchParams(`q=${"x".repeat(101)}`)),
    PublicCommerceError,
  );
});

test("Product query validation accepts whole IQD filters and rejects invalid ranges", () => {
  const parsed = parseProductCollectionQuery(
    new URLSearchParams("minPrice=1000&maxPrice=5000&inStock=false&sort=price_desc"),
  );
  assert.equal(parsed.minPrice, "1000.000");
  assert.equal(parsed.maxPrice, "5000.000");
  assert.equal(parsed.inStock, false);
  assert.equal(parsed.sort, "price_desc");
  assert.throws(() => parseProductCollectionQuery(new URLSearchParams("minPrice=1.5")), PublicCommerceError);
  assert.throws(
    () => parseProductCollectionQuery(new URLSearchParams("minPrice=6000&maxPrice=5000")),
    PublicCommerceError,
  );
  assert.throws(() => parseProductCollectionQuery(new URLSearchParams("inStock=yes")), PublicCommerceError);
});

test("opaque cursors round-trip and reject tampering or filter reuse", () => {
  const fingerprint = publicQueryFingerprint({ q: "هاتف", scope: "products", sort: "price_asc" });
  const cursor = encodePublicCursor({
    fingerprint,
    id: "11111111-1111-4111-8111-111111111111",
    sort: "price_asc",
    sortValue: "1000.000",
  });
  assert.deepEqual(decodePublicCursor(cursor, { fingerprint, sort: "price_asc" }), {
    fingerprint,
    id: "11111111-1111-4111-8111-111111111111",
    sort: "price_asc",
    sortValue: "1000.000",
  });
  const decodedText = Buffer.from(cursor, "base64url").toString("utf8").replace("1000.000", "1.000");
  const tampered = Buffer.from(decodedText, "utf8").toString("base64url");
  assert.throws(() => decodePublicCursor(tampered, { fingerprint, sort: "price_asc" }), PublicCommerceError);
  assert.throws(
    () => decodePublicCursor(cursor, { fingerprint: publicQueryFingerprint({ q: "other" }), sort: "price_asc" }),
    PublicCommerceError,
  );
  assert.throws(() => decodePublicCursor(cursor, { fingerprint, sort: "newest" }), PublicCommerceError);
});

test("DTOs serialize Decimal money and exclude internal fields", () => {
  const storeRecord = {
    archiveReason: "must not leak",
    coverImageUrl: null,
    currency: "IQD",
    deliveryArea: "Karrada",
    deliveryCity: "Baghdad",
    deliveryEnabled: true,
    deliveryEstimateMinutes: 45,
    deliveryFee: new Prisma.Decimal("1000"),
    description: "Public description",
    id: "11111111-1111-4111-8111-111111111111",
    logoUrl: null,
    minimumOrderValue: new Prisma.Decimal("5000"),
    name: "Public Store",
    organizationId: "must not leak",
    pickupArea: null,
    pickupCity: null,
    pickupEnabled: false,
    pickupInstructions: null,
    preparationEstimateMinutes: 20,
    reviewReason: "must not leak",
    slug: "public-store",
    suspensionReason: "must not leak",
  };
  const store = serializePublicStore(storeRecord);
  assert.equal(store.delivery.fee, "1000.000");
  assert.equal(store.minimumOrderValue, "5000.000");
  assert.equal("organizationId" in store, false);
  assert.equal("reviewReason" in store, false);

  const variantsWithInternalFields = [
    {
      compareAtPrice: new Prisma.Decimal("12000"),
      currency: "IQD",
      id: "v",
      inventory: { onHand: 5, reserved: 2 },
      isDefault: true,
      optionValues: {},
      price: new Prisma.Decimal("10000"),
      sku: "must not leak",
      title: "Default",
    },
  ];
  const detail = serializePublicProductDetail({
    category: { displayOrder: 1, id: "c", name: "Phones", slug: "phones" },
    description: "Product description",
    id: "p",
    media: [],
    name: "Phone",
    slug: "phone",
    store: storeRecord,
    variants: variantsWithInternalFields,
  });
  assert.equal(detail.lowestPrice, "10000.000");
  assert.equal(detail.variants[0]?.compareAtPrice, "12000.000");
  assert.equal(detail.variants[0]?.inStock, true);
  assert.equal("inventory" in detail.variants[0]!, false);
  assert.equal("sku" in detail.variants[0]!, false);
});

test("unknown errors map to a generic safe public response", () => {
  assert.deepEqual(publicCommerceErrorResponse(new Error("sensitive SQL text")), {
    body: { error: { code: "INTERNAL_ERROR", message: "The Commerce catalog could not be loaded." } },
    status: 500,
  });
});

test("forwarding headers are ignored unless proxy trust is explicitly enabled", () => {
  const left = new Headers({ "user-agent": "unit-client", "x-forwarded-for": "1.1.1.1" });
  const right = new Headers({ "user-agent": "unit-client", "x-forwarded-for": "9.9.9.9" });
  assert.equal(getRateLimitIdentifierFromHeaders(left), getRateLimitIdentifierFromHeaders(right));
  assert.notEqual(
    getRateLimitIdentifierFromHeaders(left, "fallback", { trustedProxyHeader: "x-forwarded-for" }),
    getRateLimitIdentifierFromHeaders(right, "fallback", { trustedProxyHeader: "x-forwarded-for" }),
  );
});
