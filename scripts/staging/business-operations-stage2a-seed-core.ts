import type { Prisma, PrismaClient, SystemRole } from "@prisma/client";

export const BUSINESS_OPERATIONS_STAGE2A_FIXTURE = {
  namespace: "rezno-qa-business-operations-stage2a",
  category: { id: "2a000000-0000-4000-8000-000000000001", slug: "rezno-qa-business-operations-stage2a" },
  organizationA: { id: "2a000000-0000-4000-8000-000000000002", slug: "rezno-qa-business-operations-stage2a-a" },
  organizationB: { id: "2a000000-0000-4000-8000-000000000003", slug: "rezno-qa-business-operations-stage2a-b" },
  people: {
    owner: { id: "2a000000-0000-4000-8000-000000000010", authUserId: "fixture:rezno-qa-business-operations-stage2a:owner" },
    manager: { id: "2a000000-0000-4000-8000-000000000011", authUserId: "fixture:rezno-qa-business-operations-stage2a:manager" },
    receptionist: { id: "2a000000-0000-4000-8000-000000000012", authUserId: "fixture:rezno-qa-business-operations-stage2a:receptionist" },
    staff: { id: "2a000000-0000-4000-8000-000000000013", authUserId: "fixture:rezno-qa-business-operations-stage2a:staff" },
    customer: { id: "2a000000-0000-4000-8000-000000000014", authUserId: "fixture:rezno-qa-business-operations-stage2a:customer" },
  },
  roles: {
    ownerA: "2a000000-0000-4000-8000-000000000020",
    managerA: "2a000000-0000-4000-8000-000000000021",
    receptionistA: "2a000000-0000-4000-8000-000000000022",
    staffA: "2a000000-0000-4000-8000-000000000023",
    ownerB: "2a000000-0000-4000-8000-000000000024",
  },
  members: {
    ownerA: "2a000000-0000-4000-8000-000000000030",
    managerA: "2a000000-0000-4000-8000-000000000031",
    receptionistA: "2a000000-0000-4000-8000-000000000032",
    staffA: "2a000000-0000-4000-8000-000000000033",
    ownerB: "2a000000-0000-4000-8000-000000000034",
  },
  branches: {
    active: { id: "2a000000-0000-4000-8000-000000000040", slug: "active" },
    inactive: { id: "2a000000-0000-4000-8000-000000000041", slug: "inactive" },
    futureGeneric: { id: "2a000000-0000-4000-8000-000000000042", slug: "future-generic" },
    futureRestaurant: { id: "2a000000-0000-4000-8000-000000000043", slug: "future-restaurant" },
    organizationB: { id: "2a000000-0000-4000-8000-000000000044", slug: "other-tenant" },
  },
  service: "2a000000-0000-4000-8000-000000000050",
  offerings: {
    active: "2a000000-0000-4000-8000-000000000051",
    future: "2a000000-0000-4000-8000-000000000052",
  },
  table: "2a000000-0000-4000-8000-000000000060",
  bookings: {
    generic: "2a000000-0000-4000-8000-000000000070",
    restaurant: "2a000000-0000-4000-8000-000000000071",
  },
  restaurantDetails: "2a000000-0000-4000-8000-000000000072",
  block: "2a000000-0000-4000-8000-000000000080",
} as const;

export class BusinessOperationsStage2aSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessOperationsStage2aSeedInvariantError";
  }
}

function futureInstant(offsetDays: number, hour: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays, hour));
}

async function assertTarget(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (rows[0]?.database !== "rezno_staging") {
    throw new BusinessOperationsStage2aSeedInvariantError(
      "The connected database is not the exact rezno_staging target.",
    );
  }
  for (const organization of [
    BUSINESS_OPERATIONS_STAGE2A_FIXTURE.organizationA,
    BUSINESS_OPERATIONS_STAGE2A_FIXTURE.organizationB,
  ]) {
    const existing = await transaction.organization.findUnique({
      where: { slug: organization.slug },
      select: { id: true },
    });
    if (existing && existing.id !== organization.id) {
      throw new BusinessOperationsStage2aSeedInvariantError(
        "A Stage 2A fixture slug is owned by another record.",
      );
    }
  }
}

async function upsertOrganization(
  transaction: Prisma.TransactionClient,
  input: { id: string; name: string; slug: string; vertical: "BEAUTY" | "RESTAURANT" },
) {
  const organization = await transaction.organization.upsert({
    where: { slug: input.slug },
    create: { id: input.id, isActive: true, name: input.name, slug: input.slug, status: "ACTIVE", vertical: input.vertical },
    update: { deletedAt: null, isActive: true, name: input.name, status: "ACTIVE", vertical: input.vertical },
  });
  await transaction.organizationSettings.upsert({
    where: { organizationId: organization.id },
    create: { bookingEnabled: true, cancellationWindowHours: 24, marketplaceVisible: true, organizationId: organization.id },
    update: { bookingEnabled: true, cancellationWindowHours: 24, marketplaceVisible: true },
  });
  return organization;
}

async function upsertPerson(
  transaction: Prisma.TransactionClient,
  fixture: { authUserId: string; id: string },
  name: string,
) {
  return transaction.person.upsert({
    where: { authUserId: fixture.authUserId },
    create: { authUserId: fixture.authUserId, displayName: name, firstName: name, id: fixture.id, isOnboarded: true, status: "ACTIVE", timezone: "Asia/Baghdad" },
    update: { deletedAt: null, displayName: name, firstName: name, isOnboarded: true, status: "ACTIVE", timezone: "Asia/Baghdad" },
  });
}

async function upsertRole(
  transaction: Prisma.TransactionClient,
  input: { id: string; organizationId: string; systemRole: SystemRole },
) {
  return transaction.role.upsert({
    where: { organizationId_name: { name: `Stage2A ${input.systemRole}`, organizationId: input.organizationId } },
    create: { id: input.id, isSystem: true, name: `Stage2A ${input.systemRole}`, organizationId: input.organizationId, systemRole: input.systemRole },
    update: { isSystem: true, systemRole: input.systemRole },
  });
}

async function upsertMember(
  transaction: Prisma.TransactionClient,
  input: { id: string; organizationId: string; personId: string; roleId: string },
) {
  return transaction.organizationMember.upsert({
    where: { personId_organizationId: { organizationId: input.organizationId, personId: input.personId } },
    create: { ...input, status: "ACTIVE" },
    update: { deletedAt: null, roleId: input.roleId, status: "ACTIVE" },
  });
}

async function upsertBranch(
  transaction: Prisma.TransactionClient,
  input: { id: string; name: string; organizationId: string; slug: string; status: "ACTIVE" | "INACTIVE" },
) {
  const branch = await transaction.branch.upsert({
    where: { organizationId_slug: { organizationId: input.organizationId, slug: input.slug } },
    create: { ...input, city: "Baghdad QA", timezone: "Asia/Baghdad" },
    update: { deletedAt: null, name: input.name, status: input.status, timezone: "Asia/Baghdad" },
  });
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    await transaction.businessHour.upsert({
      where: { branchId_dayOfWeek: { branchId: branch.id, dayOfWeek } },
      create: { branchId: branch.id, closeTime: "20:00", dayOfWeek, isOpen: true, openTime: "09:00" },
      update: { closeTime: "20:00", isOpen: true, openTime: "09:00" },
    });
  }
  return branch;
}

export async function seedBusinessOperationsStage2aFixture(database: PrismaClient) {
  return database.$transaction(async (transaction) => {
    await assertTarget(transaction);
    const fixture = BUSINESS_OPERATIONS_STAGE2A_FIXTURE;
    const [organizationA, organizationB] = await Promise.all([
      upsertOrganization(transaction, { ...fixture.organizationA, name: "REZNO QA Business Operations Stage 2A", vertical: "RESTAURANT" }),
      upsertOrganization(transaction, { ...fixture.organizationB, name: "REZNO QA Business Operations Stage 2A Other Tenant", vertical: "BEAUTY" }),
    ]);
    await transaction.businessProfile.upsert({
      where: { organizationId: organizationA.id },
      create: { businessCategory: "QA Operations", description: "Staging-only Stage 2A operational fixture.", organizationId: organizationA.id },
      update: { businessCategory: "QA Operations", description: "Staging-only Stage 2A operational fixture." },
    });
    const [owner, manager, receptionist, staff, customer] = await Promise.all([
      upsertPerson(transaction, fixture.people.owner, "Stage2A Owner"),
      upsertPerson(transaction, fixture.people.manager, "Stage2A Manager"),
      upsertPerson(transaction, fixture.people.receptionist, "Stage2A Receptionist"),
      upsertPerson(transaction, fixture.people.staff, "Stage2A Staff"),
      upsertPerson(transaction, fixture.people.customer, "Stage2A Customer"),
    ]);
    const [ownerRoleA, managerRoleA, receptionistRoleA, staffRoleA, ownerRoleB] = await Promise.all([
      upsertRole(transaction, { id: fixture.roles.ownerA, organizationId: organizationA.id, systemRole: "OWNER" }),
      upsertRole(transaction, { id: fixture.roles.managerA, organizationId: organizationA.id, systemRole: "MANAGER" }),
      upsertRole(transaction, { id: fixture.roles.receptionistA, organizationId: organizationA.id, systemRole: "RECEPTIONIST" }),
      upsertRole(transaction, { id: fixture.roles.staffA, organizationId: organizationA.id, systemRole: "STAFF" }),
      upsertRole(transaction, { id: fixture.roles.ownerB, organizationId: organizationB.id, systemRole: "OWNER" }),
    ]);
    await Promise.all([
      upsertMember(transaction, { id: fixture.members.ownerA, organizationId: organizationA.id, personId: owner.id, roleId: ownerRoleA.id }),
      upsertMember(transaction, { id: fixture.members.managerA, organizationId: organizationA.id, personId: manager.id, roleId: managerRoleA.id }),
      upsertMember(transaction, { id: fixture.members.receptionistA, organizationId: organizationA.id, personId: receptionist.id, roleId: receptionistRoleA.id }),
      upsertMember(transaction, { id: fixture.members.staffA, organizationId: organizationA.id, personId: staff.id, roleId: staffRoleA.id }),
      upsertMember(transaction, { id: fixture.members.ownerB, organizationId: organizationB.id, personId: owner.id, roleId: ownerRoleB.id }),
    ]);
    const [active, , futureGeneric, futureRestaurant] = await Promise.all([
      upsertBranch(transaction, { ...fixture.branches.active, name: "Stage2A Active Branch", organizationId: organizationA.id, status: "ACTIVE" }),
      upsertBranch(transaction, { ...fixture.branches.inactive, name: "Stage2A Inactive Branch", organizationId: organizationA.id, status: "INACTIVE" }),
      upsertBranch(transaction, { ...fixture.branches.futureGeneric, name: "Stage2A Future Generic Branch", organizationId: organizationA.id, status: "ACTIVE" }),
      upsertBranch(transaction, { ...fixture.branches.futureRestaurant, name: "Stage2A Future Restaurant Branch", organizationId: organizationA.id, status: "ACTIVE" }),
      upsertBranch(transaction, { ...fixture.branches.organizationB, name: "Stage2A Other Tenant Branch", organizationId: organizationB.id, status: "ACTIVE" }),
    ]);
    const category = await transaction.category.upsert({
      where: { slug: fixture.category.slug },
      create: { id: fixture.category.id, name: "Stage2A QA Services", slug: fixture.category.slug },
      update: { name: "Stage2A QA Services" },
    });
    const service = await transaction.service.upsert({
      where: { id: fixture.service },
      create: { categoryId: category.id, id: fixture.service, name: "Stage2A QA Service", organizationId: organizationA.id, staffSelectionMode: "NONE", status: "ACTIVE" },
      update: { categoryId: category.id, name: "Stage2A QA Service", organizationId: organizationA.id, staffSelectionMode: "NONE", status: "ACTIVE" },
    });
    const activeOffering = await transaction.branchService.upsert({
      where: { branchId_serviceId: { branchId: active.id, serviceId: service.id } },
      create: { branchId: active.id, durationMinutes: 30, id: fixture.offerings.active, isAvailable: true, price: "25000", serviceId: service.id },
      update: { durationMinutes: 30, isAvailable: true, price: "25000" },
    });
    const futureOffering = await transaction.branchService.upsert({
      where: { branchId_serviceId: { branchId: futureGeneric.id, serviceId: service.id } },
      create: { branchId: futureGeneric.id, durationMinutes: 30, id: fixture.offerings.future, isAvailable: true, price: "25000", serviceId: service.id },
      update: { durationMinutes: 30, isAvailable: true, price: "25000" },
    });
    const table = await transaction.restaurantTable.upsert({
      where: { id: fixture.table },
      create: { branchId: futureRestaurant.id, businessId: organizationA.id, capacity: 4, id: fixture.table, isActive: true, name: "Stage2A QA Table" },
      update: { branchId: futureRestaurant.id, businessId: organizationA.id, capacity: 4, isActive: true, name: "Stage2A QA Table" },
    });
    const genericStartsAt = futureInstant(14, 9);
    await transaction.booking.upsert({
      where: { id: fixture.bookings.generic },
      create: { branchId: futureGeneric.id, branchServiceId: futureOffering.id, customerId: customer.id, customerNameSnapshot: customer.displayName ?? customer.firstName, endsAt: new Date(genericStartsAt.getTime() + 30 * 60_000), id: fixture.bookings.generic, organizationId: organizationA.id, priceSnapshot: "25000", serviceNameSnapshot: service.name, startsAt: genericStartsAt, status: "CONFIRMED" },
      update: { branchId: futureGeneric.id, branchServiceId: futureOffering.id, customerId: customer.id, endsAt: new Date(genericStartsAt.getTime() + 30 * 60_000), organizationId: organizationA.id, startsAt: genericStartsAt, status: "CONFIRMED" },
    });
    const restaurantStartsAt = futureInstant(14, 12);
    await transaction.booking.upsert({
      where: { id: fixture.bookings.restaurant },
      create: { branchId: futureRestaurant.id, customerId: customer.id, customerNameSnapshot: customer.displayName ?? customer.firstName, endsAt: new Date(restaurantStartsAt.getTime() + 90 * 60_000), id: fixture.bookings.restaurant, organizationId: organizationA.id, priceSnapshot: "0", serviceNameSnapshot: "Restaurant reservation", startsAt: restaurantStartsAt, status: "CONFIRMED" },
      update: { branchId: futureRestaurant.id, customerId: customer.id, endsAt: new Date(restaurantStartsAt.getTime() + 90 * 60_000), organizationId: organizationA.id, startsAt: restaurantStartsAt, status: "CONFIRMED" },
    });
    await transaction.restaurantReservationDetails.upsert({
      where: { bookingId: fixture.bookings.restaurant },
      create: { bookingId: fixture.bookings.restaurant, branchId: futureRestaurant.id, businessId: organizationA.id, durationMinutes: 90, guestCount: 2, id: fixture.restaurantDetails, reservationDateTime: restaurantStartsAt, tableId: table.id },
      update: { branchId: futureRestaurant.id, businessId: organizationA.id, durationMinutes: 90, guestCount: 2, reservationDateTime: restaurantStartsAt, tableId: table.id },
    });
    const blockStartsAt = futureInstant(7, 10);
    await transaction.blockedTime.upsert({
      where: { id: fixture.block },
      create: { branchId: active.id, endsAt: new Date(blockStartsAt.getTime() + 2 * 60 * 60_000), id: fixture.block, memberId: null, reason: "Stage2A internal fixture reason", startsAt: blockStartsAt },
      update: { branchId: active.id, endsAt: new Date(blockStartsAt.getTime() + 2 * 60 * 60_000), memberId: null, reason: "Stage2A internal fixture reason", startsAt: blockStartsAt },
    });
    return {
      activeBranchServiceId: activeOffering.id,
      branchCount: 5,
      namespace: fixture.namespace,
      organizationA: organizationA.slug,
      organizationB: organizationB.slug,
      roleCount: 5,
    };
  }, { maxWait: 10_000, timeout: 60_000 });
}
