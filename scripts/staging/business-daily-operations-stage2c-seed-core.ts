import type {
  BookingStatus,
  Prisma,
  PrismaClient,
  SystemRole,
} from "@prisma/client";

export const BUSINESS_DAILY_OPERATIONS_STAGE2C_FIXTURE = {
  namespace: "rezno-qa-business-daily-operations-stage2c",
  category: {
    id: "2c000000-0000-4000-8000-000000000001",
    slug: "rezno-qa-business-daily-operations-stage2c",
  },
  organizations: {
    a: {
      id: "2c000000-0000-4000-8000-000000000002",
      slug: "rezno-qa-business-daily-operations-stage2c-a",
    },
    b: {
      id: "2c000000-0000-4000-8000-000000000003",
      slug: "rezno-qa-business-daily-operations-stage2c-b",
    },
    generic: {
      id: "2c000000-0000-4000-8000-000000000004",
      slug: "rezno-qa-business-daily-operations-stage2c-generic",
    },
  },
  people: {
    owner: ["2c000000-0000-4000-8000-000000000010", "fixture:stage2c:owner"],
    manager: ["2c000000-0000-4000-8000-000000000011", "fixture:stage2c:manager"],
    receptionist: ["2c000000-0000-4000-8000-000000000012", "fixture:stage2c:receptionist"],
    staffA: ["2c000000-0000-4000-8000-000000000013", "fixture:stage2c:staff-a"],
    staffB: ["2c000000-0000-4000-8000-000000000014", "fixture:stage2c:staff-b"],
    customer: ["2c000000-0000-4000-8000-000000000015", "fixture:stage2c:customer"],
    foreignOwner: ["2c000000-0000-4000-8000-000000000016", "fixture:stage2c:foreign-owner"],
  },
  roles: {
    ownerA: "2c000000-0000-4000-8000-000000000020",
    managerA: "2c000000-0000-4000-8000-000000000021",
    receptionistA: "2c000000-0000-4000-8000-000000000022",
    staffA: "2c000000-0000-4000-8000-000000000023",
    ownerB: "2c000000-0000-4000-8000-000000000024",
    ownerGeneric: "2c000000-0000-4000-8000-000000000025",
    managerGeneric: "2c000000-0000-4000-8000-000000000026",
  },
  members: {
    ownerA: "2c000000-0000-4000-8000-000000000030",
    managerA: "2c000000-0000-4000-8000-000000000031",
    receptionistA: "2c000000-0000-4000-8000-000000000032",
    staffA: "2c000000-0000-4000-8000-000000000033",
    staffB: "2c000000-0000-4000-8000-000000000034",
    ownerB: "2c000000-0000-4000-8000-000000000035",
    ownerGeneric: "2c000000-0000-4000-8000-000000000036",
    managerGeneric: "2c000000-0000-4000-8000-000000000037",
  },
  branches: {
    service: ["2c000000-0000-4000-8000-000000000040", "service"],
    restaurant: ["2c000000-0000-4000-8000-000000000041", "restaurant"],
    foreign: ["2c000000-0000-4000-8000-000000000042", "foreign"],
    generic: ["2c000000-0000-4000-8000-000000000043", "generic"],
  },
  service: "2c000000-0000-4000-8000-000000000050",
  offering: "2c000000-0000-4000-8000-000000000051",
  genericChangeService: "2c000000-0000-4000-8000-000000000052",
  genericChangeOffering: "2c000000-0000-4000-8000-000000000053",
  branchAssignments: {
    receptionistService: "2c000000-0000-4000-8000-000000000060",
    receptionistRestaurant: "2c000000-0000-4000-8000-000000000061",
    staffA: "2c000000-0000-4000-8000-000000000062",
    staffB: "2c000000-0000-4000-8000-000000000063",
  },
  serviceAssignments: {
    staffA: "2c000000-0000-4000-8000-000000000070",
    staffB: "2c000000-0000-4000-8000-000000000071",
  },
  tables: {
    small: "2c000000-0000-4000-8000-000000000080",
    medium: "2c000000-0000-4000-8000-000000000081",
    large: "2c000000-0000-4000-8000-000000000082",
  },
  menu: {
    categories: {
      active: "2c000000-0000-4000-8000-000000000090",
      inactive: "2c000000-0000-4000-8000-000000000091",
    },
    items: {
      available: "2c000000-0000-4000-8000-000000000092",
      unavailable: "2c000000-0000-4000-8000-000000000093",
    },
  },
  bookings: {
    pending: "2c000000-0000-4000-8000-000000000100",
    confirmed: "2c000000-0000-4000-8000-000000000101",
    completed: "2c000000-0000-4000-8000-000000000102",
    cancelled: "2c000000-0000-4000-8000-000000000103",
    customerRequest: "2c000000-0000-4000-8000-000000000104",
    businessProposal: "2c000000-0000-4000-8000-000000000105",
    concurrency: "2c000000-0000-4000-8000-000000000106",
    stale: "2c000000-0000-4000-8000-000000000107",
    restaurantPending: "2c000000-0000-4000-8000-000000000108",
    restaurantConfirmed: "2c000000-0000-4000-8000-000000000109",
    restaurantPreorder: "2c000000-0000-4000-8000-00000000010a",
    restaurantRace: "2c000000-0000-4000-8000-00000000010b",
  },
  changeRequests: {
    customer: "2c000000-0000-4000-8000-000000000110",
    business: "2c000000-0000-4000-8000-000000000111",
  },
  restaurantDetails: {
    pending: "2c000000-0000-4000-8000-000000000120",
    confirmed: "2c000000-0000-4000-8000-000000000121",
    preorder: "2c000000-0000-4000-8000-000000000122",
    race: "2c000000-0000-4000-8000-000000000123",
  },
  preorderItem: "2c000000-0000-4000-8000-000000000130",
} as const;

export function businessDailyOperationsStage2cBookingLane(bookingId: string) {
  const fixture = BUSINESS_DAILY_OPERATIONS_STAGE2C_FIXTURE;
  return bookingId === fixture.bookings.customerRequest ||
      bookingId === fixture.bookings.businessProposal
    ? "generic-change" as const
    : "primary-daily" as const;
}

export class BusinessDailyOperationsStage2cSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessDailyOperationsStage2cSeedInvariantError";
  }
}

function instant(offsetDays: number, hour: number, minute = 0) {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + offsetDays,
      hour,
      minute,
    ),
  );
}

async function assertTarget(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (rows[0]?.database !== "rezno_staging") {
    throw new BusinessDailyOperationsStage2cSeedInvariantError(
      "The connected database is not the exact rezno_staging target.",
    );
  }
  for (const fixture of Object.values(
    BUSINESS_DAILY_OPERATIONS_STAGE2C_FIXTURE.organizations,
  )) {
    const existing = await transaction.organization.findUnique({
      where: { slug: fixture.slug },
      select: { id: true },
    });
    if (existing && existing.id !== fixture.id) {
      throw new BusinessDailyOperationsStage2cSeedInvariantError(
        "A Stage 2C fixture slug is owned by another record.",
      );
    }
  }
}

async function upsertOrganization(
  transaction: Prisma.TransactionClient,
  fixture: { id: string; slug: string },
  name: string,
  vertical: "RESTAURANT" | "BEAUTY",
) {
  const organization = await transaction.organization.upsert({
    where: { slug: fixture.slug },
    create: {
      ...fixture,
      isActive: true,
      name,
      status: "ACTIVE",
      vertical,
    },
    update: {
      deletedAt: null,
      isActive: true,
      name,
      status: "ACTIVE",
      vertical,
    },
  });
  await transaction.organizationSettings.upsert({
    where: { organizationId: organization.id },
    create: {
      bookingEnabled: true,
      cancellationWindowHours: 24,
      marketplaceVisible: true,
      organizationId: organization.id,
    },
    update: {
      bookingEnabled: true,
      cancellationWindowHours: 24,
      marketplaceVisible: true,
    },
  });
  return organization;
}

async function upsertPerson(
  transaction: Prisma.TransactionClient,
  tuple: readonly [string, string],
  name: string,
  phone: string,
) {
  return transaction.person.upsert({
    where: { authUserId: tuple[1] },
    create: {
      authUserId: tuple[1],
      displayName: name,
      firstName: name,
      id: tuple[0],
      isOnboarded: true,
      phone,
      status: "ACTIVE",
      timezone: "UTC",
    },
    update: {
      deletedAt: null,
      displayName: name,
      firstName: name,
      isOnboarded: true,
      phone,
      status: "ACTIVE",
      timezone: "UTC",
    },
  });
}

async function upsertRole(
  transaction: Prisma.TransactionClient,
  id: string,
  organizationId: string,
  systemRole: SystemRole,
) {
  return transaction.role.upsert({
    where: {
      organizationId_name: {
        name: `Stage2C ${systemRole}`,
        organizationId,
      },
    },
    create: {
      id,
      isSystem: true,
      name: `Stage2C ${systemRole}`,
      organizationId,
      systemRole,
    },
    update: { isSystem: true, systemRole },
  });
}

async function upsertMember(
  transaction: Prisma.TransactionClient,
  id: string,
  organizationId: string,
  personId: string,
  roleId: string,
) {
  return transaction.organizationMember.upsert({
    where: { personId_organizationId: { organizationId, personId } },
    create: { id, organizationId, personId, roleId, status: "ACTIVE" },
    update: { deletedAt: null, roleId, status: "ACTIVE" },
  });
}

async function upsertBranch(
  transaction: Prisma.TransactionClient,
  tuple: readonly [string, string],
  organizationId: string,
  name: string,
) {
  const branch = await transaction.branch.upsert({
    where: { organizationId_slug: { organizationId, slug: tuple[1] } },
    create: {
      city: "Baghdad QA",
      country: "Iraq",
      id: tuple[0],
      name,
      organizationId,
      slug: tuple[1],
      status: "ACTIVE",
      timezone: "UTC",
    },
    update: {
      deletedAt: null,
      name,
      status: "ACTIVE",
      timezone: "UTC",
    },
  });
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    await transaction.businessHour.upsert({
      where: { branchId_dayOfWeek: { branchId: branch.id, dayOfWeek } },
      create: {
        branchId: branch.id,
        closeTime: "23:59",
        dayOfWeek,
        isOpen: true,
        openTime: "00:00",
      },
      update: { closeTime: "23:59", isOpen: true, openTime: "00:00" },
    });
  }
  return branch;
}

async function assignBranch(
  transaction: Prisma.TransactionClient,
  id: string,
  branchId: string,
  memberId: string,
) {
  await transaction.branchAssignment.upsert({
    where: { memberId_branchId: { branchId, memberId } },
    create: { branchId, id, memberId },
    update: {},
  });
}

async function setFullAvailability(
  transaction: Prisma.TransactionClient,
  branchId: string,
  memberId: string,
) {
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    await transaction.availability.upsert({
      where: {
        memberId_branchId_dayOfWeek_startTime_endTime: {
          branchId,
          dayOfWeek,
          endTime: "23:59",
          memberId,
          startTime: "00:00",
        },
      },
      create: {
        branchId,
        dayOfWeek,
        endTime: "23:59",
        isActive: true,
        memberId,
        startTime: "00:00",
      },
      update: { isActive: true },
    });
  }
}

async function upsertBooking(
  transaction: Prisma.TransactionClient,
  input: {
    branchId: string;
    branchServiceId?: string;
    customerId: string;
    id: string;
    memberId?: string;
    organizationId: string;
    serviceName: string;
    startsAt: Date;
    status: BookingStatus;
  },
) {
  const cancelled = input.status === "CANCELLED";
  const endsAt = new Date(input.startsAt.getTime() + 30 * 60_000);
  return transaction.booking.upsert({
    where: { id: input.id },
    create: {
      branchId: input.branchId,
      branchServiceId: input.branchServiceId,
      cancellationReason: cancelled ? "Stage 2C customer-visible cancellation" : null,
      cancelledAt: cancelled ? input.startsAt : null,
      customerId: input.customerId,
      customerNameSnapshot: "Stage2C Customer",
      endsAt,
      id: input.id,
      memberId: input.memberId,
      notes: "Stage 2C customer service note",
      organizationId: input.organizationId,
      priceSnapshot: input.branchServiceId ? "25000" : "0",
      serviceNameSnapshot: input.serviceName,
      startsAt: input.startsAt,
      status: input.status,
    },
    update: {
      branchId: input.branchId,
      branchServiceId: input.branchServiceId ?? null,
      cancellationReason: cancelled ? "Stage 2C customer-visible cancellation" : null,
      cancelledAt: cancelled ? input.startsAt : null,
      customerId: input.customerId,
      endsAt,
      memberId: input.memberId ?? null,
      organizationId: input.organizationId,
      startsAt: input.startsAt,
      status: input.status,
    },
  });
}

export async function seedBusinessDailyOperationsStage2cFixture(
  database: PrismaClient,
) {
  return database.$transaction(async (transaction) => {
    await assertTarget(transaction);
    const fixture = BUSINESS_DAILY_OPERATIONS_STAGE2C_FIXTURE;
    const organizationA = await upsertOrganization(
      transaction,
      fixture.organizations.a,
      "REZNO QA Business Daily Operations Stage 2C",
      "RESTAURANT",
    );
    const organizationB = await upsertOrganization(
      transaction,
      fixture.organizations.b,
      "REZNO QA Business Daily Operations Stage 2C Foreign",
      "BEAUTY",
    );
    const organizationGeneric = await upsertOrganization(
      transaction,
      fixture.organizations.generic,
      "REZNO QA Business Daily Operations Stage 2C Generic",
      "BEAUTY",
    );
    const people = {
      owner: await upsertPerson(transaction, fixture.people.owner, "Stage2C Owner", "+9647502000010"),
      manager: await upsertPerson(transaction, fixture.people.manager, "Stage2C Manager", "+9647502000011"),
      receptionist: await upsertPerson(transaction, fixture.people.receptionist, "Stage2C Receptionist", "+9647502000012"),
      staffA: await upsertPerson(transaction, fixture.people.staffA, "Stage2C Staff A", "+9647502000013"),
      staffB: await upsertPerson(transaction, fixture.people.staffB, "Stage2C Staff B", "+9647502000014"),
      customer: await upsertPerson(transaction, fixture.people.customer, "Stage2C Customer", "+9647502000015"),
      foreignOwner: await upsertPerson(transaction, fixture.people.foreignOwner, "Stage2C Foreign Owner", "+9647502000016"),
    };
    const roles = {
      ownerA: await upsertRole(transaction, fixture.roles.ownerA, organizationA.id, "OWNER"),
      managerA: await upsertRole(transaction, fixture.roles.managerA, organizationA.id, "MANAGER"),
      receptionistA: await upsertRole(transaction, fixture.roles.receptionistA, organizationA.id, "RECEPTIONIST"),
      staffA: await upsertRole(transaction, fixture.roles.staffA, organizationA.id, "STAFF"),
      ownerB: await upsertRole(transaction, fixture.roles.ownerB, organizationB.id, "OWNER"),
      ownerGeneric: await upsertRole(transaction, fixture.roles.ownerGeneric, organizationGeneric.id, "OWNER"),
      managerGeneric: await upsertRole(transaction, fixture.roles.managerGeneric, organizationGeneric.id, "MANAGER"),
    };
    const members = {
      owner: await upsertMember(transaction, fixture.members.ownerA, organizationA.id, people.owner.id, roles.ownerA.id),
      manager: await upsertMember(transaction, fixture.members.managerA, organizationA.id, people.manager.id, roles.managerA.id),
      receptionist: await upsertMember(transaction, fixture.members.receptionistA, organizationA.id, people.receptionist.id, roles.receptionistA.id),
      staffA: await upsertMember(transaction, fixture.members.staffA, organizationA.id, people.staffA.id, roles.staffA.id),
      staffB: await upsertMember(transaction, fixture.members.staffB, organizationA.id, people.staffB.id, roles.staffA.id),
      ownerB: await upsertMember(transaction, fixture.members.ownerB, organizationB.id, people.foreignOwner.id, roles.ownerB.id),
      ownerGeneric: await upsertMember(transaction, fixture.members.ownerGeneric, organizationGeneric.id, people.owner.id, roles.ownerGeneric.id),
      managerGeneric: await upsertMember(transaction, fixture.members.managerGeneric, organizationGeneric.id, people.manager.id, roles.managerGeneric.id),
    };
    const branches = {
      service: await upsertBranch(transaction, fixture.branches.service, organizationA.id, "Stage2C Service Branch"),
      restaurant: await upsertBranch(transaction, fixture.branches.restaurant, organizationA.id, "Stage2C Restaurant Branch"),
      foreign: await upsertBranch(transaction, fixture.branches.foreign, organizationB.id, "Stage2C Foreign Branch"),
      generic: await upsertBranch(transaction, fixture.branches.generic, organizationGeneric.id, "Stage2C Generic Change Branch"),
    };
    await assignBranch(transaction, fixture.branchAssignments.receptionistService, branches.service.id, members.receptionist.id);
    await assignBranch(transaction, fixture.branchAssignments.receptionistRestaurant, branches.restaurant.id, members.receptionist.id);
    await assignBranch(transaction, fixture.branchAssignments.staffA, branches.service.id, members.staffA.id);
    await assignBranch(transaction, fixture.branchAssignments.staffB, branches.service.id, members.staffB.id);
    await setFullAvailability(transaction, branches.service.id, members.staffA.id);
    await setFullAvailability(transaction, branches.service.id, members.staffB.id);

    const category = await transaction.category.upsert({
      where: { slug: fixture.category.slug },
      create: { ...fixture.category, name: "Stage2C Daily Operations" },
      update: { name: "Stage2C Daily Operations" },
    });
    const service = await transaction.service.upsert({
      where: { id: fixture.service },
      create: {
        categoryId: category.id,
        id: fixture.service,
        name: "Stage2C Generic Service",
        organizationId: organizationA.id,
        staffSelectionMode: "OPTIONAL",
      },
      update: {
        categoryId: category.id,
        deletedAt: null,
        name: "Stage2C Generic Service",
        staffSelectionMode: "OPTIONAL",
        status: "ACTIVE",
      },
    });
    const offering = await transaction.branchService.upsert({
      where: { branchId_serviceId: { branchId: branches.service.id, serviceId: service.id } },
      create: {
        branchId: branches.service.id,
        durationMinutes: 30,
        id: fixture.offering,
        price: "25000",
        serviceId: service.id,
      },
      update: { durationMinutes: 30, isAvailable: true, price: "25000" },
    });
    const genericChangeService = await transaction.service.upsert({
      where: { id: fixture.genericChangeService },
      create: {
        categoryId: category.id,
        id: fixture.genericChangeService,
        name: "Stage2C Generic Change Service",
        organizationId: organizationGeneric.id,
        staffSelectionMode: "NONE",
      },
      update: {
        categoryId: category.id,
        deletedAt: null,
        name: "Stage2C Generic Change Service",
        staffSelectionMode: "NONE",
        status: "ACTIVE",
      },
    });
    const genericChangeOffering = await transaction.branchService.upsert({
      where: {
        branchId_serviceId: {
          branchId: branches.generic.id,
          serviceId: genericChangeService.id,
        },
      },
      create: {
        branchId: branches.generic.id,
        durationMinutes: 30,
        id: fixture.genericChangeOffering,
        price: "25000",
        serviceId: genericChangeService.id,
      },
      update: { durationMinutes: 30, isAvailable: true, price: "25000" },
    });
    await transaction.serviceStaffAssignment.upsert({
      where: { serviceId_memberId: { memberId: members.staffA.id, serviceId: service.id } },
      create: { id: fixture.serviceAssignments.staffA, memberId: members.staffA.id, serviceId: service.id },
      update: {},
    });
    await transaction.serviceStaffAssignment.upsert({
      where: { serviceId_memberId: { memberId: members.staffB.id, serviceId: service.id } },
      create: { id: fixture.serviceAssignments.staffB, memberId: members.staffB.id, serviceId: service.id },
      update: {},
    });

    const tables = {
      small: await transaction.restaurantTable.upsert({
        where: { id: fixture.tables.small },
        create: { area: "Window", branchId: branches.restaurant.id, businessId: organizationA.id, capacity: 2, code: "S2C-T2", id: fixture.tables.small, name: "Stage2C Table 2" },
        update: { area: "Window", branchId: branches.restaurant.id, capacity: 2, code: "S2C-T2", isActive: true, name: "Stage2C Table 2" },
      }),
      medium: await transaction.restaurantTable.upsert({
        where: { id: fixture.tables.medium },
        create: { area: "Main", branchId: branches.restaurant.id, businessId: organizationA.id, capacity: 4, code: "S2C-T4", id: fixture.tables.medium, name: "Stage2C Table 4" },
        update: { area: "Main", branchId: branches.restaurant.id, capacity: 4, code: "S2C-T4", isActive: true, name: "Stage2C Table 4" },
      }),
      large: await transaction.restaurantTable.upsert({
        where: { id: fixture.tables.large },
        create: { area: "Family", branchId: branches.restaurant.id, businessId: organizationA.id, capacity: 8, code: "S2C-T8", id: fixture.tables.large, name: "Stage2C Table 8" },
        update: { area: "Family", branchId: branches.restaurant.id, capacity: 8, code: "S2C-T8", isActive: true, name: "Stage2C Table 8" },
      }),
    };
    const menuCategories = {
      active: await transaction.menuCategory.upsert({
        where: { id: fixture.menu.categories.active },
        create: { businessId: organizationA.id, description: "Stage2C active category", id: fixture.menu.categories.active, name: "Stage2C Main", sortOrder: 1 },
        update: { description: "Stage2C active category", isActive: true, name: "Stage2C Main", sortOrder: 1 },
      }),
      inactive: await transaction.menuCategory.upsert({
        where: { id: fixture.menu.categories.inactive },
        create: { businessId: organizationA.id, description: "Stage2C inactive category", id: fixture.menu.categories.inactive, isActive: false, name: "Stage2C Archived", sortOrder: 2 },
        update: { description: "Stage2C inactive category", isActive: false, name: "Stage2C Archived", sortOrder: 2 },
      }),
    };
    const menuItems = {
      available: await transaction.menuItem.upsert({
        where: { id: fixture.menu.items.available },
        create: { businessId: organizationA.id, currency: "IQD", id: fixture.menu.items.available, isAvailable: true, menuCategoryId: menuCategories.active.id, name: "Stage2C Available Item", preparationMinutes: 15, price: "12000", sortOrder: 1 },
        update: { currency: "IQD", isAvailable: true, menuCategoryId: menuCategories.active.id, name: "Stage2C Available Item", preparationMinutes: 15, price: "12000", sortOrder: 1 },
      }),
      unavailable: await transaction.menuItem.upsert({
        where: { id: fixture.menu.items.unavailable },
        create: { businessId: organizationA.id, currency: "IQD", id: fixture.menu.items.unavailable, isAvailable: false, menuCategoryId: menuCategories.active.id, name: "Stage2C Unavailable Item", preparationMinutes: 20, price: "8000", sortOrder: 2 },
        update: { currency: "IQD", isAvailable: false, menuCategoryId: menuCategories.active.id, name: "Stage2C Unavailable Item", preparationMinutes: 20, price: "8000", sortOrder: 2 },
      }),
    };

    const genericSpecs = [
      [fixture.bookings.pending, "PENDING", 7, 9, members.staffA.id],
      [fixture.bookings.confirmed, "CONFIRMED", 7, 10, members.staffA.id],
      [fixture.bookings.completed, "COMPLETED", -2, 10, members.staffA.id],
      [fixture.bookings.cancelled, "CANCELLED", 8, 10, members.staffB.id],
      [fixture.bookings.customerRequest, "CONFIRMED", 9, 10, members.staffA.id],
      [fixture.bookings.businessProposal, "CONFIRMED", 10, 10, members.staffB.id],
      [fixture.bookings.concurrency, "CONFIRMED", 11, 10, members.staffA.id],
      [fixture.bookings.stale, "CONFIRMED", 12, 10, members.staffB.id],
    ] as const;
    const genericBookings = new Map<string, Awaited<ReturnType<typeof upsertBooking>>>();
    for (const [id, status, days, hour, memberId] of genericSpecs) {
      const usesGenericChangeOrganization =
        businessDailyOperationsStage2cBookingLane(id) === "generic-change";
      genericBookings.set(id, await upsertBooking(transaction, {
        branchId: usesGenericChangeOrganization
          ? branches.generic.id
          : branches.service.id,
        branchServiceId: usesGenericChangeOrganization
          ? genericChangeOffering.id
          : offering.id,
        customerId: people.customer.id,
        id,
        memberId: usesGenericChangeOrganization ? undefined : memberId,
        organizationId: usesGenericChangeOrganization
          ? organizationGeneric.id
          : organizationA.id,
        serviceName: usesGenericChangeOrganization
          ? genericChangeService.name
          : service.name,
        startsAt: instant(days, hour),
        status,
      }));
    }
    const customerRequestBooking = genericBookings.get(fixture.bookings.customerRequest)!;
    const businessProposalBooking = genericBookings.get(fixture.bookings.businessProposal)!;
    await transaction.bookingChangeRequest.upsert({
      where: { id: fixture.changeRequests.customer },
      create: {
        bookingId: customerRequestBooking.id,
        bookingUpdatedAtSnapshot: customerRequestBooking.updatedAt,
        id: fixture.changeRequests.customer,
        proposedEndsAt: instant(9, 12, 30),
        proposedMemberId: null,
        proposedStartsAt: instant(9, 12),
        requestedByPersonId: people.customer.id,
      },
      update: {
        bookingId: customerRequestBooking.id,
        bookingUpdatedAtSnapshot: customerRequestBooking.updatedAt,
        proposedEndsAt: instant(9, 12, 30),
        proposedMemberId: null,
        proposedStartsAt: instant(9, 12),
        requestedByPersonId: people.customer.id,
        respondedAt: null,
        status: "PENDING",
      },
    });
    await transaction.bookingChangeRequest.upsert({
      where: { id: fixture.changeRequests.business },
      create: {
        bookingId: businessProposalBooking.id,
        bookingUpdatedAtSnapshot: businessProposalBooking.updatedAt,
        id: fixture.changeRequests.business,
        proposedEndsAt: instant(10, 13, 30),
        proposedMemberId: null,
        proposedStartsAt: instant(10, 13),
        requestedByPersonId: people.owner.id,
      },
      update: {
        bookingId: businessProposalBooking.id,
        bookingUpdatedAtSnapshot: businessProposalBooking.updatedAt,
        proposedEndsAt: instant(10, 13, 30),
        proposedMemberId: null,
        proposedStartsAt: instant(10, 13),
        requestedByPersonId: people.owner.id,
        respondedAt: null,
        status: "PENDING",
      },
    });

    const restaurantSpecs = [
      [fixture.bookings.restaurantPending, fixture.restaurantDetails.pending, "PENDING", 7, 15, tables.small.id, 2],
      [fixture.bookings.restaurantConfirmed, fixture.restaurantDetails.confirmed, "CONFIRMED", 8, 15, tables.medium.id, 4],
      [fixture.bookings.restaurantPreorder, fixture.restaurantDetails.preorder, "CONFIRMED", 9, 15, tables.large.id, 6],
      [fixture.bookings.restaurantRace, fixture.restaurantDetails.race, "CONFIRMED", 10, 15, tables.medium.id, 3],
    ] as const;
    for (const [bookingId, detailsId, status, days, hour, tableId, guestCount] of restaurantSpecs) {
      const booking = await upsertBooking(transaction, {
        branchId: branches.restaurant.id,
        customerId: people.customer.id,
        id: bookingId,
        organizationId: organizationA.id,
        serviceName: "Stage2C Restaurant Reservation",
        startsAt: instant(days, hour),
        status,
      });
      await transaction.restaurantReservationDetails.upsert({
        where: { bookingId },
        create: {
          bookingId,
          branchId: branches.restaurant.id,
          businessId: organizationA.id,
          customerNote: "Stage 2C restaurant customer note",
          durationMinutes: 90,
          guestCount,
          id: detailsId,
          reservationDateTime: booking.startsAt,
          seatingArea: "Main",
          tableId,
        },
        update: {
          branchId: branches.restaurant.id,
          customerNote: "Stage 2C restaurant customer note",
          durationMinutes: 90,
          guestCount,
          reservationDateTime: booking.startsAt,
          seatingArea: "Main",
          tableId,
        },
      });
    }
    await transaction.restaurantReservationItem.upsert({
      where: {
        restaurantReservationDetailsId_menuItemId: {
          menuItemId: menuItems.available.id,
          restaurantReservationDetailsId: fixture.restaurantDetails.preorder,
        },
      },
      create: {
        currencySnapshot: "IQD",
        id: fixture.preorderItem,
        itemNameSnapshot: "Stage2C Historical Item Snapshot",
        menuItemId: menuItems.available.id,
        quantity: 2,
        restaurantReservationDetailsId: fixture.restaurantDetails.preorder,
        unitPrice: "11000",
      },
      update: {
        currencySnapshot: "IQD",
        itemNameSnapshot: "Stage2C Historical Item Snapshot",
        quantity: 2,
        unitPrice: "11000",
      },
    });

    return {
      bookings: genericSpecs.length,
      changeRequests: 2,
      menuCategories: Object.keys(menuCategories).length,
      menuItems: Object.keys(menuItems).length,
      namespace: fixture.namespace,
      organizations: 3,
      restaurantReservations: restaurantSpecs.length,
      roles: Object.keys(roles).length,
      tables: Object.keys(tables).length,
    };
  }, { maxWait: 10_000, timeout: 60_000 });
}
