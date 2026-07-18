import assert from "node:assert/strict";
import test from "node:test";

import { COMMERCE_ADMIN_STAGE3D_FIXTURE } from "../../../scripts/staging/commerce-admin-stage3d-seed-core";
import {
  COMMERCE_ADMIN_STAGE3D_CONFIRMATION_ENV,
  COMMERCE_ADMIN_STAGE3D_CONFIRMATION_TOKEN,
  validateCommerceAdminStage3dSeedEnvironment,
} from "../../../scripts/staging/commerce-admin-stage3d-seed-safety";
import {
  assertCommerceAdminStage3dSmokeSafety,
  COMMERCE_ADMIN_STAGE3D_SMOKE_CONFIRMATION,
} from "../../../scripts/staging/commerce-admin-stage3d-smoke-safety";

test("Stage 3D fixture requires exact confirmation and PostgreSQL staging semantics", () => {
  assert.throws(() => validateCommerceAdminStage3dSeedEnvironment({
    DATABASE_URL: "postgresql://host/rezno_staging",
  }));
  assert.throws(() => validateCommerceAdminStage3dSeedEnvironment({
    [COMMERCE_ADMIN_STAGE3D_CONFIRMATION_ENV]: COMMERCE_ADMIN_STAGE3D_CONFIRMATION_TOKEN,
    DATABASE_URL: "postgresql://host/rezno_production",
  }));
  assert.throws(() => validateCommerceAdminStage3dSeedEnvironment({
    [COMMERCE_ADMIN_STAGE3D_CONFIRMATION_ENV]: COMMERCE_ADMIN_STAGE3D_CONFIRMATION_TOKEN,
    DATABASE_URL: "mysql://host/rezno_staging",
  }));
  assert.equal(validateCommerceAdminStage3dSeedEnvironment({
    [COMMERCE_ADMIN_STAGE3D_CONFIRMATION_ENV]: COMMERCE_ADMIN_STAGE3D_CONFIRMATION_TOKEN,
    DATABASE_URL: "postgresql://host/rezno_staging",
  }).databaseUrl.includes("rezno_staging"), true);
});

test("Stage 3D fixture errors do not expose credentials", () => {
  const secret = "stage3d-secret-password";
  assert.throws(() => validateCommerceAdminStage3dSeedEnvironment({
    [COMMERCE_ADMIN_STAGE3D_CONFIRMATION_ENV]: COMMERCE_ADMIN_STAGE3D_CONFIRMATION_TOKEN,
    DATABASE_URL: `postgresql://user:${secret}@production.example.com/rezno_live`,
  }), (error: unknown) => error instanceof Error && !error.message.includes(secret));
});

test("Stage 3D deterministic fixture covers the locked Admin and Commerce matrix", () => {
  const fixture = COMMERCE_ADMIN_STAGE3D_FIXTURE;
  assert.equal(fixture.namespace, "rezno-qa-commerce-admin-stage3d");
  assert.equal(Object.keys(fixture.admins).length, 13);
  assert.equal(Object.keys(fixture.stores).length, 7);
  assert.equal(Object.keys(fixture.categories).length, 3);
  assert.equal(Object.keys(fixture.orders).length, 8);
  assert.notEqual(fixture.admins.ordersView.userId, fixture.admins.ordersManage.userId);
});

test("Stage 3D authenticated smoke is preview-only and exact-database bound", () => {
  const valid = {
    authBaseUrl: "https://rezno-stage3d-preview.vercel.app",
    baseUrl: "https://rezno-stage3d-preview.vercel.app",
    confirmation: COMMERCE_ADMIN_STAGE3D_SMOKE_CONFIRMATION,
    database: "rezno_staging",
    vercelEnvironment: "preview",
  };
  assert.doesNotThrow(() => assertCommerceAdminStage3dSmokeSafety(valid));
  assert.throws(() => assertCommerceAdminStage3dSmokeSafety({ ...valid, database: "rezno_production" }));
  assert.throws(() => assertCommerceAdminStage3dSmokeSafety({ ...valid, baseUrl: "https://rezno.app" }));
  assert.throws(() => assertCommerceAdminStage3dSmokeSafety({ ...valid, vercelEnvironment: "production" }));
});
