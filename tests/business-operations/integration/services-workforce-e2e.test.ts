import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { BookingDomainError } from "../../../features/bookings/domain/errors";
import { createCustomerBooking } from "../../../features/bookings/services/booking-creation";
import { getPublicBookingAvailability } from "../../../features/bookings/services/booking-availability";
import { BusinessOperationsError } from "../../../features/business-operations/domain/errors";
import {
  addOperationalBranchAssignment,
  addOperationalServiceAssignment,
  removeOperationalBranchAssignment,
  removeOperationalServiceAssignment,
} from "../../../features/business-operations/services/assignments";
import {
  acceptOperationalInvitation,
  createOperationalInvitation,
  revokeOperationalInvitation,
} from "../../../features/business-operations/services/invitations";
import {
  createOperationalMemberBlock,
  deleteOperationalMemberBlock,
  listOperationalMemberBlocks,
  updateOperationalMemberBlock,
} from "../../../features/business-operations/services/member-blocks";
import {
  createOperationalOffering,
  removeOperationalOffering,
  updateOperationalOffering,
} from "../../../features/business-operations/services/offerings";
import {
  archiveOperationalService,
  createOperationalService,
  listOperationalServices,
  setOperationalServiceActive,
  updateOperationalService,
} from "../../../features/business-operations/services/service-catalog";
import {
  readOperationalStaffSchedule,
  updateOperationalStaffSchedule,
} from "../../../features/business-operations/services/staff-schedules";
import {
  removeOperationalMembership,
  setOperationalMembershipActive,
  updateOperationalMemberRole,
} from "../../../features/business-operations/services/workforce";
import { prisma } from "../../../lib/db/prisma";
import {
  createBusinessOperationsFixture,
  createFutureGenericBooking,
  futureDate,
  resetBusinessOperationsTestData,
} from "../helpers/business-operations-fixture";

function hasCode(code: BusinessOperationsError["code"]) {
  return (error: unknown) => error instanceof BusinessOperationsError && error.code === code;
}

function serviceInput(fixture: Awaited<ReturnType<typeof createBusinessOperationsFixture>>, name: string, mode: "NONE" | "OPTIONAL" | "REQUIRED" = "OPTIONAL") {
  return {
    categoryId: fixture.category.id,
    description: "Stage 2B operational Service",
    name,
    staffSelectionMode: mode,
  };
}

function fullSchedule(closeTime = "18:00") {
  return {
    days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      closeTime,
      dayOfWeek,
      isOpen: true,
      openTime: "09:00",
    })),
  };
}

async function assignAndSchedule(fixture: Awaited<ReturnType<typeof createBusinessOperationsFixture>>) {
  const branchAssignment = await addOperationalBranchAssignment({
    actor: fixture.owner.reference,
    branchId: fixture.activeBranch.id,
    contextOrganizationId: fixture.organizationA.id,
    idempotencyKey: randomUUID(),
    memberId: fixture.staff.membership.id,
  });
  const serviceAssignment = await addOperationalServiceAssignment({
    actor: fixture.owner.reference,
    contextOrganizationId: fixture.organizationA.id,
    idempotencyKey: randomUUID(),
    memberId: fixture.staff.membership.id,
    serviceId: fixture.service.id,
  });
  const schedule = await readOperationalStaffSchedule(
    fixture.owner.reference,
    fixture.staff.membership.id,
    fixture.activeBranch.id,
  );
  await updateOperationalStaffSchedule({
    actor: fixture.owner.reference,
    branchId: fixture.activeBranch.id,
    confirmFutureBookings: false,
    contextOrganizationId: fixture.organizationA.id,
    expectedVersion: schedule.version,
    idempotencyKey: randomUUID(),
    memberId: fixture.staff.membership.id,
    schedule: fullSchedule(),
  });
  return { branchAssignment, serviceAssignment };
}

test("Stage 2B Services and Workforce operations are tenant-safe, replay-safe, and availability-connected", { concurrency: false }, async (t) => {
  await resetBusinessOperationsTestData();
  t.after(async () => {
    await resetBusinessOperationsTestData();
    await prisma.$disconnect();
  });

  await t.test("Service lifecycle enforces roles, tenant scope, replay, stale versions, impact, and soft archive", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("stage2b-services");
    const key = randomUUID();
    const createInput = {
      actor: fixture.owner.reference,
      contextOrganizationId: fixture.organizationA.id,
      idempotencyKey: key,
      service: serviceInput(fixture, "Owner Service"),
    };
    const created = await createOperationalService(createInput);
    assert.equal(created.replayed, false);
    assert.equal((await createOperationalService(createInput)).replayed, true);
    assert.equal(await prisma.service.count({ where: { id: created.serviceId } }), 1);
    await assert.rejects(
      createOperationalService({ ...createInput, service: serviceInput(fixture, "Changed replay") }),
      hasCode("IDEMPOTENCY_CONFLICT"),
    );
    const managerCreated = await createOperationalService({
      ...createInput,
      actor: fixture.manager.reference,
      idempotencyKey: randomUUID(),
      service: serviceInput(fixture, "Manager Service"),
    });
    assert.ok(managerCreated.serviceId);
    for (const actor of [fixture.receptionist.reference, fixture.staff.reference]) {
      await assert.rejects(
        createOperationalService({ ...createInput, actor, idempotencyKey: randomUUID() }),
        hasCode("FORBIDDEN"),
      );
    }
    const foreign = await prisma.service.create({
      data: {
        categoryId: fixture.category.id,
        name: "Foreign Service",
        organizationId: fixture.organizationB.id,
      },
    });
    await assert.rejects(
      updateOperationalService({
        actor: fixture.owner.reference,
        confirmFutureBookings: false,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: foreign.updatedAt.toISOString(),
        idempotencyKey: randomUUID(),
        service: serviceInput(fixture, "Forged"),
        serviceId: foreign.id,
      }),
      hasCode("SERVICE_NOT_FOUND"),
    );
    const current = await prisma.service.findUniqueOrThrow({ where: { id: created.serviceId } });
    await prisma.service.update({ where: { id: current.id }, data: { description: "concurrent" } });
    await assert.rejects(
      updateOperationalService({
        actor: fixture.owner.reference,
        confirmFutureBookings: false,
        contextOrganizationId: fixture.organizationA.id,
        expectedVersion: current.updatedAt.toISOString(),
        idempotencyKey: randomUUID(),
        service: serviceInput(fixture, "Stale"),
        serviceId: current.id,
      }),
      hasCode("STALE_VERSION"),
    );
    const future = await createFutureGenericBooking(fixture);
    const lifecycle = await prisma.service.findUniqueOrThrow({ where: { id: fixture.service.id } });
    const lifecycleInput = {
      active: false,
      actor: fixture.manager.reference,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: lifecycle.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
      serviceId: lifecycle.id,
    };
    await assert.rejects(setOperationalServiceActive({ ...lifecycleInput, confirmFutureBookings: false }), hasCode("FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED"));
    await setOperationalServiceActive({ ...lifecycleInput, confirmFutureBookings: true });
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: future.id } })).status, "CONFIRMED");
    const inactive = await prisma.service.create({ data: { categoryId: fixture.category.id, name: "Archivable", organizationId: fixture.organizationA.id, status: "INACTIVE" } });
    const archived = await archiveOperationalService({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: inactive.updatedAt.toISOString(), idempotencyKey: randomUUID(), serviceId: inactive.id });
    assert.equal(archived.status, "ARCHIVED");
    assert.ok((await prisma.service.findUniqueOrThrow({ where: { id: inactive.id } })).deletedAt);
    const linked = await prisma.service.create({ data: { categoryId: fixture.category.id, name: "Linked", organizationId: fixture.organizationA.id, status: "INACTIVE", branchServices: { create: { branchId: fixture.activeBranch.id, durationMinutes: 30, price: "10" } } } });
    await assert.rejects(archiveOperationalService({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: linked.updatedAt.toISOString(), idempotencyKey: randomUUID(), serviceId: linked.id }), hasCode("SERVICE_ARCHIVE_CONFLICT"));
  });

  await t.test("Service catalog reads use structurally distinct role DTOs and query-scoped branch and workforce data", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("stage2b-catalog-scope");
    const suffix = randomUUID().slice(0, 8);
    const visibleBranchName = `VISIBLE_STAFF_BRANCH_${suffix}`;
    const unassignedBranchName = `HIDDEN_FROM_STAFF_BRANCH_${suffix}`;
    const inactiveBranchName = `INACTIVE_BRANCH_SENTINEL_${suffix}`;
    const deletedBranchName = `DELETED_BRANCH_SENTINEL_${suffix}`;
    const unavailableBranchName = `UNAVAILABLE_BRANCH_SENTINEL_${suffix}`;
    const foreignBranchName = `FOREIGN_BRANCH_SENTINEL_${suffix}`;

    await prisma.branch.update({ where: { id: fixture.activeBranch.id }, data: { name: visibleBranchName } });
    await prisma.branch.update({ where: { id: fixture.inactiveBranch.id }, data: { name: inactiveBranchName } });
    await prisma.branch.update({ where: { id: fixture.branchB.id }, data: { name: foreignBranchName } });
    const [unassignedBranch, deletedBranch, unavailableBranch] = await Promise.all([
      prisma.branch.create({ data: { name: unassignedBranchName, organizationId: fixture.organizationA.id, slug: `unassigned-${suffix}`, status: "ACTIVE" } }),
      prisma.branch.create({ data: { deletedAt: new Date(), name: deletedBranchName, organizationId: fixture.organizationA.id, slug: `deleted-${suffix}`, status: "ACTIVE" } }),
      prisma.branch.create({ data: { name: unavailableBranchName, organizationId: fixture.organizationA.id, slug: `unavailable-${suffix}`, status: "ACTIVE" } }),
    ]);
    const extraOfferings = await Promise.all([
      prisma.branchService.create({ data: { branchId: unassignedBranch.id, durationMinutes: 41, price: "41001", serviceId: fixture.service.id } }),
      prisma.branchService.create({ data: { branchId: fixture.inactiveBranch.id, durationMinutes: 42, price: "42002", serviceId: fixture.service.id } }),
      prisma.branchService.create({ data: { branchId: deletedBranch.id, durationMinutes: 43, price: "43003", serviceId: fixture.service.id } }),
      prisma.branchService.create({ data: { branchId: unavailableBranch.id, durationMinutes: 44, isAvailable: false, price: "44004", serviceId: fixture.service.id } }),
      prisma.branchService.create({ data: { branchId: fixture.branchB.id, durationMinutes: 45, price: "45005", serviceId: fixture.service.id } }),
    ]);
    const staffBranchAssignment = await prisma.branchAssignment.create({ data: { branchId: fixture.activeBranch.id, memberId: fixture.staff.membership.id } });
    const [staffAssignment, receptionistAssignment, managerAssignment, ownerAssignment] = await Promise.all([
      prisma.serviceStaffAssignment.create({ data: { memberId: fixture.staff.membership.id, serviceId: fixture.service.id } }),
      prisma.serviceStaffAssignment.create({ data: { memberId: fixture.receptionist.membership.id, serviceId: fixture.service.id } }),
      prisma.serviceStaffAssignment.create({ data: { memberId: fixture.manager.membership.id, serviceId: fixture.service.id } }),
      prisma.serviceStaffAssignment.create({ data: { memberId: fixture.owner.membership.id, serviceId: fixture.service.id } }),
    ]);
    const coworkerOnlyService = await prisma.service.create({
      data: {
        categoryId: fixture.category.id,
        name: `COWORKER_ONLY_SERVICE_${suffix}`,
        organizationId: fixture.organizationA.id,
        staffAssignments: { create: { memberId: fixture.manager.membership.id } },
      },
    });
    await prisma.branchService.create({ data: { branchId: fixture.activeBranch.id, durationMinutes: 50, price: "50006", serviceId: coworkerOnlyService.id } });

    const management = await listOperationalServices(fixture.owner.reference);
    assert.equal(management.scope, "MANAGEMENT");
    assert.equal(management.canWrite, true);
    if (management.scope !== "MANAGEMENT") assert.fail("Expected management catalog");
    const managedService = management.services.find((service) => service.id === fixture.service.id);
    assert.ok(managedService);
    assert.deepEqual(new Set(managedService.assignedMemberIds), new Set([fixture.manager.membership.id, fixture.receptionist.membership.id, fixture.staff.membership.id]));
    assert.equal(managedService.assignedMemberIds.includes(fixture.owner.membership.id), false);
    assert.equal(managedService.staffAssignments.some((assignment) => assignment.id === ownerAssignment.id), false);
    assert.equal(managedService.staffAssignments.some((assignment) => assignment.id === staffAssignment.id), true);
    assert.equal(managedService.staffAssignments.some((assignment) => assignment.id === receptionistAssignment.id), true);
    assert.equal(managedService.staffAssignments.some((assignment) => assignment.id === managerAssignment.id), true);
    assert.equal(managedService.offerings.length, 5);
    assert.equal(managedService.offerings.some((offering) => offering.branchName === foreignBranchName), false);

    const managerCatalog = await listOperationalServices(fixture.manager.reference);
    if (managerCatalog.scope !== "MANAGEMENT") assert.fail("Expected Manager management catalog");
    const managerService = managerCatalog.services.find((service) => service.id === fixture.service.id);
    assert.ok(managerService);
    assert.deepEqual(new Set(managerService.assignedMemberIds), new Set([fixture.receptionist.membership.id, fixture.staff.membership.id]));
    assert.equal(managerService.assignedMemberIds.includes(fixture.manager.membership.id), false);
    assert.equal(managerService.assignedMemberIds.includes(fixture.owner.membership.id), false);

    const receptionist = await listOperationalServices(fixture.receptionist.reference);
    assert.equal(receptionist.scope, "RECEPTIONIST");
    if (receptionist.scope !== "RECEPTIONIST") assert.fail("Expected receptionist catalog");
    const receptionistService = receptionist.services.find((service) => service.name === fixture.service.name);
    assert.ok(receptionistService);
    assert.deepEqual(new Set(receptionistService.offerings.map((offering) => offering.branchName)), new Set([visibleBranchName, unassignedBranchName]));
    const receptionistPayload = JSON.stringify(receptionist);
    for (const excluded of [inactiveBranchName, fixture.inactiveBranch.id, "42002", deletedBranchName, deletedBranch.id, "43003", unavailableBranchName, unavailableBranch.id, "44004", foreignBranchName, fixture.branchB.id, "45005", fixture.owner.membership.id, fixture.manager.membership.id, fixture.staff.membership.id, ownerAssignment.id, ...extraOfferings.map((offering) => offering.id)]) {
      assert.equal(receptionistPayload.includes(excluded), false, `Receptionist payload leaked ${excluded}`);
    }
    assert.equal("version" in receptionistService, false);
    assert.equal("id" in receptionistService, false);
    assert.equal("branchId" in receptionistService.offerings[0]!, false);

    const staff = await listOperationalServices(fixture.staff.reference);
    assert.equal(staff.scope, "STAFF");
    if (staff.scope !== "STAFF") assert.fail("Expected staff catalog");
    assert.equal(staff.scheduleMemberId, fixture.staff.membership.id);
    assert.deepEqual(staff.services.map((service) => service.name), [fixture.service.name]);
    assert.deepEqual(staff.services[0]?.offerings.map((offering) => offering.branchName), [visibleBranchName]);
    const staffPayload = JSON.stringify(staff);
    for (const excluded of [unassignedBranchName, unassignedBranch.id, "41001", inactiveBranchName, fixture.inactiveBranch.id, "42002", deletedBranchName, deletedBranch.id, "43003", unavailableBranchName, unavailableBranch.id, "44004", foreignBranchName, fixture.branchB.id, "45005", coworkerOnlyService.name, fixture.owner.membership.id, fixture.manager.membership.id, ownerAssignment.id, managerAssignment.id, ...extraOfferings.map((offering) => offering.id)]) {
      assert.equal(staffPayload.includes(excluded), false, `Staff payload leaked ${excluded}`);
    }
    assert.equal("version" in staff.services[0]!, false);
    assert.equal("id" in staff.services[0]!, false);
    assert.equal("branchId" in staff.services[0]!.offerings[0]!, false);

    await prisma.branchAssignment.delete({ where: { id: staffBranchAssignment.id } });
    const staffWithoutActiveBranch = await listOperationalServices(fixture.staff.reference);
    if (staffWithoutActiveBranch.scope !== "STAFF") assert.fail("Expected staff catalog");
    assert.equal(staffWithoutActiveBranch.scheduleMemberId, null);
    assert.deepEqual(staffWithoutActiveBranch.services[0]?.offerings, []);
  });

  await t.test("Branch offerings validate relationships and preserve historical price and duration snapshots", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("stage2b-offerings");
    const service = await prisma.service.create({ data: { categoryId: fixture.category.id, name: "Offering Service", organizationId: fixture.organizationA.id } });
    const key = randomUUID();
    const createInput = {
      actor: fixture.manager.reference,
      branchId: fixture.activeBranch.id,
      contextOrganizationId: fixture.organizationA.id,
      idempotencyKey: key,
      offering: { durationMinutes: 30, price: "100.00", pricingType: "FIXED" as const },
      serviceId: service.id,
    };
    const created = await createOperationalOffering(createInput);
    assert.equal((await createOperationalOffering(createInput)).replayed, true);
    await assert.rejects(createOperationalOffering({ ...createInput, branchId: fixture.branchB.id, idempotencyKey: randomUUID() }), hasCode("OFFERING_NOT_FOUND"));
    const booking = await prisma.booking.create({
      data: {
        branchId: fixture.activeBranch.id,
        branchServiceId: created.offeringId,
        customerId: fixture.customer.id,
        customerNameSnapshot: "Snapshot Customer",
        endsAt: new Date(`${futureDate()}T12:30:00.000Z`),
        organizationId: fixture.organizationA.id,
        priceSnapshot: "100.00",
        serviceNameSnapshot: "Offering Service",
        startsAt: new Date(`${futureDate()}T12:00:00.000Z`),
        status: "CONFIRMED",
      },
    });
    const current = await prisma.branchService.findUniqueOrThrow({ where: { id: created.offeringId } });
    const updateInput = {
      actor: fixture.owner.reference,
      contextOrganizationId: fixture.organizationA.id,
      expectedVersion: current.updatedAt.toISOString(),
      idempotencyKey: randomUUID(),
      isAvailable: true,
      offering: { durationMinutes: 60, price: "200.00", pricingType: "STARTING_FROM" as const },
      offeringId: current.id,
    };
    await assert.rejects(updateOperationalOffering({ ...updateInput, confirmFutureBookings: false }), hasCode("FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED"));
    await updateOperationalOffering({ ...updateInput, confirmFutureBookings: true });
    const preserved = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    assert.equal(preserved.priceSnapshot.toString(), "100");
    assert.equal(preserved.startsAt.toISOString(), `${futureDate()}T12:00:00.000Z`);
    assert.equal(preserved.endsAt.toISOString(), `${futureDate()}T12:30:00.000Z`);
    const unused = await prisma.branchService.create({ data: { branchId: fixture.inactiveBranch.id, durationMinutes: 30, price: "50", serviceId: service.id } });
    const removed = await removeOperationalOffering({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: unused.updatedAt.toISOString(), idempotencyKey: randomUUID(), offeringId: unused.id });
    assert.equal(removed.replayed, false);
    assert.equal(await prisma.branchService.count({ where: { id: unused.id } }), 0);
    const used = await prisma.branchService.findUniqueOrThrow({ where: { id: created.offeringId } });
    await assert.rejects(removeOperationalOffering({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: used.updatedAt.toISOString(), idempotencyKey: randomUUID(), offeringId: used.id }), hasCode("OFFERING_CONFLICT"));
  });

  await t.test("invitation create, authority, duplicate, revoke, expire, accept, and exact replay are safe", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("stage2b-invites");
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const managerEmail = `manager-${randomUUID()}@example.test`;
    const key = randomUUID();
    const invitation = await createOperationalInvitation({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: key, invitation: { email: managerEmail, expiresAt, systemRole: "MANAGER" } });
    assert.equal((await createOperationalInvitation({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: key, invitation: { email: managerEmail, expiresAt, systemRole: "MANAGER" } })).replayed, true);
    await assert.rejects(createOperationalInvitation({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), invitation: { email: managerEmail, expiresAt, systemRole: "MANAGER" } }), hasCode("INVITATION_CONFLICT"));
    await assert.rejects(createOperationalInvitation({ actor: fixture.manager.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), invitation: { email: `forbidden-${randomUUID()}@example.test`, expiresAt, systemRole: "MANAGER" } }), hasCode("FORBIDDEN"));
    const revokedInvite = await createOperationalInvitation({ actor: fixture.manager.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), invitation: { email: `staff-${randomUUID()}@example.test`, expiresAt, systemRole: "STAFF" } });
    const revokedRecord = await prisma.organizationInvitation.findUniqueOrThrow({ where: { id: revokedInvite.invitationId } });
    await revokeOperationalInvitation({ actor: fixture.manager.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: revokedRecord.updatedAt.toISOString(), idempotencyKey: randomUUID(), invitationId: revokedRecord.id });
    await assert.rejects(acceptOperationalInvitation({ email: revokedRecord.email, idempotencyKey: randomUUID(), invitationId: revokedRecord.id, personId: fixture.customer.id }), hasCode("NOT_FOUND"));

    const recipientEmail = `accepted-${randomUUID()}@example.test`;
    const userId = `stage2b-${randomUUID()}`;
    await prisma.user.create({ data: { email: recipientEmail, emailVerified: true, id: userId, name: "Accepted Member" } });
    const person = await prisma.person.create({ data: { authUserId: userId, firstName: "Accepted", isOnboarded: true, phone: "+9647500000099" } });
    const acceptInvite = await createOperationalInvitation({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), invitation: { email: recipientEmail, expiresAt, systemRole: "STAFF" } });
    const acceptKey = randomUUID();
    const accepted = await acceptOperationalInvitation({ email: recipientEmail, idempotencyKey: acceptKey, invitationId: acceptInvite.invitationId, personId: person.id });
    assert.equal(accepted.replayed, false);
    assert.equal((await acceptOperationalInvitation({ email: recipientEmail, idempotencyKey: acceptKey, invitationId: acceptInvite.invitationId, personId: person.id })).replayed, true);
    assert.equal(await prisma.organizationMember.count({ where: { organizationId: fixture.organizationA.id, personId: person.id } }), 1);
    await assert.rejects(acceptOperationalInvitation({ email: recipientEmail, idempotencyKey: randomUUID(), invitationId: acceptInvite.invitationId, personId: person.id }), hasCode("INVITATION_CONFLICT"));

    const expiredEmail = `expired-${randomUUID()}@example.test`;
    const expired = await createOperationalInvitation({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), invitation: { email: expiredEmail, expiresAt, systemRole: "STAFF" } });
    await prisma.organizationInvitation.update({ where: { id: expired.invitationId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await assert.rejects(acceptOperationalInvitation({ email: expiredEmail, idempotencyKey: randomUUID(), invitationId: expired.invitationId, personId: fixture.customer.id }), hasCode("INVITATION_EXPIRED"));
    assert.equal((await prisma.organizationInvitation.findUniqueOrThrow({ where: { id: expired.invitationId } })).status, "EXPIRED");
    const audits = JSON.stringify(await prisma.businessAuditLog.findMany({ where: { organizationId: fixture.organizationA.id } }));
    assert.equal(audits.includes(recipientEmail), false);
    assert.equal(audits.includes(managerEmail), false);
    assert.ok(invitation.invitationId);
  });

  await t.test("membership role and lifecycle protect Owner/Manager authority and preserve bookings", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("stage2b-members");
    const staff = await prisma.organizationMember.findUniqueOrThrow({ where: { id: fixture.staff.membership.id } });
    const changed = await updateOperationalMemberRole({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: staff.updatedAt.toISOString(), idempotencyKey: randomUUID(), memberId: staff.id, systemRole: "RECEPTIONIST" });
    assert.ok(changed.version);
    const manager = await prisma.organizationMember.findUniqueOrThrow({ where: { id: fixture.manager.membership.id } });
    await assert.rejects(updateOperationalMemberRole({ actor: fixture.manager.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: manager.updatedAt.toISOString(), idempotencyKey: randomUUID(), memberId: manager.id, systemRole: "STAFF" }), hasCode("FORBIDDEN"));
    const owner = await prisma.organizationMember.findUniqueOrThrow({ where: { id: fixture.owner.membership.id } });
    await assert.rejects(removeOperationalMembership({ actor: fixture.owner.reference, confirmFutureBookings: true, contextOrganizationId: fixture.organizationA.id, expectedVersion: owner.updatedAt.toISOString(), idempotencyKey: randomUUID(), memberId: owner.id }), hasCode("FORBIDDEN"));

    await prisma.organizationMember.update({ where: { id: staff.id }, data: { roleId: fixture.staff.membership.roleId } });
    await assignAndSchedule(fixture);
    const future = await createFutureGenericBooking(fixture);
    await prisma.booking.update({ where: { id: future.id }, data: { memberId: staff.id } });
    const current = await prisma.organizationMember.findUniqueOrThrow({ where: { id: staff.id } });
    const lifecycle = { active: false, actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, expectedVersion: current.updatedAt.toISOString(), idempotencyKey: randomUUID(), memberId: current.id };
    await assert.rejects(setOperationalMembershipActive({ ...lifecycle, confirmFutureBookings: false }), hasCode("FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED"));
    await setOperationalMembershipActive({ ...lifecycle, confirmFutureBookings: true });
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: future.id } })).memberId, current.id);
    assert.equal((await prisma.organizationMember.findUniqueOrThrow({ where: { id: current.id } })).status, "INACTIVE");
  });

  await t.test("Branch and Service assignments enforce integrity, replay, impact confirmation, and availability removal", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("stage2b-assignments");
    const branchKey = randomUUID();
    const branchInput = { actor: fixture.owner.reference, branchId: fixture.activeBranch.id, contextOrganizationId: fixture.organizationA.id, idempotencyKey: branchKey, memberId: fixture.staff.membership.id };
    const branch = await addOperationalBranchAssignment(branchInput);
    assert.equal((await addOperationalBranchAssignment(branchInput)).replayed, true);
    await assert.rejects(addOperationalBranchAssignment({ ...branchInput, branchId: fixture.branchB.id, idempotencyKey: randomUUID() }), hasCode("BRANCH_NOT_FOUND"));
    const service = await addOperationalServiceAssignment({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), memberId: fixture.staff.membership.id, serviceId: fixture.service.id });
    await assert.rejects(addOperationalServiceAssignment({ actor: fixture.owner.reference, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), memberId: fixture.staff.membership.id, serviceId: fixture.service.id }), hasCode("RELATIONSHIP_CONFLICT"));
    const future = await createFutureGenericBooking(fixture);
    await prisma.booking.update({ where: { id: future.id }, data: { memberId: fixture.staff.membership.id } });
    const serviceRemove = { actor: fixture.owner.reference, assignmentId: service.assignmentId, contextOrganizationId: fixture.organizationA.id, expectedVersion: service.version, idempotencyKey: randomUUID() };
    await assert.rejects(removeOperationalServiceAssignment({ ...serviceRemove, confirmFutureBookings: false }), hasCode("FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED"));
    await removeOperationalServiceAssignment({ ...serviceRemove, confirmFutureBookings: true });
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: future.id } })).memberId, fixture.staff.membership.id);
    const branchRemove = { actor: fixture.owner.reference, assignmentId: branch.assignmentId, contextOrganizationId: fixture.organizationA.id, expectedVersion: branch.version, idempotencyKey: randomUUID() };
    await assert.rejects(removeOperationalBranchAssignment({ ...branchRemove, confirmFutureBookings: false }), hasCode("FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED"));
    await removeOperationalBranchAssignment({ ...branchRemove, confirmFutureBookings: true });
    assert.equal(await prisma.branchAssignment.count({ where: { id: branch.assignmentId } }), 0);
  });

  await t.test("staff schedules are seven-day, Branch-contained, impact-aware, replay-safe, and manager-only", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("stage2b-schedules");
    await addOperationalBranchAssignment({ actor: fixture.owner.reference, branchId: fixture.activeBranch.id, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), memberId: fixture.staff.membership.id });
    const initial = await readOperationalStaffSchedule(fixture.staff.reference, fixture.staff.membership.id, fixture.activeBranch.id);
    assert.equal(initial.canWrite, false);
    const key = randomUUID();
    const input = { actor: fixture.manager.reference, branchId: fixture.activeBranch.id, confirmFutureBookings: false, contextOrganizationId: fixture.organizationA.id, expectedVersion: initial.version, idempotencyKey: key, memberId: fixture.staff.membership.id, schedule: fullSchedule() };
    const saved = await updateOperationalStaffSchedule(input);
    assert.equal(saved.replayed, false);
    assert.equal((await updateOperationalStaffSchedule(input)).replayed, true);
    const current = await readOperationalStaffSchedule(fixture.owner.reference, fixture.staff.membership.id, fixture.activeBranch.id);
    await assert.rejects(updateOperationalStaffSchedule({ ...input, actor: fixture.receptionist.reference, expectedVersion: current.version, idempotencyKey: randomUUID() }), hasCode("FORBIDDEN"));
    await assert.rejects(updateOperationalStaffSchedule({ ...input, actor: fixture.staff.reference, expectedVersion: current.version, idempotencyKey: randomUUID() }), hasCode("FORBIDDEN"));
    await assert.rejects(updateOperationalStaffSchedule({ ...input, expectedVersion: current.version, idempotencyKey: randomUUID(), schedule: fullSchedule("21:00") }), hasCode("RELATIONSHIP_CONFLICT"));
    const future = await createFutureGenericBooking(fixture);
    await prisma.booking.update({ where: { id: future.id }, data: { memberId: fixture.staff.membership.id } });
    const beforeImpact = await readOperationalStaffSchedule(fixture.owner.reference, fixture.staff.membership.id, fixture.activeBranch.id);
    const impacted = { ...input, actor: fixture.owner.reference, expectedVersion: beforeImpact.version, idempotencyKey: randomUUID(), schedule: fullSchedule("11:00") };
    await assert.rejects(updateOperationalStaffSchedule({ ...impacted, confirmFutureBookings: false }), hasCode("FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED"));
    await updateOperationalStaffSchedule({ ...impacted, confirmFutureBookings: true });
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: future.id } })).status, "CONFIRMED");
  });

  await t.test("member leave supports Staff self-service only, overlap/update/delete, and booking impact", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("stage2b-blocks");
    await assignAndSchedule(fixture);
    const date = futureDate(6);
    const input = {
      actor: fixture.staff.reference,
      block: { branchId: fixture.activeBranch.id, endsAt: `${date}T11:00`, reason: "Private leave", startsAt: `${date}T10:00` },
      confirmFutureBookings: false,
      contextOrganizationId: fixture.organizationA.id,
      idempotencyKey: randomUUID(),
      memberId: fixture.staff.membership.id,
    };
    const created = await createOperationalMemberBlock(input);
    assert.equal(created.replayed, false);
    await assert.rejects(createOperationalMemberBlock({ ...input, idempotencyKey: randomUUID(), memberId: fixture.manager.membership.id }), (error: unknown) => error instanceof BusinessOperationsError && ["FORBIDDEN", "NOT_FOUND"].includes(error.code));
    await assert.rejects(createOperationalMemberBlock({ ...input, actor: fixture.receptionist.reference, idempotencyKey: randomUUID() }), hasCode("FORBIDDEN"));
    await assert.rejects(createOperationalMemberBlock({ ...input, block: { ...input.block, startsAt: `${date}T10:30`, endsAt: `${date}T11:30` }, idempotencyKey: randomUUID() }), hasCode("BLOCK_TIME_CONFLICT"));
    const updated = await updateOperationalMemberBlock({ ...input, block: { ...input.block, startsAt: `${date}T11:00`, endsAt: `${date}T12:00` }, blockId: created.blockId, expectedVersion: created.version, idempotencyKey: randomUUID() });
    assert.ok(updated.version);
    const listed = await listOperationalMemberBlocks(fixture.staff.reference, fixture.staff.membership.id);
    assert.equal(listed.blocks[0]?.reason, "Private leave");
    await deleteOperationalMemberBlock({ actor: fixture.staff.reference, blockId: created.blockId, contextOrganizationId: fixture.organizationA.id, expectedVersion: updated.version, idempotencyKey: randomUUID(), memberId: fixture.staff.membership.id });
    assert.equal(await prisma.blockedTime.count({ where: { id: created.blockId } }), 0);

    const booking = await prisma.booking.create({ data: { branchId: fixture.activeBranch.id, branchServiceId: fixture.offering.id, customerId: fixture.customer.id, customerNameSnapshot: "Impact", endsAt: new Date(`${date}T13:00:00.000Z`), memberId: fixture.staff.membership.id, organizationId: fixture.organizationA.id, priceSnapshot: "25000", serviceNameSnapshot: "Impact", startsAt: new Date(`${date}T12:00:00.000Z`), status: "CONFIRMED" } });
    const impact = { ...input, actor: fixture.owner.reference, block: { ...input.block, startsAt: `${date}T12:00`, endsAt: `${date}T13:00` }, idempotencyKey: randomUUID() };
    await assert.rejects(createOperationalMemberBlock({ ...impact, confirmFutureBookings: false }), hasCode("FUTURE_RESERVATIONS_CONFIRMATION_REQUIRED"));
    await createOperationalMemberBlock({ ...impact, confirmFutureBookings: true });
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, "CONFIRMED");
  });

  await t.test("public availability and automatic assignment honor every relationship and concurrent safety", async () => {
    await resetBusinessOperationsTestData();
    const fixture = await createBusinessOperationsFixture("stage2b-availability");
    await prisma.organization.update({ where: { id: fixture.organizationA.id }, data: { vertical: "BEAUTY" } });
    await prisma.service.update({ where: { id: fixture.service.id }, data: { staffSelectionMode: "OPTIONAL" } });
    await assignAndSchedule(fixture);
    const date = futureDate(5);
    const availability = await getPublicBookingAvailability({ branchServiceId: fixture.offering.id, date, memberId: null });
    assert.ok(availability.slots.length > 0, availability.reason);
    assert.ok(availability.slots.every((slot) => slot.memberId === null));
    const slot = availability.slots[0]!;
    const created = await createCustomerBooking({ branchServiceId: fixture.offering.id, customerId: fixture.customer.id, date, idempotencyKey: randomUUID(), memberId: null, startsAt: slot.startsAt });
    assert.equal(created.booking.memberName?.includes("staff"), true);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: created.booking.id } })).memberId, fixture.staff.membership.id);

    const beforeBlock = await getPublicBookingAvailability({ branchServiceId: fixture.offering.id, date, memberId: null });
    const blockedStart = beforeBlock.slots.find((candidate) => candidate.startsAt !== slot.startsAt)!;
    assert.ok(blockedStart);
    const start = new Date(blockedStart.startsAt);
    const end = new Date(start.getTime() + 30 * 60_000);
    const local = (value: Date) => value.toISOString().slice(0, 16);
    await createOperationalMemberBlock({ actor: fixture.owner.reference, block: { branchId: fixture.activeBranch.id, endsAt: local(end), reason: "Availability proof", startsAt: local(start) }, confirmFutureBookings: false, contextOrganizationId: fixture.organizationA.id, idempotencyKey: randomUUID(), memberId: fixture.staff.membership.id });
    const afterBlock = await getPublicBookingAvailability({ branchServiceId: fixture.offering.id, date, memberId: null });
    assert.equal(afterBlock.slots.some((candidate) => candidate.startsAt === blockedStart.startsAt), false);

    await resetBusinessOperationsTestData();
    const concurrent = await createBusinessOperationsFixture("stage2b-concurrent");
    await prisma.organization.update({ where: { id: concurrent.organizationA.id }, data: { vertical: "BEAUTY" } });
    await prisma.service.update({ where: { id: concurrent.service.id }, data: { staffSelectionMode: "OPTIONAL" } });
    await assignAndSchedule(concurrent);
    const customerTwo = await prisma.person.create({ data: { authUserId: `stage2b-customer-${randomUUID()}`, firstName: "Second", isOnboarded: true, phone: "+9647500000011" } });
    const concurrentAvailability = await getPublicBookingAvailability({ branchServiceId: concurrent.offering.id, date, memberId: null });
    const concurrentSlot = concurrentAvailability.slots[0]!;
    const attempts = await Promise.allSettled([
      createCustomerBooking({ branchServiceId: concurrent.offering.id, customerId: concurrent.customer.id, date, idempotencyKey: randomUUID(), memberId: null, startsAt: concurrentSlot.startsAt }),
      createCustomerBooking({ branchServiceId: concurrent.offering.id, customerId: customerTwo.id, date, idempotencyKey: randomUUID(), memberId: null, startsAt: concurrentSlot.startsAt }),
    ]);
    assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((result) => result.status === "rejected" && result.reason instanceof BookingDomainError).length, 1);
    assert.equal(await prisma.booking.count({ where: { memberId: concurrent.staff.membership.id, startsAt: new Date(concurrentSlot.startsAt) } }), 1);
  });
});
