import type { Prisma, PrismaClient, SystemRole } from "@prisma/client";

export const BUSINESS_WORKFORCE_STAGE2B_FIXTURE = {
  namespace: "rezno-qa-business-workforce-stage2b",
  category: { id: "2b000000-0000-4000-8000-000000000001", slug: "rezno-qa-business-workforce-stage2b" },
  organizations: {
    a: { id: "2b000000-0000-4000-8000-000000000002", slug: "rezno-qa-business-workforce-stage2b-a" },
    b: { id: "2b000000-0000-4000-8000-000000000003", slug: "rezno-qa-business-workforce-stage2b-b" },
  },
  people: {
    owner: ["2b000000-0000-4000-8000-000000000010", "fixture:stage2b:owner"],
    manager: ["2b000000-0000-4000-8000-000000000011", "fixture:stage2b:manager"],
    receptionist: ["2b000000-0000-4000-8000-000000000012", "fixture:stage2b:receptionist"],
    staff1: ["2b000000-0000-4000-8000-000000000013", "fixture:stage2b:staff1"],
    staff2: ["2b000000-0000-4000-8000-000000000014", "fixture:stage2b:staff2"],
    customer: ["2b000000-0000-4000-8000-000000000015", "fixture:stage2b:customer"],
  },
  roles: {
    ownerA: "2b000000-0000-4000-8000-000000000020",
    managerA: "2b000000-0000-4000-8000-000000000021",
    receptionistA: "2b000000-0000-4000-8000-000000000022",
    staffA: "2b000000-0000-4000-8000-000000000023",
    ownerB: "2b000000-0000-4000-8000-000000000024",
  },
  members: {
    ownerA: "2b000000-0000-4000-8000-000000000030",
    managerA: "2b000000-0000-4000-8000-000000000031",
    receptionistA: "2b000000-0000-4000-8000-000000000032",
    staff1A: "2b000000-0000-4000-8000-000000000033",
    staff2A: "2b000000-0000-4000-8000-000000000034",
    ownerB: "2b000000-0000-4000-8000-000000000035",
  },
  branches: {
    active: ["2b000000-0000-4000-8000-000000000040", "active"],
    inactive: ["2b000000-0000-4000-8000-000000000041", "inactive"],
    foreign: ["2b000000-0000-4000-8000-000000000042", "foreign"],
  },
  services: {
    automatic: "2b000000-0000-4000-8000-000000000050",
    required: "2b000000-0000-4000-8000-000000000051",
    inactive: "2b000000-0000-4000-8000-000000000052",
  },
  offerings: {
    automatic: "2b000000-0000-4000-8000-000000000060",
    required: "2b000000-0000-4000-8000-000000000061",
    inactive: "2b000000-0000-4000-8000-000000000062",
  },
  assignments: {
    branchStaff1: "2b000000-0000-4000-8000-000000000070",
    branchStaff2: "2b000000-0000-4000-8000-000000000071",
    automaticStaff1: "2b000000-0000-4000-8000-000000000072",
    automaticStaff2: "2b000000-0000-4000-8000-000000000073",
    requiredStaff1: "2b000000-0000-4000-8000-000000000074",
  },
  invitations: {
    pending: "2b000000-0000-4000-8000-000000000080",
    expired: "2b000000-0000-4000-8000-000000000081",
    revoked: "2b000000-0000-4000-8000-000000000082",
  },
  block: "2b000000-0000-4000-8000-000000000090",
  bookings: {
    automatic: "2b000000-0000-4000-8000-000000000091",
    required: "2b000000-0000-4000-8000-000000000092",
  },
} as const;

export class BusinessWorkforceStage2bSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessWorkforceStage2bSeedInvariantError";
  }
}

function instant(offsetDays: number, hour: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays, hour));
}

async function assertTarget(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  if (rows[0]?.database !== "rezno_staging") {
    throw new BusinessWorkforceStage2bSeedInvariantError("The connected database is not the exact rezno_staging target.");
  }
  for (const fixture of Object.values(BUSINESS_WORKFORCE_STAGE2B_FIXTURE.organizations)) {
    const existing = await transaction.organization.findUnique({ where: { slug: fixture.slug }, select: { id: true } });
    if (existing && existing.id !== fixture.id) {
      throw new BusinessWorkforceStage2bSeedInvariantError("A Stage 2B fixture slug is owned by another record.");
    }
  }
}

async function organization(transaction: Prisma.TransactionClient, fixture: { id: string; slug: string }, name: string) {
  const value = await transaction.organization.upsert({
    where: { slug: fixture.slug },
    create: { ...fixture, isActive: true, name, status: "ACTIVE", vertical: "BEAUTY" },
    update: { deletedAt: null, isActive: true, name, status: "ACTIVE", vertical: "BEAUTY" },
  });
  await transaction.organizationSettings.upsert({
    where: { organizationId: value.id },
    create: { bookingEnabled: true, cancellationWindowHours: 24, marketplaceVisible: true, organizationId: value.id },
    update: { bookingEnabled: true, cancellationWindowHours: 24, marketplaceVisible: true },
  });
  return value;
}

async function person(transaction: Prisma.TransactionClient, tuple: readonly [string, string], name: string) {
  return transaction.person.upsert({
    where: { authUserId: tuple[1] },
    create: { authUserId: tuple[1], displayName: name, firstName: name, id: tuple[0], isOnboarded: true, status: "ACTIVE", timezone: "Asia/Baghdad" },
    update: { deletedAt: null, displayName: name, firstName: name, isOnboarded: true, status: "ACTIVE", timezone: "Asia/Baghdad" },
  });
}

async function role(transaction: Prisma.TransactionClient, id: string, organizationId: string, systemRole: SystemRole) {
  return transaction.role.upsert({
    where: { organizationId_name: { name: `Stage2B ${systemRole}`, organizationId } },
    create: { id, isSystem: true, name: `Stage2B ${systemRole}`, organizationId, systemRole },
    update: { isSystem: true, systemRole },
  });
}

async function member(transaction: Prisma.TransactionClient, id: string, organizationId: string, personId: string, roleId: string) {
  return transaction.organizationMember.upsert({
    where: { personId_organizationId: { organizationId, personId } },
    create: { id, organizationId, personId, roleId, status: "ACTIVE" },
    update: { deletedAt: null, roleId, status: "ACTIVE" },
  });
}

async function branch(transaction: Prisma.TransactionClient, tuple: readonly [string, string], organizationId: string, name: string, status: "ACTIVE" | "INACTIVE") {
  const value = await transaction.branch.upsert({
    where: { organizationId_slug: { organizationId, slug: tuple[1] } },
    create: { city: "Baghdad QA", id: tuple[0], name, organizationId, slug: tuple[1], status, timezone: "Asia/Baghdad" },
    update: { deletedAt: null, name, status, timezone: "Asia/Baghdad" },
  });
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    await transaction.businessHour.upsert({
      where: { branchId_dayOfWeek: { branchId: value.id, dayOfWeek } },
      create: { branchId: value.id, closeTime: "20:00", dayOfWeek, isOpen: true, openTime: "09:00" },
      update: { closeTime: "20:00", isOpen: true, openTime: "09:00" },
    });
  }
  return value;
}

export async function seedBusinessWorkforceStage2bFixture(database: PrismaClient) {
  return database.$transaction(async (transaction) => {
    await assertTarget(transaction);
    const fixture = BUSINESS_WORKFORCE_STAGE2B_FIXTURE;
    const organizationA = await organization(transaction, fixture.organizations.a, "REZNO QA Business Workforce Stage 2B");
    const organizationB = await organization(transaction, fixture.organizations.b, "REZNO QA Business Workforce Stage 2B Foreign");
    const people = {
      owner: await person(transaction, fixture.people.owner, "Stage2B Owner"),
      manager: await person(transaction, fixture.people.manager, "Stage2B Manager"),
      receptionist: await person(transaction, fixture.people.receptionist, "Stage2B Receptionist"),
      staff1: await person(transaction, fixture.people.staff1, "Stage2B Staff One"),
      staff2: await person(transaction, fixture.people.staff2, "Stage2B Staff Two"),
      customer: await person(transaction, fixture.people.customer, "Stage2B Customer"),
    };
    const roles = {
      ownerA: await role(transaction, fixture.roles.ownerA, organizationA.id, "OWNER"),
      managerA: await role(transaction, fixture.roles.managerA, organizationA.id, "MANAGER"),
      receptionistA: await role(transaction, fixture.roles.receptionistA, organizationA.id, "RECEPTIONIST"),
      staffA: await role(transaction, fixture.roles.staffA, organizationA.id, "STAFF"),
      ownerB: await role(transaction, fixture.roles.ownerB, organizationB.id, "OWNER"),
    };
    const members = {
      owner: await member(transaction, fixture.members.ownerA, organizationA.id, people.owner.id, roles.ownerA.id),
      manager: await member(transaction, fixture.members.managerA, organizationA.id, people.manager.id, roles.managerA.id),
      receptionist: await member(transaction, fixture.members.receptionistA, organizationA.id, people.receptionist.id, roles.receptionistA.id),
      staff1: await member(transaction, fixture.members.staff1A, organizationA.id, people.staff1.id, roles.staffA.id),
      staff2: await member(transaction, fixture.members.staff2A, organizationA.id, people.staff2.id, roles.staffA.id),
      ownerB: await member(transaction, fixture.members.ownerB, organizationB.id, people.owner.id, roles.ownerB.id),
    };
    const active = await branch(transaction, fixture.branches.active, organizationA.id, "Stage2B Active Branch", "ACTIVE");
    const inactive = await branch(transaction, fixture.branches.inactive, organizationA.id, "Stage2B Inactive Branch", "INACTIVE");
    await branch(transaction, fixture.branches.foreign, organizationB.id, "Stage2B Foreign Branch", "ACTIVE");
    const category = await transaction.category.upsert({
      where: { slug: fixture.category.slug },
      create: { ...fixture.category, name: "Stage2B QA Services" },
      update: { name: "Stage2B QA Services" },
    });
    const serviceRows = {
      automatic: await transaction.service.upsert({ where: { id: fixture.services.automatic }, create: { categoryId: category.id, id: fixture.services.automatic, name: "Stage2B Automatic Service", organizationId: organizationA.id, staffSelectionMode: "OPTIONAL" }, update: { categoryId: category.id, deletedAt: null, name: "Stage2B Automatic Service", staffSelectionMode: "OPTIONAL", status: "ACTIVE" } }),
      required: await transaction.service.upsert({ where: { id: fixture.services.required }, create: { categoryId: category.id, id: fixture.services.required, name: "Stage2B Customer Select Service", organizationId: organizationA.id, staffSelectionMode: "REQUIRED" }, update: { categoryId: category.id, deletedAt: null, name: "Stage2B Customer Select Service", staffSelectionMode: "REQUIRED", status: "ACTIVE" } }),
      inactive: await transaction.service.upsert({ where: { id: fixture.services.inactive }, create: { categoryId: category.id, id: fixture.services.inactive, name: "Stage2B Inactive Service", organizationId: organizationA.id, status: "INACTIVE" }, update: { categoryId: category.id, deletedAt: null, name: "Stage2B Inactive Service", status: "INACTIVE" } }),
    };
    const offerings = {
      automatic: await transaction.branchService.upsert({ where: { branchId_serviceId: { branchId: active.id, serviceId: serviceRows.automatic.id } }, create: { branchId: active.id, durationMinutes: 30, id: fixture.offerings.automatic, price: "25000", serviceId: serviceRows.automatic.id }, update: { durationMinutes: 30, isAvailable: true, price: "25000" } }),
      required: await transaction.branchService.upsert({ where: { branchId_serviceId: { branchId: active.id, serviceId: serviceRows.required.id } }, create: { branchId: active.id, durationMinutes: 45, id: fixture.offerings.required, price: "35000", serviceId: serviceRows.required.id }, update: { durationMinutes: 45, isAvailable: true, price: "35000" } }),
      inactive: await transaction.branchService.upsert({ where: { branchId_serviceId: { branchId: inactive.id, serviceId: serviceRows.inactive.id } }, create: { branchId: inactive.id, durationMinutes: 60, id: fixture.offerings.inactive, isAvailable: false, price: "45000", serviceId: serviceRows.inactive.id }, update: { durationMinutes: 60, isAvailable: false, price: "45000" } }),
    };
    const branchAssignments = [
      [fixture.assignments.branchStaff1, members.staff1.id],
      [fixture.assignments.branchStaff2, members.staff2.id],
    ] as const;
    for (const [id, memberId] of branchAssignments) {
      await transaction.branchAssignment.upsert({ where: { memberId_branchId: { branchId: active.id, memberId } }, create: { branchId: active.id, id, memberId }, update: {} });
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
        await transaction.availability.upsert({
          where: { memberId_branchId_dayOfWeek_startTime_endTime: { branchId: active.id, dayOfWeek, endTime: "18:00", memberId, startTime: "09:00" } },
          create: { branchId: active.id, dayOfWeek, endTime: "18:00", isActive: true, memberId, startTime: "09:00" },
          update: { isActive: true },
        });
      }
    }
    for (const assignment of [
      [fixture.assignments.automaticStaff1, serviceRows.automatic.id, members.staff1.id],
      [fixture.assignments.automaticStaff2, serviceRows.automatic.id, members.staff2.id],
      [fixture.assignments.requiredStaff1, serviceRows.required.id, members.staff1.id],
    ] as const) {
      await transaction.serviceStaffAssignment.upsert({ where: { serviceId_memberId: { memberId: assignment[2], serviceId: assignment[1] } }, create: { id: assignment[0], memberId: assignment[2], serviceId: assignment[1] }, update: {} });
    }
    const blockStart = instant(10, 11);
    await transaction.blockedTime.upsert({ where: { id: fixture.block }, create: { branchId: active.id, endsAt: new Date(blockStart.getTime() + 60 * 60_000), id: fixture.block, memberId: members.staff1.id, reason: "Stage2B internal member leave", startsAt: blockStart }, update: { branchId: active.id, endsAt: new Date(blockStart.getTime() + 60 * 60_000), memberId: members.staff1.id, reason: "Stage2B internal member leave", startsAt: blockStart } });
    const futureStart = instant(14, 13);
    for (const booking of [
      [fixture.bookings.automatic, offerings.automatic.id, members.staff1.id, "Stage2B Automatic Service", "25000", 30],
      [fixture.bookings.required, offerings.required.id, members.staff1.id, "Stage2B Customer Select Service", "35000", 45],
    ] as const) {
      await transaction.booking.upsert({ where: { id: booking[0] }, create: { branchId: active.id, branchServiceId: booking[1], customerId: people.customer.id, customerNameSnapshot: "Stage2B Customer", endsAt: new Date(futureStart.getTime() + booking[5] * 60_000), id: booking[0], memberId: booking[2], organizationId: organizationA.id, priceSnapshot: booking[4], serviceNameSnapshot: booking[3], startsAt: futureStart, status: "CONFIRMED" }, update: { branchId: active.id, branchServiceId: booking[1], customerId: people.customer.id, endsAt: new Date(futureStart.getTime() + booking[5] * 60_000), memberId: booking[2], organizationId: organizationA.id, startsAt: futureStart, status: "CONFIRMED" } });
    }
    const invitations = [
      { id: fixture.invitations.pending, email: "stage2b-pending@rezno.invalid", expiresAt: instant(14, 8), status: "PENDING" as const },
      { id: fixture.invitations.expired, email: "stage2b-expired@rezno.invalid", expiresAt: instant(-1, 8), status: "EXPIRED" as const },
      { id: fixture.invitations.revoked, email: "stage2b-revoked@rezno.invalid", expiresAt: instant(14, 8), status: "CANCELLED" as const },
    ];
    for (const invitation of invitations) {
      await transaction.organizationInvitation.upsert({
        where: { id: invitation.id },
        create: { cancelledAt: invitation.status === "CANCELLED" ? new Date() : null, email: invitation.email, expiresAt: invitation.expiresAt, id: invitation.id, invitedByPersonId: people.owner.id, normalizedEmail: invitation.email, organizationId: organizationA.id, roleId: roles.staffA.id, status: invitation.status },
        update: { cancelledAt: invitation.status === "CANCELLED" ? new Date() : null, expiresAt: invitation.expiresAt, roleId: roles.staffA.id, status: invitation.status },
      });
    }
    return {
      branchAssignments: branchAssignments.length,
      invitations: invitations.length,
      namespace: fixture.namespace,
      organizationA: organizationA.slug,
      organizationB: organizationB.slug,
      services: Object.keys(serviceRows).length,
      staff: 2,
    };
  }, { maxWait: 10_000, timeout: 60_000 });
}
