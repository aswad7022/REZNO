import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { RestaurantReservationError } from "../../../features/restaurants/domain/reservation-errors";
import { createCustomerRestaurantReservation } from "../../../features/restaurants/services/reservation-creation";
import { getRestaurantReservationDetailForCustomer } from "../../../features/restaurants/services/reservation-detail";
import {
  getPublicRestaurantReservationAvailability,
  getPublicRestaurantReservationBranches,
  getPublicRestaurantReservationBusiness,
  getPublicRestaurantReservationMenu,
} from "../../../features/restaurants/services/reservation-public";
import { getPublicBookingServices } from "../../../features/bookings/services/booking-catalog";
import { prisma } from "../../../lib/db/prisma";
import {
  RESTAURANT_QA_FIXTURE,
  seedRestaurantQaFixture,
} from "../../../scripts/staging/restaurant-qa-seed-core";
import {
  createRestaurantFixture,
  resetRestaurantTestData,
} from "../helpers/restaurant-fixture";

type Fixture = Awaited<ReturnType<typeof createRestaurantFixture>>;

function reservationCode(code: RestaurantReservationError["code"]) {
  return (error: unknown) => error instanceof RestaurantReservationError && error.code === code;
}

async function firstSelection(fixture: Fixture, input: { guestCount?: number; seatingArea?: string | null } = {}) {
  const availability = await getPublicRestaurantReservationAvailability({
    branchId: fixture.branch.id,
    date: fixture.date,
    guestCount: input.guestCount ?? 2,
    seatingArea: input.seatingArea ?? null,
  });
  assert.ok(availability.slots[0], availability.reason ?? "No slot");
  return {
    businessSlug: fixture.organization.slug,
    branchId: fixture.branch.id,
    customerId: fixture.customer.id,
    customerNote: null,
    date: fixture.date,
    guestCount: input.guestCount ?? 2,
    idempotencyKey: randomUUID(),
    preorderItems: [] as Array<{ itemId: string; quantity: number }>,
    seatingArea: input.seatingArea ?? null,
    startsAt: availability.slots[0]!.startsAt,
  };
}

test("Gate 2D restaurant reservation creation is tenant-safe, atomic, idempotent, and capacity-safe", { concurrency: false }, async (t) => {
  await resetRestaurantTestData();
  t.after(async () => {
    await resetRestaurantTestData();
    await prisma.$disconnect();
  });

  await t.test("public Restaurant and Cafe catalog relationships expose only safe active data", async () => {
    await resetRestaurantTestData();
    const restaurant = await createRestaurantFixture({ label: "gate2d-public" });
    const cafe = await createRestaurantFixture({ label: "gate2d-cafe", vertical: "CAFE" });
    for (const fixture of [restaurant, cafe]) {
      const [business, branches, menu] = await Promise.all([
        getPublicRestaurantReservationBusiness(fixture.organization.slug),
        getPublicRestaurantReservationBranches(fixture.organization.slug),
        getPublicRestaurantReservationMenu(fixture.organization.slug),
      ]);
      assert.equal(business.vertical, fixture.organization.vertical);
      assert.deepEqual(branches.map((branch) => branch.id), [fixture.branch.id]);
      assert.deepEqual(menu.flatMap((category) => category.items).map((item) => item.id), [fixture.menuItem.id]);
      assert.ok(!JSON.stringify(business).includes(fixture.tables[0]!.id));
    }
    const generic = await createRestaurantFixture({ label: "gate2d-generic", vertical: "BEAUTY" });
    await assert.rejects(
      getPublicRestaurantReservationBusiness(generic.organization.slug),
      reservationCode("RESTAURANT_FLOW_REQUIRED"),
    );
    await assert.rejects(
      getPublicBookingServices(restaurant.organization.slug),
      (error: unknown) => error instanceof Error,
      "restaurant must remain excluded from generic service booking",
    );
  });

  await t.test("the namespaced staging fixture is deterministic across two runs", async () => {
    await resetRestaurantTestData();
    const first = await seedRestaurantQaFixture(prisma);
    const second = await seedRestaurantQaFixture(prisma);
    assert.deepEqual(second, first);
    assert.equal(
      await prisma.organization.count({ where: { slug: RESTAURANT_QA_FIXTURE.organization.slug } }),
      1,
    );
    assert.equal(
      await prisma.restaurantTable.count({ where: { businessId: RESTAURANT_QA_FIXTURE.organization.id } }),
      4,
    );
    assert.equal(
      await prisma.menuItem.count({ where: { businessId: RESTAURANT_QA_FIXTURE.organization.id } }),
      3,
    );
  });

  await t.test("server allocates the smallest sufficient branch table and respects exact seating preference", async () => {
    await resetRestaurantTestData();
    const fixture = await createRestaurantFixture({ label: "gate2d-allocation" });
    const exact = await createCustomerRestaurantReservation(await firstSelection(fixture, { guestCount: 4 }));
    const exactPersisted = await prisma.restaurantReservationDetails.findUniqueOrThrow({ where: { bookingId: exact.reservation.id } });
    assert.equal(exactPersisted.tableId, fixture.tables[1]!.id, "name tie-break selects the first capacity-4 table");

    const terraceInput = await firstSelection(fixture, { guestCount: 2, seatingArea: "Terrace" });
    terraceInput.startsAt = new Date(new Date(terraceInput.startsAt).getTime() + 90 * 60_000).toISOString();
    const terrace = await createCustomerRestaurantReservation(terraceInput);
    const terracePersisted = await prisma.restaurantReservationDetails.findUniqueOrThrow({ where: { bookingId: terrace.reservation.id } });
    assert.equal(terracePersisted.tableId, fixture.tables[1]!.id);
    assert.equal(terrace.reservation.seatingArea, "Terrace");

    await assert.rejects(
      createCustomerRestaurantReservation({
        ...(await firstSelection(fixture, { guestCount: 2 })),
        seatingArea: "Private Internal Code",
      }),
      reservationCode("CAPACITY_UNAVAILABLE"),
    );
    await assert.rejects(
      firstSelection(fixture, { guestCount: 7 }),
      (error: unknown) => error instanceof assert.AssertionError,
    );
  });

  await t.test("inactive, deleted, cross-tenant, cross-branch, and inactive-table records fail closed", async () => {
    await resetRestaurantTestData();
    for (const options of [
      { label: "inactive-org", businessStatus: "INACTIVE" as const },
      { label: "deleted-org", businessDeleted: true },
      { label: "inactive-branch", branchStatus: "INACTIVE" as const },
      { label: "deleted-branch", branchDeleted: true },
    ]) {
      const fixture = await createRestaurantFixture(options);
      await assert.rejects(
        getPublicRestaurantReservationAvailability({ branchId: fixture.branch.id, date: fixture.date, guestCount: 2, seatingArea: null }),
        reservationCode("NOT_FOUND"),
      );
    }
    const active = await createRestaurantFixture({ label: "tenant-source" });
    const foreign = await createRestaurantFixture({ label: "tenant-foreign", date: active.date });
    await prisma.restaurantTable.updateMany({
      where: { businessId: active.organization.id },
      data: { isActive: false },
    });
    await prisma.restaurantTable.create({
      data: { branchId: foreign.branch.id, businessId: foreign.organization.id, capacity: 100, name: "Foreign only" },
    });
    const unavailable = await getPublicRestaurantReservationAvailability({ branchId: active.branch.id, date: active.date, guestCount: 2, seatingArea: null });
    assert.equal(unavailable.reason, "CAPACITY_UNAVAILABLE");
  });

  await t.test("hours, blocked time, past time, closing boundary, invalid timezone, and DST fail closed", async () => {
    await resetRestaurantTestData();
    const fixture = await createRestaurantFixture({ label: "gate2d-hours" });
    const base = await firstSelection(fixture);
    await assert.rejects(
      createCustomerRestaurantReservation({ ...base, startsAt: `${fixture.date}T08:00:00.000Z`, idempotencyKey: randomUUID() }),
      reservationCode("RESTAURANT_CLOSED"),
    );
    await assert.rejects(
      createCustomerRestaurantReservation({ ...base, startsAt: `${fixture.date}T19:00:00.000Z`, idempotencyKey: randomUUID() }),
      reservationCode("RESTAURANT_CLOSED"),
    );
    await prisma.blockedTime.create({
      data: { branchId: fixture.branch.id, startsAt: new Date(base.startsAt), endsAt: new Date(new Date(base.startsAt).getTime() + 90 * 60_000) },
    });
    await assert.rejects(
      createCustomerRestaurantReservation({ ...base, idempotencyKey: randomUUID() }),
      reservationCode("TABLE_CONFLICT"),
    );
    await assert.rejects(
      createCustomerRestaurantReservation({ ...base, date: "2020-01-01", startsAt: "2020-01-01T09:00:00.000Z", idempotencyKey: randomUUID() }),
      reservationCode("DATE_OUT_OF_RANGE"),
    );
    await prisma.branch.update({ where: { id: fixture.branch.id }, data: { timezone: "Invalid/Timezone" } });
    await assert.rejects(
      getPublicRestaurantReservationAvailability({ branchId: fixture.branch.id, date: fixture.date, guestCount: 2, seatingArea: null }),
      reservationCode("INVALID_REQUEST"),
    );

    const dst = await createRestaurantFixture({
      label: "gate2d-dst",
      date: "2026-10-04",
      timezone: "Australia/Sydney",
    });
    const dayOfWeek = new Date("2026-10-04T12:00:00.000Z").getUTCDay();
    await prisma.businessHour.update({
      where: { branchId_dayOfWeek: { branchId: dst.branch.id, dayOfWeek } },
      data: { openTime: "02:30", closeTime: "05:00" },
    });
    const dstAvailability = await getPublicRestaurantReservationAvailability(
      { branchId: dst.branch.id, date: dst.date, guestCount: 2, seatingArea: null },
      prisma,
      new Date("2026-07-15T00:00:00.000Z"),
    );
    assert.equal(dstAvailability.reason, "RESTAURANT_CLOSED");
  });

  await t.test("overlap is prevented, adjacent reservations work, and concurrent capacity is deterministic", async () => {
    await resetRestaurantTestData();
    const one = await createRestaurantFixture({ label: "gate2d-concurrency", tableCapacities: [4] });
    const input = await firstSelection(one);
    const secondCustomer = await prisma.person.create({
      data: { authUserId: `concurrent-${randomUUID()}`, firstName: "Second", isOnboarded: true, phone: "+9647500000001" },
    });
    const outcomes = await Promise.allSettled([
      createCustomerRestaurantReservation(input),
      createCustomerRestaurantReservation({ ...input, customerId: secondCustomer.id, idempotencyKey: randomUUID() }),
    ]);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);
    assert.equal(await prisma.booking.count({ where: { organizationId: one.organization.id } }), 1);

    const adjacentInput = { ...input, idempotencyKey: randomUUID(), startsAt: new Date(new Date(input.startsAt).getTime() + 90 * 60_000).toISOString() };
    const adjacent = await createCustomerRestaurantReservation(adjacentInput);
    assert.equal(adjacent.replayed, false);

    const many = await createRestaurantFixture({ label: "gate2d-multi", tableCapacities: [2, 2] });
    const manyInput = await firstSelection(many);
    const manySecond = await prisma.person.create({
      data: { authUserId: `multi-${randomUUID()}`, firstName: "Multi", isOnboarded: true, phone: "+9647500000002" },
    });
    const two = await Promise.all([
      createCustomerRestaurantReservation(manyInput),
      createCustomerRestaurantReservation({ ...manyInput, customerId: manySecond.id, idempotencyKey: randomUUID() }),
    ]);
    assert.equal(new Set(two.map((result) => result.reservation.id)).size, 2);
  });

  await t.test("preorder is normalized, tenant scoped, availability checked, and database-price authoritative", async () => {
    await resetRestaurantTestData();
    const fixture = await createRestaurantFixture({ label: "gate2d-menu" });
    const input = await firstSelection(fixture);
    const created = await createCustomerRestaurantReservation({
      ...input,
      preorderItems: [
        { itemId: fixture.menuItem.id, quantity: 1 },
        { itemId: fixture.menuItem.id, quantity: 2 },
      ],
    });
    assert.equal(created.reservation.preorderItems.length, 1);
    assert.equal(created.reservation.preorderItems[0]!.quantity, 3);
    assert.equal(created.reservation.preorderItems[0]!.unitPrice, "12000");
    assert.equal(created.reservation.preorderTotal, "36000");

    const foreign = await createRestaurantFixture({ label: "gate2d-menu-foreign", date: fixture.date });
    for (const itemId of [fixture.unavailableMenuItem.id, foreign.menuItem.id]) {
      await assert.rejects(
        createCustomerRestaurantReservation({
          ...(await firstSelection(fixture)),
          preorderItems: [{ itemId, quantity: 1 }],
        }),
        reservationCode("MENU_ITEM_UNAVAILABLE"),
      );
    }
  });

  await t.test("idempotency, ownership, history, notification, and atomic rollback are exact", async () => {
    await resetRestaurantTestData();
    const fixture = await createRestaurantFixture({ label: "gate2d-idempotency" });
    const input = await firstSelection(fixture);
    const first = await createCustomerRestaurantReservation(input);
    const replay = await createCustomerRestaurantReservation(input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.reservation.id, first.reservation.id);
    await assert.rejects(
      createCustomerRestaurantReservation({ ...input, customerNote: "changed" }),
      reservationCode("IDEMPOTENCY_CONFLICT"),
    );
    assert.equal(await prisma.booking.count({ where: { creationIdempotencyKey: input.idempotencyKey } }), 1);
    assert.equal(await prisma.restaurantReservationDetails.count({ where: { bookingId: first.reservation.id } }), 1);
    assert.equal(await prisma.bookingStatusHistory.count({ where: { bookingId: first.reservation.id } }), 1);
    assert.equal(await prisma.notification.count({ where: { eventKey: `restaurant-reservation:${first.reservation.id}:created` } }), 1);
    assert.deepEqual(await getRestaurantReservationDetailForCustomer(fixture.customer.id, first.reservation.id), first.reservation);
    const stranger = await prisma.person.create({
      data: { authUserId: `stranger-${randomUUID()}`, firstName: "Stranger", isOnboarded: true, phone: "+9647500000003" },
    });
    assert.equal(await getRestaurantReservationDetailForCustomer(stranger.id, first.reservation.id), null);

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION gate2d_fail_notification() RETURNS trigger AS $$
      BEGIN
        IF NEW."eventKey" LIKE 'restaurant-reservation:%:created' THEN
          RAISE EXCEPTION 'gate2d notification rollback probe';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER gate2d_fail_notification_trigger
      BEFORE INSERT ON "Notification"
      FOR EACH ROW EXECUTE FUNCTION gate2d_fail_notification();
    `);
    const rollbackInput = await firstSelection(fixture);
    rollbackInput.startsAt = new Date(new Date(rollbackInput.startsAt).getTime() + 180 * 60_000).toISOString();
    await assert.rejects(createCustomerRestaurantReservation(rollbackInput));
    assert.equal(await prisma.booking.count({ where: { creationIdempotencyKey: rollbackInput.idempotencyKey } }), 0);
    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS gate2d_fail_notification_trigger ON "Notification";
      DROP FUNCTION IF EXISTS gate2d_fail_notification();
    `);
  });
});
