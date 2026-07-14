import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("mobile onboarding status endpoint is authenticated, read-only, bounded, and no-store", () => {
  const route = readFileSync(
    resolve(process.cwd(), "app/api/mobile/onboarding/customer/route.ts"),
    "utf8",
  );
  const getSection = route.slice(
    route.indexOf("export async function GET"),
    route.indexOf("export async function POST"),
  );
  const service = readFileSync(
    resolve(process.cwd(), "features/onboarding/services/customer-onboarding.ts"),
    "utf8",
  );
  const client = readFileSync(
    resolve(process.cwd(), "apps/mobile/src/api/onboarding.ts"),
    "utf8",
  );

  assert.match(getSection, /auth\.api\.getSession/);
  assert.match(getSection, /getMobileCustomerOnboardingStatus\(session\.user\.id\)/);
  assert.match(getSection, /mobile\.onboarding\.customer\.status/);
  assert.match(getSection, /limit:\s*30/);
  assert.doesNotMatch(getSection, /completeMobileCustomerOnboardingProfile/);
  assert.doesNotMatch(getSection, /request\.json/);
  assert.match(service, /select: \{ isOnboarded: true, phone: true \}/);
  assert.match(service, /authUserId, deletedAt: null, status: "ACTIVE"/);
  assert.match(client, /getMobileCustomerOnboardingStatus/);
  assert.match(client, /method:\s*"GET"/);
  assert.match(route, /"Cache-Control": "no-store, max-age=0"/);
});
