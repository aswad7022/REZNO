import assert from "node:assert/strict";
import test from "node:test";

import { COMMERCE_PRODUCTS_INVENTORY_STAGE3B_FIXTURE } from "../../../scripts/staging/commerce-products-inventory-stage3b-seed-core";
import {
  COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_ENV,
  COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_TOKEN,
  validateCommerceProductsInventoryStage3bSeedEnvironment,
} from "../../../scripts/staging/commerce-products-inventory-stage3b-seed-safety";

test("Stage 3B fixture requires exact confirmation and a PostgreSQL staging target", () => {
  assert.throws(() => validateCommerceProductsInventoryStage3bSeedEnvironment({
    DATABASE_URL: "postgresql://host/rezno_staging",
  }));
  assert.throws(() => validateCommerceProductsInventoryStage3bSeedEnvironment({
    [COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_ENV]: COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_TOKEN,
    DATABASE_URL: "postgresql://host/rezno_production",
  }));
  assert.throws(() => validateCommerceProductsInventoryStage3bSeedEnvironment({
    [COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_ENV]: COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_TOKEN,
    DATABASE_URL: "mysql://host/rezno_staging",
  }));
  assert.equal(validateCommerceProductsInventoryStage3bSeedEnvironment({
    [COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_ENV]: COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_TOKEN,
    DATABASE_URL: "postgresql://host/rezno_staging",
  }).databaseUrl.includes("rezno_staging"), true);
});

test("Stage 3B fixture errors never echo credentials", () => {
  const secret = "super-secret-password";
  assert.throws(
    () => validateCommerceProductsInventoryStage3bSeedEnvironment({
      [COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_ENV]: COMMERCE_PRODUCTS_INVENTORY_STAGE3B_CONFIRMATION_TOKEN,
      DATABASE_URL: `postgresql://user:${secret}@production.example.com/rezno_live`,
    }),
    (error: unknown) => error instanceof Error && !error.message.includes(secret),
  );
});

test("Stage 3B fixture is deterministic and covers the locked operational matrix", () => {
  assert.equal(COMMERCE_PRODUCTS_INVENTORY_STAGE3B_FIXTURE.namespace, "rezno-qa-commerce-products-inventory-stage3b");
  assert.equal(Object.keys(COMMERCE_PRODUCTS_INVENTORY_STAGE3B_FIXTURE.organizations).length, 4);
  assert.equal(Object.keys(COMMERCE_PRODUCTS_INVENTORY_STAGE3B_FIXTURE.people).length, 9);
  assert.notEqual(COMMERCE_PRODUCTS_INVENTORY_STAGE3B_FIXTURE.product(0), COMMERCE_PRODUCTS_INVENTORY_STAGE3B_FIXTURE.product(23));
  assert.notEqual(COMMERCE_PRODUCTS_INVENTORY_STAGE3B_FIXTURE.variant(1, 1), COMMERCE_PRODUCTS_INVENTORY_STAGE3B_FIXTURE.variant(1, 2));
  assert.match(COMMERCE_PRODUCTS_INVENTORY_STAGE3B_FIXTURE.people.owner[1], /^fixture:stage3b:/);
});
