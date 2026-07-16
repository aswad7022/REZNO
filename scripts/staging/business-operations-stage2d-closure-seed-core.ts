import type {
  BookingStatus,
  BusinessVertical,
  Prisma,
  PrismaClient,
  SystemRole,
} from "@prisma/client";

export const BUSINESS_OPERATIONS_STAGE2D_FIXTURE = {
  namespace: "rezno-qa-business-operations-stage2d-closure",
  category: {
    id: "2d000000-0000-4000-8000-000000000001",
    slug: "rezno-qa-business-operations-stage2d-closure",
  },
  organizations: {
    management: ["2d000000-0000-4000-8000-000000000002", "rezno-qa-business-operations-stage2d-management"],
    restaurant: ["2d000000-0000-4000-8000-000000000003", "rezno-qa-business-operations-stage2d-restaurant"],
    foreign: ["2d000000-0000-4000-8000-000000000004", "rezno-qa-business-operations-stage2d-foreign"],
    incomplete: ["2d000000-0000-4000-8000-000000000005", "rezno-qa-business-operations-stage2d-incomplete"],
  },
  people: {
    owner: ["2d000000-0000-4000-8000-000000000010", "fixture:stage2d:owner"],
    manager: ["2d000000-0000-4000-8000-000000000011", "fixture:stage2d:manager"],
    receptionist: ["2d000000-0000-4000-8000-000000000012", "fixture:stage2d:receptionist"],
    staffA: ["2d000000-0000-4000-8000-000000000013", "fixture:stage2d:staff-a"],
    staffB: ["2d000000-0000-4000-8000-000000000014", "fixture:stage2d:staff-b"],
    customer: ["2d000000-0000-4000-8000-000000000015", "fixture:stage2d:customer"],
    foreignOwner: ["2d000000-0000-4000-8000-000000000016", "fixture:stage2d:foreign-owner"],
    restaurantOwner: ["2d000000-0000-4000-8000-000000000017", "fixture:stage2d:restaurant-owner"],
    incompleteOwner: ["2d000000-0000-4000-8000-000000000018", "fixture:stage2d:incomplete-owner"],
  },
  roles: {
    owner: "2d000000-0000-4000-8000-000000000020",
    manager: "2d000000-0000-4000-8000-000000000021",
    receptionist: "2d000000-0000-4000-8000-000000000022",
    staff: "2d000000-0000-4000-8000-000000000023",
    foreignOwner: "2d000000-0000-4000-8000-000000000024",
    restaurantOwner: "2d000000-0000-4000-8000-000000000025",
    incompleteOwner: "2d000000-0000-4000-8000-000000000026",
  },
  members: {
    owner: "2d000000-0000-4000-8000-000000000030",
    manager: "2d000000-0000-4000-8000-000000000031",
    receptionist: "2d000000-0000-4000-8000-000000000032",
    staffA: "2d000000-0000-4000-8000-000000000033",
    staffB: "2d000000-0000-4000-8000-000000000034",
    foreignOwner: "2d000000-0000-4000-8000-000000000035",
    restaurantOwner: "2d000000-0000-4000-8000-000000000036",
    incompleteOwner: "2d000000-0000-4000-8000-000000000037",
  },
  branches: {
    baghdad: ["2d000000-0000-4000-8000-000000000040", "baghdad"],
    istanbul: ["2d000000-0000-4000-8000-000000000041", "istanbul"],
    inactive: ["2d000000-0000-4000-8000-000000000042", "inactive-history"],
    restaurant: ["2d000000-0000-4000-8000-000000000043", "restaurant"],
    foreign: ["2d000000-0000-4000-8000-000000000044", "foreign"],
    incomplete: ["2d000000-0000-4000-8000-000000000045", "incomplete"],
  },
  services: {
    required: "2d000000-0000-4000-8000-000000000050",
    inactive: "2d000000-0000-4000-8000-000000000051",
    incomplete: "2d000000-0000-4000-8000-000000000052",
  },
  offerings: {
    baghdad: "2d000000-0000-4000-8000-000000000053",
    istanbul: "2d000000-0000-4000-8000-000000000054",
    inactive: "2d000000-0000-4000-8000-000000000055",
    incomplete: "2d000000-0000-4000-8000-000000000056",
  },
  table: "2d000000-0000-4000-8000-000000000060",
  inactiveTable: "2d000000-0000-4000-8000-000000000061",
  menuCategory: "2d000000-0000-4000-8000-000000000062",
  menuItem: "2d000000-0000-4000-8000-000000000063",
  unavailableMenuItem: "2d000000-0000-4000-8000-000000000064",
  bookings: {
    todayConfirmed: "2d000000-0000-4000-8000-000000000070",
    todayPending: "2d000000-0000-4000-8000-000000000071",
    todayNoShow: "2d000000-0000-4000-8000-000000000072",
    upcomingStaffA: "2d000000-0000-4000-8000-000000000073",
    upcomingStaffB: "2d000000-0000-4000-8000-000000000074",
    completedReview: "2d000000-0000-4000-8000-000000000075",
    completedReplied: "2d000000-0000-4000-8000-000000000076",
    cancelled: "2d000000-0000-4000-8000-000000000077",
    historicalInactive: "2d000000-0000-4000-8000-000000000078",
    restaurant: "2d000000-0000-4000-8000-000000000079",
    foreign: "2d000000-0000-4000-8000-00000000007a",
  },
  reviews: {
    awaiting: "2d000000-0000-4000-8000-000000000080",
    replied: "2d000000-0000-4000-8000-000000000081",
  },
  changeRequest: "2d000000-0000-4000-8000-000000000082",
} as const;

export class BusinessOperationsStage2dSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessOperationsStage2dSeedInvariantError";
  }
}

function instant(offsetDays: number, hour: number) {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays, hour),
  );
}

async function assertTarget(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (rows[0]?.database !== "rezno_staging") {
    throw new BusinessOperationsStage2dSeedInvariantError(
      "The connected database is not the exact rezno_staging target.",
    );
  }
  for (const [id, slug] of Object.values(BUSINESS_OPERATIONS_STAGE2D_FIXTURE.organizations)) {
    const existing = await transaction.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing && existing.id !== id) {
      throw new BusinessOperationsStage2dSeedInvariantError(
        "A Stage 2D fixture slug is owned by another record.",
      );
    }
  }
}

async function organization(
  transaction: Prisma.TransactionClient,
  tuple: readonly [string, string],
  name: string,
  vertical: BusinessVertical,
  ready = true,
) {
  const value = await transaction.organization.upsert({
    where: { slug: tuple[1] },
    create: {
      id: tuple[0],
      isActive: true,
      name,
      slug: tuple[1],
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
    where: { organizationId: value.id },
    create: {
      bookingEnabled: ready,
      marketplaceVisible: ready,
      organizationId: value.id,
    },
    update: { bookingEnabled: ready, marketplaceVisible: ready },
  });
  if (ready) {
    await transaction.businessProfile.upsert({
      where: { organizationId: value.id },
      create: {
        businessCategory: vertical === "RESTAURANT" ? "Restaurant" : "Beauty",
        businessPhone: "+9647500000400",
        coverImageUrl: "https://example.test/stage2d-cover.jpg",
        description: "Stage 2D closure fixture",
        logoUrl: "https://example.test/stage2d-logo.jpg",
        organizationId: value.id,
      },
      update: {
        businessCategory: vertical === "RESTAURANT" ? "Restaurant" : "Beauty",
        businessPhone: "+9647500000400",
        coverImageUrl: "https://example.test/stage2d-cover.jpg",
        description: "Stage 2D closure fixture",
        logoUrl: "https://example.test/stage2d-logo.jpg",
      },
    });
  }
  return value;
}

async function person(
  transaction: Prisma.TransactionClient,
  tuple: readonly [string, string],
  name: string,
  phone: string,
) {
  const existing = await transaction.person.findUnique({
    where: { authUserId: tuple[1] },
    select: { id: true },
  });
  if (existing && existing.id !== tuple[0]) {
    throw new BusinessOperationsStage2dSeedInvariantError(
      "A Stage 2D fixture identity marker is owned by another Person.",
    );
  }
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
      timezone: "Asia/Baghdad",
    },
    update: {
      deletedAt: null,
      displayName: name,
      firstName: name,
      isOnboarded: true,
      phone,
      status: "ACTIVE",
      timezone: "Asia/Baghdad",
    },
  });
}

async function role(
  transaction: Prisma.TransactionClient,
  id: string,
  organizationId: string,
  systemRole: SystemRole,
) {
  return transaction.role.upsert({
    where: {
      organizationId_name: {
        name: `Stage2D ${systemRole}`,
        organizationId,
      },
    },
    create: {
      id,
      isSystem: true,
      name: `Stage2D ${systemRole}`,
      organizationId,
      systemRole,
    },
    update: { isSystem: true, systemRole },
  });
}

async function member(
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

async function branch(
  transaction: Prisma.TransactionClient,
  tuple: readonly [string, string],
  organizationId: string,
  name: string,
  timezone: string,
  active = true,
) {
  const value = await transaction.branch.upsert({
    where: { organizationId_slug: { organizationId, slug: tuple[1] } },
    create: {
      id: tuple[0],
      name,
      organizationId,
      slug: tuple[1],
      status: active ? "ACTIVE" : "INACTIVE",
      timezone,
    },
    update: {
      deletedAt: null,
      name,
      status: active ? "ACTIVE" : "INACTIVE",
      timezone,
    },
  });
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    await transaction.businessHour.upsert({
      where: { branchId_dayOfWeek: { branchId: value.id, dayOfWeek } },
      create: {
        branchId: value.id,
        closeTime: "20:00",
        dayOfWeek,
        openTime: "09:00",
      },
      update: { closeTime: "20:00", isOpen: true, openTime: "09:00" },
    });
  }
  return value;
}

async function booking(
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
  const endsAt = new Date(input.startsAt.getTime() + 30 * 60_000);
  return transaction.booking.upsert({
    where: { id: input.id },
    create: {
      branchId: input.branchId,
      branchServiceId: input.branchServiceId,
      cancellationReason:
        input.status === "CANCELLED" ? "STAGE2D-CANCELLATION-SENTINEL" : null,
      customerId: input.customerId,
      customerNameSnapshot: "STAGE2D-CUSTOMER-PII-SENTINEL",
      endsAt,
      id: input.id,
      memberId: input.memberId,
      notes: "STAGE2D-CUSTOMER-NOTES-SENTINEL",
      organizationId: input.organizationId,
      priceSnapshot: "25000",
      serviceNameSnapshot: input.serviceName,
      startsAt: input.startsAt,
      status: input.status,
    },
    update: {
      branchId: input.branchId,
      branchServiceId: input.branchServiceId ?? null,
      cancellationReason:
        input.status === "CANCELLED" ? "STAGE2D-CANCELLATION-SENTINEL" : null,
      customerId: input.customerId,
      endsAt,
      memberId: input.memberId ?? null,
      organizationId: input.organizationId,
      serviceNameSnapshot: input.serviceName,
      startsAt: input.startsAt,
      status: input.status,
    },
  });
}

export async function seedBusinessOperationsStage2dClosureFixture(
  database: PrismaClient,
) {
  return database.$transaction(
    async (transaction) => {
      await assertTarget(transaction);
      const f = BUSINESS_OPERATIONS_STAGE2D_FIXTURE;
      const [management, restaurant, foreign, incomplete] = await Promise.all([
        organization(transaction, f.organizations.management, "REZNO QA Stage 2D Management", "BEAUTY"),
        organization(transaction, f.organizations.restaurant, "REZNO QA Stage 2D Restaurant", "RESTAURANT"),
        organization(transaction, f.organizations.foreign, "REZNO QA Stage 2D Foreign", "BEAUTY"),
        organization(transaction, f.organizations.incomplete, "REZNO QA Stage 2D Incomplete", "BEAUTY", false),
      ]);
      const people = await Promise.all([
        person(transaction, f.people.owner, "Stage2D Owner", "+9647502000001"),
        person(transaction, f.people.manager, "Stage2D Manager", "+9647502000002"),
        person(transaction, f.people.receptionist, "Stage2D Receptionist", "+9647502000003"),
        person(transaction, f.people.staffA, "Stage2D Staff A", "+9647502000004"),
        person(transaction, f.people.staffB, "Stage2D Staff B", "+9647502000005"),
        person(transaction, f.people.customer, "STAGE2D CUSTOMER PII", "+9647502999999"),
        person(transaction, f.people.foreignOwner, "Stage2D Foreign Owner", "+9647502000006"),
        person(transaction, f.people.restaurantOwner, "Stage2D Restaurant Owner", "+9647502000007"),
        person(transaction, f.people.incompleteOwner, "Stage2D Incomplete Owner", "+9647502000008"),
      ]);
      const [ownerRole, managerRole, receptionistRole, staffRole, foreignOwnerRole, restaurantOwnerRole, incompleteOwnerRole] =
        await Promise.all([
          role(transaction, f.roles.owner, management.id, "OWNER"),
          role(transaction, f.roles.manager, management.id, "MANAGER"),
          role(transaction, f.roles.receptionist, management.id, "RECEPTIONIST"),
          role(transaction, f.roles.staff, management.id, "STAFF"),
          role(transaction, f.roles.foreignOwner, foreign.id, "OWNER"),
          role(transaction, f.roles.restaurantOwner, restaurant.id, "OWNER"),
          role(transaction, f.roles.incompleteOwner, incomplete.id, "OWNER"),
        ]);
      const [
        owner,
        manager,
        receptionist,
        staffA,
        staffB,
        foreignOwner,
        restaurantOwner,
        incompleteOwner,
      ] = await Promise.all([
        member(transaction, f.members.owner, management.id, people[0].id, ownerRole.id),
        member(transaction, f.members.manager, management.id, people[1].id, managerRole.id),
        member(transaction, f.members.receptionist, management.id, people[2].id, receptionistRole.id),
        member(transaction, f.members.staffA, management.id, people[3].id, staffRole.id),
        member(transaction, f.members.staffB, management.id, people[4].id, staffRole.id),
        member(transaction, f.members.foreignOwner, foreign.id, people[6].id, foreignOwnerRole.id),
        member(transaction, f.members.restaurantOwner, restaurant.id, people[7].id, restaurantOwnerRole.id),
        member(transaction, f.members.incompleteOwner, incomplete.id, people[8].id, incompleteOwnerRole.id),
      ]);
      void manager;
      void foreignOwner;
      void restaurantOwner;
      void incompleteOwner;
      const [baghdad, istanbul, inactive, restaurantBranch, foreignBranch, incompleteBranch] =
        await Promise.all([
          branch(transaction, f.branches.baghdad, management.id, "Stage2D Baghdad", "Asia/Baghdad"),
          branch(transaction, f.branches.istanbul, management.id, "Stage2D Istanbul", "Europe/Istanbul"),
          branch(transaction, f.branches.inactive, management.id, "Stage2D Historical", "Asia/Baghdad", false),
          branch(transaction, f.branches.restaurant, restaurant.id, "Stage2D Restaurant", "Asia/Baghdad"),
          branch(transaction, f.branches.foreign, foreign.id, "Stage2D Foreign", "Asia/Baghdad"),
          branch(transaction, f.branches.incomplete, incomplete.id, "Stage2D Incomplete", "Asia/Baghdad"),
        ]);
      await transaction.category.upsert({
        where: { slug: f.category.slug },
        create: { id: f.category.id, name: "Stage 2D Closure", slug: f.category.slug },
        update: { name: "Stage 2D Closure" },
      });
      const requiredService = await transaction.service.upsert({
        where: { id: f.services.required },
        create: { categoryId: f.category.id, id: f.services.required, name: "Stage2D REQUIRED Service", organizationId: management.id, staffSelectionMode: "REQUIRED" },
        update: { categoryId: f.category.id, deletedAt: null, name: "Stage2D REQUIRED Service", staffSelectionMode: "REQUIRED", status: "ACTIVE" },
      });
      const inactiveService = await transaction.service.upsert({
        where: { id: f.services.inactive },
        create: { categoryId: f.category.id, id: f.services.inactive, name: "Stage2D Historical Service", organizationId: management.id, status: "INACTIVE" },
        update: { deletedAt: null, name: "Stage2D Historical Service", status: "INACTIVE" },
      });
      const incompleteService = await transaction.service.upsert({
        where: { id: f.services.incomplete },
        create: { categoryId: f.category.id, id: f.services.incomplete, name: "Stage2D Ineligible REQUIRED", organizationId: incomplete.id, staffSelectionMode: "REQUIRED" },
        update: { deletedAt: null, staffSelectionMode: "REQUIRED", status: "ACTIVE" },
      });
      const offering = async (id: string, branchId: string, serviceId: string, available: boolean) =>
        transaction.branchService.upsert({
          where: { branchId_serviceId: { branchId, serviceId } },
          create: { branchId, durationMinutes: 30, id, isAvailable: available, price: "25000", serviceId },
          update: { durationMinutes: 30, isAvailable: available, price: "25000" },
        });
      const [baghdadOffering, istanbulOffering] = await Promise.all([
        offering(f.offerings.baghdad, baghdad.id, requiredService.id, true),
        offering(f.offerings.istanbul, istanbul.id, requiredService.id, true),
        offering(f.offerings.inactive, inactive.id, inactiveService.id, false),
        offering(f.offerings.incomplete, incompleteBranch.id, incompleteService.id, true),
      ]);
      for (const [branchId, memberId] of [
        [baghdad.id, receptionist.id], [istanbul.id, receptionist.id],
        [baghdad.id, staffA.id], [istanbul.id, staffA.id], [baghdad.id, staffB.id],
      ] as const) {
        await transaction.branchAssignment.upsert({
          where: { memberId_branchId: { branchId, memberId } },
          create: { branchId, memberId },
          update: {},
        });
      }
      for (const memberId of [staffA.id, staffB.id]) {
        await transaction.serviceStaffAssignment.upsert({
          where: { serviceId_memberId: { memberId, serviceId: requiredService.id } },
          create: { memberId, serviceId: requiredService.id },
          update: {},
        });
      }
      for (const branchId of [baghdad.id, istanbul.id]) {
        await transaction.availability.upsert({
          where: { memberId_branchId_dayOfWeek_startTime_endTime: { branchId, dayOfWeek: 4, endTime: "17:00", memberId: staffA.id, startTime: "09:00" } },
          create: { branchId, dayOfWeek: 4, endTime: "17:00", memberId: staffA.id, startTime: "09:00" },
          update: { isActive: true },
        });
      }
      const table = await transaction.restaurantTable.upsert({
        where: { id: f.table },
        create: { branchId: restaurantBranch.id, businessId: restaurant.id, capacity: 6, id: f.table, name: "Stage2D Active Table" },
        update: { branchId: restaurantBranch.id, capacity: 6, isActive: true, name: "Stage2D Active Table" },
      });
      await transaction.restaurantTable.upsert({
        where: { id: f.inactiveTable },
        create: { branchId: restaurantBranch.id, businessId: restaurant.id, capacity: 2, id: f.inactiveTable, isActive: false, name: "Stage2D Inactive Table" },
        update: { isActive: false },
      });
      const menuCategory = await transaction.menuCategory.upsert({
        where: { id: f.menuCategory },
        create: { businessId: restaurant.id, id: f.menuCategory, name: "Stage2D Menu" },
        update: { isActive: true, name: "Stage2D Menu" },
      });
      await Promise.all([
        transaction.menuItem.upsert({ where: { id: f.menuItem }, create: { businessId: restaurant.id, id: f.menuItem, menuCategoryId: menuCategory.id, name: "Stage2D Available Item", price: "12000" }, update: { isAvailable: true, name: "Stage2D Available Item" } }),
        transaction.menuItem.upsert({ where: { id: f.unavailableMenuItem }, create: { businessId: restaurant.id, id: f.unavailableMenuItem, isAvailable: false, menuCategoryId: menuCategory.id, name: "Stage2D Unavailable Item", price: "9000" }, update: { isAvailable: false } }),
      ]);
      const bookingInputs = [
        [f.bookings.todayConfirmed, baghdad.id, baghdadOffering.id, staffA.id, 0, 9, "CONFIRMED", "Stage2D REQUIRED Service"],
        [f.bookings.todayPending, istanbul.id, istanbulOffering.id, staffB.id, 0, 10, "PENDING", "Stage2D REQUIRED Service"],
        [f.bookings.todayNoShow, baghdad.id, baghdadOffering.id, staffB.id, 0, 11, "NO_SHOW", "Stage2D REQUIRED Service"],
        [f.bookings.upcomingStaffA, baghdad.id, baghdadOffering.id, staffA.id, 1, 9, "CONFIRMED", "Stage2D REQUIRED Service"],
        [f.bookings.upcomingStaffB, istanbul.id, istanbulOffering.id, staffB.id, 2, 9, "PENDING", "Stage2D REQUIRED Service"],
        [f.bookings.completedReview, baghdad.id, baghdadOffering.id, staffA.id, -1, 9, "COMPLETED", "Stage2D Review Service"],
        [f.bookings.completedReplied, istanbul.id, istanbulOffering.id, staffA.id, -2, 9, "COMPLETED", "Stage2D Review Service"],
        [f.bookings.cancelled, baghdad.id, baghdadOffering.id, staffB.id, -3, 9, "CANCELLED", "Stage2D REQUIRED Service"],
        [f.bookings.historicalInactive, inactive.id, f.offerings.inactive, undefined, -4, 9, "COMPLETED", "Stage2D Historical Snapshot"],
      ] as const;
      for (const [id, branchId, branchServiceId, memberId, day, hour, status, serviceName] of bookingInputs) {
        await booking(transaction, { branchId, branchServiceId, customerId: people[5].id, id, memberId, organizationId: management.id, serviceName, startsAt: instant(day, hour), status });
      }
      const restaurantBooking = await booking(transaction, { branchId: restaurantBranch.id, customerId: people[5].id, id: f.bookings.restaurant, organizationId: restaurant.id, serviceName: "Stage2D Restaurant Reservation", startsAt: instant(-1, 12), status: "COMPLETED" });
      await transaction.restaurantReservationDetails.upsert({
        where: { bookingId: restaurantBooking.id },
        create: { bookingId: restaurantBooking.id, branchId: restaurantBranch.id, businessId: restaurant.id, guestCount: 4, reservationDateTime: restaurantBooking.startsAt, tableId: table.id },
        update: { branchId: restaurantBranch.id, guestCount: 4, reservationDateTime: restaurantBooking.startsAt, tableId: table.id },
      });
      await booking(transaction, { branchId: foreignBranch.id, customerId: people[5].id, id: f.bookings.foreign, organizationId: foreign.id, serviceName: "STAGE2D-FOREIGN-ANALYTICS-SENTINEL", startsAt: instant(-1, 9), status: "COMPLETED" });
      await Promise.all([
        transaction.review.upsert({ where: { bookingId: f.bookings.completedReview }, create: { bookingId: f.bookings.completedReview, comment: "STAGE2D-UNREPLIED-REVIEW", customerId: people[5].id, id: f.reviews.awaiting, memberId: staffA.id, organizationId: management.id, rating: 5, serviceId: requiredService.id }, update: { businessReply: null, businessReplyAuthorId: null, businessRepliedAt: null, status: "VISIBLE" } }),
        transaction.review.upsert({ where: { bookingId: f.bookings.completedReplied }, create: { bookingId: f.bookings.completedReplied, businessReply: "Stage2D reply", businessReplyAuthorId: owner.id, businessRepliedAt: instant(-1, 12), comment: "STAGE2D-REPLIED-REVIEW", customerId: people[5].id, id: f.reviews.replied, memberId: staffA.id, organizationId: management.id, rating: 4, serviceId: requiredService.id }, update: { businessReply: "Stage2D reply", businessReplyAuthorId: owner.id, businessRepliedAt: instant(-1, 12), status: "VISIBLE" } }),
      ]);
      await transaction.bookingChangeRequest.upsert({
        where: { id: f.changeRequest },
        create: { bookingId: f.bookings.upcomingStaffA, id: f.changeRequest, proposedEndsAt: instant(1, 15), proposedStartsAt: instant(1, 14), requestedByPersonId: people[5].id },
        update: { bookingId: f.bookings.upcomingStaffA, proposedEndsAt: instant(1, 15), proposedStartsAt: instant(1, 14), requestedByPersonId: people[5].id, status: "PENDING" },
      });
      await Promise.all([
        transaction.notification.upsert({ where: { eventKey: "stage2d:management:operations" }, create: { audience: "BUSINESS", body: "STAGE2D-MANAGEMENT-NOTIFICATION", businessId: management.id, createdAt: instant(0, 8), eventKey: "stage2d:management:operations", title: "Stage2D management update" }, update: { audience: "BUSINESS", body: "STAGE2D-MANAGEMENT-NOTIFICATION", businessId: management.id, createdAt: instant(0, 8), title: "Stage2D management update" } }),
        transaction.notification.upsert({ where: { eventKey: "stage2d:foreign:operations" }, create: { audience: "BUSINESS", body: "STAGE2D-FOREIGN-NOTIFICATION-SENTINEL", businessId: foreign.id, createdAt: instant(0, 8), eventKey: "stage2d:foreign:operations", title: "Stage2D foreign update" }, update: { audience: "BUSINESS", body: "STAGE2D-FOREIGN-NOTIFICATION-SENTINEL", businessId: foreign.id, createdAt: instant(0, 8), title: "Stage2D foreign update" } }),
      ]);
      const organizationIds = Object.values(f.organizations).map(([id]) => id);
      const [organizations, bookings, reviews, notifications] = await Promise.all([
        transaction.organization.count({ where: { id: { in: organizationIds } } }),
        transaction.booking.count({ where: { organizationId: { in: organizationIds } } }),
        transaction.review.count({ where: { organizationId: { in: organizationIds } } }),
        transaction.notification.count({ where: { businessId: { in: organizationIds } } }),
      ]);
      return {
        bookings,
        fingerprint: `${f.namespace}:${organizations}:${bookings}:${reviews}:${notifications}`,
        notifications,
        organizations,
        reviews,
      };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
