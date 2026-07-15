import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { ReviewDomainError } from "../../../features/reviews/domain/errors";
import {
  createOrReplayCustomerReview,
  getCustomerBookingReviewState,
  getPublicMemberReviewAggregate,
  getPublicOrganizationReviewAggregates,
  getPublicServiceReviewAggregates,
  listPublicBusinessReviews,
  moderateReview,
  respondToBusinessReview,
} from "../../../features/reviews/services/review-lifecycle";
import { prisma } from "../../../lib/db/prisma";
import {
  createBookingFixture,
  resetBookingTestData,
} from "../../bookings/helpers/booking-fixture";

function hasReviewCode(code: ReviewDomainError["code"]) {
  return (error: unknown) => error instanceof ReviewDomainError && error.code === code;
}

async function createCompletedBooking(
  fixture: Awaited<ReturnType<typeof createBookingFixture>>,
  options: {
    customerId?: string;
    memberId?: string | null;
    branchServiceId?: string;
    status?: "CANCELLED" | "COMPLETED" | "CONFIRMED" | "NO_SHOW";
  } = {},
) {
  const startsAt = new Date("2026-07-01T09:00:00.000Z");
  return prisma.booking.create({
    data: {
      organizationId: fixture.organization.id,
      branchId: fixture.branch.id,
      branchServiceId: options.branchServiceId ?? fixture.offering.id,
      customerId: options.customerId ?? fixture.customer.id,
      memberId: options.memberId === undefined ? fixture.member?.id ?? null : options.memberId,
      status: options.status ?? "COMPLETED",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      serviceNameSnapshot: fixture.service.name,
      customerNameSnapshot: "Booking Customer",
      priceSnapshot: "25000",
    },
  });
}

async function createBusinessMember(
  organizationId: string,
  systemRole: "MANAGER" | "OWNER" | "RECEPTIONIST",
) {
  const person = await prisma.person.create({
    data: {
      authUserId: `review-${systemRole.toLowerCase()}-${randomUUID()}`,
      firstName: systemRole,
      isOnboarded: true,
    },
  });
  const role = await prisma.role.create({
    data: {
      organizationId,
      name: `${systemRole}-${randomUUID()}`,
      systemRole,
      isSystem: true,
    },
  });
  return prisma.organizationMember.create({
    data: { organizationId, personId: person.id, roleId: role.id },
  });
}

test("Gate 2C review lifecycle is owner-scoped, duplicate-safe, visible, and auditable", { concurrency: false }, async (t) => {
  await resetBookingTestData();
  t.after(async () => {
    await resetBookingTestData();
    await prisma.$disconnect();
  });

  await t.test("completed owned booking derives all relations and safely replays", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const booking = await createCompletedBooking(fixture);
    const first = await createOrReplayCustomerReview({
      bookingId: booking.id,
      customerId: fixture.customer.id,
      review: { rating: 5, comment: "Excellent" },
    });
    const replay = await createOrReplayCustomerReview({
      bookingId: booking.id,
      customerId: fixture.customer.id,
      review: { rating: 5, comment: "Excellent" },
    });
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    const persisted = await prisma.review.findUniqueOrThrow({ where: { bookingId: booking.id } });
    assert.deepEqual(
      {
        customerId: persisted.customerId,
        organizationId: persisted.organizationId,
        serviceId: persisted.serviceId,
        memberId: persisted.memberId,
      },
      {
        customerId: fixture.customer.id,
        organizationId: fixture.organization.id,
        serviceId: fixture.service.id,
        memberId: fixture.member!.id,
      },
    );
    const state = await getCustomerBookingReviewState(fixture.customer.id, booking.id);
    assert.equal(state?.review?.rating, 5);
    assert.equal(state?.eligibility.reason, "ALREADY_REVIEWED");
  });

  await t.test("identical concurrency creates one row and changed duplicate conflicts", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "NONE" });
    const booking = await createCompletedBooking(fixture);
    const results = await Promise.all([
      createOrReplayCustomerReview({
        bookingId: booking.id,
        customerId: fixture.customer.id,
        review: { rating: 4, comment: null },
      }),
      createOrReplayCustomerReview({
        bookingId: booking.id,
        customerId: fixture.customer.id,
        review: { rating: 4, comment: null },
      }),
    ]);
    assert.equal(results.filter((result) => result.replayed).length, 1);
    assert.equal(await prisma.review.count({ where: { bookingId: booking.id } }), 1);
    assert.equal(await prisma.notification.count({ where: { businessId: fixture.organization.id } }), 1);
    await assert.rejects(
      createOrReplayCustomerReview({
        bookingId: booking.id,
        customerId: fixture.customer.id,
        review: { rating: 3, comment: null },
      }),
      hasReviewCode("REVIEW_CONFLICT"),
    );
  });

  await t.test("foreign, incomplete, no-show, restaurant, inactive customer, and malformed links fail closed", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "NONE" });
    const other = await createBookingFixture({ label: `review-other-${randomUUID().slice(0, 6)}`, mode: "NONE" });
    const booking = await createCompletedBooking(fixture);
    await assert.rejects(
      createOrReplayCustomerReview({ bookingId: booking.id, customerId: other.customer.id, review: { rating: 5, comment: null } }),
      hasReviewCode("NOT_FOUND"),
    );
    for (const status of ["CONFIRMED", "CANCELLED", "NO_SHOW"] as const) {
      const ineligible = await createCompletedBooking(fixture, { status });
      await assert.rejects(
        createOrReplayCustomerReview({ bookingId: ineligible.id, customerId: fixture.customer.id, review: { rating: 5, comment: null } }),
        hasReviewCode("BOOKING_NOT_REVIEWABLE"),
      );
    }
    await prisma.organization.update({ where: { id: fixture.organization.id }, data: { vertical: "CAFE" } });
    await assert.rejects(
      createOrReplayCustomerReview({ bookingId: booking.id, customerId: fixture.customer.id, review: { rating: 5, comment: null } }),
      hasReviewCode("BOOKING_NOT_REVIEWABLE"),
    );
    await prisma.organization.update({ where: { id: fixture.organization.id }, data: { vertical: "BEAUTY" } });
    const malformed = await createCompletedBooking(fixture, { branchServiceId: other.offering.id });
    await assert.rejects(
      createOrReplayCustomerReview({ bookingId: malformed.id, customerId: fixture.customer.id, review: { rating: 5, comment: null } }),
      hasReviewCode("BOOKING_NOT_REVIEWABLE"),
    );
    await prisma.person.update({ where: { id: fixture.customer.id }, data: { status: "INACTIVE" } });
    await assert.rejects(
      createOrReplayCustomerReview({ bookingId: booking.id, customerId: fixture.customer.id, review: { rating: 5, comment: null } }),
      hasReviewCode("CUSTOMER_UNAVAILABLE"),
    );
  });

  await t.test("public aggregates and cursor pagination include visible rows exactly once", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    for (const rating of [5, 4, 3]) {
      const booking = await createCompletedBooking(fixture);
      await createOrReplayCustomerReview({
        bookingId: booking.id,
        customerId: fixture.customer.id,
        review: { rating, comment: `Public ${rating}` },
      });
    }
    const hidden = await prisma.review.findFirstOrThrow({ where: { rating: 3 } });
    await prisma.review.update({ where: { id: hidden.id }, data: { status: "HIDDEN" } });
    const organizations = await getPublicOrganizationReviewAggregates([fixture.organization.id]);
    assert.equal(organizations.get(fixture.organization.id)?.reviewCount, 2);
    assert.equal(organizations.get(fixture.organization.id)?.averageRating, 4.5);
    const services = await getPublicServiceReviewAggregates([
      { organizationId: fixture.organization.id, serviceId: fixture.service.id },
    ]);
    assert.equal(services.get(`${fixture.organization.id}:${fixture.service.id}`)?.reviewCount, 2);
    assert.equal(
      (await getPublicMemberReviewAggregate(fixture.organization.id, fixture.member!.id)).reviewCount,
      2,
    );
    const first = await listPublicBusinessReviews({ slug: fixture.organization.slug, limit: 1 });
    assert.equal(first.summary.reviewCount, 2);
    assert.equal(first.reviews.length, 1);
    assert.ok(first.nextCursor);
    const second = await listPublicBusinessReviews({
      slug: fixture.organization.slug,
      cursor: first.nextCursor,
      limit: 1,
    });
    assert.equal(second.reviews.length, 1);
    assert.notEqual(second.reviews[0]?.id, first.reviews[0]?.id);
    assert.equal(second.nextCursor, null);
  });

  await t.test("owner and manager replies are tenant-scoped while staff and receptionist fail", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const booking = await createCompletedBooking(fixture);
    const created = await createOrReplayCustomerReview({
      bookingId: booking.id,
      customerId: fixture.customer.id,
      review: { rating: 5, comment: "Reply please" },
    });
    const owner = await createBusinessMember(fixture.organization.id, "OWNER");
    const manager = await createBusinessMember(fixture.organization.id, "MANAGER");
    const receptionist = await createBusinessMember(fixture.organization.id, "RECEPTIONIST");
    await respondToBusinessReview({
      organizationId: fixture.organization.id,
      replyAuthorMemberId: owner.id,
      reviewId: created.review.id,
      reply: "  Thank you  ",
    });
    await respondToBusinessReview({
      organizationId: fixture.organization.id,
      replyAuthorMemberId: manager.id,
      reviewId: created.review.id,
      reply: "Updated response",
    });
    const stored = await prisma.review.findUniqueOrThrow({ where: { id: created.review.id } });
    assert.equal(stored.businessReply, "Updated response");
    assert.equal(stored.businessReplyAuthorId, manager.id);
    for (const memberId of [fixture.member!.id, receptionist.id]) {
      await assert.rejects(
        respondToBusinessReview({
          organizationId: fixture.organization.id,
          replyAuthorMemberId: memberId,
          reviewId: created.review.id,
          reply: "Forbidden",
        }),
        hasReviewCode("FORBIDDEN"),
      );
    }
    await assert.rejects(
      respondToBusinessReview({
        organizationId: fixture.organization.id,
        replyAuthorMemberId: owner.id,
        reviewId: created.review.id,
        reply: "x".repeat(1_001),
      }),
      hasReviewCode("INVALID_REQUEST"),
    );
    const other = await createBookingFixture({ label: `reply-other-${randomUUID().slice(0, 6)}`, mode: "NONE" });
    const otherOwner = await createBusinessMember(other.organization.id, "OWNER");
    await assert.rejects(
      respondToBusinessReview({
        organizationId: other.organization.id,
        replyAuthorMemberId: otherOwner.id,
        reviewId: created.review.id,
        reply: "Cross tenant",
      }),
      hasReviewCode("NOT_FOUND"),
    );
  });

  await t.test("admin moderation is atomic, auditable, and preserves customer history", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "NONE" });
    const booking = await createCompletedBooking(fixture);
    const created = await createOrReplayCustomerReview({
      bookingId: booking.id,
      customerId: fixture.customer.id,
      review: { rating: 5, comment: "Moderate me" },
    });
    const adminUser = await prisma.user.create({
      data: { id: `admin-${randomUUID()}`, email: `${randomUUID()}@rezno.invalid`, name: "Review Admin" },
    });
    await moderateReview({ adminUserId: adminUser.id, reviewId: created.review.id, status: "HIDDEN" });
    assert.equal(
      (await getPublicOrganizationReviewAggregates([fixture.organization.id])).get(fixture.organization.id)?.reviewCount,
      0,
    );
    assert.equal(await prisma.adminAuditLog.count({ where: { targetId: created.review.id } }), 1);
    const hiddenState = await getCustomerBookingReviewState(fixture.customer.id, booking.id);
    assert.equal(hiddenState?.review?.status, "HIDDEN");
    assert.equal(hiddenState?.review?.comment, "Moderate me");
    await moderateReview({ adminUserId: adminUser.id, reviewId: created.review.id, status: "VISIBLE" });
    await assert.rejects(
      moderateReview({ adminUserId: `missing-${randomUUID()}`, reviewId: created.review.id, status: "HIDDEN" }),
    );
    assert.equal((await prisma.review.findUniqueOrThrow({ where: { id: created.review.id } })).status, "VISIBLE");
    await prisma.organization.update({ where: { id: fixture.organization.id }, data: { status: "INACTIVE", isActive: false } });
    await prisma.service.update({ where: { id: fixture.service.id }, data: { status: "INACTIVE" } });
    const historical = await getCustomerBookingReviewState(fixture.customer.id, booking.id);
    assert.equal(historical?.review?.rating, 5);
  });
});
