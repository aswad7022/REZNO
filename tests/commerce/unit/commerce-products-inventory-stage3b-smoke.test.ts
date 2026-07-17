import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCommerceProductsInventoryStage3bSmokeSafety,
  COMMERCE_PRODUCTS_INVENTORY_STAGE3B_SMOKE_CONFIRMATION,
  parseCommerceProductsInventoryStage3bForm,
} from "../../../scripts/staging/commerce-products-inventory-stage3b-smoke-safety";

const valid = {
  authBaseUrl: "https://rezno-staging.vercel.app",
  baseUrl: "https://rezno-staging-abc123-rafidedu.vercel.app",
  confirmation: COMMERCE_PRODUCTS_INVENTORY_STAGE3B_SMOKE_CONFIRMATION,
  database: "rezno_staging",
  vercelEnvironment: "preview",
};

test("Stage 3B staging smoke safety accepts only the exact isolated staging envelope", () => {
  assert.doesNotThrow(() => assertCommerceProductsInventoryStage3bSmokeSafety(valid));
});

test("Stage 3B staging smoke safety rejects production, aliases, and unrelated databases", () => {
  for (const override of [
    { baseUrl: "https://rezno-staging.vercel.app" },
    { baseUrl: "https://rezno.vercel.app" },
    { authBaseUrl: "https://rezno.vercel.app" },
    { database: "rezno" },
    { database: "rezno_test" },
    { vercelEnvironment: "production" },
    { confirmation: "wrong" },
  ]) {
    assert.throws(() => assertCommerceProductsInventoryStage3bSmokeSafety({ ...valid, ...override }));
  }
});

test("Stage 3B staging form parsing preserves browser select semantics", () => {
  const parameters = parseCommerceProductsInventoryStage3bForm(`
    <form>
      <input name="mode" value="update" />
      <input name="ignored" value="no" disabled="" />
      <textarea name="description">Updated &amp; safe</textarea>
      <select name="categoryId">
        <option value="">Choose</option>
        <option value="category-active" selected="">Active</option>
      </select>
    </form>
  `);
  assert.deepEqual(Object.fromEntries(parameters), {
    categoryId: "category-active",
    description: "Updated & safe",
    mode: "update",
  });
});
