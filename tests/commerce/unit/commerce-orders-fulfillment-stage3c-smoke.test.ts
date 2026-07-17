import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCommerceOrdersFulfillmentStage3cSmokeSafety,
  COMMERCE_ORDERS_FULFILLMENT_STAGE3C_SMOKE_CONFIRMATION,
} from "../../../scripts/staging/commerce-orders-fulfillment-stage3c-smoke-safety";

const valid = {
  authBaseUrl: "https://rezno-staging.vercel.app",
  baseUrl: "https://rezno-staging-abc123-rafidedu.vercel.app",
  confirmation: COMMERCE_ORDERS_FULFILLMENT_STAGE3C_SMOKE_CONFIRMATION,
  database: "rezno_staging",
  vercelEnvironment: "preview",
};

test("Stage 3C smoke requires the exact staging database, preview origin, and auth origin", () => {
  assert.doesNotThrow(() => assertCommerceOrdersFulfillmentStage3cSmokeSafety(valid));
  assert.throws(() => assertCommerceOrdersFulfillmentStage3cSmokeSafety({ ...valid, database: "rezno_production" }));
  assert.throws(() => assertCommerceOrdersFulfillmentStage3cSmokeSafety({ ...valid, vercelEnvironment: "production" }));
  assert.throws(() => assertCommerceOrdersFulfillmentStage3cSmokeSafety({ ...valid, baseUrl: "https://rezno-staging.vercel.app" }));
  assert.throws(() => assertCommerceOrdersFulfillmentStage3cSmokeSafety({ ...valid, authBaseUrl: "https://example.com" }));
});

test("Stage 3C smoke rejects missing confirmation and non-HTTPS URLs", () => {
  assert.throws(() => assertCommerceOrdersFulfillmentStage3cSmokeSafety({ ...valid, confirmation: undefined }));
  assert.throws(() => assertCommerceOrdersFulfillmentStage3cSmokeSafety({ ...valid, baseUrl: "http://rezno-staging-abc123-rafidedu.vercel.app" }));
});
