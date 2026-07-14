import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("mobile onboarding accepts only a phone from the body and keeps auth, rate-limit, and cache boundaries", () => {
  const service = readFileSync(
    resolve(
      process.cwd(),
      "features/onboarding/services/customer-onboarding.ts",
    ),
    "utf8",
  );
  const route = readFileSync(
    resolve(process.cwd(), "app/api/mobile/onboarding/customer/route.ts"),
    "utf8",
  );
  const webAction = readFileSync(
    resolve(
      process.cwd(),
      "features/onboarding/actions/complete-onboarding.ts",
    ),
    "utf8",
  );
  const mobileClient = readFileSync(
    resolve(process.cwd(), "apps/mobile/src/api/onboarding.ts"),
    "utf8",
  );
  const mobileAuthClient = readFileSync(
    resolve(process.cwd(), "apps/mobile/src/auth/client.ts"),
    "utf8",
  );
  const mobileApiConfig = readFileSync(
    resolve(process.cwd(), "apps/mobile/src/config/api.ts"),
    "utf8",
  );

  assert.match(service, /import "server-only"/);
  assert.match(service, /completeMobileCustomerOnboardingProfile/);
  assert.match(service, /validateCustomerPhone/);
  assert.match(service, /submittedPhone === undefined \? person\.phone/);
  assert.match(service, /phone: phone\.value/);
  assert.match(service, /updateMany\(\{/);
  assert.match(service, /where: \{ authUserId, deletedAt: null, status: "ACTIVE" \}/);
  assert.match(service, /data: \{ isOnboarded: true \}/);
  assert.match(service, /result\.count !== 1/);
  assert.match(route, /auth\.api\.getSession\(\{ headers: request\.headers \}\)/);
  assert.match(
    route,
    /completeMobileCustomerOnboardingProfile\(\s*session\.user\.id,\s*phone/,
  );
  assert.match(route, /request\.json\(\)/);
  assert.match(route, /isRecord\(body\) \? body\.phone : undefined/);
  assert.doesNotMatch(route, /body\.(?:authUserId|personId|isOnboarded)/);
  assert.match(route, /CustomerOnboardingPhoneError/);
  assert.match(route, /"PHONE_REQUIRED"/);
  assert.match(route, /"PHONE_INVALID"/);
  assert.match(route, /"mobile\.onboarding\.customer"/);
  assert.match(route, /limit:\s*10/);
  assert.match(route, /windowMs:\s*60_000/);
  assert.match(route, /"Retry-After"/);
  assert.match(route, /"Cache-Control": "no-store, max-age=0"/);
  assert.match(webAction, /completeCustomerOnboardingProfile\(session\.user\.id\)/);
  assert.match(mobileClient, /authenticated:\s*true/);
  assert.match(mobileClient, /body:\s*phone === undefined \? \{\} : \{ phone \}/);
  assert.match(mobileClient, /method:\s*"POST"/);
  assert.match(mobileClient, /AbortController/);
  assert.match(mobileClient, /signal:\s*controller\.signal/);
  assert.match(mobileClient, /clearTimeout\(timeout\)/);
  assert.doesNotMatch(mobileAuthClient, /@better-auth\/expo/);
  assert.match(mobileAuthClient, /readMobileSessionCookie\(\)/);
  assert.match(mobileAuthClient, /persistMobileSessionCookies\(setCookie\)/);
  assert.match(mobileAuthClient, /timeout: MOBILE_AUTH_FLOW_TIMEOUT_MS/);
  assert.match(mobileApiConfig, /MOBILE_AUTH_FLOW_TIMEOUT_MS\s*=\s*20_000/);
});
