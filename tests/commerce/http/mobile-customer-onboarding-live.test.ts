import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";
import { resetMilestone2cTestData } from "../helpers/milestone-2c-fixture";

const baseUrl = process.env.COMMERCE_HTTP_BASE_URL;

async function signUp(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      email,
      name: email.split("@")[0],
      password: "password123",
    }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="));
  assert.ok(cookie);
  return cookie.split(";")[0]!;
}

async function request(
  path: string,
  options: { body?: unknown; cookie?: string; method?: string } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      "expo-origin": "rezno://",
    },
    method: options.method ?? "GET",
  });
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  return {
    body: (await response.json()) as Record<string, unknown>,
    response,
  };
}

async function personForEmail(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return prisma.person.findUniqueOrThrow({
    where: { authUserId: user.id },
  });
}

test(
  "mobile customer onboarding is authenticated, phone-gated, tenant-bound, idempotent, and unlocks Commerce",
  {
    concurrency: false,
    skip: baseUrl
      ? false
      : "COMMERCE_HTTP_BASE_URL is required for live route tests",
  },
  async (t) => {
    await resetMilestone2cTestData();
    t.after(async () => {
      await resetMilestone2cTestData();
      await prisma.$disconnect();
    });

    const suffix = randomUUID().slice(0, 8);
    const callerEmail = `mobile-onboarding-caller-${suffix}@rezno.invalid`;
    const untouchedEmail = `mobile-onboarding-untouched-${suffix}@rezno.invalid`;
    const inactiveEmail = `mobile-onboarding-inactive-${suffix}@rezno.invalid`;
    const callerCookie = await signUp(callerEmail);
    const untouchedCookie = await signUp(untouchedEmail);
    const inactiveCookie = await signUp(inactiveEmail);

    const unauthenticated = await request(
      "/api/mobile/onboarding/customer",
      { method: "POST" },
    );
    assert.equal(unauthenticated.response.status, 401);
    assert.equal(
      (unauthenticated.body.error as { code: string }).code,
      "UNAUTHENTICATED",
    );
    const unauthenticatedStatus = await request(
      "/api/mobile/onboarding/customer",
    );
    assert.equal(unauthenticatedStatus.response.status, 401);

    const cartBeforeOnboarding = await request(
      "/api/commerce/customer/cart",
      { cookie: callerCookie },
    );
    assert.equal(cartBeforeOnboarding.response.status, 401);

    const [caller, untouched, inactive] = await Promise.all([
      personForEmail(callerEmail),
      personForEmail(untouchedEmail),
      personForEmail(inactiveEmail),
    ]);
    assert.equal(caller.isOnboarded, false);
    assert.equal(caller.phone, null);
    assert.equal(untouched.isOnboarded, false);

    const incompleteStatus = await request(
      "/api/mobile/onboarding/customer",
      { cookie: callerCookie },
    );
    assert.equal(incompleteStatus.response.status, 200);
    assert.deepEqual(incompleteStatus.body.data, { isComplete: false });

    const missingPhone = await request("/api/mobile/onboarding/customer", {
      cookie: callerCookie,
      method: "POST",
    });
    assert.equal(missingPhone.response.status, 400);
    assert.equal(
      (missingPhone.body.error as { code: string }).code,
      "PHONE_REQUIRED",
    );

    const invalidPhone = await request("/api/mobile/onboarding/customer", {
      body: { phone: "+964-call-me" },
      cookie: callerCookie,
      method: "POST",
    });
    assert.equal(invalidPhone.response.status, 400);
    assert.equal(
      (invalidPhone.body.error as { code: string }).code,
      "PHONE_INVALID",
    );

    const completed = await request("/api/mobile/onboarding/customer", {
      body: {
        authUserId: untouched.authUserId,
        isOnboarded: true,
        personId: untouched.id,
        phone: "+964 (750) 000-0000",
      },
      cookie: callerCookie,
      method: "POST",
    });
    assert.equal(completed.response.status, 200);
    assert.deepEqual(completed.body.data, { isOnboarded: true });

    const [callerAfter, untouchedAfter] = await Promise.all([
      prisma.person.findUniqueOrThrow({ where: { id: caller.id } }),
      prisma.person.findUniqueOrThrow({ where: { id: untouched.id } }),
    ]);
    assert.equal(callerAfter.isOnboarded, true);
    assert.equal(callerAfter.phone, "+9647500000000");
    assert.equal(
      untouchedAfter.isOnboarded,
      false,
      "a forged identity body must not onboard another Person",
    );

    const completeStatus = await request(
      "/api/mobile/onboarding/customer",
      { cookie: callerCookie },
    );
    assert.equal(completeStatus.response.status, 200);
    assert.deepEqual(completeStatus.body.data, { isComplete: true });

    const untouchedStatus = await request(
      "/api/mobile/onboarding/customer",
      { cookie: untouchedCookie },
    );
    assert.equal(untouchedStatus.response.status, 200);
    assert.deepEqual(untouchedStatus.body.data, { isComplete: false });

    const replay = await request("/api/mobile/onboarding/customer", {
      cookie: callerCookie,
      method: "POST",
    });
    assert.equal(replay.response.status, 200);
    assert.deepEqual(replay.body.data, { isOnboarded: true });

    const cartAfterOnboarding = await request(
      "/api/commerce/customer/cart",
      { cookie: callerCookie },
    );
    assert.equal(cartAfterOnboarding.response.status, 200);
    assert.equal(cartAfterOnboarding.body.data, null);

    const untouchedCart = await request("/api/commerce/customer/cart", {
      cookie: untouchedCookie,
    });
    assert.equal(untouchedCart.response.status, 401);

    await prisma.person.update({
      where: { id: inactive.id },
      data: { status: "INACTIVE" },
    });
    const inactiveAttempt = await request(
      "/api/mobile/onboarding/customer",
      {
        body: { phone: "+9647500000001" },
        cookie: inactiveCookie,
        method: "POST",
      },
    );
    assert.equal(inactiveAttempt.response.status, 403);
    assert.equal(
      (inactiveAttempt.body.error as { code: string }).code,
      "PROFILE_UNAVAILABLE",
    );
    assert.equal(
      (
        await prisma.person.findUniqueOrThrow({ where: { id: inactive.id } })
      ).isOnboarded,
      false,
    );
    const inactiveStatus = await request(
      "/api/mobile/onboarding/customer",
      { cookie: inactiveCookie },
    );
    assert.equal(inactiveStatus.response.status, 403);
  },
);
