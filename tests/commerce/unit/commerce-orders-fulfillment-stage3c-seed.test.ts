import assert from "node:assert/strict";
import test from "node:test";

import { COMMERCE_ORDERS_FULFILLMENT_STAGE3C_FIXTURE } from "../../../scripts/staging/commerce-orders-fulfillment-stage3c-seed-core";
import {
  COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_ENV,
  COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_TOKEN,
  validateCommerceOrdersFulfillmentStage3cSeedEnvironment,
} from "../../../scripts/staging/commerce-orders-fulfillment-stage3c-seed-safety";

test("Stage 3C fixture requires exact confirmation and exact PostgreSQL staging semantics", () => {
  assert.throws(() => validateCommerceOrdersFulfillmentStage3cSeedEnvironment({ DATABASE_URL: "postgresql://host/rezno_staging" }));
  assert.throws(() => validateCommerceOrdersFulfillmentStage3cSeedEnvironment({
    [COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_ENV]: COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_TOKEN,
    DATABASE_URL: "postgresql://host/rezno_production",
  }));
  assert.throws(() => validateCommerceOrdersFulfillmentStage3cSeedEnvironment({
    [COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_ENV]: COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_TOKEN,
    DATABASE_URL: "mysql://host/rezno_staging",
  }));
  assert.equal(validateCommerceOrdersFulfillmentStage3cSeedEnvironment({
    [COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_ENV]: COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_TOKEN,
    DATABASE_URL: "postgresql://host/rezno_staging",
  }).databaseUrl.includes("rezno_staging"), true);
});

test("Stage 3C fixture errors never expose credentials", () => {
  const secret = "stage3c-secret-password";
  assert.throws(() => validateCommerceOrdersFulfillmentStage3cSeedEnvironment({
    [COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_ENV]: COMMERCE_ORDERS_FULFILLMENT_STAGE3C_CONFIRMATION_TOKEN,
    DATABASE_URL: `postgresql://user:${secret}@production.example.com/rezno_live`,
  }), (error: unknown) => error instanceof Error && !error.message.includes(secret));
});

test("Stage 3C deterministic fixture covers the locked role and Order matrix", () => {
  const fixture = COMMERCE_ORDERS_FULFILLMENT_STAGE3C_FIXTURE;
  assert.equal(fixture.namespace, "rezno-qa-commerce-orders-fulfillment-stage3c");
  assert.equal(Object.keys(fixture.organizations).length, 3);
  assert.equal(Object.keys(fixture.people).length, 10);
  assert.notEqual(fixture.order("pendingValid"), fixture.order("pendingOverdue"));
  assert.notEqual(fixture.order("deliveryFailed"), fixture.order("completed"));
  assert.match(fixture.people.owner[1], /^fixture:stage3c:/);
});
