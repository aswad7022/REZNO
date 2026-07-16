import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { BookingDomainError } from "../../../features/bookings/domain/errors";
import { respondToBusinessBookingProposal } from "../../../features/bookings/services/booking-management";
import { BusinessOperationsError } from "../../../features/business-operations/domain/errors";
import {
  getOperationalBookingDetail,
  proposeOperationalBookingChange,
  respondToOperationalCustomerChangeRequest,
  transitionOperationalBooking,
} from "../../../features/business-operations/services/booking-operations";
import { listOperationalCalendar } from "../../../features/business-operations/services/daily-calendar";
import {
  createOperationalMenuCategory,
  createOperationalMenuItem,
  createOperationalRestaurantTable,
  listOperationalRestaurantMenu,
  listOperationalRestaurantTables,
  removeOperationalMenuCategory,
  removeOperationalMenuItem,
  removeOperationalRestaurantTable,
  setOperationalMenuCategoryActive,
  setOperationalMenuItemAvailable,
  setOperationalRestaurantTableActive,
  updateOperationalMenuCategory,
  updateOperationalMenuItem,
  updateOperationalRestaurantTable,
} from "../../../features/business-operations/services/restaurant-catalog";
import {
  getOperationalRestaurantReservationDetail,
  rescheduleOperationalRestaurantReservation,
} from "../../../features/business-operations/services/restaurant-operations";
import { prisma } from "../../../lib/db/prisma";
import {
  createBusinessOperationsFixture,
  createFutureGenericBooking,
  createFutureRestaurantBooking,
  resetBusinessOperationsTestData,
} from "../helpers/business-operations-fixture";

function hasCode(code: BusinessOperationsError["code"]) {
  return (error: unknown) =>
    error instanceof BusinessOperationsError && error.code === code;
}

function bookingHasCode(code: BookingDomainError["code"]) {
  return (error: unknown) => error instanceof BookingDomainError && error.code === code;
}

function instant(days: number, hour: number, minute = 0) {
  const value = new Date();
  value.setUTCSeconds(0, 0);
  value.setUTCDate(value.getUTCDate() + days);
  value.setUTCHours(hour, minute, 0, 0);
  return value;
}

function localDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function createGenericOrganizationFixture(label: string) {
  const fixture = await createBusinessOperationsFixture(label);
  const service = await prisma.service.create({
    data: {
      categoryId: fixture.category.id,
      name: `${label} Generic Service`,
      organizationId: fixture.organizationB.id,
      staffSelectionMode: "NONE",
      status: "ACTIVE",
    },
  });
  const offering = await prisma.branchService.create({
    data: {
      branchId: fixture.branchB.id,
      durationMinutes: 30,
      isAvailable: true,
      price: "15000",
      serviceId: service.id,
    },
  });
  return { fixture, offering, service };
}

async function createGenericBooking(
  context: Awaited<ReturnType<typeof createGenericOrganizationFixture>>,
  options: {
    startsAt?: Date;
    status?: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  } = {},
) {
  const startsAt = options.startsAt ?? instant(5, 11);
  return prisma.booking.create({
    data: {
      branchId: context.fixture.branchB.id,
      branchServiceId: context.offering.id,
      customerId: context.fixture.customer.id,
      customerNameSnapshot: "Stage 2C Customer",
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      organizationId: context.fixture.organizationB.id,
      priceSnapshot: "15000",
      serviceNameSnapshot: context.service.name,
      startsAt,
      status: options.status ?? "CONFIRMED",
    },
  });
}

async function createCustomerRequest(
  context: Awaited<ReturnType<typeof createGenericOrganizationFixture>>,
  booking: Awaited<ReturnType<typeof createGenericBooking>>,
  proposedStartsAt: Date,
) {
  return prisma.bookingChangeRequest.create({
    data: {
      bookingId: booking.id,
      bookingUpdatedAtSnapshot: booking.updatedAt,
      proposedEndsAt: new Date(proposedStartsAt.getTime() + 30 * 60_000),
      proposedStartsAt,
      requestedByPersonId: context.fixture.customer.id,
    },
  });
}

test(
  "Stage 2C daily Booking and Restaurant operations are role-scoped, replay-safe, concurrent, audited and customer-safe",
  { concurrency: false },
  async (t) => {
    await resetBusinessOperationsTestData();
    t.after(async () => {
      await resetBusinessOperationsTestData();
      await prisma.$disconnect();
    });

    await t.test("calendar scopes, privacy, deterministic pagination and cursor binding", async () => {
      await resetBusinessOperationsTestData();
      const fixture = await createBusinessOperationsFixture("stage2c-calendar");
      await prisma.branchAssignment.create({
        data: { branchId: fixture.activeBranch.id, memberId: fixture.staff.membership.id },
      });
      const own = await prisma.booking.create({
        data: {
          branchId: fixture.activeBranch.id,
          branchServiceId: fixture.offering.id,
          customerId: fixture.customer.id,
          customerNameSnapshot: "STAFF_OWN_CUSTOMER",
          endsAt: instant(3, 10, 30),
          memberId: fixture.staff.membership.id,
          notes: "Customer delivery note",
          organizationId: fixture.organizationA.id,
          priceSnapshot: "25000",
          serviceNameSnapshot: "Own service",
          startsAt: instant(3, 10),
          status: "CONFIRMED",
        },
      });
      const other = await prisma.booking.create({
        data: {
          branchId: fixture.activeBranch.id,
          branchServiceId: fixture.offering.id,
          customerId: fixture.customer.id,
          customerNameSnapshot: "OTHER_EMPLOYEE_SENTINEL",
          endsAt: instant(3, 11, 30),
          memberId: fixture.manager.membership.id,
          organizationId: fixture.organizationA.id,
          priceSnapshot: "25000",
          serviceNameSnapshot: "Other service",
          startsAt: instant(3, 11),
          status: "CONFIRMED",
        },
      });
      const restaurant = await createFutureRestaurantBooking(
        fixture,
        localDate(instant(4, 0)),
      );
      const inactiveOffering = await prisma.branchService.create({
        data: {
          branchId: fixture.inactiveBranch.id,
          durationMinutes: 30,
          price: "25000",
          serviceId: fixture.service.id,
        },
      });
      const inactive = await prisma.booking.create({
        data: {
          branchId: fixture.inactiveBranch.id,
          branchServiceId: inactiveOffering.id,
          customerId: fixture.customer.id,
          customerNameSnapshot: "INACTIVE_BRANCH_SENTINEL",
          endsAt: instant(5, 10, 30),
          organizationId: fixture.organizationA.id,
          priceSnapshot: "25000",
          serviceNameSnapshot: "Inactive branch service",
          startsAt: instant(5, 10),
          status: "CONFIRMED",
        },
      });
      const owner = await listOperationalCalendar(fixture.owner.reference, {
        date: localDate(own.startsAt),
        limit: "1",
        view: "upcoming",
      });
      assert.equal(owner.scope, "MANAGEMENT");
      assert.equal(owner.bookings.length, 1);
      assert.ok(owner.summary.total >= 2, "summary is independent from page size");
      assert.ok(owner.nextCursor);
      const ownerNext = await listOperationalCalendar(fixture.owner.reference, {
        cursor: owner.nextCursor!,
        date: localDate(own.startsAt),
        limit: "1",
        view: "upcoming",
      });
      assert.equal(
        owner.bookings.some((row) => ownerNext.bookings.some((next) => next.id === row.id)),
        false,
      );
      const combined = [...owner.bookings, ...ownerNext.bookings];
      assert.equal(new Set(combined.map((row) => row.id)).size, combined.length);
      assert.ok(combined.some((row) => row.id === own.id));
      assert.ok(combined.some((row) => row.id === other.id));

      const manager = await listOperationalCalendar(fixture.manager.reference, { view: "upcoming" });
      assert.equal(manager.scope, "MANAGEMENT");
      assert.ok(manager.bookings.some((row) => row.id === restaurant.id));
      const receptionist = await listOperationalCalendar(fixture.receptionist.reference, { view: "upcoming" });
      assert.equal(receptionist.scope, "RECEPTIONIST");
      assert.equal(receptionist.bookings.some((row) => row.id === inactive.id), false);
      assert.ok(receptionist.bookings.some((row) => row.id === own.id));

      const staff = await listOperationalCalendar(fixture.staff.reference, { view: "upcoming" });
      assert.equal(staff.scope, "STAFF_SELF");
      assert.deepEqual(staff.bookings.map((row) => row.id), [own.id]);
      assert.equal(staff.summary, null);
      assert.deepEqual(staff.options, { branches: [], members: [], services: [] });
      const serializedStaff = JSON.stringify(staff);
      for (const sentinel of [
        fixture.customer.phone ?? "PHONE_SENTINEL_ABSENT",
        "customerEmail",
        "customerPhone",
        "version",
        "pendingChangeRequest",
        other.id,
        restaurant.id,
        "OTHER_EMPLOYEE_SENTINEL",
      ]) {
        assert.equal(serializedStaff.includes(sentinel), false, `Staff DTO leaked ${sentinel}`);
      }

      await assert.rejects(
        listOperationalCalendar(fixture.manager.reference, {
          cursor: owner.nextCursor!,
          date: localDate(own.startsAt),
          limit: "1",
          view: "upcoming",
        }),
        hasCode("INVALID_REQUEST"),
      );
      await assert.rejects(
        listOperationalCalendar(fixture.owner.reference, {
          cursor: owner.nextCursor!,
          date: localDate(own.startsAt),
          limit: "1",
          type: "restaurant",
          view: "upcoming",
        }),
        hasCode("INVALID_REQUEST"),
      );
      const foreign = await listOperationalCalendar(fixture.ownerB.reference, { view: "upcoming" });
      assert.equal(foreign.bookings.some((row) => row.id === own.id), false);
    });

    await t.test("Booking lifecycle enforces transitions, timing, reason, replay, stale versions, races and rollback", async () => {
      await resetBusinessOperationsTestData();
      const fixture = await createBusinessOperationsFixture("stage2c-lifecycle");
      const pendingSeed = await createFutureGenericBooking(
        fixture,
        localDate(instant(5, 0)),
      );
      const pending = await prisma.booking.update({
        where: { id: pendingSeed.id },
        data: { status: "PENDING" },
      });
      const confirmKey = randomUUID();
      const confirmInput = {
        actor: fixture.owner.reference,
        bookingId: pending.id,
        cancellationReason: null,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: pending.updatedAt.toISOString(),
        idempotencyKey: confirmKey,
        nextStatus: "CONFIRMED" as const,
      };
      const confirmed = await transitionOperationalBooking(confirmInput);
      assert.equal(confirmed.status, "CONFIRMED");
      assert.equal((await transitionOperationalBooking(confirmInput)).replayed, true);
      assert.equal(await prisma.businessOperationMutation.count({ where: { idempotencyKey: confirmKey } }), 1);
      assert.equal(await prisma.businessAuditLog.count({ where: { targetId: pending.id } }), 1);
      assert.equal(await prisma.bookingStatusHistory.count({ where: { bookingId: pending.id } }), 1);
      await assert.rejects(
        transitionOperationalBooking({ ...confirmInput, nextStatus: "CANCELLED", cancellationReason: "changed" }),
        hasCode("IDEMPOTENCY_CONFLICT"),
      );

      const cancelPending = await createFutureGenericBooking(fixture, localDate(instant(6, 0)));
      const cancelPendingCurrent = await prisma.booking.update({ where: { id: cancelPending.id }, data: { status: "PENDING" } });
      const customerRequest = await prisma.bookingChangeRequest.create({
        data: {
          bookingId: cancelPendingCurrent.id,
          proposedEndsAt: instant(7, 12, 30),
          proposedStartsAt: instant(7, 12),
          requestedByPersonId: fixture.customer.id,
        },
      });
      const cancelKey = randomUUID();
      const cancellation = await transitionOperationalBooking({
        actor: fixture.receptionist.reference,
        bookingId: cancelPendingCurrent.id,
        cancellationReason: "  تعذر توفر الموظف  ",
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: cancelPendingCurrent.updatedAt.toISOString(),
        idempotencyKey: cancelKey,
        nextStatus: "CANCELLED",
      });
      assert.equal(cancellation.status, "CANCELLED");
      const cancelledRow = await prisma.booking.findUniqueOrThrow({ where: { id: cancelPendingCurrent.id } });
      assert.equal(cancelledRow.cancellationReason, "تعذر توفر الموظف");
      assert.ok(cancelledRow.cancelledAt);
      assert.equal((await prisma.bookingChangeRequest.findUniqueOrThrow({ where: { id: customerRequest.id } })).status, "CANCELLED");
      assert.equal(await prisma.notification.count({ where: { eventKey: `business-booking:${fixture.organizationA.id}:${cancelKey}:cancelled` } }), 1);
      assert.equal((await transitionOperationalBooking({
        actor: fixture.receptionist.reference,
        bookingId: cancelPendingCurrent.id,
        cancellationReason: "تعذر توفر الموظف",
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: cancelPendingCurrent.updatedAt.toISOString(),
        idempotencyKey: cancelKey,
        nextStatus: "CANCELLED",
      })).replayed, true);
      assert.equal(await prisma.notification.count({ where: { eventKey: `business-booking:${fixture.organizationA.id}:${cancelKey}:cancelled` } }), 1);

      const future = await createFutureGenericBooking(fixture, localDate(instant(7, 0)));
      for (const status of ["COMPLETED", "NO_SHOW"] as const) {
        await assert.rejects(
          transitionOperationalBooking({
            actor: fixture.manager.reference,
            bookingId: future.id,
            cancellationReason: null,
            contextOrganizationId: fixture.organizationA.id,
            expectedVersion: future.updatedAt.toISOString(),
            idempotencyKey: randomUUID(),
            nextStatus: status,
          }),
          hasCode("BOOKING_STATE_CONFLICT"),
        );
      }
      const stale = await createFutureGenericBooking(fixture, localDate(instant(8, 0)));
      await prisma.booking.update({ where: { id: stale.id }, data: { notes: "concurrent" } });
      await assert.rejects(
        transitionOperationalBooking({
          actor: fixture.owner.reference,
          bookingId: stale.id,
          cancellationReason: "Closed",
          contextOrganizationId: fixture.organizationA.id,
          expectedVersion: stale.updatedAt.toISOString(),
          idempotencyKey: randomUUID(),
          nextStatus: "CANCELLED",
        }),
        hasCode("STALE_VERSION"),
      );

      const complete = await createFutureGenericBooking(fixture, localDate(instant(-2, 0)));
      await prisma.booking.update({
        where: { id: complete.id },
        data: { endsAt: instant(-1, 10, 30), startsAt: instant(-1, 10) },
      });
      const completeCurrent = await prisma.booking.findUniqueOrThrow({ where: { id: complete.id } });
      await transitionOperationalBooking({
        actor: fixture.manager.reference,
        bookingId: complete.id,
        cancellationReason: null,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: completeCurrent.updatedAt.toISOString(),
        idempotencyKey: randomUUID(),
        nextStatus: "COMPLETED",
      });
      await assert.rejects(
        transitionOperationalBooking({
          actor: fixture.manager.reference,
          bookingId: complete.id,
          cancellationReason: null,
          contextOrganizationId: fixture.organizationA.id,
          expectedVersion: (await prisma.booking.findUniqueOrThrow({ where: { id: complete.id } })).updatedAt.toISOString(),
          idempotencyKey: randomUUID(),
          nextStatus: "CONFIRMED",
        }),
        hasCode("BOOKING_STATE_CONFLICT"),
      );
      const noShow = await createFutureGenericBooking(fixture, localDate(instant(-2, 0)));
      await prisma.booking.update({ where: { id: noShow.id }, data: { startsAt: instant(-1, 11), endsAt: instant(-1, 11, 30) } });
      const noShowCurrent = await prisma.booking.findUniqueOrThrow({ where: { id: noShow.id } });
      await transitionOperationalBooking({
        actor: fixture.owner.reference,
        bookingId: noShow.id,
        cancellationReason: null,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: noShowCurrent.updatedAt.toISOString(),
        idempotencyKey: randomUUID(),
        nextStatus: "NO_SHOW",
      });

      const expiredPending = await createFutureGenericBooking(fixture, localDate(instant(-2, 0)));
      await prisma.booking.update({ where: { id: expiredPending.id }, data: { status: "PENDING", startsAt: instant(-1, 12), endsAt: instant(-1, 12, 30) } });
      const expiredCurrent = await prisma.booking.findUniqueOrThrow({ where: { id: expiredPending.id } });
      await assert.rejects(
        transitionOperationalBooking({
          actor: fixture.owner.reference,
          bookingId: expiredPending.id,
          cancellationReason: null,
          contextOrganizationId: fixture.organizationA.id,
          expectedVersion: expiredCurrent.updatedAt.toISOString(),
          idempotencyKey: randomUUID(),
          nextStatus: "CONFIRMED",
        }),
        hasCode("BOOKING_STATE_CONFLICT"),
      );

      const race = await createFutureGenericBooking(fixture, localDate(instant(9, 0)));
      const raceResults = await Promise.allSettled([
        transitionOperationalBooking({ actor: fixture.owner.reference, bookingId: race.id, cancellationReason: "Race cancel", contextOrganizationId: fixture.organizationA.id, expectedVersion: race.updatedAt.toISOString(), idempotencyKey: randomUUID(), nextStatus: "CANCELLED" }),
        transitionOperationalBooking({ actor: fixture.manager.reference, bookingId: race.id, cancellationReason: null, contextOrganizationId: fixture.organizationA.id, expectedVersion: race.updatedAt.toISOString(), idempotencyKey: randomUUID(), nextStatus: "CONFIRMED" }),
      ]);
      assert.equal(raceResults.filter((result) => result.status === "fulfilled").length, 1);

      await assert.rejects(
        transitionOperationalBooking({ actor: fixture.ownerB.reference, bookingId: future.id, cancellationReason: "Forged", contextOrganizationId: fixture.organizationB.id, expectedVersion: future.updatedAt.toISOString(), idempotencyKey: randomUUID(), nextStatus: "CANCELLED" }),
        hasCode("BOOKING_NOT_FOUND"),
      );
      await assert.rejects(
        transitionOperationalBooking({ actor: fixture.owner.reference, bookingId: future.id, cancellationReason: "Stale business", contextOrganizationId: fixture.organizationB.id, expectedVersion: future.updatedAt.toISOString(), idempotencyKey: randomUUID(), nextStatus: "CANCELLED" }),
        hasCode("ACTIVE_ORGANIZATION_CHANGED"),
      );
      await assert.rejects(
        transitionOperationalBooking({ actor: fixture.revoked.reference, bookingId: future.id, cancellationReason: "Revoked", contextOrganizationId: fixture.organizationA.id, expectedVersion: future.updatedAt.toISOString(), idempotencyKey: randomUUID(), nextStatus: "CANCELLED" }),
        hasCode("MEMBERSHIP_UNAVAILABLE"),
      );

      const rollback = await createFutureGenericBooking(fixture, localDate(instant(10, 0)));
      const rollbackKey = randomUUID();
      const rollbackEvent = `business-booking:${fixture.organizationA.id}:${rollbackKey}:cancelled`;
      await prisma.notification.create({
        data: { audience: "USER", body: "collision", eventKey: rollbackEvent, recipientPersonId: fixture.customer.id, title: "collision" },
      });
      const beforeCounts = [
        await prisma.businessAuditLog.count({ where: { targetId: rollback.id } }),
        await prisma.businessOperationMutation.count({ where: { idempotencyKey: rollbackKey } }),
        await prisma.bookingStatusHistory.count({ where: { bookingId: rollback.id } }),
      ];
      await assert.rejects(
        transitionOperationalBooking({ actor: fixture.owner.reference, bookingId: rollback.id, cancellationReason: "Rollback", contextOrganizationId: fixture.organizationA.id, expectedVersion: rollback.updatedAt.toISOString(), idempotencyKey: rollbackKey, nextStatus: "CANCELLED" }),
      );
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: rollback.id } })).status, "CONFIRMED");
      assert.deepEqual([
        await prisma.businessAuditLog.count({ where: { targetId: rollback.id } }),
        await prisma.businessOperationMutation.count({ where: { idempotencyKey: rollbackKey } }),
        await prisma.bookingStatusHistory.count({ where: { bookingId: rollback.id } }),
      ], beforeCounts);
    });

    await t.test("generic customer requests and Business proposals revalidate slots and close races", async () => {
      await resetBusinessOperationsTestData();
      const context = await createGenericOrganizationFixture("stage2c-generic-changes");
      const actor = context.fixture.ownerB.reference;

      const acceptBooking = await createGenericBooking(context);
      const acceptStarts = instant(6, 12);
      const acceptRequest = await createCustomerRequest(context, acceptBooking, acceptStarts);
      const acceptKey = randomUUID();
      const accepted = await respondToOperationalCustomerChangeRequest({
        actor,
        contextOrganizationId: context.fixture.organizationB.id,
        decision: "accept",
        expectedBookingVersion: acceptBooking.updatedAt.toISOString(),
        expectedRequestCreatedAt: acceptRequest.createdAt.toISOString(),
        idempotencyKey: acceptKey,
        requestId: acceptRequest.id,
      });
      assert.equal(accepted.status, "ACCEPTED");
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: acceptBooking.id } })).startsAt.getTime(), acceptStarts.getTime());
      assert.equal((await respondToOperationalCustomerChangeRequest({
        actor,
        contextOrganizationId: context.fixture.organizationB.id,
        decision: "accept",
        expectedBookingVersion: acceptBooking.updatedAt.toISOString(),
        expectedRequestCreatedAt: acceptRequest.createdAt.toISOString(),
        idempotencyKey: acceptKey,
        requestId: acceptRequest.id,
      })).replayed, true);
      assert.equal(await prisma.notification.count({ where: { eventKey: `business-booking-change:${context.fixture.organizationB.id}:${acceptKey}:accept` } }), 1);

      const rejectBooking = await createGenericBooking(context, { startsAt: instant(7, 10) });
      const rejectRequest = await createCustomerRequest(context, rejectBooking, instant(7, 13));
      const rejected = await respondToOperationalCustomerChangeRequest({
        actor,
        contextOrganizationId: context.fixture.organizationB.id,
        decision: "reject",
        expectedBookingVersion: rejectBooking.updatedAt.toISOString(),
        expectedRequestCreatedAt: rejectRequest.createdAt.toISOString(),
        idempotencyKey: randomUUID(),
        requestId: rejectRequest.id,
      });
      assert.equal(rejected.status, "REJECTED");
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: rejectBooking.id } })).startsAt.getTime(), rejectBooking.startsAt.getTime());

      const staleBooking = await createGenericBooking(context, { startsAt: instant(8, 10) });
      const staleRequest = await createCustomerRequest(context, staleBooking, instant(8, 13));
      await prisma.booking.update({ where: { id: staleBooking.id }, data: { notes: "changed" } });
      await assert.rejects(
        respondToOperationalCustomerChangeRequest({ actor, contextOrganizationId: context.fixture.organizationB.id, decision: "accept", expectedBookingVersion: staleBooking.updatedAt.toISOString(), expectedRequestCreatedAt: staleRequest.createdAt.toISOString(), idempotencyKey: randomUUID(), requestId: staleRequest.id }),
        hasCode("STALE_VERSION"),
      );

      const raceBooking = await createGenericBooking(context, { startsAt: instant(9, 10) });
      const raceRequest = await createCustomerRequest(context, raceBooking, instant(9, 13));
      const responses = await Promise.allSettled([
        respondToOperationalCustomerChangeRequest({ actor, contextOrganizationId: context.fixture.organizationB.id, decision: "accept", expectedBookingVersion: raceBooking.updatedAt.toISOString(), expectedRequestCreatedAt: raceRequest.createdAt.toISOString(), idempotencyKey: randomUUID(), requestId: raceRequest.id }),
        respondToOperationalCustomerChangeRequest({ actor, contextOrganizationId: context.fixture.organizationB.id, decision: "reject", expectedBookingVersion: raceBooking.updatedAt.toISOString(), expectedRequestCreatedAt: raceRequest.createdAt.toISOString(), idempotencyKey: randomUUID(), requestId: raceRequest.id }),
      ]);
      assert.equal(responses.filter((result) => result.status === "fulfilled").length, 1);

      const proposalBooking = await createGenericBooking(context, { startsAt: instant(10, 10) });
      const proposalKey = randomUUID();
      const proposalInput = {
        actor,
        bookingId: proposalBooking.id,
        contextOrganizationId: context.fixture.organizationB.id,
        date: localDate(instant(10, 13)),
        expectedBookingVersion: proposalBooking.updatedAt.toISOString(),
        idempotencyKey: proposalKey,
        memberId: null,
        startsAt: instant(10, 13).toISOString(),
        supersedeExistingBusinessProposal: false,
      };
      const proposal = await proposeOperationalBookingChange(proposalInput);
      assert.equal(proposal.status, "PENDING");
      assert.equal((await proposeOperationalBookingChange(proposalInput)).replayed, true);
      assert.equal(await prisma.notification.count({ where: { eventKey: `business-booking-proposal:${context.fixture.organizationB.id}:${proposalKey}` } }), 1);
      await assert.rejects(
        proposeOperationalBookingChange({ ...proposalInput, startsAt: instant(10, 14).toISOString() }),
        hasCode("IDEMPOTENCY_CONFLICT"),
      );
      const customerAccepted = await respondToBusinessBookingProposal({
        customerId: context.fixture.customer.id,
        decision: "accept",
        requestId: proposal.requestId,
      });
      assert.equal(customerAccepted.status, "ACCEPTED");
      assert.equal((await respondToBusinessBookingProposal({ customerId: context.fixture.customer.id, decision: "accept", requestId: proposal.requestId })).replayed, true);
      await assert.rejects(
        respondToBusinessBookingProposal({ customerId: context.fixture.customer.id, decision: "reject", requestId: proposal.requestId }),
        bookingHasCode("BOOKING_STATE_CONFLICT"),
      );

      const protectedBooking = await createGenericBooking(context, { startsAt: instant(11, 10) });
      await createCustomerRequest(context, protectedBooking, instant(11, 13));
      await assert.rejects(
        proposeOperationalBookingChange({ ...proposalInput, bookingId: protectedBooking.id, date: localDate(instant(11, 14)), expectedBookingVersion: protectedBooking.updatedAt.toISOString(), idempotencyKey: randomUUID(), startsAt: instant(11, 14).toISOString() }),
        hasCode("BOOKING_STATE_CONFLICT"),
      );
      const blockedBooking = await createGenericBooking(context, { startsAt: instant(12, 10) });
      await prisma.blockedTime.create({
        data: { branchId: context.fixture.branchB.id, startsAt: instant(12, 13), endsAt: instant(12, 14), reason: "Private" },
      });
      await assert.rejects(
        proposeOperationalBookingChange({ ...proposalInput, bookingId: blockedBooking.id, date: localDate(instant(12, 13)), expectedBookingVersion: blockedBooking.updatedAt.toISOString(), idempotencyKey: randomUUID(), startsAt: instant(12, 13).toISOString() }),
        hasCode("SLOT_UNAVAILABLE"),
      );
      await prisma.service.update({
        where: { id: context.service.id },
        data: { staffSelectionMode: "REQUIRED" },
      });
      const eligibilityBooking = await createGenericBooking(context, {
        startsAt: instant(13, 10),
      });
      const eligibilityBase = {
        ...proposalInput,
        bookingId: eligibilityBooking.id,
        date: localDate(instant(13, 13)),
        expectedBookingVersion: eligibilityBooking.updatedAt.toISOString(),
        idempotencyKey: randomUUID(),
        startsAt: instant(13, 13).toISOString(),
      };
      await assert.rejects(
        proposeOperationalBookingChange({ ...eligibilityBase, memberId: null }),
        hasCode("SLOT_UNAVAILABLE"),
      );
      await assert.rejects(
        proposeOperationalBookingChange({
          ...eligibilityBase,
          idempotencyKey: randomUUID(),
          memberId: context.fixture.ownerB.membership.id,
        }),
        hasCode("SLOT_UNAVAILABLE"),
      );
      await prisma.branchAssignment.create({
        data: {
          branchId: context.fixture.branchB.id,
          memberId: context.fixture.ownerB.membership.id,
        },
      });
      await prisma.serviceStaffAssignment.create({
        data: {
          memberId: context.fixture.ownerB.membership.id,
          serviceId: context.service.id,
        },
      });
      await prisma.availability.create({
        data: {
          branchId: context.fixture.branchB.id,
          dayOfWeek: instant(13, 13).getUTCDay(),
          endTime: "18:00",
          memberId: context.fixture.ownerB.membership.id,
          startTime: "09:00",
        },
      });
      const eligibleProposal = await proposeOperationalBookingChange({
        ...eligibilityBase,
        idempotencyKey: randomUUID(),
        memberId: context.fixture.ownerB.membership.id,
      });
      assert.equal(eligibleProposal.status, "PENDING");
      const detail = await getOperationalBookingDetail(actor, protectedBooking.id);
      assert.equal(detail?.scope, "MANAGEMENT");
      assert.equal(detail && "pendingChangeRequest" in detail ? detail.pendingChangeRequest?.direction : null, "CUSTOMER_TO_BUSINESS");
      const foreignDetail = await getOperationalBookingDetail(context.fixture.owner.reference, protectedBooking.id);
      assert.equal(foreignDetail, null);
    });

    await t.test("Restaurant lifecycle and rescheduling preserve preorder snapshots and serialize table allocation races", async () => {
      await resetBusinessOperationsTestData();
      const fixture = await createBusinessOperationsFixture("stage2c-restaurant");
      const category = await prisma.menuCategory.create({
        data: { businessId: fixture.organizationA.id, name: "Mains" },
      });
      const item = await prisma.menuItem.create({
        data: { businessId: fixture.organizationA.id, currency: "IQD", menuCategoryId: category.id, name: "Original Dish", price: "12000" },
      });
      const small = await prisma.restaurantTable.create({
        data: { area: "Main", branchId: fixture.activeBranch.id, businessId: fixture.organizationA.id, capacity: 2, name: "Small" },
      });
      const large = await prisma.restaurantTable.create({
        data: { area: "Main", branchId: fixture.activeBranch.id, businessId: fixture.organizationA.id, capacity: 6, name: "Large" },
      });
      const reservation = await createFutureRestaurantBooking(fixture, localDate(instant(5, 0)));
      await prisma.restaurantReservationItem.create({
        data: {
          currencySnapshot: "IQD",
          itemNameSnapshot: "Original Dish Snapshot",
          menuItemId: item.id,
          quantity: 2,
          restaurantReservationDetailsId: reservation.restaurantReservation!.id,
          unitPrice: "12000",
        },
      });
      const detail = await getOperationalRestaurantReservationDetail(fixture.owner.reference, reservation.id);
      assert.ok(detail);
      assert.equal(detail.preorder[0]?.name, "Original Dish Snapshot");
      const rescheduleKey = randomUUID();
      const rescheduled = await rescheduleOperationalRestaurantReservation({
        actor: fixture.receptionist.reference,
        bookingId: reservation.id,
        contextOrganizationId: fixture.organizationA.id,
        expectedBookingVersion: detail.bookingVersion,
        expectedReservationVersion: detail.reservationVersion,
        idempotencyKey: rescheduleKey,
        reservation: {
          customerNote: "Window please",
          date: localDate(instant(6, 0)),
          guestCount: 5,
          seatingArea: "Main",
          tableId: null,
          time: "12:00",
        },
      });
      assert.equal(rescheduled.replayed, false);
      const after = await getOperationalRestaurantReservationDetail(fixture.owner.reference, reservation.id);
      assert.equal(after?.table.id, large.id, "smallest sufficient table selected");
      assert.equal(after?.preorder[0]?.name, "Original Dish Snapshot");
      assert.equal(after?.preorder[0]?.unitPrice, "12000");
      assert.equal((await rescheduleOperationalRestaurantReservation({
        actor: fixture.receptionist.reference,
        bookingId: reservation.id,
        contextOrganizationId: fixture.organizationA.id,
        expectedBookingVersion: detail.bookingVersion,
        expectedReservationVersion: detail.reservationVersion,
        idempotencyKey: rescheduleKey,
        reservation: { customerNote: "Window please", date: localDate(instant(6, 0)), guestCount: 5, seatingArea: "Main", tableId: null, time: "12:00" },
      })).replayed, true);
      assert.equal(await prisma.notification.count({ where: { eventKey: `business-restaurant:${fixture.organizationA.id}:${rescheduleKey}:rescheduled` } }), 1);

      const explicit = await createFutureRestaurantBooking(fixture, localDate(instant(7, 0)));
      const explicitDetail = await getOperationalRestaurantReservationDetail(fixture.owner.reference, explicit.id);
      await assert.rejects(
        rescheduleOperationalRestaurantReservation({
          actor: fixture.owner.reference,
          bookingId: explicit.id,
          contextOrganizationId: fixture.organizationA.id,
          expectedBookingVersion: explicitDetail!.bookingVersion,
          expectedReservationVersion: explicitDetail!.reservationVersion,
          idempotencyKey: randomUUID(),
          reservation: { customerNote: null, date: localDate(instant(8, 0)), guestCount: 4, seatingArea: "Main", tableId: small.id, time: "12:00" },
        }),
        hasCode("TABLE_RESERVATION_CONFLICT"),
      );

      const race = await createFutureRestaurantBooking(fixture, localDate(instant(9, 0)));
      const raceDetail = await getOperationalRestaurantReservationDetail(fixture.owner.reference, race.id);
      const rescheduleInput = {
        actor: fixture.owner.reference,
        bookingId: race.id,
        contextOrganizationId: fixture.organizationA.id,
        expectedBookingVersion: raceDetail!.bookingVersion,
        expectedReservationVersion: raceDetail!.reservationVersion,
        idempotencyKey: randomUUID(),
        reservation: { customerNote: null, date: localDate(instant(10, 0)), guestCount: 2, seatingArea: null, tableId: null, time: "12:00" },
      };
      const raceResults = await Promise.allSettled([
        rescheduleOperationalRestaurantReservation(rescheduleInput),
        transitionOperationalBooking({ actor: fixture.manager.reference, bookingId: race.id, cancellationReason: "Restaurant unavailable", contextOrganizationId: fixture.organizationA.id, expectedVersion: raceDetail!.bookingVersion, idempotencyKey: randomUUID(), nextStatus: "CANCELLED" }),
      ]);
      assert.equal(raceResults.filter((result) => result.status === "fulfilled").length, 1);

      const simultaneous = await createFutureRestaurantBooking(fixture, localDate(instant(11, 0)));
      const simultaneousDetail = await getOperationalRestaurantReservationDetail(fixture.owner.reference, simultaneous.id);
      const common = {
        actor: fixture.owner.reference,
        bookingId: simultaneous.id,
        contextOrganizationId: fixture.organizationA.id,
        expectedBookingVersion: simultaneousDetail!.bookingVersion,
        expectedReservationVersion: simultaneousDetail!.reservationVersion,
      };
      const simultaneousResults = await Promise.allSettled([
        rescheduleOperationalRestaurantReservation({ ...common, idempotencyKey: randomUUID(), reservation: { customerNote: null, date: localDate(instant(12, 0)), guestCount: 2, seatingArea: null, tableId: null, time: "12:00" } }),
        rescheduleOperationalRestaurantReservation({ ...common, idempotencyKey: randomUUID(), reservation: { customerNote: null, date: localDate(instant(12, 0)), guestCount: 2, seatingArea: null, tableId: null, time: "13:00" } }),
      ]);
      assert.equal(simultaneousResults.filter((result) => result.status === "fulfilled").length, 1);

      const pendingRestaurantSeed = await createFutureRestaurantBooking(
        fixture,
        localDate(instant(13, 0)),
      );
      const pendingRestaurant = await prisma.booking.update({
        where: { id: pendingRestaurantSeed.id },
        data: { status: "PENDING" },
      });
      const confirmedRestaurant = await transitionOperationalBooking({
        actor: fixture.receptionist.reference,
        bookingId: pendingRestaurant.id,
        cancellationReason: null,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: pendingRestaurant.updatedAt.toISOString(),
        idempotencyKey: randomUUID(),
        nextStatus: "CONFIRMED",
      });
      await transitionOperationalBooking({
        actor: fixture.receptionist.reference,
        bookingId: pendingRestaurant.id,
        cancellationReason: "Restaurant closure",
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: confirmedRestaurant.version,
        idempotencyKey: randomUUID(),
        nextStatus: "CANCELLED",
      });

      const pastRestaurant = await createFutureRestaurantBooking(fixture, localDate(instant(-2, 0)));
      await prisma.booking.update({ where: { id: pastRestaurant.id }, data: { startsAt: instant(-1, 12), endsAt: instant(-1, 13, 30) } });
      for (const status of ["COMPLETED", "NO_SHOW"] as const) {
        const candidate = status === "COMPLETED" ? pastRestaurant : await createFutureRestaurantBooking(fixture, localDate(instant(-2, 0)));
        if (status === "NO_SHOW") await prisma.booking.update({ where: { id: candidate.id }, data: { startsAt: instant(-1, 14), endsAt: instant(-1, 15, 30) } });
        const current = await prisma.booking.findUniqueOrThrow({ where: { id: candidate.id } });
        await transitionOperationalBooking({ actor: fixture.owner.reference, bookingId: candidate.id, cancellationReason: null, contextOrganizationId: fixture.organizationA.id, expectedVersion: current.updatedAt.toISOString(), idempotencyKey: randomUUID(), nextStatus: status });
      }
    });

    await t.test("Restaurant tables and menu use tenant-safe versioned lifecycle with historical preservation", async () => {
      await resetBusinessOperationsTestData();
      const fixture = await createBusinessOperationsFixture("stage2c-catalog");
      const createTableKey = randomUUID();
      const createTableInput = {
        actor: fixture.owner.reference,
        contextOrganizationId: fixture.organizationA.id,
        idempotencyKey: createTableKey,
        table: { area: "Patio", branchId: fixture.activeBranch.id, capacity: 4, code: "P4", floor: "1", name: "Patio 4", positionLabel: "North" },
      };
      const createdTable = await createOperationalRestaurantTable(createTableInput);
      const tableUpdateInput = {
        area: createTableInput.table.area,
        capacity: createTableInput.table.capacity,
        code: createTableInput.table.code,
        floor: createTableInput.table.floor,
        name: createTableInput.table.name,
        positionLabel: createTableInput.table.positionLabel,
      };
      assert.equal((await createOperationalRestaurantTable(createTableInput)).replayed, true);
      await assert.rejects(
        createOperationalRestaurantTable({ ...createTableInput, table: { ...createTableInput.table, name: "Changed" } }),
        hasCode("IDEMPOTENCY_CONFLICT"),
      );
      await updateOperationalRestaurantTable({
        actor: fixture.manager.reference,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: createdTable.version,
        idempotencyKey: randomUUID(),
        table: { ...tableUpdateInput, capacity: 5, name: "Patio Five" },
        tableId: createdTable.tableId,
      });
      assert.equal((await prisma.restaurantTable.findUniqueOrThrow({ where: { id: createdTable.tableId } })).capacity, 5);
      await assert.rejects(
        updateOperationalRestaurantTable({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: createdTable.version, idempotencyKey: randomUUID(), table: tableUpdateInput, tableId: createdTable.tableId }),
        hasCode("STALE_VERSION"),
      );
      await assert.rejects(
        createOperationalRestaurantTable({ ...createTableInput, actor: fixture.receptionist.reference, idempotencyKey: randomUUID() }),
        hasCode("FORBIDDEN"),
      );
      const receptionistTables = await listOperationalRestaurantTables(fixture.receptionist.reference);
      assert.equal(receptionistTables.canWrite, false);
      assert.equal(receptionistTables.tables.every((table) => table.isActive && table.version === undefined), true);

      const futureReservation = await createFutureRestaurantBooking(fixture, localDate(instant(6, 0)));
      const assignedTable = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: fixture.table.id } });
      await assert.rejects(
        setOperationalRestaurantTableActive({ active: false, actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: assignedTable.updatedAt.toISOString(), idempotencyKey: randomUUID(), tableId: assignedTable.id }),
        hasCode("TABLE_RESERVATION_CONFLICT"),
      );
      await assert.rejects(
        removeOperationalRestaurantTable({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: assignedTable.updatedAt.toISOString(), idempotencyKey: randomUUID(), tableId: assignedTable.id }),
        hasCode("HISTORICAL_RELATIONSHIP_CONFLICT"),
      );
      await prisma.booking.update({ where: { id: futureReservation.id }, data: { status: "CANCELLED" } });
      const deactivated = await setOperationalRestaurantTableActive({ active: false, actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: assignedTable.updatedAt.toISOString(), idempotencyKey: randomUUID(), tableId: assignedTable.id });
      assert.equal((await prisma.restaurantTable.findUniqueOrThrow({ where: { id: assignedTable.id } })).isActive, false);
      assert.ok(deactivated.version);

      const unused = await prisma.restaurantTable.create({ data: { branchId: fixture.activeBranch.id, businessId: fixture.organizationA.id, capacity: 2, name: "Unused" } });
      const removeKey = randomUUID();
      await removeOperationalRestaurantTable({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: unused.updatedAt.toISOString(), idempotencyKey: removeKey, tableId: unused.id });
      assert.equal(await prisma.restaurantTable.count({ where: { id: unused.id } }), 0);
      assert.equal((await removeOperationalRestaurantTable({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: unused.updatedAt.toISOString(), idempotencyKey: removeKey, tableId: unused.id })).replayed, true);

      const categoryKey = randomUUID();
      const category = await createOperationalMenuCategory({ actor: fixture.owner.reference, category: { description: "Hot dishes", name: "Mains", sortOrder: 10 }, contextOrganizationId: fixture.organizationA.id, idempotencyKey: categoryKey });
      assert.equal((await createOperationalMenuCategory({ actor: fixture.owner.reference, category: { description: "Hot dishes", name: "Mains", sortOrder: 10 }, contextOrganizationId: fixture.organizationA.id, idempotencyKey: categoryKey })).replayed, true);
      const categoryUpdated = await updateOperationalMenuCategory({ actor: fixture.manager.reference, category: { description: "Updated", name: "Main dishes", sortOrder: 20 }, categoryId: category.categoryId, contextOrganizationId: fixture.organizationA.id, expectedVersion: category.version, idempotencyKey: randomUUID() });
      const maximumPriceItem = await createOperationalMenuItem({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), item: { currency: "IQD", description: "Decimal boundary", imageUrl: "", menuCategoryId: category.categoryId, name: "Maximum price", preparationMinutes: null, price: "99999999.99", sortOrder: 0 } });
      assert.equal((await prisma.menuItem.findUniqueOrThrow({ where: { id: maximumPriceItem.itemId } })).price.toString(), "99999999.99");
      const overflowMutationCount = await prisma.businessOperationMutation.count({ where: { organizationId: fixture.organizationA.id } });
      await assert.rejects(
        createOperationalMenuItem({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), item: { currency: "IQD", description: "Overflow", imageUrl: "", menuCategoryId: category.categoryId, name: "Overflow price", preparationMinutes: null, price: "100000000", sortOrder: 0 } }),
        hasCode("INVALID_REQUEST"),
      );
      assert.equal(await prisma.menuItem.count({ where: { businessId: fixture.organizationA.id, name: "Overflow price" } }), 0);
      assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: fixture.organizationA.id } }), overflowMutationCount);
      const item = await createOperationalMenuItem({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), item: { currency: "iqd", description: "Dish", imageUrl: "https://example.test/item.jpg", menuCategoryId: category.categoryId, name: "Dish", preparationMinutes: 15, price: "10000", sortOrder: 1 } });
      const reservation = await createFutureRestaurantBooking(fixture, localDate(instant(7, 0)));
      await prisma.restaurantReservationItem.create({ data: { currencySnapshot: "IQD", itemNameSnapshot: "Dish Snapshot", menuItemId: item.itemId, quantity: 1, restaurantReservationDetailsId: reservation.restaurantReservation!.id, unitPrice: "10000" } });
      const itemUpdated = await updateOperationalMenuItem({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: item.version, idempotencyKey: randomUUID(), item: { currency: "USD", description: "Changed", imageUrl: "", menuCategoryId: category.categoryId, name: "Renamed Dish", preparationMinutes: 25, price: "12.50", sortOrder: 2 }, itemId: item.itemId });
      const snapshot = await prisma.restaurantReservationItem.findFirstOrThrow({ where: { menuItemId: item.itemId } });
      assert.equal(snapshot.itemNameSnapshot, "Dish Snapshot");
      assert.equal(snapshot.currencySnapshot, "IQD");
      assert.equal(snapshot.unitPrice.toString(), "10000");
      await setOperationalMenuItemAvailable({ actor: fixture.owner.reference, available: false, contextOrganizationId: fixture.organizationA.id, expectedVersion: itemUpdated.version, idempotencyKey: randomUUID(), itemId: item.itemId });
      await assert.rejects(
        removeOperationalMenuItem({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: (await prisma.menuItem.findUniqueOrThrow({ where: { id: item.itemId } })).updatedAt.toISOString(), idempotencyKey: randomUUID(), itemId: item.itemId }),
        hasCode("HISTORICAL_RELATIONSHIP_CONFLICT"),
      );
      const categoryCurrent = await prisma.menuCategory.findUniqueOrThrow({ where: { id: category.categoryId } });
      await setOperationalMenuCategoryActive({ active: false, actor: fixture.manager.reference, categoryId: category.categoryId, contextOrganizationId: fixture.organizationA.id, expectedVersion: categoryCurrent.updatedAt.toISOString(), idempotencyKey: randomUUID() });
      await assert.rejects(
        removeOperationalMenuCategory({ actor: fixture.owner.reference, categoryId: category.categoryId, contextOrganizationId: fixture.organizationA.id, expectedVersion: (await prisma.menuCategory.findUniqueOrThrow({ where: { id: category.categoryId } })).updatedAt.toISOString(), idempotencyKey: randomUUID() }),
        hasCode("HISTORICAL_RELATIONSHIP_CONFLICT"),
      );
      await assert.rejects(
        createOperationalMenuItem({ actor: fixture.receptionist.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), item: { currency: "IQD", description: "Denied", imageUrl: "", menuCategoryId: category.categoryId, name: "Denied", preparationMinutes: null, price: "1", sortOrder: 1 } }),
        hasCode("FORBIDDEN"),
      );
      const receptionistMenu = await listOperationalRestaurantMenu(fixture.receptionist.reference);
      assert.equal(receptionistMenu.canWrite, false);
      assert.equal(receptionistMenu.categories.every((entry) => entry.isActive), true);
      assert.equal(receptionistMenu.categories.flatMap((entry) => entry.items).every((entry) => entry.isAvailable && entry.version === undefined), true);
      const foreignTable = await prisma.restaurantTable.create({ data: { branchId: fixture.branchB.id, businessId: fixture.organizationB.id, capacity: 4, name: "Foreign" } });
      await assert.rejects(
        updateOperationalRestaurantTable({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: foreignTable.updatedAt.toISOString(), idempotencyKey: randomUUID(), table: tableUpdateInput, tableId: foreignTable.id }),
        hasCode("TABLE_NOT_FOUND"),
      );
      assert.ok(categoryUpdated.version);
      assert.equal(await prisma.businessAuditLog.count({ where: { organizationId: fixture.organizationA.id } }) > 0, true);
      assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: fixture.organizationA.id } }) > 0, true);
      const audit = await prisma.businessAuditLog.findFirst({ where: { targetId: item.itemId }, orderBy: { createdAt: "desc" } });
      assert.equal(JSON.stringify(audit).includes("DATABASE_URL"), false);
      assert.equal(
        fixture.customer.phone
          ? JSON.stringify(audit).includes(fixture.customer.phone)
          : false,
        false,
      );
      assert.equal(await prisma.restaurantReservationItem.count({ where: { menuItemId: item.itemId } }), 1);
    });

    await t.test("Restaurant table Branch and capacity updates preserve every reservation relationship", async () => {
      await resetBusinessOperationsTestData();
      const fixture = await createBusinessOperationsFixture("stage2c-table-integrity");
      const branchB = await prisma.branch.create({
        data: {
          name: "Second Restaurant Branch",
          organizationId: fixture.organizationA.id,
          slug: "second-restaurant",
          status: "ACTIVE",
          timezone: "UTC",
        },
      });
      const table = await prisma.restaurantTable.create({
        data: {
          area: "Main",
          branchId: fixture.activeBranch.id,
          businessId: fixture.organizationA.id,
          capacity: 6,
          code: "INTEGRITY-6",
          floor: "1",
          name: "Integrity Table",
          positionLabel: "Window",
        },
      });
      const createReservation = async (
        status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED",
        startsAt: Date,
        guestCount: number,
      ) => prisma.booking.create({
        data: {
          branchId: fixture.activeBranch.id,
          customerId: fixture.customer.id,
          customerNameSnapshot: `${status} integrity customer`,
          endsAt: new Date(startsAt.getTime() + 90 * 60_000),
          organizationId: fixture.organizationA.id,
          priceSnapshot: "0",
          restaurantReservation: {
            create: {
              branchId: fixture.activeBranch.id,
              businessId: fixture.organizationA.id,
              durationMinutes: 90,
              guestCount,
              reservationDateTime: startsAt,
              tableId: table.id,
            },
          },
          serviceNameSnapshot: "Integrity reservation",
          startsAt,
          status,
        },
        include: { restaurantReservation: true },
      });
      const future = await createReservation("CONFIRMED", instant(6, 12), 5);
      const completed = await createReservation("COMPLETED", instant(-4, 12), 3);
      const cancelled = await createReservation("CANCELLED", instant(-3, 12), 4);
      const historicalBefore = await prisma.booking.findMany({
        where: { id: { in: [completed.id, cancelled.id] } },
        include: { restaurantReservation: true },
        orderBy: { id: "asc" },
      });
      const updateInput = {
        area: table.area,
        capacity: table.capacity,
        code: table.code,
        floor: table.floor,
        name: "Integrity Table Renamed",
        positionLabel: table.positionLabel,
      };
      const renamed = await updateOperationalRestaurantTable({
        actor: fixture.owner.reference,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: table.updatedAt.toISOString(),
        idempotencyKey: randomUUID(),
        table: updateInput,
        tableId: table.id,
      });
      assert.equal((await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } })).name, updateInput.name);

      const deniedAuditCount = await prisma.businessAuditLog.count({
        where: { organizationId: fixture.organizationA.id },
      });
      const deniedMutationCount = await prisma.businessOperationMutation.count({
        where: { organizationId: fixture.organizationA.id },
      });
      await assert.rejects(
        updateOperationalRestaurantTable({
          actor: fixture.owner.reference,
          contextOrganizationId: fixture.organizationA.id,
          expectedVersion: renamed.version,
          idempotencyKey: randomUUID(),
          table: { ...updateInput, branchId: branchB.id },
          tableId: table.id,
        }),
        hasCode("INVALID_REQUEST"),
      );
      const afterForgedBranch = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } });
      assert.equal(afterForgedBranch.branchId, fixture.activeBranch.id);
      for (const booking of [future, completed, cancelled]) {
        const current = await prisma.booking.findUniqueOrThrow({
          where: { id: booking.id },
          include: { restaurantReservation: true },
        });
        assert.equal(current.branchId, fixture.activeBranch.id);
        assert.equal(current.restaurantReservation?.branchId, fixture.activeBranch.id);
        assert.equal(current.restaurantReservation?.tableId, table.id);
      }
      await assert.rejects(
        updateOperationalRestaurantTable({
          actor: fixture.owner.reference,
          contextOrganizationId: fixture.organizationA.id,
          expectedVersion: renamed.version,
          idempotencyKey: randomUUID(),
          table: { ...updateInput, capacity: 4 },
          tableId: table.id,
        }),
        (error: unknown) =>
          error instanceof BusinessOperationsError &&
          error.code === "TABLE_RESERVATION_CONFLICT" &&
          error.details?.affectedReservations === 1,
      );
      assert.equal((await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } })).capacity, 6);
      assert.equal(await prisma.businessAuditLog.count({ where: { organizationId: fixture.organizationA.id } }), deniedAuditCount);
      assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: fixture.organizationA.id } }), deniedMutationCount);
      assert.ok(await getOperationalRestaurantReservationDetail(fixture.owner.reference, completed.id));
      assert.ok(await getOperationalRestaurantReservationDetail(fixture.owner.reference, cancelled.id));

      const increaseKey = randomUUID();
      const increasedInput = { ...updateInput, capacity: 7 };
      const increased = await updateOperationalRestaurantTable({
        actor: fixture.manager.reference,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: renamed.version,
        idempotencyKey: increaseKey,
        table: increasedInput,
        tableId: table.id,
      });
      assert.equal((await updateOperationalRestaurantTable({
        actor: fixture.manager.reference,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: renamed.version,
        idempotencyKey: increaseKey,
        table: increasedInput,
        tableId: table.id,
      })).replayed, true);
      await assert.rejects(
        updateOperationalRestaurantTable({
          actor: fixture.manager.reference,
          contextOrganizationId: fixture.organizationA.id,
          expectedVersion: renamed.version,
          idempotencyKey: increaseKey,
          table: { ...increasedInput, capacity: 8 },
          tableId: table.id,
        }),
        hasCode("IDEMPOTENCY_CONFLICT"),
      );
      await assert.rejects(
        updateOperationalRestaurantTable({
          actor: fixture.owner.reference,
          contextOrganizationId: fixture.organizationA.id,
          expectedVersion: renamed.version,
          idempotencyKey: randomUUID(),
          table: { ...increasedInput, capacity: 8 },
          tableId: table.id,
        }),
        hasCode("STALE_VERSION"),
      );
      const foreignTable = await prisma.restaurantTable.create({
        data: { branchId: fixture.branchB.id, businessId: fixture.organizationB.id, capacity: 9, name: "Foreign Integrity" },
      });
      await assert.rejects(
        updateOperationalRestaurantTable({
          actor: fixture.owner.reference,
          contextOrganizationId: fixture.organizationA.id,
          expectedVersion: foreignTable.updatedAt.toISOString(),
          idempotencyKey: randomUUID(),
          table: { ...increasedInput, capacity: 9 },
          tableId: foreignTable.id,
        }),
        hasCode("TABLE_NOT_FOUND"),
      );
      await prisma.booking.update({ where: { id: future.id }, data: { status: "CANCELLED" } });
      const reduced = await updateOperationalRestaurantTable({
        actor: fixture.owner.reference,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: increased.version,
        idempotencyKey: randomUUID(),
        table: { ...updateInput, capacity: 4 },
        tableId: table.id,
      });
      assert.ok(reduced.version);
      assert.equal((await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } })).capacity, 4);
      const historicalAfter = await prisma.booking.findMany({
        where: { id: { in: [completed.id, cancelled.id] } },
        include: { restaurantReservation: true },
        orderBy: { id: "asc" },
      });
      assert.deepEqual(historicalAfter, historicalBefore);
      assert.ok(await getOperationalRestaurantReservationDetail(fixture.owner.reference, completed.id));
      assert.ok(await getOperationalRestaurantReservationDetail(fixture.owner.reference, cancelled.id));
    });

    await t.test("capacity reductions and Restaurant reschedules serialize without an invalid final assignment", async () => {
      await resetBusinessOperationsTestData();
      const fixture = await createBusinessOperationsFixture("stage2c-table-races");
      const table = await prisma.restaurantTable.update({
        where: { id: fixture.table.id },
        data: { capacity: 6 },
      });
      const reservation = await createFutureRestaurantBooking(
        fixture,
        localDate(instant(6, 0)),
      );
      const detail = await getOperationalRestaurantReservationDetail(
        fixture.owner.reference,
        reservation.id,
      );
      assert.ok(detail);
      const updateInput = {
        area: table.area,
        capacity: 4,
        code: table.code,
        floor: table.floor,
        name: table.name,
        positionLabel: table.positionLabel,
      };
      const raceResults = await Promise.allSettled([
        updateOperationalRestaurantTable({
          actor: fixture.owner.reference,
          contextOrganizationId: fixture.organizationA.id,
          expectedVersion: table.updatedAt.toISOString(),
          idempotencyKey: randomUUID(),
          table: updateInput,
          tableId: table.id,
        }),
        rescheduleOperationalRestaurantReservation({
          actor: fixture.manager.reference,
          bookingId: reservation.id,
          contextOrganizationId: fixture.organizationA.id,
          expectedBookingVersion: detail.bookingVersion,
          expectedReservationVersion: detail.reservationVersion,
          idempotencyKey: randomUUID(),
          reservation: {
            customerNote: null,
            date: localDate(reservation.startsAt),
            guestCount: 5,
            seatingArea: null,
            tableId: table.id,
            time: "14:00",
          },
        }),
      ]);
      assert.equal(raceResults.filter((result) => result.status === "fulfilled").length, 1);
      const afterRaceTable = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } });
      const afterRaceDetails = await prisma.restaurantReservationDetails.findUniqueOrThrow({ where: { bookingId: reservation.id } });
      assert.equal(afterRaceDetails.guestCount <= afterRaceTable.capacity, true);
      assert.equal(await prisma.businessAuditLog.count({ where: { organizationId: fixture.organizationA.id } }), 1);
      assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: fixture.organizationA.id } }), 1);

      const firstCapacityKey = randomUUID();
      const secondCapacityKey = randomUUID();
      const capacityResults = await Promise.allSettled([
        updateOperationalRestaurantTable({
          actor: fixture.owner.reference,
          contextOrganizationId: fixture.organizationA.id,
          expectedVersion: afterRaceTable.updatedAt.toISOString(),
          idempotencyKey: firstCapacityKey,
          table: { ...updateInput, capacity: 7 },
          tableId: table.id,
        }),
        updateOperationalRestaurantTable({
          actor: fixture.manager.reference,
          contextOrganizationId: fixture.organizationA.id,
          expectedVersion: afterRaceTable.updatedAt.toISOString(),
          idempotencyKey: secondCapacityKey,
          table: { ...updateInput, capacity: 8 },
          tableId: table.id,
        }),
      ]);
      assert.equal(capacityResults.filter((result) => result.status === "fulfilled").length, 1);
      const finalTable = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } });
      const finalDetails = await prisma.restaurantReservationDetails.findUniqueOrThrow({ where: { bookingId: reservation.id } });
      assert.equal([7, 8].includes(finalTable.capacity), true);
      assert.equal(finalDetails.guestCount <= finalTable.capacity, true);
      assert.equal(await prisma.businessAuditLog.count({ where: { organizationId: fixture.organizationA.id } }), 2);
      assert.equal(await prisma.businessOperationMutation.count({ where: { organizationId: fixture.organizationA.id } }), 2);
      assert.equal(
        await prisma.businessOperationMutation.count({
          where: { idempotencyKey: { in: [firstCapacityKey, secondCapacityKey] } },
        }),
        1,
      );
    });
  },
);
