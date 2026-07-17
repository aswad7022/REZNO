import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCommerceStage3aSmokeSafety,
  COMMERCE_STAGE3A_SMOKE_CONFIRMATION,
} from "../../../scripts/staging/commerce-merchant-store-stage3a-smoke-safety";

const valid = {
  authBaseUrl: "https://rezno-staging.vercel.app",
  baseUrl: "https://rezno-staging-abc123-rafidedu.vercel.app",
  confirmation: COMMERCE_STAGE3A_SMOKE_CONFIRMATION,
  database: "rezno_staging",
  vercelEnvironment: "preview",
};

test("Stage 3A staging smoke safety accepts only the exact isolated staging envelope", () => {
  assert.doesNotThrow(() => assertCommerceStage3aSmokeSafety(valid));
});

test("Stage 3A staging smoke safety rejects production and unrelated databases", () => {
  for (const override of [
    { baseUrl: "https://rezno-staging.vercel.app" },
    { baseUrl: "https://rezno.vercel.app" },
    { authBaseUrl: "https://rezno.vercel.app" },
    { database: "rezno" },
    { database: "rezno_test" },
    { vercelEnvironment: "production" },
    { confirmation: "wrong" },
  ]) {
    assert.throws(() => assertCommerceStage3aSmokeSafety({ ...valid, ...override }));
  }
});
