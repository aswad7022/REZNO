import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { BookingDomainError } from "../../../features/bookings/domain/errors";
import { getPublicBookingAvailability } from "../../../features/bookings/services/booking-availability";
import {
  getPublicBookingBusiness,
  getPublicBookingServices,
  getPublicOfferingStaff,
  getPublicServiceBranches,
} from "../../../features/bookings/services/booking-catalog";
import { createCustomerBooking } from "../../../features/bookings/services/booking-creation";
import { getBookingDetailForCustomer } from "../../../features/bookings/services/booking-detail";
import { getBookingSlotResult } from "../../../features/bookings/services/slots";
import { prisma } from "../../../lib/db/prisma";
import {
  BOOKING_QA_FIXTURE,
  seedBookingQaFixture,
} from "../../../scripts/staging/booking-qa-seed-core";
import {
  createBookingFixture,
  futureLocalDate,
  resetBookingTestData,
} from "../helpers/booking-fixture";

function expectBookingCode(code: BookingDomainError["code"]) {
  return (error: unknown) =>
    error instanceof BookingDomainError && error.code === code;
}

async function availableSelection(
  fixture: Awaited<ReturnType<typeof createBookingFixture>>,
  requestedMemberId: string | null = fixture.member?.id ?? null,
) {
  const availability = await getPublicBookingAvailability({
    branchServiceId: fixture.offering.id,
    date: fixture.date,
    memberId: requestedMemberId,
  });
  assert.ok(availability.slots.length > 0, availability.reason);
  const slot = availability.slots[0]!;
  return {
    branchServiceId: fixture.offering.id,
    date: fixture.date,
    memberId: slot.memberId,
    startsAt: slot.startsAt,
  };
}

type BookingFixture = Awaited<ReturnType<typeof createBookingFixture>>;

async function createAdditionalStaff(
  fixture: BookingFixture,
  options: {
    assignToService?: boolean;
    memberDeletedAt?: Date | null;
    memberStatus?: "ACTIVE" | "INACTIVE";
    personDeletedAt?: Date | null;
    personStatus?: "ACTIVE" | "INACTIVE";
  } = {},
) {
  assert.ok(fixture.member, "Additional staff require a staffed fixture");
  const person = await prisma.person.create({
    data: {
      authUserId: `assignment-policy-${randomUUID()}`,
      deletedAt: options.personDeletedAt ?? null,
      firstName: `Policy ${randomUUID().slice(0, 6)}`,
      isOnboarded: true,
      status: options.personStatus ?? "ACTIVE",
      timezone: fixture.branch.timezone,
    },
  });
  const dayOfWeek = new Date(`${fixture.date}T12:00:00.000Z`).getUTCDay();
  const member = await prisma.organizationMember.create({
    data: {
      assignments: { create: { branchId: fixture.branch.id } },
      availabilities: {
        create: {
          branchId: fixture.branch.id,
          dayOfWeek,
          endTime: "17:00",
          isActive: true,
          startTime: "09:00",
        },
      },
      deletedAt: options.memberDeletedAt ?? null,
      organizationId: fixture.organization.id,
      personId: person.id,
      roleId: fixture.member.roleId,
      serviceAssignments: options.assignToService
        ? { create: { serviceId: fixture.service.id } }
        : undefined,
      status: options.memberStatus ?? "ACTIVE",
    },
  });
  return { member, person };
}

test("Gate 2A mobile booking creation is tenant-safe, transactional, and idempotent", { concurrency: false }, async (t) => {
  await resetBookingTestData();
  t.after(async () => {
    await resetBookingTestData();
    await prisma.$disconnect();
  });

  await t.test("public catalog, staff policy, availability, creation, history, and owned detail agree", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const [business, services, branches, staff] = await Promise.all([
      getPublicBookingBusiness(fixture.organization.slug),
      getPublicBookingServices(fixture.organization.slug),
      getPublicServiceBranches(fixture.organization.slug, fixture.service.id),
      getPublicOfferingStaff(fixture.offering.id),
    ]);
    assert.equal(business.id, fixture.organization.id);
    assert.equal(business.supportsServiceBooking, true);
    assert.deepEqual(services.map((item) => item.id), [fixture.service.id]);
    assert.deepEqual(branches.map((item) => item.branchServiceId), [fixture.offering.id]);
    assert.equal(staff.staffSelectionMode, "REQUIRED");
    assert.deepEqual(staff.staff.map((item) => item.id), [fixture.member!.id]);

    const selection = await availableSelection(fixture);
    const created = await createCustomerBooking({
      ...selection,
      customerId: fixture.customer.id,
      idempotencyKey: randomUUID(),
    });
    assert.equal(created.replayed, false);
    assert.match(created.booking.reference, /^RZ-[0-9A-F]{12}$/);
    assert.equal(
      await prisma.bookingStatusHistory.count({
        where: { bookingId: created.booking.id, toStatus: "CONFIRMED" },
      }),
      1,
    );
    assert.deepEqual(
      await getBookingDetailForCustomer(fixture.customer.id, created.booking.id),
      created.booking,
    );
    const stranger = await prisma.person.create({
      data: {
        authUserId: `stranger-${randomUUID()}`,
        firstName: "Stranger",
        isOnboarded: true,
      },
    });
    assert.equal(
      await getBookingDetailForCustomer(stranger.id, created.booking.id),
      null,
    );
  });

  await t.test("replay returns one booking and changed input cannot reuse the key", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "OPTIONAL" });
    const selection = await availableSelection(fixture, null);
    const key = randomUUID();
    const first = await createCustomerBooking({
      ...selection,
      customerId: fixture.customer.id,
      idempotencyKey: key,
    });
    const replay = await createCustomerBooking({
      ...selection,
      customerId: fixture.customer.id,
      idempotencyKey: key,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.booking.id, first.booking.id);
    assert.equal(
      await prisma.booking.count({
        where: { customerId: fixture.customer.id, creationIdempotencyKey: key },
      }),
      1,
    );
    await assert.rejects(
      createCustomerBooking({
        ...selection,
        startsAt: new Date(
          new Date(selection.startsAt).getTime() + 15 * 60_000,
        ).toISOString(),
        customerId: fixture.customer.id,
        idempotencyKey: key,
      }),
      expectBookingCode("IDEMPOTENCY_CONFLICT"),
    );
  });

  await t.test("required staff, cross-tenant offerings, inactive customers, and suspended businesses fail closed", async () => {
    await resetBookingTestData();
    const first = await createBookingFixture({ label: "gate2a-first", mode: "REQUIRED" });
    await assert.rejects(
      getPublicBookingAvailability({
        branchServiceId: first.offering.id,
        date: first.date,
        memberId: null,
      }),
      expectBookingCode("STAFF_REQUIRED"),
    );
    const otherStaff = await createBookingFixture({
      date: first.date,
      label: "gate2a-other-staff",
      mode: "REQUIRED",
    });
    await assert.rejects(
      getPublicBookingAvailability({
        branchServiceId: first.offering.id,
        date: first.date,
        memberId: otherStaff.member!.id,
      }),
      expectBookingCode("STAFF_UNAVAILABLE"),
    );
    const yesterday = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const past = await getPublicBookingAvailability({
      branchServiceId: first.offering.id,
      date: yesterday,
      memberId: first.member!.id,
    });
    assert.equal(past.reason, "DATE_OUT_OF_RANGE");
    const crossSource = await createBookingFixture({
      label: "gate2a-cross-source",
      mode: "NONE",
      date: first.date,
    });
    const second = await createBookingFixture({ label: "gate2a-second", mode: "NONE", date: first.date });
    const corruptOffering = await prisma.branchService.create({
      data: {
        branchId: second.branch.id,
        durationMinutes: 30,
        price: "1000",
        serviceId: crossSource.service.id,
      },
    });
    await prisma.branchService.update({
      where: { id: crossSource.offering.id },
      data: { isAvailable: false },
    });
    assert.deepEqual(
      await getPublicBookingServices(crossSource.organization.slug),
      [],
      "cross-tenant offerings must not make a service publicly bookable",
    );
    await assert.rejects(
      getPublicBookingAvailability({
        branchServiceId: corruptOffering.id,
        date: first.date,
        memberId: null,
      }),
      expectBookingCode("SERVICE_UNAVAILABLE"),
    );

    const selection = await availableSelection(first);
    await prisma.person.update({
      where: { id: first.customer.id },
      data: { isOnboarded: false },
    });
    await assert.rejects(
      createCustomerBooking({
        ...selection,
        customerId: first.customer.id,
        idempotencyKey: randomUUID(),
      }),
      expectBookingCode("CUSTOMER_UNAVAILABLE"),
    );
    await prisma.organization.update({
      where: { id: first.organization.id },
      data: { isActive: false },
    });
    await assert.rejects(
      getPublicBookingBusiness(first.organization.slug),
      expectBookingCode("NOT_FOUND"),
    );
    await prisma.organization.update({
      where: { id: first.organization.id },
      data: { isActive: true, status: "ACTIVE" },
    });
    await prisma.service.update({
      where: { id: first.service.id },
      data: { status: "INACTIVE" },
    });
    assert.deepEqual(
      await getPublicBookingServices(first.organization.slug),
      [],
    );
    await prisma.service.update({
      where: { id: first.service.id },
      data: { status: "ACTIVE" },
    });
    await prisma.branch.update({
      where: { id: first.branch.id },
      data: { status: "INACTIVE" },
    });
    assert.deepEqual(
      await getPublicServiceBranches(first.organization.slug, first.service.id),
      [],
    );
  });

  await t.test("closed, blocked, and overlapping selections never persist", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const selection = await availableSelection(fixture);
    await prisma.blockedTime.create({
      data: {
        branchId: fixture.branch.id,
        endsAt: new Date(new Date(selection.startsAt).getTime() + 30 * 60_000),
        memberId: fixture.member!.id,
        startsAt: new Date(selection.startsAt),
      },
    });
    await assert.rejects(
      createCustomerBooking({
        ...selection,
        customerId: fixture.customer.id,
        idempotencyKey: randomUUID(),
      }),
      expectBookingCode("SLOT_UNAVAILABLE"),
    );
    await prisma.blockedTime.deleteMany();
    await prisma.booking.create({
      data: {
        branchId: fixture.branch.id,
        branchServiceId: fixture.offering.id,
        customerId: fixture.customer.id,
        customerNameSnapshot: "Existing",
        endsAt: new Date(new Date(selection.startsAt).getTime() + 30 * 60_000),
        memberId: fixture.member!.id,
        organizationId: fixture.organization.id,
        priceSnapshot: "25000",
        serviceNameSnapshot: "Existing",
        startsAt: new Date(selection.startsAt),
      },
    });
    await assert.rejects(
      createCustomerBooking({
        ...selection,
        customerId: fixture.customer.id,
        idempotencyKey: randomUUID(),
      }),
      expectBookingCode("SLOT_UNAVAILABLE"),
    );
    await prisma.booking.deleteMany();
    await prisma.businessHour.updateMany({ data: { isOpen: false } });
    const closed = await getPublicBookingAvailability({
      branchServiceId: fixture.offering.id,
      date: fixture.date,
      memberId: fixture.member!.id,
    });
    assert.equal(closed.reason, "CLOSED_ON_DATE");
    assert.deepEqual(closed.slots, []);
  });

  await t.test("two customers racing for one staff slot produce one booking", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const secondCustomer = await prisma.person.create({
      data: {
        authUserId: `race-${randomUUID()}`,
        firstName: "Second Customer",
        isOnboarded: true,
      },
    });
    const selection = await availableSelection(fixture);
    const results = await Promise.allSettled([
      createCustomerBooking({
        ...selection,
        customerId: fixture.customer.id,
        idempotencyKey: randomUUID(),
      }),
      createCustomerBooking({
        ...selection,
        customerId: secondCustomer.id,
        idempotencyKey: randomUUID(),
      }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(
      await prisma.booking.count({
        where: {
          memberId: fixture.member!.id,
          startsAt: new Date(selection.startsAt),
        },
      }),
      1,
    );
  });

  await t.test("status-history failure rolls back booking and idempotency fields", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "NONE" });
    const selection = await availableSelection(fixture, null);
    const key = randomUUID();
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION gate2a_reject_history() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'gate2a rollback probe';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER gate2a_reject_history_trigger
      BEFORE INSERT ON "BookingStatusHistory"
      FOR EACH ROW EXECUTE FUNCTION gate2a_reject_history();
    `);
    try {
      await assert.rejects(
        createCustomerBooking({
          ...selection,
          customerId: fixture.customer.id,
          idempotencyKey: key,
        }),
        /gate2a rollback probe/,
      );
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS gate2a_reject_history_trigger ON "BookingStatusHistory";
        DROP FUNCTION IF EXISTS gate2a_reject_history();
      `);
    }
    assert.equal(
      await prisma.booking.count({ where: { creationIdempotencyKey: key } }),
      0,
    );
  });

  await t.test("inactive stale assignment falls back consistently and the displayed slot creates", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    await prisma.organizationMember.update({
      where: { id: fixture.member!.id },
      data: { status: "INACTIVE" },
    });
    const fallback = await createAdditionalStaff(fixture);
    const staff = await getPublicOfferingStaff(fixture.offering.id);
    assert.deepEqual(staff.staff.map((item) => item.id), [fallback.member.id]);
    const selection = await availableSelection(fixture, fallback.member.id);
    const created = await createCustomerBooking({
      ...selection,
      customerId: fixture.customer.id,
      idempotencyKey: randomUUID(),
    });
    assert.equal(
      (await prisma.booking.findUnique({ where: { id: created.booking.id } }))
        ?.memberId,
      fallback.member.id,
    );
  });

  await t.test("deleted membership assignment is ignored", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    await prisma.organizationMember.update({
      where: { id: fixture.member!.id },
      data: { deletedAt: new Date() },
    });
    const fallback = await createAdditionalStaff(fixture);
    const staff = await getPublicOfferingStaff(fixture.offering.id);
    assert.deepEqual(staff.staff.map((item) => item.id), [fallback.member.id]);
    assert.ok((await availableSelection(fixture, fallback.member.id)).startsAt);
  });

  await t.test("inactive and deleted Person assignments are ignored", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    await prisma.person.update({
      where: { id: fixture.member!.personId },
      data: { status: "INACTIVE" },
    });
    const deletedPersonAssignment = await createAdditionalStaff(fixture, {
      assignToService: true,
      personDeletedAt: new Date(),
    });
    const fallback = await createAdditionalStaff(fixture);
    const staff = await getPublicOfferingStaff(fixture.offering.id);
    assert.deepEqual(staff.staff.map((item) => item.id), [fallback.member.id]);
    assert.equal(
      staff.staff.some((item) => item.id === deletedPersonAssignment.member.id),
      false,
    );
  });

  await t.test("valid active explicit assignment restricts slots to the assigned employee", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const unassigned = await createAdditionalStaff(fixture);
    const staff = await getPublicOfferingStaff(fixture.offering.id);
    assert.deepEqual(staff.staff.map((item) => item.id), [fixture.member!.id]);
    const slots = await getBookingSlotResult(fixture.offering.id, fixture.date);
    assert.ok(slots.slots.length > 0);
    assert.deepEqual(
      new Set(slots.slots.map((slot) => slot.memberId)),
      new Set([fixture.member!.id]),
    );
    assert.equal(
      slots.slots.some((slot) => slot.memberId === unassigned.member.id),
      false,
    );
  });

  await t.test("unassigned active branch employee is rejected while a valid explicit assignment exists", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const unassigned = await createAdditionalStaff(fixture);
    await assert.rejects(
      getPublicBookingAvailability({
        branchServiceId: fixture.offering.id,
        date: fixture.date,
        memberId: unassigned.member.id,
      }),
      expectBookingCode("STAFF_UNAVAILABLE"),
    );
    const assignedSelection = await availableSelection(fixture);
    await assert.rejects(
      createCustomerBooking({
        ...assignedSelection,
        customerId: fixture.customer.id,
        idempotencyKey: randomUUID(),
        memberId: unassigned.member.id,
      }),
      expectBookingCode("STAFF_UNAVAILABLE"),
    );
    assert.equal(await prisma.booking.count(), 0);
  });

  await t.test("cross-organization Service assignment cannot grant eligibility or disable fallback", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({
      label: "gate2a-policy-owner",
      mode: "REQUIRED",
    });
    await prisma.organizationMember.update({
      where: { id: fixture.member!.id },
      data: { status: "INACTIVE" },
    });
    const fallback = await createAdditionalStaff(fixture);
    const foreign = await createBookingFixture({
      date: fixture.date,
      label: "gate2a-policy-foreign",
      mode: "REQUIRED",
    });
    await prisma.serviceStaffAssignment.create({
      data: { memberId: foreign.member!.id, serviceId: fixture.service.id },
    });
    const staff = await getPublicOfferingStaff(fixture.offering.id);
    assert.deepEqual(staff.staff.map((item) => item.id), [fallback.member.id]);
    await assert.rejects(
      getPublicBookingAvailability({
        branchServiceId: fixture.offering.id,
        date: fixture.date,
        memberId: foreign.member!.id,
      }),
      expectBookingCode("STAFF_UNAVAILABLE"),
    );
    assert.ok((await availableSelection(fixture, fallback.member.id)).startsAt);
  });

  await t.test("employee becoming inactive after availability fails without partial persistence", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const selection = await availableSelection(fixture);
    await prisma.organizationMember.update({
      where: { id: fixture.member!.id },
      data: { status: "INACTIVE" },
    });
    await assert.rejects(
      createCustomerBooking({
        ...selection,
        customerId: fixture.customer.id,
        idempotencyKey: randomUUID(),
      }),
      expectBookingCode("STAFF_UNAVAILABLE"),
    );
    assert.equal(await prisma.booking.count(), 0);
    assert.equal(await prisma.bookingStatusHistory.count(), 0);
  });

  await t.test("catalog, slot generation, availability, and transaction share one eligibility result", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    await prisma.organizationMember.update({
      where: { id: fixture.member!.id },
      data: { deletedAt: new Date() },
    });
    const fallback = await createAdditionalStaff(fixture);
    const staff = await getPublicOfferingStaff(fixture.offering.id);
    const slotResult = await getBookingSlotResult(
      fixture.offering.id,
      fixture.date,
    );
    assert.deepEqual(staff.staff.map((item) => item.id), [fallback.member.id]);
    assert.deepEqual(
      new Set(slotResult.slots.map((slot) => slot.memberId)),
      new Set([fallback.member.id]),
    );
    const selection = await availableSelection(fixture, fallback.member.id);
    const created = await createCustomerBooking({
      ...selection,
      customerId: fixture.customer.id,
      idempotencyKey: randomUUID(),
    });
    assert.equal(
      (await prisma.booking.findUnique({ where: { id: created.booking.id } }))
        ?.memberId,
      fallback.member.id,
    );
  });

  await t.test("staging fixture core is deterministic, idempotent, namespaced, and service-only", async () => {
    await resetBookingTestData();
    const unrelated = await prisma.organization.create({
      data: { name: "Unrelated", slug: `unrelated-${randomUUID().slice(0, 8)}` },
    });
    const first = await seedBookingQaFixture(prisma);
    const second = await seedBookingQaFixture(prisma);
    assert.deepEqual(second, first);
    assert.equal(first.businessSlug, BOOKING_QA_FIXTURE.organization.slug);
    assert.equal(
      await prisma.organization.count({
        where: { slug: BOOKING_QA_FIXTURE.organization.slug },
      }),
      1,
    );
    assert.equal(
      await prisma.organization.count({ where: { id: unrelated.id } }),
      1,
      "fixture seeding must not delete unrelated data",
    );
    assert.equal(
      await prisma.restaurantTable.count({
        where: { businessId: BOOKING_QA_FIXTURE.organization.id },
      }),
      0,
      "generic booking fixture must remain separate from restaurant reservations",
    );
  });

  await t.test("DST transition slots preserve the branch-local date and real elapsed duration", async () => {
    await resetBookingTestData();
    const timezone = "Australia/Lord_Howe";
    const transitionDate = findUpcomingOffsetTransition(timezone);
    assert.ok(transitionDate, "Expected a Lord Howe offset transition within 90 days");
    const fixture = await createBookingFixture({
      date: transitionDate,
      label: "gate2a-dst",
      mode: "REQUIRED",
      timezone,
    });
    await prisma.businessHour.updateMany({
      where: { branchId: fixture.branch.id },
      data: { openTime: "00:00", closeTime: "05:00" },
    });
    await prisma.availability.updateMany({
      where: { branchId: fixture.branch.id },
      data: { startTime: "00:00", endTime: "05:00" },
    });
    const availability = await getPublicBookingAvailability({
      branchServiceId: fixture.offering.id,
      date: fixture.date,
      memberId: fixture.member!.id,
    });
    assert.ok(availability.slots.length > 0);
    for (const slot of availability.slots) {
      assert.equal(localDate(slot.startsAt, timezone), fixture.date);
      assert.equal(
        new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime(),
        30 * 60_000,
      );
    }
    assert.notEqual(
      offsetName(availability.slots[0]!.startsAt, timezone),
      offsetName(availability.slots.at(-1)!.startsAt, timezone),
    );
  });
});

function localDate(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

function offsetName(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(instant))
    .find((part) => part.type === "timeZoneName")?.value;
}

function findUpcomingOffsetTransition(timezone: string) {
  let previous = offsetName(new Date().toISOString(), timezone);
  for (let day = 1; day <= 90; day += 1) {
    const instant = new Date(Date.now() + day * 86_400_000);
    const next = offsetName(instant.toISOString(), timezone);
    if (next !== previous) return localDate(instant.toISOString(), timezone);
    previous = next;
  }
  return futureLocalDate(timezone, 30);
}
