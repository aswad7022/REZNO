import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "../../../lib/db/prisma";
import {
  createBookingFixture,
  resetBookingTestData,
} from "../../bookings/helpers/booking-fixture";

const baseUrl = process.env.COMMERCE_HTTP_BASE_URL;

async function call(
  path: string,
  options: { body?: unknown; cookie?: string; method?: string } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      "expo-origin": "rezno://",
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

async function signUpAndOnboard(label: string) {
  const email = `${label}-${randomUUID().slice(0, 8)}@rezno.invalid`;
  const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email, name: label, password: "password123" }),
    headers: { "content-type": "application/json", origin: baseUrl! },
    method: "POST",
  });
  assert.equal(signUp.status, 200);
  const session = signUp.headers.getSetCookie().find((value) => value.includes("session_token="));
  assert.ok(session);
  const cookie = session.split(";")[0]!;
  const onboarding = await call("/api/mobile/onboarding/customer", {
    body: { phone: "+9647500000000" },
    cookie,
    method: "POST",
  });
  assert.equal(onboarding.response.status, 200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const person = await prisma.person.findUniqueOrThrow({ where: { authUserId: user.id } });
  return { cookie, personId: person.id };
}

async function createCompletedBooking(
  fixture: Awaited<ReturnType<typeof createBookingFixture>>,
  customerId: string,
) {
  const startsAt = new Date("2026-07-01T09:00:00.000Z");
  return prisma.booking.create({
    data: {
      organizationId: fixture.organization.id,
      branchId: fixture.branch.id,
      branchServiceId: fixture.offering.id,
      customerId,
      memberId: fixture.member?.id ?? null,
      status: "COMPLETED",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      serviceNameSnapshot: fixture.service.name,
      customerNameSnapshot: "HTTP Review Customer",
      priceSnapshot: "25000",
    },
  });
}

test(
  "mobile reviews live HTTP contracts enforce auth, strict replay, ownership, and public visibility",
  {
    concurrency: false,
    skip: baseUrl ? false : "COMMERCE_HTTP_BASE_URL is required for live route tests",
  },
  async () => {
    await resetBookingTestData();
    try {
      const fixture = await createBookingFixture({ mode: "REQUIRED" });
      const owner = await signUpAndOnboard("gate2c-owner");
      const foreign = await signUpAndOnboard("gate2c-foreign");
      const booking = await createCompletedBooking(fixture, owner.personId);

      const unauthenticated = await call(`/api/mobile/bookings/${booking.id}/review`);
      assert.equal(unauthenticated.response.status, 401);
      assert.equal(unauthenticated.body.error?.code, "UNAUTHENTICATED");
      assert.equal(unauthenticated.response.headers.get("cache-control"), "no-store, max-age=0");

      const eligible = await call(`/api/mobile/bookings/${booking.id}/review`, { cookie: owner.cookie });
      assert.equal(eligible.response.status, 200);
      assert.equal((eligible.body.data as { eligibility: { reason: string } }).eligibility.reason, "ELIGIBLE");

      const foreignState = await call(`/api/mobile/bookings/${booking.id}/review`, { cookie: foreign.cookie });
      assert.equal(foreignState.response.status, 404);
      assert.equal(foreignState.body.error?.code, "NOT_FOUND");

      for (const body of [
        { rating: 0, comment: null },
        { rating: 6, comment: null },
        { rating: 4.5, comment: null },
        { rating: 5, comment: "x".repeat(1_001) },
        { rating: 5, comment: null, status: "HIDDEN" },
      ]) {
        const invalid = await call(`/api/mobile/bookings/${booking.id}/review`, {
          body,
          cookie: owner.cookie,
          method: "POST",
        });
        assert.equal(invalid.response.status, 400);
        assert.equal(invalid.body.error?.code, "INVALID_REQUEST");
      }

      const created = await call(`/api/mobile/bookings/${booking.id}/review`, {
        body: { rating: 5, comment: "  Live review  " },
        cookie: owner.cookie,
        method: "POST",
      });
      assert.equal(created.response.status, 201);
      assert.equal((created.body.data as { review: { comment: string } }).review.comment, "Live review");
      const replay = await call(`/api/mobile/bookings/${booking.id}/review`, {
        body: { rating: 5, comment: "Live review" },
        cookie: owner.cookie,
        method: "POST",
      });
      assert.equal(replay.response.status, 200);
      assert.equal((replay.body.data as { replayed: boolean }).replayed, true);
      const conflict = await call(`/api/mobile/bookings/${booking.id}/review`, {
        body: { rating: 4, comment: "Live review" },
        cookie: owner.cookie,
        method: "POST",
      });
      assert.equal(conflict.response.status, 409);
      assert.equal(conflict.body.error?.code, "REVIEW_CONFLICT");

      const detail = await call(`/api/mobile/bookings/${booking.id}`, { cookie: owner.cookie });
      assert.equal((detail.body.data as { review: { rating: number } }).review.rating, 5);

      const secondBooking = await createCompletedBooking(fixture, owner.personId);
      const second = await call(`/api/mobile/bookings/${secondBooking.id}/review`, {
        body: { rating: 4, comment: "Second review" },
        cookie: owner.cookie,
        method: "POST",
      });
      assert.equal(second.response.status, 201);
      const publicFirst = await call(
        `/api/mobile/bookings/businesses/${fixture.organization.slug}/reviews?limit=1`,
      );
      assert.equal(publicFirst.response.status, 200);
      const page = publicFirst.body.data as {
        summary: { reviewCount: number };
        reviews: Array<{ id: string }>;
        nextCursor: string | null;
      };
      assert.equal(page.summary.reviewCount, 2);
      assert.equal(page.reviews.length, 1);
      assert.ok(page.nextCursor);
      const publicSecond = await call(
        `/api/mobile/bookings/businesses/${fixture.organization.slug}/reviews?limit=1&cursor=${encodeURIComponent(page.nextCursor!)}`,
      );
      assert.equal(publicSecond.response.status, 200);
      assert.notEqual(
        (publicSecond.body.data as { reviews: Array<{ id: string }> }).reviews[0]?.id,
        page.reviews[0]?.id,
      );
      const malformedCursor = await call(
        `/api/mobile/bookings/businesses/${fixture.organization.slug}/reviews?cursor=bad`,
      );
      assert.equal(malformedCursor.response.status, 400);
      assert.equal(malformedCursor.body.error?.code, "INVALID_CURSOR");
      const unknownQuery = await call(
        `/api/mobile/bookings/businesses/${fixture.organization.slug}/reviews?offset=1`,
      );
      assert.equal(unknownQuery.response.status, 400);
      assert.equal(unknownQuery.body.error?.code, "INVALID_REQUEST");
      const duplicateQuery = await call(
        `/api/mobile/bookings/businesses/${fixture.organization.slug}/reviews?limit=1&limit=2`,
      );
      assert.equal(duplicateQuery.response.status, 400);
      assert.equal(duplicateQuery.body.error?.code, "INVALID_REQUEST");

      await prisma.review.update({
        where: { bookingId: booking.id },
        data: { status: "HIDDEN" },
      });
      const publicHidden = await call(
        `/api/mobile/bookings/businesses/${fixture.organization.slug}/reviews`,
      );
      assert.equal(
        (publicHidden.body.data as { summary: { reviewCount: number } }).summary.reviewCount,
        1,
      );
      assert.equal(
        (publicHidden.body.data as { reviews: Array<{ comment: string }> }).reviews.some(
          (review) => review.comment === "Live review",
        ),
        false,
      );
      const customerHistory = await call(`/api/mobile/bookings/${booking.id}/review`, {
        cookie: owner.cookie,
      });
      assert.equal((customerHistory.body.data as { review: { status: string } }).review.status, "HIDDEN");
    } finally {
      await resetBookingTestData();
      await prisma.$disconnect();
    }
  },
);
