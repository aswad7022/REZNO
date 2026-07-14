import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";
import {
  createBookingFixture,
  resetBookingTestData,
} from "../helpers/booking-fixture";

const baseUrl = process.env.COMMERCE_HTTP_BASE_URL;

async function signUpAndOnboard(label: string) {
  const email = `${label}-${randomUUID().slice(0, 8)}@rezno.invalid`;
  const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email, name: label, password: "password123" }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  assert.equal(signUp.status, 200);
  const session = signUp.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="));
  assert.ok(session);
  const cookie = session.split(";")[0]!;
  const onboarding = await call("/api/mobile/onboarding/customer", {
    body: { phone: "+9647500000000" },
    cookie,
    method: "POST",
  });
  assert.equal(onboarding.response.status, 200);
  return cookie;
}

async function call(
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
    response,
    body: (await response.json()) as {
      data?: unknown;
      error?: { code: string; message: string };
    },
  };
}

test(
  "mobile booking management live HTTP contracts enforce auth, ownership, pagination, and replay",
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
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const ownerCookie = await signUpAndOnboard("gate2b-owner");
    const otherCookie = await signUpAndOnboard("gate2b-other");

    const unauthenticated = await call("/api/mobile/bookings?tab=all");
    assert.equal(unauthenticated.response.status, 401);
    assert.equal(unauthenticated.body.error?.code, "UNAUTHENTICATED");
    assert.equal(
      unauthenticated.response.headers.get("cache-control"),
      "no-store, max-age=0",
    );

    const availability = await call(
      `/api/mobile/bookings/offerings/${fixture.offering.id}/availability?date=${fixture.date}&memberId=${fixture.member!.id}`,
    );
    const slots = (availability.body.data as {
      slots: Array<{ startsAt: string; memberId: string | null }>;
    }).slots;
    assert.ok(slots.length >= 3);

    const create = async (slot: (typeof slots)[number]) => {
      const result = await call("/api/mobile/bookings", {
        body: {
          branchServiceId: fixture.offering.id,
          date: fixture.date,
          memberId: slot.memberId,
          startsAt: slot.startsAt,
        },
        cookie: ownerCookie,
        headers: { "idempotency-key": randomUUID() },
        method: "POST",
      });
      assert.equal(result.response.status, 201);
      return (result.body.data as { booking: { id: string } }).booking.id;
    };
    const cancellableId = await create(slots[0]!);
    const changeableId = await create(slots[2]!);

    const firstPage = await call("/api/mobile/bookings?tab=all&limit=1", {
      cookie: ownerCookie,
    });
    assert.equal(firstPage.response.status, 200);
    assert.equal(firstPage.response.headers.get("cache-control"), "no-store, max-age=0");
    const page = firstPage.body.data as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
      counts: { all: number };
    };
    assert.equal(page.items.length, 1);
    assert.equal(page.counts.all, 2);
    assert.ok(page.nextCursor);
    const secondPage = await call(
      `/api/mobile/bookings?tab=all&limit=1&cursor=${encodeURIComponent(page.nextCursor!)}`,
      { cookie: ownerCookie },
    );
    const second = secondPage.body.data as { items: Array<{ id: string }> };
    assert.equal(second.items.length, 1);
    assert.notEqual(second.items[0]?.id, page.items[0]?.id);

    const malformedCursor = await call(
      "/api/mobile/bookings?tab=completed&cursor=bad",
      { cookie: ownerCookie },
    );
    assert.equal(malformedCursor.response.status, 400);
    assert.equal(malformedCursor.body.error?.code, "INVALID_REQUEST");

    const ownedDetail = await call(`/api/mobile/bookings/${cancellableId}`, {
      cookie: ownerCookie,
    });
    assert.equal(ownedDetail.response.status, 200);
    const foreignDetail = await call(`/api/mobile/bookings/${cancellableId}`, {
      cookie: otherCookie,
    });
    assert.equal(foreignDetail.response.status, 404);

    const forgedCancel = await call(
      `/api/mobile/bookings/${cancellableId}/cancel`,
      {
        body: { reason: "", customerId: fixture.customer.id },
        cookie: ownerCookie,
        headers: { "idempotency-key": randomUUID() },
        method: "POST",
      },
    );
    assert.equal(forgedCancel.response.status, 400);
    assert.equal(forgedCancel.body.error?.code, "INVALID_REQUEST");

    const cancelKey = randomUUID();
    const cancel = await call(`/api/mobile/bookings/${cancellableId}/cancel`, {
      body: { reason: "Changed schedule" },
      cookie: ownerCookie,
      headers: { "idempotency-key": cancelKey },
      method: "POST",
    });
    assert.equal(cancel.response.status, 200);
    assert.equal(
      (cancel.body.data as { booking: { status: string }; replayed: boolean }).booking.status,
      "CANCELLED",
    );
    const replay = await call(`/api/mobile/bookings/${cancellableId}/cancel`, {
      body: { reason: "Changed schedule" },
      cookie: ownerCookie,
      headers: { "idempotency-key": cancelKey },
      method: "POST",
    });
    assert.equal((replay.body.data as { replayed: boolean }).replayed, true);
    const foreignCancel = await call(`/api/mobile/bookings/${changeableId}/cancel`, {
      body: { reason: "" },
      cookie: otherCookie,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(foreignCancel.response.status, 404);

    const options = await call(
      `/api/mobile/bookings/${changeableId}/reschedule-options?date=${fixture.date}&memberId=${fixture.member!.id}`,
      { cookie: ownerCookie },
    );
    assert.equal(options.response.status, 200);
    const changeSlot = (options.body.data as {
      slots: Array<{ startsAt: string; memberId: string | null }>;
    }).slots[0]!;
    assert.ok(changeSlot);
    const changeKey = randomUUID();
    const change = await call(
      `/api/mobile/bookings/${changeableId}/change-request`,
      {
        body: {
          date: fixture.date,
          memberId: changeSlot.memberId,
          startsAt: changeSlot.startsAt,
        },
        cookie: ownerCookie,
        headers: { "idempotency-key": changeKey },
        method: "POST",
      },
    );
    assert.equal(change.response.status, 201);
    assert.equal(
      (change.body.data as {
        booking: { changeRequest: { status: string; direction: string } };
      }).booking.changeRequest.status,
      "PENDING",
    );
    const changeReplay = await call(
      `/api/mobile/bookings/${changeableId}/change-request`,
      {
        body: {
          date: fixture.date,
          memberId: changeSlot.memberId,
          startsAt: changeSlot.startsAt,
        },
        cookie: ownerCookie,
        headers: { "idempotency-key": changeKey },
        method: "POST",
      },
    );
    assert.equal(changeReplay.response.status, 200);
    assert.equal((changeReplay.body.data as { replayed: boolean }).replayed, true);
  },
);
