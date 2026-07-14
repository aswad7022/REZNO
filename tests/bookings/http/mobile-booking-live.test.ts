import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";
import {
  createBookingFixture,
  resetBookingTestData,
} from "../helpers/booking-fixture";

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
  options: {
    body?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
    method?: string;
  } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      "expo-origin": "rezno://",
      ...options.headers,
    },
    method: options.method ?? "GET",
  });
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  return {
    body: (await response.json()) as {
      data?: unknown;
      error?: { code: string; message: string };
    },
    response,
  };
}

test(
  "mobile Booking live HTTP contracts cover catalog, auth, create, replay, conflict, and ownership",
  {
    concurrency: false,
    skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live route tests",
  },
  async (t) => {
    await resetBookingTestData();
    t.after(async () => {
      await resetBookingTestData();
      await prisma.$disconnect();
    });
    const fixture = await createBookingFixture({ mode: "OPTIONAL" });
    const encodedSlug = encodeURIComponent(fixture.organization.slug);

    const business = await request(
      `/api/mobile/bookings/businesses/${encodedSlug}`,
    );
    assert.equal(business.response.status, 200);
    assert.match(
      business.response.headers.get("cache-control") ?? "",
      /^public, max-age=30/,
    );
    assert.equal(
      (business.body.data as { supportsServiceBooking: boolean }).supportsServiceBooking,
      true,
    );
    const services = await request(
      `/api/mobile/bookings/businesses/${encodedSlug}/services`,
    );
    assert.equal(services.response.status, 200);
    assert.deepEqual(
      (services.body.data as Array<{ id: string }>).map((item) => item.id),
      [fixture.service.id],
    );
    const branches = await request(
      `/api/mobile/bookings/businesses/${encodedSlug}/services/${fixture.service.id}/branches`,
    );
    assert.equal(branches.response.status, 200);
    assert.equal(
      (branches.body.data as Array<{ branchServiceId: string }>)[0]?.branchServiceId,
      fixture.offering.id,
    );
    const staff = await request(
      `/api/mobile/bookings/offerings/${fixture.offering.id}/staff`,
    );
    assert.equal(staff.response.status, 200);
    assert.equal(
      (staff.body.data as { staff: Array<{ id: string }> }).staff[0]?.id,
      fixture.member!.id,
    );
    const availability = await request(
      `/api/mobile/bookings/offerings/${fixture.offering.id}/availability?date=${fixture.date}`,
    );
    assert.equal(availability.response.status, 200);
    assert.equal(
      availability.response.headers.get("cache-control"),
      "no-store, max-age=0",
    );
    const slot = (
      availability.body.data as {
        slots: Array<{ memberId: string | null; startsAt: string }>;
      }
    ).slots[0]!;
    assert.ok(slot);

    const malformed = await request(
      `/api/mobile/bookings/businesses/${encodedSlug}/services/not-a-uuid/branches`,
    );
    assert.equal(malformed.response.status, 400);
    assert.equal(malformed.body.error?.code, "INVALID_REQUEST");

    const bookingBody = {
      branchServiceId: fixture.offering.id,
      date: fixture.date,
      memberId: slot.memberId,
      startsAt: slot.startsAt,
    };
    const unauthenticated = await request("/api/mobile/bookings", {
      body: bookingBody,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(unauthenticated.response.status, 401);
    assert.equal(unauthenticated.body.error?.code, "UNAUTHENTICATED");
    assert.equal(
      unauthenticated.response.headers.get("cache-control"),
      "no-store, max-age=0",
    );

    const suffix = randomUUID().slice(0, 8);
    const ownerCookie = await signUp(`booking-owner-${suffix}@rezno.invalid`);
    const otherCookie = await signUp(`booking-other-${suffix}@rezno.invalid`);
    const incomplete = await request("/api/mobile/bookings", {
      body: bookingBody,
      cookie: ownerCookie,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(incomplete.response.status, 403);
    assert.equal(incomplete.body.error?.code, "PROFILE_INCOMPLETE");

    for (const cookie of [ownerCookie, otherCookie]) {
      const onboarding = await request("/api/mobile/onboarding/customer", {
        body: { phone: "+9647500000000" },
        cookie,
        method: "POST",
      });
      assert.equal(onboarding.response.status, 200);
    }

    const forged = await request("/api/mobile/bookings", {
      body: { ...bookingBody, customerId: fixture.customer.id },
      cookie: ownerCookie,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(forged.response.status, 400);
    assert.equal(forged.body.error?.code, "INVALID_REQUEST");

    const key = randomUUID();
    const created = await request("/api/mobile/bookings", {
      body: bookingBody,
      cookie: ownerCookie,
      headers: { "idempotency-key": key },
      method: "POST",
    });
    assert.equal(created.response.status, 201);
    const createdData = created.body.data as {
      booking: { id: string; reference: string };
      replayed: boolean;
    };
    assert.equal(createdData.replayed, false);
    assert.match(createdData.booking.reference, /^RZ-/);

    const replay = await request("/api/mobile/bookings", {
      body: bookingBody,
      cookie: ownerCookie,
      headers: { "idempotency-key": key },
      method: "POST",
    });
    assert.equal(replay.response.status, 200);
    assert.equal(
      (replay.body.data as { replayed: boolean }).replayed,
      true,
    );

    const ownedDetail = await request(
      `/api/mobile/bookings/${createdData.booking.id}`,
      { cookie: ownerCookie },
    );
    assert.equal(ownedDetail.response.status, 200);
    assert.equal(
      (ownedDetail.body.data as { id: string }).id,
      createdData.booking.id,
    );
    const foreignDetail = await request(
      `/api/mobile/bookings/${createdData.booking.id}`,
      { cookie: otherCookie },
    );
    assert.equal(foreignDetail.response.status, 404);
    assert.equal(foreignDetail.body.error?.code, "NOT_FOUND");

    const conflict = await request("/api/mobile/bookings", {
      body: bookingBody,
      cookie: otherCookie,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(conflict.response.status, 409);
    assert.ok(
      conflict.body.error?.code === "SLOT_UNAVAILABLE" ||
        conflict.body.error?.code === "SLOT_CONFLICT",
    );

    const restaurant = await createBookingFixture({
      label: "gate2a-restaurant",
      mode: "NONE",
      vertical: "RESTAURANT",
    });
    const restaurantServices = await request(
      `/api/mobile/bookings/businesses/${restaurant.organization.slug}/services`,
    );
    assert.equal(restaurantServices.response.status, 409);
    assert.equal(
      restaurantServices.body.error?.code,
      "RESTAURANT_FLOW_REQUIRED",
    );
  },
);
