import assert from "node:assert/strict";
import test from "node:test";

import type { BookingStatus } from "@prisma/client";

import { BusinessOperationsError } from "../../../features/business-operations/domain/errors";
import { getBusinessOperationalAnalytics } from "../../../features/business-operations/services/analytics";
import { getBusinessOverview } from "../../../features/dashboard/services/business-overview";
import { getBusinessReadiness } from "../../../features/dashboard/services/business-setup";
import { prisma } from "../../../lib/db/prisma";
import {
  createBusinessOperationsFixture,
  resetBusinessOperationsTestData,
} from "../helpers/business-operations-fixture";

const snapshotAt = new Date("2026-07-16T12:00:00.000Z");

function denied(...codes: BusinessOperationsError["code"][]) {
  return (error: unknown) =>
    error instanceof BusinessOperationsError && codes.includes(error.code);
}

async function booking(input: {
  branchId: string;
  branchServiceId?: string;
  customerId: string;
  memberId?: string;
  organizationId: string;
  serviceName?: string;
  startsAt: string;
  status: BookingStatus;
}) {
  const startsAt = new Date(input.startsAt);
  return prisma.booking.create({
    data: {
      branchId: input.branchId,
      branchServiceId: input.branchServiceId,
      customerId: input.customerId,
      customerNameSnapshot: "STAGE2D-CUSTOMER-PII-SENTINEL",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      memberId: input.memberId,
      organizationId: input.organizationId,
      priceSnapshot: "25000",
      serviceNameSnapshot: input.serviceName ?? "Stage 2D Service",
      startsAt,
      status: input.status,
    },
  });
}

async function makeBeautyReady(
  fixture: Awaited<ReturnType<typeof createBusinessOperationsFixture>>,
) {
  await Promise.all([
    prisma.organization.update({
      where: { id: fixture.organizationA.id },
      data: { vertical: "BEAUTY" },
    }),
    prisma.businessProfile.update({
      where: { organizationId: fixture.organizationA.id },
      data: {
        businessCategory: "Beauty",
        businessPhone: "+9647500000200",
        coverImageUrl: "https://example.test/cover.jpg",
        description: "Stage 2D ready business",
        logoUrl: "https://example.test/logo.jpg",
      },
    }),
    prisma.branch.update({
      where: { id: fixture.activeBranch.id },
      data: { timezone: "Asia/Baghdad" },
    }),
  ]);
  await prisma.branchAssignment.create({
    data: { branchId: fixture.activeBranch.id, memberId: fixture.staff.membership.id },
  });
  await prisma.serviceStaffAssignment.create({
    data: { memberId: fixture.staff.membership.id, serviceId: fixture.service.id },
  });
  await prisma.availability.create({
    data: {
      branchId: fixture.activeBranch.id,
      dayOfWeek: 4,
      endTime: "17:00",
      isActive: true,
      memberId: fixture.staff.membership.id,
      startTime: "09:00",
    },
  });
}

test("Stage 2D role-scoped overview and readiness are tenant-safe", { concurrency: false }, async (t) => {
  await resetBusinessOperationsTestData();
  t.after(async () => {
    await resetBusinessOperationsTestData();
    await prisma.$disconnect();
  });
  const fixture = await createBusinessOperationsFixture("stage2d-overview");
  await makeBeautyReady(fixture);

  const staffToday = await booking({
    branchId: fixture.activeBranch.id,
    branchServiceId: fixture.offering.id,
    customerId: fixture.customer.id,
    memberId: fixture.staff.membership.id,
    organizationId: fixture.organizationA.id,
    startsAt: "2026-07-16T10:00:00.000Z",
    status: "CONFIRMED",
  });
  await booking({
    branchId: fixture.activeBranch.id,
    branchServiceId: fixture.offering.id,
    customerId: fixture.customer.id,
    memberId: fixture.manager.membership.id,
    organizationId: fixture.organizationA.id,
    startsAt: "2026-07-16T09:00:00.000Z",
    status: "NO_SHOW",
  });
  await booking({
    branchId: fixture.inactiveBranch.id,
    customerId: fixture.customer.id,
    organizationId: fixture.organizationA.id,
    startsAt: "2026-07-16T08:00:00.000Z",
    status: "CONFIRMED",
  });
  const staffUpcoming = await booking({
    branchId: fixture.activeBranch.id,
    branchServiceId: fixture.offering.id,
    customerId: fixture.customer.id,
    memberId: fixture.staff.membership.id,
    organizationId: fixture.organizationA.id,
    startsAt: "2026-07-17T08:00:00.000Z",
    status: "PENDING",
  });
  await booking({
    branchId: fixture.activeBranch.id,
    branchServiceId: fixture.offering.id,
    customerId: fixture.customer.id,
    memberId: fixture.staff.membership.id,
    organizationId: fixture.organizationA.id,
    startsAt: "2026-07-14T08:00:00.000Z",
    status: "COMPLETED",
  });
  const reviewedBooking = await booking({
    branchId: fixture.activeBranch.id,
    branchServiceId: fixture.offering.id,
    customerId: fixture.customer.id,
    organizationId: fixture.organizationA.id,
    startsAt: "2026-07-13T08:00:00.000Z",
    status: "COMPLETED",
  });
  await Promise.all([
    prisma.bookingChangeRequest.create({
      data: {
        bookingId: staffUpcoming.id,
        createdAt: new Date("2026-07-16T10:00:00.000Z"),
        proposedEndsAt: new Date("2026-07-17T10:30:00.000Z"),
        proposedStartsAt: new Date("2026-07-17T10:00:00.000Z"),
        requestedByPersonId: fixture.customer.id,
        status: "PENDING",
      },
    }),
    prisma.review.create({
      data: {
        bookingId: reviewedBooking.id,
        comment: "STAGE2D-REVIEW-SENTINEL",
        createdAt: new Date("2026-07-15T10:00:00.000Z"),
        customerId: fixture.customer.id,
        organizationId: fixture.organizationA.id,
        rating: 5,
        serviceId: fixture.service.id,
        status: "VISIBLE",
      },
    }),
    prisma.notification.create({
      data: {
        audience: "BUSINESS",
        body: "STAGE2D-NOTIFICATION-SENTINEL",
        businessId: fixture.organizationA.id,
        createdAt: new Date("2026-07-16T11:00:00.000Z"),
        title: "Operational update",
      },
    }),
    prisma.notification.create({
      data: {
        audience: "BUSINESS",
        body: "FOREIGN-NOTIFICATION-SENTINEL",
        businessId: fixture.organizationB.id,
        createdAt: new Date("2026-07-16T11:00:00.000Z"),
        title: "Foreign update",
      },
    }),
  ]);

  const owner = await getBusinessOverview(fixture.owner.reference, snapshotAt);
  assert.equal(owner.scope, "MANAGEMENT");
  if (owner.scope !== "MANAGEMENT") return;
  assert.equal(owner.metrics.todayActive, 1);
  assert.equal(owner.metrics.noShowsToday, 1);
  assert.equal(owner.metrics.pendingConfirmations, 1);
  assert.equal(owner.metrics.pendingChangeRequests, 1);
  assert.equal(owner.metrics.reviewsAwaitingReply, 1);
  assert.equal(owner.metrics.operationalUpdatesLast24Hours, 1);
  assert.equal(owner.metrics.activeBranches, 1);
  assert.equal(owner.metrics.activeServices, 1);
  assert.equal(owner.readiness.status, "ready");
  assert.equal(owner.recentBookings[0]?.id, staffUpcoming.id);
  assert.equal(JSON.stringify(owner).includes("STAGE2D-CUSTOMER-PII-SENTINEL"), false);

  const manager = await getBusinessOverview(fixture.manager.reference, snapshotAt);
  assert.equal(manager.scope, "MANAGEMENT");
  if (manager.scope === "MANAGEMENT") {
    assert.equal(manager.quickActions.some((action) => action.key === "audit"), false);
  }

  const receptionist = await getBusinessOverview(
    fixture.receptionist.reference,
    snapshotAt,
  );
  assert.deepEqual(receptionist.scope, "RECEPTIONIST");
  if (receptionist.scope === "RECEPTIONIST") {
    assert.equal(receptionist.metrics.todayActive, 1);
    assert.equal("readiness" in receptionist, false);
    assert.equal("activeBranches" in receptionist.metrics, false);
  }

  const staff = await getBusinessOverview(fixture.staff.reference, snapshotAt);
  assert.equal(staff.scope, "STAFF_SELF");
  if (staff.scope === "STAFF_SELF") {
    assert.equal(staff.metrics.ownToday, 1);
    assert.equal(staff.metrics.ownUpcoming, 1);
    assert.equal(staff.metrics.ownCompletedLast7Days, 1);
    assert.deepEqual(staff.recentBookings.map((item) => item.id), [staffUpcoming.id]);
    const payload = JSON.stringify(staff);
    for (const forbidden of [
      "organizationName",
      "readiness",
      "activeBranches",
      "activeServices",
      "activeWorkforce",
      "customerEmail",
      "customerPhone",
      "cancellationReason",
      "notes",
      fixture.manager.membership.id,
      "STAGE2D-CUSTOMER-PII-SENTINEL",
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  }

  const switched = await getBusinessOverview(fixture.ownerB.reference, snapshotAt);
  assert.equal(switched.scope, "MANAGEMENT");
  if (switched.scope === "MANAGEMENT") {
    assert.equal(switched.metrics.todayActive, 0);
    assert.equal(switched.metrics.operationalUpdatesLast24Hours, 1);
  }
  await assert.rejects(
    getBusinessOverview(fixture.revoked.reference, snapshotAt),
    denied("MEMBERSHIP_UNAVAILABLE"),
  );
  await prisma.person.update({
    where: { id: fixture.staff.person.id },
    data: { deletedAt: snapshotAt },
  });
  await assert.rejects(
    getBusinessOverview(fixture.staff.reference, snapshotAt),
    denied("MEMBERSHIP_UNAVAILABLE"),
  );

  assert.equal(staffToday.id.length > 0, true);
});

test("Stage 2D readiness proves REQUIRED workforce and Restaurant public state", { concurrency: false }, async () => {
  await resetBusinessOperationsTestData();
  const fixture = await createBusinessOperationsFixture("stage2d-readiness");
  await makeBeautyReady(fixture);
  await prisma.service.update({
    where: { id: fixture.service.id },
    data: { staffSelectionMode: "REQUIRED" },
  });
  assert.equal((await getBusinessReadiness(fixture.owner.reference)).status, "ready");

  await prisma.availability.deleteMany({
    where: { memberId: fixture.staff.membership.id },
  });
  let readiness = await getBusinessReadiness(fixture.owner.reference);
  assert.equal(readiness.checks.employee, false);
  assert.equal(readiness.status, "almost");

  await prisma.availability.create({
    data: {
      branchId: fixture.activeBranch.id,
      dayOfWeek: 4,
      endTime: "17:00",
      memberId: fixture.staff.membership.id,
      startTime: "09:00",
    },
  });
  await prisma.businessHour.deleteMany({
    where: { branchId: fixture.activeBranch.id, dayOfWeek: 6 },
  });
  readiness = await getBusinessReadiness(fixture.owner.reference);
  assert.equal(readiness.checks.hours, false);
  await prisma.businessHour.create({
    data: {
      branchId: fixture.activeBranch.id,
      closeTime: "20:00",
      dayOfWeek: 6,
      openTime: "09:00",
    },
  });
  await prisma.branchService.update({
    where: { id: fixture.offering.id },
    data: { isAvailable: false },
  });
  readiness = await getBusinessReadiness(fixture.owner.reference);
  assert.equal(readiness.checks.offering, false);
  assert.equal(readiness.checks.employee, false);

  await prisma.organization.update({
    where: { id: fixture.organizationA.id },
    data: { vertical: "RESTAURANT" },
  });
  const category = await prisma.menuCategory.create({
    data: { businessId: fixture.organizationA.id, isActive: true, name: "Ready menu" },
  });
  const item = await prisma.menuItem.create({
    data: {
      businessId: fixture.organizationA.id,
      isAvailable: true,
      menuCategoryId: category.id,
      name: "Ready item",
      price: "10000",
    },
  });
  readiness = await getBusinessReadiness(fixture.owner.reference);
  assert.equal(readiness.status, "ready");
  await prisma.restaurantTable.update({
    where: { id: fixture.table.id },
    data: { isActive: false },
  });
  await prisma.menuItem.update({ where: { id: item.id }, data: { isAvailable: false } });
  readiness = await getBusinessReadiness(fixture.owner.reference);
  assert.equal(readiness.checks.table, false);
  assert.equal(readiness.checks.menuItem, false);
  await assert.rejects(
    getBusinessReadiness(fixture.receptionist.reference),
    denied("FORBIDDEN"),
  );
});

test("Stage 2D analytics are bounded, historical, zero-safe, and management-only", { concurrency: false }, async () => {
  await resetBusinessOperationsTestData();
  const fixture = await createBusinessOperationsFixture("stage2d-analytics");
  await makeBeautyReady(fixture);
  const secondBranch = await prisma.branch.create({
    data: {
      businessHours: {
        create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          closeTime: "18:00",
          dayOfWeek,
          openTime: "09:00",
        })),
      },
      name: "Istanbul active branch",
      organizationId: fixture.organizationA.id,
      slug: "istanbul-active",
      timezone: "Europe/Istanbul",
    },
  });
  await prisma.branchAssignment.create({
    data: { branchId: secondBranch.id, memberId: fixture.staff.membership.id },
  });

  const rows = [
    [fixture.activeBranch.id, "2026-07-15T08:00:00.000Z", "COMPLETED", "Haircut"],
    [fixture.activeBranch.id, "2026-07-14T08:00:00.000Z", "COMPLETED", "Haircut"],
    [secondBranch.id, "2026-07-13T08:00:00.000Z", "CANCELLED", "Color"],
    [secondBranch.id, "2026-07-12T08:00:00.000Z", "NO_SHOW", "Color"],
    [fixture.inactiveBranch.id, "2026-07-11T08:00:00.000Z", "CONFIRMED", "Historical Service"],
  ] as const;
  for (const [branchId, startsAt, status, serviceName] of rows) {
    await booking({
      branchId,
      customerId: fixture.customer.id,
      memberId: fixture.staff.membership.id,
      organizationId: fixture.organizationA.id,
      serviceName,
      startsAt,
      status,
    });
  }
  const restaurantBooking = await booking({
    branchId: fixture.activeBranch.id,
    customerId: fixture.customer.id,
    organizationId: fixture.organizationA.id,
    serviceName: "Restaurant reservation",
    startsAt: "2026-07-10T08:00:00.000Z",
    status: "PENDING",
  });
  await prisma.restaurantReservationDetails.create({
    data: {
      bookingId: restaurantBooking.id,
      branchId: fixture.activeBranch.id,
      businessId: fixture.organizationA.id,
      guestCount: 3,
      reservationDateTime: restaurantBooking.startsAt,
      tableId: fixture.table.id,
    },
  });
  await booking({
    branchId: fixture.branchB.id,
    customerId: fixture.customer.id,
    organizationId: fixture.organizationB.id,
    serviceName: "FOREIGN-ANALYTICS-SENTINEL",
    startsAt: "2026-07-15T08:00:00.000Z",
    status: "COMPLETED",
  });

  const analytics = await getBusinessOperationalAnalytics(
    fixture.owner.reference,
    "7",
    snapshotAt,
  );
  assert.equal(analytics.metrics.totalBookings, 6);
  assert.equal(analytics.metrics.genericBookings, 5);
  assert.equal(analytics.metrics.restaurantReservations, 1);
  assert.equal(analytics.metrics.restaurantGuests, 3);
  assert.equal(analytics.statusDistribution.COMPLETED, 2);
  assert.equal(analytics.statusDistribution.CANCELLED, 1);
  assert.equal(analytics.metrics.completionRate, 33.33);
  assert.equal(analytics.dailyBookings.length, 7);
  assert.equal(analytics.dailyBookings.reduce((sum, day) => sum + day.count, 0), 6);
  assert.equal(analytics.topServices[0]?.name, "Color");
  assert.ok(analytics.branches.some((row) => row.id === fixture.inactiveBranch.id));
  assert.equal(analytics.staffWorkload[0]?.id, fixture.staff.membership.id);
  const payload = JSON.stringify(analytics);
  assert.equal(payload.includes("FOREIGN-ANALYTICS-SENTINEL"), false);
  assert.equal(payload.includes("STAGE2D-CUSTOMER-PII-SENTINEL"), false);
  for (const key of ["customer", "phone", "email", "notes", "cancellationReason", "priceSnapshot"]) {
    assert.equal(payload.includes(key), false, key);
  }

  const thirty = await getBusinessOperationalAnalytics(
    fixture.manager.reference,
    "30",
    snapshotAt,
  );
  assert.equal(thirty.dailyBookings.length, 30);
  const zero = await getBusinessOperationalAnalytics(
    fixture.ownerB.reference,
    "7",
    new Date("2026-06-01T12:00:00.000Z"),
  );
  assert.equal(zero.metrics.totalBookings, 0);
  assert.equal(zero.metrics.completionRate, 0);
  assert.equal(zero.metrics.cancellationRate, 0);
  assert.equal(zero.metrics.noShowRate, 0);
  for (const reference of [fixture.receptionist.reference, fixture.staff.reference]) {
    await assert.rejects(
      getBusinessOperationalAnalytics(reference, "7", snapshotAt),
      denied("FORBIDDEN"),
    );
  }
});
