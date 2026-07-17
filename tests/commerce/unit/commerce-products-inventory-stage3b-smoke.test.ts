import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCommerceProductsInventoryStage3bSmokeSafety,
  COMMERCE_PRODUCTS_INVENTORY_STAGE3B_SMOKE_CONFIRMATION,
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
