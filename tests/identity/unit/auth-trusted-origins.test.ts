import assert from "node:assert/strict";
import test from "node:test";

import { buildAuthTrustedOrigins } from "../../../lib/auth/trusted-origins";

test("Vercel Preview origins are exact, HTTPS-only, and suffix-validated", () => {
  assert.deepEqual(buildAuthTrustedOrigins({
    BETTER_AUTH_URL: "https://rezno-staging.vercel.app",
    NODE_ENV: "production",
    VERCEL_BRANCH_URL: "rezno-staging-git-feature-rafidedu.vercel.app",
    VERCEL_URL: "rezno-staging-deployment-rafidedu.vercel.app",
  }), [
    "https://rezno-staging.vercel.app",
    "rezno://",
    "https://rezno-staging-deployment-rafidedu.vercel.app",
    "https://rezno-staging-git-feature-rafidedu.vercel.app",
  ]);

  const rejected = buildAuthTrustedOrigins({
    NODE_ENV: "production",
    VERCEL_BRANCH_URL: "https://preview.vercel.app.attacker.example",
    VERCEL_URL: "http://preview.vercel.app",
  });
  assert.deepEqual(rejected, ["rezno://"]);
});

test("development origins remain explicit and duplicate origins collapse", () => {
  assert.deepEqual(buildAuthTrustedOrigins({
    BETTER_AUTH_URL: "https://same.vercel.app",
    NODE_ENV: "development",
    VERCEL_URL: "https://same.vercel.app",
  }), [
    "https://same.vercel.app",
    "rezno://",
    "http://localhost:3000",
    "exp://",
    "exp://**",
  ]);
});
