import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";
import {
  createRestaurantFixture,
  resetRestaurantTestData,
} from "../helpers/restaurant-fixture";

const baseUrl = process.env.COMMERCE_HTTP_BASE_URL;

async function signUp(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email, name: email.split("@")[0], password: "password123" }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(cookie);
  return cookie.split(";")[0]!;
}

async function request(
  path: string,
  options: { body?: unknown; cookie?: string; headers?: Record<string, string>; method?: string } = {},
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
    body: await response.json() as {
      data?: unknown;
      error?: { code: string; message: string };
    },
    response,
  };
}

test(
  "mobile Restaurant live HTTP contracts cover catalog, creation, management, replay, conflict, and ownership",
  {
    concurrency: false,
    skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live route tests",
  },
  async (t) => {
    await resetRestaurantTestData();
    t.after(async () => {
      await resetRestaurantTestData();
      await prisma.$disconnect();
    });
    const fixture = await createRestaurantFixture({ label: "gate2d-http", tableCapacities: [2] });
    const slug = encodeURIComponent(fixture.organization.slug);

    const business = await request(`/api/mobile/restaurant-reservations/businesses/${slug}`);
    assert.equal(business.response.status, 200);
    assert.match(business.response.headers.get("cache-control") ?? "", /^public, max-age=30/);
    assert.equal((business.body.data as { vertical: string }).vertical, "RESTAURANT");
    const branches = await request(`/api/mobile/restaurant-reservations/businesses/${slug}/branches`);
    assert.deepEqual((branches.body.data as Array<{ id: string }>).map((branch) => branch.id), [fixture.branch.id]);
    const menu = await request(`/api/mobile/restaurant-reservations/businesses/${slug}/menu`);
    assert.deepEqual(
      (menu.body.data as Array<{ items: Array<{ id: string }> }>).flatMap((category) => category.items).map((item) => item.id),
      [fixture.menuItem.id],
    );
    const availability = await request(
      `/api/mobile/restaurant-reservations/branches/${fixture.branch.id}/availability?date=${fixture.date}&guestCount=2`,
    );
    assert.equal(availability.response.status, 200);
    assert.equal(availability.response.headers.get("cache-control"), "no-store, max-age=0");
    const slot = (availability.body.data as { slots: Array<{ startsAt: string }> }).slots[0]!;
    assert.ok(slot);

    const malformed = await request(
      `/api/mobile/restaurant-reservations/branches/not-a-uuid/availability?date=${fixture.date}&guestCount=2`,
    );
    assert.equal(malformed.response.status, 400);
    assert.equal(malformed.body.error?.code, "INVALID_REQUEST");

    const createBody = {
      businessSlug: fixture.organization.slug,
      branchId: fixture.branch.id,
      date: fixture.date,
      startsAt: slot.startsAt,
      guestCount: 2,
      seatingArea: null,
      customerNote: null,
      preorderItems: [{ itemId: fixture.menuItem.id, quantity: 1 }],
    };
    const unauthenticated = await request("/api/mobile/restaurant-reservations", {
      body: createBody,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(unauthenticated.response.status, 401);
    assert.equal(unauthenticated.body.error?.code, "UNAUTHENTICATED");
    const unauthenticatedList = await request(
      "/api/mobile/restaurant-reservations?tab=all",
    );
    assert.equal(unauthenticatedList.response.status, 401);
    assert.equal(unauthenticatedList.body.error?.code, "UNAUTHENTICATED");

    const suffix = randomUUID().slice(0, 8);
    const ownerEmail = `restaurant-owner-${suffix}@rezno.invalid`;
    const otherEmail = `restaurant-other-${suffix}@rezno.invalid`;
    const ownerCookie = await signUp(ownerEmail);
    const otherCookie = await signUp(otherEmail);
    const incomplete = await request("/api/mobile/restaurant-reservations", {
      body: createBody,
      cookie: ownerCookie,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(incomplete.response.status, 403);
    assert.equal(incomplete.body.error?.code, "CUSTOMER_UNAVAILABLE");
    for (const cookie of [ownerCookie, otherCookie]) {
      const onboarding = await request("/api/mobile/onboarding/customer", {
        body: { phone: "+9647500000010" },
        cookie,
        method: "POST",
      });
      assert.equal(onboarding.response.status, 200);
    }

    for (const forbidden of [
      { customerId: fixture.customer.id },
      { tableId: fixture.tables[0]!.id },
      { price: "1" },
    ]) {
      const forged = await request("/api/mobile/restaurant-reservations", {
        body: { ...createBody, ...forbidden },
        cookie: ownerCookie,
        headers: { "idempotency-key": randomUUID() },
        method: "POST",
      });
      assert.equal(forged.response.status, 400);
      assert.equal(forged.body.error?.code, "INVALID_REQUEST");
    }

    const key = randomUUID();
    const created = await request("/api/mobile/restaurant-reservations", {
      body: createBody,
      cookie: ownerCookie,
      headers: { "idempotency-key": key },
      method: "POST",
    });
    assert.equal(created.response.status, 201);
    const createdData = created.body.data as {
      reservation: { id: string; reference: string; preorderTotal: string; startsAt: string };
      replayed: boolean;
    };
    assert.equal(createdData.replayed, false);
    assert.match(createdData.reservation.reference, /^RZR-/);
    assert.equal(createdData.reservation.preorderTotal, "12000");

    const replay = await request("/api/mobile/restaurant-reservations", {
      body: createBody,
      cookie: ownerCookie,
      headers: { "idempotency-key": key },
      method: "POST",
    });
    assert.equal(replay.response.status, 200);
    assert.equal((replay.body.data as { replayed: boolean }).replayed, true);
    const changed = await request("/api/mobile/restaurant-reservations", {
      body: { ...createBody, customerNote: "changed" },
      cookie: ownerCookie,
      headers: { "idempotency-key": key },
      method: "POST",
    });
    assert.equal(changed.response.status, 409);
    assert.equal(changed.body.error?.code, "IDEMPOTENCY_CONFLICT");

    const owned = await request(`/api/mobile/restaurant-reservations/${createdData.reservation.id}`, { cookie: ownerCookie });
    assert.equal(owned.response.status, 200);
    assert.equal(owned.response.headers.get("cache-control"), "no-store, max-age=0");
    const foreign = await request(`/api/mobile/restaurant-reservations/${createdData.reservation.id}`, { cookie: otherCookie });
    assert.equal(foreign.response.status, 404);
    assert.equal(foreign.body.error?.code, "NOT_FOUND");

    const capacityConflict = await request("/api/mobile/restaurant-reservations", {
      body: createBody,
      cookie: otherCookie,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(capacityConflict.response.status, 409);
    assert.equal(capacityConflict.body.error?.code, "TABLE_CONFLICT");

    const remainingAvailability = await request(
      `/api/mobile/restaurant-reservations/branches/${fixture.branch.id}/availability?date=${fixture.date}&guestCount=2`,
    );
    const secondSlot = (
      remainingAvailability.body.data as { slots: Array<{ startsAt: string }> }
    ).slots[0]!;
    assert.ok(secondSlot);
    const secondCreated = await request("/api/mobile/restaurant-reservations", {
      body: { ...createBody, startsAt: secondSlot.startsAt },
      cookie: ownerCookie,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(secondCreated.response.status, 201);
    const secondBookingId = (
      secondCreated.body.data as { reservation: { id: string } }
    ).reservation.id;

    const list = await request(
      "/api/mobile/restaurant-reservations?tab=upcoming&limit=1",
      { cookie: ownerCookie },
    );
    assert.equal(list.response.status, 200);
    assert.equal(list.response.headers.get("cache-control"), "no-store, max-age=0");
    const listData = list.body.data as {
      counts: { all: number; upcoming: number };
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    assert.equal(listData.counts.all, 2);
    assert.equal(listData.counts.upcoming, 2);
    assert.equal(listData.items.length, 1);
    assert.ok(listData.nextCursor);
    const secondPage = await request(
      `/api/mobile/restaurant-reservations?tab=upcoming&limit=1&cursor=${encodeURIComponent(listData.nextCursor)}`,
      { cookie: ownerCookie },
    );
    const secondPageData = secondPage.body.data as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    assert.equal(secondPage.response.status, 200);
    assert.equal(secondPageData.items.length, 1);
    assert.equal(secondPageData.nextCursor, null);
    assert.deepEqual(
      new Set([...listData.items, ...secondPageData.items].map((item) => item.id)),
      new Set([createdData.reservation.id, secondBookingId]),
    );

    const foreignCancel = await request(
      `/api/mobile/restaurant-reservations/${createdData.reservation.id}/cancel`,
      {
        body: { reason: "forged" },
        cookie: otherCookie,
        headers: { "idempotency-key": randomUUID() },
        method: "POST",
      },
    );
    assert.equal(foreignCancel.response.status, 404);
    assert.equal(foreignCancel.body.error?.code, "NOT_FOUND");

    await prisma.organizationSettings.update({
      where: { organizationId: fixture.organization.id },
      data: { cancellationWindowHours: 1_000 },
    });
    const deadlineOptions = await request(
      `/api/mobile/restaurant-reservations/${createdData.reservation.id}/reschedule-options?date=${fixture.date}&guestCount=2`,
      { cookie: ownerCookie },
    );
    assert.equal(deadlineOptions.response.status, 409);
    assert.equal(
      deadlineOptions.body.error?.code,
      "CANCELLATION_DEADLINE_PASSED",
    );
    await prisma.organizationSettings.update({
      where: { organizationId: fixture.organization.id },
      data: { cancellationWindowHours: 24 },
    });

    const options = await request(
      `/api/mobile/restaurant-reservations/${createdData.reservation.id}/reschedule-options?date=${fixture.date}&guestCount=2`,
      { cookie: ownerCookie },
    );
    assert.equal(options.response.status, 200);
    const nextSlot = (options.body.data as { slots: Array<{ startsAt: string }> }).slots[0]!;
    assert.ok(nextSlot);
    assert.notEqual(nextSlot.startsAt, createdData.reservation.startsAt);
    const rescheduleBody = {
      date: fixture.date,
      startsAt: nextSlot.startsAt,
      guestCount: 2,
      seatingArea: null,
      customerNote: "Moved through live HTTP",
    };
    const malformedReschedule = await request(
      `/api/mobile/restaurant-reservations/${createdData.reservation.id}/reschedule`,
      {
        body: { ...rescheduleBody, tableId: fixture.tables[0]!.id },
        cookie: ownerCookie,
        headers: { "idempotency-key": randomUUID() },
        method: "POST",
      },
    );
    assert.equal(malformedReschedule.response.status, 400);
    assert.equal(malformedReschedule.body.error?.code, "INVALID_REQUEST");
    const noCapacityReschedule = await request(
      `/api/mobile/restaurant-reservations/${createdData.reservation.id}/reschedule`,
      {
        body: { ...rescheduleBody, guestCount: 3 },
        cookie: ownerCookie,
        headers: { "idempotency-key": randomUUID() },
        method: "POST",
      },
    );
    assert.equal(noCapacityReschedule.response.status, 409);
    assert.equal(noCapacityReschedule.body.error?.code, "CAPACITY_UNAVAILABLE");
    const rescheduleKey = randomUUID();
    const rescheduled = await request(
      `/api/mobile/restaurant-reservations/${createdData.reservation.id}/reschedule`,
      {
        body: rescheduleBody,
        cookie: ownerCookie,
        headers: { "idempotency-key": rescheduleKey },
        method: "POST",
      },
    );
    assert.equal(rescheduled.response.status, 200);
    const rescheduledData = rescheduled.body.data as {
      replayed: boolean;
      reservation: { startsAt: string };
    };
    assert.equal(rescheduledData.replayed, false);
    const rescheduleReplay = await request(
      `/api/mobile/restaurant-reservations/${createdData.reservation.id}/reschedule`,
      {
        body: rescheduleBody,
        cookie: ownerCookie,
        headers: { "idempotency-key": rescheduleKey },
        method: "POST",
      },
    );
    assert.equal(rescheduleReplay.response.status, 200);
    assert.equal((rescheduleReplay.body.data as { replayed: boolean }).replayed, true);
    const changedReschedule = await request(
      `/api/mobile/restaurant-reservations/${createdData.reservation.id}/reschedule`,
      {
        body: { ...rescheduleBody, customerNote: "changed" },
        cookie: ownerCookie,
        headers: { "idempotency-key": rescheduleKey },
        method: "POST",
      },
    );
    assert.equal(changedReschedule.response.status, 409);
    assert.equal(changedReschedule.body.error?.code, "IDEMPOTENCY_CONFLICT");

    const cancelKey = randomUUID();
    const cancelled = await request(
      `/api/mobile/restaurant-reservations/${createdData.reservation.id}/cancel`,
      {
        body: { reason: "Live HTTP cancellation" },
        cookie: ownerCookie,
        headers: { "idempotency-key": cancelKey },
        method: "POST",
      },
    );
    assert.equal(cancelled.response.status, 200);
    assert.equal(
      (cancelled.body.data as { reservation: { status: string }; replayed: boolean })
        .reservation.status,
      "CANCELLED",
    );
    const cancelReplay = await request(
      `/api/mobile/restaurant-reservations/${createdData.reservation.id}/cancel`,
      {
        body: { reason: "Live HTTP cancellation" },
        cookie: ownerCookie,
        headers: { "idempotency-key": cancelKey },
        method: "POST",
      },
    );
    assert.equal(cancelReplay.response.status, 200);
    assert.equal((cancelReplay.body.data as { replayed: boolean }).replayed, true);
    const releasedAvailability = await request(
      `/api/mobile/restaurant-reservations/branches/${fixture.branch.id}/availability?date=${fixture.date}&guestCount=2`,
    );
    assert.equal(releasedAvailability.response.status, 200);
    assert.equal(
      (
        releasedAvailability.body.data as {
          slots: Array<{ startsAt: string }>;
        }
      ).slots.some(
        (candidate) => candidate.startsAt === rescheduledData.reservation.startsAt,
      ),
      true,
    );

    const unavailableMenu = await createRestaurantFixture({ label: "gate2d-http-menu" });
    const unavailableAvailability = await request(
      `/api/mobile/restaurant-reservations/branches/${unavailableMenu.branch.id}/availability?date=${unavailableMenu.date}&guestCount=2`,
    );
    const unavailableSlot = (unavailableAvailability.body.data as { slots: Array<{ startsAt: string }> }).slots[0]!;
    const menuConflict = await request("/api/mobile/restaurant-reservations", {
      body: {
        ...createBody,
        businessSlug: unavailableMenu.organization.slug,
        branchId: unavailableMenu.branch.id,
        date: unavailableMenu.date,
        startsAt: unavailableSlot.startsAt,
        preorderItems: [{ itemId: unavailableMenu.unavailableMenuItem.id, quantity: 1 }],
      },
      cookie: ownerCookie,
      headers: { "idempotency-key": randomUUID() },
      method: "POST",
    });
    assert.equal(menuConflict.response.status, 409);
    assert.equal(menuConflict.body.error?.code, "MENU_ITEM_UNAVAILABLE");

    const generic = await createRestaurantFixture({ label: "gate2d-http-generic", vertical: "BEAUTY" });
    const genericResponse = await request(`/api/mobile/restaurant-reservations/businesses/${generic.organization.slug}`);
    assert.equal(genericResponse.response.status, 409);
    assert.equal(genericResponse.body.error?.code, "RESTAURANT_FLOW_REQUIRED");

    const ownerUser = await prisma.user.findUniqueOrThrow({
      where: { email: ownerEmail },
    });
    const ownerPerson = await prisma.person.findUniqueOrThrow({
      where: { authUserId: ownerUser.id },
    });
    const genericCategory = await prisma.category.create({
      data: { name: `HTTP Generic ${suffix}`, slug: `http-generic-${suffix}` },
    });
    const genericService = await prisma.service.create({
      data: {
        categoryId: genericCategory.id,
        name: "HTTP generic service",
        organizationId: fixture.organization.id,
      },
    });
    const genericOffering = await prisma.branchService.create({
      data: {
        branchId: fixture.branch.id,
        durationMinutes: 30,
        price: "1000",
        serviceId: genericService.id,
      },
    });
    const genericBooking = await prisma.booking.create({
      data: {
        branchId: fixture.branch.id,
        branchServiceId: genericOffering.id,
        customerId: ownerPerson.id,
        customerNameSnapshot: "HTTP owner",
        endsAt: new Date(Date.now() + 10 * 86_400_000 + 30 * 60_000),
        organizationId: fixture.organization.id,
        priceSnapshot: "1000",
        serviceNameSnapshot: "HTTP generic service",
        startsAt: new Date(Date.now() + 10 * 86_400_000),
      },
    });
    const genericDetail = await request(
      `/api/mobile/restaurant-reservations/${genericBooking.id}`,
      { cookie: ownerCookie },
    );
    assert.equal(genericDetail.response.status, 404);
    assert.equal(genericDetail.body.error?.code, "NOT_FOUND");
    const genericCancel = await request(
      `/api/mobile/restaurant-reservations/${genericBooking.id}/cancel`,
      {
        body: { reason: null },
        cookie: ownerCookie,
        headers: { "idempotency-key": randomUUID() },
        method: "POST",
      },
    );
    assert.equal(genericCancel.response.status, 404);
    assert.equal(genericCancel.body.error?.code, "NOT_FOUND");
  },
);
