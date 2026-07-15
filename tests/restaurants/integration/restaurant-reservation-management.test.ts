import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { RestaurantReservationError } from "../../../features/restaurants/domain/reservation-errors";
import { createCustomerRestaurantReservation } from "../../../features/restaurants/services/reservation-creation";
import { getRestaurantReservationDetailForCustomer } from "../../../features/restaurants/services/reservation-detail";
import {
  cancelCustomerRestaurantReservation,
  getCustomerRestaurantRescheduleOptions,
  listCustomerRestaurantReservations,
  rescheduleCustomerRestaurantReservation,
} from "../../../features/restaurants/services/reservation-management";
import { getPublicRestaurantReservationAvailability } from "../../../features/restaurants/services/reservation-public";
import { prisma } from "../../../lib/db/prisma";
import {
  createRestaurantFixture,
  resetRestaurantTestData,
} from "../helpers/restaurant-fixture";

type Fixture = Awaited<ReturnType<typeof createRestaurantFixture>>;

function reservationCode(code: RestaurantReservationError["code"]) {
  return (error: unknown) =>
    error instanceof RestaurantReservationError && error.code === code;
}

async function createManagedReservation(
  fixture: Fixture,
  input: {
    guestCount?: number;
    preorder?: boolean;
    slotIndex?: number;
  } = {},
) {
  const guestCount = input.guestCount ?? 2;
  const availability = await getPublicRestaurantReservationAvailability({
    branchId: fixture.branch.id,
    date: fixture.date,
    guestCount,
    seatingArea: null,
  });
  const slot = availability.slots[input.slotIndex ?? 0];
  assert.ok(slot, availability.reason ?? "No Restaurant slot");
  return createCustomerRestaurantReservation({
    businessSlug: fixture.organization.slug,
    branchId: fixture.branch.id,
    customerId: fixture.customer.id,
    customerNote: "Original note",
    date: fixture.date,
    guestCount,
    idempotencyKey: randomUUID(),
    preorderItems: input.preorder
      ? [{ itemId: fixture.menuItem.id, quantity: 2 }]
      : [],
    seatingArea: null,
    startsAt: slot.startsAt,
  });
}

test(
  "Gate 2E Restaurant reservation management is owned, immediate, replay-safe, and capacity-safe",
  { concurrency: false },
  async (t) => {
    await resetRestaurantTestData();
    t.after(async () => {
      await resetRestaurantTestData();
      await prisma.$disconnect();
    });

    await t.test("list tabs, counts, cursor pages, ownership, and preorder snapshots remain authoritative", async () => {
      await resetRestaurantTestData();
      const fixture = await createRestaurantFixture({ label: "gate2e-list" });
      const upcoming = await createManagedReservation(fixture, { preorder: true });
      const completed = await createManagedReservation(fixture, { slotIndex: 2 });
      const cancelled = await createManagedReservation(fixture, { slotIndex: 4 });
      await prisma.booking.update({
        where: { id: completed.reservation.id },
        data: { status: "COMPLETED" },
      });
      await prisma.booking.update({
        where: { id: cancelled.reservation.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      await prisma.menuItem.update({
        where: { id: fixture.menuItem.id },
        data: { name: "Renamed current menu item", currency: "USD" },
      });
      await prisma.organization.update({
        where: { id: fixture.organization.id },
        data: { isActive: false, status: "INACTIVE" },
      });

      const first = await listCustomerRestaurantReservations({
        customerId: fixture.customer.id,
        tab: "all",
        limit: 1,
      });
      assert.deepEqual(first.counts, {
        all: 3,
        upcoming: 1,
        completed: 1,
        cancelled: 1,
      });
      assert.ok(first.nextCursor);
      const second = await listCustomerRestaurantReservations({
        customerId: fixture.customer.id,
        tab: "all",
        cursor: first.nextCursor,
        limit: 1,
      });
      assert.notEqual(first.items[0]!.id, second.items[0]!.id);
      await assert.rejects(
        listCustomerRestaurantReservations({
          customerId: fixture.customer.id,
          tab: "completed",
          cursor: first.nextCursor,
        }),
        reservationCode("INVALID_REQUEST"),
      );
      const detail = await getRestaurantReservationDetailForCustomer(
        fixture.customer.id,
        upcoming.reservation.id,
      );
      assert.equal(detail?.preorderItems[0]?.name, `${fixture.organization.slug.replace("-restaurant", "")} Dish`);
      assert.equal(detail?.preorderItems[0]?.currency, "IQD");
      await prisma.restaurantReservationItem.updateMany({
        where: {
          reservation: { bookingId: upcoming.reservation.id },
        },
        data: { itemNameSnapshot: null, currencySnapshot: null },
      });
      const legacyDetail = await getRestaurantReservationDetailForCustomer(
        fixture.customer.id,
        upcoming.reservation.id,
      );
      assert.equal(legacyDetail?.preorderItems[0]?.name, "Renamed current menu item");
      assert.equal(legacyDetail?.preorderItems[0]?.currency, "USD");
      const stranger = await prisma.person.create({
        data: {
          authUserId: `gate2e-stranger-${randomUUID()}`,
          firstName: "Stranger",
          isOnboarded: true,
          phone: "+9647500000099",
        },
      });
      assert.equal(
        await getRestaurantReservationDetailForCustomer(
          stranger.id,
          upcoming.reservation.id,
        ),
        null,
      );
    });

    await t.test("customer activity is safe, canonical, replay-deduplicated, and legacy-readable", async () => {
      await resetRestaurantTestData();
      const fixture = await createRestaurantFixture({ label: "gate2e-safe-activity" });
      const created = await createManagedReservation(fixture);
      const internalNote = "INTERNAL: move this customer away from the kitchen";
      await prisma.bookingStatusHistory.updateMany({
        where: { bookingId: created.reservation.id },
        data: { note: internalNote },
      });
      await prisma.bookingStatusHistory.create({
        data: {
          bookingId: created.reservation.id,
          fromStatus: "CONFIRMED",
          toStatus: "CONFIRMED",
          note: "LEGACY INTERNAL NOTE: manager approval required",
        },
      });

      const legacyDetail = await getRestaurantReservationDetailForCustomer(
        fixture.customer.id,
        created.reservation.id,
      );
      assert.deepEqual(
        legacyDetail?.activityHistory.map((activity) => activity.kind),
        ["CREATED"],
      );
      assert.equal("statusHistory" in (legacyDetail ?? {}), false);
      assert.doesNotMatch(JSON.stringify(legacyDetail), /INTERNAL|manager approval/);

      const options = await getCustomerRestaurantRescheduleOptions({
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        date: fixture.date,
        guestCount: 2,
        seatingArea: null,
      });
      assert.ok(options.slots[0]);
      const rescheduleKey = randomUUID();
      const rescheduleInput = {
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        customerNote: "Customer-visible reservation note",
        date: fixture.date,
        guestCount: 2,
        idempotencyKey: rescheduleKey,
        seatingArea: null,
        startsAt: options.slots[0]!.startsAt,
      };
      assert.equal(
        (await rescheduleCustomerRestaurantReservation(rescheduleInput)).replayed,
        false,
      );
      assert.equal(
        (await rescheduleCustomerRestaurantReservation(rescheduleInput)).replayed,
        true,
      );
      const afterReschedule = await getRestaurantReservationDetailForCustomer(
        fixture.customer.id,
        created.reservation.id,
      );
      assert.deepEqual(
        afterReschedule?.activityHistory.map((activity) => activity.kind),
        ["CREATED", "RESCHEDULED"],
      );

      const cancellationKey = randomUUID();
      const cancellationInput = {
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        idempotencyKey: cancellationKey,
        reason: "Customer plans changed",
      };
      assert.equal(
        (await cancelCustomerRestaurantReservation(cancellationInput)).replayed,
        false,
      );
      assert.equal(
        (await cancelCustomerRestaurantReservation(cancellationInput)).replayed,
        true,
      );
      await prisma.bookingStatusHistory.updateMany({
        where: { bookingId: created.reservation.id },
        data: { note: internalNote },
      });
      const finalDetail = await getRestaurantReservationDetailForCustomer(
        fixture.customer.id,
        created.reservation.id,
      );
      assert.deepEqual(
        finalDetail?.activityHistory.map((activity) => activity.kind),
        ["CREATED", "RESCHEDULED", "CANCELLED"],
      );
      assert.equal(finalDetail?.cancellation.reason, "Customer plans changed");
      assert.equal(
        finalDetail?.activityHistory.filter(
          (activity) => activity.kind === "RESCHEDULED",
        ).length,
        1,
      );
      assert.equal(
        finalDetail?.activityHistory.filter(
          (activity) => activity.kind === "CANCELLED",
        ).length,
        1,
      );
      assert.doesNotMatch(
        JSON.stringify(finalDetail?.activityHistory),
        /INTERNAL|Customer plans changed|manager approval/,
      );
    });

    await t.test("cancellation works for owned historical business records and is exact under replay", async () => {
      await resetRestaurantTestData();
      const fixture = await createRestaurantFixture({ label: "gate2e-cancel" });
      const created = await createManagedReservation(fixture);
      await prisma.organization.update({
        where: { id: fixture.organization.id },
        data: { isActive: false, status: "INACTIVE" },
      });
      const idempotencyKey = randomUUID();
      const first = await cancelCustomerRestaurantReservation({
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        idempotencyKey,
        reason: "Plans changed",
      });
      assert.equal(first.replayed, false);
      const replay = await cancelCustomerRestaurantReservation({
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        idempotencyKey,
        reason: "Plans changed",
      });
      assert.equal(replay.replayed, true);
      await assert.rejects(
        cancelCustomerRestaurantReservation({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          idempotencyKey,
          reason: "Different",
        }),
        reservationCode("IDEMPOTENCY_CONFLICT"),
      );
      const persisted = await prisma.booking.findUniqueOrThrow({
        where: { id: created.reservation.id },
      });
      assert.equal(persisted.status, "CANCELLED");
      assert.equal(persisted.cancellationReason, "Plans changed");
      assert.equal(
        await prisma.restaurantReservationMutation.count({
          where: { bookingId: persisted.id, type: "CANCELLATION" },
        }),
        1,
      );
      assert.equal(
        await prisma.notification.count({
          where: {
            eventKey: { startsWith: `restaurant-reservation:${persisted.id}:cancelled:` },
          },
        }),
        1,
      );
      assert.equal(
        await prisma.bookingStatusHistory.count({ where: { bookingId: persisted.id } }),
        2,
      );
      await assert.rejects(
        cancelCustomerRestaurantReservation({
          bookingId: persisted.id,
          customerId: fixture.customer.id,
          idempotencyKey: randomUUID(),
          reason: null,
        }),
        reservationCode("BOOKING_NOT_CANCELLABLE"),
      );
    });

    await t.test("cancellation releases allocation and deleted business records remain readable but not reschedulable", async () => {
      await resetRestaurantTestData();
      const cancellationFixture = await createRestaurantFixture({
        label: "gate2e-release",
        tableCapacities: [2],
      });
      const cancelled = await createManagedReservation(cancellationFixture);
      await cancelCustomerRestaurantReservation({
        bookingId: cancelled.reservation.id,
        customerId: cancellationFixture.customer.id,
        idempotencyKey: randomUUID(),
        reason: null,
      });
      const released = await getPublicRestaurantReservationAvailability({
        branchId: cancellationFixture.branch.id,
        date: cancellationFixture.date,
        guestCount: 2,
        seatingArea: null,
      });
      assert.equal(
        released.slots.some(
          (slot) => slot.startsAt === cancelled.reservation.startsAt,
        ),
        true,
      );

      const deletedBranchFixture = await createRestaurantFixture({
        label: "gate2e-deleted-branch",
      });
      const deletedBranchBooking = await createManagedReservation(
        deletedBranchFixture,
      );
      await prisma.branch.update({
        where: { id: deletedBranchFixture.branch.id },
        data: { deletedAt: new Date() },
      });
      assert.ok(
        await getRestaurantReservationDetailForCustomer(
          deletedBranchFixture.customer.id,
          deletedBranchBooking.reservation.id,
        ),
      );
      await assert.rejects(
        rescheduleCustomerRestaurantReservation({
          bookingId: deletedBranchBooking.reservation.id,
          customerId: deletedBranchFixture.customer.id,
          customerNote: null,
          date: deletedBranchFixture.date,
          guestCount: 3,
          idempotencyKey: randomUUID(),
          seatingArea: null,
          startsAt: deletedBranchBooking.reservation.startsAt,
        }),
        reservationCode("BUSINESS_UNAVAILABLE"),
      );

      const deletedBusinessFixture = await createRestaurantFixture({
        label: "gate2e-deleted-business",
      });
      const deletedBusinessBooking = await createManagedReservation(
        deletedBusinessFixture,
      );
      await prisma.organization.update({
        where: { id: deletedBusinessFixture.organization.id },
        data: { deletedAt: new Date() },
      });
      assert.ok(
        await getRestaurantReservationDetailForCustomer(
          deletedBusinessFixture.customer.id,
          deletedBusinessBooking.reservation.id,
        ),
      );
      await assert.rejects(
        rescheduleCustomerRestaurantReservation({
          bookingId: deletedBusinessBooking.reservation.id,
          customerId: deletedBusinessFixture.customer.id,
          customerNote: null,
          date: deletedBusinessFixture.date,
          guestCount: 3,
          idempotencyKey: randomUUID(),
          seatingArea: null,
          startsAt: deletedBusinessBooking.reservation.startsAt,
        }),
        reservationCode("BUSINESS_UNAVAILABLE"),
      );
    });

    await t.test("corrupt cross-tenant Restaurant relationships fail closed", async () => {
      await resetRestaurantTestData();
      const fixture = await createRestaurantFixture({ label: "gate2e-integrity" });
      const foreign = await createRestaurantFixture({
        label: "gate2e-integrity-foreign",
      });
      const created = await createManagedReservation(fixture, { preorder: true });
      const details = await prisma.restaurantReservationDetails.findUniqueOrThrow({
        where: { bookingId: created.reservation.id },
      });
      await prisma.restaurantReservationItem.updateMany({
        where: { restaurantReservationDetailsId: details.id },
        data: { menuItemId: foreign.menuItem.id },
      });
      assert.equal(
        await getRestaurantReservationDetailForCustomer(
          fixture.customer.id,
          created.reservation.id,
        ),
        null,
      );
      await prisma.restaurantReservationItem.updateMany({
        where: { restaurantReservationDetailsId: details.id },
        data: { menuItemId: fixture.menuItem.id },
      });
      await prisma.restaurantTable.update({
        where: { id: fixture.tables[0]!.id },
        data: {
          branchId: foreign.branch.id,
          businessId: foreign.organization.id,
        },
      });
      assert.equal(
        await getRestaurantReservationDetailForCustomer(
          fixture.customer.id,
          created.reservation.id,
        ),
        null,
      );
      await assert.rejects(
        cancelCustomerRestaurantReservation({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          idempotencyKey: randomUUID(),
          reason: null,
        }),
        reservationCode("NOT_FOUND"),
      );
      await assert.rejects(
        getCustomerRestaurantRescheduleOptions({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          date: fixture.date,
          guestCount: 2,
          seatingArea: null,
        }),
        reservationCode("NOT_FOUND"),
      );
    });

    await t.test("deadline, final statuses, no-show, and generic service records fail closed", async () => {
      await resetRestaurantTestData();
      const deadlineFixture = await createRestaurantFixture({ label: "gate2e-deadline" });
      const deadlineBooking = await createManagedReservation(deadlineFixture);
      await prisma.organizationSettings.update({
        where: { organizationId: deadlineFixture.organization.id },
        data: { cancellationWindowHours: 1_000 },
      });
      await assert.rejects(
        cancelCustomerRestaurantReservation({
          bookingId: deadlineBooking.reservation.id,
          customerId: deadlineFixture.customer.id,
          idempotencyKey: randomUUID(),
          reason: null,
        }),
        reservationCode("CANCELLATION_DEADLINE_PASSED"),
      );
      await assert.rejects(
        getCustomerRestaurantRescheduleOptions({
          bookingId: deadlineBooking.reservation.id,
          customerId: deadlineFixture.customer.id,
          date: deadlineFixture.date,
          guestCount: 2,
          seatingArea: null,
        }),
        reservationCode("CANCELLATION_DEADLINE_PASSED"),
      );

      const fixture = await createRestaurantFixture({ label: "gate2e-final" });
      const finalBookings = await Promise.all([
        createManagedReservation(fixture, { slotIndex: 0 }),
        createManagedReservation(fixture, { slotIndex: 2 }),
        createManagedReservation(fixture, { slotIndex: 4 }),
      ]);
      for (const [index, status] of (["COMPLETED", "CANCELLED", "NO_SHOW"] as const).entries()) {
        await prisma.booking.update({
          where: { id: finalBookings[index]!.reservation.id },
          data: {
            status,
            ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}),
          },
        });
        await assert.rejects(
          cancelCustomerRestaurantReservation({
            bookingId: finalBookings[index]!.reservation.id,
            customerId: fixture.customer.id,
            idempotencyKey: randomUUID(),
            reason: null,
          }),
          reservationCode("BOOKING_NOT_CANCELLABLE"),
        );
      }
      const all = await listCustomerRestaurantReservations({
        customerId: fixture.customer.id,
        tab: "all",
      });
      const completed = await listCustomerRestaurantReservations({
        customerId: fixture.customer.id,
        tab: "completed",
      });
      const cancelled = await listCustomerRestaurantReservations({
        customerId: fixture.customer.id,
        tab: "cancelled",
      });
      assert.equal(all.items.some((item) => item.status === "NO_SHOW"), true);
      assert.deepEqual(completed.items.map((item) => item.status), ["COMPLETED"]);
      assert.deepEqual(cancelled.items.map((item) => item.status), ["CANCELLED"]);

      const category = await prisma.category.create({
        data: { name: `Generic ${randomUUID()}`, slug: `generic-${randomUUID()}` },
      });
      const service = await prisma.service.create({
        data: {
          categoryId: category.id,
          name: "Generic service",
          organizationId: fixture.organization.id,
        },
      });
      const branchService = await prisma.branchService.create({
        data: {
          branchId: fixture.branch.id,
          durationMinutes: 30,
          price: "1000",
          serviceId: service.id,
        },
      });
      const generic = await prisma.booking.create({
        data: {
          branchId: fixture.branch.id,
          branchServiceId: branchService.id,
          customerId: fixture.customer.id,
          customerNameSnapshot: "Generic Customer",
          endsAt: new Date(Date.now() + 4 * 86_400_000 + 30 * 60_000),
          organizationId: fixture.organization.id,
          priceSnapshot: "1000",
          serviceNameSnapshot: "Generic service",
          startsAt: new Date(Date.now() + 4 * 86_400_000),
        },
      });
      assert.equal(
        await getRestaurantReservationDetailForCustomer(
          fixture.customer.id,
          generic.id,
        ),
        null,
      );
      assert.equal(
        (await listCustomerRestaurantReservations({
          customerId: fixture.customer.id,
          tab: "all",
        })).items.some((item) => item.id === generic.id),
        false,
      );
    });

    await t.test("direct reschedule excludes self, reallocates a table, preserves preorder, and rejects stale replay", async () => {
      await resetRestaurantTestData();
      const fixture = await createRestaurantFixture({
        label: "gate2e-reschedule",
        tableCapacities: [2, 6, 4],
      });
      const created = await createManagedReservation(fixture, { preorder: true });
      const originalDetails = await prisma.restaurantReservationDetails.findUniqueOrThrow({
        where: { bookingId: created.reservation.id },
      });
      assert.equal(originalDetails.tableId, fixture.tables[0]!.id);

      const sameSelection = await getCustomerRestaurantRescheduleOptions({
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        date: fixture.date,
        guestCount: 2,
        seatingArea: null,
      });
      assert.ok(
        sameSelection.slots.every(
          (slot) => slot.startsAt !== created.reservation.startsAt,
        ),
      );
      const largerParty = await getCustomerRestaurantRescheduleOptions({
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        date: fixture.date,
        guestCount: 4,
        seatingArea: null,
      });
      assert.ok(
        largerParty.slots.some(
          (slot) => slot.startsAt === created.reservation.startsAt,
        ),
      );
      const firstKey = randomUUID();
      const first = await rescheduleCustomerRestaurantReservation({
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        customerNote: "Larger party",
        date: fixture.date,
        guestCount: 4,
        idempotencyKey: firstKey,
        seatingArea: null,
        startsAt: created.reservation.startsAt,
      });
      assert.equal(first.replayed, false);
      assert.equal(
        (await prisma.restaurantReservationDetails.findUniqueOrThrow({
          where: { bookingId: created.reservation.id },
        })).tableId,
        fixture.tables[2]!.id,
      );
      assert.equal(
        await prisma.restaurantReservationItem.count({
          where: { restaurantReservationDetailsId: originalDetails.id },
        }),
        1,
      );
      assert.equal(
        (await rescheduleCustomerRestaurantReservation({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          customerNote: "Larger party",
          date: fixture.date,
          guestCount: 4,
          idempotencyKey: firstKey,
          seatingArea: null,
          startsAt: created.reservation.startsAt,
        })).replayed,
        true,
      );

      const next = await getCustomerRestaurantRescheduleOptions({
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        date: fixture.date,
        guestCount: 4,
        seatingArea: null,
      });
      assert.ok(next.slots[0]);
      await rescheduleCustomerRestaurantReservation({
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        customerNote: "Second move",
        date: fixture.date,
        guestCount: 4,
        idempotencyKey: randomUUID(),
        seatingArea: null,
        startsAt: next.slots[0]!.startsAt,
      });
      await assert.rejects(
        rescheduleCustomerRestaurantReservation({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          customerNote: "Larger party",
          date: fixture.date,
          guestCount: 4,
          idempotencyKey: firstKey,
          seatingArea: null,
          startsAt: created.reservation.startsAt,
        }),
        reservationCode("BOOKING_STATE_CONFLICT"),
      );
      assert.equal(
        await prisma.restaurantReservationMutation.count({
          where: { bookingId: created.reservation.id, type: "RESCHEDULE" },
        }),
        2,
      );
      assert.equal(
        await prisma.notification.count({
          where: {
            eventKey: { startsWith: `restaurant-reservation:${created.reservation.id}:rescheduled:` },
          },
        }),
        2,
      );
      const businessVisible = await prisma.booking.findFirstOrThrow({
        where: {
          id: created.reservation.id,
          organizationId: fixture.organization.id,
          restaurantReservation: { isNot: null },
        },
        include: { restaurantReservation: true },
      });
      const adminVisible = await prisma.booking.findUniqueOrThrow({
        where: { id: created.reservation.id },
        include: { branch: true, organization: true, restaurantReservation: true },
      });
      assert.equal(businessVisible.startsAt.toISOString(), next.slots[0]!.startsAt);
      assert.equal(businessVisible.restaurantReservation?.guestCount, 4);
      assert.equal(adminVisible.startsAt.toISOString(), next.slots[0]!.startsAt);
      assert.equal(adminVisible.restaurantReservation?.tableId, fixture.tables[2]!.id);
      assert.equal(adminVisible.branch.organizationId, adminVisible.organization.id);
    });

    await t.test("inactive reservability blocks reschedule and a notification failure rolls cancellation back atomically", async () => {
      await resetRestaurantTestData();
      const fixture = await createRestaurantFixture({ label: "gate2e-rollback" });
      const created = await createManagedReservation(fixture);
      await prisma.branch.update({
        where: { id: fixture.branch.id },
        data: { status: "INACTIVE" },
      });
      await assert.rejects(
        rescheduleCustomerRestaurantReservation({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          customerNote: null,
          date: fixture.date,
          guestCount: 3,
          idempotencyKey: randomUUID(),
          seatingArea: null,
          startsAt: created.reservation.startsAt,
        }),
        reservationCode("BUSINESS_UNAVAILABLE"),
      );
      await prisma.branch.update({
        where: { id: fixture.branch.id },
        data: { status: "ACTIVE" },
      });
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION gate2e_fail_notification() RETURNS trigger AS $$
        BEGIN
          IF NEW."eventKey" LIKE 'restaurant-reservation:%:cancelled:%' THEN
            RAISE EXCEPTION 'gate2e notification rollback probe';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER gate2e_fail_notification_trigger
        BEFORE INSERT ON "Notification"
        FOR EACH ROW EXECUTE FUNCTION gate2e_fail_notification();
      `);
      await assert.rejects(
        cancelCustomerRestaurantReservation({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          idempotencyKey: randomUUID(),
          reason: "Rollback",
        }),
      );
      assert.equal(
        (await prisma.booking.findUniqueOrThrow({ where: { id: created.reservation.id } })).status,
        "CONFIRMED",
      );
      assert.equal(
        await prisma.restaurantReservationMutation.count({
          where: { bookingId: created.reservation.id },
        }),
        0,
      );
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS gate2e_fail_notification_trigger ON "Notification";
        DROP FUNCTION IF EXISTS gate2e_fail_notification();
      `);
    });

    await t.test("capacity, seating, blocked-time, and inactive-table changes are revalidated inside reschedule", async () => {
      await resetRestaurantTestData();
      const fixture = await createRestaurantFixture({
        label: "gate2e-revalidation",
        tableCapacities: [2, 4],
      });
      const created = await createManagedReservation(fixture);
      await assert.rejects(
        rescheduleCustomerRestaurantReservation({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          customerNote: null,
          date: fixture.date,
          guestCount: 100,
          idempotencyKey: randomUUID(),
          seatingArea: null,
          startsAt: created.reservation.startsAt,
        }),
        reservationCode("CAPACITY_UNAVAILABLE"),
      );
      await prisma.restaurantTable.updateMany({
        where: { businessId: fixture.organization.id, area: "Terrace" },
        data: { isActive: false },
      });
      await assert.rejects(
        rescheduleCustomerRestaurantReservation({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          customerNote: null,
          date: fixture.date,
          guestCount: 2,
          idempotencyKey: randomUUID(),
          seatingArea: "Terrace",
          startsAt: created.reservation.startsAt,
        }),
        reservationCode("CAPACITY_UNAVAILABLE"),
      );
      const options = await getCustomerRestaurantRescheduleOptions({
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        date: fixture.date,
        guestCount: 2,
        seatingArea: null,
      });
      assert.ok(options.slots[0]);
      await prisma.blockedTime.create({
        data: {
          branchId: fixture.branch.id,
          startsAt: new Date(options.slots[0]!.startsAt),
          endsAt: new Date(options.slots[0]!.endsAt),
          reason: "Gate 2E revalidation",
        },
      });
      await assert.rejects(
        rescheduleCustomerRestaurantReservation({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          customerNote: null,
          date: fixture.date,
          guestCount: 2,
          idempotencyKey: randomUUID(),
          seatingArea: null,
          startsAt: options.slots[0]!.startsAt,
        }),
        reservationCode("TABLE_CONFLICT"),
      );
      await prisma.blockedTime.deleteMany({ where: { branchId: fixture.branch.id } });
      await prisma.restaurantTable.updateMany({
        where: { businessId: fixture.organization.id },
        data: { isActive: false },
      });
      assert.equal(
        (await getCustomerRestaurantRescheduleOptions({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          date: fixture.date,
          guestCount: 2,
          seatingArea: null,
        })).reason,
        "CAPACITY_UNAVAILABLE",
      );
    });

    await t.test("simultaneous cancel and reschedule commit only one customer mutation", async () => {
      await resetRestaurantTestData();
      const fixture = await createRestaurantFixture({ label: "gate2e-race" });
      const created = await createManagedReservation(fixture);
      const options = await getCustomerRestaurantRescheduleOptions({
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        date: fixture.date,
        guestCount: 3,
        seatingArea: null,
      });
      assert.ok(options.slots[0]);
      const outcomes = await Promise.allSettled([
        cancelCustomerRestaurantReservation({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          idempotencyKey: randomUUID(),
          reason: "Concurrent cancel",
        }),
        rescheduleCustomerRestaurantReservation({
          bookingId: created.reservation.id,
          customerId: fixture.customer.id,
          customerNote: "Concurrent reschedule",
          date: fixture.date,
          guestCount: 3,
          idempotencyKey: randomUUID(),
          seatingArea: null,
          startsAt: options.slots[0]!.startsAt,
        }),
      ]);
      assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
      assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
      assert.equal(
        await prisma.restaurantReservationMutation.count({
          where: { bookingId: created.reservation.id },
        }),
        1,
      );
    });

    await t.test("simultaneous reschedules commit one final version and one event", async () => {
      await resetRestaurantTestData();
      const fixture = await createRestaurantFixture({ label: "gate2e-double-reschedule" });
      const created = await createManagedReservation(fixture);
      const options = await getCustomerRestaurantRescheduleOptions({
        bookingId: created.reservation.id,
        customerId: fixture.customer.id,
        date: fixture.date,
        guestCount: 2,
        seatingArea: null,
      });
      assert.ok(options.slots[0]);
      assert.ok(options.slots[1]);
      const outcomes = await Promise.allSettled(
        options.slots.slice(0, 2).map((slot) =>
          rescheduleCustomerRestaurantReservation({
            bookingId: created.reservation.id,
            customerId: fixture.customer.id,
            customerNote: slot.startsAt,
            date: fixture.date,
            guestCount: 2,
            idempotencyKey: randomUUID(),
            seatingArea: null,
            startsAt: slot.startsAt,
          }),
        ),
      );
      assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
      assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
      assert.equal(
        await prisma.restaurantReservationMutation.count({
          where: { bookingId: created.reservation.id, type: "RESCHEDULE" },
        }),
        1,
      );
      assert.equal(
        await prisma.notification.count({
          where: {
            eventKey: { startsWith: `restaurant-reservation:${created.reservation.id}:rescheduled:` },
          },
        }),
        1,
      );
    });
  },
);
