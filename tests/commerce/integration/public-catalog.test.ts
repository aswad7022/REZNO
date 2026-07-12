import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublicProduct,
  getPublicStore,
  listPublicCategories,
  listPublicProducts,
  listPublicStoreProducts,
  listPublicStores,
} from "../../../features/commerce/public/catalog-service";
import { PublicCommerceError } from "../../../features/commerce/public/errors";
import {
  parseProductCollectionQuery,
  parseStoreCollectionQuery,
} from "../../../features/commerce/public/query-validation";
import { prisma } from "../../../lib/db/prisma";
import {
  resetPublicCatalogTestData,
  seedPublicCatalogFixture,
} from "../helpers/public-catalog-fixture";

function stores(query = "") {
  return listPublicStores(parseStoreCollectionQuery(new URLSearchParams(query)));
}

function products(query = "", fixedStore?: string) {
  return listPublicProducts(
    parseProductCollectionQuery(new URLSearchParams(query), fixedStore ? { fixedStore } : {}),
  );
}

function expectPublicError(code: PublicCommerceError["code"], status?: number) {
  return (error: unknown) =>
    error instanceof PublicCommerceError && error.code === code && (status === undefined || error.status === status);
}

async function collectProductPages(query: string) {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const separator = query ? "&" : "";
    const page = await products(`${query}${separator}limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    ids.push(...page.data.map((item) => item.id));
    cursor = page.pageInfo.nextCursor;
  } while (cursor);
  return ids;
}

test("Milestone 2B public catalog PostgreSQL contract", { concurrency: false }, async (t) => {
  const fixture = await seedPublicCatalogFixture();
  t.after(async () => {
    await resetPublicCatalogTestData();
    await prisma.$disconnect();
  });

  await t.test("categories and Store visibility are enforced in the database", async () => {
    const categories = await listPublicCategories();
    assert.deepEqual(categories.map((item) => item.slug), ["phones", "accessories"]);

    const result = await stores("sort=name_asc");
    assert.deepEqual(new Set(result.data.map((item) => item.slug)), new Set(["active-store", "second-store"]));
    assert.deepEqual(
      result.data.map((item) => item.slug),
      (await stores("sort=name_asc")).data.map((item) => item.slug),
    );
    const activeStore = result.data.find((item) => item.slug === "active-store");
    assert.equal(activeStore?.delivery.fee, "1000.000");
    assert.equal(activeStore?.minimumOrderValue, "5000.000");

    for (const slug of ["draft-store", "pending-store", "rejected-store", "suspended-store", "archived-store", "missing-store"]) {
      await assert.rejects(() => getPublicStore(slug), expectPublicError("NOT_FOUND", 404));
    }
  });

  await t.test("Product visibility, Store scope, details, and inventory privacy", async () => {
    const result = await products("sort=name_asc");
    assert.deepEqual(
      new Set(result.data.map((item) => item.slug)),
      new Set(["equal-a", "equal-b", "out-of-stock", "premium-phone", "second-product", "arabic-phone"]),
    );
    assert.deepEqual(
      result.data.map((item) => item.id),
      (await products("sort=name_asc")).data.map((item) => item.id),
    );
    assert.equal(result.data.find((item) => item.slug === "out-of-stock")?.inStock, false);
    assert.equal(result.data.find((item) => item.slug === "arabic-phone")?.inStock, true);

    const scoped = await listPublicStoreProducts(
      "active-store",
      parseProductCollectionQuery(new URLSearchParams("sort=name_asc"), { fixedStore: "active-store" }),
    );
    assert.equal(scoped.data.length, 5);
    assert.ok(scoped.data.every((item) => item.storeSlug === "active-store"));

    const detail = await getPublicProduct("active-store", "arabic-phone");
    assert.equal(detail.lowestPrice, "10000.000");
    assert.equal(detail.highestPrice, null);
    assert.equal(detail.variants[0]?.price, "10000.000");
    assert.equal(typeof detail.variants[0]?.price, "string");
    assert.equal(detail.variants[0]?.inStock, true);

    for (const [storeSlug, productSlug] of [
      ["active-store", "draft-product"],
      ["active-store", "suspended-product"],
      ["active-store", "archived-product"],
      ["suspended-store", "hidden-store-product"],
      ["second-store", "arabic-phone"],
    ]) {
      await assert.rejects(
        () => getPublicProduct(storeSlug!, productSlug!),
        expectPublicError("NOT_FOUND", 404),
      );
    }

    const json = JSON.stringify({ detail, result });
    for (const forbidden of [
      "organizationId",
      "reviewReason",
      "suspensionReason",
      "archiveReason",
      "onHand",
      "reserved",
      "sku",
      "members",
      "customer",
      "audit",
    ]) {
      assert.equal(json.includes(forbidden), false, `${forbidden} leaked`);
    }
  });

  await t.test("Arabic normalization, Latin case folding, and public-only search", async () => {
    assert.deepEqual((await stores("q=ازياء")).data.map((item) => item.slug), ["active-store"]);
    assert.deepEqual((await products("q=هاتف%20اندرويد")).data.map((item) => item.slug), ["arabic-phone"]);
    assert.deepEqual((await products("q=هاتف%20ممتاز")).data.map((item) => item.slug), ["arabic-phone"]);
    assert.deepEqual((await products("q=PREMIUM%20PHONE")).data.map((item) => item.slug), ["premium-phone"]);
    assert.equal((await stores("q=Hidden")).data.length, 0);
    assert.equal((await products("q=Hidden")).data.length, 0);
    assert.equal((await listPublicStoreProducts("active-store", parseProductCollectionQuery(new URLSearchParams("q=Second"), { fixedStore: "active-store" }))).data.length, 0);
  });

  await t.test("approved filters use visible Variants and visible Products", async () => {
    assert.equal((await stores("category=phones")).data.length, 1);
    assert.deepEqual((await stores("fulfillment=delivery")).data.map((item) => item.slug), ["active-store"]);
    assert.equal((await stores("fulfillment=pickup")).data.length, 2);
    assert.deepEqual((await products("store=second-store")).data.map((item) => item.slug), ["second-product"]);
    assert.equal((await products("category=phones")).data.length, 4);
    assert.equal((await products("inStock=true")).data.length, 5);
    assert.deepEqual((await products("inStock=false")).data.map((item) => item.slug), ["out-of-stock"]);
    assert.equal((await products("minPrice=20000")).data.length, 2);
    assert.equal((await products("maxPrice=10000")).data.length, 4);
    assert.throws(
      () => parseProductCollectionQuery(new URLSearchParams("minPrice=1.5")),
      expectPublicError("INVALID_QUERY", 400),
    );
    assert.throws(
      () => parseProductCollectionQuery(new URLSearchParams("minPrice=200&maxPrice=100")),
      expectPublicError("INVALID_QUERY", 400),
    );
  });

  await t.test("cursor pagination is complete and stable across equal sort values", async () => {
    const expected = new Set([
      fixture.products.arabic.id,
      fixture.products.equalA.id,
      fixture.products.equalB.id,
      fixture.products.latin.id,
      fixture.products.outOfStock.id,
      fixture.products.secondProduct.id,
    ]);
    for (const sort of ["name_asc", "price_asc", "price_desc", "newest"]) {
      const ids = await collectProductPages(`sort=${sort}`);
      assert.equal(ids.length, expected.size, `${sort} returned the wrong count`);
      assert.equal(new Set(ids).size, ids.length, `${sort} duplicated a Product`);
      assert.deepEqual(new Set(ids), expected, `${sort} omitted a Product`);
    }

    const page = await products("limit=2&sort=price_asc");
    assert.ok(page.pageInfo.nextCursor);
    const cursor = encodeURIComponent(page.pageInfo.nextCursor!);
    await assert.rejects(() => products(`limit=2&sort=price_desc&cursor=${cursor}`), expectPublicError("INVALID_CURSOR", 400));
    await assert.rejects(() => products(`limit=2&sort=price_asc&category=phones&cursor=${cursor}`), expectPublicError("INVALID_CURSOR", 400));
    await assert.rejects(
      () => listPublicStoreProducts("active-store", parseProductCollectionQuery(new URLSearchParams(`limit=2&sort=price_asc&cursor=${cursor}`), { fixedStore: "active-store" })),
      expectPublicError("INVALID_CURSOR", 400),
    );
    await assert.rejects(() => products("cursor=not-a-valid-cursor"), expectPublicError("INVALID_CURSOR", 400));
  });

  await t.test("representative plans are valid PostgreSQL plans", async () => {
    const plans = await Promise.all([
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>`EXPLAIN SELECT "id" FROM "Store" WHERE "status" = 'ACTIVE'::"StoreStatus" AND "archivedAt" IS NULL AND "publishedAt" IS NOT NULL ORDER BY "createdAt" DESC, "id" DESC LIMIT 21`,
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>`EXPLAIN SELECT p."id" FROM "Product" p JOIN "Store" s ON s."id" = p."storeId" JOIN "MarketplaceCategory" c ON c."id" = p."categoryId" JOIN "ProductVariant" pv ON pv."productId" = p."id" WHERE p."status" = 'PUBLISHED'::"ProductStatus" AND p."archivedAt" IS NULL AND s."status" = 'ACTIVE'::"StoreStatus" AND c."status" = 'ACTIVE'::"MarketplaceCategoryStatus" AND pv."status" = 'ACTIVE'::"ProductVariantStatus" ORDER BY pv."price" ASC LIMIT 21`,
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>`EXPLAIN SELECT p."id" FROM "Product" p JOIN "ProductVariant" pv ON pv."productId" = p."id" LEFT JOIN "InventoryItem" i ON i."variantId" = pv."id" WHERE p."status" = 'PUBLISHED'::"ProductStatus" AND pv."status" = 'ACTIVE'::"ProductVariantStatus" AND COALESCE(i."onHand" - i."reserved" > 0, false)`,
      prisma.$queryRaw<Array<{ "QUERY PLAN": string }>>`EXPLAIN SELECT "id" FROM "Store" WHERE lower("name") ILIKE '%store%' LIMIT 21`,
    ]);
    assert.ok(plans.every((plan) => plan.length > 0));
    t.diagnostic(plans.map((plan) => plan.map((line) => line["QUERY PLAN"]).join("\n")).join("\n---\n"));
  });
});
