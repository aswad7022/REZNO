import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { BookingDomainError } from "../../../features/bookings/domain/errors";
import { getPublicBookingAvailability } from "../../../features/bookings/services/booking-availability";
import { BusinessOperationsError } from "../../../features/business-operations/domain/errors";
import { recordBusinessOperation } from "../../../features/business-operations/services/audit";
import {
  createOperationalBlock,
  deleteOperationalBlock,
  listOperationalBlocks,
  updateOperationalBlock,
} from "../../../features/business-operations/services/blocks";
import {
  archiveOperationalBranch,
  createOperationalBranch,
  setOperationalBranchActive,
  updateOperationalBranch,
} from "../../../features/business-operations/services/branches";
import { resolveBusinessOperationActor } from "../../../features/business-operations/services/context";
import { updateOperationalHours } from "../../../features/business-operations/services/hours";
import {
  readOperationalSettings,
  updateOperationalSettings,
} from "../../../features/business-operations/services/settings";
import { getPublicBusiness, searchMarketplace } from "../../../features/marketplace/services/marketplace";
import { RestaurantReservationError } from "../../../features/restaurants/domain/reservation-errors";
import { getPublicRestaurantReservationAvailability } from "../../../features/restaurants/services/reservation-public";
import { prisma } from "../../../lib/db/prisma";
import {
  branchInput,
  createBusinessOperationsFixture,
  createFutureGenericBooking,
  createFutureRestaurantBooking,
  futureDate,
  localBlockInput,
  resetBusinessOperationsTestData,
} from "../helpers/business-operations-fixture";

function operationCode(code: BusinessOperationsError["code"]) {
  return (error: unknown) => error instanceof BusinessOperationsError && error.code === code;
}

function closedSchedule() {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    closeTime: "17:00",
    dayOfWeek,
    isOpen: false,
    openTime: "09:00",
  }));
}

test("Stage 2A Business Operations core is tenant-safe, replay-safe, and availability-connected", { concurrency: false }, async (t) => {
  await resetBusinessOperationsTestData();
  t.after(async () => {
    await resetBusinessOperationsTestData();
    await prisma.$disconnect();
  });

  await t.test("Owner and Manager update settings; restricted and revoked roles fail closed", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("settings");
    const initial = await readOperationalSettings(fixture.owner.reference);
    const key = randomUUID();
    const input = {
      actor: fixture.owner.reference,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: initial.version,
      idempotencyKey: key,
      settings: { bookingEnabled: false, cancellationWindowHours: 48, marketplaceVisible: true },
    };
    const first = await updateOperationalSettings(input);
    assert.equal(first.replayed, false);
    assert.equal((await updateOperationalSettings(input)).replayed, true);
    await assert.rejects(
      updateOperationalSettings({ ...input, settings: { bookingEnabled: true, cancellationWindowHours: 48, marketplaceVisible: true } }),
      operationCode("IDEMPOTENCY_CONFLICT"),
    );
    const managerRead = await readOperationalSettings(fixture.manager.reference);
    const manager = await updateOperationalSettings({
      actor: fixture.manager.reference,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: managerRead.version,
      idempotencyKey: randomUUID(),
      settings: { bookingEnabled: true, cancellationWindowHours: 36, marketplaceVisible: true },
    });
    assert.equal(manager.cancellationWindowHours, 36);
    for (const actor of [fixture.receptionist.reference, fixture.staff.reference, fixture.revoked.reference]) {
      await assert.rejects(
        updateOperationalSettings({
          actor,
          contextOrganizationId: fixture.organizationA.id,
          expectedVersion: manager.version,
          idempotencyKey: randomUUID(),
          settings: { bookingEnabled: true, cancellationWindowHours: 24, marketplaceVisible: true },
        }),
        (error: unknown) => error instanceof BusinessOperationsError && ["FORBIDDEN", "MEMBERSHIP_UNAVAILABLE"].includes(error.code),
      );
    }
    assert.equal(await prisma.businessAuditLog.count({ where: { organizationId: fixture.organizationA.id, action: "SETTINGS_UPDATE" } }), 2);
  });

  await t.test("persisted settings control discovery and both availability domains without deleting history", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("public-settings");
    const date = futureDate();
    assert.equal((await searchMarketplace({ query: fixture.organizationA.name })).some((item) => item.id === fixture.organizationA.id), true);
    assert.ok((await getPublicBookingAvailability({ branchServiceId: fixture.offering.id, date, memberId: null })).slots.length);
    assert.ok((await getPublicRestaurantReservationAvailability({ branchId: fixture.activeBranch.id, date, guestCount: 2, seatingArea: null })).slots.length);
    const existing = await createFutureGenericBooking(fixture, date);
    const settings = await readOperationalSettings(fixture.owner.reference);
    await updateOperationalSettings({
      actor: fixture.owner.reference,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: settings.version,
      idempotencyKey: randomUUID(),
      settings: { bookingEnabled: false, cancellationWindowHours: 24, marketplaceVisible: false },
    });
    assert.equal((await searchMarketplace({ query: fixture.organizationA.name })).some((item) => item.id === fixture.organizationA.id), false);
    await assert.rejects(
      getPublicBookingAvailability({ branchServiceId: fixture.offering.id, date, memberId: null }),
      (error: unknown) => error instanceof BookingDomainError && error.code === "NOT_FOUND",
    );
    await assert.rejects(
      getPublicRestaurantReservationAvailability({ branchId: fixture.activeBranch.id, date, guestCount: 2, seatingArea: null }),
      (error: unknown) => error instanceof RestaurantReservationError && error.code === "NOT_FOUND",
    );
    assert.equal((await prisma.booking.findUnique({ where: { id: existing.id } }))?.id, existing.id);
  });

  await t.test("Branch creation and update enforce replay, stale versions, tenant scope, and timezone safety", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("branches");
    const key = randomUUID();
    const createInput = {
      actor: fixture.manager.reference,
      branch: {
        addressLine1: "Street 1",
        addressLine2: null,
        city: "Baghdad",
        country: "Iraq",
        email: "branch@example.test",
        latitude: null,
        locationInstructions: null,
        locationLabel: "Mansour",
        longitude: null,
        name: "New Operations Branch",
        nearbyLandmark: null,
        phone: "+9647500000000",
        timezone: "Asia/Baghdad",
      },
      contextOrganizationId: fixture.organizationA.id,
      idempotencyKey: key,
    };
    const created = await createOperationalBranch(createInput);
    assert.equal(created.replayed, false);
    assert.equal((await createOperationalBranch(createInput)).replayed, true);
    assert.equal(await prisma.branch.count({ where: { organizationId: fixture.organizationA.id, name: "New Operations Branch" } }), 1);
    await assert.rejects(
      createOperationalBranch({ ...createInput, branch: { ...createInput.branch, name: "Changed replay" } }),
      operationCode("IDEMPOTENCY_CONFLICT"),
    );
    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: created.branchId } });
    const updated = await updateOperationalBranch({
      actor: fixture.owner.reference,
      branch: { ...branchInput(branch), city: "Erbil" },
      branchId: branch.id,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: branch.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
    });
    assert.equal((await prisma.branch.findUniqueOrThrow({ where: { id: branch.id } })).city, "Erbil");
    await assert.rejects(
      updateOperationalBranch({
        actor: fixture.owner.reference,
        branch: branchInput(branch),
        branchId: branch.id,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: branch.updatedAt.toISOString(),
        idempotencyKey: randomUUID(),
      }),
      operationCode("STALE_VERSION"),
    );
    assert.ok(updated.version);
    await assert.rejects(
      updateOperationalBranch({
        actor: fixture.owner.reference,
        branch: branchInput(fixture.branchB),
        branchId: fixture.branchB.id,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: fixture.branchB.updatedAt.toISOString(),
        idempotencyKey: randomUUID(),
      }),
      operationCode("BRANCH_NOT_FOUND"),
    );
    const current = await prisma.branch.findUniqueOrThrow({ where: { id: branch.id } });
    await assert.rejects(
      updateOperationalBranch({
        actor: fixture.owner.reference,
        branch: { ...branchInput(current), timezone: "Invalid/Planet" },
        branchId: current.id,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: current.updatedAt.toISOString(),
        idempotencyKey: randomUUID(),
      }),
      operationCode("INVALID_REQUEST"),
    );
  });

  await t.test("timezone changes fail with future generic and Restaurant reservations", async () => {
    await resetBusinessOperationsTestData();
    let fixture = await createBusinessOperationsFixture("timezone-generic");
    await createFutureGenericBooking(fixture);
    let branch = await prisma.branch.findUniqueOrThrow({ where: { id: fixture.activeBranch.id } });
    await assert.rejects(updateOperationalBranch({
      actor: fixture.owner.reference,
      branch: { ...branchInput(branch), timezone: "Asia/Baghdad" },
      branchId: branch.id,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: branch.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
    }), operationCode("TIMEZONE_CHANGE_CONFLICT"));
    await resetBusinessOperationsTestData();
    fixture = await createBusinessOperationsFixture("timezone-restaurant");
    await createFutureRestaurantBooking(fixture);
    branch = await prisma.branch.findUniqueOrThrow({ where: { id: fixture.activeBranch.id } });
    await assert.rejects(updateOperationalBranch({
      actor: fixture.owner.reference,
      branch: { ...branchInput(branch), timezone: "Asia/Baghdad" },
      branchId: branch.id,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: branch.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
    }), operationCode("TIMEZONE_CHANGE_CONFLICT"));
  });

  await t.test("deactivation requires impact confirmation and preserves existing bookings", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("deactivate");
    await prisma.branch.update({ where: { id: fixture.inactiveBranch.id }, data: { status: "ACTIVE" } });
    const generic = await createFutureGenericBooking(fixture);
    const restaurant = await createFutureRestaurantBooking(fixture);
    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: fixture.activeBranch.id } });
    const base = {
      active: false,
      actor: fixture.manager.reference,
      branchId: branch.id,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: branch.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
    };
    await assert.rejects(setOperationalBranchActive({ ...base, confirmFutureReservations: false }), (error: unknown) => {
      assert.ok(error instanceof BusinessOperationsError);
      assert.equal(error.code, "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED");
      assert.deepEqual(error.details, { genericBookings: 1, restaurantReservations: 1, total: 2 });
      return true;
    });
    const result = await setOperationalBranchActive({ ...base, confirmFutureReservations: true });
    assert.equal(result.replayed, false);
    assert.equal((await prisma.branch.findUniqueOrThrow({ where: { id: branch.id } })).status, "INACTIVE");
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: generic.id } })).status, "CONFIRMED");
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: restaurant.id } })).status, "CONFIRMED");
  });

  await t.test("last active Branch and archival relationships are guarded; soft archival preserves history", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("archive");
    await assert.rejects(setOperationalBranchActive({
      active: false,
      actor: fixture.owner.reference,
      branchId: fixture.activeBranch.id,
      confirmFutureReservations: true,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: fixture.activeBranch.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
    }), operationCode("BRANCH_LAST_ACTIVE"));
    await prisma.branch.update({ where: { id: fixture.activeBranch.id }, data: { status: "INACTIVE" } });
    const blockedVersion = (await prisma.branch.findUniqueOrThrow({ where: { id: fixture.activeBranch.id } })).updatedAt;
    await assert.rejects(archiveOperationalBranch({
      actor: fixture.owner.reference,
      branchId: fixture.activeBranch.id,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: blockedVersion.toISOString(),
      idempotencyKey: randomUUID(),
    }), operationCode("BRANCH_ARCHIVE_CONFLICT"));
    const historical = await prisma.booking.create({
      data: {
        branchId: fixture.inactiveBranch.id,
        customerId: fixture.customer.id,
        customerNameSnapshot: "Historical",
        endsAt: new Date(Date.now() - 86_400_000),
        organizationId: fixture.organizationA.id,
        priceSnapshot: "0",
        serviceNameSnapshot: "Historical",
        startsAt: new Date(Date.now() - 90_000_000),
        status: "COMPLETED",
      },
    });
    const inactive = await prisma.branch.findUniqueOrThrow({ where: { id: fixture.inactiveBranch.id } });
    await archiveOperationalBranch({
      actor: fixture.owner.reference,
      branchId: inactive.id,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: inactive.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
    });
    const archived = await prisma.branch.findUniqueOrThrow({ where: { id: inactive.id } });
    assert.equal(archived.status, "ARCHIVED");
    assert.ok(archived.deletedAt);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: historical.id } })).branchId, archived.id);
  });

  await t.test("full seven-day hours updates reject invalid input, require impact confirmation, and preserve reservations", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("hours-impact");
    const generic = await createFutureGenericBooking(fixture);
    const restaurant = await createFutureRestaurantBooking(fixture);
    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: fixture.activeBranch.id } });
    const base = {
      actor: fixture.manager.reference,
      branchId: branch.id,
      contextOrganizationId: fixture.organizationA.id,
      days: closedSchedule(),
      expectedVersion: branch.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
    };
    await assert.rejects(updateOperationalHours({ ...base, confirmFutureReservations: false }), operationCode("FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED"));
    await updateOperationalHours({ ...base, confirmFutureReservations: true });
    assert.equal(await prisma.businessHour.count({ where: { branchId: branch.id } }), 7);
    assert.equal(await prisma.businessHour.count({ where: { branchId: branch.id, isOpen: true } }), 0);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: generic.id } })).status, "CONFIRMED");
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: restaurant.id } })).status, "CONFIRMED");
    const current = await prisma.branch.findUniqueOrThrow({ where: { id: branch.id } });
    await assert.rejects(updateOperationalHours({
      actor: fixture.owner.reference,
      branchId: branch.id,
      confirmFutureReservations: true,
      contextOrganizationId: fixture.organizationA.id,
      days: closedSchedule().map((day) => ({ ...day, dayOfWeek: 0 })),
      expectedVersion: current.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
    }), operationCode("INVALID_REQUEST"));
  });

  await t.test("working hours changes remove generic and Restaurant availability", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("hours-availability");
    const date = futureDate();
    assert.ok((await getPublicBookingAvailability({ branchServiceId: fixture.offering.id, date, memberId: null })).slots.length);
    assert.ok((await getPublicRestaurantReservationAvailability({ branchId: fixture.activeBranch.id, date, guestCount: 2, seatingArea: null })).slots.length);
    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: fixture.activeBranch.id } });
    await updateOperationalHours({
      actor: fixture.owner.reference,
      branchId: branch.id,
      confirmFutureReservations: false,
      contextOrganizationId: fixture.organizationA.id,
      days: closedSchedule(),
      expectedVersion: branch.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
    });
    assert.equal((await getPublicBookingAvailability({ branchServiceId: fixture.offering.id, date, memberId: null })).slots.length, 0);
    assert.equal((await getPublicRestaurantReservationAvailability({ branchId: fixture.activeBranch.id, date, guestCount: 2, seatingArea: null })).slots.length, 0);
  });

  await t.test("Receptionist manages Branch blocks; Staff is denied; overlap and replay are exact", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("blocks");
    const date = futureDate();
    const key = randomUUID();
    const base = {
      actor: fixture.receptionist.reference,
      block: localBlockInput(date),
      branchId: fixture.activeBranch.id,
      confirmFutureReservations: false,
      contextOrganizationId: fixture.organizationA.id,
      idempotencyKey: key,
    };
    const created = await createOperationalBlock(base);
    assert.equal(created.replayed, false);
    assert.equal((await createOperationalBlock(base)).replayed, true);
    assert.equal(await prisma.blockedTime.count({ where: { branchId: fixture.activeBranch.id, memberId: null } }), 1);
    assert.equal(await prisma.businessAuditLog.count({ where: { action: "BLOCK_CREATE", targetId: created.blockId } }), 1);
    await assert.rejects(createOperationalBlock({ ...base, idempotencyKey: randomUUID(), block: localBlockInput(date, "12:00", "14:00") }), operationCode("BLOCK_TIME_CONFLICT"));
    await assert.rejects(createOperationalBlock({ ...base, actor: fixture.staff.reference, idempotencyKey: randomUUID(), block: localBlockInput(date, "15:00", "16:00") }), operationCode("FORBIDDEN"));
    const listed = await listOperationalBlocks(fixture.receptionist.reference, fixture.activeBranch.id);
    assert.equal(listed.blocks[0]?.reason, "Private operational reason");
    const publicProfile = await getPublicBusiness(fixture.organizationA.slug);
    assert.equal(JSON.stringify(publicProfile).includes("Private operational reason"), false);
  });

  await t.test("Branch blocks remove overlapping generic and Restaurant slots and require reservation impact confirmation", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("block-impact");
    const date = futureDate();
    const generic = await createFutureGenericBooking(fixture, date);
    const restaurant = await createFutureRestaurantBooking(fixture, date);
    const block = localBlockInput(date, "11:00", "16:00");
    const base = {
      actor: fixture.owner.reference,
      block,
      branchId: fixture.activeBranch.id,
      contextOrganizationId: fixture.organizationA.id,
      idempotencyKey: randomUUID(),
    };
    await assert.rejects(createOperationalBlock({ ...base, confirmFutureReservations: false }), (error: unknown) => {
      assert.ok(error instanceof BusinessOperationsError);
      assert.equal(error.code, "FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED");
      assert.deepEqual(error.details, { genericBookings: 1, restaurantReservations: 1, total: 2 });
      return true;
    });
    await createOperationalBlock({ ...base, confirmFutureReservations: true });
    const genericAvailability = await getPublicBookingAvailability({ branchServiceId: fixture.offering.id, date, memberId: null });
    assert.equal(genericAvailability.slots.some((slot) => new Date(slot.startsAt).getUTCHours() >= 11 && new Date(slot.startsAt).getUTCHours() < 16), false);
    const restaurantAvailability = await getPublicRestaurantReservationAvailability({ branchId: fixture.activeBranch.id, date, guestCount: 2, seatingArea: null });
    assert.equal(restaurantAvailability.slots.some((slot) => new Date(slot.startsAt).getUTCHours() >= 11 && new Date(slot.startsAt).getUTCHours() < 16), false);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: generic.id } })).status, "CONFIRMED");
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: restaurant.id } })).status, "CONFIRMED");
  });

  await t.test("block update/delete use versions and concurrent overlaps commit once", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("block-concurrency");
    const date = futureDate();
    const results = await Promise.allSettled([
      createOperationalBlock({ actor: fixture.owner.reference, block: localBlockInput(date, "10:00", "12:00"), branchId: fixture.activeBranch.id, confirmFutureReservations: false, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID() }),
      createOperationalBlock({ actor: fixture.manager.reference, block: localBlockInput(date, "11:00", "13:00"), branchId: fixture.activeBranch.id, confirmFutureReservations: false, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID() }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const current = await prisma.blockedTime.findFirstOrThrow({ where: { branchId: fixture.activeBranch.id } });
    await prisma.blockedTime.update({ where: { id: current.id }, data: { reason: "Concurrent edit" } });
    await assert.rejects(updateOperationalBlock({
      actor: fixture.owner.reference,
      block: localBlockInput(date, "14:00", "15:00"),
      blockId: current.id,
      branchId: fixture.activeBranch.id,
      confirmFutureReservations: false,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: current.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
    }), operationCode("STALE_VERSION"));
    const refreshed = await prisma.blockedTime.findUniqueOrThrow({ where: { id: current.id } });
    const updated = await updateOperationalBlock({
      actor: fixture.owner.reference,
      block: localBlockInput(date, "14:00", "15:00"),
      blockId: current.id,
      branchId: fixture.activeBranch.id,
      confirmFutureReservations: false,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: refreshed.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
    });
    const deleted = await deleteOperationalBlock({
      actor: fixture.owner.reference,
      blockId: current.id,
      branchId: fixture.activeBranch.id,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: updated.version,
      idempotencyKey: randomUUID(),
    });
    assert.equal(deleted.replayed, false);
    assert.equal(await prisma.blockedTime.count({ where: { id: current.id } }), 0);
  });

  await t.test("two Organizations, active-business changes, replay ownership, and audit rollback remain isolated", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("isolation");
    const aSettings = await readOperationalSettings(fixture.owner.reference);
    await assert.rejects(updateOperationalSettings({
      actor: fixture.ownerB.reference,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: aSettings.version,
      idempotencyKey: randomUUID(),
      settings: { bookingEnabled: false, cancellationWindowHours: 24, marketplaceVisible: false },
    }), operationCode("ACTIVE_ORGANIZATION_CHANGED"));
    assert.equal((await prisma.organizationSettings.findUniqueOrThrow({ where: { organizationId: fixture.organizationA.id } })).bookingEnabled, true);
    assert.equal((await prisma.organizationSettings.findUniqueOrThrow({ where: { organizationId: fixture.organizationB.id } })).bookingEnabled, true);
    const key = randomUUID();
    await updateOperationalSettings({
      actor: fixture.owner.reference,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: aSettings.version,
      idempotencyKey: key,
      settings: { bookingEnabled: true, cancellationWindowHours: 30, marketplaceVisible: true },
    });
    const bSettings = await readOperationalSettings(fixture.ownerB.reference);
    await updateOperationalSettings({
      actor: fixture.ownerB.reference,
      contextOrganizationId: fixture.organizationB.id,
      expectedVersion: bSettings.version,
      idempotencyKey: key,
      settings: { bookingEnabled: true, cancellationWindowHours: 30, marketplaceVisible: true },
    });
    assert.equal(await prisma.businessOperationMutation.count({ where: { idempotencyKey: key } }), 2);
    await assert.rejects(readOperationalSettings({
      contextOrganizationId: fixture.organizationA.id,
      membershipId: fixture.ownerB.membership.id,
      personId: fixture.owner.person.id,
    }), operationCode("MEMBERSHIP_UNAVAILABLE"));
    const actor = await resolveBusinessOperationActor(fixture.owner.reference, "SETTINGS_READ");
    const rollbackKey = randomUUID();
    await assert.rejects(prisma.$transaction(async (transaction) => {
      await recordBusinessOperation(transaction, {
        action: "ROLLBACK_PROBE",
        actor,
        after: { cookie: "must-not-persist" },
        idempotencyKey: rollbackKey,
        requestHash: "a".repeat(64),
        resultVersion: new Date(),
        targetId: fixture.organizationA.id,
        targetType: "Organization",
      });
      throw new Error("rollback");
    }));
    assert.equal(await prisma.businessAuditLog.count({ where: { action: "ROLLBACK_PROBE" } }), 0);
    assert.equal(await prisma.businessOperationMutation.count({ where: { idempotencyKey: rollbackKey } }), 0);
    const auditJson = JSON.stringify(await prisma.businessAuditLog.findMany({ where: { organizationId: fixture.organizationA.id } }));
    assert.doesNotMatch(auditJson, /cookie|session|token|database.?url|password|secret/i);
  });
});
