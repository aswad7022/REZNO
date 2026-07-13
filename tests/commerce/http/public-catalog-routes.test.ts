import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { GET as getCategories } from "../../../app/api/commerce/public/categories/route";
import { GET as getProducts } from "../../../app/api/commerce/public/products/route";
import { GET as getStoreProduct } from "../../../app/api/commerce/public/stores/[storeSlug]/products/[productSlug]/route";
import { GET as getStoreProducts } from "../../../app/api/commerce/public/stores/[storeSlug]/products/route";
import { GET as getStore } from "../../../app/api/commerce/public/stores/[storeSlug]/route";
import { GET as getStores } from "../../../app/api/commerce/public/stores/route";
import { handlePublicCommerceRequest } from "../../../features/commerce/public/http";
import { prisma } from "../../../lib/db/prisma";
import {
  resetPublicCatalogTestData,
  seedPublicCatalogFixture,
} from "../helpers/public-catalog-fixture";

function request(
  path: string,
  userAgent = "rezno-m2b-http-test",
  headers: Record<string, string> = {},
) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { "user-agent": userAgent, ...headers },
  });
}

async function expectJson(response: Response, status: number) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  return response.json() as Promise<Record<string, unknown>>;
}

test("Milestone 2B route handlers expose safe public HTTP contracts", { concurrency: false }, async (t) => {
  const trustedProxyHeader = process.env.REZNO_TRUSTED_PROXY_HEADER;
  delete process.env.REZNO_TRUSTED_PROXY_HEADER;
  await seedPublicCatalogFixture();
  t.after(async () => {
    if (trustedProxyHeader === undefined) delete process.env.REZNO_TRUSTED_PROXY_HEADER;
    else process.env.REZNO_TRUSTED_PROXY_HEADER = trustedProxyHeader;
    await resetPublicCatalogTestData();
    await prisma.$disconnect();
  });

  await t.test("all collection and detail handlers return JSON envelopes", async () => {
    const categoryBody = await expectJson(await getCategories(request("/api/commerce/public/categories")), 200);
    assert.ok(Array.isArray(categoryBody.data));
    assert.deepEqual(categoryBody.pageInfo, { hasNextPage: false, nextCursor: null });

    const storesBody = await expectJson(await getStores(request("/api/commerce/public/stores")), 200);
    assert.ok(Array.isArray(storesBody.data));

    const storeBody = await expectJson(
      await getStore(request("/api/commerce/public/stores/active-store"), {
        params: Promise.resolve({ storeSlug: "active-store" }),
      }),
      200,
    );
    assert.equal((storeBody.data as { slug: string }).slug, "active-store");

    const productsBody = await expectJson(await getProducts(request("/api/commerce/public/products")), 200);
    assert.ok(Array.isArray(productsBody.data));

    const scopedBody = await expectJson(
      await getStoreProducts(request("/api/commerce/public/stores/active-store/products"), {
        params: Promise.resolve({ storeSlug: "active-store" }),
      }),
      200,
    );
    assert.ok((scopedBody.data as Array<{ storeSlug: string }>).every((item) => item.storeSlug === "active-store"));

    const detailBody = await expectJson(
      await getStoreProduct(request("/api/commerce/public/stores/active-store/products/arabic-phone"), {
        params: Promise.resolve({ productSlug: "arabic-phone", storeSlug: "active-store" }),
      }),
      200,
    );
    assert.equal((detailBody.data as { slug: string }).slug, "arabic-phone");
  });

  await t.test("invalid queries, invalid cursors, and hidden resources use stable errors", async () => {
    const invalidQuery = await expectJson(
      await getStores(request("/api/commerce/public/stores?limit=500")),
      400,
    );
    assert.equal((invalidQuery.error as { code: string }).code, "INVALID_QUERY");

    const invalidCursor = await expectJson(
      await getProducts(request("/api/commerce/public/products?cursor=invalid")),
      400,
    );
    assert.equal((invalidCursor.error as { code: string }).code, "INVALID_CURSOR");

    const hiddenStore = await expectJson(
      await getStore(request("/api/commerce/public/stores/suspended-store"), {
        params: Promise.resolve({ storeSlug: "suspended-store" }),
      }),
      404,
    );
    assert.equal((hiddenStore.error as { code: string }).code, "NOT_FOUND");

    const hiddenProduct = await expectJson(
      await getStoreProduct(request("/api/commerce/public/stores/active-store/products/draft-product"), {
        params: Promise.resolve({ productSlug: "draft-product", storeSlug: "active-store" }),
      }),
      404,
    );
    assert.equal((hiddenProduct.error as { code: string }).code, "NOT_FOUND");
  });

  await t.test("collection buckets isolate clients and spoofed forwarding headers cannot bypass 60/minute", async () => {
    let response: Response | undefined;
    for (let index = 0; index < 61; index += 1) {
      response = await getStores(
        request("/api/commerce/public/stores?limit=bad", "rezno-m2b-rate-limit-test", {
          "x-forwarded-for": `198.51.100.${(index % 200) + 1}`,
          "x-real-ip": `203.0.113.${(index % 200) + 1}`,
        }),
      );
      if (index < 60) assert.equal(response.status, 400);
    }
    const body = await expectJson(response!, 429);
    assert.equal((body.error as { code: string }).code, "RATE_LIMITED");
    assert.ok(Number(response!.headers.get("retry-after")) >= 1);

    const independent = await getStores(
      request("/api/commerce/public/stores?limit=bad", "rezno-m2b-independent-client", {
        "x-forwarded-for": "198.51.100.250",
      }),
    );
    assert.equal(independent.status, 400);
  });

  await t.test("detail routes enforce their unchanged 120/minute limit", async () => {
    let response: Response | undefined;
    for (let index = 0; index < 121; index += 1) {
      response = await getStore(
        request("/api/commerce/public/stores/invalid_slug", "rezno-m2b-detail-rate-limit"),
        { params: Promise.resolve({ storeSlug: "invalid_slug" }) },
      );
      if (index < 120) assert.equal(response.status, 400);
    }
    const body = await expectJson(response!, 429);
    assert.equal((body.error as { code: string }).code, "RATE_LIMITED");
  });

  await t.test("unknown failures are mapped to a generic 500 envelope", async () => {
    const response = await handlePublicCommerceRequest(
      request("/api/commerce/public/test-safe-500", "rezno-m2b-safe-error-test"),
      "test-safe-500",
      async () => {
        throw new Error("secret SQL and stack details");
      },
    );
    const body = await expectJson(response, 500);
    assert.deepEqual(body, {
      error: { code: "INTERNAL_ERROR", message: "The Commerce catalog could not be loaded." },
    });
    assert.equal(JSON.stringify(body).includes("secret SQL"), false);
  });
});
