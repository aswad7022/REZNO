import type { Prisma, PrismaClient } from "@prisma/client";
import { TZDate } from "@date-fns/tz";

export const RESTAURANT_QA_FIXTURE = {
  namespace: "rezno-qa-restaurant-gate2d",
  organization: { id: "8d000000-0000-4000-8000-000000000001", slug: "rezno-qa-restaurant-gate2d" },
  branch: { id: "8d000000-0000-4000-8000-000000000002", slug: "qa-main" },
  tables: [
    { id: "8d000000-0000-4000-8000-000000000003", name: "QA Indoor 2", capacity: 2, area: "Indoor" },
    { id: "8d000000-0000-4000-8000-000000000004", name: "QA Terrace 2", capacity: 2, area: "Terrace" },
    { id: "8d000000-0000-4000-8000-000000000005", name: "QA Indoor 4", capacity: 4, area: "Indoor" },
    { id: "8d000000-0000-4000-8000-000000000006", name: "QA Terrace 6", capacity: 6, area: "Terrace" },
  ],
  menuCategory: { id: "8d000000-0000-4000-8000-000000000007" },
  menuItems: {
    rice: { id: "8d000000-0000-4000-8000-000000000008" },
    tea: { id: "8d000000-0000-4000-8000-000000000009" },
    unavailable: { id: "8d000000-0000-4000-8000-000000000010" },
  },
  ownerPerson: {
    id: "8d000000-0000-4000-8000-000000000011",
    authUserId: "fixture:rezno-qa-restaurant-gate2d:owner",
  },
  ownerRole: { id: "8d000000-0000-4000-8000-000000000012" },
  ownerMember: { id: "8d000000-0000-4000-8000-000000000013" },
  customer: {
    id: "8d000000-0000-4000-8000-000000000014",
    authUserId: "fixture:rezno-qa-restaurant-gate2d:customer",
  },
  managementBookings: {
    cancellable: {
      bookingId: "8d000000-0000-4000-8000-000000000015",
      detailsId: "8d000000-0000-4000-8000-000000000019",
      historyId: "8d000000-0000-4000-8000-000000000023",
    },
    reschedulable: {
      bookingId: "8d000000-0000-4000-8000-000000000016",
      detailsId: "8d000000-0000-4000-8000-000000000020",
      historyId: "8d000000-0000-4000-8000-000000000024",
    },
    completed: {
      bookingId: "8d000000-0000-4000-8000-000000000017",
      detailsId: "8d000000-0000-4000-8000-000000000021",
      historyId: "8d000000-0000-4000-8000-000000000025",
    },
    cancelled: {
      bookingId: "8d000000-0000-4000-8000-000000000018",
      detailsId: "8d000000-0000-4000-8000-000000000022",
      historyId: "8d000000-0000-4000-8000-000000000026",
    },
  },
} as const;

export class RestaurantQaSeedInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestaurantQaSeedInvariantError";
  }
}

export async function seedRestaurantQaFixture(database: PrismaClient) {
  const operation = async (transaction: Prisma.TransactionClient) => {
    await assertFixtureIdentity(transaction);
    const organization = await transaction.organization.upsert({
      where: { slug: RESTAURANT_QA_FIXTURE.organization.slug },
      create: {
        id: RESTAURANT_QA_FIXTURE.organization.id,
        isActive: true,
        name: "REZNO QA Restaurant Gate 2D",
        slug: RESTAURANT_QA_FIXTURE.organization.slug,
        status: "ACTIVE",
        vertical: "RESTAURANT",
      },
      update: {
        deletedAt: null,
        isActive: true,
        name: "REZNO QA Restaurant Gate 2D",
        status: "ACTIVE",
        vertical: "RESTAURANT",
      },
    });
    await transaction.organizationSettings.upsert({
      where: { organizationId: organization.id },
      create: { bookingEnabled: true, marketplaceVisible: true, organizationId: organization.id },
      update: { bookingEnabled: true, marketplaceVisible: true },
    });
    await transaction.businessProfile.upsert({
      where: { organizationId: organization.id },
      create: {
        businessCategory: "QA Restaurant",
        description: "Staging-only deterministic fixture for restaurant reservation QA.",
        organizationId: organization.id,
      },
      update: {
        businessCategory: "QA Restaurant",
        description: "Staging-only deterministic fixture for restaurant reservation QA.",
      },
    });
    const branch = await transaction.branch.upsert({
      where: { organizationId_slug: { organizationId: organization.id, slug: RESTAURANT_QA_FIXTURE.branch.slug } },
      create: {
        addressLine1: "Gate 2D QA Street",
        city: "Baghdad QA",
        id: RESTAURANT_QA_FIXTURE.branch.id,
        name: "Restaurant QA Main Branch",
        organizationId: organization.id,
        slug: RESTAURANT_QA_FIXTURE.branch.slug,
        status: "ACTIVE",
        timezone: "Asia/Baghdad",
      },
      update: {
        addressLine1: "Gate 2D QA Street",
        city: "Baghdad QA",
        deletedAt: null,
        name: "Restaurant QA Main Branch",
        status: "ACTIVE",
        timezone: "Asia/Baghdad",
      },
    });
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      await transaction.businessHour.upsert({
        where: { branchId_dayOfWeek: { branchId: branch.id, dayOfWeek } },
        create: { branchId: branch.id, closeTime: "22:00", dayOfWeek, isOpen: true, openTime: "09:00" },
        update: { closeTime: "22:00", isOpen: true, openTime: "09:00" },
      });
    }
    for (const [index, table] of RESTAURANT_QA_FIXTURE.tables.entries()) {
      await transaction.restaurantTable.upsert({
        where: { id: table.id },
        create: {
          ...table,
          branchId: branch.id,
          businessId: organization.id,
          code: `QA-${index + 1}`,
          isActive: true,
        },
        update: {
          area: table.area,
          branchId: branch.id,
          businessId: organization.id,
          capacity: table.capacity,
          code: `QA-${index + 1}`,
          isActive: true,
          name: table.name,
        },
      });
    }
    const category = await transaction.menuCategory.upsert({
      where: { id: RESTAURANT_QA_FIXTURE.menuCategory.id },
      create: {
        businessId: organization.id,
        id: RESTAURANT_QA_FIXTURE.menuCategory.id,
        isActive: true,
        name: "Gate 2D QA Menu",
        sortOrder: 1,
      },
      update: { businessId: organization.id, isActive: true, name: "Gate 2D QA Menu", sortOrder: 1 },
    });
    const items = [
      { ...RESTAURANT_QA_FIXTURE.menuItems.rice, name: "QA Iraqi Rice", price: "12000", isAvailable: true, sortOrder: 1 },
      { ...RESTAURANT_QA_FIXTURE.menuItems.tea, name: "QA Tea", price: "3000", isAvailable: true, sortOrder: 2 },
      { ...RESTAURANT_QA_FIXTURE.menuItems.unavailable, name: "QA Unavailable Dish", price: "9000", isAvailable: false, sortOrder: 3 },
    ];
    for (const item of items) {
      await transaction.menuItem.upsert({
        where: { id: item.id },
        create: {
          businessId: organization.id,
          currency: "IQD",
          id: item.id,
          isAvailable: item.isAvailable,
          menuCategoryId: category.id,
          name: item.name,
          price: item.price,
          sortOrder: item.sortOrder,
        },
        update: {
          businessId: organization.id,
          currency: "IQD",
          isAvailable: item.isAvailable,
          menuCategoryId: category.id,
          name: item.name,
          price: item.price,
          sortOrder: item.sortOrder,
        },
      });
    }
    const owner = await transaction.person.upsert({
      where: { authUserId: RESTAURANT_QA_FIXTURE.ownerPerson.authUserId },
      create: {
        authUserId: RESTAURANT_QA_FIXTURE.ownerPerson.authUserId,
        displayName: "Gate 2D QA Owner",
        firstName: "Gate 2D QA Owner",
        id: RESTAURANT_QA_FIXTURE.ownerPerson.id,
        isOnboarded: true,
        phone: "+9647500000081",
        status: "ACTIVE",
      },
      update: { deletedAt: null, displayName: "Gate 2D QA Owner", isOnboarded: true, phone: "+9647500000081", status: "ACTIVE" },
    });
    const ownerRole = await transaction.role.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: "QA Owner" } },
      create: {
        id: RESTAURANT_QA_FIXTURE.ownerRole.id,
        isSystem: true,
        name: "QA Owner",
        organizationId: organization.id,
        systemRole: "OWNER",
      },
      update: { isSystem: true, systemRole: "OWNER" },
    });
    const ownerMember = await transaction.organizationMember.upsert({
      where: { personId_organizationId: { personId: owner.id, organizationId: organization.id } },
      create: {
        id: RESTAURANT_QA_FIXTURE.ownerMember.id,
        organizationId: organization.id,
        personId: owner.id,
        roleId: ownerRole.id,
        status: "ACTIVE",
      },
      update: { deletedAt: null, roleId: ownerRole.id, status: "ACTIVE" },
    });
    await transaction.branchAssignment.upsert({
      where: { memberId_branchId: { memberId: ownerMember.id, branchId: branch.id } },
      create: { memberId: ownerMember.id, branchId: branch.id },
      update: {},
    });
    const customer = await transaction.person.upsert({
      where: { authUserId: RESTAURANT_QA_FIXTURE.customer.authUserId },
      create: {
        authUserId: RESTAURANT_QA_FIXTURE.customer.authUserId,
        displayName: "Gate 2D QA Customer",
        firstName: "Gate 2D QA Customer",
        id: RESTAURANT_QA_FIXTURE.customer.id,
        isOnboarded: true,
        phone: "+9647500000082",
        status: "ACTIVE",
      },
      update: { deletedAt: null, displayName: "Gate 2D QA Customer", isOnboarded: true, phone: "+9647500000082", status: "ACTIVE" },
    });
    const today = baghdadCalendarDate(new Date());
    const management = [
      {
        ...RESTAURANT_QA_FIXTURE.managementBookings.cancellable,
        guestCount: 2,
        startsAt: baghdadInstant(today, 21, 12),
        status: "CONFIRMED" as const,
        table: RESTAURANT_QA_FIXTURE.tables[0],
        items: [{ ...RESTAURANT_QA_FIXTURE.menuItems.tea, name: "QA Tea", price: "3000", quantity: 2 }],
      },
      {
        ...RESTAURANT_QA_FIXTURE.managementBookings.reschedulable,
        guestCount: 4,
        startsAt: baghdadInstant(today, 28, 13),
        status: "CONFIRMED" as const,
        table: RESTAURANT_QA_FIXTURE.tables[2],
        items: [
          { ...RESTAURANT_QA_FIXTURE.menuItems.rice, name: "QA Iraqi Rice", price: "12000", quantity: 2 },
          { ...RESTAURANT_QA_FIXTURE.menuItems.tea, name: "QA Tea", price: "3000", quantity: 4 },
        ],
      },
      {
        ...RESTAURANT_QA_FIXTURE.managementBookings.completed,
        guestCount: 2,
        startsAt: baghdadInstant(today, -7, 14),
        status: "COMPLETED" as const,
        table: RESTAURANT_QA_FIXTURE.tables[1],
        items: [{ ...RESTAURANT_QA_FIXTURE.menuItems.rice, name: "QA Iraqi Rice", price: "12000", quantity: 1 }],
      },
      {
        ...RESTAURANT_QA_FIXTURE.managementBookings.cancelled,
        guestCount: 6,
        startsAt: baghdadInstant(today, 35, 15),
        status: "CANCELLED" as const,
        table: RESTAURANT_QA_FIXTURE.tables[3],
        items: [],
      },
    ];
    for (const reservation of management) {
      await upsertManagementReservation(transaction, {
        ...reservation,
        branchId: branch.id,
        customerId: customer.id,
        organizationId: organization.id,
      });
    }
    return {
      branchId: branch.id,
      businessSlug: organization.slug,
      customerId: customer.id,
      managementBookingIds: management.map((reservation) => reservation.bookingId),
      ownerMemberId: ownerMember.id,
    };
  };
  return database.$transaction(operation, { maxWait: 10_000, timeout: 30_000 });
}

type ManagementReservationSeed = {
  bookingId: string;
  branchId: string;
  customerId: string;
  detailsId: string;
  guestCount: number;
  historyId: string;
  items: Array<{
    id: string;
    name: string;
    price: string;
    quantity: number;
  }>;
  organizationId: string;
  startsAt: Date;
  status: "CANCELLED" | "COMPLETED" | "CONFIRMED";
  table: { id: string; area: string; name: string };
};

async function upsertManagementReservation(
  transaction: Prisma.TransactionClient,
  input: ManagementReservationSeed,
) {
  const endsAt = new Date(input.startsAt.getTime() + 90 * 60_000);
  const preorderTotal = input.items.reduce(
    (total, item) => total + Number(item.price) * item.quantity,
    0,
  );
  const cancelledAt =
    input.status === "CANCELLED"
      ? new Date(input.startsAt.getTime() - 10 * 86_400_000)
      : null;
  await transaction.booking.upsert({
    where: { id: input.bookingId },
    create: {
      branchId: input.branchId,
      branchServiceId: null,
      cancelledAt,
      cancellationReason:
        input.status === "CANCELLED" ? "Deterministic QA cancellation" : null,
      customerId: input.customerId,
      customerNameSnapshot: "Gate 2D QA Customer",
      endsAt,
      id: input.bookingId,
      organizationId: input.organizationId,
      priceSnapshot: String(preorderTotal),
      serviceNameSnapshot: "Restaurant reservation",
      startsAt: input.startsAt,
      status: input.status,
    },
    update: {
      branchId: input.branchId,
      branchServiceId: null,
      cancelledAt,
      cancellationReason:
        input.status === "CANCELLED" ? "Deterministic QA cancellation" : null,
      customerId: input.customerId,
      customerNameSnapshot: "Gate 2D QA Customer",
      endsAt,
      organizationId: input.organizationId,
      priceSnapshot: String(preorderTotal),
      serviceNameSnapshot: "Restaurant reservation",
      startsAt: input.startsAt,
      status: input.status,
    },
  });
  await transaction.bookingStatusHistory.upsert({
    where: { id: input.historyId },
    create: {
      bookingId: input.bookingId,
      changedByPersonId: input.customerId,
      id: input.historyId,
      note: "Deterministic Restaurant management QA state.",
      toStatus: input.status,
    },
    update: {
      bookingId: input.bookingId,
      changedByPersonId: input.customerId,
      note: "Deterministic Restaurant management QA state.",
      toStatus: input.status,
    },
  });
  const details = await transaction.restaurantReservationDetails.upsert({
    where: { bookingId: input.bookingId },
    create: {
      bookingId: input.bookingId,
      branchId: input.branchId,
      businessId: input.organizationId,
      durationMinutes: 90,
      guestCount: input.guestCount,
      id: input.detailsId,
      reservationDateTime: input.startsAt,
      seatingArea: input.table.area,
      tableId: input.table.id,
    },
    update: {
      branchId: input.branchId,
      businessId: input.organizationId,
      durationMinutes: 90,
      guestCount: input.guestCount,
      reservationDateTime: input.startsAt,
      seatingArea: input.table.area,
      tableId: input.table.id,
    },
  });
  await transaction.restaurantReservationItem.deleteMany({
    where: {
      restaurantReservationDetailsId: details.id,
      menuItemId: { notIn: input.items.map((item) => item.id) },
    },
  });
  for (const item of input.items) {
    await transaction.restaurantReservationItem.upsert({
      where: {
        restaurantReservationDetailsId_menuItemId: {
          menuItemId: item.id,
          restaurantReservationDetailsId: details.id,
        },
      },
      create: {
        currencySnapshot: "IQD",
        itemNameSnapshot: item.name,
        menuItemId: item.id,
        quantity: item.quantity,
        restaurantReservationDetailsId: details.id,
        unitPrice: item.price,
      },
      update: {
        currencySnapshot: "IQD",
        itemNameSnapshot: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
      },
    });
  }
}

function baghdadCalendarDate(now: Date) {
  const value = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = value.split("-").map(Number);
  return { day: day!, month: month! - 1, year: year! };
}

function baghdadInstant(
  date: { day: number; month: number; year: number },
  dayOffset: number,
  hour: number,
) {
  return new Date(
    new TZDate(
      date.year,
      date.month,
      date.day + dayOffset,
      hour,
      0,
      0,
      0,
      "Asia/Baghdad",
    ),
  );
}

async function assertFixtureIdentity(transaction: Prisma.TransactionClient) {
  const [organization, branch, owner, customer] = await Promise.all([
    transaction.organization.findUnique({ where: { slug: RESTAURANT_QA_FIXTURE.organization.slug }, select: { id: true } }),
    transaction.branch.findUnique({ where: { id: RESTAURANT_QA_FIXTURE.branch.id }, select: { organizationId: true } }),
    transaction.person.findUnique({ where: { authUserId: RESTAURANT_QA_FIXTURE.ownerPerson.authUserId }, select: { id: true } }),
    transaction.person.findUnique({ where: { authUserId: RESTAURANT_QA_FIXTURE.customer.authUserId }, select: { id: true } }),
  ]);
  if (organization && organization.id !== RESTAURANT_QA_FIXTURE.organization.id) {
    throw new RestaurantQaSeedInvariantError("The namespaced Restaurant QA organization slug is owned by another record.");
  }
  if (branch && branch.organizationId !== RESTAURANT_QA_FIXTURE.organization.id) {
    throw new RestaurantQaSeedInvariantError("The namespaced Restaurant QA branch is owned by another organization.");
  }
  if (owner && owner.id !== RESTAURANT_QA_FIXTURE.ownerPerson.id) {
    throw new RestaurantQaSeedInvariantError("The namespaced Restaurant QA owner identity is owned by another record.");
  }
  if (customer && customer.id !== RESTAURANT_QA_FIXTURE.customer.id) {
    throw new RestaurantQaSeedInvariantError("The namespaced Restaurant QA customer identity is owned by another record.");
  }
}
