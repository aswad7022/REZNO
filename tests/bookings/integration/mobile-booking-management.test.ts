import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { BookingDomainError } from "../../../features/bookings/domain/errors";
import { getPublicBookingAvailability } from "../../../features/bookings/services/booking-availability";
import { createCustomerBooking } from "../../../features/bookings/services/booking-creation";
import {
  cancelCustomerBookingPersisted,
  getCustomerBookingManagementDetail,
  getCustomerRescheduleOptions,
  listCustomerBookings,
  requestCustomerBookingChange,
  respondToCustomerBookingChange,
} from "../../../features/bookings/services/booking-management";
import { prisma } from "../../../lib/db/prisma";
import {
  createBookingFixture,
  resetBookingTestData,
} from "../helpers/booking-fixture";

function hasCode(code: BookingDomainError["code"]) {
  return (error: unknown) =>
    error instanceof BookingDomainError && error.code === code;
}

async function createPersistedBooking(
  fixture: Awaited<ReturnType<typeof createBookingFixture>>,
) {
  const availability = await getPublicBookingAvailability({
    branchServiceId: fixture.offering.id,
    date: fixture.date,
    memberId: fixture.member?.id ?? null,
  });
  assert.ok(availability.slots.length > 0, availability.reason);
  const slot = availability.slots[0]!;
  return createCustomerBooking({
    branchServiceId: fixture.offering.id,
    customerId: fixture.customer.id,
    date: fixture.date,
    idempotencyKey: randomUUID(),
    memberId: slot.memberId,
    startsAt: slot.startsAt,
  });
}

test("Gate 2B booking management is owner-scoped, idempotent, and transactional", { concurrency: false }, async (t) => {
  await resetBookingTestData();
  t.after(async () => {
    await resetBookingTestData();
    await prisma.$disconnect();
  });

  await t.test("stable cursor pagination returns every owned service booking once", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "NONE" });
    const startsAt = new Date(`${fixture.date}T10:00:00.000Z`);
    await prisma.booking.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({
        id: randomUUID(),
        organizationId: fixture.organization.id,
        branchId: fixture.branch.id,
        branchServiceId: fixture.offering.id,
        customerId: fixture.customer.id,
        memberId: null,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        serviceNameSnapshot: `Paged ${index}`,
        customerNameSnapshot: "Booking Customer",
        priceSnapshot: "25000",
      })),
    });
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await listCustomerBookings({
        customerId: fixture.customer.id,
        tab: "all",
        cursor,
        limit: 2,
      });
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      assert.equal(page.counts.all, 5);
    } while (cursor);
    assert.equal(seen.length, 5);
    assert.equal(new Set(seen).size, 5);
  });

  await t.test("owned detail is safe and foreign ownership returns no record", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const created = await createPersistedBooking(fixture);
    const foreign = await prisma.person.create({
      data: {
        authUserId: `foreign-${randomUUID()}`,
        firstName: "Foreign",
        isOnboarded: true,
      },
    });
    const detail = await getCustomerBookingManagementDetail(
      fixture.customer.id,
      created.booking.id,
    );
    assert.equal(detail?.id, created.booking.id);
    assert.equal(detail?.branchServiceId, fixture.offering.id);
    assert.equal(detail?.statusHistory.length, 1);
    assert.equal(
      await getCustomerBookingManagementDetail(foreign.id, created.booking.id),
      null,
    );
  });

  await t.test("customer cancellation replays once, records one history row, and fails closed", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const created = await createPersistedBooking(fixture);
    const key = randomUUID();
    const first = await cancelCustomerBookingPersisted({
      bookingId: created.booking.id,
      customerId: fixture.customer.id,
      idempotencyKey: key,
      reason: "Customer schedule changed",
    });
    const replay = await cancelCustomerBookingPersisted({
      bookingId: created.booking.id,
      customerId: fixture.customer.id,
      idempotencyKey: key,
      reason: "Customer schedule changed",
    });
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(
      await prisma.bookingStatusHistory.count({
        where: { bookingId: created.booking.id, toStatus: "CANCELLED" },
      }),
      1,
    );
    await assert.rejects(
      cancelCustomerBookingPersisted({
        bookingId: created.booking.id,
        customerId: fixture.customer.id,
        idempotencyKey: randomUUID(),
        reason: null,
      }),
      hasCode("BOOKING_STATE_CONFLICT"),
    );
    const other = await prisma.person.create({
      data: {
        authUserId: `other-${randomUUID()}`,
        firstName: "Other",
        isOnboarded: true,
      },
    });
    await assert.rejects(
      cancelCustomerBookingPersisted({
        bookingId: created.booking.id,
        customerId: other.id,
        idempotencyKey: randomUUID(),
        reason: null,
      }),
      hasCode("NOT_FOUND"),
    );
  });

  await t.test("completed, past, and business-cancelled bookings cannot be customer-cancelled", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "NONE" });
    for (const status of ["COMPLETED", "CANCELLED"] as const) {
      const booking = await prisma.booking.create({
        data: {
          organizationId: fixture.organization.id,
          branchId: fixture.branch.id,
          branchServiceId: fixture.offering.id,
          customerId: fixture.customer.id,
          startsAt: new Date(Date.now() + 3 * 86_400_000),
          endsAt: new Date(Date.now() + 3 * 86_400_000 + 30 * 60_000),
          serviceNameSnapshot: status,
          customerNameSnapshot: "Customer",
          priceSnapshot: "25000",
          status,
        },
      });
      await assert.rejects(
        cancelCustomerBookingPersisted({
          bookingId: booking.id,
          customerId: fixture.customer.id,
          idempotencyKey: randomUUID(),
          reason: null,
        }),
        hasCode("BOOKING_NOT_CANCELLABLE"),
      );
    }
    const past = await prisma.booking.create({
      data: {
        organizationId: fixture.organization.id,
        branchId: fixture.branch.id,
        branchServiceId: fixture.offering.id,
        customerId: fixture.customer.id,
        startsAt: new Date(Date.now() - 60 * 60_000),
        endsAt: new Date(Date.now() - 30 * 60_000),
        serviceNameSnapshot: "Past",
        customerNameSnapshot: "Customer",
        priceSnapshot: "25000",
      },
    });
    await assert.rejects(
      cancelCustomerBookingPersisted({
        bookingId: past.id,
        customerId: fixture.customer.id,
        idempotencyKey: randomUUID(),
        reason: null,
      }),
      hasCode("CANCELLATION_DEADLINE_PASSED"),
    );
  });

  await t.test("concurrent customer cancellations commit one status transition", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "NONE" });
    const created = await createPersistedBooking(fixture);
    const results = await Promise.allSettled([
      cancelCustomerBookingPersisted({
        bookingId: created.booking.id,
        customerId: fixture.customer.id,
        idempotencyKey: randomUUID(),
        reason: "first",
      }),
      cancelCustomerBookingPersisted({
        bookingId: created.booking.id,
        customerId: fixture.customer.id,
        idempotencyKey: randomUUID(),
        reason: "second",
      }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(
      await prisma.bookingStatusHistory.count({
        where: { bookingId: created.booking.id, toStatus: "CANCELLED" },
      }),
      1,
    );
  });

  await t.test("customer change request replays, rejects duplicates, and business rejection is non-mutating", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const created = await createPersistedBooking(fixture);
    const options = await getCustomerRescheduleOptions({
      customerId: fixture.customer.id,
      bookingId: created.booking.id,
      date: fixture.date,
      memberId: fixture.member!.id,
    });
    assert.ok(options.slots.length > 0, options.reason);
    const slot = options.slots[0]!;
    const key = randomUUID();
    const input = {
      customerId: fixture.customer.id,
      bookingId: created.booking.id,
      idempotencyKey: key,
      date: fixture.date,
      memberId: slot.memberId,
      startsAt: slot.startsAt,
    };
    const first = await requestCustomerBookingChange(input);
    const replay = await requestCustomerBookingChange(input);
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    await assert.rejects(
      requestCustomerBookingChange({ ...input, idempotencyKey: randomUUID() }),
      hasCode("ACTIVE_CHANGE_REQUEST_EXISTS"),
    );
    await assert.rejects(
      requestCustomerBookingChange({
        ...input,
        startsAt: new Date(new Date(slot.startsAt).getTime() + 30 * 60_000).toISOString(),
      }),
      hasCode("IDEMPOTENCY_CONFLICT"),
    );
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: created.booking.id } });
    const response = await respondToCustomerBookingChange({
      requestId: first.requestId,
      organizationId: fixture.organization.id,
      responderPersonId: fixture.member!.personId,
      decision: "reject",
    });
    assert.equal(response.status, "REJECTED");
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: created.booking.id } });
    assert.equal(after.startsAt.toISOString(), before.startsAt.toISOString());
  });

  await t.test("business approval revalidates and updates the booking exactly once", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const created = await createPersistedBooking(fixture);
    const options = await getCustomerRescheduleOptions({
      customerId: fixture.customer.id,
      bookingId: created.booking.id,
      date: fixture.date,
      memberId: fixture.member!.id,
    });
    const slot = options.slots[0]!;
    const request = await requestCustomerBookingChange({
      customerId: fixture.customer.id,
      bookingId: created.booking.id,
      idempotencyKey: randomUUID(),
      date: fixture.date,
      memberId: slot.memberId,
      startsAt: slot.startsAt,
    });
    const accepted = await respondToCustomerBookingChange({
      requestId: request.requestId,
      organizationId: fixture.organization.id,
      responderPersonId: fixture.member!.personId,
      decision: "accept",
    });
    assert.equal(accepted.status, "ACCEPTED");
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: created.booking.id },
    });
    assert.equal(booking.startsAt.toISOString(), slot.startsAt);
    assert.equal(
      await prisma.bookingStatusHistory.count({
        where: { bookingId: booking.id, note: "CUSTOMER_CHANGE_ACCEPTED" },
      }),
      1,
    );
    await assert.rejects(
      respondToCustomerBookingChange({
        requestId: request.requestId,
        organizationId: fixture.organization.id,
        responderPersonId: fixture.member!.personId,
        decision: "accept",
      }),
      hasCode("CHANGE_REQUEST_NOT_RESPONDABLE"),
    );
  });

  await t.test("a slot taken after display and cross-tenant staff are rejected", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({
      label: "gate2b-slot-race",
      mode: "REQUIRED",
      timezone: "America/New_York",
    });
    const created = await createPersistedBooking(fixture);
    const options = await getCustomerRescheduleOptions({
      customerId: fixture.customer.id,
      bookingId: created.booking.id,
      date: fixture.date,
      memberId: fixture.member!.id,
    });
    const slot = options.slots[0]!;
    assert.ok(slot);
    const otherCustomer = await prisma.person.create({
      data: {
        authUserId: `slot-race-${randomUUID()}`,
        firstName: "Slot Race",
        isOnboarded: true,
      },
    });
    await prisma.booking.create({
      data: {
        organizationId: fixture.organization.id,
        branchId: fixture.branch.id,
        branchServiceId: fixture.offering.id,
        customerId: otherCustomer.id,
        memberId: fixture.member!.id,
        startsAt: new Date(slot.startsAt),
        endsAt: new Date(slot.endsAt),
        serviceNameSnapshot: "Competing booking",
        customerNameSnapshot: "Slot Race",
        priceSnapshot: "25000",
      },
    });
    await assert.rejects(
      requestCustomerBookingChange({
        customerId: fixture.customer.id,
        bookingId: created.booking.id,
        idempotencyKey: randomUUID(),
        date: fixture.date,
        memberId: slot.memberId,
        startsAt: slot.startsAt,
      }),
      (error: unknown) =>
        error instanceof BookingDomainError &&
        (error.code === "SLOT_UNAVAILABLE" || error.code === "SLOT_CONFLICT"),
    );
    const otherTenant = await createBookingFixture({
      date: fixture.date,
      label: "gate2b-foreign-staff",
      mode: "REQUIRED",
      timezone: "America/New_York",
    });
    await assert.rejects(
      getCustomerRescheduleOptions({
        customerId: fixture.customer.id,
        bookingId: created.booking.id,
        date: fixture.date,
        memberId: otherTenant.member!.id,
      }),
      hasCode("STAFF_UNAVAILABLE"),
    );
    assert.equal(
      (await getCustomerBookingManagementDetail(fixture.customer.id, created.booking.id))?.timezone,
      "America/New_York",
    );
  });

  await t.test("stale requests and status-history failures cannot partially mutate", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const created = await createPersistedBooking(fixture);
    const options = await getCustomerRescheduleOptions({
      customerId: fixture.customer.id,
      bookingId: created.booking.id,
      date: fixture.date,
      memberId: fixture.member!.id,
    });
    const slot = options.slots[0]!;
    const request = await requestCustomerBookingChange({
      customerId: fixture.customer.id,
      bookingId: created.booking.id,
      idempotencyKey: randomUUID(),
      date: fixture.date,
      memberId: slot.memberId,
      startsAt: slot.startsAt,
    });
    await prisma.booking.update({
      where: { id: created.booking.id },
      data: { notes: "Business changed this booking after the request." },
    });
    await assert.rejects(
      respondToCustomerBookingChange({
        requestId: request.requestId,
        organizationId: fixture.organization.id,
        responderPersonId: fixture.member!.personId,
        decision: "accept",
      }),
      hasCode("BOOKING_STATE_CONFLICT"),
    );
    assert.equal(
      (await prisma.bookingChangeRequest.findUniqueOrThrow({
        where: { id: request.requestId },
      })).status,
      "PENDING",
    );

    await prisma.bookingChangeRequest.update({
      where: { id: request.requestId },
      data: { status: "CANCELLED", respondedAt: new Date() },
    });
    const cancellable = await createPersistedBooking(
      await createBookingFixture({ label: "gate2b-rollback", mode: "NONE" }),
    );
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION gate2b_reject_history() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'gate2b rollback probe';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER gate2b_reject_history_trigger
      BEFORE INSERT ON "BookingStatusHistory"
      FOR EACH ROW EXECUTE FUNCTION gate2b_reject_history();
    `);
    try {
      await assert.rejects(
        cancelCustomerBookingPersisted({
          bookingId: cancellable.booking.id,
          customerId: (await prisma.booking.findUniqueOrThrow({ where: { id: cancellable.booking.id } })).customerId,
          idempotencyKey: randomUUID(),
          reason: null,
        }),
        /gate2b rollback probe/,
      );
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS gate2b_reject_history_trigger ON "BookingStatusHistory";
        DROP FUNCTION IF EXISTS gate2b_reject_history();
      `);
    }
    assert.equal(
      (await prisma.booking.findUniqueOrThrow({ where: { id: cancellable.booking.id } })).status,
      "CONFIRMED",
    );
  });

  await t.test("inactive customers and inactive businesses fail closed for changes", async () => {
    await resetBookingTestData();
    const fixture = await createBookingFixture({ mode: "REQUIRED" });
    const created = await createPersistedBooking(fixture);
    await prisma.person.update({
      where: { id: fixture.customer.id },
      data: { status: "INACTIVE" },
    });
    await assert.rejects(
      listCustomerBookings({ customerId: fixture.customer.id, tab: "all" }),
      hasCode("CUSTOMER_UNAVAILABLE"),
    );
    await prisma.person.update({
      where: { id: fixture.customer.id },
      data: { status: "ACTIVE" },
    });
    await prisma.organization.update({
      where: { id: fixture.organization.id },
      data: { isActive: false },
    });
    await assert.rejects(
      getCustomerRescheduleOptions({
        customerId: fixture.customer.id,
        bookingId: created.booking.id,
        date: fixture.date,
        memberId: fixture.member!.id,
      }),
      hasCode("NOT_FOUND"),
    );
    assert.equal(
      (await getCustomerBookingManagementDetail(fixture.customer.id, created.booking.id))?.id,
      created.booking.id,
      "persisted reads remain available when a business becomes inactive",
    );
  });
});
